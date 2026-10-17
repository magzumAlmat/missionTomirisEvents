import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";
import { QUEST, INCLUDE_START_QR } from "../questConfig.js";
import PasswordGate, { isUnlocked } from "../components/PasswordGate.jsx";
import { fetchCaptains, createCaptain, updateCaptainSlots, moveUserBetweenCaptains, unsubscribeFromCaptain, fetchSoloUsers, deleteAllCaptains, deleteAllParticipants, fetchSettings, saveSettings } from "../lib/api.js";

/** Список точек, для которых генерируем QR. */
function buildItems(base) {
  const root = base.replace(/#.*$/, "");
  const sep = root.endsWith("/") ? "" : "/";
  const items = [];
  if (INCLUDE_START_QR) {
    items.push({ key: "start", title: "Старт / афиша", name: "Начало квеста", url: `${root}${sep}#/` });
  }
  for (const s of QUEST.stations) {
    items.push({
      key: "s" + s.id,
      title: `Точка ${s.id}`,
      name: s.name,
      url: `${root}${sep}#/s/${s.code || s.id}`,
    });
  }
  return items;
}

export default function Admin() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [activeTab, setActiveTab] = useState("qr"); // qr | captains | solo | timer

  // QR-коды
  const defaultBase = useMemo(
    () => window.location.href.split("#")[0],
    []
  );
  const [base, setBase] = useState(defaultBase);
  const [images, setImages] = useState({}); // key -> dataURL

  // Капитаны
  const [captains, setCaptains] = useState([]);
  const [loadingCaptains, setLoadingCaptains] = useState(false);
  const [captainMsg, setCaptainMsg] = useState("");

  // Создание капитана
  const [newCaptainName, setNewCaptainName] = useState("");
  const [newCaptainPhone, setNewCaptainPhone] = useState("");
  const [newCaptainSlots, setNewCaptainSlots] = useState("5");
  const [newCaptainHasCar, setNewCaptainHasCar] = useState(true);

  // Обновление слотов
  const [updateCaptainId, setUpdateCaptainId] = useState("");
  const [updateSlots, setUpdateSlots] = useState("");

  // Перемещение пользователя
  const [moveFromId, setMoveFromId] = useState("");
  const [moveToId, setMoveToId] = useState("");
  const [movePhone, setMovePhone] = useState("");

  // Одиночные пользователи
  const [soloUsers, setSoloUsers] = useState([]);

  // Настройки обратного отсчёта
  const [timerTargetDate, setTimerTargetDate] = useState("");
  const [timerDisplayDate, setTimerDisplayDate] = useState("");
  const [timerDisplayTime, setTimerDisplayTime] = useState("");
  const [timerPlace, setTimerPlace] = useState("");
  const [timerForceOpen, setTimerForceOpen] = useState(false);
  const [timerMsg, setTimerMsg] = useState("");
  const [timerLoading, setTimerLoading] = useState(false);

  const items = useMemo(() => buildItems(base), [base]);

  // Загрузка настроек таймера
  useEffect(() => {
    if (!unlocked || activeTab !== "timer") return;
    let cancelled = false;
    setTimerLoading(true);
    fetchSettings()
      .then((data) => {
        if (!cancelled && data.settings) {
          setTimerTargetDate(data.settings.targetDate || "");
          setTimerDisplayDate(data.settings.displayDate || "");
          setTimerDisplayTime(data.settings.displayTime || "");
          setTimerPlace(data.settings.place || "");
          setTimerForceOpen(Boolean(data.settings.forceOpen));
        }
        if (!cancelled) setTimerLoading(false);
      })
      .catch(() => { if (!cancelled) setTimerLoading(false); });
    return () => { cancelled = true; };
  }, [unlocked, activeTab]);

  // Генерация QR
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    (async () => {
      const out = {};
      for (const it of items) {
        out[it.key] = await QRCode.toDataURL(it.url, {
          width: 600,
          margin: 2,
          errorCorrectionLevel: "M",
        });
      }
      if (!cancelled) setImages(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [items, unlocked]);

  // Загрузка капитанов
  useEffect(() => {
    if (!unlocked || activeTab !== "captains") return;
    let cancelled = false;
    setLoadingCaptains(true);
    fetchCaptains()
      .then((data) => {
        if (!cancelled) {
          setCaptains(data.captains || []);
          setLoadingCaptains(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingCaptains(false);
      });
    return () => { cancelled = true; };
  }, [unlocked, activeTab]);

  // Загрузка одиночных пользователей
  useEffect(() => {
    if (!unlocked) return;
    fetchSoloUsers()
      .then((data) => setSoloUsers(data.users || []))
      .catch(() => {});
  }, [unlocked, captains]);

  // Создание капитана
  async function onCreateCaptain() {
    setCaptainMsg("");
    try {
      await createCaptain({
        name: newCaptainName,
        phone: newCaptainPhone,
        slots: Number(newCaptainSlots) || 5,
        hasCar: newCaptainHasCar,
      });
      setCaptainMsg("✅ Капитан создан!");
      setNewCaptainName("");
      setNewCaptainPhone("");
      setNewCaptainSlots("5");
      // Перезагружаем список
      const data = await fetchCaptains();
      setCaptains(data.captains || []);
    } catch (e) {
      setCaptainMsg("❌ " + e.message);
    }
  }

  // Обновление слотов
  async function onUpdateSlots() {
    setCaptainMsg("");
    try {
      await updateCaptainSlots({
        captainId: updateCaptainId,
        slots: Number(updateSlots),
      });
      setCaptainMsg("✅ Слоты обновлены!");
      setUpdateSlots("");
      const data = await fetchCaptains();
      setCaptains(data.captains || []);
    } catch (e) {
      setCaptainMsg("❌ " + e.message);
    }
  }

  // Перемещение пользователя
  async function onMoveUser() {
    setCaptainMsg("");
    try {
      await moveUserBetweenCaptains({
        fromCaptainId: moveFromId,
        toCaptainId: moveToId,
        phone: movePhone,
      });
      setCaptainMsg("✅ Пользователь перемещён!");
      setMoveFromId("");
      setMoveToId("");
      setMovePhone("");
      const data = await fetchCaptains();
      setCaptains(data.captains || []);
    } catch (e) {
      setCaptainMsg("❌ " + e.message);
    }
  }

  // Отписка от капитана
  async function onUnsubscribe(captainId, phone) {
    setCaptainMsg("");
    try {
      await unsubscribeFromCaptain({ captainId, phone });
      setCaptainMsg("✅ Пользователь отписан!");
      const data = await fetchCaptains();
      setCaptains(data.captains || []);
    } catch (e) {
      setCaptainMsg("❌ " + e.message);
    }
  }

  // Удалить всех капитанов
  async function onDeleteAllCaptains() {
    if (!window.confirm("⚠️ Удалить ВСЕХ капитанов? Это действие необратимо.")) return;
    setCaptainMsg("");
    try {
      await deleteAllCaptains();
      setCaptainMsg("✅ Все капитаны удалены!");
      setCaptains([]);
      // Перезагружаем участников
      const data = await fetchSoloUsers();
      setSoloUsers(data.users || []);
    } catch (e) {
      setCaptainMsg("❌ " + e.message);
    }
  }

  // Сохранить настройки таймера
  async function onSaveTimer() {
    setTimerMsg("");
    try {
      await saveSettings({
        targetDate: timerTargetDate,
        displayDate: timerDisplayDate,
        displayTime: timerDisplayTime,
        place: timerPlace,
        forceOpen: timerForceOpen,
      });
      setTimerMsg("✅ Настройки старта и таймера успешно сохранены!");
    } catch (e) {
      setTimerMsg("❌ " + e.message);
    }
  }

  // Автозаполнение displayDate и displayTime из targetDate
  function onTargetDateChange(val) {
    setTimerTargetDate(val);
    if (val) {
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          const months = ["января", "февраля", "марта", "апреля", "мая", "июня",
            "июля", "августа", "сентября", "октября", "ноября", "декабря"];
          setTimerDisplayDate(`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`);
          setTimerDisplayTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
        }
      } catch {}
    }
  }

  // Удалить всех участников
  async function onDeleteAllParticipants() {
    if (!window.confirm("⚠️ Удалить ВСЕХ участников? Это действие необратимо.")) return;
    setCaptainMsg("");
    try {
      await deleteAllParticipants();
      setCaptainMsg("✅ Все участники удалены!");
      const data = await fetchSoloUsers();
      setSoloUsers(data.users || []);
    } catch (e) {
      setCaptainMsg("❌ " + e.message);
    }
  }

  if (!unlocked) return <PasswordGate onOk={() => setUnlocked(true)} />;

  return (
    <div className="card admin">
      <div className="eyebrow">Админ · управление</div>
      <h2>Панель администратора</h2>

      {/* Табы */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 10 }}>
        {[
          { key: "qr", label: "📱 QR-коды" },
          { key: "captains", label: "👑 Капитаны" },
          { key: "solo", label: "🙋 Участники" },
          { key: "timer", label: "⏱ Таймер" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`btn ${activeTab === tab.key ? "" : "ghost"}`}
            onClick={() => setActiveTab(tab.key)}
            style={{ flex: 1 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* QR-коды */}
      {activeTab === "qr" && (
        <>
          <p className="muted">
            Адрес сайта определён автоматически. Если выкладываешь на другой домен —
            поправь его здесь, коды пересоберутся.
          </p>

          <label className="field-label">Базовый адрес сайта</label>
          <input
            type="text"
            className="base-input"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          />

          <button className="btn no-print" onClick={() => window.print()}>
            🖨 Печать всех кодов
          </button>
          <button
            className="btn ghost"
            style={{ marginTop: 8 }}
            onClick={() => navigate("/admin/progress")}
          >
            📊 Прогресс команд
          </button>

          <div className="qr-grid">
            {items.map((it) => (
              <div className="qr-card" key={it.key}>
                <div className="qr-title">{it.title}</div>
                <div className="qr-name">{it.name}</div>
                {images[it.key] ? (
                  <img className="qr-img" src={images[it.key]} alt={it.title} />
                ) : (
                  <div className="qr-img placeholder">…</div>
                )}
                <div className="qr-url">{it.url}</div>
                {images[it.key] && (
                  <a
                    className="qr-dl no-print"
                    href={images[it.key]}
                    download={`${it.key}.png`}
                  >
                    Скачать PNG
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Управление капитанами */}
      {activeTab === "captains" && (
        <div>
          {captainMsg && (
            <div className={`feedback ${captainMsg.startsWith("✅") ? "ok" : "err"}`} style={{ marginBottom: 16 }}>
              {captainMsg}
            </div>
          )}

          {/* Список капитанов */}
          <h3>📋 Список капитанов</h3>
          {loadingCaptains ? (
            <p>Загрузка...</p>
          ) : captains.length === 0 ? (
            <p className="muted">Пока нет капитанов.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {captains.map((cap) => (
                <div key={cap.id} style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>{cap.name || cap.phone}</strong>
                      <span style={{ marginLeft: 12, color: "#aaa" }}>{cap.phone}</span>
                    </div>
                    <div>
                      <span style={{ 
                        padding: "4px 8px", 
                        borderRadius: 4, 
                        background: cap.availableSlots > 0 ? "rgba(76,217,100,0.2)" : "rgba(255,107,107,0.2)",
                        color: cap.availableSlots > 0 ? "#4cd964" : "#ff6b6b"
                      }}>
                        {cap.availableSlots} / {cap.slots} мест
                        {cap.hasCar ? " 🚗" : ""}
                      </span>
                    </div>
                  </div>
                  {cap.participants && cap.participants.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      <strong>Участники:</strong>
                      <ul style={{ margin: "4px 0 0 0", paddingLeft: 20 }}>
                        {cap.participants.map((p, i) => (
                          <li key={i}>
                            {p.name} ({p.phone})
                            {p.hasCar ? " 🚗" : ""}
                            <button
                              className="btn ghost"
                              style={{ marginLeft: 8, padding: "2px 6px", fontSize: 11 }}
                              onClick={() => onUnsubscribe(cap.id, p.phone)}
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Удалить всех капитанов */}
          <div style={{ marginTop: 24, padding: 16, background: "rgba(255,107,107,0.1)", borderRadius: 8, border: "1px solid rgba(255,107,107,0.3)" }}>
            <h3 style={{ margin: 0, color: "#ff6b6b" }}>🗑 Опасная зона</h3>
            <p style={{ fontSize: 13, color: "#aaa", margin: "8px 0 12px" }}>Удаление данных необратимо. Убедитесь, что знаете, что делаете.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn ghost"
                onClick={onDeleteAllCaptains}
                style={{ flex: 1, borderColor: "#ff6b6b", color: "#ff6b6b" }}
              >
                🗑 Удалить всех капитанов
              </button>
              <button
                className="btn ghost"
                onClick={onDeleteAllParticipants}
                style={{ flex: 1, borderColor: "#ff6b6b", color: "#ff6b6b" }}
              >
                🗑 Удалить всех участников
              </button>
            </div>
          </div>

          {/* Создание капитана */}
          <h3 style={{ marginTop: 24 }}>➕ Создать капитана</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input
              type="text"
              placeholder="Имя капитана"
              value={newCaptainName}
              onChange={(e) => setNewCaptainName(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white" }}
            />
            <input
              type="tel"
              placeholder="Телефон"
              value={newCaptainPhone}
              onChange={(e) => setNewCaptainPhone(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white" }}
            />
            <input
              type="number"
              min="2"
              max="5"
              placeholder="Количество слотов (от 2 до 5)"
              value={newCaptainSlots}
              onChange={(e) => setNewCaptainSlots(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white" }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className={`btn ${newCaptainHasCar ? "" : "ghost"}`}
                onClick={() => setNewCaptainHasCar(true)}
                style={{ flex: 1 }}
              >
                🚗 Да
              </button>
              <button
                className={`btn ${!newCaptainHasCar ? "" : "ghost"}`}
                onClick={() => setNewCaptainHasCar(false)}
                style={{ flex: 1 }}
              >
                🚶 Нет
              </button>
            </div>
          </div>
          <button className="btn green mt" onClick={onCreateCaptain} style={{ width: "100%" }}>
            Создать капитана
          </button>

          {/* Обновление слотов */}
          <h3 style={{ marginTop: 24 }}>🔧 Обновить слоты</h3>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <select
              value={updateCaptainId}
              onChange={(e) => setUpdateCaptainId(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white" }}
            >
              <option value="">Выберите капитана</option>
              {captains.map((cap) => (
                <option key={cap.id} value={cap.id}>{cap.name || cap.phone}</option>
              ))}
            </select>
            <input
              type="number"
              min="2"
              max="5"
              placeholder="Слотов (2-5)"
              value={updateSlots}
              onChange={(e) => setUpdateSlots(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white" }}
            />
          </div>
          <button className="btn mt" onClick={onUpdateSlots} style={{ width: "100%" }}>
            Обновить
          </button>

          {/* Перемещение пользователя */}
          <h3 style={{ marginTop: 24 }}>🔄 Переместить пользователя</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <select
              value={moveFromId}
              onChange={(e) => {
                setMoveFromId(e.target.value);
                setMovePhone("");
              }}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white" }}
            >
              <option value="">Откуда</option>
              <option value="__solo__">Без капитана</option>
              {captains.map((cap) => (
                <option key={cap.id} value={cap.id}>{cap.name || cap.phone}</option>
              ))}
            </select>
            <select
              value={moveToId}
              onChange={(e) => setMoveToId(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white" }}
            >
              <option value="">Куда</option>
              {captains.map((cap) => (
                <option key={cap.id} value={cap.id}>{cap.name || cap.phone}</option>
              ))}
            </select>
            <select
              value={movePhone}
              onChange={(e) => setMovePhone(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white" }}
            >
              <option value="">Пользователь</option>
              {moveFromId === "__solo__" && soloUsers.filter(u => !u.isCaptain && !u.isSubscribed).map((u, i) => (
                 <option key={"solo-" + i} value={u.phone}>
                   {u.name} ({u.phone})
                 </option>
              ))}
              {moveFromId && moveFromId !== "__solo__" && captains.find(c => c.id === moveFromId)?.participants?.map(p => (
                 <option key={moveFromId + "-" + p.phone} value={p.phone}>
                   {p.name} ({p.phone})
                 </option>
              ))}
            </select>
          </div>
          <button className="btn mt" onClick={onMoveUser} style={{ width: "100%" }}>
            Переместить
          </button>
        </div>
      )}

      {/* ⏱ Настройки обратного отсчёта */}
      {activeTab === "timer" && (
        <div>
          {timerMsg && (
            <div className={`feedback ${timerMsg.startsWith("✅") ? "ok" : "err"}`} style={{ marginBottom: 16 }}>
              {timerMsg}
            </div>
          )}

          {timerLoading ? (
            <p>Загрузка настроек...</p>
          ) : (
            <>
              <h3>⏱ Время старта и доступ к Точке 0</h3>
              <p className="muted" style={{ marginBottom: 16 }}>
                Укажите точную дату и время старта квеста. До наступления этого времени точка 0 закрыта для всех участников.
              </p>

              {(() => {
                const isNowStarted = timerForceOpen || (timerTargetDate && new Date(timerTargetDate).getTime() <= Date.now());
                return (
                  <div style={{
                    padding: 16,
                    background: isNowStarted ? "rgba(76,217,100,0.12)" : "rgba(255,107,107,0.12)",
                    borderRadius: 12,
                    border: `1px solid ${isNowStarted ? "rgba(76,217,100,0.4)" : "rgba(255,107,107,0.4)"}`,
                    marginBottom: 20
                  }}>
                    <div style={{
                      color: isNowStarted ? "#4cd964" : "#ff6b6b",
                      fontWeight: 700,
                      fontSize: 16,
                      display: "flex",
                      alignItems: "center",
                      gap: 8
                    }}>
                      <span>{isNowStarted ? "🟢" : "🔒"}</span>
                      {isNowStarted ? "ТОЧКА 0 ДОСТУПНА УЧАСТНИКАМ" : "ТОЧКА 0 ЗАБЛОКИРОВАНА"}
                    </div>
                    <div style={{ fontSize: 13, color: "#ccc", marginTop: 6, lineHeight: 1.5 }}>
                      {timerForceOpen
                        ? "Включён принудительный (досрочный) старт. Участники могут заходить на точку 0 прямо сейчас."
                        : isNowStarted
                        ? "Время старта наступило. Доступ к точке 0 открыт."
                        : `Точка 0 откроется автоматически в установленное время: ${timerDisplayDate} в ${timerDisplayTime}.`}
                    </div>
                  </div>
                );
              })()}

              <div style={{
                marginBottom: 20,
                padding: 14,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)"
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", color: "#fff", fontWeight: 600, fontSize: 15 }}>
                  <input
                    type="checkbox"
                    checked={timerForceOpen}
                    onChange={(e) => setTimerForceOpen(e.target.checked)}
                    style={{ width: 20, height: 20, accentColor: "#4cd964" }}
                  />
                  <span>⚡ Открыть доступ досрочно (принудительно открыть Точку 0 прямо сейчас)</span>
                </label>
                <p className="muted" style={{ fontSize: 12, margin: "6px 0 0 30px" }}>
                  Включите этот пункт, если хотите начать квест раньше времени или для тестирования прохождения.
                </p>
              </div>

              <label className="field-label" style={{ display: "block", marginTop: 16, marginBottom: 6, color: "#ccc", fontSize: 13, fontWeight: 600 }}>📅 Дата и время старта (ISO формат)</label>
              <input
                type="datetime-local"
                value={timerTargetDate ? timerTargetDate.slice(0, 16) : ""}
                onChange={(e) => onTargetDateChange(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 16 }}
              />

              <label className="field-label" style={{ display: "block", marginTop: 16, marginBottom: 6, color: "#ccc", fontSize: 13, fontWeight: 600 }}>🗓 Отображаемая дата (текстом, например: 18 октября 2026)</label>
              <input
                type="text"
                placeholder="18 октября 2026"
                value={timerDisplayDate}
                onChange={(e) => setTimerDisplayDate(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 16 }}
              />

              <label className="field-label" style={{ display: "block", marginTop: 16, marginBottom: 6, color: "#ccc", fontSize: 13, fontWeight: 600 }}>🕒 Отображаемое время (например: 12:00)</label>
              <input
                type="text"
                placeholder="12:00"
                value={timerDisplayTime}
                onChange={(e) => setTimerDisplayTime(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 16 }}
              />

              <label className="field-label" style={{ display: "block", marginTop: 16, marginBottom: 6, color: "#ccc", fontSize: 13, fontWeight: 600 }}>📍 Место проведения</label>
              <input
                type="text"
                placeholder="Парковка у школы 216, Адрес: Курильская улица, 17"
                value={timerPlace}
                onChange={(e) => setTimerPlace(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 16 }}
              />

              {timerTargetDate && (
                <div style={{ marginTop: 20, padding: 16, background: "rgba(76,217,100,0.1)", borderRadius: 8, border: "1px solid rgba(76,217,100,0.3)" }}>
                  <strong style={{ color: "#4cd964" }}>Предпросмотр:</strong>
                  <p style={{ margin: "8px 0 0", color: "#ccc" }}>
                    📅 {timerDisplayDate} · 🕒 {timerDisplayTime} · 📍 {timerPlace}
                  </p>
                  <p style={{ margin: "4px 0 0", color: "#aaa", fontSize: 13 }}>
                    ISO: {timerTargetDate} {timerForceOpen && "· ⚡ Досрочный старт ВКЛЮЧЕН"}
                  </p>
                </div>
              )}

              <button
                className="btn green mt"
                onClick={onSaveTimer}
                style={{ width: "100%", fontSize: 16, padding: 14, marginTop: 20 }}
              >
                💾 Сохранить настройки
              </button>
            </>
          )}
        </div>
      )}

      {/* Одиночные пользователи (и участники) */}
      {activeTab === "solo" && (
        <div>
          <h3>🙋 Все участники</h3>
          {soloUsers.length === 0 ? (
            <p className="muted">Пока нет участников.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {soloUsers.map((u, i) => (
                <div key={i} style={{ padding: 10, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
                  <strong>{u.name}</strong> ({u.phone})
                  {u.hasCar ? " 🚗" : " 🚶"}
                  {u.isCaptain && (
                    <span style={{ marginLeft: 8, color: "#e74c3c", fontSize: 13, fontWeight: "bold" }}>
                      👑 Капитан
                    </span>
                  )}
                  {u.isSubscribed && !u.isCaptain && (
                    <span style={{ marginLeft: 8, color: "#2ecc71", fontSize: 13 }}>
                      ✔️ В команде
                    </span>
                  )}
                  {u.hasTeam && u.teamName && (
                    <span style={{ marginLeft: 8, color: "#f39c12", fontSize: 13 }}>
                      👥 Команда: {u.teamName}
                    </span>
                  )}
                  <span style={{ marginLeft: 12, color: "#aaa", fontSize: 12 }}>
                    {new Date(u.registeredAt).toLocaleString("ru-RU")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}