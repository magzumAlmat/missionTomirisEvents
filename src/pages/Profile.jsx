import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getPhone } from "../lib/phone.js";
import { getName, setName, getTeam, setTeam, getTeamNumber, setTeamNumber } from "../lib/team.js";
import { fetchTeams, fetchCaptains, fetchProgress, HAS_BACKEND } from "../lib/api.js";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import { useGameStatus } from "../useGameStatus.js";
import CountdownTimer from "../components/CountdownTimer.jsx";
import Modal from "../components/Modal.jsx";
import { syncQuestEpoch, clearLocalQuestProgress, clearAllLocalUserData } from "../lib/questSync.js";

export default function Profile() {
  const navigate = useNavigate();
  const { solvedCount, applyServer } = useProgress();
  const { isGameStarted, timeLeft, displayDate, displayTime, place } = useGameStatus();
  const [profile, setProfile] = useState({
    name: getName(),
    phone: getPhone(),
    teamName: getTeam(),
    teamNumber: getTeamNumber(),
    isCaptain: false,
  });
  const [teammates, setTeammates] = useState([]);
  const [selectedHistoryStation, setSelectedHistoryStation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Реакция на сброс авторизации пользователя
  useEffect(() => {
    function handleReset() {
      navigate("/register", { replace: true });
    }
    window.addEventListener("user_reset", handleReset);
    return () => window.removeEventListener("user_reset", handleReset);
  }, [navigate]);

  useEffect(() => {
    async function loadProfile() {
      try {
        const phone = getPhone();
        if (!phone) {
          navigate("/register", { replace: true });
          return;
        }

        const normPhone = (phone || "").replace(/\D/g, "").slice(-10);

        // 1. Check if captain
        const captainsData = await fetchCaptains();
        const isCaptain = (captainsData.captains || []).some(
          c => (c.phone || "").replace(/\D/g, "").slice(-10) === normPhone
        );

        // 2. Fetch teammates
        const teamNumber = getTeamNumber();
        let members = [];
        if (teamNumber) {
          const teamsData = await fetchTeams();
          const myTeam = (teamsData.teams || []).find(t => String(t.teamNumber) === String(teamNumber));
          if (myTeam && myTeam.participants) {
            members = myTeam.participants.filter(
              p => (p.phone || "").replace(/\D/g, "").slice(-10) !== normPhone
            );
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
  }, [navigate]);

// Подтягиваем прогресс с сервера: на новом устройстве localStorage пуст,
// а при удалении квеста или пользователя админом — очищаем локальные данные.
  useEffect(() => {
    if (!HAS_BACKEND) return;
    const teamNumber = getTeamNumber();
    const phone = getPhone();
    if (!teamNumber && !phone) return;

    let cancelled = false;
    fetchProgress({ teamNumber, phone })
      .then((data) => {
        if (!cancelled && data) {
          if (data.registered === false) {
            clearAllLocalUserData();
            navigate("/register", { replace: true });
            return;
          }
          if (data.questId) {
            syncQuestEpoch(data.questId, true);
          }
          if (data.reset && !data.teamNumber && (!data.stations || Object.keys(data.stations).length === 0)) {
            clearLocalQuestProgress();
            setProfile(prev => ({ ...prev, teamNumber: "", teamName: "" }));
            return;
          }
          applyServer(data.stations, data.finishedAt);
          if (data.captainName && data.userName) {
            const capMatch = data.captainName.trim().toLowerCase() === data.userName.trim().toLowerCase();
            if (capMatch) {
              setProfile(prev => ({ ...prev, isCaptain: true }));
            }
          }
          if (data.teamNumber) {
            setTeamNumber(data.teamNumber);
            setProfile(prev => ({ ...prev, teamNumber: data.teamNumber }));
          } else {
            setTeamNumber("");
            setProfile(prev => ({ ...prev, teamNumber: "" }));
          }
          if (data.teamName) {
            setTeam(data.teamName);
            setProfile(prev => ({ ...prev, teamName: data.teamName }));
          } else {
            setTeam("");
            setProfile(prev => ({ ...prev, teamName: "" }));
          }
          if (data.userName) {
            setName(data.userName);
            setProfile(prev => ({ ...prev, name: data.userName }));
          }
        }
      })
      .catch(() => {
        /* нет связи — остаёмся на локальном прогрессе */
      });

    return () => {
      cancelled = true;
    };
  }, [applyServer]);

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
    <>
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
          {profile.teamName ? (
            <p>
              <b className="muted">Команда:</b> {profile.teamName}
              {profile.teamNumber && (
                <>
                  <br />
                  <b className="muted">Номер команды:</b> {profile.teamNumber}
                </>
              )}
            </p>
          ) : (
            <div style={{
              padding: "14px 16px",
              borderRadius: 12,
              background: "rgba(255, 204, 77, 0.08)",
              border: "1px solid rgba(255, 204, 77, 0.25)",
              marginTop: 4,
            }}>
              <div style={{ fontWeight: 700, color: "#ffcc4d", fontSize: 14, marginBottom: 4 }}>
                🙋 Участник без команды
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                Ожидайте распределение по командам. Организаторы назначат вам команду и свяжутся с вами по телефону.
              </p>
            </div>
          )}
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
            <p className="muted tiny">
              {profile.teamNumber
                ? "В команде пока нет других участников."
                : "Вы участвуете в квесте соло или команда ещё не сформирована."}
            </p>
          )}
        </div>

        {profile.teamNumber && !profile.isCaptain && (
          <div style={{
            marginTop: 28,
            padding: 16,
            borderRadius: 14,
            background: "rgba(255, 204, 77, 0.07)",
            border: "1px solid rgba(255, 204, 77, 0.25)",
          }}>
            <div className="eyebrow" style={{ color: "#ffcc4d" }}>👑 Капитан команды</div>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.55, margin: 0 }}>
              {solvedCount >= QUEST.stations.length
                ? "Квест завершён вашей командой. Итоги подводит организатор."
                : "Точки проходит капитан со своего телефона. Вы можете смотреть состав команды и статус здесь."}
            </p>
          </div>
        )}

        {profile.teamNumber && profile.isCaptain && solvedCount >= QUEST.stations.length && (
          <div style={{
            marginTop: 28,
            padding: 16,
            borderRadius: 14,
            background: "rgba(76, 217, 100, 0.08)",
            border: "1px solid rgba(76, 217, 100, 0.3)",
          }}>
            <div className="eyebrow" style={{ color: "#4cd964" }}>🏆 Финиш</div>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.55, margin: 0 }}>
              Команда прошла все точки. Итоги подводит организатор.
            </p>
          </div>
        )}

        {profile.teamNumber && profile.isCaptain && solvedCount < QUEST.stations.length && (() => {
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

            {/* Список пройденных локаций и история */}
            {solvedCount > 0 && (
              <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <h3 style={{ fontSize: 16, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>📍 Пройденные локации:</span>
                  <span style={{ fontSize: 13, color: "var(--ok)", fontWeight: 700 }}>
                    {solvedCount} из {QUEST.stations.length}
                  </span>
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {QUEST.stations.slice(0, solvedCount).map((st) => (
                    <div
                      key={st.id}
                      style={{
                        padding: "12px 14px",
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(76, 217, 100, 0.25)",
                        borderRadius: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>
                          ✓ Локация {st.id}. {st.name}
                        </span>
                        {st.history && (
                          <button
                            className="btn ghost small"
                            style={{ width: "auto", margin: 0, padding: "4px 10px", fontSize: 12 }}
                            onClick={() => setSelectedHistoryStation(st)}
                          >
                            📖 Справка
                          </button>
                        )}
                      </div>
                      {st.history && (
                        <div
                          className="muted tiny"
                          style={{
                            lineHeight: 1.4,
                            margin: 0,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {st.history}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedHistoryStation && (
          <Modal onClose={() => setSelectedHistoryStation(null)}>
            <div className="eyebrow">Историческая справка · Локация {selectedHistoryStation.id}</div>
            <h3 style={{ marginBottom: 12 }}>{selectedHistoryStation.name}</h3>
            <div
              className="modal-history"
              style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.9)", whiteSpace: "pre-line" }}
            >
              {selectedHistoryStation.history}
            </div>
            <button className="btn green mt" onClick={() => setSelectedHistoryStation(null)}>
              Закрыть
            </button>
          </Modal>
        )}
      </>
    );
  }
