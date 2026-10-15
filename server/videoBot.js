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
import { addSubmission, findTeamByNumber, findTeamByName, listSubmissions, listTeams, getProgress, progressKey } from "./store.js";
import { listCaptains, findCaptainById } from "./captains.js";
import { STATION_SECRETS, findStation } from "./questSecret.js";
import { escapeHtml } from "./messages.js";

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
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return data;
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

/**
 * Найти команду капитана по его телефону (captainPhone в teams.json).
 */
function findTeamByCaptainPhone(phone) {
  const key = phoneKey(phone);
  if (!key) return null;
  const teams = listTeams();
  return teams.find((t) => phoneKey(t.captainPhone) === key) || null;
}

/**
 * Получить текущую точку команды из progress.json (по последней отметке прибытия).
 */
function getTeamCurrentStation(teamNumber) {
  if (!teamNumber) return null;
  try {
    const key = progressKey({ teamNumber });
    const prog = getProgress(key);
    if (!prog || !prog.arrivals) return null;
    let latestSid = null;
    let latestTime = 0;
    for (const [sid, arr] of Object.entries(prog.arrivals)) {
      if (arr && arr.at) {
        const t = new Date(arr.at).getTime();
        if (t > latestTime) {
          latestTime = t;
          latestSid = sid;
        }
      }
    }
    return latestSid;
  } catch (e) {
    return null;
  }
}

/**
 * Извлечь номер/название точки из любого текста (подписи к медиа или сообщения).
 */
