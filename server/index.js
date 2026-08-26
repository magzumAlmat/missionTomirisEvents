/**
 * Небольшой бэкенд для Telegram-уведомлений квеста.
 *
 * Зачем нужен: токен бота НЕЛЬЗЯ держать во фронтенде (React) — иначе любой
 * посетитель сайта увидит его в коде страницы и получит контроль над ботом.
 * Поэтому кнопка «Я прибыл» на сайте шлёт запрос сюда, а уже сервер (где токен
 * лежит в .env и никому не виден) отправляет сообщение в Telegram.
 *
 * Запуск:  npm run server
 * Нужен файл .env рядом с package.json (см. .env.example).
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { startVideoBot } from "./videoBot.js";
import { ALL_DONE, TOTAL_STATIONS, findStation } from "./questSecret.js";
import {
  findOrCreateTeam,
  findTeamByNumber,
  getProgress,
  hasArrived,
  markArrival,
  markFinished,
  participantsByTeam,
  progressKey,
  resetAll,
  solveStation,
  standings,
} from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, "participants.json");

function readParticipants() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    }
  } catch (e) {}
  return [];
}

function saveParticipants(list) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {}
}

const app = express();
app.use(express.json());

// CORS: разрешаем запросы с адреса сайта (или отовсюду, если не задан).
const ALLOWED = process.env.ALLOWED_ORIGIN || "*";
app.use(cors({ origin: ALLOWED }));

import dotenv from "dotenv";
dotenv.config();

function getEnv() {
  dotenv.config(); // Динамически перечитываем .env
  return {
    TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
    CHAT_ID: process.env.TELEGRAM_CHAT_ID || "",
    PORT: process.env.PORT || 3001,
  };
}

const API = (method) => {
  const { TOKEN } = getEnv();
  return `https://api.telegram.org/bot${TOKEN}/${method}`;
};

function requireToken(res) {
  const { TOKEN } = getEnv();
  if (!TOKEN) {
    res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN не задан в .env" });
    return false;
  }
  return true;
}

// Проверка живости.
app.get("/health", (_req, res) => res.json({ ok: true }));

// Тексты для разных событий.
function buildMessage(event, stationId, stationName, team, phone) {
  // Кто: телефон (если есть) + имя/команда (если есть).
  const parts = [];
  if (phone) parts.push(`📞 <b>${escapeHtml(phone)}</b>`);
  if (team) parts.push(`👥 ${escapeHtml(team)}`);
  const who = parts.length ? parts.join(" · ") : "👤 Участник";

  const point = stationName
    ? `точку ${escapeHtml(String(stationId))} · ${escapeHtml(stationName)}`
    : `точку ${escapeHtml(String(stationId))}`;
  const time = new Date().toLocaleString("ru-RU");

  const head = event === "solved" ? "✅ <b>Загадка отгадана</b>" : "📍 <b>Прибытие на точку</b>";
  const verb = event === "solved" ? "отгадал(а)" : "прибыл(а) на";
  return `${head}\n${who}\n${verb} ${point}\n🕒 ${time}`;
}

/**
 * Уведомление о событии на точке.
 * body: { event: "arrived" | "solved", stationId, stationName, team? }
 */
