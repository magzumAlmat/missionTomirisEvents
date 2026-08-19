/**
 * Генерация QR-кодов для квеста средствами Node.js (библиотека `qrcode`).
 *
 * Использование:
 *   npm run qr -- https://твой-логин.github.io/EventTomiris/
 *   # или через переменную окружения:
 *   QUEST_BASE_URL=https://site/ npm run qr
 *
 * Что делает:
 *   • создаёт папку qr-output/
 *   • кладёт по одному PNG на каждую точку (и стартовый, если включён)
 *   • собирает печатный лист qr-output/index.html со всеми кодами
 *
 * Коды статические: внутри зашит адрес вида <base>#/s/<id>. Пока сайт лежит
 * по этому адресу — коды работают вечно.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import QRCode from "qrcode";
import { QUEST, INCLUDE_START_QR } from "../src/questConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "qr-output");

const QR_OPTS = { width: 600, margin: 2, errorCorrectionLevel: "M" };

function getBaseUrl() {
  let base = process.argv[2] || process.env.QUEST_BASE_URL || "";
  base = base.trim().replace(/#.*$/, ""); // убираем хвост с #, если ввели целиком
  return base;
}

function targetFor(id) {
  const base = getBaseUrl();
  const sep = base.endsWith("/") ? "" : "/";
  // HashRouter: маршруты живут после #, поэтому сайт можно хостить статически
  return id == null ? `${base}${sep}#/` : `${base}${sep}#/s/${id}`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

async function main() {
  const base = getBaseUrl();
  if (!base) {
    console.error(
      "\n❌ Не указан адрес сайта.\n\n" +
        "Запусти так:\n" +
        "  npm run qr -- https://твой-логин.github.io/EventTomiris/\n\n" +
        "или задай переменную окружения QUEST_BASE_URL.\n"
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const items = [];
  if (INCLUDE_START_QR) {
    items.push({ file: "start.png", title: "Старт / афиша", name: "Начало квеста", url: targetFor(null) });
  }
  for (const s of QUEST.stations) {
    const file = `point-${String(s.id).padStart(2, "0")}.png`;
    items.push({ file, title: `Точка ${s.id}`, name: s.name, url: targetFor(s.code || s.id) });
  }

  for (const it of items) {
    await QRCode.toFile(path.join(OUT_DIR, it.file), it.url, QR_OPTS);
    console.log(`✅ ${it.file.padEnd(16)} → ${it.url}`);
  }

  // Печатный лист
  const cards = items
    .map(
      (it) => `
    <div class="card">
      <div class="n">${esc(it.title)}</div>
      <div class="name">${esc(it.name)}</div>
      <img src="./${it.file}" alt="${esc(it.title)}" />
      <div class="url">${esc(it.url)}</div>
      <div class="cut">— — — вырезать по контуру — — —</div>
    </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QR-коды квеста — печать</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#f3f5fa;color:#1a2036;margin:0;padding:24px}
  h1{text-align:center;font-size:20px;margin:0 0 4px}
  .sub{text-align:center;color:#6b7391;font-size:13px;margin:0 0 20px}
  .sheet{max-width:900px;margin:0 auto;display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
  .card{background:#fff;border:1px solid #e2e6f0;border-radius:14px;padding:18px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;break-inside:avoid}
  .card .n{font-size:13px;font-weight:800;color:#3b5bfd;text-transform:uppercase;letter-spacing:.08em}
  .card .name{font-size:18px;font-weight:800}
  .card img{width:220px;height:220px;image-rendering:pixelated}
  .card .url{font-size:11px;color:#8a90a8;word-break:break-all}
  .card .cut{margin-top:6px;color:#b3b9cc;font-size:11px}
  @media print{body{background:#fff;padding:8px}.sub,h1{}.card{border:1px dashed #bbb}}
  @media (max-width:600px){.sheet{grid-template-columns:1fr}}
</style></head>
<body>
  <h1>QR-коды квеста «${esc(QUEST.title)}»</h1>
  <p class="sub">Ctrl/Cmd + P — распечатать. Каждый код подписан и отделён линией для вырезания.</p>
  <div class="sheet">${cards}
  </div>
</body></html>`;

  fs.writeFileSync(path.join(OUT_DIR, "index.html"), html, "utf8");

  console.log(`\n📄 Печатный лист: qr-output/index.html`);
  console.log(`📁 Готово: ${items.length} код(ов) в папке qr-output/\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
