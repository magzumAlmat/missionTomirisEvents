/**
 * Второй Telegram-бот: приём видео от капитанов команд.
 *
 * Как работает:
 *  1. Капитан пишет боту в личку /start.
 *  2. Бот спрашивает название команды и имя капитана (или подтягивает их
 *     автоматически, если капитан пришлёт свой номер — он ищется в
 *     participants.json среди зарегистрированных на сайте).
 *  3. Любое присланное видео (обычное, кружок или файл) бот пересылает в
 *     общую группу и подписывает: что за команда и как зовут капитана.
 *
 * Запуск: вместе с основным сервером (`npm run server`) или отдельно:
 *         node server/videoBot.js
 *
 * .env:
 *   TELEGRAM_VIDEO_BOT_TOKEN=...   — токен ЭТОГО бота (не основного!)
 *   TELEGRAM_VIDEO_CHAT_ID=...     — id группы, куда складывать видео
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// Команды и журнал материалов — общие с сайтом.
import { addSubmission, findTeamByNumber, standings } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SENDERS_FILE = path.join(__dirname, "videoSenders.json");
const PARTICIPANTS_FILE = path.join(__dirname, "participants.json");

/* ---------- хранилище капитанов (chatId → команда/имя) ---------- */

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    /* битый файл — начинаем с чистого листа */
  }
  return fallback;
}