async function handleNotify(req, res, forcedEvent) {
  if (!requireToken(res)) return;
  const { CHAT_ID } = getEnv();
  if (!CHAT_ID) {
    return res.status(500).json({ ok: false, error: "TELEGRAM_CHAT_ID не задан в .env" });
  }

  const { stationId, stationName, team, phone, teamNumber } = req.body || {};
  const event = forcedEvent || (req.body && req.body.event) || "arrived";
  const text = buildMessage(event, stationId, stationName, team, phone);

  // Прибытие запоминаем на сервере: без него нельзя нажать «Я отгадал»
  // (порядок действий), а судья видит, сколько команда провозилась с загадкой.
  if (event === "arrived" && stationId) {
    const found = teamNumber ? findTeamByNumber(teamNumber) : null;
    const key = progressKey({ teamNumber: found ? found.number : null, phone });
    if (key) {
      markArrival({
        key,
        teamNumber: found ? found.number : null,
        teamName: found ? found.name : "",
        phone,
        stationId,
      });
    }
  }

  try {
    const r = await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
    const data = await r.json();
    if (!data.ok) {
      return res.status(502).json({ ok: false, error: data.description || "Telegram error" });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}

// Основной эндпоинт (тип события — в теле запроса).
app.post("/api/notify", (req, res) => handleNotify(req, res));
// Обратная совместимость: старый путь = событие «прибыл».
app.post("/api/arrived", (req, res) => handleNotify(req, res, "arrived"));

/** Текст «есть ли команда» для сообщений в Telegram. */
function teamText(p) {
  if (!p.hasTeam) return "Нет 🙋 (без команды)";
  const size = p.teamSize ? `, ${p.teamSize} чел.` : "";
  const num = p.teamNumber ? `№${p.teamNumber} ` : "";
  return `Да 👥 ${num}«${escapeHtml(p.teamName || "—")}»${size}`;
}

/**
 * Регистрация нового участника.
 * body: { name, phone, hasCar, hasTeam, teamName?, teamSize? }
 */
app.post("/api/register", async (req, res) => {
  if (!requireToken(res)) return;
  const { CHAT_ID } = getEnv();
  if (!CHAT_ID) {
    return res.status(500).json({ ok: false, error: "TELEGRAM_CHAT_ID не задан в .env" });
  }

  const { name, phone, hasCar, hasTeam, teamName, teamSize } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ ok: false, error: "Введите имя участника." });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ ok: false, error: "Введите номер телефона." });
  }

  // Если участник в команде — нужны её название и размер.
  const inTeam = !!hasTeam;
  const teamNameClean = inTeam ? String(teamName || "").trim() : "";
  const teamSizeNum = inTeam ? Number(teamSize) : 0;
  if (inTeam && !teamNameClean) {
    return res.status(400).json({ ok: false, error: "Введите название команды." });
  }
  if (inTeam && (!Number.isFinite(teamSizeNum) || teamSizeNum < 1)) {
    return res.status(400).json({ ok: false, error: "Укажите количество человек в команде (от 1)." });
  }

  const carText = hasCar ? "Да 🚗 (на своей машине)" : "Нет 🚶 (без машины)";
  const participants = readParticipants();

  // Команде выдаётся НОМЕР — он же ключ на точках и в боте для видео.
  // Одинаковое название = одна команда, повторная заявка номер не плодит.
  const team = inTeam
    ? findOrCreateTeam({
        name: teamNameClean,
        captainName: name.trim(),
        captainPhone: phone.trim(),
        size: teamSizeNum,
      })
    : null;

  const newEntry = {
    id: Date.now(),
    name: name.trim(),
    phone: phone.trim(),
    hasCar: !!hasCar,
    hasTeam: inTeam,
    teamName: teamNameClean,
    teamSize: inTeam ? teamSizeNum : 0,
    teamNumber: team ? team.number : null,
    createdAt: new Date().toISOString(),
  };

  participants.push(newEntry);
  saveParticipants(participants);

  const driversCount = participants.filter((p) => p.hasCar).length;
  const totalCount = participants.length;

  const text =
    `📝 <b>НОВАЯ РЕГИСТРАЦИЯ УЧАСТНИКА</b>\n\n` +
    `👤 <b>Имя:</b> ${escapeHtml(newEntry.name)}\n` +
    `📞 <b>Телефон:</b> ${escapeHtml(newEntry.phone)}\n` +
    `🚘 <b>За рулём на своей машине:</b> ${carText}\n` +
    `👥 <b>Команда:</b> ${teamText(newEntry)}\n` +
    `🕒 <b>Время:</b> ${new Date().toLocaleString("ru-RU")}\n\n` +
    `📊 <b>Всего зарегистрировано:</b> ${totalCount} чел. (на машине: ${driversCount})`;

  try {
    const reply_markup = {
      inline_keyboard: [
        [{ text: "📋 Показать полный список участников", callback_data: "list_participants" }],
      ],
    };
    const r = await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML", reply_markup }),
    });
    const data = await r.json();
    if (!data.ok) {
      return res.status(502).json({ ok: false, error: data.description || "Telegram error" });
    }
    res.json({
      ok: true,
      participant: newEntry,
      totalCount,
      teamNumber: team ? team.number : null,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* =====================================================================
   КВЕСТ: отметка взятой точки.
   Загадку команда разгадывает на месте — через форму на сайте ответ НЕ
   вводится. Нажатие «Я отгадал» приходит сюда: сервер записывает время
   взятия точки и отдаёт букву с подсказкой из server/questSecret.js
   (в бандле сайта их нет, поэтому маршрут заранее не подсмотреть).
   ===================================================================== */

/** Уведомить организаторов в Telegram (не роняем запрос, если не вышло). */
async function notifyOrganizers(text) {
  const { TOKEN, CHAT_ID } = getEnv();
  if (!TOKEN || !CHAT_ID) return;
  try {
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("Не удалось отправить уведомление организаторам:", e.message);
  }
}

/** Как подписать участника в уведомлении. */
function whoText({ teamNumber, teamName, phone }) {
  const parts = [];
  if (teamNumber) parts.push(`👥 <b>№${teamNumber}</b>`);
  if (teamName) parts.push(escapeHtml(teamName));
  if (phone) parts.push(`📞 ${escapeHtml(phone)}`);
  return parts.length ? parts.join(" · ") : "👤 Участник";
}

/**
 * Отметить точку взятой (нажата кнопка «Я отгадал»).
 * body: { stationCode, phone, teamNumber? }
 * ответ: { ok, letter, nextHint, solvedCount, allDone }
 */
app.post("/api/solve", async (req, res) => {
  const { stationCode, phone, teamNumber } = req.body || {};

  const station = findStation(stationCode);
  if (!station) {
    return res.status(404).json({ ok: false, error: "Точка не найдена. Проверьте QR-код." });
  }

  const team = teamNumber ? findTeamByNumber(teamNumber) : null;
  const key = progressKey({ teamNumber: team ? team.number : null, phone });
  if (!key) {
    return res.status(400).json({
      ok: false,
      error: "Укажите номер команды или телефон — иначе прогресс не сохранить.",
    });
  }

  // Точку засчитываем только после отметки «Я прибыл» на ней же.
  if (!hasArrived(key, station.id)) {
    return res.status(409).json({
      ok: false,
      error: 'Сначала нажмите «Я прибыл» на этой точке.',
    });
  }

  const entry = solveStation({
    key,
    teamNumber: team ? team.number : null,
    teamName: team ? team.name : "",
    phone,
    stationId: station.id,
    letter: station.letter,
  });
  const solvedCount = Object.keys(entry?.stations || {}).length;

  // Взяты все точки — это и есть финиш. Отдельного финального кода в квесте нет,
  // победителя определяет время последней точки.
  const allDone = solvedCount >= TOTAL_STATIONS;
  if (allDone) {
    markFinished({
      key,
      teamNumber: team ? team.number : null,
      teamName: team ? team.name : "",
      phone,
    });
  }

  const who = whoText({ teamNumber: team?.number, teamName: team?.name, phone });
  notifyOrganizers(
    allDone
      ? `🏆 <b>КОМАНДА ПРОШЛА ВСЕ ТОЧКИ</b>\n${who}\n` +
          `Взято точек: ${solvedCount} из ${TOTAL_STATIONS}\n` +
          `🕒 ${new Date().toLocaleString("ru-RU")}`
      : `🧩 <b>Точка взята</b>\n${who}\n` +
          `точка ${station.id} · ${escapeHtml(station.name || "")}\n` +
          `Взято точек: ${solvedCount} из ${TOTAL_STATIONS}\n` +
          `🕒 ${new Date().toLocaleString("ru-RU")}`
  );

  res.json({
    ok: true,
    letter: station.letter,
    nextHint: station.nextHint || "",
    solvedCount,
    total: TOTAL_STATIONS,
    allDone,
    finishMessage: allDone ? ALL_DONE : "",
  });
});

/**
 * Восстановление прогресса на новом устройстве.
 * query: ?teamNumber=7 или ?phone=+7700...
 */
app.get("/api/progress", (req, res) => {
  const { teamNumber, phone } = req.query || {};
  const team = teamNumber ? findTeamByNumber(teamNumber) : null;
  const key = progressKey({ teamNumber: team ? team.number : null, phone });
  if (!key) {
    return res.status(400).json({ ok: false, error: "Нужен номер команды или телефон." });
  }
  const entry = getProgress(key);
  res.json({
    ok: true,
    total: TOTAL_STATIONS,
    teamNumber: team ? team.number : null,
    teamName: team ? team.name : entry?.teamName || "",
    stations: entry?.stations || {},
    arrivals: entry?.arrivals || {},
    finishedAt: entry?.finishedAt || null,
  });
});

/** Судейская таблица (без телефонов — можно показывать участникам). */
app.get("/api/standings", (_req, res) => {
  res.json({ ok: true, total: TOTAL_STATIONS, rows: standings() });
});

/** Отправить список всех участников в Telegram-чат */
async function sendParticipantsListToChat(chatId) {
  const participants = readParticipants();

  const reply_markup = {
    inline_keyboard: [
      [{ text: "🔄 Обновить список", callback_data: "list_participants" }],
    ],
  };

  if (participants.length === 0) {
    const text = "📋 <b>Список участников пока пуст.</b>\nНикто ещё не зарегистрировался через форму.";
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup }),
    });
    return;
  }

  const withCar = participants.filter((p) => p.hasCar).length;
  const withoutCar = participants.filter((p) => !p.hasCar).length;

  // Список сгруппирован по командам (по алфавиту названий), в конце — те,
  // кто зарегистрировался без команды.
  const { groups, loners } = participantsByTeam(participants);

  /** Строки одного участника внутри карточки команды. */
  function memberLines(p, idx) {
    const carStr = p.hasCar ? "Да 🚗" : "Нет 🚶";
    const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleString("ru-RU") : "—";
    return (
      `   ${idx}. 👤 <b>${escapeHtml(p.name)}</b>\n` +
      `      📞 <code>${escapeHtml(p.phone)}</code>\n` +
      `      🚘 За рулём: ${carStr}\n` +
      `      📅 ${dateStr}\n`
    );
  }

  let msg = `📋 <b>СПИСОК ЗАРЕГИСТРИРОВАННЫХ</b> (всего: ${participants.length} чел.)\n\n`;

  for (const { team, members } of groups) {
    const declared = team.size ? `${members.length} из ${team.size}` : `${members.length}`;
    msg += `👥 <b>№${team.number} «${escapeHtml(team.name)}»</b> — зарегистрировано ${declared}\n`;
    msg += `   ⭐️ Капитан: <b>${escapeHtml(team.captainName || "—")}</b> · <code>${escapeHtml(
      team.captainPhone || "—"
    )}</code>\n`;
    if (members.length === 0) {
      msg += `   <i>Пока никто не зарегистрировался под этой командой.</i>\n`;
    } else {
      members.forEach((p, i) => {
        msg += memberLines(p, i + 1);
      });
    }
    msg += `\n`;
  }

  if (loners.length) {
    msg += `🙋 <b>БЕЗ КОМАНДЫ</b> — ${loners.length} чел.\n`;
    loners.forEach((p, i) => {
      msg += memberLines(p, i + 1);
    });
    msg += `\n`;
  }

  msg += `───────────────\n`;
  msg += `📊 <b>Итого:</b> ${participants.length} чел. (🚘 На машине: ${withCar} | 🚶 Без авто: ${withoutCar})\n`;
  msg += `👥 <b>Команд:</b> ${groups.length} | 🙋 Без команды: ${loners.length}`;

  await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML", reply_markup }),
  });
}

