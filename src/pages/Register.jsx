import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerParticipant, HAS_BACKEND } from "../lib/api.js";
import { getPhone, setPhone, isValidPhone } from "../lib/phone.js";
import { getTeam, setTeam } from "../lib/team.js";

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState(getTeam());
  const [phone, setPhoneState] = useState(getPhone());
  const [hasCar, setHasCar] = useState(true); // true = Да, false = Нет

  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [err, setErr] = useState("");

  const phoneOk = isValidPhone(phone);
  const nameOk = name.trim().length > 0;

  function onPhoneChange(v) {
    setPhoneState(v);
    setPhone(v);
  }

  function onNameChange(v) {
    setName(v);
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

    setStatus("sending");
    try {
      await registerParticipant({
        name: name.trim(),
        phone: phone.trim(),
        hasCar,
      });
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
        <p className="muted">
          Ваши данные отправлены организаторам в Telegram.
        </p>

        <div className="reveal" style={{ marginTop: 20 }}>
          <p>
            <b>Имя:</b> {name}
            <br />
            <b>Телефон:</b> {phone}
            <br />
            <b>Своё авто:</b> {hasCar ? "Да 🚗" : "Нет 🚶"}
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
          <label className="field-label">1. Ваше имя</label>
          <input
            type="text"
            placeholder="Например: Азамат"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            required
          />

          <label className="field-label mt">2. Ваш номер телефона</label>
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

          <label className="field-label mt">
            3. За рулём на своей машине?
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginTop: 6,
            }}
          >
            <button
              type="button"
              className={`btn ${hasCar ? "" : "ghost"}`}
              style={{
                borderRadius: 12,
                borderColor: hasCar ? "var(--accent)" : "rgba(255,255,255,0.1)",
                background: hasCar ? undefined : "rgba(255,255,255,0.05)",
              }}
              onClick={() => setHasCar(true)}
            >
              🚗 Да (на авто)
            </button>
            <button
              type="button"
              className={`btn ${!hasCar ? "" : "ghost"}`}
              style={{
                borderRadius: 12,
                borderColor: !hasCar ? "var(--accent)" : "rgba(255,255,255,0.1)",
                background: !hasCar ? undefined : "rgba(255,255,255,0.05)",
              }}
              onClick={() => setHasCar(false)}
            >
              🚶 Нет (без авто)
            </button>
          </div>
        </div>

        {err && <div className="feedback err">{err}</div>}

        <button
          type="submit"
          className="btn green mt"
          disabled={status === "sending" || !phoneOk || !nameOk}
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
