import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { registerParticipant, HAS_BACKEND, fetchCaptains, subscribeToCaptain, addSoloUser, createCaptain, fetchTeams, checkPhone } from "../lib/api.js";
import { getPhone, setPhone, isValidPhone } from "../lib/phone.js";
import { getTeam, setTeam, getName, setName, setTeamNumber } from "../lib/team.js";
import { useProgress } from "../useProgress.js";
import { useGameStatus } from "../useGameStatus.js";
import { setLocalQuestId } from "../lib/questSync.js";

/** Кнопка-переключатель «Да/Нет». */
function ChoiceButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      className={`btn ${active ? "" : "ghost"}`}
      style={{
        borderRadius: 12,
        borderColor: active ? "var(--accent)" : "rgba(255,255,255,0.1)",
        background: active ? undefined : "rgba(255,255,255,0.05)",
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Карточка выбора роли участника с иконкой, заголовком и пояснением */
function RoleChoiceCard({ icon, title, description, active, onClick }) {
  return (
    <button
      type="button"
      className="role-choice-card"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "16px 18px",
        borderRadius: 14,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        fontFamily: "inherit",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        background: active
          ? "linear-gradient(135deg, rgba(76, 217, 100, 0.16) 0%, rgba(76, 217, 100, 0.05) 100%)"
          : "rgba(255, 255, 255, 0.04)",
        border: active
          ? "2px solid #4cd964"
          : "1px solid rgba(255, 255, 255, 0.12)",
        boxShadow: active
          ? "0 0 20px rgba(76, 217, 100, 0.22)"
          : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: active ? "#ffffff" : "rgba(255,255,255,0.92)" }}>
            {title}
          </span>
        </div>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: active ? "6px solid #4cd964" : "2px solid rgba(255, 255, 255, 0.25)",
            background: active ? "#ffffff" : "transparent",
            boxSizing: "border-box",
            flexShrink: 0,
            transition: "all 0.2s ease",
          }}
        />
      </div>
      <p
        style={{
          margin: "4px 0 0 0",
          fontSize: 13.5,
          lineHeight: 1.45,
          color: active ? "rgba(255, 255, 255, 0.88)" : "rgba(255, 255, 255, 0.6)",
          paddingLeft: 30,
        }}
      >
        {description}
      </p>
    </button>
  );
}

const TWO_COLS = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 6,
};

