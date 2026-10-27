import { setTeam, setTeamNumber } from "./team.js";

const QUEST_ID_KEY = "event_tomiris_quest_id";
const PROGRESS_KEY = "event_tomiris_progress_v1";
const CACHE_KEY = "event_tomiris_station_cache";

/**
 * Очистить все локальные данные о прохождении квеста у пользователя:
 * - прогресс по точкам (useProgress / localStorage)
 * - кэш промежуточных состояний локаций (Station.jsx)
 * - номер команды
 * - название команды
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
 * Синхронизирует questId от сервера.
 * Если на сервере questId изменился (квест был удалён админом),
 * сбрасывает все локальные данные прохождения и возвращает true.
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
      clearLocalQuestProgress();
      localStorage.setItem(QUEST_ID_KEY, String(serverQuestId));
      return true;
    }
  } catch (e) {
    /* ignore */
  }
  return false;
}
