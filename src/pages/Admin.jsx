import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";
import { QUEST, INCLUDE_START_QR } from "../questConfig.js";
import PasswordGate, { isUnlocked } from "../components/PasswordGate.jsx";

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
      <button
        className="btn ghost no-print"
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
    </div>
  );
}