/** Судейская таблица в Telegram: кто сколько точек взял и когда финишировал. */
async function sendStandingsToChat(chatId) {
  const rows = standings();
  const reply_markup = {
    inline_keyboard: [[{ text: "🔄 Обновить таблицу", callback_data: "standings" }]],
  };

  if (rows.length === 0) {
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "🏁 <b>Таблица пуста.</b>\nНи одна команда ещё не зарегистрирована.",
        parse_mode: "HTML",
        reply_markup,
      }),
    });
    return;
  }

  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString("ru-RU") : "—");

  let msg = `🏁 <b>ТАБЛИЦА КВЕСТА</b> (точек всего: ${TOTAL_STATIONS})\n\n`;
  rows.forEach((r, i) => {
    const place = r.finishedAt ? `🏆 ${i + 1}.` : `${i + 1}.`;
    msg += `${place} <b>№${r.teamNumber || "—"} ${escapeHtml(r.teamName || "без названия")}</b>\n`;
    msg += `   🧩 Точек: <b>${r.solved}</b>/${TOTAL_STATIONS}`;
    msg += r.finishedAt ? ` · 🏁 финиш в ${time(r.finishedAt)}\n` : `\n`;
    msg += `   🕒 Последняя точка: ${time(r.lastAt)}\n`;
    msg += `   📸 Материалов от капитана: ${r.media}\n\n`;
  });
  msg += `───────────────\n`;
  msg += `Победитель — первый финишировавший. Приз выдаётся после проверки материалов от капитана.`;

  await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML", reply_markup }),
  });
}

