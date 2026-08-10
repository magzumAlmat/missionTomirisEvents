import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import Slots from "../components/Slots.jsx";
import { getTeam, setTeam } from "../lib/team.js";
import { HAS_BACKEND } from "../lib/api.js";

export default function Start() {
  const navigate = useNavigate();
  const { letters, solvedCount, total } = useProgress();
  const [team, setTeamState] = useState(getTeam());

  function onTeamChange(v) {
    setTeamState(v);
    setTeam(v);
  }

  return (
    <div className="card">
      <div className="eyebrow">Квест</div>
      <h1>{QUEST.title}</h1>
      <p className="muted">{QUEST.intro}</p>

      {HAS_BACKEND && (
        <div className="field-block">
          <label className="field-label">Название команды / имя</label>
          <input
            type="text"
            placeholder="Например: Барсы"
            value={team}
            onChange={(e) => onTeamChange(e.target.value)}
          />
          <p className="center muted tiny">
            Это имя увидят организаторы, когда вы отметите «Я прибыл» на точке.
          </p>
        </div>
      )}

      <Slots letters={letters} solvedCount={solvedCount} total={total} />

      <button className="btn" onClick={() => navigate("/progress")}>
        Мой прогресс
      </button>
      <p className="center muted small-note">
        Отсканируй первый QR-код, чтобы начать. Каждый код открывает свою точку.
      </p>
    </div>
  );
}
