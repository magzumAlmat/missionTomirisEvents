import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { fetchStandings, fetchSubmissions, deleteTeam, resetQuest, adminAdjustStationScore, adminAdjustBonusScore, adminMarkArrival, HAS_BACKEND } from "../lib/api.js";
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

function completedStationCount(row) {
  return QUEST.stations.filter((station) =>
    station.id !== 0 && Boolean(row.stations?.[String(station.id)])
  ).length;
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
  const total = QUEST.stations.filter((station) => station.id !== 0).length;
  const [updatedAt, setUpdatedAt] = useState(null);
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [marking, setMarking] = useState(null);
  const [adjustingScore, setAdjustingScore] = useState(null);
  const [resetting, setResetting] = useState(false);

  async function handleAdjustStationScore(row, stationId, delta) {
    const adjustmentKey = `${row.key}-${stationId}`;
    setAdjustingScore(adjustmentKey);
    try {
      await adminAdjustStationScore({
        teamNumber: row.teamNumber,
        progressKey: row.key,
        stationId,
        delta,
      });
      const data = await fetchStandings();
      setRows(data.rows || []);
      setErr("");
    } catch (e) {
      setErr(e.message || "Не удалось изменить баллы.");
    } finally {
      setAdjustingScore(null);
    }
  }

  async function handleAdjustBonusScore(row, delta) {
    const adjustmentKey = `${row.key}-bonus`;
    setAdjustingScore(adjustmentKey);
    setRows((prevRows) =>
      prevRows.map((r) => {
        if (r.key === row.key) {
          const newBonus = (Number(r.bonusScore) || 0) + delta;
          const currentTotal = Number(r.totalScore) || 0;
          return {
            ...r,
            bonusScore: newBonus,
            totalScore: currentTotal + delta,
          };
        }
        return r;
      })
    );
    try {
      await adminAdjustBonusScore({
        teamNumber: row.teamNumber,
        progressKey: row.key,
        delta,
      });
      const data = await fetchStandings();
      setRows(data.rows || []);
      setErr("");
    } catch (e) {
      setErr(e.message || "Не удалось изменить бонусные баллы.");
      const data = await fetchStandings().catch(() => null);
      if (data?.rows) setRows(data.rows);
    } finally {
      setAdjustingScore(null);
    }
  }

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
    const solvedCount = completedStationCount(row);
    const hasProgress = row.solved > 0 || Object.keys(row.arrivals || {}).length > 0;
    const extra = hasProgress
      ? `\n⚠️ У команды есть прогресс (${solvedCount}/${total} точек) — он будет удалён.`
      : "";
    if (!window.confirm(
      `Удалить команду ${label}?\n` +
      `Будут удалены прогресс, материалы и регистрации капитана и участников.${extra}\n\n` +
      `После удаления участники смогут зарегистрироваться заново. Локальные данные на их устройствах очистятся при следующем обращении к сайту.`
    )) return;
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
      `• все материалы от капитанов\n` +
      `• регистрации капитанов и участников\n\n` +
      `Участники смогут зарегистрироваться заново. Локальные данные на их устройствах очистятся при следующем обращении к сайту.\n` +
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
        `🧹 Осталось регистраций: ${data.keptParticipants ?? 0}`
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
        ⭐ — баллы за локацию (без творческих). Кнопки −/+ в ячейках меняют баллы
        на 1, итог пересчитывается автоматически.
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
              <th
                style={{
                  minWidth: 120,
                  padding: "8px 6px",
                  verticalAlign: "middle",
                  textAlign: "center",
                  position: "sticky",
                  left: 0,
                  zIndex: 3,
                  background: "var(--bg2, #0d1224)",
                }}
              >
                Точка / Команда
              </th>
              {rows.map((r) => (
                <th
                  key={r.key}
                  style={{
                    minWidth: 160,
                    maxWidth: 200,
                    padding: "8px 6px",
                    verticalAlign: "top",
                    textAlign: "center",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
                      {r.finishedAt && <span className="board-cup">🏆</span>}
                      <span style={{ fontWeight: 800, fontSize: 13 }}>
                        {r.teamNumber ? `№${r.teamNumber}` : "Одиночка"}
                      </span>
                    </div>
                    <span style={{ color: "var(--txt)", fontWeight: 700, fontSize: 12 }}>
                      {r.teamName ? `«${r.teamName}»` : "(без названия)"}
                    </span>
                    {r.captainName ? (
                      <div style={{ fontSize: 11, color: "#ffcc4d", display: "flex", alignItems: "center", gap: 3, justifyContent: "center" }}>
                        <span>👑</span>
                        <span><b>{r.captainName}</b></span>
                      </div>
                    ) : (
                      <div className="muted tiny">Капитан не указан</div>
                    )}
                    {r.captainPhone && (
                      <span className="muted tiny" style={{ fontSize: 10 }}>({r.captainPhone})</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  style={{ textAlign: "center", padding: "30px 10px", color: "var(--muted)" }}
                >
                  Пока ни одной команды. Как только капитаны зарегистрируются, они появятся в этой таблице.
                </td>
              </tr>
            ) : (
              <>
                {QUEST.stations.map((s) => (
                  <tr key={s.id}>
                    <td
                      style={{
                        fontWeight: 800,
                        fontSize: 12,
                        textAlign: "center",
                        verticalAlign: "top",
                        padding: "10px 6px",
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        background: "var(--bg2, #0d1224)",
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
                    </td>
                    {rows.map((r) => {
                      const teamMaterials = submissions.filter((m) => {
                        if (r.teamNumber && m.teamNumber && Number(m.teamNumber) === Number(r.teamNumber)) return true;
                        if (r.captainName && m.captainName && r.captainName.trim().toLowerCase() === m.captainName.trim().toLowerCase()) return true;
                        if (r.teamName && m.teamName && r.teamName.trim().toLowerCase() === m.teamName.trim().toLowerCase()) return true;
                        return false;
                      });
                      const state = cellState(r, s.id);
                      const style = CELL_STYLE[state];
                      const sid = String(s.id);
                      const arrivalAt = typeof r.arrivals?.[sid] === "object" ? r.arrivals[sid]?.at : r.arrivals?.[sid];
                      const solvedAt = typeof r.stations?.[sid] === "object" ? r.stations[sid]?.at : r.stations?.[sid];
                      const riddleAt = typeof r.riddleSolved?.[sid] === "object" ? r.riddleSolved[sid]?.at : r.riddleSolved?.[sid];
                      const hintAt = typeof r.hints?.[sid] === "object" ? r.hints[sid]?.at : r.hints?.[sid];
                      const notGuessedAt = typeof r.notGuessed?.[sid] === "object" ? r.notGuessed[sid]?.at : r.notGuessed?.[sid];
                      const isNotGuessed = Boolean(notGuessedAt);
                      const stationScore = Number(r.scores?.[sid] ?? 0);
                      const manualScoreAdjustment = Number(r.manualScoreAdjustments?.[sid] || 0);
                      const scoreAdjustmentKey = `${r.key}-${s.id}`;
                      const scoreText = s.id === 0 ? "—" : `${stationScore} б.`;

                      const actions = [];
                      if (riddleAt) actions.push({ icon: "🔓", label: "Разгадал", t: time(riddleAt) });
                      if (arrivalAt) actions.push({ icon: "📍", label: "Прибыл", t: time(arrivalAt) });
                      if (hintAt) actions.push({ icon: "💡", label: "Подсказка", t: time(hintAt) });
                      if (notGuessedAt) actions.push({ icon: "❌", label: "Адрес открыт", t: time(notGuessedAt) });
                      if (solvedAt) actions.push({ icon: "✓", label: "Задание", t: time(solvedAt) });

                      const stMaterials = teamMaterials.filter((m) => matchSubmissionToStation(m, s));

                      const canMarkArrival = Boolean(
                        r.teamNumber && (riddleAt || s.id === 1 || s.id === 0) && !arrivalAt && !notGuessedAt
                      );
                      const markKey = `${r.key}-${s.id}`;

                      const titleParts = [s.name];
                      if (isNotGuessed) {
                        titleParts.push("❌ Капитан открыл адрес без самостоятельной разгадки");
                      }
                      titleParts.push(`⭐ Баллы: ${scoreText}`);
                      if (manualScoreAdjustment) {
                        titleParts.push(`✍️ Ручная корректировка: ${manualScoreAdjustment > 0 ? "+" : ""}${manualScoreAdjustment} б.`);
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
                        <td key={r.key} className="board-cell">
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
                            {isNotGuessed && (
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
                                ❌ Адрес открыт
                              </div>
                            )}
                            <div style={{ marginTop: 4, fontWeight: 800, fontSize: 11 }}>
                              ⭐ {scoreText}
                            </div>
                            {s.id !== 0 && (
                              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 5 }}>
                                <button
                                  type="button"
                                  aria-label={`Уменьшить баллы на локации ${s.id}`}
                                  title="Убавить 1 балл"
                                  disabled={adjustingScore === scoreAdjustmentKey}
                                  onClick={() => handleAdjustStationScore(r, s.id, -1)}
                                  style={{
                                    width: 24,
                                    height: 22,
                                    padding: 0,
                                    border: "1px solid rgba(255,255,255,0.25)",
                                    borderRadius: 5,
                                    background: "rgba(255,255,255,0.08)",
                                    color: "inherit",
                                    cursor: adjustingScore === scoreAdjustmentKey ? "not-allowed" : "pointer",
                                    opacity: adjustingScore === scoreAdjustmentKey ? 0.5 : 1,
                                  }}
                                >
                                  −
                                </button>
                                <span title="Ручная корректировка баллов" style={{ minWidth: 32, fontSize: 9, opacity: 0.85 }}>
                                  {manualScoreAdjustment > 0 ? `+${manualScoreAdjustment}` : manualScoreAdjustment} ручн.
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Увеличить баллы на локации ${s.id}`}
                                  title="Добавить 1 балл"
                                  disabled={adjustingScore === scoreAdjustmentKey}
                                  onClick={() => handleAdjustStationScore(r, s.id, 1)}
                                  style={{
                                    width: 24,
                                    height: 22,
                                    padding: 0,
                                    border: "1px solid rgba(255,255,255,0.25)",
                                    borderRadius: 5,
                                    background: "rgba(255,255,255,0.08)",
                                    color: "inherit",
                                    cursor: adjustingScore === scoreAdjustmentKey ? "not-allowed" : "pointer",
                                    opacity: adjustingScore === scoreAdjustmentKey ? 0.5 : 1,
                                  }}
                                >
                                  +
                                </button>
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
                  </tr>
                ))}

                {/* Бонусные баллы */}
                <tr>
                  <td
                    style={{
                      fontWeight: 800,
                      fontSize: 12,
                      textAlign: "center",
                      verticalAlign: "middle",
                      padding: "10px 6px",
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      background: "var(--bg2, #0d1224)",
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 13, color: "#ffcc4d" }}>
                      ⭐ Бонусные баллы
                    </div>
                  </td>
                  {rows.map((r) => {
                    const bonusScore = Number(r.bonusScore || 0);
                    const bonusAdjustmentKey = `${r.key}-bonus`;
                    return (
                      <td key={r.key} className="board-cell">
                        <div
                          className="board-dot"
                          style={{
                            background:
                              bonusScore > 0
                                ? "rgba(255, 204, 77, 0.18)"
                                : bonusScore < 0
                                ? "rgba(255, 107, 107, 0.18)"
                                : "rgba(255, 255, 255, 0.04)",
                            color:
                              bonusScore > 0
                                ? "#ffcc4d"
                                : bonusScore < 0
                                ? "#ff8585"
                                : "inherit",
                            padding: "8px 6px",
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: 12 }}>
                            ⭐ {bonusScore > 0 ? `+${bonusScore}` : bonusScore} б.
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              gap: 5,
                              marginTop: 5,
                            }}
                          >
                            <button
                              type="button"
                              aria-label={`Уменьшить бонусные баллы команды ${r.teamNumber || r.teamName}`}
                              title="Убавить 1 бонусный балл"
                              disabled={adjustingScore === bonusAdjustmentKey}
                              onClick={() => handleAdjustBonusScore(r, -1)}
                              style={{
                                width: 24,
                                height: 22,
                                padding: 0,
                                border: "1px solid rgba(255,255,255,0.25)",
                                borderRadius: 5,
                                background: "rgba(255,255,255,0.08)",
                                color: "inherit",
                                cursor:
                                  adjustingScore === bonusAdjustmentKey
                                    ? "not-allowed"
                                    : "pointer",
                                opacity: adjustingScore === bonusAdjustmentKey ? 0.5 : 1,
                                fontSize: 13,
                                fontWeight: 700,
                              }}
                            >
                              −
                            </button>
                            <span style={{ fontSize: 9, opacity: 0.85, minWidth: 32 }}>бонус</span>
                            <button
                              type="button"
                              aria-label={`Увеличить бонусные баллы команды ${r.teamNumber || r.teamName}`}
                              title="Добавить 1 бонусный балл"
                              disabled={adjustingScore === bonusAdjustmentKey}
                              onClick={() => handleAdjustBonusScore(r, 1)}
                              style={{
                                width: 24,
                                height: 22,
                                padding: 0,
                                border: "1px solid rgba(255,255,255,0.25)",
                                borderRadius: 5,
                                background: "rgba(255,255,255,0.08)",
                                color: "inherit",
                                cursor:
                                  adjustingScore === bonusAdjustmentKey
                                    ? "not-allowed"
                                    : "pointer",
                                opacity: adjustingScore === bonusAdjustmentKey ? 0.5 : 1,
                                fontSize: 13,
                                fontWeight: 700,
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Итог */}
                <tr>
                  <td
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      textAlign: "center",
                      padding: "10px 6px",
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      background: "var(--bg2, #0d1224)",
                      color: "var(--accent)",
                    }}
                  >
                    Итог
                  </td>
                  {rows.map((r) => (
                    <td key={r.key} className="board-num" style={{ textAlign: "center", fontWeight: 800, fontSize: 14 }}>
                      <b>{r.totalScore ?? 0}</b> б.
                    </td>
                  ))}
                </tr>

                {/* Пройдено */}
                <tr>
                  <td
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      textAlign: "center",
                      padding: "10px 6px",
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      background: "var(--bg2, #0d1224)",
                      color: "var(--accent)",
                    }}
                  >
                    Пройдено
                  </td>
                  {rows.map((r) => (
                    <td key={r.key} className="board-num" style={{ textAlign: "center" }}>
                      {completedStationCount(r)}/{total}
                    </td>
                  ))}
                </tr>

                {/* Последняя локация */}
                <tr>
                  <td
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      textAlign: "center",
                      padding: "10px 6px",
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      background: "var(--bg2, #0d1224)",
                      color: "var(--accent)",
                    }}
                  >
                    Последняя локация
                  </td>
                  {rows.map((r) => {
                    const lastInfo = getLastStationInfo(r, latestByTeam.get(Number(r.teamNumber)));
                    return (
                      <td key={r.key} className="board-num" style={{ textAlign: "center", fontSize: 12 }}>
                        {lastInfo ? (
                          <div>
                            <div style={{ fontWeight: 700, color: lastInfo.isFinished ? "#4cd964" : "#ffcc4d" }}>
                              {lastInfo.isFinished ? "🏁 Финиш" : `Точка ${lastInfo.stationId}`}
                            </div>
                            <div className="muted tiny" style={{ marginTop: 2 }}>
                              🕒 {time(lastInfo.time)}
                            </div>
                          </div>
                        ) : (
                          time(r.lastAt) || "—"
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Материалы */}
                <tr>
                  <td
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      textAlign: "center",
                      padding: "10px 6px",
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      background: "var(--bg2, #0d1224)",
                      color: "var(--accent)",
                    }}
                  >
                    Материалы
                  </td>
                  {rows.map((r) => {
                    const teamMaterials = submissions.filter((m) => {
                      if (r.teamNumber && m.teamNumber && Number(m.teamNumber) === Number(r.teamNumber)) return true;
                      if (r.captainName && m.captainName && r.captainName.trim().toLowerCase() === m.captainName.trim().toLowerCase()) return true;
                      if (r.teamName && m.teamName && r.teamName.trim().toLowerCase() === m.teamName.trim().toLowerCase()) return true;
                      return false;
                    });
                    return (
                      <td key={r.key} style={{ textAlign: "left", minWidth: 160, whiteSpace: "normal", verticalAlign: "top" }}>
                        {teamMaterials.length === 0 ? (
                          <span className="muted tiny">пока нет</span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
                            {teamMaterials.map((m, idx) => (
                              <div
                                key={idx}
                                style={{
                                  padding: "5px 7px",
                                  background: "rgba(255, 255, 255, 0.05)",
                                  border: "1px solid rgba(255, 255, 255, 0.12)",
                                  borderRadius: 6,
                                  fontSize: 11,
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 11 }}>
                                    {m.kind === "video" ? "🎬" : m.kind === "photo" ? "📸" : "💬"}
                                  </span>
                                  <span style={{ fontSize: 10, color: "#ffcc4d" }}>
                                    {time(m.at)}
                                  </span>
                                </div>
                                <div style={{ color: "#d7fff6", fontWeight: 600, marginTop: 2, fontSize: 10 }}>
                                  📍 {materialLocationText(m)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Действия */}
                <tr className="no-print">
                  <td
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      textAlign: "center",
                      padding: "10px 6px",
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      background: "var(--bg2, #0d1224)",
                      color: "var(--accent)",
                    }}
                  >
                    Действия
                  </td>
                  {rows.map((r) => (
                    <td key={r.key} className="board-num">
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
                  ))}
                </tr>
              </>
            )}
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
            title="Удалить команды, весь прогресс, материалы и регистрации участников. После этого они смогут зарегистрироваться заново."
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
