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
import { bumpQuestState, deleteTeam as deleteTeamRecord, findOrCreateTeam, findTeamByCaptainPhone, listTeams, teamKey } from "./store.js";

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

export function createCaptain({ name, phone, slots, hasCar, teamName, ip }, { registerParticipant = true } = {}) {
  const captains = listCaptains();
  const phoneNorm = normalizePhone(phone);
  const participants = readJson(DB_FILE, []);

  const cleanName = String(name || "").trim();
  const cleanPhone = String(phone || "").trim();
  const cleanTeamName = String(teamName || `Команда ${cleanName}`).trim();
  const cleanIp = ip ? String(ip).trim() : "";
  if (!cleanName || !phoneNorm) {
    return { error: "Укажите имя и корректный телефон капитана." };
  }

  const numSlots = Number(slots);
  if (!numSlots || numSlots < 2 || numSlots > 5) {
    return {
      error: "Количество участников в команде должно быть от 2 до 5 человек.",
    };
  }

  if (!Array.isArray(participants)) {
    return { error: "Не удалось прочитать список участников." };
  }

  const existingCap = captains.find((c) => normalizePhone(c.phone) === phoneNorm);
  if (existingCap) {
    const participant = participants.find((p) => normalizePhone(p.phone) === phoneNorm);
    const team = findTeamByCaptainPhone(phone)
      || (existingCap.teamNumber ? listTeams().find((item) => Number(item.number) === Number(existingCap.teamNumber)) : null);
    if (!team) return { error: "Не удалось найти команду для этого капитана." };
    if (existingCap.teamName !== team.name || cleanTeamName !== team.name) {
      return { error: "Для этого телефона уже создан другой капитан." };
    }
    if (!participant && registerParticipant) {
      participants.push({
        id: Date.now(),
        name: cleanName,
        phone: cleanPhone,
        hasCar: !!hasCar,
        hasTeam: true,
        teamName: team.name,
        teamSize: numSlots,
        teamNumber: team.number,
        ip: cleanIp,
        createdAt: new Date().toISOString(),
      });
      if (!writeJson(DB_FILE, participants)) {
        return { error: "Не удалось сохранить игровую регистрацию капитана." };
      }
    }
    return { captain: existingCap, teamNumber: team.number };
  }

  // Проверяем, зарегистрирован ли уже этот номер в завершённых регистрациях (participants.json)
  const inParticipants = Array.isArray(participants) && participants.some((p) => normalizePhone(p.phone) === phoneNorm);
  if (inParticipants) {
    return {
      error: `Номер телефона ${phone} уже зарегистрирован в квесте. Повторная регистрация невозможна.`,
    };
  }

  // Обычная проверка на случай, если телефон числится где-то ещё (например, в подписчиках другого капитана)
  const regCheck = checkPhoneRegistration(phone);
  if (regCheck.registered) {
    return {
      error: `Номер телефона ${phone} уже зарегистрирован (${regCheck.details?.description || "в квесте"}). Повторная регистрация невозможна.`,
    };
  }

  if (listTeams().some((existing) => existing.key === teamKey(cleanTeamName))) {
    return { error: `Команда «${cleanTeamName}» уже существует. Укажите другое название.` };
  }
  const teamSnapshot = listTeams();
  const team = findOrCreateTeam({
    name: cleanTeamName,
    captainName: cleanName,
    captainPhone: cleanPhone,
    size: numSlots,
  });
  if (!team) return { error: "Не удалось создать команду капитана." };

  const id = `cap_${Date.now()}`;
  const participant = {
    id: Date.now(),
    name: cleanName,
    phone: cleanPhone,
    hasCar: !!hasCar,
    hasTeam: true,
    teamName: cleanTeamName,
    teamSize: numSlots,
    teamNumber: team.number,
    ip: cleanIp,
    createdAt: new Date().toISOString(),
  };
  const captain = {
    id,
    name: cleanName,
    phone: cleanPhone,
    teamName: cleanTeamName,
    slots: numSlots,
    currentParticipants: 0,
    participants: [],
    hasCar: !!hasCar,
    ip: cleanIp,
    createdAt: new Date().toISOString(),
    active: true,
    teamNumber: team.number,
  };
  captains.push(captain);
  if (!writeJson(CAPTAINS_FILE, captains)) {
    writeJson(TEAMS_FILE, teamSnapshot);
    return { error: "Не удалось сохранить капитана." };
  }

  if (!registerParticipant) return { captain, teamNumber: team.number };

  participants.push(participant);
  if (!writeJson(DB_FILE, participants)) {
    writeJson(CAPTAINS_FILE, captains.filter((item) => item.id !== id));
    writeJson(TEAMS_FILE, teamSnapshot);
    return { error: "Не удалось сохранить игровую регистрацию капитана." };
  }

  return { captain, teamNumber: team.number };
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

export function subscribeToCaptain({ captainId, name, phone, hasCar, ip }) {
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
    ip: ip ? String(ip).trim() : "",
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

/**
 * Напрямую добавить пользователя к капитану, минуя checkPhoneRegistration.
 * Используется при перемещении уже зарегистрированных пользователей (из solo → капитан).
 */
export function addParticipantToCaptainDirect({ captainId, name, phone, hasCar, ip }) {
  const captains = listCaptains();
  const captain = captains.find((c) => c.id === captainId);
  if (!captain) return { error: "Капитан не найден" };
  if (!captain.active) return { error: "Приём на этого капитана закрыт" };
  captain.participants = Array.isArray(captain.participants) ? captain.participants : [];
  captain.currentParticipants = Math.max(Number(captain.currentParticipants) || 0, captain.participants.length);
  const phoneClean = normalizePhone(phone);
  if (!phoneClean) return { error: "Неверный номер телефона пользователя" };
  const alreadySubscribed = captain.participants.some((p) => normalizePhone(p.phone) === phoneClean);
  if (alreadySubscribed) return { error: "Пользователь уже в этой команде" };
  if (captain.currentParticipants >= Math.max(0, Number(captain.slots) - 1)) {
    return { error: "У капитана нет свободных мест" };
  }
  captain.currentParticipants += 1;
  captain.participants.push({
    name: String(name || "").trim(),
    phone: String(phone || "").trim(),
    hasCar: !!hasCar,
    ip: ip ? String(ip).trim() : "",
    subscribedAt: new Date().toISOString(),
  });
  writeJson(CAPTAINS_FILE, captains);
  return { ok: true, captain };
}

export function moveUserBetweenCaptains({ fromCaptainId, toCaptainId, phone }) {
  const fromCaptain = findCaptainById(fromCaptainId);
  const toCaptain = findCaptainById(toCaptainId);
  if (!fromCaptain) return { error: "Исходный капитан не найден" };
  if (!toCaptain) return { error: "Целевой капитан не найден" };
  const phoneClean = normalizePhone(phone);
  if (!phoneClean) return { error: "Неверный номер телефона пользователя" };
  const fromParticipants = Array.isArray(fromCaptain.participants) ? fromCaptain.participants : [];
  const toParticipants = Array.isArray(toCaptain.participants) ? toCaptain.participants : [];
  const idx = fromParticipants.findIndex((p) => normalizePhone(p.phone) === phoneClean);
  if (idx === -1) return { error: "Пользователь не найден в исходной команде" };
  const targetParticipantCount = Math.max(Number(toCaptain.currentParticipants) || 0, toParticipants.length);
  if (targetParticipantCount >= Math.max(0, Number(toCaptain.slots) - 1)) {
    return { error: "У целевого капитана нет свободных мест" };
  }
  const alreadyInTarget = toParticipants.some((p) => normalizePhone(p.phone) === phoneClean);
  if (alreadyInTarget) return { error: "Пользователь уже в целевой команде" };
  if (String(fromCaptainId) === String(toCaptainId)) {
    return { error: "Исходная и целевая команды совпадают" };
  }
  const moved = fromParticipants.splice(idx, 1)[0];
  fromCaptain.participants = fromParticipants;
  fromCaptain.currentParticipants = Math.max(0, fromParticipants.length);
  toCaptain.participants = toParticipants;
  toCaptain.currentParticipants = targetParticipantCount + 1;
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

export function addSoloUser({ name, phone, hasCar, ip }) {
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
    ip: ip ? String(ip).trim() : "",
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

/** Удалить команду и её регистрации, чтобы участники могли начать заново. */
export function deleteTeamAndRegistrations(teamNumber) {
  const number = Number(teamNumber);
  const team = listTeams().find((item) => Number(item.number) === number);
  if (!team) return { ok: false, error: `Команда №${number} не найдена.` };

  const sameTeamName = (name) => Boolean(name && teamKey(name) === teamKey(team.name));
  const captains = readJson(CAPTAINS_FILE, []);
  const isTeamCaptain = (captain) =>
    Number(captain.teamNumber) === number ||
    sameTeamName(captain.teamName) ||
    (team.captainPhone && normalizePhone(captain.phone) === normalizePhone(team.captainPhone));
  const teamCaptains = captains.filter(isTeamCaptain);
  const teamPhones = new Set();
  const addPhone = (phone) => {
    const normalized = normalizePhone(phone);
    if (normalized) teamPhones.add(normalized);
  };

  teamCaptains.forEach((captain) => {
    addPhone(captain.phone);
    (captain.participants || []).forEach((participant) => addPhone(participant.phone));
  });

  const participants = readJson(DB_FILE, []);
  const belongsToTeam = (participant) =>
    Number(participant.teamNumber) === number || sameTeamName(participant.teamName);
  participants.filter(belongsToTeam).forEach((participant) => addPhone(participant.phone));

  const soloUsers = readJson(SOLO_FILE, []);
  soloUsers.filter(belongsToTeam).forEach((participant) => addPhone(participant.phone));

  const remainingParticipants = participants.filter(
    (participant) => !belongsToTeam(participant) && !teamPhones.has(normalizePhone(participant.phone))
  );
  const remainingCaptains = captains
    .filter((captain) => !isTeamCaptain(captain))
    .map((captain) => {
      const members = (captain.participants || []).filter(
        (participant) => !teamPhones.has(normalizePhone(participant.phone))
      );
      return { ...captain, participants: members, currentParticipants: members.length };
    });
  const remainingSoloUsers = soloUsers.filter(
    (participant) => !belongsToTeam(participant) && !teamPhones.has(normalizePhone(participant.phone))
  );

  if (!writeJson(DB_FILE, remainingParticipants)) {
    return { ok: false, error: "Не удалось обновить базу участников." };
  }
  if (!writeJson(CAPTAINS_FILE, remainingCaptains)) {
    return { ok: false, error: "Не удалось обновить список капитанов." };
  }
  if (!writeJson(SOLO_FILE, remainingSoloUsers)) {
    return { ok: false, error: "Не удалось обновить список одиночных участников." };
  }

  const result = deleteTeamRecord(number);
  if (!result.ok) return result;
  bumpQuestState();

  return {
    ok: true,
    removed: { ...result.removed, registrations: teamPhones.size },
  };
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
    deleteTeamRecord(capTeam.number);
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
