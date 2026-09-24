import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * EditQuestion — компонент для редактирования отдельного вопроса.
 * 
 * Кнопки:
 *  - "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными.
 *  - "Назад" — возвращается к списку вопросов в редактируемой загадке.
 */

export default function EditQuestion() {
  const navigate = useNavigate();
  const { riddleId, questionId } = useParams(); // URL: /admin/riddles/:riddleId/questions/:questionId/edit
  const [isSaved, setIsSaved] = useState(false);

  // Кнопка "Назад" — возвращается к списку вопросов в редактируемой загадке
  const handleBackToList = () => {
    navigate(`/admin/riddles/${riddleId}`);
  };

  // Кнопка "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными
  const handleSaveChanges = async () => {
    console.log("Сохранение вопроса...");
    setIsSaved(true);
    await new Promise(resolve => setTimeout(resolve, 500)); // имитация асинхронности
    navigate(`/admin/riddles/${riddleId}`); // возвращаем на страницу просмотра загадки с обновлёнными данными
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

      <h3>Редактирование вопроса</h3>

      {/* Кнопка "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными */}
      <button className="btn green mt mb-8" onClick={handleSaveChanges}>
        {isSaved ? "✅ Сохранено!" : "✅ Сохранить"} (вернёт к списку вопросов)
      </button>

      {/* Кнопка "Отмена" — отменяет сохранение и возвращает на предыдущую страницу без изменений */}
      <button className="btn ghost mt mb-8" onClick={handleCancel}>
        Отмена
      </button>

      {/* Поля редактирования вопроса */}
      <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
        <label className="field-label">Тип вопроса</label>
        <select value="" onChange={() => {}} style={{ width: "100%", padding: 6 }}>
          <option value="">Выберите тип...</option>
          <option value="text">Текст</option>
          <option value="image">Картинка</option>
          <option value="video">Видео</option>
        </select>

        <label className="field-label mt-8">Вопрос</label>
        <input type="text" placeholder="Текст вопроса..." value="" onChange={() => {}} style={{ width: "100%", padding: 6 }} />

        <label className="field-label mt-8">Ответ</label>
        <input type="text" placeholder="Ответ..." value="" onChange={() => {}} style={{ width: "100%", padding: 6 }} />

        <label className="field-label mt-8">Подсказка</label>
        <input type="text" placeholder="Подсказка (необязательно)" value="" onChange={() => {}} style={{ width: "100%", padding: 6 }} />
      </div>

      {/* Кнопки навигации */}
      <br />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn ghost" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>← Назад к списку вопросов</button>
        <button className="btn ghost" onClick={() => navigate("/admin/riddles/categories")}>🏷️ Категории загадок</button>
      </div>

      {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадки */}
      <br />
      <button className="btn ghost mt" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>← На страницу просмотра загадки (из раздела редактирования вопроса)</button>
    </div>
  );
}