import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * ViewRiddle — страница просмотра загадки.
 * 
 * Кнопки:
 *  - "Редактировать" — перенаправляет на страницу редактирования загадки.
 *  - "Назад" — возвращает к списку загадок.
 */

const mockRiddles = [
  { id: 1, category: "logic_mathematics", title: "Загадка 1", questions: [{ id: 101, type: "text", question: "Какое число больше всех?", answer: "∞" }] },
  { id: 2, category: "history", title: "Загадка 2", questions: [{ id: 201, type: "text", question: "Кто был первым императором Рима?", answer: "Август" }] },
];

export default function ViewRiddle() {
  const navigate = useNavigate();
  const { riddleId } = useParams(); // URL: /admin/riddles/:riddleId/view
  const [activeTab, setActiveTab] = useState("questions"); // questions | categories | settings

  const riddle = useMemo(() => mockRiddles.find(r => String(r.id) === riddleId), [riddleId]);

  if (!riddle) {
    return <div>Загадка не найдена</div>;
  }

  // --- Раздел: ВОПРОСЫ (просмотр списка вопросов) ---
  const questionsContent = useMemo(() => ({
    title: "Вопросы загадки",
    subItems: [
      { key: "list", label: "📋 Список" },
      { key: "add", label: "+ Добавить вопрос" },
    ],
  }), []);

  const questionsList = (
    <div>
      {/* Навигация внутри раздела */}
      <h3 style={{ marginBottom: 8 }}>Вопросы загадки</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn" onClick={() => setActiveTab("questions")}>📋 Список вопросов</button>
        <button className={`btn ${activeTab === "add" ? "" : "ghost"}`} onClick={() => setActiveTab("add")}>+ Добавить вопрос</button>
      </div>

      {/* Кнопка редактирования — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn green mt" style={{ marginBottom: 16 }} onClick={() => navigate(`/admin/riddles/${riddle.id}/edit`)}>
        🖊️ Редактировать загадку
      </button>

      {/* Кнопка "Назад" — возвращает к списку загадок — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn ghost mt" onClick={() => navigate("/admin/riddles/list")}>
        ← Назад к списку загадок
      </button>

      {/* Список вопросов */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {riddle.questions.map(q => (
          <div key={q.id} style={{ padding: 10, background: "rgba(255,255,255,0.05)", borderRadius: 6 }}>
            <strong>#{q.id}</strong> — <span>{q.type}: {q.question}</span> — <span className="muted">{q.answer}</span>
          </div>
        ))}
      </div>

      {/* Кнопка добавления вопроса */}
      <button className="btn mt" style={{ marginTop: 16 }} onClick={() => navigate(`/admin/riddles/${riddle.id}/add-question`)}>
        + Добавить вопрос
      </button>
    </div>
  );

  // --- Раздел: ДОБАВЛЕНИЕ ВОПРОСА (просмотр) ---
  const questionsAddContent = useMemo(() => ({
    title: "Добавить новый вопрос",
    subItems: [
      { key: "list", label: "← Назад к списку" },
    ],
  }), []);

  const questionsAdd = (
    <div>
      {/* Кнопка "Назад" — возвращает в список вопросов — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn ghost mt mb-8" onClick={() => navigate(`/admin/riddles/${riddle.id}`)}>← Назад к списку вопросов</button>

      {/* Кнопка "Редактировать загадку" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn green mt mb-8" onClick={() => navigate(`/admin/riddles/${riddle.id}/edit`)}>🖊️ Редактировать загадку</button>

      {/* Кнопка "Назад к списку загадок" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn ghost mt mb-8" onClick={() => navigate("/admin/riddles/list")}>← Назад к списку загадок</button>

      {/* Форма добавления вопроса */}
      <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
        <h4>Новый вопрос</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8 }}>
          <input type="text" placeholder="Текст вопроса" value="" onChange={() => {}} style={{ padding: 6 }} />
          <input type="text" placeholder="Ответ" value="" onChange={() => {}} style={{ padding: 6 }} />
          <button className="btn green mt">Сохранить</button>
        </div>
      </div>

      {/* Кнопка отмены — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn ghost mt" onClick={() => navigate(`/admin/riddles/${riddle.id}`)}>Отмена</button>

      {/* Кнопки навигации — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn ghost" onClick={() => navigate(`/admin/riddles/${riddle.id}`)}>← Назад к списку вопросов</button>
        <button className="btn ghost" onClick={() => navigate(`/admin/riddles/${riddle.id}/edit`)}>🖊️ Редактировать загадку</button>
        <button className="btn ghost" onClick={() => navigate("/admin/riddles/categories")}>🏷️ Категории загадок</button>
      </div>

      {/* Кнопка "Назад к предыдущей странице" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадки)</button>
    </div>
  );

  // --- Раздел: КАТЕГОРИИ ЗАГАДОК (просмотр) ---
  const categoriesContent = useMemo(() => ({
    title: "Категории загадок",
    subItems: [
      { key: "list", label: "📋 Список" },
      { key: "add", label: "+ Добавить категорию" },
    ],
  }), []);

  const categoriesList = (
    <div>
      {/* Кнопка редактирования категории — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn green mt mb-8" onClick={() => navigate("/admin/riddles/categories/edit")}>🖊️ Редактировать категорию</button>

      <h3 style={{ marginBottom: 8 }}>Категории загадок</h3>
      {["logic_mathematics", "earth", "history", "literature", "science", "technology"].map(catKey => (
        <div key={catKey} style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
          {CATEGORY_TITLES[catKey]}
        </div>
      ))}

      {/* Кнопка "Назад" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn ghost mt mb-8" onClick={() => navigate("/admin/riddles/list")}>← Назад к списку загадок</button>

      {/* Кнопка "Назад к предыдущей странице" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадки)</button>
    </div>
  );

  // --- Раздел: НАСТРОЙКИ ЗАГАДКИ (просмотр) ===
  const settingsContent = useMemo(() => ({
    title: "Настройки загадки",
    subItems: [
      { key: "show-hints", label: "Показывать подсказки" },
      { key: "time-limit", label: "Тайм-лимит" },
    ],
  }), []);

  const settings = (
    <div>
      {/* Кнопка "Назад" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn ghost mt mb-8" onClick={() => navigate("/admin/riddles/list")}>← Назад к списку загадок</button>

      <h3 style={{ marginBottom: 8 }}>Настройки загадки</h3>

      {/* Кнопка "Сохранить" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn green mt mb-8">✅ Сохранить настройки</button>

      {/* Кнопка "Отмена" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn ghost mt mb-8">Отмена</button>

      {/* Поля настроек */}
      <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
        <label className="field-label">Показывать подсказки</label>
        <input type="checkbox" checked={true} onChange={() => {}} />
      </div>

      {/* Кнопка "Назад к предыдущей странице" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn ghost mt mb-8" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадки)</button>

      {/* Кнопка "Назад к списку настроек" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <button className="btn ghost mt" onClick={() => navigate(`/admin/riddles/${riddle.id}`)}>← Назад к редактированию загадки</button>
    </div>
  );

  // === Навигация между подвкладками внутри раздела Загадка ===
  const subItems = [
    { key: "questions", label: "📋 Вопросы" },
    { key: "add", label: "+ Добавить вопрос" },
    { key: "categories", label: "🏷️ Категории загадок" },
    { key: "settings", label: "⚙️ Настройки загадки" },
  ];

  // === Рендер ===
  const currentContent = activeTab === "questions" ? questionsList :
                         activeTab === "add" ? questionsAdd :
                         activeTab === "categories" ? categoriesList : settings;

  return (
    <div className="card">
      {/* Навигационные табы внутри раздела */}
      <h3 style={{ marginBottom: 8 }}>Навигация</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 10 }}>
        {subItems.map((item) => (
          <button key={item.key} className={`btn ${activeTab === item.key ? "" : "ghost"}`} onClick={() => setActiveTab(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      {/* Контент */}
      <div>{currentContent}</div>
    </div>
  );
}

// Мок-данные для категорий (из handoff)
const CATEGORY_TITLES = {
  logic_mathematics: "Логика и математика",
  earth: "Земля",
  history: "История",
  literature: "Литература",
  science: "Наука",
  technology: "Техника",
};