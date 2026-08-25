/**
 * Хранилище квеста: команды, прогресс по точкам и присланные материалы.
 *
 * Зачем: раньше «кто ты» набиралось текстом трижды (регистрация, точка,
 * бот для видео) — сшить это в отчёт было нельзя. Теперь у команды есть
 * НОМЕР: он выдаётся при регистрации и служит ключом везде.
 *
 * Хранение — простые JSON-файлы рядом с сервером (как participants.json).
 * Для одного мероприятия на 30-60 человек этого достаточно.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEAMS_FILE = path.join(__dirname, "teams.json");
const PROGRESS_FILE = path.join(__dirname, "progress.json");
const SUBMISSIONS_FILE = path.join(__dirname, "submissions.json");

/* ---------- низкий уровень ---------- */

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`store: не удалось прочитать ${path.basename(file)}`, e.message);
  }
  return fallback;
}

function writeJson(file, data) {
  try {
    // Пишем через временный файл: если процесс упадёт посреди записи,
    // основной файл останется целым (иначе можно получить обрезанный JSON).
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    console.error(`store: не удалось записать ${path.basename(file)}`, e.message);
    return false;
  }
}

/** Ключ сравнения названий: «Барсы», «барсы» и «  Барсы » — одна команда. */
export function teamKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

