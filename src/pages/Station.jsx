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
  
  // Подсказка
  const [showHintModal, setShowHintModal] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  
  // Подтверждение выполнения
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const solvedAlready = station ? isSolved(station.id) : false;
    setArrive("idle");
    setCheck(solvedAlready ? "done" : "idle");
    setRevealed(solvedAlready);
    setHint("");
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
   * Кнопка «Задание выполнено» отмечает точку с подтверждением.
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
      setHint(res.nextHint || "");
      setRevealed(true);
      solve(station.id);
    } catch (e) {
      setCheck("idle");
      setErr(e.message || "Не удалось отметить точку.");
    }
  }

  /** Получить подсказку (-3 балла) */
  async function onGetHint() {
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён.");
      return;
    }
    setHintLoading(true);
    try {
      // Отправляем уведомление админам о использовании подсказки
      const text = `💡 <b>ПОДСКАЗКА ИСПОЛЬЗОВАНА</b>\n\n` +
        `👤 Телефон: ${phone.trim()}\n` +
        `👥 Команда: ${teamNo ? `№${teamNo}` : "не указана"}\n` +
        `📍 Точка: ${station.id} - ${station.name}\n` +
        `⚠️ Штраф: -3 балла\n` +
        `🕒 ${new Date().toLocaleString("ru-RU")}`;
      
      // Отправляем уведомление через стандартный notify
      await notify("hint_used", {
        stationId: station.id,
        stationName: station.name,
        phone: phone.trim(),
        teamNumber: teamNo || null,
      });
      
      // Получаем подсказку из questConfig
      const hint = station.hint || "Подсказка отсутствует.";
      setHint(hint);
      setRevealed(true);
      setShowHintModal(false);
    } catch (e) {
      setErr(e.message || "Не удалось получить подсказку.");
    } finally {
      setHintLoading(false);
    }
  }

  /** Не отгадал — отправляем информацию капитану и админу */
  async function onNotGuessed() {
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён.");
      return;
    }
    
    // Формируем ссылку на WhatsApp для капитана
    const nextStation = QUEST.stations.find((s) => s.id === station.id + 1);
    const base = window.location.href.split('#')[0].replace(/\/+$/, '') + '/';
    const nextUrl = nextStation ? `${base}#/s/${nextStation.code || nextStation.id}` : '';
    const text = nextStation 
      ? `Команда ${teamNo || 'не указана'}: не отгадали на точке ${station.name}. Следующая локация: ${nextStation.nextLocation || nextStation.name}. Ссылка: ${nextUrl}`
      : `Команда ${teamNo || 'не указана'}: не отгадали на точке ${station.name}. Конец квеста.`;
    
      const nextLink = `https://wa.me/?text=Не отгадал точку`;

    // Уведомляем админов
    try {
      await notify("not_guessed", {
        stationId: station.id,
        stationName: station.name,
        phone: phone.trim(),
        teamNumber: teamNo || null,
      });
    } catch (e) {}

    // Открываем WhatsApp
    window.open(nextLink, "_blank");
    
    setErr("✅ Ссылка на WhatsApp открыта. Баллы: 0.");
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
            {/* ЗАГАДКА */}
            {riddleText && (
              <div className="task riddle-block" style={{ whiteSpace: "pre-wrap" }}>
                <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>🔮</span> ЗАГАДКА
                </div>
                <div style={{ fontSize: "16px", lineHeight: "1.6", fontWeight: "500" }}>{riddleText}</div>
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
        {arrive === "done" && (
          <div className="feedback ok">✓ «Я прибыл» отправлено организаторам</div>
        )}
        <button
          className="btn arrive"
          onClick={onArrived}
          disabled={arrive === "sending" || !phoneOk}
        >
          {arrive === "sending"
            ? "Отправляем…"
            : arrive === "done"
            ? "📍 Отправить «Я прибыл» повторно"
            : "📍 Я прибыл"}
        </button>
        <button
          className="btn ghost"
          onClick={() => navigate("/profile")}
          style={{ marginTop: 8, width: "100%" }}
        >
          🏠 В профиль
        </button>

        {station.id < QUEST.stations.length - 1 && (
          <button
            className="btn green"
            onClick={() => navigate(`/s/${QUEST.stations[station.id + 1]?.code || station.id + 1}`)}
            disabled={!revealed}
            style={{ marginTop: 8, width: "100%" }}
          >
            🚀 Перейти к следующей точке
          </button>
        )}

        {!revealed && arrive === "done" && (
          <>
            <button
              className="btn green"
              onClick={() => setShowConfirm(true)}
              disabled={check === "sending"}
            >
              {check === "sending" ? "Отмечаем…" : "✅ Задание выполнено"}
            </button>
            {stationId !== 0 && (
              <>
                <button
                  className="btn ghost"
                  onClick={() => setShowHintModal(true)}
                  disabled={hintLoading}
                  style={{ marginTop: 8 }}
                >
                  {hintLoading ? "Загружаем…" : "💡 Прошу подсказку"}
                </button>
                <button
                  className="btn ghost"
                  onClick={onNotGuessed}
                  style={{ marginTop: 8, borderColor: "#ff6b6b", color: "#ff6b6b" }}
                >
                  ❌ Не отгадал
                </button>
              </>
            )}
          </>
        )}

        {!revealed && arrive !== "done" && (
          <p className="center muted tiny">
            Сначала нажмите «Я прибыл» — после этого откроется «Задание выполнено».
          </p>
        )}
      </div>

      {err && <div className="feedback err">{err}</div>}

      {revealed && (
        <div className="reveal">
          {station.id < QUEST.stations.length - 1 && (
            <button
              className="btn green"
              onClick={() => navigate(`/s/${QUEST.stations[station.id + 1]?.code || station.id + 1}`)}
              style={{ width: "100%", marginBottom: 20 }}
            >
              🚀 Перейти к следующей точке
            </button>
          )}
          {stationId !== 0 && (
            <>
              {/* Hint text and Telegram link are removed when revealed is true */}
            </>
          )}
        </div>
      )}

      {/* Модальное окно подтверждения */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Вы уверены?</h3>
            <p>Вы хотите отметить текущую точку как выполненную?</p>
            <div className="modal-actions">
              <button className="btn green" onClick={() => { setShowConfirm(false); onSolved(); }}>
                Да, отметить
              </button>
              <button className="btn ghost" onClick={() => setShowConfirm(false)}>
                Нет, отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно подсказки */}
      {showHintModal && (
        <div className="modal-overlay" onClick={() => setShowHintModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>💡 Подсказка</h3>
            <p style={{ color: "#ff6b6b", fontSize: 14 }}>
              ⚠️ Использование подсказки: -3 балла. Уведомление отправлено админам.
            </p>
            {hint ? (
              <div style={{ marginTop: 12, padding: 12, background: "rgba(255,255,255,0.1)", borderRadius: 8 }}>
                <p style={{ whiteSpace: "pre-wrap" }}>{hint}</p>
              </div>
            ) : (
              <p>Получаем подсказку...</p>
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button 
                className="btn green" 
                onClick={onGetHint}
                disabled={hintLoading}
              >
                {hintLoading ? "Отправляем…" : "Получить подсказку"}
              </button>
              <button className="btn ghost" onClick={() => setShowHintModal(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}