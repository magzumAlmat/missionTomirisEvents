import { useState } from "react";
import { useProgress } from "../useProgress.js";
import { checkFinalCode, HAS_BACKEND } from "../lib/api.js";
import { getTeamNumber } from "../lib/team.js";
import { getPhone } from "../lib/phone.js";

export default function Final() {
  const { finish } = useProgress();
  const [value, setValue] = useState("");
  const [won, setWon] = useState(false);
  const [message, setMessage] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [shake, setShake] = useState(false);

  /**
   * Код сверяет СЕРВЕР — ни кода, ни текста с местом приза в бандле сайта нет.
   * Заодно на сервере фиксируется время финиша: по нему судья определяет
   * победителя.
   */
  async function tryCode() {
    if (!value.trim() || sending) return;
    setErr("");

    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён (VITE_API_URL). Запусти `npm run server`.");
      return;
    }

    setSending(true);
    try {
      const res = await checkFinalCode({
        code: value.trim(),
        phone: getPhone(),
        teamNumber: getTeamNumber() || null,
      });
      if (res.correct) {
        setWon(true);
        setMessage(res.message || "");
        finish();
      } else {
        setErr("Неверный код. Проверь порядок букв.");
        setShake(true);
        setTimeout(() => setShake(false), 420);
      }
    } catch (e) {
      setErr(e.message || "Не удалось проверить код.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={"card" + (shake ? " shake" : "")}>
      <div className="eyebrow">Финал</div>
      <div className="big-emoji">🗝️</div>
      <h2 className="center">Финальный код</h2>

      {!won ? (
        <>
          <p className="center muted">
            Сложи буквы со всех точек по порядку и введи получившийся код.
          </p>
          <input
            type="text"
            placeholder="Финальный код"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryCode()}
          />
          <button className="btn green" onClick={tryCode} disabled={sending}>
            {sending ? "Проверяем…" : "Открыть"}
          </button>
          {err && <div className="feedback err">{err}</div>}
        </>
      ) : (
        <div className="reveal center">
          <div className="big-emoji">🎉</div>
          <h2>Код принят!</h2>
          <p>{message}</p>
          <p className="muted tiny">
            Организаторы уже получили уведомление о вашем финише. Приз выдаётся
            после проверки фото и видео, присланных капитаном.
          </p>
        </div>
      )}
    </div>
  );
}
