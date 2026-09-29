const KEY = "event_tomiris_phone";

export function getPhone() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch (e) {
    return "";
  }
}

export function setPhone(v) {
  try {
    localStorage.setItem(KEY, v || "");
  } catch (e) {
    /* ignore */
  }
}

/** Простая проверка: есть «+» (необязательно) и минимум 10 цифр. */
export function isValidPhone(v) {
  const digits = (v || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}
