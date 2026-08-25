import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import Slots from "../components/Slots.jsx";
import { fetchProgress, HAS_BACKEND } from "../lib/api.js";
import { getTeamNumber, setTeamNumber } from "../lib/team.js";
import { getPhone } from "../lib/phone.js";

export default function Progress() {
  const navigate = useNavigate();
  const { letters, solvedCount, total, allSolved, isSolved, letterFor, applyServer, reset } =
    useProgress();

  const [teamNo, setTeamNo] = useState(getTeamNumber());
  const [restore, setRestore] = useState("idle"); // idle | sending | done
  const [err, setErr] = useState("");

  /**
   * Прогресс дублируется на сервере, поэтому его можно вернуть на другом
   * телефоне или после очистки браузера — по номеру команды или телефону.
   */
  async function onRestore() {
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён (VITE_API_URL).");
      return;
    }
    if (!teamNo && !getPhone()) {
      setErr("Введите номер команды.");
      return;
    }
    setRestore("sending");
    try {
      setTeamNumber(teamNo);
      const data = await fetchProgress({ teamNumber: teamNo, phone: getPhone() });
      applyServer(data.stations, data.finishedAt);
      setRestore("done");
    } catch (e) {
      setRestore("idle");
      setErr(e.message || "Не удалось получить прогресс.");
    }
  }

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
                {got ? letterFor(s.id) || "?" : "—"}
              </b>
            </li>
          );
        })}
      </ul>

      {allSolved ? (
        <div className="feedback ok">
          ✓ Все точки пройдены! Возвращайтесь к организаторам — время финиша уже
          записано.
        </div>
      ) : (
        <p className="center muted mt">
          Найдите и разгадайте все точки — время последней и определяет победителя.
        </p>
      )}

      <div className="field-block mt">
        <label className="field-label">Сменили телефон? Восстановите прогресс</label>
        <input
          type="number"
          inputMode="numeric"
          placeholder="Номер команды"
          value={teamNo}
          onChange={(e) => setTeamNo(e.target.value.replace(/\D/g, ""))}
        />
        <button
          className="btn ghost mt"
          onClick={onRestore}
          disabled={restore === "sending"}
          style={{ width: "100%" }}
        >
          {restore === "sending" ? "Загружаем…" : "⤓ Загрузить прогресс с сервера"}
        </button>
        {restore === "done" && (
          <div className="feedback ok">✓ Прогресс загружен с сервера</div>
        )}
        {err && <div className="feedback err">{err}</div>}
      </div>

      <button className="btn ghost" onClick={() => navigate("/")}>
        На главную
      </button>

      {solvedCount > 0 && (
        <button
          className="btn ghost"
          style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}
          onClick={() => {
            if (confirm("Очистить буквы на этом телефоне? На сервере прогресс останется.")) {
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
