import { useState } from "react";

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "";
const UNLOCK_KEY = "event_tomiris_admin_ok";

/** Уже вводили пароль в этой вкладке? */
export function isUnlocked() {
  if (!ADMIN_PASSWORD) return true; // пароль не задан — админка открыта
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch (e) {
    return false;
  }
}

/**
 * Экран ввода пароля организатора. Общий для всех страниц админки,
 * чтобы разблокировка на одной открывала и остальные.
 */
export default function PasswordGate({ onOk }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);

  function submit() {
    if (val === ADMIN_PASSWORD) {
      try {
        sessionStorage.setItem(UNLOCK_KEY, "1");
      } catch (e) {}
      onOk();
    } else {
      setErr(true);
    }
  }

  return (
    <div className="card">
      <div className="eyebrow">Админ</div>
      <h2>Вход для организатора</h2>
      <p className="muted">Введите пароль администратора.</p>
      <input
        type="password"
        placeholder="Пароль"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoFocus
      />
      <button className="btn" onClick={submit}>
        Войти
      </button>
      {err && <div className="feedback err">Неверный пароль.</div>}
    </div>
  );
}
