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
import { buildParticipantsListText, buildStandingsText, escapeHtml } from "./messages.js";
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
  listTeams,
} from "./store.js";
import {
  listCaptains,
  createCaptain,
  subscribeToCaptain,
  updateCaptainSlots,
  moveUserBetweenCaptains,
  unsubscribeFromCaptain,
  getCaptainsSummary,
  addSoloUser,
  listSoloUsers,
} from "./captains.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, "participants.json");
const DIST_DIR = path.resolve(__dirname, "../dist");

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

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

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

  let head, verb;
  switch (event) {
    case "solved":
      head = "✅ <b>Загадка отгадана</b>";
      verb = "отгадал(а)";
      break;
    case "hint_used":
      head = "💡 <b>ПОДСКАЗКА ИСПОЛЬЗОВАНА</b>";
      verb = "использовал(а) подсказку на";
      break;
    case "not_guessed":
      head = "❌ <b>НЕ ОТГАДАЛ</b>";
      verb = "не отгадал на";
      break;
    default:
      head = "📍 <b>Прибытие на точку</b>";
      verb = "прибыл(а) на";
  }
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
  if (event === "arrived" && stationId != null) {
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

/** Получить список всех команд (для выпадающего списка при регистрации) */
app.get("/api/teams", (_req, res) => {
  const teams = listTeams().map(t => ({ name: t.name, size: t.size }));
  res.json({ ok: true, teams });
});

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
   КАПИТАНЫ: система подписки на капитана со слотами.
   ===================================================================== */

/** Получить список всех капитанов с оставшимися слотами */
app.get("/api/captains", (_req, res) => {
  const captains = getCaptainsSummary();
  res.json({ ok: true, captains });
});

/** Алиас для сводки по капитанам (совместимость с фронтендом) */
app.get("/api/captains/summary", (_req, res) => {
  const captains = getCaptainsSummary();
  res.json({ ok: true, captains });
});

/** Создать нового капитана (для организаторов) */
app.post("/api/captains/create", async (req, res) => {
  if (!requireToken(res)) return;
  const { CHAT_ID } = getEnv();
  if (!CHAT_ID) {
    return res.status(500).json({ ok: false, error: "TELEGRAM_CHAT_ID не задан" });
  }
  const { name, phone, slots, hasCar } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ ok: false, error: "Нужны имя и телефон капитана" });
  }
  const result = createCaptain({ name, phone, slots, hasCar });
  if (result.error) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  // Уведомить админов
  try {
    const text = `👑 <b>НОВЫЙ КАПИТАН</b>\n\n` +
      `👤 <b>Имя:</b> ${escapeHtml(result.captain.name)}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(result.captain.phone)}\n` +
      `🚘 <b>Машина:</b> ${result.captain.hasCar ? "Да 🚗" : "Нет 🚶"}\n` +
      `👥 <b>Слотов:</b> ${result.captain.slots}\n` +
      `🕒 ${new Date().toLocaleString("ru-RU")}`;
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch (e) {}
  res.json({ ok: true, captain: result.captain });
});

