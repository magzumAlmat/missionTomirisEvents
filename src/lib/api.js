const API_URL = import.meta.env.VITE_API_URL || "";

/**
 * Отправить на бэкенд событие с точки (тот перешлёт в Telegram).
 * event: "arrived" | "solved"
 * payload: { stationId, stationName, phone, team? }
 */
export async function notify(event, { stationId, stationName, phone, team, teamNumber }) {
  if (!API_URL) {
    throw new Error(
      "Бэкенд не подключён: не задан VITE_API_URL. Перезапусти `npm run dev` после правки .env."
    );
  }
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, stationId, stationName, phone, team, teamNumber }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Не удалось отправить уведомление.");
  }
  return data;
}

/**
 * Регистрация нового участника.
 * payload: { name, phone, hasCar, hasTeam, teamName?, teamSize? }
 */
export async function registerParticipant({ name, phone, hasCar, hasTeam, teamName, teamSize }) {
  if (!API_URL) {
    throw new Error(
      "Бэкенд не подключён: не задан VITE_API_URL. Перезапусти `npm run server` после правки .env."
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
 * Отметить точку взятой (нажата кнопка «Задание выполнено»).
 * payload: { stationCode, phone, teamNumber }
 * ответ: { nextHint, solvedCount, allDone }
 */
export async function solveStation({ stationCode, phone, teamNumber }) {
  return post("/api/solve", { stationCode, phone, teamNumber });
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

/** Сводка по всем командам для админской доски (без телефонов). */
export async function fetchStandings() {
  if (!API_URL) throw new Error("Бэкенд не подключён (VITE_API_URL).");
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/standings`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Не удалось получить сводку.");
  }
  return data;
}

/* =====================================================================
   КАПИТАНЫ: API функции
   ===================================================================== */

/** Получить список всех капитанов с оставшимися слотами */
export async function fetchCaptains() {
  if (!API_URL) throw new Error("Бэкенд не подключён (VITE_API_URL).");
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/captains`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Не удалось получить список капитанов.");
  }
  return data;
}

/** Создать нового капитана */
export async function createCaptain({ name, phone, slots, hasCar }) {
  return post("/api/captains/create", { name, phone, slots, hasCar });
}

/** Подписаться на капитана */
export async function subscribeToCaptain({ captainId, name, phone, hasCar }) {
  return post("/api/subscribe-to-captain", { captainId, name, phone, hasCar });
}

/** Обновить количество слотов капитана (админ) */
export async function updateCaptainSlots({ captainId, slots }) {
  return post("/api/admin/update-slots", { captainId, slots });
}

/** Переместить пользователя между капитанами (админ) */
export async function moveUserBetweenCaptains({ fromCaptainId, toCaptainId, phone }) {
  return post("/api/admin/move-user", { fromCaptainId, toCaptainId, phone });
}

/** Отписать пользователя от капитана (админ) */
export async function unsubscribeFromCaptain({ captainId, phone }) {
  return post("/api/admin/unsubscribe", { captainId, phone });
}

/** Добавить одиночного пользователя */
export async function addSoloUser({ name, phone, hasCar }) {
  return post("/api/admin/add-solo", { name, phone, hasCar });
}

/** Получить сводку по капитанам (админ) */
export async function fetchCaptainsSummary() {
  if (!API_URL) throw new Error("Бэкенд не подключён (VITE_API_URL).");
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/captains/summary`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Не удалось получить сводку.");
  }
  return data;
}

/** Получить одиночных пользователей (админ) */
export async function fetchSoloUsers() {
  if (!API_URL) throw new Error("Бэкенд не подключён (VITE_API_URL).");
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/admin/solo-users`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Не удалось получить список.");
  }
  return data;
}

export const HAS_BACKEND = !!API_URL;
export const API_BASE = API_URL;