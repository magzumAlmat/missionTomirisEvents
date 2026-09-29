import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * AddQuestionForm — компонент формы добавления вопроса к загадке.
 * 
 * Кнопки:
 *  - "Назад" — возвращает к списку вопросов в загадке.
 *  - "Сохранить" — сохраняет новый вопрос и возвращает на страницу просмотра загадки.
 */

export default function AddQuestionForm() {
  const navigate = useNavigate();
  const { riddleId } = useParams(); // URL: /admin/riddles/:riddleId/view/add-question
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const handleBackToList = () => {
    navigate(`/admin/riddles/${riddleId}/view`);
  };

  const handleSave = async () => {
    console.log("Сохранение вопроса:", question, answer);
    await new Promise(resolve => setTimeout(resolve, 500)); // имитация асинхронности
    navigate(`/admin/riddles/${riddleId}/view`);
  };

  return (
    <div className="card">
      {/* Кнопка "Назад" — возвращает к списку вопросов */}
      <button className="btn ghost mt mb-8" onClick={handleBackToList}>← Назад к списку вопросов</button>

      <h3>Добавить новый вопрос к загадке #{riddleId}</h3>

      {/* Кнопка "Сохранить" — сохраняет и возвращает на просмотр */}
      <button className="btn green mt mb-8" onClick={handleSave}>✅ Сохранить</button>

      <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
        <label className="field-label">Текст вопроса</label>
        <input type="text" placeholder="Например: 'Какой город называют воротами Европы?'" value={question} onChange={(e) => setQuestion(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 6 }} />

        <label className="field-label mt-4">Ответ</label>
        <input type="text" placeholder="Например: 'Константинополь'" value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 6 }} />

        {/* Кнопки навигации */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn ghost" onClick={handleBackToList}>← Назад к списку вопросов</button>
        </div>

        {/* Кнопка "Назад к предыдущей странице" */}
        <br />
        <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадок)</button>
      </div>
    </div>
  );
}