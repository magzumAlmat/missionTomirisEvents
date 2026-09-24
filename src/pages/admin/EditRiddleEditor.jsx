import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * EditRiddleEditor — компонент для редактирования загадки.
 * 
 * Кнопки:
 *  - "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными.
 *  - "Назад" — возвращается к списку вопросов в редактируемой загадке.
 */

const mockQuestions = [
  { id: 101, type: "text", question: "Какое число больше всех?", answer: "∞", hint: "" },
];

export default function EditRiddleEditor() {
  const navigate = useNavigate();
  const { riddleId } = useParams(); // URL: /admin/riddles/:riddleId/edit-questions
  const [activeTab, setActiveTab] = useState("questions"); // questions | add-question
  const [questionFormVisible, setQuestionFormVisible] = useState(false);
  const [newQuestionId, setNewQuestionId] = useState(null);

  // Кнопка "Назад" — возвращает на страницу просмотра загадки (список вопросов)
  const handleBackToList = () => {
    navigate(`/admin/riddles/${riddleId}`);
  };

  // Кнопка "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными
  const handleSaveChanges = async () => {
    console.log("Сохранение изменений загадки...");
    // Здесь вызов API для сохранения
    await new Promise(resolve => setTimeout(resolve, 500)); // имитация асинхронности
    navigate(`/admin/riddles/${riddleId}`); // возвращаем на страницу просмотра с обновлёнными данными
  };

  // Кнопка "Отмена" — отменяет сохранение и возвращает на предыдущую страницу без изменений
  const handleCancel = () => {
    navigate(`/admin/riddles/${riddleId}`);
  };

  return (
    <div className="card">
      {/* Кнопка "Назад" — возвращается к списку вопросов в редактируемой загадке */}
      <button className="btn ghost mb-8" onClick={handleBackToList}>
        ← Назад к списку вопросов
      </button>

      {/* Навигация между вкладками */}
      <h3 style={{ marginBottom: 8 }}>Навигация</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 10 }}>
        <button className={`btn ${activeTab === "questions" ? "" : "ghost"}`} onClick={() => setActiveTab("questions")}>📋 Список вопросов</button>
        <button className={`btn ${activeTab === "add-question" ? "" : "ghost"}`} onClick={() => { setActiveTab("add-question"); setQuestionFormVisible(true); }}>+ Добавить вопрос</button>
      </div>

      {/* === Вкладка: СПИСОК ВОПРОСОВ (редактирование) === */}
      {activeTab === "questions" && (
        <div>
          <h3>Вопросы загадки</h3>

          {/* Кнопка "Назад к списку" — возвращает на страницу просмотра (не редактирование) */}
          <button className="btn ghost mt mb-8" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>← Назад к просмотру</button>

          {/* Список вопросов с возможностью редактирования */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mockQuestions.map((q) => (
              <div key={q.id} style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span><strong>#{q.id}</strong> — {q.question}</span>
                  <button className="btn ghost" onClick={() => navigate(`/admin/riddles/${riddleId}/edit-question/${q.id}`)}>🖊️ Редактировать</button>
                </div>
              </div>
            ))}
          </div>

          {/* Кнопка добавления вопроса */}
          <br />
          <button className="btn mt" onClick={() => { setActiveTab("add-question"); setQuestionFormVisible(true); }}>+ Добавить вопрос</button>
        </div>
      )}

      {/* === Вкладка: ДОБАВЛЕНИЕ ВОПРОСА (редактирование) === */}
      {activeTab === "add-question" && questionFormVisible && (
        <div style={{ marginTop: 16 }}>
          <h3>Добавить новый вопрос</h3>

          {/* Кнопка "Назад к списку вопросов" — возвращается ко вкладке списка */}
          <button className="btn ghost mt mb-8" onClick={() => setActiveTab("questions")}>← Назад к списку вопросов</button>

          {/* Форма добавления вопроса */}
          <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
            <label className="field-label">Тип вопроса</label>
            <select value={newQuestionId || ""} onChange={(e) => setNewQuestionId(e.target.value)} style={{ width: "100%", padding: 6, marginBottom: 10 }}>
              <option value="">Выберите тип...</option>
              <option value="text">Текст</option>
              <option value="image">Картинка</option>
              <option value="video">Видео</option>
            </select>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8 }}>
              <input type="text" placeholder="Текст вопроса..." value="" onChange={() => {}} style={{ padding: 6 }} />
              <input type="text" placeholder="Ответ..." value="" onChange={() => {}} style={{ padding: 6 }} />

              {/* Кнопка "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными */}
              <button className="btn green mt" onClick={handleSaveChanges}>✅ Сохранить (вернёт к списку вопросов)</button>
            </div>

            {/* Кнопка "Отмена" — отменяет сохранение и возвращает на предыдущую страницу без изменений */}
            <br />
            <button className="btn ghost mt mb-8" onClick={handleCancel}>Отмена</button>

            {/* Кнопки навигации — возвращают в другие разделы */}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn ghost" onClick={() => setActiveTab("questions")}>← Назад к списку вопросов</button>
              <button className="btn ghost" onClick={() => navigate(`/admin/riddles/${riddleId}/edit`)}>🖊️ Редактировать загадку (свойства)</button>
              <button className="btn ghost" onClick={() => navigate("/admin/riddles/categories")}>🏷️ Категории загадок</button>
            </div>

            {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадки */}
            <br />
            <button className="btn ghost mt" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>← На страницу просмотра загадки (из раздела редактирования)</button>
          </div>
        </div>
      )}

      {/* === Вкладка: РЕДАКТИРОВАНИЕ ВОПРОСА (редактирование) === */}
      {activeTab === "edit-question" && (
        <div style={{ marginTop: 16 }}>
          <h3>Редактирование вопроса</h3>

          {/* Кнопка "Назад к списку вопросов" — возвращается ко вкладке списка */}
          <button className="btn ghost mt mb-8" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>← Назад к списку вопросов</button>

          <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
            <label className="field-label">Вопрос</label>
            <input type="text" value="" onChange={() => {}} style={{ width: "100%", padding: 6 }} />

            <label className="field-label mt-8">Ответ</label>
            <input type="text" value="" onChange={() => {}} style={{ width: "100%", padding: 6 }} />

            {/* Кнопка "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными */}
            <button className="btn green mt mb-8">✅ Сохранить (вернёт к списку вопросов)</button>

            {/* Кнопка "Отмена" — отменяет сохранение и возвращает на предыдущую страницу без изменений */}
            <button className="btn ghost mt mb-8">Отмена</button>

            {/* Кнопки навигации */}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn ghost" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>← Назад к списку вопросов</button>
              <button className="btn ghost" onClick={() => navigate("/admin/riddles/categories")}>🏷️ Категории загадок</button>
            </div>

            {/* Кнопка "Назад к предыдущей странице" */}
            <br />
            <button className="btn ghost mt" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>← На страницу просмотра загадки (из раздела редактирования вопроса)</button>
          </div>
        </div>
      )}
    </div>
  );
}