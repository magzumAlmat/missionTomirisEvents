import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * EditCategory — компонент для редактирования категории загадок.
 * 
 * Кнопки:
 *  - "Сохранить" — сохраняет изменения и возвращает на список категорий.
 *  - "Назад" — возвращается к списку загадок без сохранения.
 */

export default function EditCategory() {
  const navigate = useNavigate();
  const { categoryId } = useParams(); // URL: /admin/riddles/categories/edit/:categoryId
  const [categoryTitle, setCategoryTitle] = useState("");
  const [description, setDescription] = useState("");

  // Кнопка "Назад" — возвращается к списку загадок без сохранения
  const handleBackToList = () => {
    navigate("/admin/riddles/list");
  };

  // Кнопка "Сохранить" — сохраняет изменения и возвращает на список категорий
  const handleSaveChanges = async () => {
    console.log("Сохранение категории:", categoryTitle, categoryId);
    await new Promise(resolve => setTimeout(resolve, 500)); // имитация асинхронности
    navigate("/admin/riddles/categories"); // возвращаем на список категорий
  };

  return (
    <div className="card">
      <h3>Редактировать категорию загадок</h3>

      {/* Кнопка "Назад" — возвращается к списку загадок без сохранения */}
      <button className="btn ghost mt mb-8" onClick={handleBackToList}>← Назад к списку загадок</button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        {/* Информация о категории */}
        <div className="info">
          <h4>Категория: {categoryTitle || "Новая категория"}</h4>
          <p className="muted">{description || ""}</p>
        </div>

        {/* Форма редактирования */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="field-label">Название категории</label>
            <input type="text" placeholder="Например: 'Логика и математика'" value={categoryTitle} onChange={(e) => setCategoryTitle(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
          </div>

          <div>
            <label className="field-label">Описание</label>
            <textarea placeholder="Краткое описание категории..." value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
          </div>

          {/* Кнопка "Сохранить" — сохраняет изменения и возвращает на список */}
          <button className="btn green mt">✅ Сохранить</button>

          {/* Кнопка "Отмена" */}
          <br />
          <button className="btn ghost mt">Отмена</button>

          {/* Кнопки навигации — возвращают в другие разделы */}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" onClick={() => navigate("/admin/riddles/list")}>← Назад к списку загадок</button>
            <button className="btn ghost" onClick={() => navigate("/admin/riddles/add-question")}>📋 Вопросы к загадке</button>
          </div>

          {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадки */}
          <br />
          <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадок)</button>
        </div>
      </div>
    </div>
  );
}