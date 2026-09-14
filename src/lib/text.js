/** Нормализация ответа: регистр, лишние пробелы и «ё/е» не важны. */
export function norm(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

/** Проверить ответ против списка допустимых вариантов. */
export function isCorrect(input, answers) {
  const v = norm(input);
  if (!v) return false;
  return (answers || []).some((a) => norm(a) === v);
}
