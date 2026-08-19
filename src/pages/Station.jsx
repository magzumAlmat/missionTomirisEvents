import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import { notify, HAS_BACKEND } from "../lib/api.js";
import { getTeam, setTeam } from "../lib/team.js";
import { getPhone, setPhone, isValidPhone } from "../lib/phone.js";

export default function Station() {
  const { id } = useParams();
  const navigate = useNavigate();
  const station = QUEST.stations.find((s) => s.code === id || String(s.id) === id);
  const stationId = station ? station.id : parseInt(id, 10);

  const { isSolved, solve } = useProgress();
  const already = station ? isSolved(station.id) : false;

  const [phone, setPhoneState] = useState(getPhone());
  const [team, setTeamState] = useState(getTeam());
  const [arrive, setArrive] = useState("idle"); // idle | sending | done | error
  const [solved, setSolved] = useState(already ? "done" : "idle");
  const [revealed, setRevealed] = useState(already);
  const [err, setErr] = useState("");

  useEffect(() => {
    const isAlreadySolved = station ? isSolved(station.id) : false;
    setArrive("idle");
    setSolved(isAlreadySolved ? "done" : "idle");
    setRevealed(isAlreadySolved);
    setErr("");
  }, [stationId, station]);

  const phoneOk = isValidPhone(phone);

  function onPhoneChange(v) {
    setPhoneState(v);
    setPhone(v);
  }

  function onTeamChange(v) {
    setTeamState(v);
    setTeam(v);
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

  async function fire(event, setState) {
    setErr("");
    if (!HAS_BACKEND) {
      setState("error");
      setErr(
        "Бэкенд не подключён (VITE_API_URL). Запусти `npm run server` и перезапусти `npm run dev`."
      );
      return false;
    }
    if (!phoneOk) {
      setErr("Сначала введите номер телефона.");
      return false;
    }
    setState("sending");
    try {
      await notify(event, {
        stationId: station.id,
        stationName: station.name,
        phone: phone.trim(),
        team: team.trim(),
      });
      setState("done");
      return true;
    } catch (e) {
      setState("error");
      setErr(e.message || "Ошибка отправки");
      return false;
    }
  }

  async function onArrived() {
    await fire("arrived", setArrive);
  }

  async function onSolved() {
    const ok = await fire("solved", setSolved);
    if (ok) {
      solve(station.id);
      setRevealed(true);
    }
  }

  return (
    <div className="card">
      {revealed && <span className="done-badge">✓ Точка разгадана</span>}
      <div className="eyebrow">
        Точка {station.id} из {QUEST.stations.length} · {station.name}
      </div>
      <h2>{station.name}</h2>

      <div className="task">{station.task}</div>

      {!HAS_BACKEND && (
        <div className="feedback err">
          ⚠️ Бэкенд не подключён. Кнопки не будут слать уведомления, пока не задан
          VITE_API_URL и не запущен сервер.
        </div>
      )}

      <div className="field-block">
        <label className="field-label">Ваш номер телефона</label>
        <input
          type="tel"
          inputMode="tel"
          placeholder="+7 708 737 37 72"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
        />
        {!phoneOk && phone.length > 0 && (
          <p className="center err-text tiny">Введите корректный номер (мин. 10 цифр).</p>
        )}

        <label className="field-label mt">Название команды / Имя</label>
        <input
          type="text"
          placeholder="Например: Барсы"
          value={team}
          onChange={(e) => onTeamChange(e.target.value)}
        />
      </div>

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

        {solved === "done" && (
          <div className="feedback ok">✓ «Я отгадал» отправлено организаторам</div>
        )}
        <button
          className="btn green"
          onClick={onSolved}
          disabled={solved === "sending" || !phoneOk}
        >
          {solved === "sending"
            ? "Отправляем…"
            : solved === "done"
            ? "🧩 Отправить «Я отгадал» повторно"
            : "🧩 Я отгадал"}
        </button>
      </div>

      {err && <div className="feedback err">{err}</div>}

      {revealed && (
        <div className="reveal">
          <div className="letter">
            <span className="lbl">Твоя буква</span>
            <span className="val">{station.letter}</span>
          </div>
          {station.nextHint && (
            <p className="center">
              <b className="muted">Куда дальше:</b>
              <br />
              {station.nextHint}
            </p>
          )}
          <button className="btn ghost" onClick={() => navigate("/progress")}>
            Посмотреть прогресс
          </button>
        </div>
      )}
    </div>
  );
}
