import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import { notify, solveStation, fetchProgress, HAS_BACKEND } from "../lib/api.js";
import { getTeamNumber, setTeamNumber, getTeam } from "../lib/team.js";
import { getPhone, setPhone, isValidPhone } from "../lib/phone.js";

export default function Station() {
  const { id } = useParams();
  const navigate = useNavigate();
  const station = QUEST.stations.find((s) => s.code === id || String(s.id) === id);
  const stationId = station ? station.id : parseInt(id, 10);

  const { isSolved, solve } = useProgress();
  const already = station ? isSolved(station.id) : false;

  const [phone, setPhoneState] = useState(getPhone());
  const [teamNo, setTeamNoState] = useState(getTeamNumber());
  const [arrive, setArrive] = useState("idle"); // idle | sending | done | error
  const [check, setCheck] = useState(already ? "done" : "idle"); // idle | sending | done
  const [revealed, setRevealed] = useState(already);
  const [hint, setHint] = useState("");
  const [err, setErr] = useState("");
  
  // Подсказка (только после нажатия "Получить подсказку")
  const [showHintModal, setShowHintModal] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintReceived, setHintReceived] = useState(false); // true только после onGetHint()
  
  // Показать задание (после "Не отгадал" или "Подсказка")
  const [showTaskFromNotGuessed, setShowTaskFromNotGuessed] = useState(false);
  const [notGuessed, setNotGuessed] = useState(false);
  
  // Загадка на следующую локацию (появляется после "Задание выполнено")
  const [nextRiddle, setNextRiddle] = useState("");
  
  // Подтверждение выполнения
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const solvedAlready = station ? isSolved(station.id) : false;
    setArrive("idle");
    setCheck(solvedAlready ? "done" : "idle");
    setRevealed(solvedAlready);
    setHint("");
    setHintReceived(false);
    setShowTaskFromNotGuessed(false);
    setNotGuessed(false);
    setNextRiddle("");
    setErr("");
    setShowHintModal(false);
    setShowConfirm(false);
  }, [stationId, station]);

  // Прибытие живёт на сервере, поэтому переживает перезагрузку страницы и
  // смену телефона: спрашиваем его при открытии точки.
  useEffect(() => {
    if (!station || !HAS_BACKEND) return;
    const teamNumber = getTeamNumber();
    const savedPhone = getPhone();
    if (!teamNumber && !savedPhone) return;
    let cancelled = false;
    fetchProgress({ teamNumber, phone: savedPhone })
      .then((data) => {
        if (cancelled) return;
        if (data.arrivals && data.arrivals[String(station.id)]) setArrive("done");
        if (data.hints && data.hints[String(station.id)]) {
          setHintReceived(true);
          setHint(station.hint || "Подсказка получена ранее.");
        }
        if (data.notGuessed && data.notGuessed[String(station.id)]) setNotGuessed(true);
      })
      .catch(() => {
        /* нет связи — кнопка просто останется закрытой до «Я прибыл» */
      });
    return () => {
      cancelled = true;
    };
  }, [stationId, station]);

  const phoneOk = isValidPhone(phone);

  function onPhoneChange(v) {
    setPhoneState(v);
    setPhone(v);
  }

  function onTeamNoChange(v) {
    const digits = v.replace(/\D/g, "");
    setTeamNoState(digits);
    setTeamNumber(digits);
  }

  if (!station) {
    return (
      <div className="card">
        <h2>Точка не найдена</h2>
        <p className="muted">Проверь QR-код.</p>
        <button className="btn ghost" onClick={() => navigate("/profile")}>
          На главную
        </button>
      </div>
    );
  }

  async function onArrived() {
    setErr("");
    if (!HAS_BACKEND) {
      setArrive("error");
      setErr("Бэкенд не подключён (VITE_API_URL). Запусти `npm run server`.");
      return;
    }
    if (!phoneOk) {
      setErr("Сначала введите номер телефона.");
      return;
    }
    setArrive("sending");
    try {
      await notify("arrived", {
        stationId: station.id,
        stationName: station.name,
        phone: phone.trim(),
        teamNumber: teamNo || null,
        team: [getTeam(), teamNo ? `№${teamNo}` : ""].filter(Boolean).join(" "),
      });
      setArrive("done");
    } catch (e) {
      setArrive("error");
      setErr(e.message || "Ошибка отправки");
    }
  }

  /**
   * Загадку команда разгадывает на месте — ответ через сайт не вводится.
   * Кнопка «Задание отправлено» отмечает точку с подтверждением.
   */
  async function onSolved() {
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён (VITE_API_URL). Запусти `npm run server`.");
      return;
    }
    if (!phoneOk && !teamNo) {
      setErr("Укажите номер команды или телефон — иначе прогресс не сохранится.");
      return;
    }
    setCheck("sending");
    try {
      const res = await solveStation({
        stationCode: station.code || station.id,
        phone: phone.trim(),
        teamNumber: teamNo || null,
      });
      setCheck("done");
      setNextRiddle(res.nextHint || "");
      setRevealed(true);
      solve(station.id);
    } catch (e) {
      setCheck("idle");
      setErr(e.message || "Не удалось отметить точку.");
    }
  }

  /** Получить подсказку */
  async function onGetHint() {
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён.");
      return;
    }
    setHintLoading(true);
    try {
      // Отправляем уведомление админам о использовании подсказки
      await notify("hint_used", {
        stationId: station.id,
        stationName: station.name,
        phone: phone.trim(),
        teamNumber: teamNo || null,
      });

      // Получаем подсказку из questConfig
      const hint = station.hint || "Подсказка отсутствует.";
      setHint(hint);
      setHintReceived(true);
      // НЕ закрываем модалку — подсказка остаётся видимой внутри окна
    } catch (e) {
      setErr(e.message || "Не удалось получить подсказку.");
    } finally {
      setHintLoading(false);
    }
  }

  /** Не отгадал — уведомляем администраторов через бота */
  async function onNotGuessed() {
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён.");
      return;
    }

    const teamLabel = [getTeam(), teamNo ? `№${teamNo}` : ""].filter(Boolean).join(" ");

    try {
      await notify("not_guessed", {
        stationId: station.id,
        stationName: station.name,
        phone: phone.trim(),
        teamNumber: teamNo || null,
        team: teamLabel || undefined,
      });
      // Показываем задание и кнопку перехода к следующей точке
      setNotGuessed(true);
    } catch (e) {
      setErr(e.message || "Не удалось отправить уведомление.");
    }
  }

  // Показать задание если: arrive === done ИЛИ notGuessed ИЛИ уже решено.
  // Подсказка НЕ открывает задание — она показывает текст подсказки.
  const taskVisible = (arrive === "done" || notGuessed || revealed) && station.detailedTask;

  // Точка 0 (стартовая) — без загадки и подсказки
  const isStartStation = station.id === 0;

  // Подтверждение перехода к следующей точке
  const [confirmNext, setConfirmNext] = useState(false);

  function goNextStation() {
    const next = QUEST.stations[station.id + 1];
    if (next) {
      navigate(`/s/${next.code || next.id}`);
    }
  }

  return (
    <div className="card">
      {revealed && <span className="done-badge">✓ Точка разгадана</span>}
      <div className="eyebrow">
        Точка {station.id} из {QUEST.stations.length}
      </div>
      <h2 style={{ display: 'none' }}>{station.name}</h2>

      {(() => {
        const riddleText = station.riddle || (station.task ? station.task.split("ЗАДАНИЕ")[0].replace(/^ЗАГАДКА\s*/i, "").trim() : "");

        return (
          <div className="station-details">
            {/* ЗАГАДКА (не показываем на стартовой точке 0) */}
            {riddleText && !isStartStation && (
              <div className="task riddle-block" style={{ whiteSpace: "pre-wrap" }}>
                <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>🔮</span> ЗАГАДКА
                </div>
                <div style={{ fontSize: "16px", lineHeight: "1.6", fontWeight: "500" }}>{riddleText}</div>
              </div>
            )}

            {/* ЗАДАНИЕ (показывается после "Я прибыл" ИЛИ после "Не отгадал") */}
            {taskVisible && (
              <div className="task assignment-block" style={{ marginTop: "16px", backgroundColor: "rgba(255, 255, 255, 0.05)", padding: "16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div 
                  style={{ fontSize: "15px", lineHeight: "1.6" }} 
                  dangerouslySetInnerHTML={{ __html: station.detailedTask.replace(/\n/g, "<br/>") }} 
                />
                <div style={{ marginTop: "16px", fontSize: "14px", color: "var(--accent)", fontWeight: "bold" }}>
                  Воспользуйтесь телеграм ботом <a href="https://t.me/thisMirrorbot" target="_blank" rel="noreferrer" style={{ color: "#fff", textDecoration: "underline" }}>https://t.me/thisMirrorbot</a> чтобы отправлять видео и фото результаты Хранительнице
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {!HAS_BACKEND && (
        <div className="feedback err">
          ⚠️ Бэкенд не подключён. Ответы проверяются на сервере, поэтому без него
          точку взять нельзя (задайте VITE_API_URL и запустите сервер).
        </div>
      )}

      {!phoneOk && (
        <div className="feedback err">
          ⚠️ Вы не зарегистрированы или номер телефона не найден. Пожалуйста, зарегистрируйтесь.
          <br />
          <a href="/#/register" style={{ color: "var(--accent)", textDecoration: "underline" }}>Перейти к регистрации</a>
        </div>
      )}

      <div className="actions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="btn arrive"
            onClick={onArrived}
            disabled={arrive === "sending" || arrive === "done" || revealed}
          >
            {arrive === "sending"
              ? "Отправляем…"
              : (arrive === "done" || revealed)
                ? "✓ Я прибыл (отгадал загадку)"
                : "📍 Я прибыл (отгадал загадку)"}
          </button>

          {!isStartStation && (
            <button
              className="btn ghost"
              onClick={() => setShowHintModal(true)}
              disabled={hintLoading || hintReceived}
            >
              {hintLoading ? "Загружаем…" : hintReceived ? "✓ Подсказка получена" : "💡 Прошу подсказку к загадке"}
            </button>
          )}

          {!isStartStation && (
            <button
              className="btn ghost"
              onClick={onNotGuessed}
              disabled={notGuessed}
              style={{ borderColor: "#ff6b6b", color: notGuessed ? "#888" : "#ff6b6b" }}
            >
              {notGuessed ? "✓ Я не отгадал загадку" : "❌ Я не отгадал загадку"}
            </button>
          )}

          {taskVisible && !notGuessed && (
            <button
              className="btn green"
              onClick={() => setShowConfirm(true)}
              disabled={check === "sending" || check === "done"}
              style={{ marginTop: 8 }}
            >
              {check === "sending" ? "Отмечаем…" : check === "done" ? "✓ Задание отправлено" : "✅ Задание отправлено"}
            </button>
          )}
        </div>
      </div>

      {/* Кнопка "Перейти к следующей точке" после "Не отгадал" */}
      {!revealed && notGuessed && (
        <div style={{ marginTop: 16 }}>
          {station.id < QUEST.stations.length - 1 ? (
            <button
              className="btn green"
              onClick={() => setConfirmNext(true)}
              style={{ width: "100%", marginBottom: 12 }}
            >
              🚀 Перейти к следующей точке
            </button>
          ) : (
            <p className="center muted">Это последняя точка квеста.</p>
          )}
        </div>
      )}

      {err && <div className="feedback err">{err}</div>}

      {revealed && (
        <div className="reveal">

          {station.id < QUEST.stations.length - 1 ? (
            <button
              className="btn green"
              onClick={() => setConfirmNext(true)}
              style={{ width: "100%", marginBottom: 20 }}
            >
              🚀 Перейти к следующей точке
            </button>
          ) : (
            /* ===== ФИНАЛЬНЫЙ ЭКРАН (последняя точка) ===== */
            <div className="finale-screen">
              <div className="finale-emoji">🏆</div>
              <h2 className="finale-title">Миссия выполнена!</h2>
              <p className="finale-subtitle">
                Команда{" "}
                <strong>{getTeam() || `№${teamNo}` || ""}</strong>{" "}
                прошла все точки квеста
              </p>
              <div className="finale-tagline">❤️ Алматы — моя первая любовь!</div>
              <p className="muted" style={{ fontSize: 14, marginTop: 12, textAlign: "center" }}>
                Организаторы уже получили уведомление. Ждите объявления победителей!
              </p>
              <button
                className="btn green mt"
                style={{ width: "100%", marginTop: 24 }}
                onClick={() => navigate("/profile")}
              >
                🏠 На главную
              </button>
            </div>
          )}
        </div>
      )}

      {/* Модальное окно подтверждения */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Подтверждение</h3>
            <p>Вы хотите подтвердить текущую точку как выполненную?</p>
            <div className="modal-actions">
              <button className="btn green" onClick={() => { setShowConfirm(false); onSolved(); }}>
                Да, подтвердить
              </button>
              <button className="btn ghost" onClick={() => setShowConfirm(false)}>
                Нет, отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно: подтверждение перехода к следующей точке */}
      {confirmNext && (
        <div className="modal-overlay" onClick={() => setConfirmNext(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Подтверждение</h3>
            <p>Вы уверены что хотите перейти к следующей локации?</p>
            <div className="modal-actions">
              <button className="btn green" onClick={() => { setConfirmNext(false); goNextStation(); }}>
                Да
              </button>
              <button className="btn ghost" onClick={() => setConfirmNext(false)}>
                Нет
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно подсказки */}
      {showHintModal && (
        <div className="modal-overlay" onClick={() => setShowHintModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>💡 Подсказка к загадке</h3>
            {hint ? (
              <div style={{ marginTop: 12, padding: 12, background: "rgba(255,255,255,0.1)", borderRadius: 8 }}>
                <p style={{ whiteSpace: "pre-wrap", fontSize: 15 }}>{hint}</p>
              </div>
            ) : (
              <p style={{ fontSize: 14 }}>Уведомление будет отправлено организаторам.</p>
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              {!hint && (
                <button 
                  className="btn green" 
                  onClick={onGetHint}
                  disabled={hintLoading}
                >
                  {hintLoading ? "Отправляем…" : "Получить подсказку"}
                </button>
              )}
              <button className="btn ghost" onClick={() => setShowHintModal(false)}>
                {hint ? "Закрыть" : "Отмена"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}