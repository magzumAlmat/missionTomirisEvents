const API_URL = import.meta.env.VITE_API_URL || "";

/**
 * Отправить на бэкенд событие с точки (тот перешлёт в Telegram).
 * event: "arrived" | "solved"
 */
export async function notify(event, { stationId, stationName, team }) {
  if (!API_URL) {
    throw new Error("VITE_API_URL не задан — бэкенд не подключён.");
  }
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, stationId, stationName, team }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Не удалось отправить уведомление.");
  }
  return data;
}

export const HAS_BACKEND = !!API_URL;
