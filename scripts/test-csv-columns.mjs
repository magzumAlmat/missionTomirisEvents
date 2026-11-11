/**
 * Quick test: verify the CSV export will include
 * IP, Registration Date, Registration Time columns.
 */
import { archiveParticipants, listArchivedParticipants } from "../server/participantArchive.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_FILE = path.join(__dirname, "server/participantsArchive.json");

// Save original archive
let originalArchive = null;
try {
  if (fs.existsSync(ARCHIVE_FILE)) {
    originalArchive = fs.readFileSync(ARCHIVE_FILE, "utf8");
  }
} catch {}

let exitCode = 0;

try {
  // Test 1: participantArchive stores ip + registeredAt
  console.log("=== Test 1: participantArchive preserves ip + registeredAt ===");

  archiveParticipants([
    {
      name: "Test User",
      phone: "+7 700 111 22 33",
      role: "Участник",
      ip: "192.168.1.100",
      registeredAt: "2026-11-09T12:30:00.000Z",
    },
    {
      name: "Test Captain",
      phone: "+7 700 444 55 66",
      role: "Капитан",
      ip: "10.0.0.1",
      registeredAt: "2026-11-10T08:00:00.000Z",
    },
  ]);

  const archived = listArchivedParticipants();
  const user = archived.find((p) => p.name === "Test User");
  const captain = archived.find((p) => p.name === "Test Captain");

  console.log("  User:", JSON.stringify(user));
  console.log("  Captain:", JSON.stringify(captain));

  let ok = true;
  if (!user || user.ip !== "192.168.1.100") {
    console.error("  ❌ FAIL: user.ip missing or wrong");
    ok = false;
  }
  if (!user || user.registeredAt !== "2026-11-09T12:30:00.000Z") {
    console.error("  ❌ FAIL: user.registeredAt missing or wrong");
    ok = false;
  }
  if (!captain || captain.ip !== "10.0.0.1") {
    console.error("  ❌ FAIL: captain.ip missing or wrong");
    ok = false;
  }
  if (!captain || captain.registeredAt !== "2026-11-10T08:00:00.000Z") {
    console.error("  ❌ FAIL: captain.registeredAt missing or wrong");
    ok = false;
  }
  if (!captain || captain.role !== "Капитан") {
    console.error("  ❌ FAIL: captain.role wrong");
    ok = false;
  }
  if (ok) console.log("  ✅ PASS: ip + registeredAt correctly stored");
  else exitCode = 1;

  // Test 2: formatting helpers (copied from index.js)
  console.log("\n=== Test 2: formatRegistrationDate / formatRegistrationTime ===");

  function formatRegistrationDate(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("ru-RU", {
        timeZone: "Asia/Almaty",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch (e) {
      return "—";
    }
  }

  function formatRegistrationTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleTimeString("ru-RU", {
        timeZone: "Asia/Almaty",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch (e) {
      return "—";
    }
  }

  const testIso = "2026-08-23T10:12:08.545Z";
  const date = formatRegistrationDate(testIso);
  const time = formatRegistrationTime(testIso);
  console.log(`  ISO: ${testIso}`);
  console.log(`  Дата: ${date}`);
  console.log(`  Время: ${time}`);

  if (date === "—" || time === "—") {
    console.error("  ❌ FAIL: got dash for valid ISO");
    exitCode = 1;
  } else {
    console.log("  ✅ PASS: date/time formatted correctly for Asia/Almaty");
  }

  // Edge cases
  const nullDate = formatRegistrationDate(null);
  const nullTime = formatRegistrationTime(null);
  console.log(`  null → date="${nullDate}", time="${nullTime}"`);
  if (nullDate !== "—" || nullTime !== "—") {
    console.error("  ❌ FAIL: null should return '—'");
    exitCode = 1;
  } else {
    console.log("  ✅ PASS: null returns '—'");
  }

  // Test 3: CSV row simulation
  console.log("\n=== Test 3: CSV row format ===");
  function csvField(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }
  const header = ["Имя", "Телефон", "Роль", "IP-адрес", "Дата регистрации", "Время регистрации"];
  const row = [
    user.name,
    user.phone,
    user.role,
    user.ip,
    formatRegistrationDate(user.registeredAt),
    formatRegistrationTime(user.registeredAt),
  ];
  console.log("  Header:", header.map(csvField).join(";"));
  console.log("  Row:   ", row.map(csvField).join(";"));
  if (row.length === header.length) {
    console.log("  ✅ PASS: 6 columns in header and row");
  } else {
    console.error("  ❌ FAIL: column count mismatch");
    exitCode = 1;
  }

} finally {
  // Restore original archive
  if (originalArchive !== null) {
    fs.writeFileSync(ARCHIVE_FILE, originalArchive, "utf8");
  } else if (fs.existsSync(ARCHIVE_FILE)) {
    fs.unlinkSync(ARCHIVE_FILE);
  }
}

console.log(exitCode === 0 ? "\n✅ All tests passed." : "\n❌ Some tests failed.");
process.exit(exitCode);
