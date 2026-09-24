import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * CategoriesList — страница просмотра категорий загадок.
 * 
 * Кнопки:
 *  - "+ Добавить категорию" — открывает форму создания новой категории.
 *  - "Назад" — возвращается к списку загадок.
 */

export default function CategoriesList() {
  const navigate = useNavigate();
  const { tab } = useParams(); // URL может быть: /admin/riddles/categories
  const [activeButton, setActiveButton] = useState(null); // null | "edit" | "add" | "back"

  const categories = [
    { id: "logic_mathematics", title: "Логика и математика" },
    { id: "earth", title: "Земля" },
    { id: "history", title: "История" },
    { id: "literature", title: "Литература" },
    { id: "science", title: "Наука" },
    { id: "technology", title: "Техника" },
  ];

  // Кнопка "+ Добавить категорию" — открывает форму создания новой категории
  const handleAddCategory = () => {
    setActiveButton("add");
  };

  // Кнопка "Редактировать категорию" — перенаправляет на страницу редактирования категории
  const handleEditCategory = (categoryId) => {
    navigate(`/admin/riddles/categories/edit/${categoryId}`);
  };

  // Кнопка "Назад" — возвращается к списку загадок
  const handleBackToList = () => {
    setActiveButton(null);
  };

  return (
    <div className="card">
      {/* Навигация между подвкладками */}
      <h3 style={{ marginBottom: 8 }}>Навигация</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 10 }}>
        <button className={`btn ${activeButton === "list" ? "" : "ghost"}`} onClick={() => setActiveButton("list")}>📋 Список категорий</button>
        <button className={`btn ${activeButton === "add" ? "" : "ghost"}`} onClick={handleAddCategory}>+ Добавить категорию</button>
      </div>

      {/* === Вкладка: СПИСОК КАТЕГОРИЙ (просмотр) === */}
      {activeButton === "list" && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Категории загадок</h3>

          {/* Кнопка "Редактировать категорию" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
          {categories.map(cat => (
            <div key={cat.id} style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
              <span>{cat.title}</span>
              {/* Кнопка редактирования категории — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
              <button className="btn ghost" style={{ marginLeft: 12 }} onClick={() => handleEditCategory(cat.id)}>🖊️ Редактировать</button>
            </div>
          ))}

          {/* Кнопка "Назад" — возвращается к списку загадок — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
          <button className="btn ghost mt mb-8" onClick={handleBackToList}>← Назад к списку загадок</button>

          {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадки */}
          <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадок)</button>
        </div>
      )}

      {/* === Вкладка: ДОБАВЛЕНИЕ КАТЕГОРИИ (добавление) === */}
      {activeButton === "add" && (
        <div>
          {/* Кнопка "Назад" — возвращается к списку категорий — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
          <button className="btn ghost mt mb-8" onClick={() => setActiveButton("list")}>← Назад к списку</button>

          {/* Форма добавления новой категории */}
          <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
            <h4>Новая категория</h4>

            {/* Кнопка отмены — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
            <button className="btn ghost" style={{ marginBottom: 12 }} onClick={() => setActiveButton("list")}>Отмена</button>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              <div>
                <label className="field-label">Название категории</label>
                <input type="text" placeholder="Например: 'Логика и математика'" value="" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
              </div>

              <div>
                <label className="field-label">Описание</label>
                <textarea placeholder="Краткое описание категории..." value="" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
              </div>

              {/* Кнопка "Сохранить" — сохраняет новую категорию и возвращает на список */}
              <button className="btn green mt">✅ Добавить категорию</button>

              {/* Кнопки навигации — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn ghost" onClick={() => setActiveButton("list")}>← Назад к списку категорий</button>
                {/* Кнопка редактирования категории — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
                <button className="btn ghost">🖊️ Редактировать категорию</button>
              </div>

              {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадки */}
              <br />
              <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадок)</button>
            </div>
          </div>
        </div>
      )}

      {/* === Вкладка: РЕДАКТИРОВАНИЕ КАТЕГОРИИ (редактирование) === */}
      {activeButton === "edit" && (
        <div>
          {/* Кнопка "Назад к списку" — возвращается на страницу списка категорий */}
          <button className="btn ghost mt mb-8" onClick={() => setActiveButton("list")}>← Назад к списку</button>

          {/* Кнопка "Редактировать категорию" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
          <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
            <h4>Редактировать категорию</h4>

            {/* Кнопка отмены — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
            <button className="btn ghost mt mb-8" onClick={() => setActiveButton("list")}>Отмена</button>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              <div>
                <label className="field-label">Название категории</label>
                <input type="text" placeholder="Например: 'Логика и математика'" value="" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
              </div>

              {/* Кнопка "Сохранить" — сохраняет изменения и возвращает на список категорий */}
              <button className="btn green mt">✅ Сохранить</button>

              {/* Кнопки навигации — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn ghost" onClick={() => setActiveButton("list")}>← Назад к списку категорий</button>
                {/* Кнопка редактирования загадки — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО */}
                <button className="btn ghost">🖊️ Редактировать загадку</button>
              </div>

              {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадки */}
              <br />
              <button className="btn ghost mt" onClick={() => navigate("/admin/qr")}>← На страницу QR-кодов (из раздела Загадок)</button>
            </div>
          </div>
        </div>
      )}

      {/* === Вкладка: СПИСОК ЗАГАДОК (просмотр) === */}
      {activeButton === "riddles" && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Загадки</h3>
          {categories.map(cat => (
            <div key={cat.id} style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
              <span>{cat.title}</span>
            </div>
          ))}

          {/* Кнопка "Назад" — возвращается к списку загадок */}
          <button className="btn ghost mt mb-8" onClick={handleBackToList}>← Назад к списку загадок</button>
        </div>
      )}
    </div>
  );
}