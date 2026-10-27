import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import { HAS_BACKEND, fetchProgress } from "../lib/api.js";
import { getTeam, getTeamNumber } from "../lib/team.js";
import { getPhone } from "../lib/phone.js";
import { syncQuestEpoch, clearLocalQuestProgress } from "../lib/questSync.js";

export default function Start() {
  const navigate = useNavigate();
  const { solvedCount, applyServer } = useProgress();
  const [team, setTeamState] = useState(getTeam());
  const [phone, setPhoneState] = useState(getPhone());
  const poster = QUEST.poster || {};
  const started = solvedCount > 0;

  // Проверяем актуальный статус квеста на сервере — если квест был сброшен,
  // локальный прогресс очищается, а кнопка «Продолжить квест» исчезает.
  useEffect(() => {
    const savedPhone = getPhone();
    const savedTeam = getTeamNumber();
    if (HAS_BACKEND && (savedPhone || savedTeam || solvedCount > 0)) {
      fetchProgress({ teamNumber: savedTeam, phone: savedPhone })
        .then((data) => {
          if (!data) return;
          if (data.questId) {
            const wasReset = syncQuestEpoch(data.questId);
            if (wasReset) {
              setTeamState("");
              return;
            }
          }
          if (data.reset || (!data.teamNumber && (!data.stations || Object.keys(data.stations).length === 0))) {
            if (solvedCount > 0 || savedTeam) {
              clearLocalQuestProgress();
              setTeamState("");
            }
            return;
          }
          applyServer(data.stations, data.finishedAt);
          if (data.teamName) setTeamState(data.teamName);
        })
        .catch(() => {});
    }
  }, [applyServer, solvedCount]);

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
            {poster.howTo.map((step, i) => {
              if (typeof step === "string" && step.includes("@thisMirrorbot")) {
                const parts = step.split("@thisMirrorbot");
                return (
                  <li key={i}>
                    {parts[0]}
                    <a
                      href="https://t.me/thisMirrorbot"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent)", textDecoration: "underline", fontWeight: 600 }}
                    >
                      @thisMirrorbot
                    </a>
                    {parts[1]}
                  </li>
                );
              }
              return <li key={i}>{step}</li>;
            })}
          </ol>
        </div>
      )}

      {HAS_BACKEND && null}

      <div className="btn-row">
        {started && (
          <button
            className="btn green"
            style={{ marginBottom: 4 }}
            onClick={() => {
              const nextStation = QUEST.stations[solvedCount] || QUEST.stations[0];
              navigate(`/s/${nextStation.code || nextStation.id}`);
            }}
          >
            🚀 Продолжить квест (Локация {QUEST.stations[solvedCount]?.id ?? solvedCount})
          </button>
        )}
        {phone ? (
          <button className={started ? "btn ghost" : "btn green"} onClick={() => navigate("/profile")}>
            👤 Мой профиль и статус квеста
          </button>
        ) : (
          <button className="btn green" onClick={() => navigate("/register")}>
            📝 Зарегистрироваться на квест
          </button>
        )}
        <button className="btn ghost" onClick={() => navigate("/landing")}>
          ℹ️ Информация
        </button>
      </div>

      {poster.organizer && (
        <div className="poster-org">{poster.organizer}</div>
      )}
    </div>
  );
}
