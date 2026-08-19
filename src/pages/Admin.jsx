import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { QUEST, INCLUDE_START_QR } from "../questConfig.js";

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "";
const UNLOCK_KEY = "event_tomiris_admin_ok";

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

function PasswordGate({ onOk }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  function submit() {
    if (val === ADMIN_PASSWORD) {
      try {
        sessionStorage.setItem(UNLOCK_KEY, "1");
      } catch (e) {}
      onOk();
    } else {
      setErr(true);
    }
  }
  return (
    <div className="card">
      <div className="eyebrow">Админ</div>
      <h2>Вход для организатора</h2>
      <p className="muted">Введите пароль администратора.</p>
      <input
        type="password"
        placeholder="Пароль"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoFocus
      />
      <button className="btn" onClick={submit}>
        Войти
      </button>
      {err && <div className="feedback err">Неверный пароль.</div>}
    </div>
  );
}

export default function Admin() {
  const alreadyOk = (() => {
    try {
      return sessionStorage.getItem(UNLOCK_KEY) === "1";
    } catch (e) {
      return false;
    }
  })();
  const [unlocked, setUnlocked] = useState(!ADMIN_PASSWORD || alreadyOk);

  const defaultBase = useMemo(
    () => window.location.href.split("#")[0],
    []
  );
  const [base, setBase] = useState(defaultBase);
  const [images, setImages] = useState({}); // key -> dataURL

  const items = useMemo(() => buildItems(base), [base]);

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

  if (!unlocked) return <PasswordGate onOk={() => setUnlocked(true)} />;

  return (
    <div className="card admin">
      <div className="eyebrow">Админ · генерация QR</div>
      <h2>QR-коды точек</h2>
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
    </div>
  );
}