/** Последние 10 цифр номера — так сравниваем +7XXX, 8XXX и т.п. */
export function phoneKey(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

/* ---------- команды ---------- */

export function listTeams() {
  const list = readJson(TEAMS_FILE, []);
  return Array.isArray(list) ? list : [];
}

export function findTeamByNumber(number) {
  const n = Number(number);
  if (!Number.isFinite(n)) return null;
  return listTeams().find((t) => t.number === n) || null;
}

export function findTeamByName(name) {
  const key = teamKey(name);
  if (!key) return null;
  return listTeams().find((t) => t.key === key) || null;
}

/**
 * Найти команду по названию или завести новую с очередным номером.
 * Повторная регистрация того же названия НЕ плодит дубликат — участник
 * просто присоединяется к уже существующему номеру.
 */
export function findOrCreateTeam({ name, captainName, captainPhone, size }) {
  const key = teamKey(name);
  if (!key) return null;

  const teams = listTeams();
  const existing = teams.find((t) => t.key === key);
  if (existing) {
    // Уточняем размер, если новая заявка называет больше человек.
    const n = Number(size);
    if (Number.isFinite(n) && n > (existing.size || 0)) {
      existing.size = n;
      writeJson(TEAMS_FILE, teams);
    }
    return existing;
  }

  const number = teams.reduce((max, t) => Math.max(max, t.number || 0), 0) + 1;
  const team = {
    number,
    key,
    name: String(name).trim(),
    captainName: String(captainName || "").trim(),
    captainPhone: String(captainPhone || "").trim(),
    size: Number(size) || 0,
    createdAt: new Date().toISOString(),
  };
  teams.push(team);
  writeJson(TEAMS_FILE, teams);
  return team;
}

/* ---------- прогресс по точкам ---------- */

/**
 * Ключ прогресса: команда — по номеру, одиночка — по телефону.
 * Возвращает строку вида "t7" или "p7001112233".
 */
export function progressKey({ teamNumber, phone }) {
  const n = Number(teamNumber);
  if (Number.isFinite(n) && n > 0) return `t${n}`;
  const p = phoneKey(phone);
  return p ? `p${p}` : "";
}

function readProgress() {
  const data = readJson(PROGRESS_FILE, {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

export function getProgress(key) {
  if (!key) return null;
  return readProgress()[key] || null;
}

function blankEntry({ teamNumber, teamName, phone }) {
  return {
    teamNumber: Number(teamNumber) || null,
    teamName: teamName || "",
    phone: phone || "",
    stations: {},
    finishedAt: null,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Отметить точку как разгаданную. Повторный верный ответ время НЕ меняет —
 * судья смотрит на первое взятие точки.
 */
export function solveStation({ key, teamNumber, teamName, phone, stationId, letter }) {
  if (!key) return null;
  const all = readProgress();
  const entry = all[key] || blankEntry({ teamNumber, teamName, phone });
  if (teamName && !entry.teamName) entry.teamName = teamName;
  if (phone && !entry.phone) entry.phone = phone;

  const sid = String(stationId);
  if (!entry.stations[sid]) {
    entry.stations[sid] = { letter, at: new Date().toISOString() };
  }
  all[key] = entry;
  writeJson(PROGRESS_FILE, all);
  return entry;
}

/** Отметить финиш (введён верный финальный код). Первое время не перетираем. */
export function markFinished({ key, teamNumber, teamName, phone }) {
  if (!key) return null;
  const all = readProgress();
  const entry = all[key] || blankEntry({ teamNumber, teamName, phone });
  if (!entry.finishedAt) entry.finishedAt = new Date().toISOString();
  all[key] = entry;
  writeJson(PROGRESS_FILE, all);
  return entry;
}

/* ---------- материалы от капитанов ---------- */

export function listSubmissions() {
  const list = readJson(SUBMISSIONS_FILE, []);
  return Array.isArray(list) ? list : [];
}

export function addSubmission({ teamNumber, teamName, captainName, kind }) {
  const list = listSubmissions();
  const entry = {
    teamNumber: Number(teamNumber) || null,
    teamName: teamName || "",
    captainName: captainName || "",
    kind: kind || "video",
    at: new Date().toISOString(),
  };
  list.push(entry);
  writeJson(SUBMISSIONS_FILE, list);
  return entry;
}

/* ---------- судейская таблица ---------- */

/**
 * Сводка для судьи: по каждой команде — сколько точек взято, когда взята
 * последняя, финишировала ли, сколько фото/видео прислал капитан.
 * Телефоны сюда НЕ попадают — таблицу можно показывать кому угодно.
 *
 * Порядок: сначала финишировавшие (по времени финиша), затем по числу точек,
 * при равенстве — кто раньше взял последнюю точку.
 */
export function standings() {
  const progress = readProgress();
  const teams = listTeams();
  const submissions = listSubmissions();

  const rows = new Map();

  function rowFor(key, seed) {
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        teamNumber: null,
        teamName: "",
        solved: 0,
        lastAt: null,
        finishedAt: null,
        media: 0,
        ...seed,
      });
    }
    return rows.get(key);
  }

  // Все зарегистрированные команды видны в таблице, даже если ещё не стартовали.
  for (const t of teams) {
    rowFor(`t${t.number}`, { teamNumber: t.number, teamName: t.name });
  }

  for (const [key, p] of Object.entries(progress)) {
    const row = rowFor(key, { teamNumber: p.teamNumber, teamName: p.teamName });
    const times = Object.values(p.stations || {}).map((s) => s.at).filter(Boolean);
    row.solved = times.length;
    row.lastAt = times.sort().slice(-1)[0] || null;
    row.finishedAt = p.finishedAt || null;
    if (!row.teamName && p.teamName) row.teamName = p.teamName;
    if (!row.teamNumber && p.teamNumber) row.teamNumber = p.teamNumber;
  }

  for (const s of submissions) {
    if (!s.teamNumber) continue;
    const row = rowFor(`t${s.teamNumber}`, {
      teamNumber: s.teamNumber,
      teamName: s.teamName,
    });
    row.media += 1;
  }

  return [...rows.values()].sort((a, b) => {
    if (a.finishedAt && b.finishedAt) return a.finishedAt < b.finishedAt ? -1 : 1;
    if (a.finishedAt) return -1;
    if (b.finishedAt) return 1;
    if (b.solved !== a.solved) return b.solved - a.solved;
    if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? -1 : 1;
    if (a.lastAt) return -1;
    if (b.lastAt) return 1;
    return (a.teamNumber || 0) - (b.teamNumber || 0);
  });
}
