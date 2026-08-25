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

/** Буква за точку. Раньше в состоянии лежало просто true — такие записи тоже читаем. */
function letterOf(value) {
  if (!value) return null;
  return typeof value === "object" ? value.letter || null : null;
}

/**
 * Хук прогресса квеста. Хранит разгаданные точки и полученные буквы в
 * localStorage (в браузере участника), чтобы прогресс не терялся между
 * сканированиями QR.
 *
 * Буквы приходят С СЕРВЕРА после проверки ответа — в бандле сайта их нет.
 * Тот же прогресс дублируется на сервере, поэтому его можно восстановить
 * по номеру команды на другом телефоне (см. applyServer).
 */
export function useProgress() {
  const [state, setState] = useState(read);

  const isSolved = useCallback((id) => !!state["s" + id], [state]);

  /** Отметить точку разгаданной и запомнить выданную сервером букву. */
  const solve = useCallback((id, letter) => {
    setState((prev) => {
      const next = {
        ...prev,
        ["s" + id]: {
          letter: letter || letterOf(prev["s" + id]),
          at: new Date().toISOString(),
        },
      };
      write(next);
      return next;
    });
  }, []);

  /** Принять прогресс, полученный с сервера (восстановление на новом устройстве). */
  const applyServer = useCallback((stations, finishedAt) => {
    setState((prev) => {
      const next = { ...prev };
      for (const [id, info] of Object.entries(stations || {})) {
        next["s" + id] = { letter: info.letter || null, at: info.at || null };
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

  // Собранные буквы (в порядке точек). null для ещё не решённых.
  const letters = QUEST.stations.map((s) => letterOf(state["s" + s.id]));

  /** Буква конкретной точки (для экрана точки после перезахода). */
  const letterFor = useCallback((id) => letterOf(state["s" + id]), [state]);

  return {
    total,
    solvedCount,
    allSolved,
    finished,
    letters,
    isSolved,
    letterFor,
    solve,
    applyServer,
    finish,
    reset,
  };
}
