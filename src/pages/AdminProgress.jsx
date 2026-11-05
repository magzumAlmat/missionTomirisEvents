import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { fetchStandings, fetchSubmissions, deleteTeam, resetQuest, adminMarkArrival, HAS_BACKEND } from "../lib/api.js";
import PasswordGate, { isUnlocked } from "../components/PasswordGate.jsx";
import { clearLocalQuestProgress, clearAllLocalUserData, syncQuestEpoch } from "../lib/questSync.js";

const REFRESH_MS = 15000;

function time(iso) {
  return iso ? new Date(iso).toLocaleTimeString("ru-RU", { timeZone: "Asia/Almaty" }) : "";
}

/** Состояние точки у команды: задание / адрес / прибытие / разгадка / подсказка. */
function cellState(row, stationId) {
  const id = String(stationId);
  if (row.stations?.[id] && row.notGuessed?.[id]) return "not_guessed_solved";
  if (row.notGuessed?.[id]) return "not_guessed";
  if (row.stations?.[id]) return "solved";
  if (row.arrivals?.[id]) return "arrived";
  if (row.riddleSolved?.[id]) return "riddle";
  if (row.hints?.[id]) return "hinted";
  return "empty";
}

const CELL_STYLE = {
  solved: { background: "rgba(76, 217, 100, 0.22)", color: "#4cd964", label: "✓" },
  not_guessed: { background: "rgba(255, 107, 107, 0.22)", color: "#ff8585", label: "❌" },
  not_guessed_solved: { background: "rgba(255, 107, 107, 0.25)", color: "#ff8585", label: "❌" },
  arrived: { background: "rgba(255, 193, 7, 0.18)", color: "var(--accent)", label: "📍" },
  riddle: { background: "rgba(107, 229, 201, 0.18)", color: "#6be5c9", label: "🔓" },
  hinted: { background: "rgba(255, 193, 7, 0.25)", color: "#ffc107", label: "💡" },
  empty: { background: "rgba(255,255,255,0.04)", color: "var(--muted)", label: "" },
};

const KIND_LABEL = {
  video: "🎬 видео",
  photo: "📸 фото",
  text: "💬 текст",
};

/** Что показать как локацию материала: текст капитана или номер точки с названием. */
function materialLocationText(m) {
  if (m.station != null && m.station !== "") {
    const st = QUEST.stations.find((s) => String(s.id) === String(m.station));
    if (st) return `Точка ${m.station}: ${st.name}`;
    return `Точка ${m.station}`;
  }
  if (m.location) {
    const locLower = m.location.toLowerCase();
    for (const st of QUEST.stations) {
      if (
        locLower === String(st.id) ||
        locLower === `точка ${st.id}` ||
        locLower === `точка ${st.name.toLowerCase()}` ||
        locLower.includes(st.name.toLowerCase())
      ) {
        return `Точка ${st.id}: ${st.name}`;
      }
    }
    return m.location;
  }
  return "Локация не указана";
}

/** Определение последней пройденной локации и времени активности команды */
function getLastStationInfo(row, latestMaterial) {
  const allActions = [];
  const addActions = (dict, type) => {
    for (const [sid, val] of Object.entries(dict || {})) {
      const t = typeof val === "object" ? val?.at : val;
      if (t) allActions.push({ sid: Number(sid), time: t, type });
    }
  };
  addActions(row.stations, "Задание");
  addActions(row.arrivals, "Прибытие");
  addActions(row.riddleSolved, "Разгадка");
  addActions(row.notGuessed, "Адрес");

  allActions.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  if (allActions.length > 0) {
    const top = allActions[0];
    const st = QUEST.stations.find((s) => Number(s.id) === top.sid);
    return {
      time: top.time,
      stationId: top.sid,
      stationName: st ? st.name : `Точка ${top.sid}`,
      type: top.type,
      isFinished: !!row.finishedAt,
    };
  }

  if (latestMaterial) {
    const st = latestMaterial.station != null
      ? QUEST.stations.find((s) => String(s.id) === String(latestMaterial.station))
      : null;
    return {
      time: latestMaterial.at,
      stationId: latestMaterial.station,
      stationName: st ? st.name : materialLocationText(latestMaterial),
      type: "Материал",
      isFinished: false,
    };
  }

  return null;
}