/** Список всех участников для админов в JSON */
app.get("/api/participants", (_req, res) => {
  const participants = readParticipants();
  res.json({
    ok: true,
    total: participants.length,
    withCar: participants.filter((p) => p.hasCar).length,
    withoutCar: participants.filter((p) => !p.hasCar).length,
    withTeam: participants.filter((p) => p.hasTeam).length,
    participants,
  });
});

/** Отправить список участников в Telegram по HTTP запросу */
app.get("/api/send-participants-list", async (_req, res) => {
  if (!requireToken(res)) return;
  const { CHAT_ID } = getEnv();
  if (!CHAT_ID) return res.status(500).json({ ok: false, error: "CHAT_ID не задан" });
  try {
    await sendParticipantsListToChat(CHAT_ID);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * Помощник: узнать chat_id.
 */
app.get("/api/chat-id-helper", async (_req, res) => {
  if (!requireToken(res)) return;
  try {
    const r = await fetch(API("getUpdates"));
    const data = await r.json();
    const chats = [];
    for (const u of data.result || []) {
      const c = (u.message || u.channel_post || {}).chat;
      if (c && !chats.find((x) => x.id === c.id)) {
        chats.push({ id: c.id, type: c.type, title: c.title, username: c.username, name: c.first_name });
      }
    }
    res.json({
      ok: true,
      подсказка: "Скопируй нужный id в .env → TELEGRAM_CHAT_ID",
      chats,
      raw: data.result?.length ? undefined : "Пусто. Сначала напиши боту сообщение в Telegram, потом обнови страницу.",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function clearParticipants() {
  const current = readParticipants();
  const count = current.length;
  saveParticipants([]);
  return count;
}

/**
 * Спросить подтверждение перед очисткой. Сама очистка стирает всё
 * мероприятие целиком, поэтому одного случайного нажатия быть не должно.
 */
async function askFinishConfirmation(targetChatId) {
  const participants = readParticipants();
  const text =
    `⚠️ <b>ЗАВЕРШИТЬ КВЕСТ И СТЕРЕТЬ ДАННЫЕ?</b>\n\n` +
    `Будут удалены безвозвратно:\n` +
    `• участники — <b>${participants.length}</b>\n` +
    `• команды и их номера\n` +
    `• прогресс по точкам и время финиша\n` +
    `• журнал фото и видео от капитанов\n\n` +
    `Нумерация команд начнётся заново с №1.`;
  const reply_markup = {
    inline_keyboard: [
      [{ text: "🗑 Да, стереть всё", callback_data: "finish_quest_confirm" }],
      [{ text: "↩️ Отмена", callback_data: "finish_quest_cancel" }],
    ],
  };
  await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: targetChatId, text, parse_mode: "HTML", reply_markup }),
  });
}

/** Собственно очистка — вызывается только после подтверждения. */
async function handleFinishQuestCommand(targetChatId) {
  const clearedCount = clearParticipants();
  const counts = resetAll();
  const text =
    `🏁 <b>КВЕСТ ЗАВЕРШЁН</b>\n\n` +
    `🗑 Удалено:\n` +
    `• участников: <b>${clearedCount}</b>\n` +
    `• команд: <b>${counts.teams}</b>\n` +
    `• записей прогресса: <b>${counts.progress}</b>\n` +
    `• материалов от капитанов: <b>${counts.submissions}</b>\n\n` +
    `Система готова к новому квесту, нумерация команд — с №1.`;
  const reply_markup = {
    inline_keyboard: [
      [{ text: "📋 Список участников (0)", callback_data: "list_participants" }],
    ],
  };
  await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: targetChatId, text, parse_mode: "HTML", reply_markup }),
  });
}

