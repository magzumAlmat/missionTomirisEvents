import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import Slots from "../components/Slots.jsx";
import { getTeamNumber, setTeamNumber } from "../lib/team.js";
import { getPhone, setPhone } from "../lib/phone.js";
import { HAS_BACKEND } from "../lib/api.js";

export default function Start() {
  const navigate = useNavigate();
  const { letters, solvedCount, total } = useProgress();
  const [team, setTeamState] = useState(getTeamNumber());
  const [phone, setPhoneState] = useState(getPhone());
  const poster = QUEST.poster || {};
  const started = solvedCount > 0;

  function onTeamChange(v) {
    setTeamState(v);
    setTeamNumber(v);
  }
  function onPhoneChange(v) {
    setPhoneState(v);
    setPhone(v);
  }

  return (
    <div className="card poster">
      {/* Афиша */}
      <div className="poster-hero">
        <div className="poster-badge">Квест</div>
        <h1 className="poster-title">{QUEST.title}</h1>
        {poster.tagline && <p className="poster-tagline">{poster.tagline}</p>}
      </div>

      {(poster.date || poster.time || poster.place) && (
        <div className="poster-meta">
          {poster.date && (
            <div className="meta-item">
              <span className="meta-ico">📅</span>
              <span>{poster.date}</span>
            </div>
          )}
          {poster.time && (
            <div className="meta-item">
              <span className="meta-ico">🕒</span>
              <span>{poster.time}</span>
            </div>
          )}
          {poster.place && (
            <div className="meta-item">
              <span className="meta-ico">📍</span>
              <span>{poster.place}</span>
            </div>
          )}
        </div>
      )}

      <p className="muted poster-intro">{QUEST.intro}</p>

      {Array.isArray(poster.howTo) && poster.howTo.length > 0 && (
        <div className="howto">
          <div className="howto-title">Как играть</div>
          <ol className="howto-list">
            {poster.howTo.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {HAS_BACKEND && (
        <div className="field-block">
          <label className="field-label">Ваш номер телефона</label>
          <input
            type="tel"
            inputMode="tel"
            placeholder="+7 708 737 37 72"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
          />
          <label className="field-label mt">Номер команды</label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="Например: 7"
            value={team}
            onChange={(e) => onTeamChange(e.target.value.replace(/\D/g, ""))}
          />
          <p className="center muted tiny">
            Номер выдаётся при регистрации команды. По нему организаторы видят,
            кто взял точку, — название команды набирать не нужно.
          </p>
        </div>
      )}

      <Slots letters={letters} solvedCount={solvedCount} total={total} />

      <button className="btn green" onClick={() => navigate("/register")}>
        📝 Зарегистрироваться на квест
      </button>

      <button className="btn ghost mt" onClick={() => navigate("/landing")}>
        ✨ Презентация квеста и таймер
      </button>

      <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => navigate("/progress")}>
        {started ? "Мой прогресс" : "Открыть прогресс"}
      </button>

      <p className="center muted small-note">
        Чтобы начать, отсканируйте первый QR-код на точке сбора. Каждый код
        открывает свою точку.
      </p>

      {poster.organizer && (
        <div className="poster-org">{poster.organizer}</div>
      )}
    </div>
  );
}
