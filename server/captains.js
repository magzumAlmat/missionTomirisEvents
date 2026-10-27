/**
 * Хранилище капитанов и слотов.
 *
 * Зачем: пользователи подписываются на капитана с фиксированным количеством слотов.
 * Когда слоты заканчиваются — показывается "Места занято".
 * Одиночные пользователи (без капитана) обрабатываются отдельно.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkPhoneRegistration, normalizePhone } from "./phoneValidator.js";
import { bumpQuestState, deleteTeam, listTeams } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPTAINS_FILE = path.join(__dirname, "captains.json");
const DB_FILE = path.join(__dirname, "participants.json");
const SOLO_FILE = path.join(__dirname, "solo_users.json");
const TEAMS_FILE = path.join(__dirname, "teams.json");

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`captains: не удалось прочитать ${path.basename(file)}`, e.message);
  }
  return fallback;
}

function writeJson(file, data) {
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    console.error(`captains: не удалось записать ${path.basename(file)}`, e.message);
    return false;
  }
}

export function listCaptains() {
  const list = readJson(CAPTAINS_FILE, []);
  return Array.isArray(list) ? list.filter((c) => c.active !== false) : [];
}

export function findCaptainById(id) {
  return listCaptains().find((c) => c.id === id) || null;
}

export function findCaptainByPhone(phone) {
  const phoneClean = String(phone || "").replace(/\D/g, "").slice(-10);
  return listCaptains().find((c) => (c.phone || "").replace(/\D/g, "").slice(-10) === phoneClean) || null;
}

export function createCaptain({ name, phone, slots, hasCar }) {
  const captains = listCaptains();
  const id = `cap_${Date.now()}`;

  const regCheck = checkPhoneRegistration(phone);
  if (regCheck.registered) {
    return {
      error: `Номер телефона ${phone} уже зарегистрирован (${regCheck.details?.description || "в квесте"}). Повторная регистрация невозможна.`,
    };
  }

  const numSlots = Number(slots);
  if (!numSlots || numSlots < 2 || numSlots > 5) {
    return {
      error: "Количество участников в команде должно быть от 2 до 5 человек.",
    };
  }

  const captain = {
    id,
    name: String(name || "").trim(),
    phone: String(phone || "").trim(),
    slots: numSlots,
    // currentParticipants — только приглашённые участники БЕЗ капитана.
    // slots считаются «включая капитана», поэтому при расчёте свободных мест
    // всегда вычитаем одно место под самого капитана.
    currentParticipants: 0,
    participants: [],
    hasCar: !!hasCar,
    createdAt: new Date().toISOString(),
    active: true,
  };
  captains.push(captain);
  writeJson(CAPTAINS_FILE, captains);
  return { captain };
}

export function updateCaptainSlots(captainId, newSlots) {
  const captains = listCaptains();
  const captain = captains.find((c) => c.id === captainId);
  if (!captain) return { error: "Капитан не найден" };
  const slots = Number(newSlots);
  if (!Number.isFinite(slots) || slots < 2 || slots > 5) {
    return { error: "Количество слотов должно быть от 2 до 5." };
  }
  captain.slots = slots;
  writeJson(CAPTAINS_FILE, captains);
  return { captain };
}

export function canSubscribeToCaptain(captainId) {
  const captain = findCaptainById(captainId);
  if (!captain) return { error: "Капитан не найден" };
  if (!captain.active) return { error: "Приём на этот капитан закрыт" };
  if (captain.currentParticipants >= Math.max(0, captain.slots - 1)) {
    return { error: "Места закончились" };
  }
  return { ok: true, captain };
}

export function subscribeToCaptain({ captainId, name, phone, hasCar }) {
  const validation = canSubscribeToCaptain(captainId);
  if (!validation.ok) return validation;

  const regCheck = checkPhoneRegistration(phone);
  if (regCheck.registered) {
    return {
      error: `Номер телефона ${phone} уже зарегистрирован (${regCheck.details?.description || "в квесте"}). Повторная регистрация невозможна.`,
    };
  }

  const captains = listCaptains();
  const captain = captains.find((c) => c.id === captainId);
  const phoneClean = normalizePhone(phone);
  const alreadySubscribed = captain.participants.some((p) => {
    return normalizePhone(p.phone) === phoneClean;
  });
  if (alreadySubscribed) {
    return { error: "Вы уже подписаны на этого капитана" };
  }
  captain.currentParticipants += 1;
  captain.participants.push({
    name: String(name || "").trim(),
    phone: String(phone || "").trim(),
    hasCar: !!hasCar,
    subscribedAt: new Date().toISOString(),
  });
  writeJson(CAPTAINS_FILE, captains);
  return { ok: true, captain };
}

export function unsubscribeFromCaptain({ captainId, phone }) {
  const captains = listCaptains();
  const captain = captains.find((c) => c.id === captainId);
  if (!captain) return { error: "Капитан не найден" };
  const phoneClean = normalizePhone(phone);
  const idx = captain.participants.findIndex((p) => {
    return normalizePhone(p.phone) === phoneClean;
  });
  if (idx === -1) return { error: "Пользователь не найден в команде" };
  const removed = captain.participants.splice(idx, 1)[0];
  captain.currentParticipants = Math.max(0, captain.participants.length);
  writeJson(CAPTAINS_FILE, captains);

  // Убираем привязку к команде в participants.json
  const parts = readJson(DB_FILE, []);
  let modified = false;
  parts.forEach((p) => {
    if (normalizePhone(p.phone) === phoneClean) {
      p.hasTeam = false;
      p.teamNumber = null;
      p.teamName = "";
      modified = true;
    }
  });
  if (modified) writeJson(DB_FILE, parts);

  bumpQuestState();
  return { ok: true, captain, removed };
}

export function moveUserBetweenCaptains({ fromCaptainId, toCaptainId, phone }) {
  const fromCaptain = findCaptainById(fromCaptainId);
  const toCaptain = findCaptainById(toCaptainId);
  if (!fromCaptain) return { error: "Исходный капитан не найден" };
  if (!toCaptain) return { error: "Целевой капитан не найден" };
  const phoneClean = String(phone || "").replace(/\D/g, "").slice(-10);
  const idx = fromCaptain.participants.findIndex((p) => {
    return (p.phone || "").replace(/\D/g, "").slice(-10) === phoneClean;
  });
  if (idx === -1) return { error: "Пользователь не найден в исходной команде" };
  if (toCaptain.currentParticipants >= Math.max(0, toCaptain.slots - 1)) {
    return { error: "У целевого капитана нет свободных мест" };
  }
  const alreadyInTarget = toCaptain.participants.some((p) => {
    return (p.phone || "").replace(/\D/g, "").slice(-10) === phoneClean;
  });
  if (alreadyInTarget) return { error: "Пользователь уже в целевой команде" };
  const moved = fromCaptain.participants.splice(idx, 1)[0];
  fromCaptain.currentParticipants -= 1;
  toCaptain.currentParticipants += 1;
  toCaptain.participants.push(moved);
  writeJson(CAPTAINS_FILE, listCaptains());
  return { ok: true, fromCaptain, toCaptain, moved };
}

export function getCaptainsSummary() {
  const captains = listCaptains();
  return captains.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    slots: c.slots,
    currentParticipants: c.currentParticipants,
    availableSlots: Math.max(0, c.slots - 1 - c.currentParticipants),
    hasCar: c.hasCar,
    participants: c.participants.map((p) => ({
      name: p.name,
      phone: p.phone,
      hasCar: p.hasCar,
    })),
    active: c.active,
  }));
}

export function addSoloUser({ name, phone, hasCar }) {
  const regCheck = checkPhoneRegistration(phone);
  if (regCheck.registered) {
    return {
      error: `Номер телефона ${phone} уже зарегистрирован (${regCheck.details?.description || "в квесте"}). Повторная регистрация невозможна.`,
    };
  }
  const soloFile = path.join(__dirname, "solo_users.json");
  const users = readJson(soloFile, []);
  users.push({
    name: String(name || "").trim(),
    phone: String(phone || "").trim(),
    hasCar: !!hasCar,
    registeredAt: new Date().toISOString(),
  });
  writeJson(soloFile, users);
  return { ok: true };
}

export function listSoloUsers() {
  return readJson(path.join(__dirname, "solo_users.json"), []);
}

/** Удалить ВСЕХ капитанов: из captains.json, teams.json и participants.json */
export function deleteAllCaptains() {
  const captains = listCaptains();
  const captainPhones = new Set(captains.map((c) => normalizePhone(c.phone)).filter(Boolean));

  // 1. Очищаем captains.json
  const ok = writeJson(CAPTAINS_FILE, []);

  // 2. Удаляем команды этих капитанов из teams.json
  const teams = listTeams();
  const remainingTeams = teams.filter((t) => !captainPhones.has(normalizePhone(t.captainPhone)));
  writeJson(TEAMS_FILE, remainingTeams);

  // 3. Удаляем записи капитанов из participants.json
  const participants = readJson(DB_FILE, []);
  const remainingParticipants = participants.filter((p) => {
    const norm = normalizePhone(p.phone);
    if (captainPhones.has(norm)) return false;
    if (p.hasTeam && p.teamSize > 0) return false;
    return true;
  });
  writeJson(DB_FILE, remainingParticipants);

  // 4. Обновляем версию состояния квеста (сброс авторизации у пользователей)
  bumpQuestState();

  return { ok, removed: true, count: captains.length };
}

