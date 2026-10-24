/**
 * Проверка правил начисления баллов без запуска сервера и без записи данных.
 * Запуск: npm run test:scoring
 */
import assert from "node:assert/strict";
import { arrivalPoints, computeStationScores } from "../server/store.js";

// 1) Места: 1-е — 10, 8-е и далее — 3.
assert.deepEqual(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(arrivalPoints),
  [10, 9, 8, 7, 6, 5, 4, 3, 3, 3]
);

// 2) Порядок прибытия и штраф за подсказку.
const progress = {
  t1: {
    arrivals: {
      1: { at: "2026-01-01T10:00:00.000Z" },
      2: { at: "2026-01-01T10:05:00.000Z" },
    },
    hints: { 2: { at: "2026-01-01T09:00:00.000Z" } },
  },
  t2: {
    arrivals: { 1: { at: "2026-01-01T10:01:00.000Z" } },
    hints: {},
  },
  t3: {
    arrivals: {
      1: { at: "2026-01-01T10:02:00.000Z" },
      2: { at: "2026-01-01T10:04:00.000Z" },
    },
    hints: {},
  },
};

const scores = computeStationScores(progress);
assert.equal(scores.t1[1], 10); // первая на точке 1
assert.equal(scores.t2[1], 9); // вторая
assert.equal(scores.t3[1], 8); // третья
assert.equal(scores.t3[2], 10); // первая на точке 2
assert.equal(scores.t1[2], 6); // вторая (9) минус подсказка (3)
assert.equal(scores.t1[3], 0); // не была на точке 3

// 3) Одинаковое время = одинаковое место и баллы.
const tie = computeStationScores({
  a: { arrivals: { 1: { at: "2026-01-01T10:00:00.000Z" } }, hints: {} },
  b: { arrivals: { 1: { at: "2026-01-01T10:00:00.000Z" } }, hints: {} },
});
assert.equal(tie.a[1], 10);
assert.equal(tie.b[1], 10);

// 4) Подсказка не уводит баллы в минус: 8-е место (3) − 3 = 0.
const last = computeStationScores({
  a: { arrivals: { 1: { at: "2026-01-01T10:00:00.000Z" } }, hints: {} },
  b: { arrivals: { 1: { at: "2026-01-01T10:01:00.000Z" } }, hints: {} },
  c: { arrivals: { 1: { at: "2026-01-01T10:02:00.000Z" } }, hints: {} },
  d: { arrivals: { 1: { at: "2026-01-01T10:03:00.000Z" } }, hints: {} },
  e: { arrivals: { 1: { at: "2026-01-01T10:04:00.000Z" } }, hints: {} },
  f: { arrivals: { 1: { at: "2026-01-01T10:05:00.000Z" } }, hints: {} },
  g: { arrivals: { 1: { at: "2026-01-01T10:06:00.000Z" } }, hints: {} },
  h: {
    arrivals: { 1: { at: "2026-01-01T10:07:00.000Z" } },
    hints: { 1: { at: "2026-01-01T10:06:30.000Z" } },
  },
});
assert.equal(last.a[1], 10);
assert.equal(last.g[1], 4); // 7-е место
assert.equal(last.h[1], 0); // 8-е место (3) минус подсказка (3)

console.log("✅ Баллы: все проверки прошли");
