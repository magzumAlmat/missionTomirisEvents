import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";
import { QUEST, INCLUDE_START_QR } from "../questConfig.js";
import PasswordGate, { isUnlocked } from "../components/PasswordGate.jsx";
import { fetchCaptains, createCaptain, updateCaptainSlots, moveUserBetweenCaptains, unsubscribeFromCaptain, fetchSoloUsers } from "../lib/api.js";

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
  const [activeTab, setActiveTab] = useState("qr"); // qr | captains | solo

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

  const items = useMemo(() => buildItems(base), [base]);

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
    if (!unlocked || activeTab !== "solo") return;
    fetchSoloUsers()
      .then((data) => setSoloUsers(data.users || []))
      .catch(() => {});
  }, [unlocked, activeTab, captains]);

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
          { key: "solo", label: "🙋 Одиночные" },
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
              placeholder="Количество слотов"
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
              placeholder="Новое кол-во"
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
              onChange={(e) => setMoveFromId(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white" }}
            >
              <option value="">Откуда</option>
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
            <input
              type="tel"
              placeholder="Телефон пользователя"
              value={movePhone}
              onChange={(e) => setMovePhone(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "white" }}
            />
          </div>
          <button className="btn mt" onClick={onMoveUser} style={{ width: "100%" }}>
            Переместить
          </button>
        </div>
      )}

      {/* Одиночные пользователи */}
      {activeTab === "solo" && (
        <div>
          <h3>🙋 Одиночные пользователи</h3>
          {soloUsers.length === 0 ? (
            <p className="muted">Пока нет одиночных пользователей.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {soloUsers.map((u, i) => (
                <div key={i} style={{ padding: 10, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
                  <strong>{u.name}</strong> ({u.phone})
                  {u.hasCar ? " 🚗" : " 🚶"}
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