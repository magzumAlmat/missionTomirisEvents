/**
 * СЕКРЕТЫ КВЕСТА — ответы, буквы и подсказки к следующим точкам.
 *
 * Почему отдельно от src/questConfig.js: всё, что лежит в src/, попадает в
 * бандл сайта, и любой участник может открыть исходники и узнать ответы
 * на все загадки. Этот файл читает ТОЛЬКО сервер: участник присылает ответ,
 * сервер сверяет и отдаёт букву.
 *
 * Ключ станции — её code из src/questConfig.js (он же в QR-ссылке).
 */

export const STATION_SECRETS = {
  x9f2a8: {
    id: 1,
    answers: ["12", "двенадцать", "xii"],
    letter: "П",
    nextHint: "Двигайся к воде — там, где горожане бросают монетки на удачу.",
  },
  v4k8n1: {
    id: 2,
    answers: ["6", "шесть"],
    letter: "Р",
    nextHint: "Ищи самое старое дерево в парке за фонтаном.",
  },
  b2r9p5: {
    id: 3,
    answers: ["19", "девятнадцать"],
    letter: "И",
    nextHint: "Перейди реку по каменному мосту.",
  },
  z9m3k7: {
    id: 4,
    answers: ["3", "три"],
    letter: "З",
    nextHint: "На той стороне тебя ждёт рынок с яркими вывесками.",
  },
  h4p8w1: {
    id: 5,
    answers: ["красная", "красный", "красн"],
    letter: "2",
    nextHint: "Отыщи здание, полное книг и тишины.",
  },
  c3n9q2: {
    id: 6,
    answers: ["знание", "знания", "scientia"],
    letter: "0",
    nextHint: "Ищи фигуру из бронзы, что смотрит вдаль.",
  },
  f7m2x8: {
    id: 7,
    answers: ["правой", "права", "правая", "правой руке"],
    letter: "2",
    nextHint: "Последняя точка — самая высокая в старом городе. Смотри вверх.",
  },
  t5p9r1: {
    id: 8,
    answers: ["4", "четыре"],
    letter: "6",
    nextHint: "Это была последняя точка! Возвращайтесь к организаторам на Главную площадь.",
  },
};

/** Сообщение команде, взявшей все точки. Финального кода в квесте нет. */
export const ALL_DONE =
  "Все точки пройдены! Возвращайтесь на Главную площадь к организаторам — " +
  "время финиша уже записано. 🎉";

/** Сколько всего точек — считаем по секретам, чтобы не расходилось. */
export const TOTAL_STATIONS = Object.keys(STATION_SECRETS).length;

/** Найти секреты станции по коду из QR или по номеру точки. */
export function findStation(codeOrId) {
  const key = String(codeOrId || "");
  if (STATION_SECRETS[key]) return { code: key, ...STATION_SECRETS[key] };
  const byId = Object.entries(STATION_SECRETS).find(
    ([, s]) => String(s.id) === key
  );
  return byId ? { code: byId[0], ...byId[1] } : null;
}

/** Нормализация ответа: регистр, лишние пробелы и «ё/е» не важны. */
export function norm(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

/** Совпадает ли ответ участника с одним из допустимых вариантов. */
export function isCorrectAnswer(input, answers) {
  const v = norm(input);
  if (!v) return false;
  return (answers || []).some((a) => norm(a) === v);
}
