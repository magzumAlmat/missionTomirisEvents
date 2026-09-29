import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * AddRiddle — компонент для добавления новой загадки.
 * 
 * Кнопки:
 *  - "Сохранить" — сохраняет новую загадку и возвращает на список загадок.
 *  - "Назад" — возвращается к списку загадок без сохранения.
 */

export default function AddRiddle() {
  const navigate = useNavigate();
  const [riddleTitle, setRiddleTitle] = useState("");
  const [category, setCategory] = useState("logic_mathematics");
  const [questionsCount, setQuestionsCount] = useState(1);

  // Кнопка "Назад" — возвращается к списку загадок без сохранения
  const handleBackToList = () => {
    navigate("/admin/riddles/list");
  };

  // Кнопка "Сохранить" — сохраняет новую загадку и возвращает на список загадок
  const handleSaveRiddle = async () => {
    console.log("Сохранение новой загадки:", riddleTitle, category);
    await new Promise(resolve => setTimeout(resolve, 500)); // имитация асинхронности
    navigate("/admin/riddles/list"); // возвращаем на список загадок
  };

  return (
    <div className="card">
      <h3>Добавить новую загадку</h3>

      {/* Кнопка "Назад" — возвращается к списку загадок без сохранения */}
      <button className="btn ghost mt mb-8" onClick={handleBackToList}>← Назад к списку загадок</button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        {/* Выбор категории */}
        <div>
          <label className="field-label">Категория загадки</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 6 }}>
            {CATEGORY_LIST.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.title}</option>
            ))}
          </select>
        </div>

        {/* Заголовок загадки */}
        <div>
          <label className="field-label">Заголовок</label>
          <input type="text" placeholder="Например: 'Какой город называют воротами Европы?'" value={riddleTitle} onChange={(e) => setRiddleTitle(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
        </div>

        {/* Количество вопросов */}
        <div>
          <label className="field-label">Количество вопросов</label>
          <input type="number" placeholder="1-10" min={1} max={10} value={questionsCount} onChange={(e) => setQuestionsCount(Number(e.target.value))} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
        </div>

        {/* Поля вопросов */}
        {Array.from({ length: questionsCount }).map((_, i) => (
          <div key={i}>
            <label className="field-label">Вопрос #{i + 1}</label>
            <input type="text" placeholder={`Текст вопроса ${i + 1}...`} value="" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />

            <label className="field-label mt-4">Ответ</label>
            <input type="text" placeholder={`Ответ на вопрос ${i + 1}...`} value="" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
          </div>
        ))}

        {/* Кнопка "Сохранить" — сохраняет новую загадку и возвращает на список */}
        <button className="btn green mt" onClick={handleSaveRiddle}>✅ Создать загадку</button>

        {/* Кнопка отмены */}
        <br />
        <button className="btn ghost mt">Отмена</button>
      </div>

      {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадок */}
      <br />
      <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадки)</button>
    </div>
  );
}

const CATEGORY_LIST = [
  { id: "logic_mathematics", title: "Логика и математика" },
  { id: "earth", title: "Земля" },
  { id: "history", title: "История" },
  { id: "literature", title: "Литература" },
  { id: "science", title: "Наука" },
  { id: "technology", title: "Техника" },
];