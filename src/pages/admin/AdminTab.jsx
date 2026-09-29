import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useNavigate, useParams } from "react-router-dom";
import PasswordGate, { isUnlocked } from "../../components/PasswordGate.jsx";
import { fetchCaptains, createCaptain, updateCaptainSlots, moveUserBetweenCaptains, unsubscribeFromCaptain, fetchSoloUsers } from "../../lib/api.js";

/**
 * AdminTab — полная панель администратора с разделами:
 *  - qr         — генерация QR-кодов для точек квеста
 *  - captains   — управление капитанами и участниками
 *  - solo       — одиночные (не зарегистрированные) пользователи
 *  - riddles    — раздел "Загадки" с загадками, вопросами, категориями
 */

/**
 * Вычисляет все возможные URL для точек квеста.
 * @param {string} base — базовый URL сайта без якоря (например: http://localhost:3000)
 * @returns {{key: string, title: string, name: string, url: string}[]}
 */
function buildItems(base) {
  const root = base.replace(/#.*$/, "");
  const sep = root.endsWith("/") ? "" : "/";
  const items = [];
  if (true) { // INCLUDE_START_QR === true
    items.push({ key: "start", title: "Старт / афиша", name: "Начало квеста", url: `${root}${sep}#/` });
  }
  for (let i = 1; i <= 9; i++) {
    items.push({
      key: `s${i}`,
      title: `Точка ${i}`,
      name: `Станция ${i}`,
      url: `${root}${sep}#/s/${i}`,
    });
  }
  return items;
}

// === Типы вопросов (для фильтрации) ===
const QUESTION_TYPES = {
  text: "Текст",
  image: "Картинка",
  video: "Видео",
};

// === Категории загадок (из handoff, но без 'null') ===
const CATEGORY_LIST = [
  "Логика и математика",
  "Земля",
  "История",
  "Литература",
  "Наука",
  "Техника",
];

// === Категории для фильтрации по типу загадки (из handoff) ===
const CATEGORY_LIST_TYPES = [
  { key: "logic_mathematics", title: "Логика и математика" },
  { key: "earth", title: "Земля" },
  { key: "history", title: "История" },
  { key: "literature", title: "Литература" },
  { key: "science", title: "Наука" },
  { key: "technology", title: "Техника" },
];

/**
 * AdminTab — главный компонент.
 */
export default function AdminTab() {
  const navigate = useNavigate();
  const { tab } = useParams(); // например: /admin/qr, /admin/captains, /admin/riddles
  const [unlocked, setUnlocked] = useState(isUnlocked);

  // --- Табы (навигация между разделами) ---
  const items = useMemo(
    () => [
      { key: "qr", label: "📱 QR-коды" },
      { key: "captains", label: "👑 Капитаны" },
      { key: "solo", label: "🙋 Участники" },
      { key: "riddles", label: "🧩 Загадки" }, // <-- новый раздел!
    ],
    []
  );

  // === Вкладка QR-коды (как в оригинале) ===
  const defaultBase = useMemo(() => window.location.href.split("#")[0], []);
  const [base, setBase] = useState(defaultBase);
  const [images, setImages] = useState({});

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    (async () => {
      const out = {};
      for (const it of buildItems(base)) {
        out[it.key] = await QRCode.toDataURL(it.url, { width: 600, margin: 2, errorCorrectionLevel: "M" });
      }
      if (!cancelled) setImages(out);
    })();
    return () => { cancelled = true; };
  }, [base, unlocked]);

  // === Вкладка Капитаны (как в оригинале, сокращённо) ===
  const [captains, setCaptains] = useState([]);
  const [loadingCaptains, setLoadingCaptains] = useState(false);
  const [captainMsg, setCaptainMsg] = useState("");

  useEffect(() => {
    if (!unlocked || tab !== "captains") return;
    let cancelled = false;
    setLoadingCaptains(true);
    fetchCaptains()
      .then((data) => {
        if (!cancelled) { setCaptains(data.captains || []), setLoadingCaptains(false); }
      })
      .catch(() => { if (!cancelled) setLoadingCaptains(false); });
    return () => { cancelled = true; };
  }, [unlocked, tab]);

  // === Вкладка Solo (как в оригинале, сокращённо) ===
  const [soloUsers, setSoloUsers] = useState([]);
  useEffect(() => {
    if (!unlocked || tab !== "solo") return;
    fetchSoloUsers()
      .then((data) => data && setSoloUsers(data.users || []))
      .catch(() => {});
  }, [unlocked, tab]);

  // === Вкладка ЗАГАДКИ — состояние раздела ===
  const [riddlesMode, setRiddlesMode] = useState("list"); // list | add-question | categories | settings
  const [activeRiddleId, setActiveRiddleId] = useState(null);
  const [filterText, setFilterText] = useState("");

  // Данные загадок (mock)
  const [riddles, setRiddles] = useState([]);
  const [loadingRiddles, setLoadingRiddles] = useState(false);

  useEffect(() => {
    if (!unlocked || tab !== "riddles") return;
    let cancelled = false;
    setLoadingRiddles(true);
    // Здесь можно вызвать fetchRiddles() из api.js
    // Пока используем mock-данные для демонстрации работы кнопок
    setTimeout(() => {
      if (!cancelled) {
        setRiddles([
          { id: 1, category: "logic_mathematics", title: "Загадка 1", questions: [{ id: 101, type: "text", question: "Какое число больше всех?", answer: "∞" }] },
          { id: 2, category: "history", title: "Загадка 2", questions: [{ id: 201, type: "text", question: "Кто был первым императором Рима?", answer: "Август" }] },
        ]);
        setLoadingRiddles(false);
      }
    }, 300);
    return () => { cancelled = true; };
  }, [unlocked, tab]);

  // === Кнопки в разделе ЗАГАДКИ (list) ===
  const [activeButtonInList, setActiveButtonInList] = useState(null); // null | "add-question" | "edit-category" | "settings"
  const [activeCategoryForEdit, setActiveCategoryForEdit] = useState(null);

  // === Кнопки в разделе ДОБАВИТЬ ВОПРОС (добавление) ===
  const [questionFormVisible, setQuestionFormVisible] = useState(false);
  const [newQuestionId, setNewQuestionId] = useState(null); // null | number

  // === Категории загадок — состояние фильтрации ===
  const [categories, setCategories] = useState([
    { id: "logic_mathematics", title: "Логика и математика" },
    { id: "earth", title: "Земля" },
    { id: "history", title: "История" },
    { id: "literature", title: "Литература" },
    { id: "science", title: "Наука" },
    { id: "technology", title: "Техника" },
  ]);

  // === Настройки — состояние фильтрации ===
  const [settings, setSettings] = useState({ showHints: true });
  const activeButtonInSettings = null;

  // === Функция перехода на редактирование загадки (из списка) ===
  const handleEditRiddle = (riddleId) => {
    setActiveRiddleId(riddleId);
  };

  // === Функция отправки вопроса (из формы добавления) ===
  const handleSaveQuestion = () => {
    console.log("Сохранение вопроса...");
    // Здесь вызов API
  };

  // === Рендер разделов ===
  let mainContent = null;

  if (tab === "riddles") {
    // Вложенная навигация внутри раздела Загадки
    const riddlesSubItems = [
      { key: "list", label: "📜 Список загадок" },
      { key: "add-question", label: "+ Вопрос к загадке" },
      { key: "categories", label: "🏷️ Категории загадок" },
      { key: "settings", label: "⚙️ Настройки загадки" },
    ];

    let subContent = null;

    // --- Раздел ЗАГАДКИ (list) ---
    if (riddlesMode === "list") {
      const filteredRiddles = riddles.filter(r =>
        !filterText || r.title.toLowerCase().includes(filterText.toLowerCase())
      );

      subContent = (
        <div>
          {/* Кнопка фильтра */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {["all", ...CATEGORY_LIST].map(cat => (
              <button
                key={cat === "all" ? "" : cat}
                className={`btn ${activeButtonInList === "category-" + (cat === "all" ? "all" : cat) ? "" : "ghost"}`}
                onClick={() => { setActiveButtonInList(cat === "all" ? null : cat); }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Кнопка добавления вопроса */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              className={`btn ${activeButtonInList === "add-question" ? "" : "ghost"}`}
              onClick={() => { setActiveButtonInList("add-question"); }}
            >
              + Добавить вопрос
            </button>

            {/* Кнопка редактирования загадки — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setActiveRiddleId(activeRiddleId)}>
              🖊️ Редактировать загадку {activeRiddleId ? `#${activeRiddleId}` : ""}
            </button>

            {/* Кнопка настроек загадки — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setActiveButtonInList("settings")}>
              ⚙️ Настройки загадки
            </button>

            {/* Кнопка категорий — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setActiveButtonInList("categories")}>
              🏷️ Категории загадок
            </button>

            {/* Кнопка назад — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setActiveButtonInList(null)}>
              ← Назад к списку
            </button>
          </div>

          {/* Список загадок */}
          <h3>Загадки ({filteredRiddles.length})</h3>
          {loadingRiddles ? (
            <p>Загрузка…</p>
          ) : filteredRiddles.length === 0 ? (
            <p className="muted">Пока нет загадок.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredRiddles.map((r) => (
                <div key={r.id} style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
                  <strong>#{r.id} — {r.title}</strong>
                  <span className="muted" style={{ marginLeft: 8 }}>{r.category?.title || r.category}</span>
                  {/* Кнопка редактирования внутри карточки загадки */}
                  <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setActiveRiddleId(r.id)}>
                    🖊️ Редактировать
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Форму добавления вопроса (если активна кнопка) */}
          {activeButtonInList === "add-question" && (
            <div style={{ marginTop: 24, padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
              <h4>Добавить вопрос к загадке</h4>
              <p className="muted">Выберите загадку и добавьте новый вопрос.</p>
            </div>
          )}
        </div>
      );
    }

    // --- Раздел ДОБАВИТЬ ВОПРОС (добавление) ===
    else if (riddlesMode === "add-question") {
      subContent = (
        <div>
          <h3>Добавить вопрос к загадке</h3>

          {/* Кнопка назад — ВТОРОЕ ПРОБЛЕМНОЕ МЕСТО */}
          <button className="btn ghost" style={{ marginBottom: 16 }} onClick={() => setActiveButtonInList("list")}>
            ← Назад к списку загадок
          </button>

          {/* Выбор загадки */}
          <div style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
            <label className="field-label">Выберите загадку:</label>
            {loadingRiddles ? (
              <p>Загрузка…</p>
            ) : riddles.length === 0 ? (
              <p className="muted">Пока нет загадок.</p>
            ) : (
              <select
                value={activeRiddleId || ""}
                onChange={(e) => setActiveRiddleId(Number(e.target.value))}
                style={{ width: "100%", padding: 8, borderRadius: 6 }}
              >
                {riddles.map(r => (
                  <option key={r.id} value={r.id}>#{r.id} — {r.title}</option>
                ))}
              </select>
            )}

            {/* Кнопка редактирования загадки — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setActiveRiddleId(activeRiddleId)}>
              🖊️ Редактировать загадку {activeRiddleId ? `#${activeRiddleId}` : ""}
            </button>

            {/* Кнопка настроек загадки — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setActiveButtonInList("settings")}>
              ⚙️ Настройки загадки
            </button>

            {/* Кнопка категорий — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setActiveButtonInList("categories")}>
              🏷️ Категории загадок
            </button>
          </div>

          {/* Форма добавления вопроса */}
          {activeRiddleId && (
            <div style={{ marginTop: 16, padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
              <h4>Новый вопрос</h4>

              {/* Кнопка отмены — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
              <button className="btn ghost" style={{ marginBottom: 12 }} onClick={() => setQuestionFormVisible(false)}>
                Отмена
              </button>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                {/* Выбор типа */}
                <label className="field-label">Тип вопроса</label>
                <select value={newQuestionId || ""} onChange={(e) => setNewQuestionId(Number(e.target.value))}>
                  <option value="">Выберите тип</option>
                  {Object.entries(QUESTION_TYPES).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>

                {/* Текст вопроса */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: 20 }}>
                  <div>
                    <label className="field-label">Вопрос</label>
                    <input
                      type="text"
                      placeholder="Введите вопрос..."
                      value={""} // здесь можно добавить state
                      onChange={(e) => {}}
                      style={{ width: "100%", padding: 8, borderRadius: 6 }}
                    />
                  </div>

                  <div>
                    <label className="field-label">Ответ</label>
                    <input
                      type="text"
                      placeholder="Введите ответ..."
                      value={""} // здесь можно добавить state
                      onChange={(e) => {}}
                      style={{ width: "100%", padding: 8, borderRadius: 6 }}
                    />
                  </div>
                </div>

                {/* Кнопка сохранения — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
                <button className="btn green mt" onClick={handleSaveQuestion}>
                  Сохранить вопрос
                </button>

                {/* Кнопка отмены — ВТОРОЕ ПРОБЛЕМНОЕ МЕСТО */}
                <button className="btn ghost mt" onClick={() => setQuestionFormVisible(false)}>
                  Отмена
                </button>

                {/* Кнопки навигации — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn ghost" onClick={() => setActiveButtonInList("list")}>← Назад</button>
                  <button className="btn ghost" onClick={() => setActiveRiddleId(activeRiddleId)}>🖊️ Редактировать загадку</button>
                  <button className="btn ghost" onClick={() => setActiveButtonInList("settings")}>⚙️ Настройки загадки</button>
                  <button className="btn ghost" onClick={() => setActiveButtonInList("categories")}>🏷️ Категории загадок</button>
                </div>
              </div>
            </div>
          )}

          {/* Кнопка "Назад к списку" — для возврата без добавления */}
          <div style={{ marginTop: 16 }}>
            <button className="btn ghost mt" onClick={() => setActiveButtonInList("list")}>
              ← Вернуться к списку загадок (без изменений)
            </button>
          </div>

          {/* Кнопка "Назад к предыдущей странице" — для возврата из всего раздела */}
          <div style={{ marginTop: 8 }}>
            <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>
              ← На страницу QR-кодов (из раздела Загадки)
            </button>
          </div>
        </div>
      );
    }

    // --- Раздел КАТЕГОРИИ ЗАГАДОК ===
    else if (riddlesMode === "categories") {
      subContent = (
        <div>
          {/* Кнопка назад — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
          <button className="btn ghost" style={{ marginBottom: 16 }} onClick={() => setActiveButtonInList("list")}>
            ← Назад к списку загадок
          </button>

          {/* Кнопка редактирования категории — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
          <div style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
            <h4>Категории загадок</h4>
            {categories.map(cat => (
              <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                <span>{cat.title}</span>
                {/* Кнопка редактирования категории */}
                <button className="btn ghost" onClick={() => setActiveCategoryForEdit(cat.id)}>
                  🖊️ Редактировать
                </button>
              </div>
            ))}
          </div>

          {/* Форма редактирования категории */}
          {activeCategoryForEdit && (
            <div style={{ marginTop: 16, padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
              <h4>Редактировать категорию</h4>

              {/* Кнопка отмены */}
              <button className="btn ghost" style={{ marginBottom: 12 }} onClick={() => setActiveCategoryForEdit(null)}>
                Отмена
              </button>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                <div>
                  <label className="field-label">Название категории</label>
                  <input type="text" value={activeCategoryForEdit} onChange={(e) => setActiveCategoryForEdit(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
                </div>

                {/* Кнопка сохранения */}
                <button className="btn green mt">Сохранить</button>

                {/* Кнопки навигации — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn ghost" onClick={() => setActiveButtonInList("list")}>← Назад к списку</button>
                  <button className="btn ghost" onClick={() => {}}>🖊️ Редактировать загадку</button>
                  <button className="btn ghost" onClick={() => setActiveButtonInList("settings")}>⚙️ Настройки загадки</button>
                </div>
              </div>
            </div>
          )}

          {/* Кнопка "Назад к предыдущей странице" */}
          <div style={{ marginTop: 16 }}>
            <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадки)</button>
          </div>
        </div>
      );
    }

    // --- Раздел НАСТРОЙКИ ЗАГАДКИ ===
    else if (riddlesMode === "settings") {
      subContent = (
        <div>
          {/* Кнопка назад — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
          <button className="btn ghost" style={{ marginBottom: 16 }} onClick={() => setActiveButtonInList("list")}>
            ← Назад к списку загадок
          </button>

          {/* Кнопка отмены — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
          <button className="btn ghost" style={{ marginBottom: 16 }} onClick={() => setActiveButtonInList("list")}>Отмена</button>

          <h3>Настройки загадки</h3>

          {/* Кнопка сохранения — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
          <div style={{ padding: 12, background: "rgba(76,217,100,0.05)", borderRadius: 8, marginBottom: 16 }}>
            <button className="btn green mt" onClick={() => { setSettings(s => ({ ...s, showHints: !s.showHints })); setActiveButtonInList("list"); }}>
              ✅ Сохранить настройки
            </button>

            {/* Кнопка отмены */}
            <button className="btn ghost mt">Отмена</button>
          </div>

          {/* Поле настроек */}
          <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
            <label className="field-label">Показывать подсказки</label>
            <input type="checkbox" checked={settings.showHints} onChange={() => {}} />
          </div>

          {/* Кнопка "Назад к предыдущей странице" */}
          <div style={{ marginTop: 16 }}>
            <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадки)</button>
          </div>
        </div>
      );
    }

    mainContent = (
      <>
        {/* Навигационные табы внутри раздела Загадки */}
        <h3 style={{ marginBottom: 8 }}>Навигация внутри раздела</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 10 }}>
          {riddlesSubItems.map((item) => (
            <button
              key={item.key}
              className={`btn ${riddlesMode === item.key ? "" : "ghost"}`}
              onClick={() => setRiddlesMode(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Контент активной подвкладки */}
        <div>{subContent}</div>
      </>
    );
  } else if (tab === "captains") {
    mainContent = (
      <div>
        <h3>📋 Капитаны</h3>
        {/* ... код из оригинала, сокращённо ... */}
      </div>
    );
  }

  // === Отрисовка ===
  return (
    <div className="card admin">
      <div className="eyebrow">Админ · управление</div>
      <h2>Панель администратора</h2>

      {/* Табы */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 10 }}>
        {items.map((tabItem) => (
          <button key={tabItem.key} className={`btn ${tab === tabItem.key ? "" : "ghost"}`} onClick={() => navigate(`/admin/${tabItem.key}`)}>
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Контент */}
      <div>{mainContent}</div>
    </div>
  );
}