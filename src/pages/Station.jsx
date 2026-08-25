import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";
import { useProgress } from "../useProgress.js";
import { notify, checkAnswer, HAS_BACKEND } from "../lib/api.js";
import { getTeamNumber, setTeamNumber } from "../lib/team.js";
import { getPhone, setPhone, isValidPhone } from "../lib/phone.js";

export default function Station() {
  const { id } = useParams();
  const navigate = useNavigate();
  const station = QUEST.stations.find((s) => s.code === id || String(s.id) === id);
  const stationId = station ? station.id : parseInt(id, 10);

  const { isSolved, letterFor, solve } = useProgress();
  const already = station ? isSolved(station.id) : false;

  const [phone, setPhoneState] = useState(getPhone());
  const [teamNo, setTeamNoState] = useState(getTeamNumber());
  const [answer, setAnswer] = useState("");
  const [arrive, setArrive] = useState("idle"); // idle | sending | done | error
  const [check, setCheck] = useState(already ? "done" : "idle"); // idle | sending | done | wrong
  const [revealed, setRevealed] = useState(already);
  const [letter, setLetter] = useState(station ? letterFor(station.id) : null);
  const [hint, setHint] = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    const solvedAlready = station ? isSolved(station.id) : false;
    setArrive("idle");
    setCheck(solvedAlready ? "done" : "idle");
    setRevealed(solvedAlready);
    setLetter(station ? letterFor(station.id) : null);
    setHint("");
    setAnswer("");
    setErr("");
  }, [stationId, station]);

  const phoneOk = isValidPhone(phone);

  function onPhoneChange(v) {
    setPhoneState(v);
    setPhone(v);
  }

  function onTeamNoChange(v) {
    const digits = v.replace(/\D/g, "");
    setTeamNoState(digits);
    setTeamNumber(digits);
  }

  if (!station) {
    return (
      <div className="card">
        <h2>Точка не найдена</h2>
        <p className="muted">Проверь QR-код.</p>
        <button className="btn ghost" onClick={() => navigate("/")}>
          В начало
        </button>
      </div>
    );
  }

  async function onArrived() {
    setErr("");
    if (!HAS_BACKEND) {
      setArrive("error");
      setErr("Бэкенд не подключён (VITE_API_URL). Запусти `npm run server`.");
      return;
    }
    if (!phoneOk) {
      setErr("Сначала введите номер телефона.");
      return;
    }
    setArrive("sending");
    try {
      await notify("arrived", {
        stationId: station.id,
        stationName: station.name,
        phone: phone.trim(),
        team: teamNo ? `команда №${teamNo}` : "",
      });
      setArrive("done");
    } catch (e) {
      setArrive("error");
      setErr(e.message || "Ошибка отправки");
    }
  }

  /**
   * Ответ проверяет СЕРВЕР: в исходниках сайта ответов и букв больше нет.
   * При верном ответе сервер отдаёт букву и подсказку и запоминает время
   * взятия точки — по нему судья определяет победителя.
   */
  async function onCheck() {
    setErr("");
    if (!HAS_BACKEND) {
      setErr("Бэкенд не подключён (VITE_API_URL). Запусти `npm run server`.");
      return;
    }
    if (!phoneOk && !teamNo) {
      setErr("Укажите номер команды или телефон — иначе прогресс не сохранится.");
      return;
    }
    if (!answer.trim()) {
      setErr("Введите ответ на загадку.");
      return;
    }
    setCheck("sending");
    try {
      const res = await checkAnswer({
        stationCode: station.code || station.id,
        answer: answer.trim(),
        phone: phone.trim(),
        teamNumber: teamNo || null,
      });
      if (!res.correct) {
        setCheck("wrong");
        setShake(true);
        setTimeout(() => setShake(false), 420);
        return;
      }
      setCheck("done");
      setLetter(res.letter);
      setHint(res.nextHint || "");
      setRevealed(true);
      solve(station.id, res.letter);
    } catch (e) {
      setCheck("idle");
      setErr(e.message || "Не удалось проверить ответ.");
    }
  }

  return (
    <div className={"card" + (shake ? " shake" : "")}>
      {revealed && <span className="done-badge">✓ Точка разгадана</span>}
      <div className="eyebrow">
        Точка {station.id} из {QUEST.stations.length} · {station.name}
      </div>
      <h2>{station.name}</h2>

      <div className="task">{station.task}</div>

      {!HAS_BACKEND && (
        <div className="feedback err">
          ⚠️ Бэкенд не подключён. Ответы проверяются на сервере, поэтому без него
          точку взять нельзя (задайте VITE_API_URL и запустите сервер).
        </div>
      )}

      <div className="field-block">
        <label className="field-label">Номер вашей команды</label>
        <input
          type="number"
          inputMode="numeric"
          placeholder="Например: 7"
          value={teamNo}
          onChange={(e) => onTeamNoChange(e.target.value)}
        />
        <p className="muted tiny" style={{ marginTop: 4 }}>
          Номер выдаётся при регистрации команды. Вводится один раз — дальше
          подставляется сам.
        </p>

        <label className="field-label mt">Ваш номер телефона</label>
        <input
          type="tel"
          inputMode="tel"
          placeholder="+7 708 737 37 72"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
        />
        {!phoneOk && phone.length > 0 && (
          <p className="center err-text tiny">Введите корректный номер (мин. 10 цифр).</p>
        )}
      </div>

      <div className="actions">
        {arrive === "done" && (
          <div className="feedback ok">✓ «Я прибыл» отправлено организаторам</div>
        )}
        <button
          className="btn arrive"
          onClick={onArrived}
          disabled={arrive === "sending" || !phoneOk}
        >
          {arrive === "sending"
            ? "Отправляем…"
            : arrive === "done"
            ? "📍 Отправить «Я прибыл» повторно"
            : "📍 Я прибыл"}
        </button>
      </div>

      {!revealed && (
        <div className="field-block mt">
          <label className="field-label">Ваш ответ на загадку</label>
          <input
            type="text"
            placeholder="Введите ответ"
            autoComplete="off"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCheck()}
          />
          <button
            className="btn green mt"
            onClick={onCheck}
            disabled={check === "sending"}
            style={{ width: "100%" }}
          >
            {check === "sending" ? "Проверяем…" : "🧩 Проверить ответ"}
          </button>
          {check === "wrong" && (
            <div className="feedback err">Неверный ответ. Попробуйте ещё раз.</div>
          )}
        </div>
      )}

      {err && <div className="feedback err">{err}</div>}

      {revealed && (
        <div className="reveal">
          <div className="letter">
            <span className="lbl">Твоя буква</span>
            <span className="val">{letter || "?"}</span>
          </div>
          {hint && (
            <p className="center">
              <b className="muted">Куда дальше:</b>
              <br />
              {hint}
            </p>
          )}
          <p className="center muted tiny">
            Капитан, не забудьте прислать фото или видео команды с этой точки
            боту-помощнику.
          </p>
          <button className="btn ghost" onClick={() => navigate("/progress")}>
            Посмотреть прогресс
          </button>
        </div>
      )}
    </div>
  );
}
