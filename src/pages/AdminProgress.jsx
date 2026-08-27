import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { fetchStandings, HAS_BACKEND } from "../lib/api.js";
import PasswordGate, { isUnlocked } from "../components/PasswordGate.jsx";

const REFRESH_MS = 15000;

function time(iso) {
  return iso ? new Date(iso).toLocaleTimeString("ru-RU") : "";
}

/** Состояние точки у команды: взята / команда пришла / ещё не была. */
function cellState(row, stationId) {
  const id = String(stationId);
  if (row.stations?.[id]) return "solved";
  if (row.arrivals?.[id]) return "arrived";
  return "empty";
}

const CELL_STYLE = {
  solved: { background: "rgba(76, 217, 100, 0.22)", color: "#4cd964", label: "✓" },
  arrived: { background: "rgba(255, 193, 7, 0.18)", color: "var(--accent)", label: "•" },
  empty: { background: "rgba(255,255,255,0.04)", color: "var(--muted)", label: "" },
};

/**
 * Доска прогресса для организаторов: все команды и все точки на одном экране.
 * Обновляется сама раз в 15 секунд — можно оставить открытой на планшете.
 */
export default function AdminProgress() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(QUEST.stations.length);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!unlocked || !HAS_BACKEND) return;
    let stop = false;

    async function load() {
      try {
        const data = await fetchStandings();
        if (stop) return;
        setRows(data.rows || []);
        setTotal(data.total || QUEST.stations.length);
        setUpdatedAt(new Date());
        setErr("");
      } catch (e) {
        if (!stop) setErr(e.message || "Не удалось получить данные.");
      }
    }

    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [unlocked]);

  if (!unlocked) return <PasswordGate onOk={() => setUnlocked(true)} />;

  const started = rows.filter((r) => r.solved > 0 || Object.keys(r.arrivals || {}).length);
  const finished = rows.filter((r) => r.finishedAt);

  return (
    <div className="card admin board-card">
      <div className="eyebrow">Админ · ход игры</div>
      <h2>Прогресс команд</h2>
      <p className="muted">
        Обновляется само каждые 15 секунд. ✓ — точка взята, • — команда отметила
        прибытие, пусто — ещё не была.
      </p>

      {!HAS_BACKEND && (
        <div className="feedback err">
          ⚠️ Бэкенд не подключён (VITE_API_URL) — данные брать неоткуда.
        </div>
      )}
      {err && <div className="feedback err">{err}</div>}

      <div className="board-summary">
        <div>
          <b>{rows.length}</b> команд
        </div>
        <div>
          <b>{started.length}</b> в игре
        </div>
        <div>
          <b>{finished.length}</b> финишировали
        </div>
        {updatedAt && <div className="muted">обновлено {time(updatedAt.toISOString())}</div>}
      </div>

      {rows.length === 0 ? (
        <p className="center muted mt">
          Пока ни одной команды. Как только капитаны зарегистрируются, они появятся здесь.
        </p>
      ) : (
        <div className="board-scroll">
          <table className="board">
            <thead>
              <tr>
                <th className="board-team">Команда</th>
                {QUEST.stations.map((s) => (
                  <th key={s.id} title={s.name}>
                    {s.id}
                  </th>
                ))}
                <th>Итог</th>
                <th>Последняя</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="board-team">
                    {r.finishedAt && <span className="board-cup">🏆</span>}
                    <b>№{r.teamNumber || "—"}</b> {r.teamName || "без названия"}
                  </td>
                  {QUEST.stations.map((s) => {
                    const state = cellState(r, s.id);
                    const style = CELL_STYLE[state];
                    const at = r.stations?.[String(s.id)] || r.arrivals?.[String(s.id)];
                    return (
                      <td key={s.id} className="board-cell">
                        <span
                          className="board-dot"
                          style={{ background: style.background, color: style.color }}
                          title={`${s.name}${at ? ` · ${time(at)}` : ""}`}
                        >
                          {style.label}
                        </span>
                      </td>
                    );
                  })}
                  <td className="board-num">
                    {r.solved}/{total}
                  </td>
                  <td className="board-num">
                    {r.finishedAt ? `🏁 ${time(r.finishedAt)}` : time(r.lastAt) || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button className="btn ghost mt no-print" onClick={() => navigate("/admin")}>
        🔲 К генерации QR-кодов
      </button>
      <button className="btn ghost no-print" onClick={() => navigate("/")}>
        На главную
      </button>
    </div>
  );
}