export default function Register() {
  const navigate = useNavigate();
  const { reset: resetProgress } = useProgress();
  const { isGameStarted, displayDate, displayTime, place } = useGameStatus();

  // Step 1: Basic Info (начинаем с пустых полей для чистого ввода)
  const [name, setNameState] = useState("");
  const [phone, setPhoneState] = useState("");
  const [hasCar, setHasCar] = useState(true);

  // Flow State
  const [currentStep, setCurrentStep] = useState(1);
  const [registrationType, setRegistrationType] = useState(null); // SOLO | CREATE_TEAM | JOIN_CAPTAIN | JOIN_TEAM

  // Step 3: Specifics
  const [teamName, setTeamNameState] = useState("");
  const [captainSlots, setCaptainSlots] = useState("4");
  const [selectedCaptainId, setSelectedCaptainId] = useState(null);

  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [err, setErr] = useState("");
  const [teamNumber, setTeamNumberState] = useState(null);

  const [captains, setCaptains] = useState([]);
  const [loadingCaptains, setLoadingCaptains] = useState(false);
  const [captainError, setCaptainError] = useState("");
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  // Валидация уникальности номера телефона
  const [phoneDuplicateError, setPhoneDuplicateError] = useState("");
  const [checkingPhone, setCheckingPhone] = useState(false);

  const phoneOk = isValidPhone(phone);
  const nameOk = name.trim().length > 0;

  useEffect(() => {
    if (!HAS_BACKEND) return;
    let cancelled = false;
    setLoadingCaptains(true);
    fetchCaptains()
      .then((data) => {
        if (!cancelled) {
          setCaptains(data.captains || []);
          setLoadingCaptains(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setCaptainError(e.message || "Не удалось загрузить капитанов");
          setLoadingCaptains(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!HAS_BACKEND) return;
    let cancelled = false;
    setLoadingTeams(true);
    fetchTeams()
      .then((data) => {
        if (!cancelled) {
          setTeams(data.teams || []);
          setLoadingTeams(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingTeams(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Поддержка ссылок-приглашений, например /#register?team=Барсы
  useEffect(() => {
    try {
      const hash = window.location.hash || "";
      const qIdx = hash.indexOf("?");
      if (qIdx !== -1) {
        const params = new URLSearchParams(hash.slice(qIdx));
        const inviteTeam = params.get("team") || params.get("teamName");
        if (inviteTeam) {
          setTeamNameState(inviteTeam);
          setTeam(inviteTeam);
          setRegistrationType("JOIN_TEAM");
        }
      }
    } catch {
      // ignore
    }
  }, []);

  function onPhoneChange(v) {
    setPhoneState(v);
    setPhoneDuplicateError("");
  }

  // Проверка телефона на дубликаты в реальном времени
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setPhoneDuplicateError("");
      return;
    }

    let cancelled = false;
    setCheckingPhone(true);
    const timer = setTimeout(() => {
      checkPhone(phone)
        .then((res) => {
          if (cancelled) return;
          setCheckingPhone(false);
          if (res && res.registered) {
            const desc = res.details?.description ? ` (${res.details.description})` : "";
            setPhoneDuplicateError(`Этот номер телефона уже зарегистрирован${desc}. Один номер не может участвовать дважды.`);
          } else {
            setPhoneDuplicateError("");
          }
        })
        .catch(() => {
          if (!cancelled) setCheckingPhone(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone]);

  function onNameChange(v) {
    setNameState(v);
  }

  function onTeamNameChange(v) {
    setTeamNameState(v);
  }

  const slotsNum = Number(captainSlots);
  const slotsOk = Number.isInteger(slotsNum) && slotsNum >= 2 && slotsNum <= 5;

  const typeOk = {
    SOLO: true,
    CREATE_TEAM: teamName.trim().length > 0 && slotsOk,
    JOIN_CAPTAIN: !!selectedCaptainId || teamName.trim().length > 0,
    JOIN_TEAM: teamName.trim().length > 0,
  }[registrationType];

  const formOk = nameOk && phoneOk && typeOk;

  async function handleNextStep() {
    if (currentStep === 1) {
      if (!nameOk || !phoneOk) {
        setErr("Заполните имя и корректный номер телефона (мин. 10 цифр).");
        return;
      }
      setCheckingPhone(true);
      const res = await checkPhone(phone);
      setCheckingPhone(false);
      if (res && res.registered) {
        const desc = res.details?.description ? ` (${res.details.description})` : "";
        setPhoneDuplicateError(`Этот номер телефона уже зарегистрирован${desc}. Один номер не может участвовать дважды.`);
        return;
      }
      setPhoneDuplicateError("");
      setErr("");
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!registrationType) {
        setErr("Пожалуйста, выберите вашу роль в квесте.");
        return;
      }
      setErr("");
      setCurrentStep(3);
      return;
    }
  }

  function handleFormSubmit(e) {
    if (e) e.preventDefault();
    if (currentStep < 3) {
      handleNextStep();
      return;
    }
    onSubmit(e);
  }

  async function onSubmit(e) {
    if (e) e.preventDefault();
    setErr("");

    if (!HAS_BACKEND) {
      setErr("⚠️ Бэкенд не подключён (VITE_API_URL). Запустите сервер.");
      return;
    }
    if (!nameOk || !phoneOk) {
      setErr("Заполните имя и корректный номер телефона.");
      return;
    }

    setStatus("sending");

    try {
      const trimmedName = name.trim();
      const trimmedPhone = phone.trim();

      let regResult = null;

      switch (registrationType) {
        case "SOLO": {
          await addSoloUser({ name: trimmedName, phone: trimmedPhone, hasCar });
          regResult = await registerParticipant({
            name: trimmedName,
            phone: trimmedPhone,
            hasCar,
            hasTeam: false,
            teamName: "",
            teamSize: 0,
          });
          break;
        }

        case "CREATE_TEAM": {
          if (!slotsOk) {
            throw new Error("Количество участников в команде должно быть от 2 до 5 человек.");
          }
          await createCaptain({
            name: trimmedName,
            phone: trimmedPhone,
            slots: slotsNum,
            hasCar,
            teamName: teamName.trim(),
          });
          regResult = await registerParticipant({
            name: trimmedName,
            phone: trimmedPhone,
            hasCar,
            hasTeam: true,
            teamName: teamName.trim(),
            teamSize: slotsNum,
            isCaptain: true,
          });
          break;
        }

        case "JOIN_CAPTAIN":
        case "JOIN_TEAM": {
          const selectedCap = selectedCaptainId ? captains.find(c => c.id === selectedCaptainId) : null;
          if (selectedCaptainId && selectedCap) {
            const capTeam = selectedCap.teamName || (selectedCap.name ? `Команда ${selectedCap.name}` : `Команда ${selectedCaptainId}`);
            setTeamNameState(capTeam);
            await subscribeToCaptain({
              captainId: selectedCaptainId,
              name: trimmedName,
              phone: trimmedPhone,
              hasCar,
            });
            regResult = await registerParticipant({
              name: trimmedName,
              phone: trimmedPhone,
              hasCar,
              hasTeam: true,
              teamName: capTeam,
              teamSize: 0,
            });
          } else {
            regResult = await registerParticipant({
              name: trimmedName,
              phone: trimmedPhone,
              hasCar,
              hasTeam: true,
              teamName: teamName.trim(),
              teamSize: 1,
            });
          }
          break;
        }

        default:
          throw new Error("Выберите тип регистрации");
      }

      if (regResult?.teamNumber) {
        setTeamNumberState(regResult.teamNumber);
        setTeamNumber(regResult.teamNumber);
      }

      // Сохраняем в localStorage только при успешной регистрации
      const serverQuestId = regResult?.questId;
      if (serverQuestId) {
        setLocalQuestId(serverQuestId);
      }
      setPhone(trimmedPhone);
      setName(trimmedName);
      if (registrationType === "SOLO") {
        // SOLO — явно очищаем команду, чтобы старые данные не «прилипли»
        setTeam("");
        setTeamNumber("");
      } else if (teamName.trim()) {
        setTeam(teamName.trim());
      }

      resetProgress();
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setErr(e.message || "Ошибка при регистрации.");
    }
  }

  if (status === "done") {
    return (
      <div className="card">
        <div className="eyebrow" style={{ color: "#4cd964" }}>
          ✓ Успешно
        </div>
        {registrationType === "SOLO" ? (
          <>
            <h2>Вы зарегистрировались. Ожидайте распределение по командам!</h2>
            <p className="muted">Ваши данные отправлены организаторам в Telegram.</p>
          </>
        ) : (
          <>
            <h2>Вы зарегистрированы! 🎉</h2>
            <p className="muted">Ваши данные отправлены организаторам в Telegram.</p>
          </>
        )}

        {teamNumber && (
          <div className="reveal" style={{ marginTop: 20 }}>
            <div className="letter">
              <span className="lbl">Номер вашей команды</span>
              <span className="val">{teamNumber}</span>
            </div>
            <p className="center muted tiny">
              Запишите его. Этот номер вводится на точках и в боте для видео —
              название команды больше набирать не нужно.
            </p>
          </div>
        )}

        <div className="reveal" style={{ marginTop: 20 }}>
          <p>
            <b>Имя:</b> {name}
            <br />
            <b>Телефон:</b> {phone}
            <br />
            <b>Своё авто:</b> {hasCar ? "Да 🚗" : "Нет 🚶"}
            <br />
            <b>Статус:</b>{" "}
            {registrationType === "CREATE_TEAM"
              ? `Капитан команды «${teamName}» 👑`
              : registrationType === "JOIN_TEAM" || registrationType === "JOIN_CAPTAIN"
              ? `Команда «${teamName}» 🤝`
              : "Участник без команды 🙋"}
          </p>
        </div>

        {!isGameStarted && (
          <div style={{
            marginTop: 18,
            padding: 14,
            background: "rgba(255, 204, 77, 0.08)",
            border: "1px solid rgba(255, 204, 77, 0.25)",
            borderRadius: 12,
            fontSize: 13,
            lineHeight: 1.6
          }}>
            <div style={{ fontWeight: 700, color: "#ffcc4d", marginBottom: 4 }}>
              ⏳ Доступ к игре откроется к началу квеста:
            </div>
            <div>📅 <b>{displayDate}</b> в 🕒 <b>{displayTime}</b></div>
            <div style={{ marginTop: 2, color: "#aaa" }}>📍 {place}</div>
            <div style={{ marginTop: 6, color: "#ccc", fontSize: 12 }}>
              До наступления этого времени точка 0 закрыта. Перейдите в профиль команды, чтобы увидеть сокомандников и таймер обратного отсчёта.
            </div>
          </div>
        )}

        <button className="btn mt" onClick={() => navigate("/profile")}>
          👤 Перейти в профиль команды
        </button>
        <button
          className="btn ghost"
          style={{ marginTop: 8 }}
          onClick={() => {
            setNameState("");
            setPhoneState("");
            setTeamNameState("");
            setCaptainSlots("4");
            setSelectedCaptainId(null);
            setPhoneDuplicateError("");
            setErr("");
            setStatus("idle");
            setCurrentStep(1);
            setRegistrationType(null);
          }}
        >
          Зарегистрировать ещё одного участника
        </button>
        <button
          className="btn ghost"
          style={{ marginTop: 8 }}
          onClick={() => navigate("/")}
        >
          ← Назад
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="eyebrow">Регистрация</div>
      <h2>Регистрация участника</h2>
      <p className="muted">
        {currentStep === 1 && "Заполните базовые данные."}
        {currentStep === 2 && "Выберите свою роль в квесте."}
        {currentStep === 3 && "Уточните детали вашей команды."}
      </p>

      {!HAS_BACKEND && (
        <div className="feedback err">
          ⚠️ Бэкенд не подключён. Запустите `npm run server`.
        </div>
      )}

      <form onSubmit={handleFormSubmit}>
        {currentStep === 1 && (
          <div className="field-block">
            <label className="field-label">1. Имя участника</label>
            <input
              type="text"
              name="name"
              id="reg-name"
              autoComplete="name"
              placeholder="Например: Азамат"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              required
            />

            <label className="field-label mt">2. Номер телефона</label>
            <input
              type="tel"
              name="phone"
              id="reg-phone"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+7 708 737 37 72"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              required
            />
            {phoneDuplicateError ? (
              <div
                style={{
                  marginTop: 8,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(255, 107, 107, 0.12)",
                  border: "1px solid rgba(255, 107, 107, 0.35)",
                  color: "#ff6b6b",
                  fontSize: 13,
                  lineHeight: 1.4,
                  textAlign: "left",
                }}
              >
                ⚠️ <b>Номер уже занят:</b> {phoneDuplicateError}
                <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                  Если это вы, вы уже зарегистрированы в квесте — нажмите кнопку «На главную» внизу.
                </div>
              </div>
            ) : !phoneOk && phone.length > 0 ? (
              <p className="err-text tiny" style={{ marginTop: 4 }}>
                Введите корректный номер (мин. 10 цифр).
              </p>
            ) : checkingPhone ? (
              <p className="muted tiny" style={{ marginTop: 4 }}>
                🔍 Проверка номера телефона...
              </p>
            ) : null}

            <label className="field-label mt">3. Ваш автомобиль участвует в игре?</label>
            <div style={TWO_COLS}>
              <ChoiceButton active={hasCar} onClick={() => setHasCar(true)}>
                🚗 Да
              </ChoiceButton>
              <ChoiceButton active={!hasCar} onClick={() => setHasCar(false)}>
                🚶 Нет
              </ChoiceButton>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="field-block" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label className="field-label">Кто вы в этом квесте?</label>

            <RoleChoiceCard
              icon="👑"
              title="Создать свою команду"
              description="Вы станете капитаном команды и сможете пригласить других участников."
              active={registrationType === "CREATE_TEAM"}
              onClick={() => {
                setRegistrationType("CREATE_TEAM");
              }}
            />

            <RoleChoiceCard
              icon="🤝"
              title="Присоединиться к команде"
              description="Если капитан уже создал команду, вы сможете присоединиться к ней по ссылке-приглашению или по названию команды."
              active={registrationType === "JOIN_TEAM" || registrationType === "JOIN_CAPTAIN"}
              onClick={() => {
                setRegistrationType("JOIN_TEAM");
              }}
            />

            <RoleChoiceCard
              icon="🙋"
              title="Участвовать без команды"
              description="Если у вас пока нет команды, мы поможем подобрать для вас подходящую команду."
              active={registrationType === "SOLO"}
              onClick={() => {
                setRegistrationType("SOLO");
              }}
            />
          </div>
        )}

        {currentStep === 3 && (
          <div className="field-block">
            {registrationType === "CREATE_TEAM" && (
              <>
                <label className="field-label">Название команды</label>
                <input
                  type="text"
                  name="teamName"
                  id="reg-team-name"
                  autoComplete="off"
                  placeholder="Например: Барсы"
                  value={teamName}
                  onChange={(e) => onTeamNameChange(e.target.value)}
                  required
                />
                <label className="field-label mt">Количество участников в команде (включая вас, от 2 до 5):</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 }}>
                  {[2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      className={`btn ${Number(captainSlots) === num ? "" : "ghost"}`}
                      style={{
                        padding: "10px 0",
                        fontSize: "15px",
                        fontWeight: 700,
                        borderRadius: 12,
                        borderColor: Number(captainSlots) === num ? "var(--accent)" : "rgba(255,255,255,0.15)",
                        background: Number(captainSlots) === num ? undefined : "rgba(255,255,255,0.05)",
                      }}
                      onClick={() => setCaptainSlots(String(num))}
                    >
                      {num} чел.
                    </button>
                  ))}
                </div>
                {/* <input
                  type="number"
                  inputMode="numeric"
                  min="2"
                  max="5"
                  step="1"
                  placeholder="2, 3, 4 или 5"
                  value={captainSlots}
                  onChange={(e) => setCaptainSlots(e.target.value)}
                  style={{ marginTop: 10 }}
                  required
                /> */}
                {!slotsOk && captainSlots && (
                  <p className="err-text tiny" style={{ marginTop: 4 }}>
                    Число участников должно быть от 2 до 5.
                  </p>
                )}
              </>
            )}

            {(registrationType === "JOIN_TEAM" || registrationType === "JOIN_CAPTAIN") && (
              <>
                <label className="field-label">Название команды</label>
                <input
                  type="text"
                  placeholder="Например: Барсы"
                  value={teamName}
                  onChange={(e) => onTeamNameChange(e.target.value)}
                  required
                />

                {(teams.length > 0 || captains.length > 0) && (
                  <>
                    <label className="field-label mt" style={{ marginTop: 16 }}>
                      Или выберите команду из списка:
                    </label>
                    <select
                      className="field-select"
                      value={teamName}
                      onChange={(e) => {
                        const val = e.target.value;
                        onTeamNameChange(val);
                        const matchedCap = captains.find(
                          (c) => c.name === val || c.teamName === val || `Команда ${c.name}` === val
                        );
                        if (matchedCap) setSelectedCaptainId(matchedCap.id);
                        else setSelectedCaptainId(null);
                      }}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "#0d1224",
                        color: "white",
                        fontSize: 15,
                        outline: "none",
                      }}
                    >
                      <option value="">— Выберите из созданных команд —</option>
                      {teams.map((t, i) => (
                        <option key={`t-${i}`} value={t.name}>
                          👥 {t.name} {t.size ? `(${t.size} чел.)` : ""}
                        </option>
                      ))}
                      {captains
                        .filter((c) => !teams.some((t) => t.name === c.name || t.name === c.teamName))
                        .map((c) => (
                          <option key={c.id} value={c.teamName || c.name || `Команда ${c.name}`}>
                            👑 {c.name || c.phone} — {c.availableSlots || 0} / {c.slots} мест
                          </option>
                        ))}
                    </select>
                  </>
                )}
                <p className="muted tiny" style={{ marginTop: 8 }}>
                  💡 Если капитан отправил вам название команды, введите его выше в поле «Название команды».
                </p>
              </>
            )}

            {registrationType === "SOLO" && (
              <div
                style={{
                  padding: "18px 20px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>🙋</span>
                  <span>Участие без команды</span>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                  Если у вас пока нет команды, мы поможем подобрать для вас подходящую команду перед началом квеста. Организаторы свяжутся с вами по указанному телефону.
                </p>
              </div>
            )}
          </div>
        )}

        {err && <div className="feedback err">{err}</div>}

        <div className="modal-actions" style={{ marginTop: 20, display: "flex", gap: 10 }}>
          {currentStep > 1 && (
            <button
              type="button"
              className="btn ghost"
              style={{ flex: 1 }}
              onClick={() => setCurrentStep(currentStep - 1)}
            >
              Назад
            </button>
          )}
          {currentStep < 3 ? (
            <button
              type="button"
              className="btn green"
              style={{ flex: 1 }}
              disabled={
                currentStep === 1
                  ? (!nameOk || !phoneOk || !!phoneDuplicateError || checkingPhone)
                  : !registrationType
              }
              onClick={handleNextStep}
            >
              {checkingPhone ? "Проверка..." : "Далее"}
            </button>
          ) : (
            <button
              type="submit"
              className="btn green"
              style={{ flex: 1 }}
              disabled={status === "sending" || !formOk}
            >
              {status === "sending" ? "Отправка..." : "📝 Зарегистрироваться"}
            </button>
          )}
        </div>
      </form>

        <button
          className="btn ghost mt"
          style={{ marginTop: 12 }}
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate("/");
          }}
        >
          ← Назад
        </button>
    </div>
  );
}