function extractStation(text) {
  if (!text) return null;
  const str = String(text).trim();

  // 1. Одиночное число: "2", "#2", "0"
  const singleNum = str.match(/^#?\s*(\d+)\s*$/);
  if (singleNum) return singleNum[1];

  // 2. С ключевым словом: "точка 2", "станция 2", "№ 2", "point 2"
  const keywordMatch = str.match(/(?:точка|станция|station|point|локация|№|#)\s*[:#-]?\s*(\d+)/i);
  if (keywordMatch) return keywordMatch[1];

  // 3. Число перед словом: "2 точка", "2 станция", "2-я локация"
  const revMatch = str.match(/(\d+)\s*(?:-?я|-ая|-ой)?\s*(?:точка|станция|локация|station)/i);
  if (revMatch) return revMatch[1];

  // 4. Поиск по названию локации (например, «неделька», «абай», «цой»)
  const lower = str.toLowerCase();
  for (const [, s] of Object.entries(STATION_SECRETS)) {
    if (s.name && lower.includes(s.name.toLowerCase())) {
      return String(s.id);
    }
  }

  return null;
}

/**
 * Красивое отображение точки (с названием и пометкой, если определено по игре).
 */
function formatStationLabel(stationNumOrId, teamNumber = null) {
  let sid = stationNumOrId;
  let fromProgress = false;
  if ((sid == null || sid === "") && teamNumber) {
    sid = getTeamCurrentStation(teamNumber);
    if (sid != null) fromProgress = true;
  }
  if (sid == null || sid === "") {
    return "не указана";
  }
  const st = findStation(sid);
  if (st && st.name) {
    return `${st.id} (${st.name})${fromProgress ? " [по игре]" : ""}`;
  }
  return `${sid}${fromProgress ? " [по игре]" : ""}`;
}

/**
 * Строит inline-клавиатуру со списком зарегистрированных капитанов.
 * Используется, когда бот не нашёл пользователя по номеру телефона.
 */
function buildCaptainKeyboard() {
  const captains = listCaptains();
  if (!captains.length) return null;
  const buttons = captains.map((c) => {
    const team = findTeamByCaptainPhone(c.phone);
    const teamLabel = team ? ` (№${team.number} «${team.name}»)` : "";
    return {
      text: `👤 ${c.name}${teamLabel}`,
      callback_data: `captain:${c.id}`,
    };
  });
  return { inline_keyboard: [buttons] };
}

const HELP_TEXT =
  `🎬 <b>Бот для видео капитанов</b>\n\n` +
  `Пришлите сюда видео (или фото) с точки — я передам его организаторам и ` +
  `подпишу, от какой оно команды.\n\n` +
  `💡 <b>Совет:</b> напишите в подписи к видео номер точки ` +
  `(например, «точка 3») — организаторам будет проще проверить материалы.\n` +
  `Если в подписи нет номера, я спрошу его отдельно — можно пропустить.\n\n` +
  `<b>Команды:</b>\n` +
  `• /start — начать / назвать номер команды\n` +
  `• /reset — изменить команду или имя\n` +
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
    teamSize: team.size || 0,
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
  const phoneLine = s.phone ? `\n📞 <b>Телефон:</b> ${escapeHtml(s.phone)}` : "";
  const teamSize = s.teamSize ? ` (${s.teamSize} чел.)` : "";
  // Сколько материалов уже прислала эта команда — видно, не первый ли это.
  const prevCount = listSubmissions().filter(
    (sub) => Number(sub.teamNumber) === Number(s.teamNumber || 0)
  ).length;
  const countLine = prevCount > 0 ? `\n📸 <b>Уже прислано:</b> ${prevCount} материал(ов)` : "";
  return send(
    chatId,
    `✅ Готово!\n\n` +
      `👥 <b>Команда:</b> ${num}${escapeHtml(s.teamName)}${teamSize}\n` +
      `👤 <b>Капитан:</b> ${escapeHtml(s.captainName)}${phoneLine}${countLine}\n\n` +
      `Теперь просто присылайте видео — я передам их организаторам.\n` +
      `💡 Напишите в подписи к видео номер точки (например, «точка 3»).\n` +
      `Если в подписи нет номера — я спрошу отдельно, можно пропустить.\n` +
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

async function forwardVideo(msg, sender, kind, stationNumOverride = null) {
  const { CHAT_ID } = getEnv();
  const time = new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" });
  const caption = msg.caption ? `\n💬 <b>Подпись:</b> ${escapeHtml(msg.caption)}` : "";
  const title = kind === "photo" ? "📸 <b>ФОТО ОТ КОМАНДЫ</b>" : "🎬 <b>ВИДЕО ОТ КОМАНДЫ</b>";

  // Определяем номер точки: переданный явно, либо из подписи, либо из прогресса команды на сайте
  const st = stationNumOverride || extractStation(msg.caption);
  const stationLabel = formatStationLabel(st, sender.teamNumber);

  // Сколько материалов уже прислала эта команда.
  const prevCount = listSubmissions().filter(
    (s) => Number(s.teamNumber) === Number(sender.teamNumber || 0)
  ).length;
  const submissionNum = prevCount + 1;

  const num = sender.teamNumber ? `№${sender.teamNumber} ` : "";
  const teamSize = sender.teamSize ? ` (${sender.teamSize} чел.)` : "";
  const header =
    `${title}\n\n` +
    `👥 <b>Команда:</b> ${num}${escapeHtml(sender.teamName)}${teamSize}\n` +
    `👤 <b>Капитан:</b> ${escapeHtml(sender.captainName)}\n` +
    (sender.phone ? `📞 <b>Телефон:</b> ${escapeHtml(sender.phone)}\n` : "") +
    `📍 <b>Точка:</b> ${stationLabel}\n` +
    `📎 <b>Материал №:</b> ${submissionNum} от этой команды\n` +
    `🕒 <b>Время:</b> ${time}` +
    caption;

  // Пытаемся скопировать с подписью напрямую (поддерживается Telegram для фото и видео)
  // Для video_note (кружочков) подпись не поддерживается Telegram API
  const isVideoNote = !!msg.video_note;
  if (!isVideoNote && header.length <= 1024) {
    const copyWithCaption = await tg("copyMessage", {
      chat_id: CHAT_ID,
      from_chat_id: msg.chat.id,
      message_id: msg.message_id,
      caption: header,
      parse_mode: "HTML",
    });
    if (copyWithCaption.ok) {
      addSubmission({
        teamNumber: sender.teamNumber,
        teamName: sender.teamName,
        captainName: sender.captainName,
        kind,
        station: st || getTeamCurrentStation(sender.teamNumber) || null,
      });
      return { ok: true };
    }
  }

  // Запасной вариант (или для кружочков): сначала текст, потом само медиа
  const head = await send(CHAT_ID, header);
  if (!head.ok) {
    return { ok: false, error: head.description || "не удалось отправить подпись" };
  }

  const copy = await tg("copyMessage", {
    chat_id: CHAT_ID,
    from_chat_id: msg.chat.id,
    message_id: msg.message_id,
  });
  if (!copy.ok) {
    return { ok: false, error: copy.description || "не удалось переслать видео" };
  }

  addSubmission({
    teamNumber: sender.teamNumber,
    teamName: sender.teamName,
    captainName: sender.captainName,
    kind,
    station: st || getTeamCurrentStation(sender.teamNumber) || null,
  });
  return { ok: true };
}

/* ---------- обработка callback query (inline-кнопки) ---------- */

async function handleCallbackQuery(cq) {
  const chatId = cq.message?.chat?.id;
  if (!chatId) return;
  const senders = readSenders();
  const sender = senders[chatId];
  const data = cq.data || "";
  if (data.startsWith("captain:")) {
    const captainId = data.slice(8);
    const captain = findCaptainById(captainId);
    if (!captain) {
      return tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Капитан не найден" });
    }
    // Ищем команду капитана по его телефону
    const team = findTeamByCaptainPhone(captain.phone);
    senders[chatId] = {
      ...(sender || {}),
      captainName: captain.name,
      teamName: team?.name || "",
      teamNumber: team?.number || null,
      teamSize: team?.size || captain.currentParticipants || 0,
      phone: captain.phone || sender?.phone || "",
    };
    if (senders[chatId].teamNumber) applyTeamNumber(chatId, senders, senders[chatId].teamNumber);
    saveSenders(senders);
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Выбрано!" });
    if (senders[chatId].teamName && senders[chatId].captainName) {
      return finishRegistration(chatId, senders);
    }
    return askCaptainName(chatId, senders);
  }
}

/* ---------- обработка одного апдейта ---------- */

async function handleMessage(msg) {
  const chatId = msg.chat.id;

  // В группе капитанов лежат ТОЛЬКО фото и видео — вся остальная информация
  // (регистрации, точки, таблица) идёт в чат организаторов через основного бота.
  // Поэтому на сообщения в самой группе этот бот не отвечает вообще.
  if (msg.chat.type !== "private") return;

  const senders = readSenders();
  const sender = senders[chatId];
  const text = (msg.text || "").trim();

  // --- команды ---
  if (text.startsWith("/start")) return startRegistration(chatId, senders);
  if (text.startsWith("/help")) return send(chatId, HELP_TEXT);
  if (text.startsWith("/reset")) return startRegistration(chatId, senders);

  // --- ответ на вопрос «с какой точки?» (после получения медиа) ---
  if (sender && sender.step === "ask_station" && sender.pendingMsg) {
    const pendingMsg = sender.pendingMsg;
    const pendingKind = sender.pendingKind || "video";
    const what = pendingKind === "photo" ? "Фото" : "Видео";
    const { CHAT_ID } = getEnv();

    // Пропуск — отправляем без явного номера (точка возьмётся из прогресса, если есть).
    if (text.toLowerCase() === "пропустить" || text.toLowerCase() === "skip") {
      senders[chatId] = { ...(sender || {}), step: "ready" };
      delete senders[chatId].pendingMsg;
      delete senders[chatId].pendingKind;
      saveSenders(senders);
      if (!CHAT_ID) return send(chatId, `⚠️ Не настроена группа для видео.`);
      const result = await forwardVideo(pendingMsg, sender, pendingKind, null);
      if (!result.ok) return send(chatId, `❌ Не получилось отправить: ${escapeHtml(result.error)}`);
      const stLabel = formatStationLabel(null, sender.teamNumber);
      return send(chatId, `✅ ${what} отправлено организаторам (Точка: ${stLabel}). Спасибо!`);
    }

    const foundStation = extractStation(text);
    const stationToUse = foundStation || text;

    senders[chatId] = { ...(sender || {}), step: "ready" };
    delete senders[chatId].pendingMsg;
    delete senders[chatId].pendingKind;
    saveSenders(senders);

    if (!CHAT_ID) return send(chatId, `⚠️ Не настроена группа для видео.`);
    const result = await forwardVideo(pendingMsg, sender, pendingKind, stationToUse);
    if (!result.ok) {
      return send(chatId, `❌ Не получилось отправить: ${escapeHtml(result.error)}`);
    }
    const stLabel = formatStationLabel(stationToUse, sender.teamNumber);
    return send(chatId, `✅ ${what} отправлено организаторам (Точка: ${stLabel}). Спасибо!`);
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
      teamSize: found?.teamSize || sender?.teamSize || 0,
    };
    if (senders[chatId].teamNumber) applyTeamNumber(chatId, senders, senders[chatId].teamNumber);

    if (senders[chatId].teamName && senders[chatId].captainName) {
      return finishRegistration(chatId, senders);
    }
    if (!senders[chatId].teamName) {
      senders[chatId].step = "number";
      saveSenders(senders);
      // Показываем список капитанов для выбора
      const captainKb = buildCaptainKeyboard();
      if (captainKb) {
        return send(
          chatId,
          `Не нашёл вас в списке. Выберите <b>себя</b> из списка капитанов ниже, ` +
            `или напишите <b>номер команды</b> цифрами.`,
          { reply_markup: captainKb }
        );
      }
      return send(
        chatId,
        `Не нашёл вас в списке. Напишите <b>номер команды</b> цифрами ` +
          `(или её название, если номера пока нет).`,
        { reply_markup: HIDE_KEYBOARD }
      );
    }
    return askCaptainName(chatId, senders);
  }

  // --- видео, фото или иное медиа ---
  const kind = mediaKind(msg);
  if (kind) {
    const what = kind === "photo" ? "Фото" : "Видео";
    if (!sender || sender.step !== "ready") {
      await send(
        chatId,
        `⚠️ Сначала представьтесь (назовите номер команды или телефон), чтобы организаторы знали, чьи материалы приходят.`
      );
      return startRegistration(chatId, senders);
    }
    const { CHAT_ID } = getEnv();
    if (!CHAT_ID) {
      return send(chatId, `⚠️ Не настроена группа для видео (TELEGRAM_VIDEO_CHAT_ID).`);
    }

    // Если в подписи к медиа уже есть номер точки — отправляем сразу!
    const captionStation = extractStation(msg.caption);
    if (captionStation) {
      const result = await forwardVideo(msg, sender, kind, captionStation);
      if (!result.ok) {
        console.error("videoBot: не удалось отправить материал в группу:", result.error);
        return send(chatId, `❌ Не получилось отправить организаторам: ${escapeHtml(result.error)}`);
      }
      const stLabel = formatStationLabel(captionStation, sender.teamNumber);
      return send(chatId, `✅ ${what} успешно отправлено организаторам (Точка: ${stLabel})! Спасибо!`);
    }

    // Если точки в подписи нет — сохраняем и спрашиваем у капитана
    senders[chatId] = { ...(sender || {}), step: "ask_station", pendingMsg: msg, pendingKind: kind };
    saveSenders(senders);

    const currentSid = getTeamCurrentStation(sender.teamNumber);
    const hintText = currentSid != null ? ` (по игре ваша команда на точке ${currentSid})` : "";
    return send(
      chatId,
      `📍 <b>С какой точки этот материал?</b>\n` +
        `Напишите номер точки (например, «2»)${hintText} или слово «пропустить».`,
      { reply_markup: HIDE_KEYBOARD }
    );
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

    // Если ввели "пропустить" на этапе номера — просим всё же ввести номер или нажать кнопку
    if (text.toLowerCase() === "пропустить" || text.toLowerCase() === "skip") {
      return send(
        chatId,
        `⚠️ Чтобы бот знал, чьи материалы приходят, укажите <b>номер команды</b> или нажмите «Отправить мой номер».`,
        { reply_markup: ASK_PHONE_KEYBOARD }
      );
    }

    // Поиск по названию среди существующих команд
    const foundByName = findTeamByName(text);
    if (foundByName) {
      applyTeamNumber(chatId, senders, foundByName.number);
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

  // --- уже зарегистрирован и прислал текстовое сообщение ---
  if (sender.step === "ready" && text) {
    const { CHAT_ID } = getEnv();
    if (CHAT_ID) {
      const time = new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" });
      const num = sender.teamNumber ? `№${sender.teamNumber} ` : "";

      // Номер точки из текста (если капитан указал), иначе из прогресса команды
      const extracted = extractStation(text);
      const stationText = formatStationLabel(extracted, sender.teamNumber);

      // Сколько материалов уже прислала эта команда (включая текстовые).
      const prevCount = listSubmissions().filter(
        (sub) => Number(sub.teamNumber) === Number(sender.teamNumber || 0)
      ).length;
      const submissionNum = prevCount + 1;

      const header =
        `💬 <b>СООБЩЕНИЕ ОТ КАПИТАНА</b>\n\n` +
        `👥 <b>Команда:</b> ${num}${escapeHtml(sender.teamName)}\n` +
        `👤 <b>Капитан:</b> ${escapeHtml(sender.captainName)}\n` +
        (sender.phone ? `📞 <b>Телефон:</b> ${escapeHtml(sender.phone)}\n` : "") +
        `📍 <b>Точка:</b> ${stationText}\n` +
        `📎 <b>Материал №:</b> ${submissionNum} от этой команды\n` +
        `🕒 <b>Время:</b> ${time}\n\n` +
        `📝 <b>Текст:</b>\n${escapeHtml(text)}`;

      await send(CHAT_ID, header);
      addSubmission({
        teamNumber: sender.teamNumber,
        teamName: sender.teamName,
        captainName: sender.captainName,
        kind: "text",
        text,
        station: extracted || getTeamCurrentStation(sender.teamNumber) || null,
      });
      return send(chatId, `✅ Текстовое сообщение отправлено организаторам! Спасибо!`);
    }
  }
}

/* ---------- long polling ---------- */

// lastUpdateId держим в файле: после рестарта процесса бот продолжит
// с того же места и не обработает старые команды повторно.
const OFFSET_FILE = path.join(__dirname, "videoBotOffset.json");

function readOffset() {
  try {
    const v = JSON.parse(fs.readFileSync(OFFSET_FILE, "utf8"));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch (e) {
    return 0;
  }
}

function saveOffset(id) {
  try {
    fs.writeFileSync(OFFSET_FILE, JSON.stringify(id), "utf8");
  } catch (e) {
    /* не критично */
  }
}

let lastUpdateId = readOffset();

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
        saveOffset(lastUpdateId);
        if (update.callback_query) {
          try {
            await handleCallbackQuery(update.callback_query);
          } catch (e) {
            console.error("videoBot: ошибка обработки callback_query", e);
          }
        } else if (update.message) {
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