function readSenders() {
  const data = readJson(SENDERS_FILE, {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function saveSenders(map) {
  try {
    fs.writeFileSync(SENDERS_FILE, JSON.stringify(map, null, 2), "utf8");
  } catch (e) {
    console.error("videoBot: не удалось сохранить videoSenders.json", e);
  }
}

/** Последние 10 цифр номера — так сравниваем +7XXX, 8XXX и т.п. */
function phoneKey(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.slice(-10);
}

/** Найти участника по номеру телефона среди зарегистрированных на сайте. */
function findParticipantByPhone(phone) {
  const key = phoneKey(phone);
  if (key.length < 10) return null;
  const list = readJson(PARTICIPANTS_FILE, []);
  if (!Array.isArray(list)) return null;
  return list.find((p) => phoneKey(p.phone) === key) || null;
}

/* ---------- Telegram API ---------- */

// Если группу превратили в супергруппу, её id меняется. Telegram сообщает
// новый id в ошибке — запоминаем его на время работы процесса.
let migratedChatId = null;

function getEnv() {
  return {
    TOKEN: process.env.TELEGRAM_VIDEO_BOT_TOKEN || "",
    CHAT_ID: migratedChatId || process.env.TELEGRAM_VIDEO_CHAT_ID || "",
  };
}

async function callTelegram(method, payload) {
  const { TOKEN } = getEnv();
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function tg(method, payload) {
  const data = await callTelegram(method, payload);
  const newId = data?.parameters?.migrate_to_chat_id;
  if (!data.ok && newId) {
    migratedChatId = String(newId);
    console.log(
      `videoBot: группа стала супергруппой, новый id ${migratedChatId}. ` +
        `Пропишите его в .env → TELEGRAM_VIDEO_CHAT_ID`
    );
    return callTelegram(method, { ...payload, chat_id: newId });
  }
  return data;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function send(chatId, text, extra = {}) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

/* ---------- тексты и клавиатуры ---------- */

const ASK_PHONE_KEYBOARD = {
  keyboard: [[{ text: "📱 Отправить мой номер", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

const HIDE_KEYBOARD = { remove_keyboard: true };

const HELP_TEXT =
  `🎬 <b>Бот для видео капитанов</b>\n\n` +
  `Пришлите сюда видео (или фото) с точки — я передам его организаторам и ` +
  `подпишу, от какой оно команды.\n\n` +
  `<b>Команды:</b>\n` +
  `• /start — начать / назвать номер команды\n` +
  `• /reset — изменить команду или имя\n` +
  `• /standings — таблица квеста\n` +
  `• /help — эта справка`;

/* ---------- шаги регистрации капитана ---------- */

function startRegistration(chatId, senders) {
  senders[chatId] = { step: "number" };
  saveSenders(senders);
  return send(
    chatId,
    `👋 <b>Здравствуйте!</b>\n\n` +
      `Чтобы организаторы понимали, чьё видео пришло, назовите ` +
      `<b>НОМЕР вашей команды</b> — его выдали при регистрации на сайте.\n\n` +
      `Не помните номер? Нажмите кнопку ниже — найду вас по телефону.`,
    { reply_markup: ASK_PHONE_KEYBOARD }
  );
}

/**
 * Капитан назвал номер команды — подставляем название и имя капитана из
 * общей базы команд. Так название команды больше нигде не набирается руками.
 */
function applyTeamNumber(chatId, senders, number) {
  const team = findTeamByNumber(number);
  if (!team) return null;
  senders[chatId] = {
    ...(senders[chatId] || {}),
    teamNumber: team.number,
    teamName: team.name,
    captainName: senders[chatId]?.captainName || team.captainName || "",
  };
  return team;
}

function askCaptainName(chatId, senders) {
  senders[chatId].step = "name";
  saveSenders(senders);
  return send(chatId, `👤 Теперь напишите <b>имя капитана</b> (ваше имя).`, {
    reply_markup: HIDE_KEYBOARD,
  });
}

function finishRegistration(chatId, senders) {
  const s = senders[chatId];
  s.step = "ready";
  saveSenders(senders);
  const num = s.teamNumber ? `№${s.teamNumber} ` : "";
  return send(
    chatId,
    `✅ Готово!\n\n` +
      `👥 <b>Команда:</b> ${num}${escapeHtml(s.teamName)}\n` +
      `👤 <b>Капитан:</b> ${escapeHtml(s.captainName)}\n\n` +
      `Теперь просто присылайте видео — я передам их организаторам.\n` +
      `Если что-то указано неверно — команда /reset.`,
    { reply_markup: HIDE_KEYBOARD }
  );
}

/* ---------- пересылка видео в группу ---------- */

/**
 * Что за медиа в сообщении: видео (обычное, кружок, гифка, файл-видео) или фото.
 * Возвращает null, если медиа нет.
 */
function mediaKind(msg) {
  if (msg.video || msg.video_note || msg.animation) return "video";
  if (msg.document && String(msg.document.mime_type || "").startsWith("video/")) return "video";
  if (msg.photo || (msg.document && String(msg.document.mime_type || "").startsWith("image/"))) {
    return "photo";
  }
  return null;
}

async function forwardVideo(msg, sender, kind) {
  const { CHAT_ID } = getEnv();
  const time = new Date().toLocaleString("ru-RU");
  const caption = msg.caption ? `\n💬 ${escapeHtml(msg.caption)}` : "";
  const title = kind === "photo" ? "📸 <b>ФОТО ОТ КОМАНДЫ</b>" : "🎬 <b>ВИДЕО ОТ КОМАНДЫ</b>";

  const num = sender.teamNumber ? `№${sender.teamNumber} ` : "";
  const header =
    `${title}\n\n` +
    `👥 <b>Команда:</b> ${num}${escapeHtml(sender.teamName)}\n` +
    `👤 <b>Капитан:</b> ${escapeHtml(sender.captainName)}\n` +
    (sender.phone ? `📞 <b>Телефон:</b> ${escapeHtml(sender.phone)}\n` : "") +
    `🕒 <b>Время:</b> ${time}` +
    caption;

  const head = await send(CHAT_ID, header);
  if (!head.ok) {
    return { ok: false, error: head.description || "не удалось отправить подпись" };
  }

  // copyMessage переносит видео без повторной загрузки и работает для всех типов.
  const copy = await tg("copyMessage", {
    chat_id: CHAT_ID,
    from_chat_id: msg.chat.id,
    message_id: msg.message_id,
  });
  if (!copy.ok) {
    return { ok: false, error: copy.description || "не удалось переслать видео" };
  }

  // Записываем в журнал: по нему судья видит, сколько материалов прислала
  // команда и когда (см. /standings).
  addSubmission({
    teamNumber: sender.teamNumber,
    teamName: sender.teamName,
    captainName: sender.captainName,
    kind,
  });
  return { ok: true };
}

/* ---------- обработка одного апдейта ---------- */

/** Таблица квеста текстом — для судьи прямо в группе с материалами. */
function standingsText() {
  const rows = standings();
  if (!rows.length) return "🏁 <b>Таблица пуста.</b> Ни одна команда не зарегистрирована.";

  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString("ru-RU") : "—");
  let msg = "🏁 <b>ТАБЛИЦА КВЕСТА</b>\n\n";
  rows.forEach((r, i) => {
    const place = r.finishedAt ? `🏆 ${i + 1}.` : `${i + 1}.`;
    msg += `${place} <b>№${r.teamNumber || "—"} ${escapeHtml(r.teamName || "без названия")}</b>\n`;
    msg += `   🧩 Точек: <b>${r.solved}</b>`;
    msg += r.finishedAt ? ` · 🏁 финиш в ${time(r.finishedAt)}\n` : `\n`;
    msg += `   📸 Материалов: ${r.media} · 🕒 последняя точка ${time(r.lastAt)}\n\n`;
  });
  return msg;
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text0 = (msg.text || "").trim().toLowerCase();

  // В группе бот отвечает только на запрос таблицы — остальное там не нужно.
  if (msg.chat.type !== "private") {
    if (text0.startsWith("/standings") || text0.startsWith("/таблица")) {
      return send(chatId, standingsText());
    }
    return;
  }

  const senders = readSenders();
  const sender = senders[chatId];
  const text = (msg.text || "").trim();

  // --- команды ---
  if (text.startsWith("/start")) return startRegistration(chatId, senders);
  if (text.startsWith("/help")) return send(chatId, HELP_TEXT);
  if (text.startsWith("/reset")) return startRegistration(chatId, senders);
  if (text.startsWith("/standings") || text.startsWith("/таблица")) {
    return send(chatId, standingsText());
  }

  // --- номер телефона через кнопку «Отправить мой номер» ---
  if (msg.contact && msg.contact.phone_number) {
    const phone = msg.contact.phone_number;
    const found = findParticipantByPhone(phone);
    senders[chatId] = {
      ...(sender || {}),
      phone,
      captainName: found?.name || sender?.captainName || msg.from?.first_name || "",
      teamName: found?.teamName || sender?.teamName || "",
      teamNumber: found?.teamNumber || sender?.teamNumber || null,
    };
    if (senders[chatId].teamNumber) applyTeamNumber(chatId, senders, senders[chatId].teamNumber);

    if (senders[chatId].teamName && senders[chatId].captainName) {
      return finishRegistration(chatId, senders);
    }
    if (!senders[chatId].teamName) {
      senders[chatId].step = "number";
      saveSenders(senders);
      return send(
        chatId,
        `Не нашёл вас в списке. Напишите <b>номер команды</b> цифрами ` +
          `(или её название, если номера пока нет).`,
        { reply_markup: HIDE_KEYBOARD }
      );
    }
    return askCaptainName(chatId, senders);
  }

  // --- видео или фото ---
  const kind = mediaKind(msg);
  if (kind) {
    const what = kind === "photo" ? "Фото" : "Видео";
    if (!sender || sender.step !== "ready") {
      await send(
        chatId,
        `⚠️ Сначала представьтесь, иначе организаторы не поймут, чей это материал.`
      );
      return startRegistration(chatId, senders);
    }
    const { CHAT_ID } = getEnv();
    if (!CHAT_ID) {
      return send(chatId, `⚠️ Не настроена группа для видео (TELEGRAM_VIDEO_CHAT_ID).`);
    }
    const result = await forwardVideo(msg, sender, kind);
    if (!result.ok) {
      console.error("videoBot: не удалось отправить материал в группу:", result.error);
      return send(chatId, `❌ Не получилось отправить организаторам: ${escapeHtml(result.error)}`);
    }
    return send(chatId, `✅ ${what} отправлено организаторам. Спасибо!`);
  }

  // --- шаги регистрации текстом ---
  if (
    !sender ||
    !sender.step ||
    sender.step === "number" ||
    sender.step === "phone" ||
    sender.step === "team"
  ) {
    if (!text) return;

    // Ввели цифры — считаем это номером команды и подтягиваем её название.
    if (/^\d+$/.test(text)) {
      const team = applyTeamNumber(chatId, senders, text);
      if (!team) {
        saveSenders(senders);
        return send(
          chatId,
          `❌ Команды с номером <b>${escapeHtml(text)}</b> нет в списке.\n` +
            `Проверьте номер из регистрации или напишите название команды словами.`
        );
      }
      if (senders[chatId].captainName) return finishRegistration(chatId, senders);
      return askCaptainName(chatId, senders);
    }

    // Иначе — название команды словами (запасной путь, если номера ещё нет).
    senders[chatId] = { ...(sender || {}), teamName: text };
    if (senders[chatId].captainName) return finishRegistration(chatId, senders);
    return askCaptainName(chatId, senders);
  }

  if (sender.step === "name") {
    if (!text) return;
    senders[chatId].captainName = text;
    return finishRegistration(chatId, senders);
  }

  // --- уже зарегистрирован, но прислал не видео ---
  return send(
    chatId,
    `📹 Пришлите, пожалуйста, <b>видео</b> (или фото).\n` +
      `Сейчас вы записаны как: 👥 ${escapeHtml(sender.teamName)} · 👤 ${escapeHtml(sender.captainName)}\n` +
      `Изменить — /reset`
  );
}

/* ---------- long polling ---------- */

let lastUpdateId = 0;

async function poll() {
  const { TOKEN } = getEnv();
  if (!TOKEN) {
    setTimeout(poll, 5000);
    return;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=25`
    );
    const data = await res.json();
    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        if (update.message) {
          try {
            await handleMessage(update.message);
          } catch (e) {
            console.error("videoBot: ошибка обработки сообщения", e);
          }
        }
      }
    }
  } catch (e) {
    /* сеть/таймаут — просто пробуем снова */
  }
  setTimeout(poll, 1000);
}

async function setupMenu() {
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Начать / назвать номер команды" },
      { command: "reset", description: "Изменить команду или имя" },
      { command: "standings", description: "Таблица квеста" },
      { command: "help", description: "Справка" },
    ],
  }).catch(() => {});
}

export function startVideoBot() {
  const { TOKEN, CHAT_ID } = getEnv();
  if (!TOKEN) {
    console.log("🎬 Видео-бот: TELEGRAM_VIDEO_BOT_TOKEN не задан — бот не запущен.");
    return;
  }
  console.log(`🎬 Видео-бот запущен. Группа для видео: ${CHAT_ID || "НЕ задана ❌"}`);
  setupMenu();
  poll();
}

// Запуск напрямую: node server/videoBot.js
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) startVideoBot();
