import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import {
  notify,
  solveStation,
  markSolved,
  fetchProgress,
  fetchTeams,
  HAS_BACKEND,
} from "../lib/api.js";
import { getTeamNumber, getTeam } from "../lib/team.js";
import { getPhone, isValidPhone } from "../lib/phone.js";
import { useGameStatus } from "../useGameStatus.js";
import CountdownTimer from "../components/CountdownTimer.jsx";
import { syncQuestEpoch, clearLocalQuestProgress, clearAllLocalUserData } from "../lib/questSync.js";

/** Небольшая обёртка, чтобы все окна выглядели одинаково. */
function Modal({ children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const MIRROR_BOT = "https://t.me/thisMirrorbot";

const phoneDigits = (v) => String(v || "").replace(/\D/g, "").slice(-10);

/** Кэш промежуточных состояний точки в localStorage — переживает обновление страницы. */
const STATION_CACHE_KEY = "event_tomiris_station_cache";

function readStationCache(stationId) {
  try {
    const all = JSON.parse(localStorage.getItem(STATION_CACHE_KEY) || "{}");
    return all[String(stationId)] || {};
  } catch { return {}; }
}

function writeStationCache(stationId, patch) {
  try {
    const all = JSON.parse(localStorage.getItem(STATION_CACHE_KEY) || "{}");
    all[String(stationId)] = { ...(all[String(stationId)] || {}), ...patch };
    localStorage.setItem(STATION_CACHE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export default function Station() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isGameStarted, timeLeft, displayDate, displayTime, place } = useGameStatus();

  const station = QUEST.stations.find((s) => s.code === id || String(s.id) === id);
  const stationId = station ? station.id : parseInt(id, 10);
  const isStartStation = station?.id === 0;
  const isFinalStation = station ? station.isFinal || station.id === QUEST.stations.length - 1 : false;

  const { isSolved, solve, applyServer } = useProgress();

  const phone = getPhone();
  const teamNo = getTeamNumber();
  const phoneOk = isValidPhone(phone);
  const hasIdentity = phoneOk || Boolean(teamNo);

  // Состояние сценария. Кэшируется в localStorage и восстанавливается с сервера.
  const cached = station ? readStationCache(station.id) : {};
  const [riddleSolved, setRiddleSolvedRaw] = useState(!!cached.riddleSolved);
  const [arrived, setArrivedRaw] = useState(!!cached.arrived);
  const [addressRevealed, setAddressRevealedRaw] = useState(!!cached.addressRevealed);
  const [taskComplete, setTaskCompleteRaw] = useState(() => {
    if (cached.taskComplete) return true;
    return station ? isSolved(station.id) : false;
  });

  const [hint, setHint] = useState(cached.hint || "");
  const [hintReceived, setHintReceivedRaw] = useState(!!cached.hintReceived);
  const [hintLoading, setHintLoading] = useState(false);

  // Обёртки для сеттеров — пишут в localStorage при изменении.
  const curStationId = station?.id;
  const setRiddleSolved = useCallback((v) => { setRiddleSolvedRaw(v); if (curStationId != null) writeStationCache(curStationId, { riddleSolved: v }); }, [curStationId]);
  const setArrived = useCallback((v) => { setArrivedRaw(v); if (curStationId != null) writeStationCache(curStationId, { arrived: v }); }, [curStationId]);
  const setAddressRevealed = useCallback((v) => { setAddressRevealedRaw(v); if (curStationId != null) writeStationCache(curStationId, { addressRevealed: v }); }, [curStationId]);
  const setTaskComplete = useCallback((v) => { setTaskCompleteRaw(v); if (curStationId != null) writeStationCache(curStationId, { taskComplete: v }); }, [curStationId]);
  const setHintReceived = useCallback((v) => { setHintReceivedRaw(v); if (curStationId != null) writeStationCache(curStationId, { hintReceived: v }); }, [curStationId]);

  const [solvedSending, setSolvedSending] = useState(false);
  const [arriveSending, setArriveSending] = useState(false);
  const [addressSending, setAddressSending] = useState(false);
  const [completeSending, setCompleteSending] = useState(false);
  const [err, setErr] = useState("");

  const [showHintConfirm, setShowHintConfirm] = useState(false);
  const [showAddressConfirm, setShowAddressConfirm] = useState(false);
  const [showArriveModal, setShowArriveModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Защита от двойного авто-прибытия на стартовой точке (React StrictMode).
  const autoArriveRef = useRef(false);

  // Действия на точках разрешены только капитану команды.
  const [captainStatus, setCaptainStatus] = useState("checking");

  // При переходе на другую точку — восстанавливаем из кэша.
  useEffect(() => {
    const c = station ? readStationCache(station.id) : {};
    setRiddleSolvedRaw(!!c.riddleSolved);
    setArrivedRaw(!!c.arrived);
    setAddressRevealedRaw(!!c.addressRevealed);
    setTaskCompleteRaw(() => {
      if (c.taskComplete) return true;
      return station ? isSolved(station.id) : false;
    });
    setHint(c.hint || "");
    setHintReceivedRaw(!!c.hintReceived);
    setHintLoading(false);
    setSolvedSending(false);
    setArriveSending(false);
    setAddressSending(false);
    setCompleteSending(false);
    setErr("");
    setShowHintConfirm(false);
    setShowAddressConfirm(false);
    setShowArriveModal(false);
    setShowCompleteModal(false);
    setShowHistoryModal(false);
    autoArriveRef.current = false;
    setCaptainStatus("checking");
    // isSolved намеренно не в зависимостях: иначе сброс затирал бы только что
    // выполненные действия при каждом обновлении локального прогресса.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, station]);

  // Определяем, капитан ли это команды. Пока проверка не завершена, точку
  // не показываем — иначе участник увидит загадку и кнопки действий.
  useEffect(() => {
    if (!station || !HAS_BACKEND) {
      setCaptainStatus("ok");
      return;
    }
    const savedTeam = getTeamNumber();
    const savedPhone = getPhone();
    if (!savedTeam) {
      setCaptainStatus("ok"); // соло или старая запись без команды
      return;
    }
    if (!savedPhone) {
      setCaptainStatus("not-captain");
      return;
    }

    let cancelled = false;
    fetchTeams()
      .then((data) => {
        if (cancelled) return;
        const team = (data.teams || []).find(
          (t) => String(t.teamNumber) === String(savedTeam)
        );
        if (!team || !team.captainPhone) {
          setCaptainStatus("ok");
          return;
        }
        setCaptainStatus(
          phoneDigits(team.captainPhone) === phoneDigits(savedPhone)
            ? "ok"
            : "not-captain"
        );
      })
      .catch(() => {
        // Не блокируем квест из-за сетевой ошибки — сервер всё равно проверит.
        if (!cancelled) setCaptainStatus("ok");
      });

    return () => {
      cancelled = true;
    };
  }, [stationId, station]);

  // Восстанавливаем прогресс с сервера: перезагрузка страницы, новое устройство,
  // возврат на уже пройденную точку.
  useEffect(() => {
    if (!station || !HAS_BACKEND) return;
    const savedTeam = getTeamNumber();
    const savedPhone = getPhone();
    if (!savedTeam && !savedPhone) return;

    let cancelled = false;
    fetchProgress({ teamNumber: savedTeam, phone: savedPhone })
      .then((data) => {
        if (cancelled) return;
        // Если квест был сброшен админом — очистить и уйти на главную.
        if (data.questId) {
          const wasReset = syncQuestEpoch(data.questId);
          if (wasReset) {
            navigate("/register");
            return;
          }
        }
        if (data.registered === false) {
          clearAllLocalUserData();
          navigate("/register");
          return;
        }
        if (data.reset || (!data.teamNumber && (!data.stations || Object.keys(data.stations).length === 0))) {
          clearLocalQuestProgress();
          navigate("/");
          return;
        }
        // Синхронизируем локальный прогресс — от него зависит «Продолжить квест».
        applyServer(data.stations, data.finishedAt);
        if (data.stations) {
          for (const stId of Object.keys(data.stations)) {
            writeStationCache(stId, { taskComplete: true, arrived: true, riddleSolved: true });
          }
        }

        const sid = String(station.id);
        if (data.solved?.[sid]) setRiddleSolved(true);
        if (data.arrivals?.[sid]) setArrived(true);
        if (data.notGuessed?.[sid]) setAddressRevealed(true);
        if (data.stations?.[sid]) setTaskComplete(true);
        if (data.hints?.[sid]) {
          setHintReceived(true);
          setHint(station.hint || "Подсказка получена ранее.");
        }

        // Стартовая точка: автоматически фиксируем прибытие после старта игры.
        if (
          station.id === 0 &&
          captainStatus === "ok" &&
          !data.arrivals?.[sid] &&
          isGameStarted &&
          (isValidPhone(savedPhone) || Boolean(savedTeam)) &&
          !autoArriveRef.current
        ) {
          autoArriveRef.current = true;
          notify("arrived", {
            stationId: 0,
            stationName: station.name,
            phone: savedPhone.trim(),
            teamNumber: savedTeam || null,
            team: [getTeam(), savedTeam ? `№${savedTeam}` : ""].filter(Boolean).join(" "),
          })
            .then(() => {
              if (!cancelled) setArrived(true);
            })
            .catch(() => {
              autoArriveRef.current = false;
            });
        }
      })
      .catch(() => {
        /* нет связи — остаёмся на локальном прогрессе */
      });

    return () => {
      cancelled = true;
    };
  }, [stationId, station, isGameStarted, applyServer, captainStatus]);

  function identityError() {
    if (!hasIdentity) {
      setErr("Укажите номер команды или телефон — иначе прогресс не сохранится.");
      return true;
    }
    return false;
  }

  function teamPayload() {
    return {
      phone: phone.trim(),
      teamNumber: teamNo || null,
      team: [getTeam(), teamNo ? `№${teamNo}` : ""].filter(Boolean).join(" "),
    };
  }

  /** Шаг 1 Пути А: капитан разгадал загадку, ещё не доехал. */
  async function onSolvedRiddle() {
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён (VITE_API_URL). Запусти `npm run server`.");
      return;
    }
    if (identityError()) return;

    setSolvedSending(true);
    try {
      await markSolved({
        stationCode: station.code || station.id,
        phone: phone.trim(),
        teamNumber: teamNo || null,
      });
      setRiddleSolved(true);
    } catch (e) {
      setErr(e.message || "Не удалось отметить разгадку.");
    } finally {
      setSolvedSending(false);
    }
  }

  /** Подсказка: сначала подтверждение штрафа, затем уведомление и текст. */
  async function submitHint() {
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён (VITE_API_URL). Запусти `npm run server`.");
      return;
    }
    if (identityError()) return;

    setHintLoading(true);
    try {
      await notify("hint_used", {
        stationId: station.id,
        stationName: station.name,
        ...teamPayload(),
      });
      setHint(station.hint || "Подсказка отсутствует.");
      if (curStationId != null) writeStationCache(curStationId, { hint: station.hint || "Подсказка отсутствует." });
      setHintReceived(true);
    } catch (e) {
      setErr(e.message || "Не удалось получить подсказку.");
    } finally {
      setHintLoading(false);
    }
  }

  /** Путь Б: открыть адрес и сразу получить задание (без подтверждения прибытия). */
  async function submitAddress() {
    setShowAddressConfirm(false);
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён (VITE_API_URL). Запусти `npm run server`.");
      return;
    }
    if (identityError()) return;

    setAddressSending(true);
    try {
      await notify("not_guessed", {
        stationId: station.id,
        stationName: station.name,
        ...teamPayload(),
      });
      setAddressRevealed(true);
    } catch (e) {
      setErr(e.message || "Не удалось открыть адрес.");
    } finally {
      setAddressSending(false);
    }
  }

  /** Подтверждение прибытия (Путь А). */
  async function submitArrived() {
    setShowArriveModal(false);
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён (VITE_API_URL). Запусти `npm run server`.");
      return;
    }
    if (identityError()) return;

    setArriveSending(true);
    try {
      await notify("arrived", {
        stationId: station.id,
        stationName: station.name,
        ...teamPayload(),
      });
      setArrived(true);
    } catch (e) {
      setErr(e.message || "Не удалось подтвердить прибытие.");
    } finally {
      setArriveSending(false);
    }
  }

  /** Завершение задания и переход к следующей локации. */
  async function submitComplete() {
    setShowCompleteModal(false);
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён (VITE_API_URL). Запусти `npm run server`.");
      return;
    }
    if (identityError()) return;

    setCompleteSending(true);
    try {
      await solveStation({
        stationCode: station.code || station.id,
        phone: phone.trim(),
        teamNumber: teamNo || null,
      });
      setTaskComplete(true);
      setArrived(true); // в Пути Б сервер фиксирует прибытие в этот момент
      solve(station.id);
      if (curStationId != null) {
        writeStationCache(curStationId, { taskComplete: true, arrived: true, riddleSolved: true });
      }

      const hasHistory = Boolean(station.history && station.history.trim());

      // Стартовая точка остаётся как раньше: после пазла капитан сам жмёт
      // «Перейти к следующей точке», без авто-перехода.
      if (station.id === 0) return;

      if (hasHistory) {
        setShowHistoryModal(true);
      } else {
        goNextStation();
      }
    } catch (e) {
      setErr(e.message || "Не удалось завершить задание.");
    } finally {
      setCompleteSending(false);
    }
  }

  function goNextStation() {
    const next = QUEST.stations.find((s) => s.id === station.id + 1);
    if (next) navigate(`/s/${next.code || next.id}`);
  }

  function closeHistoryAndContinue() {
    setShowHistoryModal(false);
    goNextStation();
  }

  function openHint() {
    setErr("");
    setShowHintConfirm(true);
  }

  // Пока страница не готова, хуки выше уже вызваны — порядок хуков не меняется.
  if (!station) {
    return (
      <div className="card">
        <h2>Точка не найдена</h2>
        <p className="muted">Проверь код.</p>
        <button className="btn ghost" onClick={() => navigate("/profile")}>
          На главную
        </button>
      </div>
    );
  }

  // 🔒 Все станции закрыты до наступления времени старта квеста.
  if (!isGameStarted) {
    return (
      <div className="card">
        <div className="eyebrow" style={{ color: "#ffcc4d", display: "flex", alignItems: "center", gap: 6 }}>
          <span>🔒</span> ДОСТУП ЗАКРЫТ ДО СТАРТА ИГРЫ
        </div>
        <h2>{station.name}</h2>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>
          {isStartStation
            ? "Вы прибыли на стартовую позицию. Первое задание и точка 0 откроются автоматически в назначенное время старта игры:"
            : "Квест ещё не начался. Задания локаций откроются последовательно после старта игры в назначенное время:"}
        </p>

        <CountdownTimer
          timeLeft={timeLeft}
          displayDate={displayDate}
          displayTime={displayTime}
          place={place}
          title="ДО СТАРТА КВЕСТА ОСТАЛОСЬ"
        />

        <div style={{
          marginTop: 18,
          padding: 14,
          background: "rgba(255, 255, 255, 0.04)",
          borderRadius: 12,
          border: "1px solid rgba(255, 255, 255, 0.08)",
          fontSize: 13,
          lineHeight: 1.6,
          color: "#ccc",
        }}>
          💡 <b>Что делать сейчас?</b><br />
          Припаркуйте автомобиль на парковке стартовой локации, найдите свою команду и проверьте связь в Telegram. Как только таймер дойдёт до нуля, экран автоматически обновится и откроет задание!
        </div>

        <div className="btn-row" style={{ marginTop: 20 }}>
          <button className="btn" onClick={() => navigate("/profile")}>
            👤 Мой профиль и команда
          </button>
          <button className="btn ghost" onClick={() => navigate("/landing")}>
            ℹ️ О квесте
          </button>
        </div>
      </div>
    );
  }

  if (captainStatus === "checking") {
    return (
      <div className="card">
        <p className="center muted">Проверяем доступ к точке…</p>
      </div>
    );
  }

  if (captainStatus === "not-captain") {
    return (
      <div className="card">
        <div className="eyebrow">👑 Капитан команды</div>
        <h2>Действия на точке выполняет капитан</h2>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.55 }}>
          Вы вошли как участник команды. Разгадку, прибытие и завершение задания
          отмечает капитан со своего телефона.
        </p>
        <button className="btn" onClick={() => navigate("/profile")}>
          👤 Мой профиль и команда
        </button>
      </div>
    );
  }

  const riddleText = station.riddle || (
    station.task ? station.task.split("ЗАДАНИЕ")[0].replace(/^ЗАГАДКА\s*/i, "").trim() : ""
  );
  const taskVisible = Boolean((arrived || addressRevealed || taskComplete) && station.detailedTask);
  const canSolveRiddle = !isStartStation && !riddleSolved && !arrived && !addressRevealed && !taskComplete;
  const canArrive = !isStartStation && riddleSolved && !arrived && !addressRevealed && !taskComplete;
  const canComplete = taskVisible && !taskComplete;
  const hasHistory = Boolean(station.history && station.history.trim());

  return (
    <div className="card">
      {taskComplete && <span className="done-badge">✓ Точка пройдена</span>}
      {riddleSolved && !taskComplete && <span className="done-badge">✓ Локация разгадана</span>}

      <div className="eyebrow">
        Точка {station.id} из {QUEST.stations.length}
      </div>

      {/* Название локации открываем только после прибытия/адреса/завершения. */}
      {(isStartStation || arrived || addressRevealed || taskComplete) && (
        <h2 style={{ marginBottom: 12 }}>{station.name}</h2>
      )}

      {/* ЗАГАДКА */}
      {riddleText && !isStartStation && (
        <div className="task riddle-block" style={{ whiteSpace: "pre-wrap" }}>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span>🔮</span> ЗАГАДКА
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.6, fontWeight: 500 }}>{riddleText}</div>
        </div>
      )}

      {/* Путь Б: адрес открыт */}
      {addressRevealed && !taskComplete && (
        <div style={{ marginTop: 16 }}>
          <div className="modal-address">📍 {station.name}</div>
          <p className="muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
            Адрес открыт — езжайте на локацию для выполнения задания. Баллы за
            самостоятельное разгадывание этой локации не начисляются, баллы за
            задание сохраняются.
          </p>
        </div>
      )}

      {/* ЗАДАНИЕ */}
      {taskVisible && (
        <div className="task assignment-block" style={{ marginTop: 16, backgroundColor: "rgba(255, 255, 255, 0.05)", padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
          <div
            style={{ fontSize: 15, lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: station.detailedTask.replace(/\n/g, "<br/>") }}
          />
          <div style={{ marginTop: 16, fontSize: 14, color: "var(--accent)", fontWeight: "bold" }}>
            Воспользуйтесь телеграм ботом{" "}
            <a href={MIRROR_BOT} target="_blank" rel="noreferrer" style={{ color: "#fff", textDecoration: "underline" }}>
              {MIRROR_BOT.replace("https://", "")}
            </a>{" "}
            чтобы отправлять фото и видео Хранительнице.
          </div>
        </div>
      )}

      {!HAS_BACKEND && (
        <div className="feedback err">
          ⚠️ Бэкенд не подключён. Задайте VITE_API_URL и запустите сервер.
        </div>
      )}

      {!hasIdentity && (
        <div className="feedback err">
          ⚠️ Вы не зарегистрированы. Пожалуйста, зарегистрируйтесь.
          <br />
          <a href="/#/register" style={{ color: "var(--accent)", textDecoration: "underline" }}>
            Перейти к регистрации
          </a>
        </div>
      )}

      {err && <div className="feedback err">{err}</div>}

      <div className="actions">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Стартовая точка: авто-прибытие, только ожидание и задание. */}
          {isStartStation && !arrived && !taskComplete && (
            <p className="muted center" style={{ fontSize: 14, margin: "8px 0" }}>
              Фиксируем прибытие на стартовую точку…
            </p>
          )}

          {/* Фаза 1: загадка */}
          {canSolveRiddle && (
            <>
              <button
                className="btn"
                onClick={onSolvedRiddle}
                disabled={solvedSending}
              >
                {solvedSending ? "Отмечаем…" : "🔓 Я разгадал(а) локацию"}
              </button>

              <button
                className="btn ghost"
                onClick={openHint}
                disabled={hintLoading}
              >
                {hintLoading
                  ? "Загружаем…"
                  : hintReceived
                    ? "💡 Посмотреть подсказку"
                    : "💡 Получить подсказку к локации"}
              </button>

              <button
                className="btn ghost"
                onClick={() => setShowAddressConfirm(true)}
                disabled={addressSending}
                style={{ borderColor: "#ff6b6b", color: "#ff6b6b" }}
              >
                {addressSending
                  ? "Открываем…"
                  : "❌ Я не разгадал(а) локацию — показать адрес"}
              </button>
            </>
          )}

          {/* Фаза 2: загадка разгадана, но капитан ещё не доехал */}
          {canArrive && (
            <>
              <div style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: "rgba(76, 217, 100, 0.1)",
                border: "1px solid rgba(76, 217, 100, 0.35)",
                color: "#b8f7c4",
                fontSize: 14,
                lineHeight: 1.5,
              }}>
                ✅ Локация разгадана. Теперь отправляйтесь на место, сделайте селфи
                на фоне локации и подтвердите прибытие.
              </div>
              <button
                className="btn arrive"
                onClick={() => setShowArriveModal(true)}
                disabled={arriveSending}
              >
                {arriveSending ? "Отправляем…" : "📍 Подтвердить прибытие"}
              </button>
            </>
          )}

          {/* Фаза 3: задание открыто — завершение */}
          {canComplete && (
            <button
              className="btn green"
              onClick={() => setShowCompleteModal(true)}
              disabled={completeSending}
              style={{ marginTop: 4 }}
            >
              {completeSending
                ? "Отмечаем…"
                : isFinalStation
                  ? "✅ Завершить задание и финишировать"
                  : "✅ Завершить задание и открыть следующую локацию"}
            </button>
          )}

          {/* Фаза 4: точка пройдена */}
          {taskComplete && !isFinalStation && (
            <>
              {hasHistory && (
                <button
                  className="btn ghost"
                  onClick={() => setShowHistoryModal(true)}
                >
                  📖 История места
                </button>
              )}
              <button className="btn green" onClick={goNextStation}>
                🚀 Перейти к следующей точке
              </button>
            </>
          )}
        </div>
      </div>

      {/* ФИНАЛ */}
      {taskComplete && isFinalStation && (
        <div className="finale-screen">
          <div className="finale-emoji">🏆</div>
          <h2 className="finale-title">Миссия выполнена!</h2>
          <p className="finale-subtitle">
            Команда <strong>{getTeam() || `№${teamNo}` || ""}</strong> прошла все точки квеста
          </p>
          <div className="finale-tagline">❤️ Алматы — моя первая любовь!</div>
          <p className="muted" style={{ fontSize: 14, marginTop: 12, textAlign: "center" }}>
            Организаторы уже получили уведомление. Ждите объявления победителей!
          </p>
          {hasHistory && (
            <button
              className="btn ghost"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => setShowHistoryModal(true)}
            >
              📖 История места
            </button>
          )}
          <button
            className="btn green mt"
            style={{ width: "100%", marginTop: 24 }}
            onClick={() => navigate("/profile")}
          >
            🏠 На главную
          </button>
        </div>
      )}

      {/* ---- Модалки ---- */}

      {showHintConfirm && (
        <Modal onClose={() => !hintLoading && setShowHintConfirm(false)}>
          <h3>💡 Подсказка к локации</h3>
          {hintReceived ? (
            <>
              <div className="modal-hint">{hint || "Подсказка получена ранее."}</div>
              <div className="modal-actions">
                <button className="btn ghost" onClick={() => setShowHintConfirm(false)}>
                  Закрыть
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Использование подсказки уменьшит количество баллов за эту локацию
                на <b>3 балла</b>.
              </p>
              <p>Вы уверены?</p>
              <div className="modal-actions">
                <button className="btn green" onClick={submitHint} disabled={hintLoading}>
                  {hintLoading ? "Отправляем…" : "Да, получить"}
                </button>
                <button
                  className="btn ghost"
                  onClick={() => setShowHintConfirm(false)}
                  disabled={hintLoading}
                >
                  Нет
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {showAddressConfirm && (
        <Modal onClose={() => !addressSending && setShowAddressConfirm(false)}>
          <h3>Показать адрес локации?</h3>
          <p>
            Если вы откроете адрес, баллы за самостоятельное разгадывание этой
            локации начислены не будут. Баллы за выполнение задания сохраняются.
          </p>
          <div className="modal-warning">
            Вы уверены? Открыть адрес и получить задание?
          </div>
          <div className="modal-actions">
            <button className="btn green" onClick={submitAddress} disabled={addressSending}>
              {addressSending ? "Открываем…" : "Да, показать адрес"}
            </button>
            <button
              className="btn ghost"
              onClick={() => setShowAddressConfirm(false)}
              disabled={addressSending}
            >
              Нет, буду разгадывать
            </button>
          </div>
        </Modal>
      )}

      {showArriveModal && (
        <Modal onClose={() => !arriveSending && setShowArriveModal(false)}>
          <h3>Подтверждение прибытия</h3>
          <p>
            Перед нажатием отправьте селфи капитана на фоне локации в Telegram-бот{" "}
            <a href={MIRROR_BOT} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>
              Mirror Bot
            </a>
            . Иначе баллы не будут засчитаны.
          </p>
          <div className="modal-warning">📸 Фото проверяется организатором вручную.</div>
          <div className="modal-actions">
            <button className="btn green" onClick={submitArrived} disabled={arriveSending}>
              {arriveSending ? "Отправляем…" : "Я отправил(а), подтвердить"}
            </button>
            <button
              className="btn ghost"
              onClick={() => setShowArriveModal(false)}
              disabled={arriveSending}
            >
              Отмена
            </button>
          </div>
        </Modal>
      )}

      {showCompleteModal && (
        <Modal onClose={() => !completeSending && setShowCompleteModal(false)}>
          <h3>{isStartStation ? "Завершить стартовое задание?" : "Завершить задание?"}</h3>
          {isStartStation ? (
            <p>
              Подтвердите, что пазл собран и показан Хранительнице. После этого
              откроется следующая точка.
            </p>
          ) : (
            <>
              <p>
                Вы уверены? Перед завершением задания отправьте фото или
                видеоматериалы боту в Telegram-бот{" "}
                <a href={MIRROR_BOT} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                  Mirror Bot
                </a>
                . Иначе баллы не будут засчитаны.
              </p>
              <div className="modal-warning">
                📸 Материалы проверяются организатором вручную.
              </div>
            </>
          )}
          <div className="modal-actions">
            <button className="btn green" onClick={submitComplete} disabled={completeSending}>
              {completeSending ? "Отмечаем…" : "Да, завершить"}
            </button>
            <button
              className="btn ghost"
              onClick={() => setShowCompleteModal(false)}
              disabled={completeSending}
            >
              Нет, вернуться
            </button>
          </div>
        </Modal>
      )}

      {showHistoryModal && hasHistory && (
        <Modal onClose={closeHistoryAndContinue}>
          <h3>📖 Историческая справка</h3>
          <div className="modal-history">{station.history}</div>
          <div className="modal-actions">
            <button className="btn green" onClick={closeHistoryAndContinue}>
              Понятно, продолжить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
