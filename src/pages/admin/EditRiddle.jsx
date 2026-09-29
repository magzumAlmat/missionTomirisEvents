import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * EditRiddle — компонент для редактирования загадки.
 * 
 * Кнопки:
 *  - "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки с обновлёнными данными.
 *  - "Назад" — возвращается к списку вопросов в редактируемой загадке.
 */

/**
 * Mock-данные для демонстрации работы кнопок.
 * В реальном проекте данные будут загружаться из API.
 */
const mockRiddles = [
  { id: 1, category: "logic_mathematics", title: "Загадка 1", questions: [{ id: 101, type: "text", question: "Какое число больше всех?", answer: "∞" }] },
  { id: 2, category: "history", title: "Загадка 2", questions: [{ id: 201, type: "text", question: "Кто был первым императором Рима?", answer: "Август" }] },
];

export default function EditRiddle() {
  const navigate = useNavigate();
  const { riddleId } = useParams(); // URL: /admin/riddles/:riddleId/edit
  const [riddle, setRiddle] = useState(null);
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    if (riddleId) {
      const found = mockRiddles.find(r => String(r.id) === riddleId);
      setRiddle(found || null);
      setQuestions(found?.questions || []);
    }
  }, [riddleId]);

  // Кнопки: "Назад" и "Сохранить" — это основные кнопки, о которых идёт речь в handoff.

  if (!riddle) {
    return <div>Загадка не найдена</div>;
  }

  return (
    <div className="card">
      <h2>Редактирование загадки #{riddle.id}: "{riddle.title}"</h2>

      {/* Кнопка "Назад" — возвращает на страницу просмотра загадки */}
      <button className="btn ghost" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>← Назад к списку вопросов</button>

      {/* Здесь будет форма редактирования загадки */}
      <div style={{ marginTop: 16 }}>
        <h3>Заголовок загадки</h3>
        <input type="text" value={riddle.title} onChange={(e) => setRiddle({ ...riddle, title: e.target.value })} style={{ width: "100%", padding: 8 }} />
      </div>

      {/* Кнопка "Сохранить" — сохраняет изменения и возвращает на страницу просмотра загадки */}
      <button className="btn green mt" onClick={() => navigate(`/admin/riddles/${riddleId}`)}>
        ✅ Сохранить (вернёт к списку вопросов)
      </button>

      {/* Список вопросов */}
      <h3 style={{ marginTop: 24 }}>Вопросы</h3>
      {questions.map(q => (
        <div key={q.id} style={{ padding: 10, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
          <span>{q.question}</span> — <span style={{ color: "#aaa" }}>{q.answer}</span>
        </div>
      ))}

      {/* Кнопка "Добавить вопрос" */}
      <button className="btn mt" onClick={() => navigate(`/admin/riddles/${riddleId}/add-question`)}>+ Добавить вопрос</button>
    </div>
  );
}