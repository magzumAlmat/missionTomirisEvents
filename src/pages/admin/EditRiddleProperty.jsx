import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * EditRiddleProperty — компонент для редактирования свойств загадки.
 * 
 * Кнопки:
 *  - "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными.
 *  - "Назад" — возвращается к списку вопросов в редактируемой загадке.
 */

export default function EditRiddleProperty() {
  const navigate = useNavigate();
  const { riddleId } = useParams(); // URL: /admin/riddles/:riddleId/edit-property
  const [showHints, setShowHints] = useState(true);
  const [timeLimit, setTimeLimit] = useState(300);

  // Кнопка "Назад" — возвращается к списку вопросов в редактируемой загадке
  const handleBackToList = () => {
    navigate(`/admin/riddles/${riddleId}`);
  };

  // Кнопка "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными
  const handleSaveChanges = async () => {
    console.log("Сохранение свойств загадки:", riddleId, showHints, timeLimit);
    await new Promise(resolve => setTimeout(resolve, 500)); // имитация асинхронности
    navigate(`/admin/riddles/${riddleId}`); // возвращаем на страницу просмотра загадки с обновлёнными данными
  };

  return (
    <div className="card">
      {/* Кнопка "Назад" — возвращается к списку вопросов в редактируемой загадке */}
      <button className="btn ghost mb-8" onClick={handleBackToList}>← Назад к списку вопросов</button>

      <h3>Свойства загадки</h3>

      {/* Кнопка "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными */}
      <button className="btn green mt mb-8" onClick={handleSaveChanges}>✅ Сохранить (вернёт к списку вопросов)</button>

      {/* Кнопка "Отмена" — отменяет сохранение и возвращает на предыдущую страницу без изменений */}
      <button className="btn ghost mt mb-8">Отмена</button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        {/* Информация о загадке */}
        <div className="info">
          <h4>Ред. свойства загадки #{riddleId}</h4>
          <p className="muted">Настройте дополнительные параметры:</p>

          <ul>
            <li><strong>Показывать подсказки</strong>: {showHints ? "Да" : "Нет"}</li>
            <li><strong>Тайм-лимит</strong>: {timeLimit} сек.</li>
          </ul>
        </div>

        {/* Форма редактирования */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="field-label">Показывать подсказки</label>
            <input type="checkbox" checked={showHints} onChange={() => setShowHints(!showHints)} />
          </div>

          <div>
            <label className="field-label">Тайм-лимит (секунды)</label>
            <input type="number" placeholder="300" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
          </div>

          {/* Кнопка "Сохранить" — повторяем для удобства */}
          <button className="btn green mt">✅ Сохранить</button>

          {/* Кнопка "Отмена" */}
          <br />
          <button className="btn ghost mt">Отмена</button>

          {/* Кнопки навигации */}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>← Назад к списку вопросов</button>
            <button className="btn ghost" onClick={() => navigate("/admin/riddles/categories")}>🏷️ Категории загадок</button>
          </div>

          {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадки */}
          <br />
          <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадок)</button>
        </div>
      </div>
    </div>
  );
}