/** Подписаться на капитана */
app.post("/api/subscribe-to-captain", async (req, res) => {
  if (!requireToken(res)) return;
  const { CHAT_ID } = getEnv();
  if (!CHAT_ID) {
    return res.status(500).json({ ok: false, error: "TELEGRAM_CHAT_ID не задан" });
  }
  const { captainId, name, phone, hasCar } = req.body || {};
  if (!captainId || !name || !phone) {
    return res.status(400).json({ ok: false, error: "Нужны captainId, имя и телефон" });
  }
  const result = subscribeToCaptain({ captainId, name, phone, hasCar });
  if (result.error) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  // Уведомить админов о подписке
  try {
    const text = `✅ <b>ПОДПИСКА НА КАПИТАНА</b>\n\n` +
      `👤 <b>Участник:</b> ${escapeHtml(name)}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(phone)}\n` +
      `👑 <b>Капитан:</b> ${escapeHtml(result.captain.name)} (№${result.captain.currentParticipants}/${result.captain.slots})\n` +
      `🚘 <b>Машина:</b> ${hasCar ? "Да 🚗" : "Нет 🚶"}\n` +
      `🕒 ${new Date().toLocaleString("ru-RU")}`;
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch (e) {}
  res.json({ ok: true, captain: result.captain });
});

/** Обновить количество слотов капитана (для админов) */
app.post("/api/admin/update-slots", async (req, res) => {
  if (!requireToken(res)) return;
  const { CHAT_ID } = getEnv();
  if (!CHAT_ID) {
    return res.status(500).json({ ok: false, error: "TELEGRAM_CHAT_ID не задан" });
  }
  const { captainId, slots } = req.body || {};
  if (!captainId || !slots) {
    return res.status(400).json({ ok: false, error: "Нужны captainId и slots" });
  }
  const result = updateCaptainSlots(captainId, slots);
  if (result.error) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  // Уведомить админов
  try {
    const text = `🔧 <b>ОБНОВЛЕНИЕ СЛОТОВ</b>\n\n` +
      `👑 <b>Капитан:</b> ${escapeHtml(result.captain.name)}\n` +
      `👥 <b>Слоты:</b> ${result.captain.slots} (текущих: ${result.captain.currentParticipants})\n` +
      `🕒 ${new Date().toLocaleString("ru-RU")}`;
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch (e) {}
  res.json({ ok: true, captain: result.captain });
});

/** Переместить пользователя между капитанами (для админов) */
app.post("/api/admin/move-user", async (req, res) => {
  if (!requireToken(res)) return;
  const { CHAT_ID } = getEnv();
  if (!CHAT_ID) {
    return res.status(500).json({ ok: false, error: "TELEGRAM_CHAT_ID не задан" });
  }
  const { fromCaptainId, toCaptainId, phone } = req.body || {};
  if (!fromCaptainId || !toCaptainId || !phone) {
    return res.status(400).json({ ok: false, error: "Нужны fromCaptainId, toCaptainId и phone" });
  }

  // Перемещение из «без капитана» (solo) в капитана
  if (fromCaptainId === "__solo__") {
    const phoneClean = String(phone).replace(/\D/g, "").slice(-10);
    // Найти пользователя среди solo
    const soloFile = path.join(__dirname, "solo_users.json");
    let soloUsers = [];
    try { soloUsers = JSON.parse(fs.readFileSync(soloFile, "utf8")); } catch {}
    const idx = soloUsers.findIndex(u => (u.phone || "").replace(/\D/g, "").slice(-10) === phoneClean);
    // Также проверим participants.json
    const partFile = path.join(__dirname, "participants.json");
    let participants = [];
    try { participants = JSON.parse(fs.readFileSync(partFile, "utf8")); } catch {}
    const pUser = participants.find(u => (u.phone || "").replace(/\D/g, "").slice(-10) === phoneClean);

    const userName = idx >= 0 ? soloUsers[idx].name : (pUser ? pUser.name : phone);
    const userHasCar = idx >= 0 ? soloUsers[idx].hasCar : (pUser ? pUser.hasCar : false);

    // Удалить из solo
    if (idx >= 0) {
      soloUsers.splice(idx, 1);
      fs.writeFileSync(soloFile, JSON.stringify(soloUsers, null, 2), "utf8");
    }

    // Подписать на капитана
    const subResult = subscribeToCaptain({ captainId: toCaptainId, name: userName, phone, hasCar: userHasCar });
    if (subResult.error) {
      return res.status(400).json({ ok: false, error: subResult.error });
    }

    try {
      const text = `🔄 <b>ПОДПИСКА НА КАПИТАНА</b>\n\n` +
        `👤 <b>Пользователь:</b> ${escapeHtml(userName)}\n` +
        `📞 <b>Телефон:</b> ${escapeHtml(phone)}\n` +
        `👑 В: ${escapeHtml(subResult.captain.name)}\n` +
        `🕒 ${new Date().toLocaleString("ru-RU")}`;
      await fetch(API("sendMessage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
      });
    } catch (e) {}
    return res.json({ ok: true, moved: { name: userName, phone }, toCaptain: subResult.captain });
  }

  const result = moveUserBetweenCaptains({ fromCaptainId, toCaptainId, phone });
  if (result.error) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  // Уведомить админов
  try {
    const text = `🔄 <b>ПЕРЕМЕЩЕНИЕ МЕЖДУ КАПИТАНАМИ</b>\n\n` +
      `👤 <b>Пользователь:</b> ${escapeHtml(result.moved.name)}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(result.moved.phone)}\n` +
      `👑 Из: ${escapeHtml(result.fromCaptain.name)}\n` +
      `👑 В: ${escapeHtml(result.toCaptain.name)}\n` +
      `🕒 ${new Date().toLocaleString("ru-RU")}`;
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch (e) {}
  res.json({ ok: true, fromCaptain: result.fromCaptain, toCaptain: result.toCaptain, moved: result.moved });
});

/** Отписать пользователя от капитана (для админов) */
app.post("/api/admin/unsubscribe", async (req, res) => {
  if (!requireToken(res)) return;
  const { CHAT_ID } = getEnv();
  if (!CHAT_ID) {
    return res.status(500).json({ ok: false, error: "TELEGRAM_CHAT_ID не задан" });
  }
  const { captainId, phone } = req.body || {};
  if (!captainId || !phone) {
    return res.status(400).json({ ok: false, error: "Нужны captainId и phone" });
  }
  const result = unsubscribeFromCaptain({ captainId, phone });
  if (result.error) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  // Уведомить админов
  try {
    const text = `❌ <b>ОТПИСКА ОТ КАПИТАНА</b>\n\n` +
      `👤 <b>Пользователь:</b> ${escapeHtml(result.removed.name)}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(result.removed.phone)}\n` +
      `👑 Капитан: ${escapeHtml(result.captain.name)}\n` +
      `🕒 ${new Date().toLocaleString("ru-RU")}`;
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch (e) {}
  res.json({ ok: true, captain: result.captain, removed: result.removed });
});

/** Добавить одиночного пользователя (для админов) */
app.post("/api/admin/add-solo", async (req, res) => {
  if (!requireToken(res)) return;
  const { CHAT_ID } = getEnv();
  if (!CHAT_ID) {
    return res.status(500).json({ ok: false, error: "TELEGRAM_CHAT_ID не задан" });
  }
  const { name, phone, hasCar } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ ok: false, error: "Нужны имя и телефон" });
  }
  const result = addSoloUser({ name, phone, hasCar });
  if (result.error) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  // Уведомить админов
  try {
    const text = `🙋 <b>ОДИНОЧНЫЙ УЧАСТНИК</b>\n\n` +
      `👤 <b>Имя:</b> ${escapeHtml(name)}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(phone)}\n` +
      `🚘 <b>Машина:</b> ${hasCar ? "Да 🚗" : "Нет 🚶"}\n` +
      `🕒 ${new Date().toLocaleString("ru-RU")}`;
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch (e) {}
  res.json({ ok: true });
});

/** Получить список всех участников (кроме капитанов) (для админов) */
app.get("/api/admin/solo-users", (_req, res) => {
  const participants = readParticipants();
  const captains = listCaptains();
  const captainPhones = new Set(captains.map(c => (c.phone || "").replace(/\D/g, "").slice(-10)));
  const subscribedPhones = new Set();
  captains.forEach(c => {
    (c.participants || []).forEach(p => {
      subscribedPhones.add((p.phone || "").replace(/\D/g, "").slice(-10));
    });
  });
  
  const soloUsersData = listSoloUsers(); // из solo_users.json
  
  // Объединяем и дедуплицируем по телефону
  const uniqueUsers = new Map();
  
  soloUsersData.forEach(u => {
    const phoneClean = (u.phone || "").replace(/\D/g, "").slice(-10);
    if (!captainPhones.has(phoneClean) && !subscribedPhones.has(phoneClean)) {
      uniqueUsers.set(phoneClean, u);
    }
  });

  participants.forEach(p => {
    const phoneClean = (p.phone || "").replace(/\D/g, "").slice(-10);
    if (!captainPhones.has(phoneClean) && !subscribedPhones.has(phoneClean)) {
      uniqueUsers.set(phoneClean, {
        name: p.name,
        phone: p.phone,
        hasCar: p.hasCar,
        hasTeam: p.hasTeam,
        teamName: p.teamName,
        registeredAt: p.createdAt || new Date().toISOString(),
      });
    }
  });

  const users = Array.from(uniqueUsers.values());
  res.json({ ok: true, users });
});

/* =====================================================================
   КВЕСТ: отметка взятой точки.
   Загадку команда разгадывает на месте — через форму на сайте ответ НЕ
   вводится. Нажатие «Я отгадал» приходит сюда: сервер записывает время
   взятия точки и отдаёт подсказку из server/questSecret.js
   (в бандле сайта их нет, поэтому маршрут заранее не подсмотреть).
   ===================================================================== */

/** Очередь сообщений для Telegram (обход лимита 1 msg/sec). */
let _tgQueue = Promise.resolve();

/**
 * Отправить одно сообщение в Telegram с ретраями при 429 Too Many Requests.
 * @param {string} text
 * @param {number} [attempt=0]
 */
async function _sendTgMessage(text, attempt = 0) {
  const { TOKEN, CHAT_ID } = getEnv();
  if (!TOKEN || !CHAT_ID) return;
  try {
    const res = await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (data.error_code === 429 && attempt < 5) {
        // Telegram сообщает retry_after в секундах
        const waitSec = (data.parameters && data.parameters.retry_after) || 5;
        console.warn(`[TG] 429 Too Many Requests — ждём ${waitSec}с (попытка ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        return _sendTgMessage(text, attempt + 1);
      }
      console.error("[TG] Ошибка sendMessage:", JSON.stringify(data));
    }
  } catch (e) {
    console.error("[TG] Не удалось отправить уведомление организаторам:", e.message);
  }
}

/**
 * Уведомить организаторов в Telegram.
 * Сообщения ставятся в очередь — они гарантированно будут доставлены
 * даже при быстром взятии нескольких точек подряд.
 */
function notifyOrganizers(text) {
  // Добавляем в очередь + минимальная пауза 1.1с между сообщениями
  _tgQueue = _tgQueue
    .then(() => _sendTgMessage(text))
    .then(() => new Promise((r) => setTimeout(r, 1100)))
    .catch((e) => console.error("[TG Queue] Необработанная ошибка:", e.message));
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
 * ответ: { ok, nextHint, solvedCount, allDone }
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
    if (station.id === 0) {
      markArrival({
        key,
        teamNumber: team ? team.number : null,
        teamName: team ? team.name : "",
        phone,
        stationId: station.id,
      });
    } else {
      return res.status(409).json({
        ok: false,
        error: 'Сначала нажмите «Я прибыл» на этой точке.',
      });
    }
  }

  const entry = solveStation({
    key,
    teamNumber: team ? team.number : null,
    teamName: team ? team.name : "",
    phone,
    stationId: station.id,
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

  const text = buildParticipantsListText(participants, participantsByTeam(participants));

  await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup }),
  });
}

/** Судейская таблица в Telegram: кто сколько точек взял и когда финишировал. */
async function sendStandingsToChat(chatId) {
  const text = buildStandingsText(standings(), TOTAL_STATIONS);
  const reply_markup = {
    inline_keyboard: [[{ text: "🔄 Обновить таблицу", callback_data: "standings" }]],
  };
  await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup }),
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

// В production backend также отдаёт собранный React frontend.
app.use(express.static(DIST_DIR));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(DIST_DIR, "index.html"), (error) => {
    if (error) next();
  });
});


/**
 * Спросить подтверждение перед очисткой. Сама очистка стирает всё
 * мероприятие целиком, поэтому одного случайного нажатия быть не должно.
 */
async function askFinishConfirmation(targetChatId) {
  const participants = readParticipants();
  const text =
    `⚠️ <b>ЗАВЕРШИТЬ КВЕСТ?</b>\n\n` +
    `Будут удалены безвозвратно:\n` +
    `• команды и их номера\n` +
    `• прогресс по точкам и время финиша\n` +
    `• журнал фото и видео от капитанов\n\n` +
    `📇 <b>База участников сохранится</b> — все <b>${participants.length}</b> ` +
    `записей останутся в /list как база клиентов.\n` +
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

/**
 * Собственно очистка — вызывается только после подтверждения.
 * Участников НЕ трогает: participants.json — накопительная база клиентов,
 * она живёт от мероприятия к мероприятию.
 */
async function handleFinishQuestCommand(targetChatId) {
  const counts = resetAll();
  const kept = readParticipants().length;
  const text =
    `🏁 <b>КВЕСТ ЗАВЕРШЁН</b>\n\n` +
    `🗑 Удалено:\n` +
    `• команд: <b>${counts.teams}</b>\n` +
    `• записей прогресса: <b>${counts.progress}</b>\n` +
    `• материалов от капитанов: <b>${counts.submissions}</b>\n\n` +
    `📇 <b>База участников сохранена:</b> ${kept} записей.\n` +
    `Система готова к новому квесту, нумерация команд — с №1.`;
  const reply_markup = {
    inline_keyboard: [
      [{ text: `📋 База участников (${kept})`, callback_data: "list_participants" }],
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

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  const indexPath = path.join(DIST_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

app.listen(process.env.PORT || 3001, '0.0.0.0', () => {
  const { TOKEN, CHAT_ID, PORT } = getEnv();
  console.log(`\n🤖 Telegram-бэкенд запущен: http://localhost:${PORT}`);
  console.log(`   Токен: ${TOKEN ? "задан ✅" : "НЕ задан ❌ (заполни .env)"}`);
  console.log(`   Chat ID: ${CHAT_ID ? CHAT_ID : "НЕ задан ❌ — открой /api/chat-id-helper"}`);
  console.log(`   Проверка: http://localhost:${PORT}/health\n`);

  setupBotMenu();
  pollTelegramUpdates();
  startVideoBot();
});
