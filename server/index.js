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
import { ALL_DONE, STATION_SECRETS, TOTAL_STATIONS, findStation } from "./questSecret.js";
import { buildParticipantsListText, buildStandingsText, durationText, escapeHtml } from "./messages.js";
import {
  findOrCreateTeam,
  findTeamByNumber,
  findTeamByName,
  findTeamByCaptainPhone,
  teamKey,
  getProgress,
  markArrival,
  markFinished,
  participantsByTeam,
  progressKey,
  resetAll,
  getQuestState,
  solveStation,
  standings,
  listTeams,
  deleteTeam,
  listSubmissions,
  markHint,
  markNotGuessed,
  markSolved,
} from "./store.js";
import {
  listCaptains,
  findCaptainByPhone,
  createCaptain,
  subscribeToCaptain,
  updateCaptainSlots,
  moveUserBetweenCaptains,
  unsubscribeFromCaptain,
  getCaptainsSummary,
  addSoloUser,
  listSoloUsers,
  deleteAllCaptains,
  deleteAllParticipants,
  deleteCaptain,
  deleteParticipant,
} from "./captains.js";
import { checkPhoneRegistration, normalizePhone } from "./phoneValidator.js";

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

/**
 * Действия на точках разрешены только капитану команды.
 * Соло-участники и старые команды без captainPhone не ограничиваются.
 */
function isTeamCaptain(team, phone) {
  if (!team || !team.captainPhone) return true;
  return normalizePhone(team.captainPhone) === normalizePhone(phone);
}

