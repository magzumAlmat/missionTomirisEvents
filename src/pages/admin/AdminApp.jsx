import { Routes, Route } from "react-router-dom";
import AdminTab from "./AdminTab";
import EditRiddle from "./EditRiddle";
import ViewRiddle from "./ViewRiddle";
import EditRiddleEditor from "./EditRiddleEditor";
import AddQuestionForm from "./AddQuestionForm";
import CategoriesList from "./CategoriesList";
import RiddleSettings from "./RiddleSettings";
import RiddleSettingsView from "./RiddleSettingsView";
import EditCategory from "./EditCategory";

// === Главный компонент админ-приложения ===
export default function AdminApp() {
  return (
    <Routes>
      {/* Главная страница админки — табличная панель */}
      <Route path="/" element={<AdminTab />} />

      {/* Раздел "Загадки" */}
      <Route path="riddles">
        {/* Просмотр списка загадок */}
        <Route index element={
          <>
            {/* Вложенная навигация: вопросы, добавление вопроса, категории, настройки */}
            <h3>Навигация внутри раздела "Загадки"</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <Route path="list" element={<ViewRiddle />} />
              <Route path="add-question" element={
                <>
                  {/* Кнопка "Назад" — возвращается к списку загадок */}
                  <button className="btn ghost mb-8">← Назад к списку загадок</button>

                  {/* Кнопка редактирования загадки */}
                  <Route path="/:riddleId/edit" element={<EditRiddle />} />

                  {/* Форма добавления вопроса */}
                  <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                    <h4>Новый вопрос</h4>
                    <button className="btn green mt">Сохранить вопрос</button>
                    <button className="btn ghost mt" onClick={() => window.history.back()}>Отмена</button>
                  </div>
                </>
              } />
            </div>

            {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу QR-кодов */}
            <p className="muted">Для возврата на страницу QR-кодов нажмите кнопку «QR-коды» в верхней панели навигации.</p>
          </>
        } />

        {/* Редактирование загадки (редактор вопросов) */}
        <Route path=":riddleId/edit-questions" element={<EditRiddleEditor />} />

        {/* Настройки загадки */}
        <Route path=":riddleId/settings">
          <Route index element={<RiddleSettings />} />
          <Route path="view" element={<RiddleSettingsView />} />
        </Route>
      </Route>

      {/* Раздел "Категории загадок" */}
      <Route path="categories">
        <Route index element={<>
          {/* Кнопка редактирования категории */}
          <button className="btn green mt mb-8">🖊️ Редактировать категорию</button>

          {/* Кнопка "Назад" — возвращается к списку загадок */}
          <button className="btn ghost mt mb-8">← Назад к списку загадок</button>

          {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу QR-кодов */}
          <p className="muted">Для возврата на страницу QR-кодов нажмите кнопку «QR-коды» в верхней панели навигации.</p>
        </>} />

        {/* Редактирование категории */}
        <Route path="edit/:categoryId" element={<>
          {/* Кнопка "Назад" — возвращается к списку загадок */}
          <button className="btn ghost mt mb-8">← Назад к списку загадок</button>

          <h4>Редактирование категории</h4>
          <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
            <label className="field-label">Название категории</label>
            <input type="text" placeholder="Логика и математика" value="" onChange={() => {}} />

            {/* Кнопка "Сохранить" */}
            <button className="btn green mt mb-8">✅ Сохранить</button>

            {/* Кнопка "Отмена" */}
            <button className="btn ghost mt mb-8">Отмена</button>

            {/* Кнопки навигации */}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn ghost" onClick={() => window.history.back()}>← Назад к списку категорий</button>
              <button className="btn ghost">🖊️ Редактировать загадку</button>
            </div>

            {/* Кнопка "Назад к предыдущей странице" */}
            <br />
            <p className="muted">Для возврата на страницу QR-кодов нажмите кнопку «QR-коды» в верхней панели навигации.</p>
          </div>
        </>} />
      </Route>

      {/* Раздел "Настройки" */}
      <Route path="settings">
        {/* Кнопка редактирования настроек */}
        <button className="btn green mt mb-8">⚙️ Редактировать настройки</button>

        {/* Настройки квеста */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
          <div className="info">
            <h4>Текущие настройки:</h4>
            <ul>
              <li><strong>Показывать подсказки</strong>: Да</li>
              <li><strong>Тайм-лимит по умолчанию</strong>: 300 сек.</li>
              <li><strong>Разрешать повторные ответы</strong>: Да</li>
            </ul>
          </div>

          {/* Кнопка "Сохранить" */}
          <button className="btn green mt mb-8">✅ Сохранить настройки</button>

          {/* Кнопка отмены */}
          <button className="btn ghost mt mb-8">Отмена</button>

          {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу QR-кодов */}
          <p className="muted">Для возврата на страницу QR-кодов нажмите кнопку «QR-коды» в верхней панели навигации.</p>
        </div>
      </Route>

    </Routes>
  );
}