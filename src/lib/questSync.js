import { setTeam, setTeamNumber, setName } from "./team.js";
import { setPhone } from "./phone.js";

const QUEST_ID_KEY = "event_tomiris_quest_id";
const PROGRESS_KEY = "event_tomiris_progress_v1";
const CACHE_KEY = "event_tomiris_station_cache";

/**
 * Очистить только прогресс по точкам и команду.
 */
export function clearLocalQuestProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(CACHE_KEY);
    setTeam("");
    setTeamNumber("");
  } catch (e) {
    /* ignore */
  }
  window.dispatchEvent(new Event("quest_reset"));
}

/**
 * Полный сброс авторизации и данных:
 * Вызывается при удалении квеста, удалении капитана или удалении игрока админом.
 */
export function clearAllLocalUserData() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(CACHE_KEY);
    setTeam("");
    setTeamNumber("");
    setName("");
    setPhone("");
  } catch (e) {
    /* ignore */
  }
  window.dispatchEvent(new Event("quest_reset"));
  window.dispatchEvent(new Event("user_reset"));
}

/**
 * Синхронизирует questId от сервера.
 * Если на сервере questId изменился (квест/капитаны/участники удалены админом),
 * сбрасывает ВСЮ авторизацию и локальные данные пользователя.
 */
export function syncQuestEpoch(serverQuestId) {
  if (!serverQuestId) return false;
  try {
    const local = localStorage.getItem(QUEST_ID_KEY);
    if (!local) {
      localStorage.setItem(QUEST_ID_KEY, String(serverQuestId));
      return false;
    }
    if (String(local) !== String(serverQuestId)) {
      clearAllLocalUserData();
      localStorage.setItem(QUEST_ID_KEY, String(serverQuestId));
      return true;
    }
  } catch (e) {
    /* ignore */
  }
  return false;
}