// === Telegram Long Polling для обработки кнопок и команд (/list, /finish_quest, /participants, /список) ===
let lastUpdateId = 0;

async function pollTelegramUpdates() {
  const { TOKEN, CHAT_ID } = getEnv();
  if (!TOKEN) {
    setTimeout(pollTelegramUpdates, 5000);
    return;
  }

  try {
    const res = await fetch(API(`getUpdates?offset=${lastUpdateId + 1}&timeout=10`));
    const data = await res.json();

    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;

        // Обработка нажатий на инлайн-кнопки
        if (update.callback_query) {
          const cb = update.callback_query;
          const data = cb.data;
          const targetChatId = cb.message?.chat?.id || CHAT_ID;

          if (data === "list_participants") {
            try {
              await fetch(API("answerCallbackQuery"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callback_query_id: cb.id, text: "Загружаю список..." }),
              });
            } catch (e) {}
            await sendParticipantsListToChat(targetChatId);
          } else if (data === "standings") {
            try {
              await fetch(API("answerCallbackQuery"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callback_query_id: cb.id, text: "Считаю таблицу..." }),
              });
            } catch (e) {}
            await sendStandingsToChat(targetChatId);
          } else if (data === "finish_quest") {
            try {
              await fetch(API("answerCallbackQuery"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callback_query_id: cb.id, text: "Нужно подтверждение" }),
              });
            } catch (e) {}
            await askFinishConfirmation(targetChatId);
          } else if (data === "finish_quest_confirm") {
            try {
              await fetch(API("answerCallbackQuery"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callback_query_id: cb.id, text: "Стираю данные..." }),
              });
            } catch (e) {}
            await handleFinishQuestCommand(targetChatId);
          } else if (data === "finish_quest_cancel") {
            try {
              await fetch(API("answerCallbackQuery"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callback_query_id: cb.id, text: "Отменено" }),
              });
            } catch (e) {}
            await fetch(API("sendMessage"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: targetChatId,
                text: "↩️ Очистка отменена. Данные на месте.",
              }),
            });
          }
        }

        // Обработка команд (/list, /finish_quest, /participants, /список, /start)
        const msg = update.message || update.channel_post;
        if (msg && msg.text) {
          const text = msg.text.trim().toLowerCase();
          const targetChatId = msg.chat.id;

          if (
            text.startsWith("/finish_quest") ||
            text.startsWith("/finishquest") ||
            text.startsWith("/finish quest") ||
            text.startsWith("/finish") ||
            text.startsWith("/очистить")
          ) {
            await askFinishConfirmation(targetChatId);
          } else if (
            text.startsWith("/list") ||
            text.startsWith("/participants") ||
            text.startsWith("/список")
          ) {
            await sendParticipantsListToChat(targetChatId);
          } else if (
            text.startsWith("/standings") ||
            text.startsWith("/table") ||
            text.startsWith("/таблица")
          ) {
            await sendStandingsToChat(targetChatId);
          } else if (text.startsWith("/start") || text.startsWith("/help")) {
            const welcomeText =
              `👋 <b>Бот EventTomiris готов к работе!</b>\n\n` +
              `📌 <b>Доступные команды:</b>\n` +
              `• /list или /список — Показать список зарегистрированных участников со всеми данными.\n` +
              `• /standings или /таблица — Таблица квеста: кто сколько точек взял и кто финишировал.\n` +
              `• /finish_quest или /finish — Завершить квест и очистить список участников.`;
            const reply_markup = {
              inline_keyboard: [
                [{ text: "📋 Показать список участников", callback_data: "list_participants" }],
                [{ text: "🏁 Таблица квеста", callback_data: "standings" }],
                [{ text: "🧹 Завершить квест (/finish_quest)", callback_data: "finish_quest" }],
              ],
            };
            await fetch(API("sendMessage"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: targetChatId, text: welcomeText, parse_mode: "HTML", reply_markup }),
            });
          }
        }
      }
    }
  } catch (e) {
    // Ошибки сети или таймаута при polling не ломают сервер
  }

  setTimeout(pollTelegramUpdates, 2000);
}

// Настройка меню команд бота в Telegram
async function setupBotMenu() {
  try {
    await fetch(API("setMyCommands"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "list", description: "Показать список участников" },
          { command: "standings", description: "Таблица квеста: точки, финиш, материалы" },
          { command: "finish_quest", description: "Завершить квест и очистить участников" },
          { command: "help", description: "Справка по боту" },
        ],
      }),
    });
  } catch (e) {}
}

app.listen(process.env.PORT || 3001, () => {
  const { TOKEN, CHAT_ID, PORT } = getEnv();
  console.log(`\n🤖 Telegram-бэкенд запущен: http://localhost:${PORT}`);
  console.log(`   Токен: ${TOKEN ? "задан ✅" : "НЕ задан ❌ (заполни .env)"}`);
  console.log(`   Chat ID: ${CHAT_ID ? CHAT_ID : "НЕ задан ❌ — открой /api/chat-id-helper"}`);
  console.log(`   Проверка: http://localhost:${PORT}/health\n`);

  setupBotMenu();
  pollTelegramUpdates();
  startVideoBot();
});
