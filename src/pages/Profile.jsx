import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getPhone } from "../lib/phone.js";
import { getName, getTeam, getTeamNumber } from "../lib/team.js";
import { fetchTeams, fetchCaptains } from "../lib/api.js";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";

export default function Profile() {
  const navigate = useNavigate();
  const { solvedCount } = useProgress();
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

        {solvedCount < QUEST.stations.length && (
          <button
            className="btn green mt"
            style={{ width: "100%", marginTop: 32 }}
            onClick={() => {
              const nextStation = QUEST.stations[solvedCount];
              navigate(`/s/${nextStation?.code || nextStation?.id}`);
            }}
          >
            🚀 Продолжить квест (Точка {solvedCount + 1})
          </button>
        )}
      </div>
    </div>
  );
}
