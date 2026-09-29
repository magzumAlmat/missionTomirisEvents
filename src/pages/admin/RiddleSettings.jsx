import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * RiddleSettings — страница настроек загадки.
 * 
 * Кнопки:
 *  - "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными.
 *  - "Назад" — возвращается к списку вопросов в редактируемой загадке.
 */

export default function RiddleSettings() {
  const navigate = useNavigate();
  const { riddleId } = useParams(); // URL: /admin/riddles/:riddleId/settings
  const [settings, setSettings] = useState({
    showHints: true,
    timeLimit: 300,
    allowRetries: true,
    maxAttempts: 3,
  });

  // Кнопка "Назад" — возвращается к списку вопросов в редактируемой загадке
  const handleBackToList = () => {
    navigate(`/admin/riddles/${riddleId}`);
  };

  // Кнопка "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными
  const handleSaveSettings = async () => {
    console.log("Сохранение настроек:", settings);
    await new Promise(resolve => setTimeout(resolve, 500)); // имитация асинхронности
    navigate(`/admin/riddles/${riddleId}`); // возвращаем на страницу просмотра загадки с обновлёнными данными
  };

  return (
    <div className="card">
      {/* Кнопка "Назад" — возвращается к списку вопросов в редактируемой загадке */}
      <button className="btn ghost mb-8" onClick={handleBackToList}>← Назад к списку вопросов</button>

      <h3>⚙️ Настройки загадки #{riddleId}</h3>

      {/* Кнопка "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными */}
      <div style={{ padding: 12, background: "rgba(76,217,100,0.05)", borderRadius: 8 }}>
        <button className="btn green mt mb-8" onClick={handleSaveSettings}>✅ Сохранить настройки</button>

        {/* Кнопка "Отмена" — отменяет сохранение и возвращает на предыдущую страницу без изменений */}
        <button className="btn ghost mt">Отмена</button>
      </div>

      <h4 style={{ marginTop: 16 }}>Параметры загадки:</h4>

      {/* Поле настроек "Показывать подсказки" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <div className="setting">
        <label className="field-label">Показывать подсказки</label>
        <input type="checkbox" checked={settings.showHints} onChange={() => setSettings(s => ({ ...s, showHints: !s.showHints }))} />
        {settings.showHints && (
          <span className="hint-text">При неправильном ответе загадка будет показывать подсказку.</span>
        )}
      </div>

      {/* Поле настроек "Тайм-лимит" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <div className="setting">
        <label className="field-label">Тайм-лимит (секунды)</label>
        <input type="number" value={settings.timeLimit} onChange={(e) => setSettings(s => ({ ...s, timeLimit: Number(e.target.value) }))} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
      </div>

      {/* Поле настроек "Разрешить повторные попытки" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <div className="setting">
        <label className="field-label">Разрешать повторные ответы</label>
        <input type="checkbox" checked={settings.allowRetries} onChange={() => setSettings(s => ({ ...s, allowRetries: !s.allowRetries }))} />
      </div>

      {/* Поле настроек "Максимальное количество попыток" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
      <div className="setting">
        <label className="field-label">Макс. кол-во попыток</label>
        <input type="number" value={settings.maxAttempts} onChange={(e) => setSettings(s => ({ ...s, maxAttempts: Number(e.target.value) }))} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
      </div>

      {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадки */}
      <br />
      <button className="btn ghost mt" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>← Назад к списку вопросов</button>

      {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу QR-кодов */}
      <br />
      <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадок)</button>
    </div>
  );
}