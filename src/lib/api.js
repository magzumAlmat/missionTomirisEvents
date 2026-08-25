const API_URL = import.meta.env.VITE_API_URL || "";

/**
 * Отправить на бэкенд событие с точки (тот перешлёт в Telegram).
 * event: "arrived" | "solved"
 * payload: { stationId, stationName, phone, team? }
 */
export async function notify(event, { stationId, stationName, phone, team }) {
  if (!API_URL) {
    throw new Error(
      "Бэкенд не подключён: не задан VITE_API_URL. Перезапусти `npm run dev` после правки .env."
    );
  }
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, stationId, stationName, phone, team }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Не удалось отправить уведомление.");
  }
  return data;
}

/**
 * Регистрация нового участника.
 * payload: { name, phone, hasCar: boolean, hasTeam: boolean, teamName?, teamSize? }
 */
export async function registerParticipant({ name, phone, hasCar, hasTeam, teamName, teamSize }) {
  if (!API_URL) {
    throw new Error(
      "Бэкенд не подключён: не задан VITE_API_URL. Перезапусти `npm run dev` после правки .env."
    );
  }
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone, hasCar, hasTeam, teamName, teamSize }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Не удалось отправить заявку.");
  }
  return data;
}

/** Общий помощник: POST на бэкенд с понятной ошибкой. */
async function post(path, body) {
  if (!API_URL) {
    throw new Error(
      "Бэкенд не подключён: не задан VITE_API_URL. Перезапусти `npm run dev` после правки .env."
    );
  }
  const res = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Сервер не ответил. Проверьте связь.");
  }
  return data;
}

/**
 * Проверить ответ на точке. Ответы хранятся на сервере, поэтому подсмотреть
 * их в исходниках сайта нельзя. При верном ответе возвращается буква.
 * payload: { stationCode, answer, phone, teamNumber }
 * ответ: { correct, letter?, nextHint?, solvedCount? }
 */
export async function checkAnswer({ stationCode, answer, phone, teamNumber }) {
  return post("/api/answer", { stationCode, answer, phone, teamNumber });
}

/** Забрать прогресс с сервера — например, при смене телефона. */
export async function fetchProgress({ teamNumber, phone }) {
  if (!API_URL) throw new Error("Бэкенд не подключён (VITE_API_URL).");
  const qs = new URLSearchParams();
  if (teamNumber) qs.set("teamNumber", teamNumber);
  if (phone) qs.set("phone", phone);
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/progress?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Не удалось получить прогресс.");
  }
  return data;
}

export const HAS_BACKEND = !!API_URL;
export const API_BASE = API_URL;