/** Удалить ВСЕХ участников: из solo_users.json, captains.json и participants.json */
export function deleteAllParticipants() {
  // 1. Очищаем solo_users.json
  writeJson(SOLO_FILE, []);

  // 2. Очищаем участников у всех капитанов в captains.json
  const captains = listCaptains();
  captains.forEach((c) => {
    c.participants = [];
    c.currentParticipants = 0;
  });
  writeJson(CAPTAINS_FILE, captains);

  // 3. Удаляем участников из participants.json (оставляем только активных капитанов если есть)
  const participants = readJson(DB_FILE, []);
  const captainPhones = new Set(captains.map((c) => normalizePhone(c.phone)).filter(Boolean));
  const remainingParticipants = participants.filter((p) => {
    const norm = normalizePhone(p.phone);
    return captainPhones.has(norm) || (p.hasTeam && p.teamSize > 0);
  });
  writeJson(DB_FILE, remainingParticipants);

  // 4. Обновляем версию состояния квеста
  bumpQuestState();

  return { ok: true, removed: true };
}

/** Удалить одного капитана */
export function deleteCaptain(captainId) {
  const captains = listCaptains();
  const idx = captains.findIndex((c) => String(c.id) === String(captainId));
  if (idx === -1) return { error: "Капитан не найден" };
  const [removedCap] = captains.splice(idx, 1);
  writeJson(CAPTAINS_FILE, captains);

  const phoneNorm = normalizePhone(removedCap.phone);

  // Удаляем команду из teams.json
  const teams = listTeams();
  const capTeam = teams.find((t) => normalizePhone(t.captainPhone) === phoneNorm);
  if (capTeam) {
    deleteTeam(capTeam.number);
  }

  // Удаляем из participants.json
  const participants = readJson(DB_FILE, []);
  const remaining = participants.filter((p) => normalizePhone(p.phone) !== phoneNorm);
  writeJson(DB_FILE, remaining);

  bumpQuestState();
  return { ok: true, removed: removedCap };
}

/** Удалить одного участника по телефону */
export function deleteParticipant({ phone, captainId }) {
  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm) return { error: "Не указан телефон" };

  // 1. Удаляем из solo_users.json
  const soloUsers = readJson(SOLO_FILE, []);
  const remainingSolo = soloUsers.filter((u) => normalizePhone(u.phone) !== phoneNorm);
  writeJson(SOLO_FILE, remainingSolo);

  // 2. Удаляем из состава капитана в captains.json
  const captains = listCaptains();
  for (const cap of captains) {
    if (captainId && String(cap.id) !== String(captainId)) continue;
    if (Array.isArray(cap.participants)) {
      const pIdx = cap.participants.findIndex((p) => normalizePhone(p.phone) === phoneNorm);
      if (pIdx !== -1) {
        cap.participants.splice(pIdx, 1);
        cap.currentParticipants = Math.max(0, cap.participants.length);
      }
    }
  }
  writeJson(CAPTAINS_FILE, captains);

  // 3. Удаляем из participants.json
  const participants = readJson(DB_FILE, []);
  const remainingParts = participants.filter((p) => normalizePhone(p.phone) !== phoneNorm);
  writeJson(DB_FILE, remainingParts);

  bumpQuestState();
  return { ok: true };
}
