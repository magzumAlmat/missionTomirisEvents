import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * RiddleSettingsView — страница просмотра настроек загадки.
 * 
 * Кнопки:
 *  - "Редактировать" — перенаправляет на страницу редактирования настроек.
 *  - "Назад" — возвращается к списку вопросов в загадке.
 */

export default function RiddleSettingsView() {
  const navigate = useNavigate();
  const { riddleId } = useParams(); // URL: /admin/riddles/:riddleId/view-settings

  // Mock-данные настроек (в реальном проекте загружаются из API)
  const settings = useMemo(() => ({
    showHints: true,
    timeLimit: 300,
    allowRetries: true,
    maxAttempts: 3,
  }), []);

  // Кнопка "Редактировать" — перенаправляет на страницу редактирования настроек
  const handleEditSettings = () => {
    navigate(`/admin/riddles/${riddleId}/settings`);
  };

  // Кнопка "Назад" — возвращается к списку вопросов в загадке
  const handleBackToList = () => {
    navigate(`/admin/riddles/${riddleId}`);
  };

  return (
    <div className="card">
      {/* Кнопка "Редактировать" — перенаправляет на страницу редактирования настроек */}
      <button className="btn green mb-8" onClick={handleEditSettings}>
        ⚙️ Редактировать настройки загадки
      </button>

      {/* Кнопка "Назад" — возвращается к списку вопросов в загадке */}
      <button className="btn ghost mt mb-8" onClick={handleBackToList}>← Назад к списку вопросов</button>

      <h3>⚙️ Настройки загадки #{riddleId}</h3>

      {/* Отображение текущих настроек */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        {/* Информация о настройках */}
        <div className="info">
          <h4>Текущие настройки:</h4>

          <ul>
            <li><strong>Показывать подсказки</strong>: {settings.showHints ? "✅ Да" : "❌ Нет"}</li>
            <li><strong>Тайм-лимит</strong>: {settings.timeLimit} сек.</li>
            <li><strong>Разрешать повторные ответы</strong>: {settings.allowRetries ? "✅ Да" : "❌ Нет"}</li>
            <li><strong>Макс. кол-во попыток</strong>: {settings.maxAttempts}</li>
          </ul>
        </div>

        {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадки */}
        <button className="btn ghost mt" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>← Назад к списку вопросов</button>

        {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу QR-кодов */}
        <br />
        <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадок)</button>
      </div>
    </div>
  );
}