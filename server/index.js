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

  const { stationId, stationName, team, phone } = req.body || {};
  const event = forcedEvent || (req.body && req.body.event) || "arrived";
  const text = buildMessage(event, stationId, stationName, team, phone);

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
 * Помощник: узнать chat_id.
 * 1) Напиши своему боту любое сообщение в Telegram (или добавь его в группу и напиши там).
 * 2) Открой в браузере http://localhost:3001/api/chat-id-helper
 * 3) Скопируй chat.id из ответа в .env → TELEGRAM_CHAT_ID
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

app.listen(process.env.PORT || 3001, () => {
  const { TOKEN, CHAT_ID, PORT } = getEnv();
  console.log(`\n🤖 Telegram-бэкенд запущен: http://localhost:${PORT}`);
  console.log(`   Токен: ${TOKEN ? "задан ✅" : "НЕ задан ❌ (заполни .env)"}`);
  console.log(`   Chat ID: ${CHAT_ID ? CHAT_ID : "НЕ задан ❌ — открой /api/chat-id-helper"}`);
  console.log(`   Проверка: http://localhost:${PORT}/health\n`);
});
