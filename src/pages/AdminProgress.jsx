import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { fetchStandings, deleteTeam, resetQuest, HAS_BACKEND } from "../lib/api.js";
import PasswordGate, { isUnlocked } from "../components/PasswordGate.jsx";

const REFRESH_MS = 15000;

function time(iso) {
  return iso ? new Date(iso).toLocaleTimeString("ru-RU", { timeZone: "Asia/Almaty" }) : "";
}

/** Состояние точки у команды: взята / подсказка / не отгадал / команда пришла / ещё не была. */
function cellState(row, stationId) {
  const id = String(stationId);
  if (row.stations?.[id]) return "solved";
  if (row.hints?.[id]) return "hinted";
  if (row.notGuessed?.[id]) return "not_guessed";
  if (row.arrivals?.[id]) return "arrived";
  return "empty";
}

const CELL_STYLE = {
  solved: { background: "rgba(76, 217, 100, 0.22)", color: "#4cd964", label: "✓" },
  hinted: { background: "rgba(255, 193, 7, 0.25)", color: "#ffc107", label: "💡" },
  not_guessed: { background: "rgba(255, 107, 107, 0.2)", color: "#ff6b6b", label: "❌" },
  arrived: { background: "rgba(255, 193, 7, 0.18)", color: "var(--accent)", label: "" },
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
  const [deleting, setDeleting] = useState(null);
  const [resetting, setResetting] = useState(false);

  async function handleDelete(row) {
    if (!row.teamNumber) return;
    const label = `№${row.teamNumber} ${row.teamName || "без названия"}`;
    const hasProgress = row.solved > 0 || Object.keys(row.arrivals || {}).length > 0;
    const extra = hasProgress
      ? `\n⚠️ У команды есть прогресс (${row.solved}/${total} точек) — он будет удалён.`
      : "";
    if (!window.confirm(`Удалить команду ${label}?\nПрогресс и материалы капитана тоже будут удалены.${extra}`)) return;
    setDeleting(row.key);
    try {
      await deleteTeam(row.teamNumber);
      const data = await fetchStandings();
      setRows(data.rows || []);
      setErr("");
    } catch (e) {
      setErr(e.message || "Не удалось удалить команду.");
    } finally {
      setDeleting(null);
    }
  }

  async function handleResetQuest() {
    if (!rows.length) return;
    if (!window.confirm(
      `Удалить ВЕСЬ квест?\n\n` +
      `Будут удалены безвозвратно:\n` +
      `• все команды (${rows.length})\n` +
      `• весь прогресс по точкам\n` +
      `• все материалы от капитанов\n\n` +
      `📇 База участников сохранится.\n` +
      `Нумерация команд начнётся заново с №1.\n\n` +
      `Продолжить?`
    )) return;
    setResetting(true);
    try {
      const data = await resetQuest();
      const removed = data.removed || {};
      alert(
        `✅ Квест удалён.\n\n` +
        `Удалено:\n` +
        `• команд: ${removed.teams ?? 0}\n` +
        `• записей прогресса: ${removed.progress ?? 0}\n` +
        `• материалов: ${removed.submissions ?? 0}\n\n` +
        `📇 Сохранено участников: ${data.keptParticipants ?? 0}`
      );
      const fresh = await fetchStandings();
      setRows(fresh.rows || []);
      setErr("");
    } catch (e) {
      setErr(e.message || "Не удалось удалить квест.");
    } finally {
      setResetting(false);
    }
  }

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
                <th className="no-print">Действия</th>
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
                    const arrivalAt = r.arrivals?.[String(s.id)]?.at || r.arrivals?.[String(s.id)];
                    const solvedAt = r.stations?.[String(s.id)];
                    const hintAt = r.hints?.[String(s.id)];
                    const notGuessedAt = r.notGuessed?.[String(s.id)];
                    // Для arrived — показываем время
                    let label = style.label;
                    if (state === "arrived" && arrivalAt) {
                      label = time(typeof arrivalAt === "object" ? arrivalAt.at : arrivalAt);
                    }
                    if (state === "hinted" && hintAt) {
                      label = "💡 " + time(hintAt);
                    }
                    if (state === "not_guessed" && notGuessedAt) {
                      label = "❌ " + time(notGuessedAt);
                    }
                    const titleParts = [s.name];
                    if (arrivalAt) titleParts.push(`Прибытие: ${time(typeof arrivalAt === "object" ? arrivalAt.at : arrivalAt)}`);
                    if (hintAt) titleParts.push(`Подсказка: ${time(hintAt)}`);
                    if (notGuessedAt) titleParts.push(`Не отгадал: ${time(notGuessedAt)}`);
                    if (solvedAt) titleParts.push(`Выполнено: ${time(solvedAt)}`);
                    return (
                      <td key={s.id} className="board-cell">
                        <span
                          className="board-dot"
                          style={{ background: style.background, color: style.color, fontSize: label.length > 2 ? "10px" : undefined }}
                          title={titleParts.join(" · ")}
                        >
                          {label}
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
                  <td className="board-num no-print">
                    {r.teamNumber && (
                      <button
                        className="btn btn-del-team"
                        disabled={deleting === r.key}
                        onClick={() => handleDelete(r)}
                        title="Удалить команду (вместе с прогрессом и материалами)"
                      >
                        {deleting === r.key ? "…" : "🗑️"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button className="btn ghost no-print" onClick={() => navigate("/admin")}>
          🔲 К генерации QR-кодов
        </button>
        <button className="btn ghost no-print" onClick={() => navigate("/")}>
          На главную
        </button>
        {rows.length > 0 && (
          <button
            className="btn btn-danger no-print"
            disabled={resetting}
            onClick={handleResetQuest}
            title="Удалить все команды, прогресс и материалы. База участников сохранится."
          >
            {resetting ? "Удаляю…" : "🗑 Удалить весь квест"}
          </button>
        )}
      </div>
    </div>
  );
}
