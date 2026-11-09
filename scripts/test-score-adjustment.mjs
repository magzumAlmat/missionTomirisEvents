import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourcePath = new URL("../server/store.js", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "tomiris-score-adjustment-"));

try {
  const isolatedStorePath = path.join(testDir, "store.mjs");
  fs.writeFileSync(isolatedStorePath, source, "utf8");
  const store = await import(pathToFileURL(isolatedStorePath).href);

  const team = store.findOrCreateTeam({
    name: "Проверка корректировки баллов",
    captainName: "Тест",
    captainPhone: "+77000000000",
    size: 2,
  });
  const key = store.progressKey({ teamNumber: team.number });

  store.adjustManualStationScore({
    key,
    teamNumber: team.number,
    teamName: team.name,
    stationId: 1,
    delta: 1,
  });
  let row = store.standings().find((item) => item.teamNumber === team.number);
  assert.equal(row.scores[1], 1, "ручной +1 сохраняется и виден в баллах локации");
  assert.equal(row.totalScore, 1, "общая сумма учитывает ручной +1");

  store.adjustManualStationScore({ key, teamNumber: team.number, stationId: 1, delta: 1 });
  store.adjustManualStationScore({ key, teamNumber: team.number, stationId: 1, delta: -1 });
  row = store.standings().find((item) => item.teamNumber === team.number);
  assert.equal(row.scores[1], 1, "два инкремента и один декремент дают +1");
  assert.equal(row.totalScore, 1, "итог пересчитан после декремента");

  store.markArrival({
    key,
    teamNumber: team.number,
    teamName: team.name,
    stationId: 1,
  });
  row = store.standings().find((item) => item.teamNumber === team.number);
  assert.equal(row.scores[1], 11, "ручная корректировка складывается с базовыми баллами");
  assert.equal(row.totalScore, 11, "общий итог включает базовые и ручные баллы");

  store.adjustManualStationScore({ key, teamNumber: team.number, stationId: 1, delta: -1 });
  row = store.standings().find((item) => item.teamNumber === team.number);
  assert.equal(row.scores[1], 10, "декремент уменьшает базовый счёт ровно на один балл");
  assert.equal(row.totalScore, 10, "общий итог уменьшается вместе с баллами локации");

  // Проверка ухода в отрицательные баллы
  for (let i = 0; i < 12; i++) {
    store.adjustManualStationScore({ key, teamNumber: team.number, stationId: 1, delta: -1 });
  }
  row = store.standings().find((item) => item.teamNumber === team.number);
  assert.equal(row.scores[1], -2, "баллы могут становиться отрицательными");
  assert.equal(row.totalScore, -2, "общий итог пересчитывается с учётом отрицательных баллов");

  // Проверка увеличения из отрицательных баллов
  store.adjustManualStationScore({ key, teamNumber: team.number, stationId: 1, delta: 1 });
  row = store.standings().find((item) => item.teamNumber === team.number);
  assert.equal(row.scores[1], -1, "инкремент из отрицательных баллов работает корректно");
  assert.equal(row.totalScore, -1, "общий итог также возрастает");

  console.log("✅ Ручные корректировки сохраняются и пересчитывают общий итог");
} finally {
  fs.rmSync(testDir, { recursive: true, force: true });
}