// Тексты для разных событий.
// progressEntry — запись из progress.json (arrivals/stations/finishedAt),
// если доступна: позволяет показать время на точке и текущий прогресс.
function buildMessage({ event, stationId, stationName, team, phone, teamNumber, progressEntry }) {
  // Ищем данные участника по телефону для показа имени, команды, капитана
  let userName = "";
  let userTeamName = "";
  let userCaptainName = "";
  if (phone) {
    const phoneClean = String(phone).replace(/\D/g, "").slice(-10);
    const participants = readParticipants();
    const participant = participants.find(p => (p.phone || "").replace(/\D/g, "").slice(-10) === phoneClean);
    if (participant) {
      userName = participant.name || "";
      userTeamName = participant.teamName || "";
    }
    // Ищем капитана этого участника
    const allCaptains = listCaptains();
    for (const cap of allCaptains) {
      const subs = (cap.participants || []);
      const found = subs.find(s => (s.phone || "").replace(/\D/g, "").slice(-10) === phoneClean);
      if (found) {
        userCaptainName = cap.name || "";
        break;
      }
    }
    // Может сам участник — капитан
    if (!userCaptainName) {
      const selfCap = allCaptains.find(c => (c.phone || "").replace(/\D/g, "").slice(-10) === phoneClean);
      if (selfCap) userCaptainName = selfCap.name + " (капитан)";
    }
  }

  // Кто: имя + № команды + телефон + название команды + капитан
  const parts = [];
  if (userName) parts.push(`👤 <b>${escapeHtml(userName)}</b>`);
  if (teamNumber) parts.push(`👥 <b>№${teamNumber}</b>`);
  if (userTeamName) parts.push(`🏷 «${escapeHtml(userTeamName)}»`);
  if (phone) parts.push(`📞 ${escapeHtml(phone)}`);
  if (userCaptainName) parts.push(`👑 Капитан: ${escapeHtml(userCaptainName)}`);
  if (team && !userTeamName) parts.push(`👥 ${escapeHtml(team)}`);
  const who = parts.length ? parts.join("\n") : "👤 Участник";

  const point = stationName
    ? `локацию ${escapeHtml(String(stationId))} · ${escapeHtml(stationName)}`
    : `локацию ${escapeHtml(String(stationId))}`;
  const time = new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" });

  let head, verb;
  switch (event) {
    case "solved":
      head = "✅ <b>ЗАДАНИЕ ЗАВЕРШЕНО</b>";
      verb = "завершил(а) задание на";
      break;
    case "hint_used":
      head = "💡 <b>ПОДСКАЗКА ИСПОЛЬЗОВАНА (−3 балла)</b>";
      verb = "использовал(а) подсказку на";
      break;
    case "not_guessed":
      head = "❌ <b>АДРЕС ОТКРЫТ</b>";
      verb = "открыл(а) адрес на";
      break;
    default:
      head = "📍 <b>ПОДТВЕРЖДЕНИЕ ПРИБЫТИЯ</b>";
      verb = "подтвердил(а) прибытие на";
      break;
  }

  let msg = `${head}\n${who}\n${verb} ${point}\n`;

  // Подсказки и предупреждения — только для обычных локаций (0 — стартовая).
  if (Number(stationId) !== 0) {
    if (event === "arrived") {
      msg += `📸 <b>Фото:</b> проверяется вручную\n`;
    } else if (event === "hint_used") {
      msg += `⚠️ За эту локацию будет вычтено 3 балла.\n`;
    } else if (event === "not_guessed") {
      msg += `⚠️ Баллы за самостоятельное разгадывание не начисляются.\n`;
    } else if (event === "solved") {
      msg += `📸 <b>Фото/видео:</b> проверяются вручную\n`;
    }
  }

  // Время на локации (прибытие → сейчас) — видно, сколько команда думала.
  if (progressEntry && event !== "arrived") {
    const sid = String(stationId);
    const arrivalAt = progressEntry.arrivals?.[sid]?.at || null;
    if (arrivalAt) {
      const elapsed = durationText(arrivalAt, new Date().toISOString());
      if (elapsed !== "—") msg += `⏱ <b>Время на локации:</b> ${elapsed}\n`;
    }
  }

  // Текущий прогресс: сколько локаций уже пройдено.
  if (progressEntry) {
    const solved = Object.keys(progressEntry.stations || {}).length;
    if (solved > 0) {
      msg += `🧩 <b>Пройдено локаций:</b> ${solved} из ${TOTAL_STATIONS}\n`;
    }
    // Следующая точка (если ещё не финиш).
    const nextId = Number(stationId) + 1;
    const nextStation = Object.values(STATION_SECRETS).find((s) => s.id === nextId);
    if (nextStation && solved < TOTAL_STATIONS) {
      msg += `➡️ <b>Следующая:</b> ${escapeHtml(nextStation.name)}\n`;
    }
    // Если команда уже финишировала — показываем общее время.
    if (progressEntry.finishedAt) {
      const firstArrival = Object.values(progressEntry.arrivals || {}).filter(Boolean).sort()[0];
      const totalTime = durationText(firstArrival, progressEntry.finishedAt);
      if (totalTime !== "—") {
        msg += `🏁 <b>Финиш:</b> ${totalTime}\n`;
      }
    }
  }

  msg += `🕒 ${time}`;
  return msg;
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

  // До начала игры точка 0 закрыта для участников
  if ((Number(stationId) === 0 || stationId === "start") && !isGameStarted()) {
    return res.status(403).json({
      ok: false,
      error: "Квест ещё не начался. Точка 0 заблокирована до времени старта.",
    });
  }

  // Прибытие запоминаем на сервере: без него нельзя нажать «Я отгадал»
  // (порядок действий), а судья видит, сколько команда провозилась с загадкой.
  let progressKeyVal = null;
  let progressEntry = null;
  if (stationId != null) {
    const found = teamNumber ? findTeamByNumber(teamNumber) : null;
    if (found && !isTeamCaptain(found, phone)) {
      return res.status(403).json({
        ok: false,
        error: "Действия на точке выполняет капитан команды.",
      });
    }
    progressKeyVal = progressKey({ teamNumber: found ? found.number : null, phone });
    if (progressKeyVal) {
      if (event === "arrived") {
        markArrival({
          key: progressKeyVal,
          teamNumber: found ? found.number : null,
          teamName: found ? found.name : "",
          phone,
          stationId,
        });
      } else if (event === "hint_used") {
        markHint({
          key: progressKeyVal,
          teamNumber: found ? found.number : null,
          teamName: found ? found.name : "",
          phone,
          stationId,
        });
      } else if (event === "not_guessed") {
        markNotGuessed({
          key: progressKeyVal,
          teamNumber: found ? found.number : null,
          teamName: found ? found.name : "",
          phone,
          stationId,
        });
      }
      progressEntry = getProgress(progressKeyVal);
    }
  }

  const text = buildMessage({
    event,
    stationId,
    stationName,
    team,
    phone,
    teamNumber,
    progressEntry,
  });

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

/**
 * «Я разгадал(а) локацию» — капитан отмечает разгадку ДО поездки.
 * Это промежуточный шаг: Telegram не уведомляем, баллы не начисляем.
 * body: { stationCode, phone, teamNumber? }
 */
app.post("/api/mark-solved", (req, res) => {
  const { stationCode, phone, teamNumber } = req.body || {};
  const station = findStation(stationCode);
  if (!station) {
    return res.status(404).json({ ok: false, error: "Точка не найдена. Проверьте QR-код." });
  }
  if (station.id === 0) {
    return res.status(400).json({
      ok: false,
      error: "Стартовая точка не требует разгадки — она открывается автоматически.",
    });
  }
  if (!isGameStarted()) {
    return res.status(403).json({
      ok: false,
      error: "Квест ещё не начался. Разгадку нельзя отметить до старта.",
    });
  }

  const team = teamNumber ? findTeamByNumber(teamNumber) : null;
  if (team && !isTeamCaptain(team, phone)) {
    return res.status(403).json({
      ok: false,
      error: "Действия на точке выполняет капитан команды.",
    });
  }
  const key = progressKey({ teamNumber: team ? team.number : null, phone });
  if (!key) {
    return res.status(400).json({
      ok: false,
      error: "Укажите номер команды или телефон — иначе прогресс не сохранить.",
    });
  }

  try {
    const entry = markSolved({
      key,
      teamNumber: team ? team.number : null,
      teamName: team ? team.name : "",
      phone,
      stationId: station.id,
    });
    res.json({
      ok: true,
      solvedAt: entry?.solved?.[String(station.id)]?.at || null,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* =====================================================================
   НАСТРОЙКИ КВЕСТА (обратный отсчёт / дата / место)
   ===================================================================== */
const SETTINGS_FILE = path.join(__dirname, "questSettings.json");

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      return {
        targetDate: data.targetDate || "2026-10-18T12:00:00",
        displayDate: data.displayDate || "18 октября 2026",
        displayTime: data.displayTime || "12:00",
        place: data.place || "Парковка у школы 216, Адрес: Курильская улица, 17 (https://go.2gis.com/jzNzu)",
        forceOpen: Boolean(data.forceOpen),
      };
    }
  } catch (e) {
    console.error("readSettings error:", e.message);
  }
  return {
    targetDate: "2026-10-18T12:00:00",
    displayDate: "18 октября 2026",
    displayTime: "12:00",
    place: "Парковка у школы 216, Адрес: Курильская улица, 17 (https://go.2gis.com/jzNzu)",
    forceOpen: false,
  };
}

/**
 * Дата старта в questSettings хранится без часового пояса
 * («2026-10-18T12:00:00»). Квест проходит в Алматы (UTC+5), поэтому
 * трактуем её как алматинскую, независимо от TZ сервера.
 */
function parseQuestDate(value) {
  if (!value) return null;
  let s = String(value).trim();
  const hasOffset = /[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasOffset) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00";
    s += "+05:00";
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Проверка: наступило ли время старта или включён принудительный доступ */
function isGameStarted() {
  const s = readSettings();
  if (s.forceOpen) return true;
  if (!s.targetDate) return true;
  const target = parseQuestDate(s.targetDate);
  if (!target) return true;
  return Date.now() >= target.getTime();
}

function writeSettings(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/** Публичный эндпоинт: Landing-страница и точки запрашивают дату обратного отсчёта и статус старта. */
app.get("/api/settings", (_req, res) => {
  try {
    const settings = readSettings();
    const questState = getQuestState();
    res.json({ ok: true, settings, isGameStarted: isGameStarted(), questId: questState.questId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/** Админский эндпоинт: сохранить настройки квеста (дата, время, место, forceOpen). */
app.post("/api/admin/settings", (req, res) => {
  try {
    const { targetDate, displayDate, displayTime, place, forceOpen } = req.body || {};
    const prev = readSettings();
    const settings = {
      targetDate: targetDate || prev.targetDate,
      displayDate: displayDate !== undefined ? displayDate : prev.displayDate,
      displayTime: displayTime !== undefined ? displayTime : prev.displayTime,
      place: place !== undefined ? place : prev.place,
      forceOpen: typeof forceOpen === "boolean" ? forceOpen : Boolean(prev.forceOpen),
    };
    writeSettings(settings);
    console.log(`[settings] Обновлены: ${settings.targetDate} (${settings.displayDate} ${settings.displayTime}), место: ${settings.place}, forceOpen: ${settings.forceOpen}`);
    res.json({ ok: true, settings, isGameStarted: isGameStarted() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * Админ: засчитать прибытие команды на локацию вручную.
 * Нужен, когда капитан нажал «Я разгадал(а)», но не подтвердил прибытие
 * (например, потерял связь или забыл нажать). Время фиксируется текущее.
 * body: { teamNumber, stationId }
 */
app.post("/api/admin/mark-arrival", (req, res) => {
  const { teamNumber, stationId } = req.body || {};
  const team = findTeamByNumber(teamNumber);
  if (!team) {
    return res.status(404).json({ ok: false, error: "Команда не найдена." });
  }
  const station = findStation(stationId);
  if (!station) {
    return res.status(404).json({ ok: false, error: "Точка не найдена." });
  }

  const key = progressKey({ teamNumber: team.number });
  const before = getProgress(key);
  const sid = String(station.id);
  const alreadyArrived = Boolean(before?.arrivals?.[sid]);
  const riddleSolved = Boolean(before?.solved?.[sid]);
  const addressOpened = Boolean(before?.notGuessed?.[sid]);

  if (station.id !== 1 && station.id !== 0 && !alreadyArrived && !riddleSolved && !addressOpened) {
    return res.status(409).json({
      ok: false,
      error: "Команда ещё не разгадала эту локацию и не открывала адрес.",
    });
  }

  const entry = markArrival({
    key,
    teamNumber: team.number,
    teamName: team.name,
    stationId: station.id,
  });
  res.json({
    ok: true,
    alreadyArrived,
    arrivalAt: entry?.arrivals?.[sid]?.at || null,
  });
});

/** Текст «есть ли команда» для сообщений в Telegram. */
function teamText(p) {
  if (!p.hasTeam) return "Нет 🙋 (без команды)";
  const size = p.teamSize ? `, ${p.teamSize} чел.` : "";
  const num = p.teamNumber ? `№${p.teamNumber} ` : "";
  return `Да 👥 ${num}«${escapeHtml(p.teamName || "—")}»${size}`;
}

/** Получить список всех команд (для выпадающего списка при регистрации и профиля). */
app.get("/api/teams", (_req, res) => {
  const participants = readParticipants();
  const teams = listTeams().map((t) => ({
    teamNumber: t.number,
    name: t.name,
    size: t.size,
    captainName: t.captainName,
    captainPhone: t.captainPhone,
    participants: participants
      .filter((p) =>
        p.teamName
          ? teamKey(p.teamName) === teamKey(t.name)
          : Number(p.teamNumber) === Number(t.number)
      )
      .map((p) => ({
        name: p.name,
        phone: p.phone,
        hasCar: !!p.hasCar,
      })),
  }));
  res.json({ ok: true, teams });
});

/** Удалить команду (админ): команда + её прогресс + материалы капитана. */
app.delete("/api/teams/:number", (req, res) => {
  const result = deleteTeam(req.params.number);
  if (!result.ok) {
    return res.status(404).json({ ok: false, error: result.error });
  }
  res.json({ ok: true, removed: result.removed });
});

/**
 * Удалить весь квест (админ): все команды + весь прогресс + все материалы.
 * База участников (participants.json) НЕ трогается — она накопительная.
 * То же самое делает команда /finish_quest в Telegram, но из админки.
 */
app.post("/api/admin/reset-quest", (req, res) => {
  if (!requireToken(res)) return;
  const counts = resetAll();
  try {
    deleteAllCaptains();
  } catch (e) {
    console.error("Error clearing captains on reset-quest:", e);
  }
  try {
    deleteAllParticipants();
  } catch (e) {
    console.error("Error clearing participants on reset-quest:", e);
  }
  saveParticipants([]);
  const questState = getQuestState();
  res.json({
    ok: true,
    removed: counts,
    keptParticipants: 0,
    questId: questState.questId,
  });
});

/** Проверить, зарегистрирован ли уже номер телефона в квесте */
app.get("/api/check-phone", (req, res) => {
  const phone = req.query.phone;
  if (!phone) {
    return res.json({ ok: true, registered: false });
  }
  const check = checkPhoneRegistration(phone);
  res.json({
    ok: true,
    registered: check.registered,
    details: check.details || null,
  });
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

  const { name, phone, hasCar, hasTeam, teamName, teamSize, isCaptain } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ ok: false, error: "Введите имя участника." });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ ok: false, error: "Введите номер телефона." });
  }

  // Валидация: проверка на повторную регистрацию того же номера телефона
  const regCheck = checkPhoneRegistration(phone, {
    ignoreRecentCaptainsMs: 60000,
    ignoreRecentSoloMs: 60000,
    ignoreRecentSubscribedMs: 60000,
  });
  if (regCheck.registered) {
    return res.status(400).json({
      ok: false,
      code: "PHONE_ALREADY_REGISTERED",
      error: `Номер телефона ${phone.trim()} уже зарегистрирован (${regCheck.details?.description || "в квесте"}). Повторная регистрация не требуется.`,
    });
  }

  // Если участник в команде — нужны её название.
  const inTeam = !!hasTeam;
  const teamNameClean = inTeam ? String(teamName || "").trim() : "";
  if (inTeam && !teamNameClean) {
    return res.status(400).json({ ok: false, error: "Введите название команды." });
  }
  const existingTeam = inTeam ? findTeamByName(teamNameClean) : null;

  // Если капитан создаёт команду с уже занятым другим капитаном названием:
  if (isCaptain && existingTeam && normalizePhone(existingTeam.captainPhone) !== normalizePhone(phone)) {
    return res.status(400).json({
      ok: false,
      error: `Команда с названием «${teamNameClean}» уже создана другим капитаном. Пожалуйста, укажите другое название команды или выберите «Присоединиться к команде».`,
    });
  }

  // Размер команды — свойство самой команды, а не отдельной заявки.
  // Капитан задаёт его при создании, участник не должен его уменьшать.
  let teamSizeNum = Number(teamSize);
  if (existingTeam) {
    teamSizeNum = Math.max(
      Number(existingTeam.size) || 0,
      Number.isFinite(teamSizeNum) ? teamSizeNum : 0,
      1
    );
  } else if (!Number.isFinite(teamSizeNum) || teamSizeNum < 1) {
    teamSizeNum = 1;
  }

  // Вступление в команду капитана: только для УЧАСТНИКОВ (не для создающего команду капитана)
  const existingCaptain =
    !isCaptain && existingTeam && existingTeam.captainPhone
      ? findCaptainByPhone(existingTeam.captainPhone)
      : null;
  if (existingCaptain) {
    const alreadySubscribed = (existingCaptain.participants || []).some(
      (p) => normalizePhone(p.phone) === normalizePhone(phone)
    );
    if (!alreadySubscribed) {
      const sub = subscribeToCaptain({
        captainId: existingCaptain.id,
        name: name.trim(),
        phone: phone.trim(),
        hasCar: !!hasCar,
      });
      if (sub.error) {
        return res.status(400).json({ ok: false, error: sub.error });
      }
    }
  }

  const carText = hasCar ? "Да 🚗 (на своей машине)" : "Нет 🚶 (без машины)";
  const participants = readParticipants();
  const registrationNumber = participants.length + 1; // N-я регистрация в текущем потоке

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
  const teamsCount = listTeams().length;

  // Сколько человек уже в этой команде (без текущего) — видно, не первый ли это.
  const teamMembersBefore = team
    ? participants.filter((p) => p.teamNumber === team.number).length
    : 0;
  const teamMembersAfter = teamMembersBefore + 1;

  const teamLine = team
    ? `👥 <b>Команда:</b> №${team.number} «${escapeHtml(team.name)}» (${newEntry.teamSize} чел.)\n`
    : `👥 <b>Команда:</b> Нет 🙋 (без команды)\n`;

  const text =
    `📝 <b>НОВАЯ РЕГИСТРАЦИЯ УЧАСТНИКА</b> (№${registrationNumber})\n\n` +
    `👤 <b>Имя:</b> ${escapeHtml(newEntry.name)}\n` +
    `📞 <b>Телефон:</b> ${escapeHtml(newEntry.phone)}\n` +
    `🚘 <b>За рулём на своей машине:</b> ${carText}\n` +
    teamLine +
    `🕒 <b>Время:</b> ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}\n\n` +
    `📊 <b>Всего зарегистрировано:</b> ${totalCount} чел. (на машине: ${driversCount})\n` +
    `👥 <b>Команд в квесте:</b> ${teamsCount}`;

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
    const questState = getQuestState();
    res.json({
      ok: true,
      participant: newEntry,
      totalCount,
      teamNumber: team ? team.number : null,
      questId: questState.questId,
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
  const participants = readParticipants();
  captains.forEach(c => {
    const p = participants.find(part => (part.phone||"").replace(/\D/g,"").slice(-10) === (c.phone||"").replace(/\D/g,"").slice(-10));
    if (p) {
      c.teamName = p.teamName;
      c.teamNumber = p.teamNumber;
    }
  });
  res.json({ ok: true, captains });
});

/** Алиас для сводки по капитанам (совместимость с фронтендом) */
app.get("/api/captains/summary", (_req, res) => {
  const captains = getCaptainsSummary();
  const participants = readParticipants();
  captains.forEach(c => {
    const p = participants.find(part => (part.phone||"").replace(/\D/g,"").slice(-10) === (c.phone||"").replace(/\D/g,"").slice(-10));
    if (p) {
      c.teamName = p.teamName;
      c.teamNumber = p.teamNumber;
    }
  });
  res.json({ ok: true, captains });
});

/** Создать нового капитана (для организаторов) */
app.post("/api/captains/create", async (req, res) => {
  if (!requireToken(res)) return;
  const { CHAT_ID } = getEnv();
  if (!CHAT_ID) {
    return res.status(500).json({ ok: false, error: "TELEGRAM_CHAT_ID не задан" });
  }
  const { name, phone, slots, hasCar, teamName } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ ok: false, error: "Нужны имя и телефон капитана" });
  }
  const result = createCaptain({ name, phone, slots, hasCar, teamName });
  if (result.error) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  // Уведомить админов
  try {
    const free = Math.max(0, result.captain.slots - 1 - result.captain.currentParticipants);
    const totalCaptains = listCaptains().length;
    const text = `👑 <b>НОВЫЙ КАПИТАН</b>\n\n` +
      `👤 <b>Имя:</b> ${escapeHtml(result.captain.name)}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(result.captain.phone)}\n` +
      `🚘 <b>Машина:</b> ${result.captain.hasCar ? "Да 🚗" : "Нет 🚶"}\n` +
      `👥 <b>Слотов:</b> ${result.captain.slots} (занято: ${result.captain.currentParticipants + 1}, свободно: ${free})\n` +
      `📊 <b>Всего капитанов:</b> ${totalCaptains}\n` +
      `🕒 ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`;
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch (e) {}
  const questState = getQuestState();
  res.json({ ok: true, captain: result.captain, questId: questState.questId });
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
    const free = Math.max(0, result.captain.slots - 1 - result.captain.currentParticipants);
    const text = `✅ <b>ПОДПИСКА НА КАПИТАНА</b>\n\n` +
      `👤 <b>Участник:</b> ${escapeHtml(name)}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(phone)}\n` +
      `👑 <b>Капитан:</b> ${escapeHtml(result.captain.name)}\n` +
      `👥 <b>Слоты:</b> ${result.captain.currentParticipants + 1}/${result.captain.slots} (свободно: ${free})\n` +
      `🚘 <b>Машина:</b> ${hasCar ? "Да 🚗" : "Нет 🚶"}\n` +
      `🕒 ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`;
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch (e) {}
  const questStateSub = getQuestState();
  res.json({ ok: true, captain: result.captain, questId: questStateSub.questId });
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
    const free = Math.max(0, result.captain.slots - 1 - result.captain.currentParticipants);
    const text = `🔧 <b>ОБНОВЛЕНИЕ СЛОТОВ</b>\n\n` +
      `👑 <b>Капитан:</b> ${escapeHtml(result.captain.name)}\n` +
      `👥 <b>Слоты:</b> ${result.captain.slots} (занято: ${result.captain.currentParticipants + 1}, свободно: ${free})\n` +
      `🕒 ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`;
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
      const free = Math.max(0, subResult.captain.slots - 1 - subResult.captain.currentParticipants);
      const text = `🔄 <b>ПОДПИСКА НА КАПИТАНА</b>\n\n` +
        `👤 <b>Пользователь:</b> ${escapeHtml(userName)}\n` +
        `📞 <b>Телефон:</b> ${escapeHtml(phone)}\n` +
        `👑 <b>В:</b> ${escapeHtml(subResult.captain.name)}\n` +
        `👥 <b>Слоты:</b> ${subResult.captain.currentParticipants + 1}/${subResult.captain.slots} (свободно: ${free})\n` +
        `🕒 ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`;
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
    const free = Math.max(0, result.toCaptain.slots - 1 - result.toCaptain.currentParticipants);
    const text = `🔄 <b>ПЕРЕМЕЩЕНИЕ МЕЖДУ КАПИТАНАМИ</b>\n\n` +
      `👤 <b>Пользователь:</b> ${escapeHtml(result.moved.name)}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(result.moved.phone)}\n` +
      `👑 <b>Из:</b> ${escapeHtml(result.fromCaptain.name)}\n` +
      `👑 <b>В:</b> ${escapeHtml(result.toCaptain.name)}\n` +
      `👥 <b>Слоты:</b> ${result.toCaptain.currentParticipants + 1}/${result.toCaptain.slots} (свободно: ${free})\n` +
      `🕒 ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`;
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
    const free = Math.max(0, result.captain.slots - 1 - result.captain.currentParticipants);
    const text = `❌ <b>ОТПИСКА ОТ КАПИТАНА</b>\n\n` +
      `👤 <b>Пользователь:</b> ${escapeHtml(result.removed.name)}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(result.removed.phone)}\n` +
      `👑 <b>Капитан:</b> ${escapeHtml(result.captain.name)}\n` +
      `👥 <b>Слоты:</b> ${result.captain.currentParticipants + 1}/${result.captain.slots} (свободно: ${free})\n` +
      `🕒 ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`;
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
      `🕒 ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}`;
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
    uniqueUsers.set(phoneClean, {
      ...u,
      isCaptain: captainPhones.has(phoneClean),
      isSubscribed: subscribedPhones.has(phoneClean)
    });
  });

  participants.forEach(p => {
    const phoneClean = (p.phone || "").replace(/\D/g, "").slice(-10);
    uniqueUsers.set(phoneClean, {
      name: p.name,
      phone: p.phone,
      hasCar: p.hasCar,
      hasTeam: p.hasTeam,
      teamName: p.teamName,
      registeredAt: p.createdAt || new Date().toISOString(),
      isCaptain: captainPhones.has(phoneClean),
      isSubscribed: subscribedPhones.has(phoneClean)
    });
  });

  const users = Array.from(uniqueUsers.values());
  res.json({ ok: true, users });
});

/** Удалить ВСЕХ капитанов (админ) */
app.post("/api/admin/delete-all-captains", (req, res) => {
  if (!requireToken(res)) return;
  const result = deleteAllCaptains();
  res.json({ ok: true, ...result });
});

/** Удалить одного капитана (админ) */
app.post("/api/admin/delete-captain", (req, res) => {
  if (!requireToken(res)) return;
  const { captainId } = req.body || {};
  if (!captainId) return res.status(400).json({ ok: false, error: "Не указан captainId" });
  const result = deleteCaptain(captainId);
  if (result.error) return res.status(400).json({ ok: false, error: result.error });
  res.json({ ok: true, ...result });
});

/** Удалить ВСЕХ участников (админ) */
app.post("/api/admin/delete-all-participants", (req, res) => {
  if (!requireToken(res)) return;
  const result = deleteAllParticipants();
  res.json({ ok: true, ...result });
});

/** Удалить одного участника (админ) */
app.post("/api/admin/delete-participant", (req, res) => {
  if (!requireToken(res)) return;
  const { phone, captainId } = req.body || {};
  if (!phone) return res.status(400).json({ ok: false, error: "Не указан телефон" });
  const result = deleteParticipant({ phone, captainId });
  if (result.error) return res.status(400).json({ ok: false, error: result.error });
  res.json({ ok: true, ...result });
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

/**
 * Отметить точку взятой (нажата кнопка «Завершить задание»).
 * body: { stationCode, phone, teamNumber? }
 * ответ: { ok, nextHint, solvedCount, allDone }
 */
app.post("/api/solve", async (req, res) => {
  const { stationCode, phone, teamNumber } = req.body || {};

  const station = findStation(stationCode);
  if (!station) {
    return res.status(404).json({ ok: false, error: "Точка не найдена. Проверьте QR-код." });
  }

  // До старта игры точка 0 не может быть засчитана
  if (station.id === 0 && !isGameStarted()) {
    return res.status(403).json({
      ok: false,
      error: "Квест ещё не начался. Точка 0 заблокирована до времени старта.",
    });
  }

  const team = teamNumber ? findTeamByNumber(teamNumber) : null;
  if (team && !isTeamCaptain(team, phone)) {
    return res.status(403).json({
      ok: false,
      error: "Действия на точке выполняет капитан команды.",
    });
  }
  const key = progressKey({ teamNumber: team ? team.number : null, phone });
  if (!key) {
    return res.status(400).json({
      ok: false,
      error: "Укажите номер команды или телефон — иначе прогресс не сохранить.",
    });
  }

  // Порядок действий:
  //  - Путь А: разгадал загадку → подтвердил прибытие → выполняет задание;
  //  - Путь Б: открыл адрес → выполняет задание. Прибытия в Пути Б нет,
  //    поэтому засчитываем его в момент завершения задания (решение
  //    организатора: так команда всё равно получает баллы за порядок).
  const before = getProgress(key);
  const sid = String(station.id);
  if (!before?.arrivals?.[sid]) {
    if (station.id === 0 || before?.notGuessed?.[sid]) {
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
        error: 'Сначала подтвердите прибытие на этой точке.',
      });
    }
  }

  const wasSolved = Boolean(before?.stations?.[sid]);
  const entry = solveStation({
    key,
    teamNumber: team ? team.number : null,
    teamName: team ? team.name : "",
    phone,
    stationId: station.id,
  });
  const solvedCount = Object.keys(entry?.stations || {}).length;

  // Взяты все точки — это и есть финиш. Отдельного финального кода в квесте нет,
  // победителя определяет сумма баллов, а при равенстве — время финиша.
  const allDone = solvedCount >= TOTAL_STATIONS;
  if (allDone) {
    markFinished({
      key,
      teamNumber: team ? team.number : null,
      teamName: team ? team.name : "",
      phone,
    });
  }

  // Уведомляем организаторов о завершении задания. Повторный вызов для уже
  // закрытой точки не спамит: шлём только первое взятие.
  if (!wasSolved) {
    const fresh = getProgress(key) || entry;
    notifyOrganizers(
      buildMessage({
        event: "solved",
        stationId: station.id,
        stationName: station.name,
        team: team?.name,
        phone,
        teamNumber: team?.number,
        progressEntry: fresh,
      })
    );
  }

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
  let { teamNumber, phone } = req.query || {};
  const phoneClean = phone ? normalizePhone(phone) : "";
  let participant = null;
  if (phoneClean) {
    const parts = readParticipants();
    participant = parts.find((p) => normalizePhone(p.phone) === phoneClean);
    if (participant && !teamNumber && participant.teamNumber) {
      teamNumber = participant.teamNumber;
    }
  }

  let team = teamNumber ? findTeamByNumber(teamNumber) : null;
  if (!team && phoneClean) {
    team = findTeamByCaptainPhone(phoneClean);
    if (team) teamNumber = team.number;
  }

  const check = phoneClean ? checkPhoneRegistration(phoneClean) : { registered: false };
  const isRegistered = check.registered || !!participant || !!team;

  const key = progressKey({ teamNumber: team ? team.number : (teamNumber || null), phone: phoneClean || phone });
  if (!key) {
    return res.status(400).json({ ok: false, error: "Нужен номер команды или телефон." });
  }
  const entry = getProgress(key);
  const questState = getQuestState();
  const isReset = !team && (!entry || !entry.stations || Object.keys(entry.stations).length === 0);

  res.json({
    ok: true,
    questId: questState.questId,
    registered: isRegistered,
    reset: isReset || !isRegistered,
    total: TOTAL_STATIONS,
    teamNumber: team ? team.number : (participant?.teamNumber || null),
    teamName: team ? team.name : (participant?.teamName || entry?.teamName || ""),
    userName: participant?.name || check.details?.name || "",
    captainName: team?.captainName || "",
    stations: entry?.stations || {},
    arrivals: entry?.arrivals || {},
    hints: entry?.hints || {},
    notGuessed: entry?.notGuessed || {},
    solved: entry?.solved || {},
    finishedAt: entry?.finishedAt || null,
  });
});

/** Судейская таблица (без телефонов — можно показывать участникам). */
app.get("/api/standings", (_req, res) => {
  res.json({ ok: true, total: TOTAL_STATIONS, rows: standings() });
});

/** Материалы капитанов вместе с текстом локации — для админ-дэшборда. */
app.get("/api/submissions", (req, res) => {
  const { teamNumber } = req.query || {};
  let list = listSubmissions();
  if (teamNumber) {
    list = list.filter((s) => Number(s.teamNumber) === Number(teamNumber));
  }
  list = [...list].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  res.json({ ok: true, submissions: list });
});

const BOT_OFFSET_FILE = path.join(__dirname, "botOffset.json");

function readBotOffset() {
  try {
    const v = JSON.parse(fs.readFileSync(BOT_OFFSET_FILE, "utf8"));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch (e) {
    return 0;
  }
}

function saveBotOffset(id) {
  try {
    fs.writeFileSync(BOT_OFFSET_FILE, JSON.stringify(id), "utf8");
  } catch (e) {}
}

/**
 * Безопасное разбиение длинного сообщения для Telegram (лимит 4096 символов).
 * Режет по строкам, сохраняя целостность строк и тегов.
 */
function splitTelegramMessage(text, maxLen = 3800) {
  if (!text || text.length <= maxLen) return [text || ""];
  const chunks = [];
  const lines = text.split("\n");
  let currentChunk = "";

  for (const line of lines) {
    if ((currentChunk + "\n" + line).length > maxLen) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? currentChunk + "\n" + line : line;
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks.length ? chunks : [text];
}

/**
 * Отправка сообщения в Telegram с поддержкой:
 *  - автоматического разбиения длинных сообщений на части
 *  - фоллбэка на чистый текст при ошибке парсинга HTML entities
 *  - повторов при 429 Too Many Requests
 *  - поддержки message_thread_id (топиков в супергруппах)
 */
async function sendTelegramMessage(chatId, text, options = {}) {
  const { TOKEN } = getEnv();
  if (!TOKEN || !chatId) {
    console.warn("[TG] sendTelegramMessage: отсутствует токен или chatId", { chatId });
    return { ok: false, error: "Token or chatId missing" };
  }

  const { reply_markup, threadId, parse_mode = "HTML" } = options;
  const chunks = splitTelegramMessage(text, 3800);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isLast = i === chunks.length - 1;

    const payload = {
      chat_id: chatId,
      text: chunk,
    };
    if (parse_mode) payload.parse_mode = parse_mode;
    if (threadId) payload.message_thread_id = threadId;
    if (isLast && reply_markup) payload.reply_markup = reply_markup;

    try {
      let res = await fetch(API("sendMessage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let data = await res.json();

      // Если Telegram ругается на некорректный HTML, пробуем без разметки (чистый текст)
      if (!data.ok && parse_mode && String(data.description || "").includes("can't parse entities")) {
        console.warn("[TG] Ошибка парсинга HTML entities, отправляем чистым текстом:", data.description);
        delete payload.parse_mode;
        payload.text = chunk.replace(/<[^>]+>/g, "");
        res = await fetch(API("sendMessage"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await res.json();
      }

      // Если 429 Too Many Requests
      if (!data.ok && data.error_code === 429) {
        const waitSec = (data.parameters && data.parameters.retry_after) || 3;
        console.warn(`[TG] 429 Too Many Requests, ждём ${waitSec}с...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        res = await fetch(API("sendMessage"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await res.json();
      }

      if (!data.ok) {
        console.error("[TG] Ошибка sendMessage:", JSON.stringify(data));
        return data;
      }
    } catch (err) {
      console.error("[TG] Сетевая ошибка sendMessage:", err.message);
      return { ok: false, error: err.message };
    }

    if (chunks.length > 1 && !isLast) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return { ok: true };
}

/** Сопоставление команд: с '/', без '/', с суффиксом @botname */
function matchCommand(rawText, commandNames) {
  if (!rawText) return false;
  const cleaned = rawText.trim().toLowerCase();
  for (const name of commandNames) {
    const n = name.toLowerCase();
    if (
      cleaned === n ||
      cleaned === `/${n}` ||
      cleaned.startsWith(`/${n}@`) ||
      cleaned.startsWith(`/${n} `) ||
      cleaned.startsWith(`${n} `)
    ) {
      return true;
    }
  }
  return false;
}

/** Отправить список всех участников в Telegram-чат */
async function sendParticipantsListToChat(chatId, options = {}) {
  const { mode = "all", threadId = null } = options;
  const participants = readParticipants();

  if (participants.length === 0) {
    const text = "📋 <b>Список участников пока пуст.</b>\nНикто ещё не зарегистрировался через форму.";
    const reply_markup = {
      inline_keyboard: [
        [{ text: "🔄 Обновить список", callback_data: "list_participants" }],
      ],
    };
    await sendTelegramMessage(chatId, text, { reply_markup, threadId });
    return;
  }

  const { groups, loners } = participantsByTeam(participants);
  const rows = standings();
  const currentGroups = groups.filter((g) => !g.team.archived);
  const archivedCount = groups.length - currentGroups.length;

  const text = buildParticipantsListText(participants, { groups, loners }, rows, mode);

  const buttons = [];
  if (archivedCount > 0) {
    if (mode === "current") {
      buttons.push([
        { text: `🗂 Показать всю базу (${participants.length} чел.)`, callback_data: "list_all" },
      ]);
    } else {
      buttons.push([
        { text: `👥 Только текущий квест (${currentGroups.length} ком.)`, callback_data: "list_current" },
      ]);
    }
  }
  buttons.push([
    { text: "🔄 Обновить список", callback_data: mode === "current" ? "list_current" : "list_all" },
    { text: "🏁 Таблица квеста", callback_data: "standings" },
  ]);

  const reply_markup = { inline_keyboard: buttons };
  await sendTelegramMessage(chatId, text, { reply_markup, threadId });
}

/** Судейская таблица в Telegram: кто сколько точек взял и когда финишировал. */
async function sendStandingsToChat(chatId, options = {}) {
  const text = buildStandingsText(standings(), TOTAL_STATIONS);
  const reply_markup = {
    inline_keyboard: [
      [
        { text: "🔄 Обновить таблицу", callback_data: "standings" },
        { text: "📋 Список участников", callback_data: "list_participants" },
      ],
    ],
  };
  await sendTelegramMessage(chatId, text, { reply_markup, threadId: options.threadId });
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

// Fallback: все пути, которые не попали в /api/* и не отдались статикой,
// уходят на index.html (SPA routing). express.static(DIST_DIR) уже выше.
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
async function askFinishConfirmation(targetChatId, options = {}) {
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
  await sendTelegramMessage(targetChatId, text, { reply_markup, threadId: options.threadId });
}

/**
 * Собственно очистка — вызывается только после подтверждения.
 * Участников НЕ трогает: participants.json — накопительная база клиентов,
 * она живёт от мероприятия к мероприятию.
 */
async function handleFinishQuestCommand(targetChatId, options = {}) {
  const counts = resetAll();
  try {
    deleteAllCaptains();
  } catch (e) {
    console.error("Error clearing captains on /finish_quest:", e);
  }
  const participants = readParticipants();
  let partsModified = false;
  participants.forEach((p) => {
    if (p.teamNumber || p.teamName || p.hasTeam) {
      p.teamNumber = null;
      p.teamName = "";
      p.hasTeam = false;
      partsModified = true;
    }
  });
  if (partsModified) {
    saveParticipants(participants);
  }
  const kept = participants.length;
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
  await sendTelegramMessage(targetChatId, text, { reply_markup, threadId: options.threadId });
}

// === Telegram Long Polling для обработки кнопок и команд (/list, /finish_quest, /participants, /список) ===
let lastUpdateId = readBotOffset();

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
        saveBotOffset(lastUpdateId);

        // Обработка нажатий на инлайн-кнопки
        if (update.callback_query) {
          const cb = update.callback_query;
          const data = cb.data;
          const targetChatId = cb.message?.chat?.id || CHAT_ID;
          const threadId = cb.message?.message_thread_id;

          const answer = (text) =>
            fetch(API("answerCallbackQuery"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callback_query_id: cb.id, text }),
            }).catch(() => {});

          if (data === "list_participants" || data === "list_all") {
            await answer("Загружаю список...");
            await sendParticipantsListToChat(targetChatId, { mode: "all", threadId });
          } else if (data === "list_current") {
            await answer("Загружаю текущий квест...");
            await sendParticipantsListToChat(targetChatId, { mode: "current", threadId });
          } else if (data === "standings") {
            await answer("Считаю таблицу...");
            await sendStandingsToChat(targetChatId, { threadId });
          } else if (data === "finish_quest") {
            await answer("Нужно подтверждение");
            await askFinishConfirmation(targetChatId, { threadId });
          } else if (data === "finish_quest_confirm") {
            await answer("Стираю данные...");
            await handleFinishQuestCommand(targetChatId, { threadId });
          } else if (data === "finish_quest_cancel") {
            await answer("Отменено");
            await sendTelegramMessage(targetChatId, "↩️ Очистка отменена. Данные на месте.", { threadId });
          }
        }

        // Обработка команд (/list, /finish_quest, /participants, /список, /start)
        const msg = update.message || update.channel_post;
        if (msg && msg.text) {
          const text = msg.text.trim();
          const targetChatId = msg.chat.id;
          const threadId = msg.message_thread_id;

          if (
            matchCommand(text, ["finish_quest", "finishquest", "finish quest", "finish", "очистить", "завершить"])
          ) {
            await askFinishConfirmation(targetChatId, { threadId });
          } else if (
            matchCommand(text, ["list_all", "список_все", "база", "архив"])
          ) {
            await sendParticipantsListToChat(targetChatId, { mode: "all", threadId });
          } else if (
            matchCommand(text, ["list", "participants", "список", "участники"])
          ) {
            await sendParticipantsListToChat(targetChatId, { mode: "all", threadId });
          } else if (
            matchCommand(text, ["list_current", "текущие"])
          ) {
            await sendParticipantsListToChat(targetChatId, { mode: "current", threadId });
          } else if (
            matchCommand(text, ["standings", "table", "таблица", "результаты", "счет"])
          ) {
            await sendStandingsToChat(targetChatId, { threadId });
          } else if (
            matchCommand(text, ["start", "help", "старт", "помощь", "меню", "menu"])
          ) {
            // Живая статистика для приветствия.
            const participants = readParticipants();
            const teams = listTeams();
            const rows = standings();
            const finishedCount = rows.filter((r) => r.finishedAt).length;
            const questStatus = finishedCount > 0
              ? `🏆 Финишировало: ${finishedCount} из ${rows.length}`
              : rows.some((r) => r.solved > 0)
                ? `🏃 В процессе: ${rows.filter((r) => r.solved > 0).length} команд(ы) в игре`
                : `⏳ Квест ещё не начался`;

            const inProgressCount = rows.filter((r) => r.solved > 0 && !r.finishedAt).length;
            const mediaTotal = listSubmissions().length;

            const welcomeText =
              `👋 <b>Бот EventTomiris готов к работе!</b>\n\n` +
              `📊 <b>Текущая статистика:</b>\n` +
              `• 👥 Команд: ${teams.length}\n` +
              `• 👤 Участников: ${participants.length}\n` +
              `• 🧩 В игре: ${inProgressCount} команд(ы)\n` +
              `• 📸 Материалов от капитанов: ${mediaTotal}\n` +
              `• ${questStatus}\n\n` +
              `📌 <b>Доступные команды:</b>\n` +
              `• /list или /список — Показать список зарегистрированных участников со всеми данными.\n` +
              `• /standings или /таблица — Таблица квеста: баллы, число точек и время финиша.\n` +
              `• /finish_quest или /finish — Завершить квест и очистить список участников.`;
            const reply_markup = {
              inline_keyboard: [
                [{ text: "📋 Показать список участников", callback_data: "list_participants" }],
                [{ text: "🏁 Таблица квеста", callback_data: "standings" }],
                [{ text: "🧹 Завершить квест (/finish_quest)", callback_data: "finish_quest" }],
              ],
            };
            await sendTelegramMessage(targetChatId, welcomeText, { reply_markup, threadId });
          }
        }
      }
    }
  } catch (e) {
    console.error("[Telegram Poll Error]:", e.message || e);
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
          { command: "standings", description: "Таблица квеста: баллы, точки, финиш" },
          { command: "finish_quest", description: "Завершить квест и очистить участников" },
          { command: "help", description: "Справка по боту" },
        ],
      }),
    });
  } catch (e) {}
}

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
