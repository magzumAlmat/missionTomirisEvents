import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import { HAS_BACKEND } from "../lib/api.js";
import { getTeam } from "../lib/team.js";
import { getPhone } from "../lib/phone.js";

export default function Start() {
  const navigate = useNavigate();
  const { solvedCount } = useProgress();
  const [team, setTeamState] = useState(getTeam());
  const [phone, setPhoneState] = useState(getPhone());
  const poster = QUEST.poster || {};
  const started = solvedCount > 0;

  return (
    <div className="card poster">
      {/* Афиша */}
      <div className="poster-hero">
        <div className="poster-badge">Квест</div>
        <h1 className="poster-title">{QUEST.title}</h1>
        {poster.tagline && <p className="poster-tagline">{poster.tagline}</p>}
      </div>

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

      {HAS_BACKEND && null}

      <div className="btn-row">
        <button className="btn green" onClick={() => navigate("/register")}>
          📝 Зарегистрироваться на квест
        </button>
        <button className="btn ghost" onClick={() => navigate("/landing")}>
          ℹ️ Информация
        </button>
      </div>

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
