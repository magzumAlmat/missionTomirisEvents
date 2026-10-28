import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, "participants.json");
const CAPTAINS_FILE = path.join(__dirname, "captains.json");
const SOLO_FILE = path.join(__dirname, "solo_users.json");

function readJsonSafe(file) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch (e) {
    console.error(`phoneValidator: ошибка чтения ${path.basename(file)}:`, e.message);
  }
  return [];
}

/**
 * Нормализовать номер телефона:
 * Удаляет все нецифровые символы.
 * Если цифр >= 10, берёт последние 10 цифр (без префикса страны +7 / 8 / 7).
 */
export function normalizePhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Проверить, зарегистрирован ли уже этот номер телефона в квесте.
 * Ищет совпадение в:
 * 1) participants.json (основная база участников и капитанов)
 * 2) captains.json (капитаны и подписанные на них участники)
 * 3) solo_users.json (одиночные участники)
 *
 * @param {string} phone
 * @param {object} [options]
 * @param {boolean} [options.ignoreCaptainsCreatedWithinMs] - если задано, игнорировать капитанов созданных только что (в текущей транзакции)
 * @returns {{ registered: boolean, details?: { name: string, phone: string, role: string, teamName?: string, teamNumber?: number, description: string } }}
 */
export function checkPhoneRegistration(phone, options = {}) {
  const norm = normalizePhone(phone);
  if (!norm || norm.length < 6) {
    return { registered: false };
  }

  // 1. Проверяем в participants.json (основная база завершённых регистраций)
  const participants = readJsonSafe(DB_FILE);
  if (Array.isArray(participants)) {
    const found = participants.find((p) => normalizePhone(p.phone) === norm);
    if (found) {
      const isCaptain = found.hasTeam && found.teamSize === 1;
      const role = isCaptain ? "капитан команды" : (found.hasTeam ? "участник команды" : "участник без команды");
      const desc = found.hasTeam
        ? (isCaptain ? `как капитан команды «${found.teamName || "—"}»` : `в команде «${found.teamName || "—"}»`)
        : "как участник без команды";
      return {
        registered: true,
        details: {
          name: found.name || "",
          phone: found.phone || phone,
          role,
          teamName: found.teamName || "",
          teamNumber: found.teamNumber || null,
          description: desc,
        },
      };
    }
  }

  // 2. Проверяем в captains.json
  const captains = readJsonSafe(CAPTAINS_FILE);
  if (Array.isArray(captains)) {
    for (const cap of captains) {
      if (cap.active !== false && normalizePhone(cap.phone) === norm) {
        // Если это только что созданный капитан в рамках текущей регистрации
        if (options.ignoreRecentCaptainsMs && cap.createdAt) {
          const age = Date.now() - new Date(cap.createdAt).getTime();
          if (age < options.ignoreRecentCaptainsMs) {
            continue;
          }
        }
        return {
          registered: true,
          details: {
            name: cap.name || "",
            phone: cap.phone || phone,
            role: "капитан команды",
            teamName: cap.teamName || "",
            description: `как капитан команды ${cap.teamName ? `«${cap.teamName}»` : (cap.name ? `«${cap.name}»` : "")}`,
          },
        };
      }
      if (Array.isArray(cap.participants)) {
        const member = cap.participants.find((p) => normalizePhone(p.phone) === norm);
        if (member) {
          if (options.ignoreRecentSubscribedMs && member.subscribedAt) {
            const age = Date.now() - new Date(member.subscribedAt).getTime();
            if (age < options.ignoreRecentSubscribedMs) {
              continue;
            }
          }
          return {
            registered: true,
            details: {
              name: member.name || "",
              phone: member.phone || phone,
              role: "участник команды",
              teamName: cap.teamName || cap.name || "",
              description: `в команде капитана ${cap.name || cap.phone}`,
            },
          };
        }
      }
    }
  }

  // 3. Проверяем в solo_users.json
  const soloUsers = readJsonSafe(SOLO_FILE);
  if (Array.isArray(soloUsers)) {
    const solo = soloUsers.find((u) => normalizePhone(u.phone) === norm);
    if (solo) {
      if (options.ignoreRecentSoloMs && solo.registeredAt) {
        const age = Date.now() - new Date(solo.registeredAt).getTime();
        if (age < options.ignoreRecentSoloMs) {
          // Игнорируем только что созданного solo
        } else {
          return {
            registered: true,
            details: {
              name: solo.name || "",
              phone: solo.phone || phone,
              role: "участник без команды",
              description: "как участник без команды",
            },
          };
        }
      } else {
        return {
          registered: true,
          details: {
            name: solo.name || "",
            phone: solo.phone || phone,
            role: "участник без команды",
            description: "как участник без команды",
          },
        };
      }
    }
  }

  return { registered: false };
}
