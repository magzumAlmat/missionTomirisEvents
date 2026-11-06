import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_FILE = path.join(__dirname, "participantsArchive.json");

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function readArchive() {
  try {
    if (fs.existsSync(ARCHIVE_FILE)) {
      const archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf8"));
      return Array.isArray(archive) ? archive : [];
    }
  } catch (error) {
    console.error("Не удалось прочитать архив участников:", error.message);
  }
  return [];
}

export function listArchivedParticipants() {
  return readArchive();
}

/** Добавляет новые телефоны в архив, не удаляя записи после удаления участника. */
export function archiveParticipants(participants) {
  const archiveByPhone = new Map();
  for (const participant of readArchive()) {
    const phoneKey = normalizePhone(participant.phone);
    if (phoneKey) archiveByPhone.set(phoneKey, participant);
  }

  for (const participant of participants || []) {
    const phoneKey = normalizePhone(participant.phone);
    if (!phoneKey) continue;

    const previous = archiveByPhone.get(phoneKey);
    archiveByPhone.set(phoneKey, {
      name: String(participant.name || previous?.name || "").trim(),
      phone: String(participant.phone || previous?.phone || "").trim(),
      role: participant.role === "Капитан" ? "Капитан" : "Участник",
    });
  }

  const archive = [...archiveByPhone.values()];
  try {
    const tempFile = `${ARCHIVE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(archive, null, 2), "utf8");
    fs.renameSync(tempFile, ARCHIVE_FILE);
    return archive;
  } catch (error) {
    console.error("Не удалось сохранить архив участников:", error.message);
    throw new Error("Не удалось сохранить архив участников.");
  }
}