/** Сопоставление материала со станцией по id или тексту локации */
function matchSubmissionToStation(m, station) {
  const sid = String(station.id);
  if (m.station != null && String(m.station) === sid) return true;
  if (m.location) {
    const loc = m.location.toLowerCase();
    const stName = station.name.toLowerCase();
    if (
      loc.includes(stName) ||
      loc.includes(`точка ${sid}`) ||
      loc.includes(`точка ${station.id}`) ||
      loc.includes(`локация ${sid}`)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Доска прогресса для организаторов: все команды и все точки на одном экране.
 * Обновляется сама раз в 15 секунд — можно оставить открытой на планшете.
 */
export default function AdminProgress() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [rows, setRows] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [total, setTotal] = useState(QUEST.stations.length);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [marking, setMarking] = useState(null);
  const [resetting, setResetting] = useState(false);

  async function handleMarkArrival(row, stationId) {
    if (!row.teamNumber) return;
    setMarking(`${row.key}-${stationId}`);
    try {
      await adminMarkArrival({ teamNumber: row.teamNumber, stationId });
      const data = await fetchStandings();
      setRows(data.rows || []);
      setErr("");
    } catch (e) {
      setErr(e.message || "Не удалось засчитать прибытие.");
    } finally {
      setMarking(null);
    }
  }

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
      setSubmissions((prev) =>
        prev.filter((s) => Number(s.teamNumber) !== Number(row.teamNumber))
      );
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
      clearAllLocalUserData();
      if (data.questId) {
        syncQuestEpoch(data.questId);
      }
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
      setSubmissions([]);
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
        const [standingsRes, materialsRes] = await Promise.allSettled([
          fetchStandings(),
          fetchSubmissions(),
        ]);
        if (stop) return;

        if (standingsRes.status === "fulfilled") {
          setRows(standingsRes.value.rows || []);
          setTotal(standingsRes.value.total || QUEST.stations.length);
          setUpdatedAt(new Date());
          setErr("");
        } else {
          setErr(standingsRes.reason?.message || "Не удалось получить данные.");
        }

        if (materialsRes.status === "fulfilled") {
          setSubmissions(materialsRes.value.submissions || []);
        }
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

  const started = rows.filter(
    (r) =>
      r.solved > 0 ||
      Object.keys(r.arrivals || {}).length ||
      Object.keys(r.riddleSolved || {}).length ||
      Object.keys(r.notGuessed || {}).length ||
      Object.keys(r.hints || {}).length
  );
  const finished = rows.filter((r) => r.finishedAt);

  // Последний материал команды — показываем локацию прямо в строке таблицы.
  // submissions уже отсортированы сервером: сначала новые.
  const latestByTeam = new Map();
  for (const m of submissions) {
    if (m.teamNumber && !latestByTeam.has(Number(m.teamNumber))) {
      latestByTeam.set(Number(m.teamNumber), m);
    }
  }

  return (
    <div className="card admin board-card">
      <div className="eyebrow">Админ · ход игры</div>
      <h2>Прогресс команд</h2>
      <p className="muted">
        Обновляется само каждые 15 секунд. 🔓 — локация разгадана, 📍 — прибытие
        подтверждено, ✓ — задание завершено, 💡 — подсказка, ❌ — открыт адрес.
        ⭐ — баллы за локацию (без творческих).
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

      <div className="board-scroll">
        <table className="board">
          <thead>
            <tr>
              <th className="board-team">Команда и капитан</th>
              {QUEST.stations.map((s) => (
                <th
                  key={s.id}
                  title={`${s.id}. ${s.name}`}
                  style={{
                    minWidth: 125,
                    maxWidth: 160,
                    padding: "8px 6px",
                    verticalAlign: "top",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13, color: "var(--accent)" }}>
                    Точка {s.id}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#d7fff6",
                      lineHeight: 1.25,
                      marginTop: 3,
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                    }}
                  >
                    {s.name}
                  </div>
                </th>
              ))}
              <th>Итог</th>
              <th>Пройдено</th>
              <th style={{ minWidth: 155 }}>Последняя локация</th>
              <th style={{ minWidth: 260 }}>Материалы капитанов и время</th>
              <th className="no-print">Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={QUEST.stations.length + 6}
                  style={{ textAlign: "center", padding: "30px 10px", color: "var(--muted)" }}
                >
                  Пока ни одной команды. Как только капитаны зарегистрируются, они появятся в этой таблице.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const teamMaterials = submissions.filter((m) => {
                  if (r.teamNumber && m.teamNumber && Number(m.teamNumber) === Number(r.teamNumber)) return true;
                  if (r.captainName && m.captainName && r.captainName.trim().toLowerCase() === m.captainName.trim().toLowerCase()) return true;
                  if (r.teamName && m.teamName && r.teamName.trim().toLowerCase() === m.teamName.trim().toLowerCase()) return true;
                  return false;
                });
                const lastInfo = getLastStationInfo(r, latestByTeam.get(Number(r.teamNumber)));

                return (
                  <tr key={r.key}>
                    <td className="board-team">
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                        {r.finishedAt && <span className="board-cup">🏆</span>}
                        <span style={{ fontWeight: 800, fontSize: 14 }}>
                          {r.teamNumber ? `№${r.teamNumber}` : "Одиночка"}
                        </span>
                        <span style={{ color: "var(--txt)", fontWeight: 700, fontSize: 14 }}>
                          {r.teamName ? `«${r.teamName}»` : "(без названия)"}
                        </span>
                      </div>
                      {r.captainName ? (
                        <div style={{ fontSize: 12, color: "#ffcc4d", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                          <span>👑</span>
                          <span><b>{r.captainName}</b></span>
                          {r.captainPhone && <span className="muted tiny" style={{ margin: 0 }}>({r.captainPhone})</span>}
                        </div>
                      ) : (
                        <div className="muted tiny" style={{ marginTop: 2 }}>
                          Капитан не указан
                        </div>
                      )}
                    </td>
                    {QUEST.stations.map((s) => {
                      const state = cellState(r, s.id);
                      const style = CELL_STYLE[state];
                      const sid = String(s.id);
                      const arrivalAt = typeof r.arrivals?.[sid] === "object" ? r.arrivals[sid]?.at : r.arrivals?.[sid];
                      const solvedAt = typeof r.stations?.[sid] === "object" ? r.stations[sid]?.at : r.stations?.[sid];
                      const riddleAt = typeof r.riddleSolved?.[sid] === "object" ? r.riddleSolved[sid]?.at : r.riddleSolved?.[sid];
                      const hintAt = typeof r.hints?.[sid] === "object" ? r.hints[sid]?.at : r.hints?.[sid];
                      const notGuessedAt = typeof r.notGuessed?.[sid] === "object" ? r.notGuessed[sid]?.at : r.notGuessed?.[sid];
                      const isNotGuessed = Boolean(notGuessedAt);
                      const stationScore = isNotGuessed ? 0 : Number(r.scores?.[sid] ?? 0);
                      const scoreText = s.id === 0 ? "—" : `${stationScore} б.`;

                      // Собираем ВСЕ действия с временами (не стираем по мере прогресса)
                      const actions = [];
                      if (riddleAt) actions.push({ icon: "🔓", label: "Разгадал", t: time(riddleAt) });
                      if (arrivalAt) actions.push({ icon: "📍", label: "Прибыл", t: time(arrivalAt) });
                      if (hintAt) actions.push({ icon: "💡", label: "Подсказка", t: time(hintAt) });
                      if (notGuessedAt) actions.push({ icon: "❌", label: "Адрес открыт", t: time(notGuessedAt) });
                      if (solvedAt) actions.push({ icon: "✓", label: "Задание", t: time(solvedAt) });

                      // Проверяем материалы для этой конкретной станции
                      const stMaterials = teamMaterials.filter((m) => matchSubmissionToStation(m, s));

                      // Ручное прибытие: капитан разгадал, но не подтвердил прибытие.
                      const canMarkArrival = Boolean(
                        r.teamNumber && (riddleAt || s.id === 1 || s.id === 0) && !arrivalAt && !notGuessedAt
                      );
                      const markKey = `${r.key}-${s.id}`;

                      // Tooltip: все действия с временами и баллы
                      const titleParts = [s.name];
                      if (isNotGuessed) {
                        titleParts.push("❌ Локация не засчитана: 0 б. (капитан не отгадал загадку и открыл адрес)");
                      } else {
                        titleParts.push(`⭐ Баллы: ${scoreText}`);
                      }
                      for (const a of actions) {
                        titleParts.push(`${a.icon} ${a.label}: ${a.t}`);
                      }
                      if (stMaterials.length) {
                        titleParts.push(`📎 Материалов: ${stMaterials.length}`);
                        for (const sm of stMaterials) {
                          titleParts.push(`  • ${KIND_LABEL[sm.kind] || sm.kind}: ${time(sm.at)}`);
                        }
                      }

                      return (
                        <td key={s.id} className="board-cell">
                          <div
                            className="board-dot"
                            style={{ background: style.background, color: style.color }}
                            title={titleParts.join("\n")}
                          >
                            {actions.length === 0 ? (
                              style.label
                            ) : (
                              actions.map((a, i) => (
                                <div key={i}>
                                  {a.icon} {a.label} {a.t}
                                </div>
                              ))
                            )}
                            {isNotGuessed ? (
                              <div
                                style={{
                                  marginTop: 4,
                                  fontWeight: 700,
                                  fontSize: 10,
                                  color: "#ff9999",
                                  background: "rgba(255, 69, 58, 0.22)",
                                  padding: "2px 5px",
                                  borderRadius: 4,
                                  border: "1px solid rgba(255, 69, 58, 0.4)",
                                  lineHeight: 1.25,
                                  whiteSpace: "normal",
                                  wordBreak: "break-word",
                                  maxWidth: 130,
                                  textAlign: "center",
                                }}
                              >
                                ❌ Не засчитана (0 б.)
                              </div>
                            ) : (
                              <div style={{ marginTop: 4, fontWeight: 800, fontSize: 11 }}>
                                ⭐ {scoreText}
                              </div>
                            )}
                            {stMaterials.length > 0 && (
                              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                                {stMaterials.map((sm, smIdx) => (
                                  <div
                                    key={smIdx}
                                    style={{
                                      background: "rgba(107, 229, 201, 0.18)",
                                      border: "1px solid rgba(107, 229, 201, 0.35)",
                                      color: "#b8f7c4",
                                      borderRadius: 4,
                                      padding: "2px 4px",
                                      fontSize: 10,
                                      fontWeight: 600,
                                      textAlign: "left",
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 3 }}>
                                      <span>{sm.kind === "video" ? "🎬" : sm.kind === "photo" ? "📸" : "💬"}</span>
                                      <span style={{ fontSize: 9, opacity: 0.9 }}>{time(sm.at)}</span>
                                    </div>
                                    {sm.text && (
                                      <div style={{ fontSize: 8, opacity: 0.8, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 }}>
                                        {sm.text}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {canMarkArrival && (
                              <button
                                className="btn board-mini-btn"
                                disabled={marking === markKey}
                                onClick={() => handleMarkArrival(r, s.id)}
                                title="Засчитать прибытие этой команды сейчас"
                              >
                                {marking === markKey ? "…" : "📍 Засчитать"}
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="board-num">
                      <b>{r.totalScore ?? 0}</b> б.
                    </td>
                    <td className="board-num">
                      {r.solved}/{total}
                    </td>
                    <td className="board-num" style={{ textAlign: "center", minWidth: 155, fontSize: 12 }}>
                      {lastInfo ? (
                        <div>
                          <div style={{ fontWeight: 700, color: lastInfo.isFinished ? "#4cd964" : "#ffcc4d" }}>
                            {lastInfo.isFinished ? "🏁 Финиш" : `Точка ${lastInfo.stationId}: ${lastInfo.stationName}`}
                          </div>
                          <div className="muted tiny" style={{ marginTop: 2 }}>
                            🕒 {time(lastInfo.time)} {lastInfo.type ? `(${lastInfo.type})` : ""}
                          </div>
                        </div>
                      ) : (
                        time(r.lastAt) || "—"
                      )}
                    </td>
                    <td style={{ textAlign: "left", minWidth: 260, maxWidth: 360, whiteSpace: "normal", verticalAlign: "top" }}>
                      {teamMaterials.length === 0 ? (
                        <span className="muted tiny">пока нет</span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", paddingRight: 4 }}>
                          {teamMaterials.map((m, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: "6px 8px",
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                                <span style={{ fontWeight: 700, color: "var(--accent)" }}>
                                  {m.kind === "video" ? "🎬 Видео" : m.kind === "photo" ? "📸 Фото" : "💬 Текст"}
                                </span>
                                <span
                                  style={{
                                    background: "rgba(255, 204, 77, 0.15)",
                                    color: "#ffcc4d",
                                    padding: "1px 6px",
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 700,
                                  }}
                                >
                                  🕒 {time(m.at)}
                                </span>
                              </div>
                              <div style={{ color: "#d7fff6", fontWeight: 600, marginTop: 3, fontSize: 12 }}>
                                📍 {materialLocationText(m)}
                              </div>
                              {m.text && (
                                <div className="muted tiny" style={{ marginTop: 2, whiteSpace: "pre-wrap", color: "#ccc" }}>
                                  📝 {m.text}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
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
                );
              }))}
            </tbody>
          </table>
        </div>


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

      {/* ← КНОПКА НАЗАД */}
      <div style={{ display: "flex", justifyContent: "center", margin: "24px 0 8px" }}>
        <button
          className="btn ghost no-print"
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate("/admin");
          }}
          style={{ minWidth: 180 }}
        >
          ← Назад
        </button>
      </div>
    </div>
  );
}
