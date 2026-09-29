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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPTAINS_FILE = path.join(__dirname, "captains.json");

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
  const existing = captains.find((c) => {
    const cPhone = (c.phone || "").replace(/\D/g, "").slice(-10);
    const newPhone = String(phone || "").replace(/\D/g, "").slice(-10);
    return cPhone === newPhone;
  });
  if (existing) {
    return { error: "Этот номер уже зарегистрирован как капитан", captain: existing };
  }
  const captain = {
    id,
    name: String(name || "").trim(),
    phone: String(phone || "").trim(),
    slots: Number(slots) || 5,
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
  if (!Number.isFinite(slots) || slots < 1) {
    return { error: "Некорректное количество слотов" };
  }
  captain.slots = slots;
  writeJson(CAPTAINS_FILE, captains);
  return { captain };
}

export function canSubscribeToCaptain(captainId) {
  const captain = findCaptainById(captainId);
  if (!captain) return { error: "Капитан не найден" };
  if (!captain.active) return { error: "Приём на этот капитан закрыт" };
  if (captain.currentParticipants >= captain.slots) {
    return { error: "Места закончились" };
  }
  return { ok: true, captain };
}

export function subscribeToCaptain({ captainId, name, phone, hasCar }) {
  const validation = canSubscribeToCaptain(captainId);
  if (!validation.ok) return validation;
  const captains = listCaptains();
  const captain = captains.find((c) => c.id === captainId);
  const phoneClean = String(phone || "").replace(/\D/g, "").slice(-10);
  const alreadySubscribed = captain.participants.some((p) => {
    return (p.phone || "").replace(/\D/g, "").slice(-10) === phoneClean;
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
  const phoneClean = String(phone || "").replace(/\D/g, "").slice(-10);
  const idx = captain.participants.findIndex((p) => {
    return (p.phone || "").replace(/\D/g, "").slice(-10) === phoneClean;
  });
  if (idx === -1) return { error: "Пользователь не найден в команде" };
  const removed = captain.participants.splice(idx, 1)[0];
  captain.currentParticipants -= 1;
  writeJson(CAPTAINS_FILE, captains);
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
  if (toCaptain.currentParticipants >= toCaptain.slots) {
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
    availableSlots: c.slots - c.currentParticipants,
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
