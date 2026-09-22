import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { registerParticipant, HAS_BACKEND, fetchCaptains, subscribeToCaptain, addSoloUser, createCaptain, fetchTeams } from "../lib/api.js";
import { getPhone, setPhone, isValidPhone } from "../lib/phone.js";
import { getTeam, setTeam, getName, setName, setTeamNumber } from "../lib/team.js";

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

const TWO_COLS = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 6,
};

export default function Register() {
  const navigate = useNavigate();

  // Step 1: Basic Info
  const [name, setNameState] = useState(getName());
  const [phone, setPhoneState] = useState(getPhone());
  const [hasCar, setHasCar] = useState(true);

  // Flow State
  const [currentStep, setCurrentStep] = useState(1);
  const [registrationType, setRegistrationType] = useState(null); // SOLO | CREATE_TEAM | JOIN_CAPTAIN | JOIN_TEAM

  // Step 3: Specifics
  const [teamName, setTeamNameState] = useState(getTeam());
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

  function onPhoneChange(v) {
    setPhoneState(v);
    setPhone(v);
  }

  function onNameChange(v) {
    setNameState(v);
    setName(v);
  }

  function onTeamNameChange(v) {
    setTeamNameState(v);
    setTeam(v);
  }

  const typeOk = {
    SOLO: true,
    CREATE_TEAM: teamName.trim().length > 0 && captainSlots,
    JOIN_CAPTAIN: !!selectedCaptainId,
    JOIN_TEAM: teamName.trim().length > 0,
  }[registrationType];

  const formOk = nameOk && phoneOk && typeOk;

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

      switch (registrationType) {
        case "SOLO":
          await addSoloUser({ name: trimmedName, phone: trimmedPhone, hasCar });
          await registerParticipant({
            name: trimmedName,
            phone: trimmedPhone,
            hasCar,
            hasTeam: false,
            teamName: "",
            teamSize: 0,
          });
          break;

        case "CREATE_TEAM":
          await createCaptain({
            name: trimmedName,
            phone: trimmedPhone,
            slots: Number(captainSlots) || 4,
            hasCar,
          });
          await registerParticipant({
            name: trimmedName,
            phone: trimmedPhone,
            hasCar,
            hasTeam: true,
            teamName: teamName.trim(),
            teamSize: 1,
          });
          break;

        case "JOIN_CAPTAIN":
          await subscribeToCaptain({
            captainId: selectedCaptainId,
            name: trimmedName,
            phone: trimmedPhone,
            hasCar,
          });
          await registerParticipant({
            name: trimmedName,
            phone: trimmedPhone,
            hasCar,
            hasTeam: true,
            teamName: `Капитан ${selectedCaptainId}`,
            teamSize: 1,
          });
          break;

        case "JOIN_TEAM":
          const res = await registerParticipant({
            name: trimmedName,
            phone: trimmedPhone,
            hasCar,
            hasTeam: true,
            teamName: teamName.trim(),
            teamSize: 0,
          });
          if (res?.teamNumber) {
            setTeamNumberState(res.teamNumber);
            setTeamNumber(res.teamNumber);
          }
          break;

        default:
          throw new Error("Выберите тип регистрации");
      }

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
        <h2>Вы зарегистрированы! 🎉</h2>
        <p className="muted">Ваши данные отправлены организаторам в Telegram.</p>

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
            {registrationType === "JOIN_CAPTAIN"
              ? "Подписан на капитана"
              : registrationType === "CREATE_TEAM" || registrationType === "JOIN_TEAM"
              ? `Команда «${teamName}»`
              : "Одиночный участник 🙋"}
          </p>
        </div>

        <button className="btn mt" onClick={() => navigate("/profile")}>
          На главную квеста
        </button>
        <button
          className="btn ghost"
          style={{ marginTop: 8 }}
          onClick={() => {
            setStatus("idle");
            setCurrentStep(1);
            setRegistrationType(null);
          }}
        >
          Зарегистрировать ещё одного участника
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

      <form onSubmit={onSubmit}>
        {currentStep === 1 && (
          <div className="field-block">
            <label className="field-label">1. Имя участника</label>
            <input
              type="text"
              placeholder="Например: Азамат"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              required
            />

            <label className="field-label mt">2. Номер телефона</label>
            <input
              type="tel"
              inputMode="tel"
              placeholder="+7 708 737 37 72"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              required
            />
            {!phoneOk && phone.length > 0 && (
              <p className="err-text tiny" style={{ marginTop: 4 }}>
                Введите корректный номер (мин. 10 цифр).
              </p>
            )}

            <label className="field-label mt">3. В команде должен быть хотя бы один автомобиль:</label>
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
          <div className="field-block" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label className="field-label">Кто вы в этом квесте?</label>
            <ChoiceButton
              active={registrationType === "SOLO"}
              onClick={() => { setRegistrationType("SOLO"); setCurrentStep(3); }}
            >
              🙋 Одиночный участник
            </ChoiceButton>
            <ChoiceButton
              active={registrationType === "CREATE_TEAM"}
              onClick={() => { setRegistrationType("CREATE_TEAM"); setCurrentStep(3); }}
            >
              👑 Создать свою команду
            </ChoiceButton>
            <ChoiceButton
              active={registrationType === "JOIN_CAPTAIN"}
              onClick={() => { setRegistrationType("JOIN_CAPTAIN"); setCurrentStep(3); }}
            >
              🤝 Присоединиться к капитану
            </ChoiceButton>
            <ChoiceButton
              active={registrationType === "JOIN_TEAM"}
              onClick={() => { setRegistrationType("JOIN_TEAM"); setCurrentStep(3); }}
            >
              👥 Вступить в существующую команду
            </ChoiceButton>
          </div>
        )}

        {currentStep === 3 && (
          <div className="field-block">
            {registrationType === "CREATE_TEAM" && (
              <>
                <label className="field-label">Название команды</label>
                <input
                  type="text"
                  placeholder="Например: Барсы"
                  value={teamName}
                  onChange={(e) => onTeamNameChange(e.target.value)}
                  required
                />
                <label className="field-label mt">Сколько свободных мест в команде? (включая вас)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  placeholder="Например: 4"
                  value={captainSlots}
                  onChange={(e) => setCaptainSlots(e.target.value)}
                  required
                />
              </>
            )}

            {registrationType === "JOIN_CAPTAIN" && (
              <>
                <label className="field-label">Выберите капитана</label>
                {loadingCaptains ? (
                  <p className="muted tiny">Загрузка...</p>
                ) : captains.length === 0 ? (
                  <p className="err-text tiny">Капитанов пока нет.</p>
                ) : (
                  <select
                    className="field-select"
                    value={selectedCaptainId || ""}
                    onChange={(e) => setSelectedCaptainId(e.target.value || null)}
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(255,255,255,0.05)",
                      color: "white",
                      fontSize: 14,
                    }}
                  >
                    <option value="">— Выберите капитана —</option>
                    {captains.map((cap) => (
                      <option key={cap.id} value={cap.id} disabled={(cap.availableSlots || 0) <= 0}>
                        {cap.name || cap.phone} — {cap.availableSlots || 0} / {cap.slots} мест
                        {cap.hasCar ? " 🚗" : ""}
                      </option>
                    ))}
                  </select>
                )}
                {captainError && <p className="err-text tiny" style={{ marginTop: 4 }}>{captainError}</p>}
              </>
            )}

            {registrationType === "JOIN_TEAM" && (
              <>
                <label className="field-label">Выберите команду</label>
                {loadingTeams ? (
                  <p className="muted tiny">Загрузка...</p>
                ) : teams.length === 0 ? (
                  <p className="err-text tiny">Команд пока нет.</p>
                ) : (
                  <select
                    className="field-select"
                    value={teamName}
                    onChange={(e) => onTeamNameChange(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(255,255,255,0.05)",
                      color: "white",
                      fontSize: 14,
                    }}
                  >
                    <option value="">— Выберите команду —</option>
                    {teams.map((t, i) => (
                      <option key={i} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                )}
              </>
            )}

            {registrationType === "SOLO" && (
              <p className="center muted">Вы зарегистрируетесь как одиночный участник.</p>
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
              disabled={currentStep === 1 ? (!nameOk || !phoneOk) : !registrationType}
              onClick={() => {
                console.log("Navigating to step 2");
                setCurrentStep(currentStep + 1);
              }}
            >
              Далее
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
          onClick={() => navigate("/profile")}
        >
          На главную
        </button>
    </div>
  );
}