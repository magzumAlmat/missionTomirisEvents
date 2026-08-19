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

export const HAS_BACKEND = !!API_URL;
export const API_BASE = API_URL;
