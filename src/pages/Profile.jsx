import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getPhone } from "../lib/phone.js";
import { getName, getTeam, getTeamNumber } from "../lib/team.js";
import { fetchTeams, fetchCaptains } from "../lib/api.js";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import { useGameStatus } from "../useGameStatus.js";
import CountdownTimer from "../components/CountdownTimer.jsx";

export default function Profile() {
  const navigate = useNavigate();
  const { solvedCount } = useProgress();
  const { isGameStarted, timeLeft, displayDate, displayTime, place } = useGameStatus();
  const [profile, setProfile] = useState({
    name: getName(),
    phone: getPhone(),
    teamName: getTeam(),
    teamNumber: getTeamNumber(),
    isCaptain: false,
  });
  const [teammates, setTeammates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const phone = getPhone();

        // 1. Check if captain
        const captainsData = await fetchCaptains();
        const isCaptain = (captainsData.captains || []).some(c => c.phone === phone);

        // 2. Fetch teammates
        const teamNumber = getTeamNumber();
        let members = [];
        if (teamNumber) {
          const teamsData = await fetchTeams();
          const myTeam = (teamsData.teams || []).find(t => String(t.teamNumber) === String(teamNumber));
          if (myTeam && myTeam.participants) {
            members = myTeam.participants.filter(p => p.phone !== phone);
          }
        }

        setProfile(prev => ({ ...prev, isCaptain }));
        setTeammates(members);
      } catch (e) {
        console.error("Profile load error:", e);
        setError("Не удалось загрузить данные профиля.");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  if (loading) {
    return (
      <div className="card">
        <p className="center muted">Загрузка профиля...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="feedback err">{error}</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="eyebrow">Мой профиль</div>
      <h2 style={{ marginBottom: 8 }}>{profile.name || "Участник"}</h2>

      <div className="reveal" style={{ marginTop: 20 }}>
        <p>
          <b className="muted">Телефон:</b> {profile.phone}
          {profile.isCaptain && (
            <span className="done-badge" style={{ marginLeft: 8, fontSize: 12 }}>👑 Капитан</span>
          )}
        </p>

        <div style={{ marginTop: 16 }}>
          <p>
            <b className="muted">Команда:</b> {profile.teamName || "Не указана"}
            {profile.teamNumber && (
              <>
                <br />
                <b className="muted">Номер команды:</b> {profile.teamNumber}
              </>
            )}
          </p>
        </div>

        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Мои сокомандники:</h3>
          {teammates.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {teammates.map((tm, i) => (
                <div key={i} style={{
                  padding: "10px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span>{tm.name}</span>
                  <span className="muted tiny">{tm.phone}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted tiny">Вы участвуете в квесте соло или команда ещё не сформирована.</p>
          )}
        </div>

        {profile.teamNumber && solvedCount < QUEST.stations.length && (() => {
          const nextStation = QUEST.stations[solvedCount];

          // Если квест ещё не начался и команда ещё не взяла точку 0
          if (solvedCount === 0 && !isGameStarted) {
            return (
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="eyebrow" style={{ color: "#ffcc4d", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>⏳</span> СТАРТ КВЕСТА
                </div>
                <h3 style={{ margin: "4px 0 8px", fontSize: 18 }}>Ожидание начала игры</h3>
                <p className="muted" style={{ fontSize: 14 }}>
                  Точка 0 (стартовая точка) станет доступна в назначенное время старта. Соберитесь со своей командой на месте сбора:
                </p>

                <CountdownTimer
                  timeLeft={timeLeft}
                  displayDate={displayDate}
                  displayTime={displayTime}
                  place={place}
                  title="ДО СТАРТА ИГРЫ ОСТАЛОСЬ"
                  compact={true}
                />

                <button
                  className="btn ghost mt"
                  disabled
                  style={{ width: "100%", opacity: 0.6, cursor: "not-allowed", borderStyle: "dashed" }}
                >
                  🔒 Точка 0 заблокирована до {displayTime}
                </button>
              </div>
            );
          }

          return (
            <button
              className="btn green mt"
              style={{ width: "100%", marginTop: 32 }}
              onClick={() => {
                navigate(`/s/${nextStation?.code || nextStation?.id}`);
              }}
            >
              {solvedCount === 0
                ? "🚀 Начать квест (Точка 0)"
                : `🚀 Продолжить квест (Точка ${nextStation?.id ?? solvedCount})`}
            </button>
          );
        })()}
      </div>
    </div>
  );
}
