import { useCallback, useState } from "react";
import { QUEST } from "./questConfig.js";

const STORE_KEY = "event_tomiris_progress_v1";

function read() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function write(obj) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(obj));
  } catch (e) {
    /* ignore */
  }
}

/**
 * Хук прогресса квеста. Хранит взятые точки в localStorage (в браузере
 * участника), чтобы прогресс не терялся между сканированиями QR.
 *
 * Тот же прогресс дублируется на сервере, поэтому его можно восстановить
 * по номеру команды на другом телефоне (см. applyServer).
 */
export function useProgress() {
  const [state, setState] = useState(read);

  const isSolved = useCallback((id) => !!state["s" + id], [state]);

  /** Отметить точку взятой. */
  const solve = useCallback((id) => {
    setState((prev) => {
      const next = { ...prev, ["s" + id]: { at: new Date().toISOString() } };
      write(next);
      return next;
    });
  }, []);

  /** Принять прогресс, полученный с сервера (восстановление на новом устройстве). */
  const applyServer = useCallback((stations, finishedAt) => {
    setState((prev) => {
      const next = { ...prev };
      for (const [id, info] of Object.entries(stations || {})) {
        next["s" + id] = { at: info.at || null };
      }
      if (finishedAt) next.finished = true;
      write(next);
      return next;
    });
  }, []);

  const finish = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, finished: true };
      write(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    write({});
    setState({});
  }, []);

  const total = QUEST.stations.length;
  const solvedCount = QUEST.stations.filter((s) => state["s" + s.id]).length;
  const allSolved = solvedCount === total;
  const finished = !!state.finished;

  return {
    total,
    solvedCount,
    allSolved,
    finished,
    isSolved,
    solve,
    applyServer,
    finish,
    reset,
  };
}
