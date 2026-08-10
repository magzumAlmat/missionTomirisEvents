import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import { isCorrect } from "../lib/text.js";
import { notifyArrived, HAS_BACKEND } from "../lib/api.js";
import { getTeam } from "../lib/team.js";

export default function Station() {
  const { id } = useParams();
  const navigate = useNavigate();
  const stationId = parseInt(id, 10);
  const station = QUEST.stations.find((s) => s.id === stationId);

  const { isSolved, solve } = useProgress();
  const already = station ? isSolved(station.id) : false;

  const [value, setValue] = useState("");
  const [status, setStatus] = useState(already ? "ok" : "idle"); // idle | ok | err
  const [revealed, setRevealed] = useState(already);
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  // Состояние кнопки «Я прибыл»: idle | sending | sent | error
  const [arrive, setArrive] = useState("idle");
  const [arriveErr, setArriveErr] = useState("");

  useEffect(() => {
    if (!already && inputRef.current) inputRef.current.focus();
  }, [already]);

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

  function check() {
    if (!value.trim()) {
      inputRef.current && inputRef.current.focus();
      return;
    }
    if (isCorrect(value, station.answers)) {
      solve(station.id);
      setStatus("ok");
      setRevealed(true);
    } else {
      setStatus("err");
      setShake(true);
      setTimeout(() => setShake(false), 420);
    }
  }

  async function markArrived() {
    setArrive("sending");
    setArriveErr("");
    try {
      await notifyArrived({
        stationId: station.id,
        stationName: station.name,
        team: getTeam(),
      });
      setArrive("sent");
    } catch (e) {
      setArrive("error");
      setArriveErr(e.message || "Ошибка отправки");
    }
  }

  return (
    <div className={"card" + (shake ? " shake" : "")}>
      {revealed && <span className="done-badge">✓ Точка разгадана</span>}
      <div className="eyebrow">
        Точка {station.id} из {QUEST.stations.length} · {station.name}
      </div>
      <h2>{station.name}</h2>
      <div className="task">{station.task}</div>

      {HAS_BACKEND && (
        <div className="arrive-block">
          {arrive === "sent" ? (
            <div className="feedback ok">✓ Организаторы уведомлены о прибытии</div>
          ) : (
            <button
              className="btn arrive"
              onClick={markArrived}
              disabled={arrive === "sending"}
            >
              {arrive === "sending" ? "Отправляем…" : "📍 Я прибыл"}
            </button>
          )}
          {arrive === "error" && <div className="feedback err">{arriveErr}</div>}
        </div>
      )}

      {!revealed && (
        <>
          <input
            ref={inputRef}
            type="text"
            placeholder="Твой ответ"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
          />
          <button className="btn" onClick={check}>
            Проверить
          </button>
        </>
      )}

      {status === "err" && (
        <div className="feedback err">
          Не то. Осмотрись внимательнее и попробуй ещё.
        </div>
      )}

      {revealed && (
        <div className="reveal">
          {status === "ok" && !already && (
            <div className="feedback ok">Верно!</div>
          )}
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
