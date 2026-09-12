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

  useEffect(() => {
    const solvedAlready = station ? isSolved(station.id) : false;
    setArrive("idle");
    setCheck(solvedAlready ? "done" : "idle");
    setRevealed(solvedAlready);
    setHint("");
    setErr("");
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
        <button className="btn ghost" onClick={() => navigate("/")}>
          В начало
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
   * Кнопка «Я отгадал» отмечает точку: сервер запоминает время взятия
   * (по нему судья определяет победителя) и отдаёт подсказку к следующей точке.
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

  return (
    <div className="card">
      {revealed && <span className="done-badge">✓ Точка разгадана</span>}
      <div className="eyebrow">
        Точка {station.id} из {QUEST.stations.length} · {station.name}
      </div>
      <h2>{station.name}</h2>

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
        <div className="field-block">
          <label className="field-label mt">Ваш номер телефона</label>
          <input
            type="tel"
            inputMode="tel"
            placeholder="+7 708 737 37 72"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
          />
          {phone.length > 0 && (
            <p className="center err-text tiny">Введите корректный номер (мин. 10 цифр).</p>
          )}
          <p className="center muted tiny">Укажите телефон, который вводили при регистрации, чтобы продолжить.</p>
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

        {!revealed && (
          <button
            className="btn green"
            onClick={onSolved}
            disabled={check === "sending" || arrive !== "done"}
            style={arrive !== "done" ? { opacity: 0.5 } : undefined}
          >
            {check === "sending" ? "Отмечаем…" : "🧩 Я отгадал"}
          </button>
        )}
      </div>

      {!revealed && (
        <p className="center muted tiny">
          {arrive === "done"
            ? "Капитан: назовите ответ организатору на точке и нажмите «Я отгадал» — откроется подсказка, куда идти дальше."
            : "Обе кнопки нажимает капитан. Сначала «Я прибыл» — после этого откроется «Я отгадал»."}
        </p>
      )}

      {err && <div className="feedback err">{err}</div>}

      {revealed && (
        <div className="reveal">
          {hint && (
            <p className="center">
              <b className="muted">Куда дальше:</b>
              <br />
              {hint}
            </p>
          )}
          <p className="center muted tiny" style={{ marginTop: 12 }}>
            📸 Капитан, отправьте фото/видео или сообщение с этой точки в Telegram-бот:
          </p>
          {QUEST.videoBotUrl && (
            <a
              href={QUEST.videoBotUrl}
              target="_blank"
              rel="noreferrer"
              className="btn green"
              style={{
                textDecoration: "none",
                textAlign: "center",
                display: "block",
                margin: "10px 0",
              }}
            >
              📹 Отправить видео/сообщение боту в Telegram
            </a>
          )}
          <button className="btn ghost" onClick={() => navigate("/progress")}>
            Посмотреть прогресс
          </button>
        </div>
      )}
    </div>
  );
}
