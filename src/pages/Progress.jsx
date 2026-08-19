import { useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import Slots from "../components/Slots.jsx";

export default function Progress() {
  const navigate = useNavigate();
  const { letters, solvedCount, total, allSolved, isSolved, reset } = useProgress();

  return (
    <div className="card">
      <div className="eyebrow">Прогресс</div>
      <h2>Собранные буквы</h2>

      <Slots letters={letters} solvedCount={solvedCount} total={total} />

      <ul className="list">
        {QUEST.stations.map((s) => {
          const got = isSolved(s.id);
          return (
            <li key={s.id}>
              <span>
                {got ? "✅" : "⬜"} Точка {s.id} · {s.name}
              </span>
              <b style={{ color: got ? "var(--accent)" : "var(--muted)" }}>
                {got ? s.letter : "—"}
              </b>
            </li>
          );
        })}
      </ul>

      {allSolved ? (
        <button
          className="btn green mt"
          onClick={() => navigate("/final")}
        >
          Ввести финальный код
        </button>
      ) : (
        <p className="center muted mt">
          Найди и разгадай все точки, чтобы открыть финал.
        </p>
      )}

      <button className="btn ghost" onClick={() => navigate("/")}>
        На главную
      </button>

      {solvedCount > 0 && (
        <button
          className="btn ghost"
          style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}
          onClick={() => {
            if (confirm("Очистить все разгаданные буквы и начать заново?")) {
              reset();
            }
          }}
        >
          🔄 Сбросить прогресс
        </button>
      )}
    </div>
  );
}
