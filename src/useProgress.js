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
 * Хук прогресса квеста. Хранит решённые точки и факт завершения в localStorage
 * (в браузере участника), поэтому прогресс не теряется между сканированиями.
 */
export function useProgress() {
  const [state, setState] = useState(read);

  const isSolved = useCallback((id) => !!state["s" + id], [state]);

  const solve = useCallback((id) => {
    setState((prev) => {
      const next = { ...prev, ["s" + id]: true };
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

  // Собранные буквы (в порядке точек). null для ещё не решённых.
  const letters = QUEST.stations.map((s) =>
    state["s" + s.id] ? s.letter : null
  );

  return {
    total,
    solvedCount,
    allSolved,
    finished,
    letters,
    isSolved,
    solve,
    finish,
    reset,
  };
}
