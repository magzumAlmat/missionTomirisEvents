import { useState } from "react";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import { norm } from "../lib/text.js";

export default function Final() {
  const { finish } = useProgress();
  const [value, setValue] = useState("");
  const [won, setWon] = useState(false);
  const [err, setErr] = useState(false);
  const [shake, setShake] = useState(false);

  function tryCode() {
    if (!value.trim()) return;
    if (norm(value) === norm(QUEST.finalCode)) {
      setWon(true);
      setErr(false);
      finish();
    } else {
      setErr(true);
      setShake(true);
      setTimeout(() => setShake(false), 420);
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
          <button className="btn green" onClick={tryCode}>
            Открыть
          </button>
          {err && (
            <div className="feedback err">
              Неверный код. Проверь порядок букв.
            </div>
          )}
        </>
      ) : (
        <div className="reveal center">
          <div className="big-emoji">🎉</div>
          <h2>Код принят!</h2>
          <p>{QUEST.finalWin}</p>
        </div>
      )}
    </div>
  );
}
