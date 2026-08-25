import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerParticipant, HAS_BACKEND } from "../lib/api.js";
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
  const [name, setNameState] = useState(getName());
  const [phone, setPhoneState] = useState(getPhone());
  const [hasCar, setHasCar] = useState(true); // true = Да, false = Нет

  // Ветка команды: если «Да» — нужны название и количество человек.
  const [hasTeam, setHasTeam] = useState(false);
  const [teamName, setTeamNameState] = useState(getTeam());
  const [teamSize, setTeamSize] = useState("");

  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [err, setErr] = useState("");
  const [teamNumber, setTeamNumberState] = useState(null); // выдаёт сервер

  const phoneOk = isValidPhone(phone);
  const nameOk = name.trim().length > 0;
  const teamNameOk = !hasTeam || teamName.trim().length > 0;
  const teamSizeNum = Number(teamSize);
  const teamSizeOk = !hasTeam || (Number.isFinite(teamSizeNum) && teamSizeNum >= 1);
  const formOk = nameOk && phoneOk && teamNameOk && teamSizeOk;

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

  async function onSubmit(e) {
    if (e) e.preventDefault();
    setErr("");

    if (!HAS_BACKEND) {
      setErr("⚠️ Бэкенд не подключён (VITE_API_URL). Запустите сервер.");
      return;
    }
    if (!nameOk) {
      setErr("Пожалуйста, введите ваше имя.");
      return;
    }
    if (!phoneOk) {
      setErr("Введите корректный номер телефона (не менее 10 цифр).");
      return;
    }
    if (!teamNameOk) {
      setErr("Введите название команды.");
      return;
    }
    if (!teamSizeOk) {
      setErr("Укажите количество человек в команде (от 1).");
      return;
    }

    setStatus("sending");
    try {
      const res = await registerParticipant({
        name: name.trim(),
        phone: phone.trim(),
        hasCar,
        hasTeam,
        teamName: hasTeam ? teamName.trim() : "",
        teamSize: hasTeam ? teamSizeNum : 0,
      });
      // Номер команды — ключ на точках и в боте для видео. Запоминаем его,
      // чтобы участнику не пришлось вводить название команды заново.
      if (res?.teamNumber) {
        setTeamNumberState(res.teamNumber);
        setTeamNumber(res.teamNumber);
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
            <b>Команда:</b>{" "}
            {hasTeam ? `«${teamName}», ${teamSizeNum} чел.` : "Нет 🙋"}
          </p>
        </div>

        <button className="btn mt" onClick={() => navigate("/")}>
          На главную квеста
        </button>
        <button
          className="btn ghost"
          style={{ marginTop: 8 }}
          onClick={() => setStatus("idle")}
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
        Заполните форму, чтобы организаторы могли внести вас в список участников.
      </p>

      {!HAS_BACKEND && (
        <div className="feedback err">
          ⚠️ Бэкенд не подключён. Запустите `npm run server`.
        </div>
      )}

      <form onSubmit={onSubmit}>
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

          <label className="field-label mt">3. Есть ли у вас машина?</label>
          <div style={TWO_COLS}>
            <ChoiceButton active={hasCar} onClick={() => setHasCar(true)}>
              🚗 Да
            </ChoiceButton>
            <ChoiceButton active={!hasCar} onClick={() => setHasCar(false)}>
              🚶 Нет
            </ChoiceButton>
          </div>

          <label className="field-label mt">4. Есть команда?</label>
          <div style={TWO_COLS}>
            <ChoiceButton active={hasTeam} onClick={() => setHasTeam(true)}>
              👥 Да
            </ChoiceButton>
            <ChoiceButton active={!hasTeam} onClick={() => setHasTeam(false)}>
              🙋 Нет
            </ChoiceButton>
          </div>

          {hasTeam && (
            <div className="reveal" style={{ marginTop: 12 }}>
              <label className="field-label">Название команды</label>
              <input
                type="text"
                placeholder="Например: Барсы"
                value={teamName}
                onChange={(e) => onTeamNameChange(e.target.value)}
                required
              />

              <label className="field-label mt">Количество человек</label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="Например: 4"
                value={teamSize}
                onChange={(e) => setTeamSize(e.target.value)}
                required
              />
              {!teamSizeOk && teamSize.length > 0 && (
                <p className="err-text tiny" style={{ marginTop: 4 }}>
                  Укажите число от 1.
                </p>
              )}
            </div>
          )}
        </div>

        {err && <div className="feedback err">{err}</div>}

        <button
          type="submit"
          className="btn green mt"
          disabled={status === "sending" || !formOk}
          style={{ width: "100%" }}
        >
          {status === "sending" ? "Отправка..." : "📝 Зарегистрироваться"}
        </button>
      </form>

      <button
        className="btn ghost"
        style={{ marginTop: 12 }}
        onClick={() => navigate("/")}
      >
        На главную
      </button>
    </div>
  );
}
