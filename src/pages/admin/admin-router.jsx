import { Routes, Route } from "react-router-dom";
import AdminTab from "./AdminTab";

// === Главный роутинг для раздела "Загадки" (подключается из App.jsx) ===
export default function AdminRiddlesRouter() {
  return (
    <Routes>
      {/* Просмотр списка загадок */}
      <Route path="/list" element={
        <>
          <h3 style={{ marginBottom: 8 }}>Загадки</h3>

          {/* Кнопка "Добавить вопрос" — открывает форму добавления вопроса к новой загадке */}
          <button className="btn mt mb-8">+ Добавить вопрос к новой загадке</button>

          {/* Кнопка "Редактировать загадку" — перенаправляет на редактирование свойств загадки */}
          <button className="btn ghost mt mb-8">🖊️ Редактировать загадку (свойства)</button>

          {/* Кнопка "Настройки загадки" — открывает настройки тайм-лимита и подсказок */}
          <button className="btn ghost mt mb-8">⚙️ Настройки загадки</button>

          {/* Кнопка категорий — перенаправляет на страницу списка категорий */}
          <button className="btn ghost mt mb-8">🏷️ Категории загадок</button>

          {/* Список загадок (mock) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2].map(id => (
              <div key={id} style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
                <strong>#{id}</strong> — Загадка {id}: ответ "∞"
              </div>
            ))}
          </div>

          {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу QR-кодов */}
          <br />
          <button className="btn ghost mt" onClick={() => window.location.href = "/admin/qr"}>← На страницу QR-кодов (из раздела Загадок)</button>
        </>
      } />

      {/* Просмотр загадки — список вопросов */}
      <Route path="/:riddleId/view">
        <Route index element={
          <>
            <h3 style={{ marginBottom: 8 }}>Загадка</h3>

            {/* Кнопка редактирования загадки — перенаправляет на страницу редактирования свойств */}
            <button className="btn green mt mb-8" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/edit-questions`}>
              🖊️ Редактировать загадку (свойства)
            </button>

            {/* Кнопка настроек — открывает настройки тайм-лимита и подсказок */}
            <button className="btn ghost mt mb-8" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/settings`}>
              ⚙️ Настройки загадки
            </button>

            {/* Кнопка "Добавить вопрос" — открывает форму добавления вопроса */}
            <button className="btn mt mb-8" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/edit-questions/add-question`}>
              + Добавить вопрос к этой загадке
            </button>

            {/* Кнопка "Назад к списку загадок" — возвращает на страницу списка */}
            <button className="btn ghost mt mb-8">← Назад к списку загадок</button>

            {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу QR-кодов */}
            <br />
            <button className="btn ghost mt" onClick={() => window.location.href = "/admin/qr"}>← На страницу QR-кодов (из раздела Загадок)</button>

            {/* Кнопка "Редактировать загадку" — перенаправляет на редактирование свойств */}
            <br />
            <button className="btn ghost mt mb-8" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/edit-questions`}>
              🖊️ Редактировать загадку (свойства)
            </button>

            {/* Кнопка "Настройки загадки" — открывает настройки тайм-лимита и подсказок */}
            <br />
            <button className="btn ghost mt mb-8" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/settings`}>
              ⚙️ Настройки загадки
            </button>

            {/* Кнопка "Категории загадок" — перенаправляет на страницу списка категорий */}
            <br />
            <button className="btn ghost mt mb-8" onClick={() => window.location.href = "/admin/riddles/categories"}>🏷️ Категории загадок</button>

            {/* Список вопросов (mock) */}
            <h4 style={{ marginTop: 16 }}>Вопросы:</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[{ question: "Какое число больше всех?", answer: "∞" }, { question: "Что можно измерить, но нельзя увидеть?", answer: "Время" }].map((q, i) => (
                <div key={i} style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                  {q.question} — <span style={{ color: "#aaa" }}>{q.answer}</span>
                </div>
              ))}
            </div>

            {/* Кнопка "Назад к предыдущей странице" */}
            <br />
            <button className="btn ghost mt" onClick={() => window.location.href = "/admin/qr"}>← На страницу QR-кодов (из раздела Загадок)</button>
          </>
        } />

        {/* Редактирование загадки — свойства (заголовок, тайм-лимит) */}
        <Route path="/edit" element={
          <>
            <h3 style={{ marginBottom: 8 }}>Редактирование свойств загадки</h3>

            {/* Кнопка "Назад к списку вопросов" — возвращает на страницу просмотра загадки */}
            <button className="btn ghost mt mb-8">← Назад к списку вопросов</button>

            {/* Кнопка "Сохранить изменения" — сохраняет и возвращает на просмотр */}
            <button className="btn green mt mb-8" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/view`}>
              ✅ Сохранить (вернёт к списку вопросов)
            </button>

            {/* Кнопка "Отмена" — возвращает без сохранения */}
            <button className="btn ghost mt mb-8">Отмена</button>

            {/* Поля редактирования свойств загадки */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
              <div className="info">
                <h4>Редактирование свойств загадки #{params.riddleId}</h4>
                <p className="muted">Настройте дополнительные параметры:</p>

                <ul>
                  <li><strong>Показывать подсказки</strong>: Да</li>
                  <li><strong>Тайм-лимит</strong>: 300 сек.</li>
                </ul>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label className="field-label">Заголовок загадки</label>
                  <input type="text" placeholder="Например: 'Какой город называют воротами Европы?'" value="" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
                </div>

                <div>
                  <label className="field-label">Тайм-лимит (секунды)</label>
                  <input type="number" placeholder="300" value="300" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
                </div>

                {/* Кнопка "Сохранить изменения" — сохраняет и возвращает на просмотр */}
                <button className="btn green mt mb-8">✅ Сохранить (вернёт к списку вопросов)</button>

                {/* Кнопка "Отмена" — возвращает без сохранения */}
                <button className="btn ghost mt mb-8">Отмена</button>

                {/* Кнопки навигации */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn ghost" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/view`}>← Назад к списку вопросов</button>
                  <button className="btn ghost">🖊️ Редактировать загадку (свойства)</button>
                </div>

                {/* Кнопка "Назад к предыдущей странице" */}
                <br />
                <button className="btn ghost mt" onClick={() => window.location.href = "/admin/qr"}>← На страницу QR-кодов (из раздела Загадок)</button>
              </div>
            </div>
          </>
        } />

        {/* Редактирование загадки — вопросы */}
        <Route path="/edit-questions" element={
          <>
            <h3 style={{ marginBottom: 8 }}>Редактирование вопросов</h3>

            {/* Кнопка "Назад к списку вопросов" — возвращает на страницу просмотра загадки */}
            <button className="btn ghost mt mb-8">← Назад к списку вопросов</button>

            {/* Навигация между вкладками */}
            <h4 style={{ marginBottom: 8 }}>Навигация</h4>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 10 }}>
              <button className="btn">📋 Список вопросов</button>
              <button className={`btn ${window.location.pathname.includes("add-question") ? "" : "ghost"}`} onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/edit-questions/add-question`}>+ Добавить вопрос</button>
            </div>

            {/* Список вопросов с возможностью редактирования */}
            <h4 style={{ marginBottom: 8 }}>Вопросы загадки</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[{ id: 101, type: "text", question: "Какое число больше всех?", answer: "∞" }, { id: 201, type: "text", question: "Кто был первым императором Рима?", answer: "Август" }].map((q) => (
                <div key={q.id} style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span><strong>#{q.id}</strong> — {q.type}: {q.question}</span>
                    {/* Кнопка редактирования отдельного вопроса */}
                    <button className="btn ghost" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/edit-questions/question/${q.id}`}>🖊️ Редактировать вопрос</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Кнопка добавления вопроса */}
            <br />
            <button className="btn mt" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/edit-questions/add-question`}>+ Добавить вопрос</button>
          </>
        } />

        {/* Добавление нового вопроса к загадке */}
        <Route path="/edit-questions/add-question" element={
          <>
            <h3 style={{ marginBottom: 8 }}>Добавить новый вопрос</h3>

            {/* Кнопка "Назад к списку вопросов" — возвращает во вкладку списка */}
            <button className="btn ghost mt mb-8">← Назад к списку вопросов</button>

            <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
              <h4>Новый вопрос</h4>

              {/* Кнопка отмены */}
              <button className="btn ghost" style={{ marginBottom: 12 }} onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/edit-questions`}>Отмена</button>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8 }}>
                {/* Выбор типа вопроса */}
                <div>
                  <label className="field-label">Тип вопроса</label>
                  <select value="" onChange={() => {}} style={{ width: "100%", padding: 6 }}>
                    <option value="">Выберите тип...</option>
                    <option value="text">Текст</option>
                    <option value="image">Картинка</option>
                    <option value="video">Видео</option>
                  </select>
                </div>

                {/* Текст вопроса */}
                <div style={{ gridColumn: "2" }}>
                  <label className="field-label">Текст вопроса</label>
                  <input type="text" placeholder="Например: 'Какой город называют воротами Европы?'" value="" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
                </div>

                {/* Ответ */}
                <div style={{ gridColumn: "2" }}>
                  <label className="field-label">Ответ</label>
                  <input type="text" placeholder="Например: 'Константинополь'" value="" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
                </div>

                {/* Кнопка сохранения */}
                <button className="btn green mt">✅ Сохранить вопрос</button>

                {/* Кнопка отмены — повторяем для удобства */}
                <br />
                <button className="btn ghost mt mb-8" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/edit-questions`}>Отмена</button>

                {/* Кнопки навигации */}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn ghost" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/edit-questions`}>← Назад к списку вопросов</button>
                  <button className="btn ghost">🖊️ Редактировать загадку (свойства)</button>
                </div>

                {/* Кнопка "Назад к предыдущей странице" */}
                <br />
                <button className="btn ghost mt mb-8" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/view`}>← На страницу просмотра загадки (из раздела редактирования вопроса)</button>
              </div>
            </div>
          </>
        } />

        {/* Редактирование отдельного вопроса */}
        <Route path="/edit-questions/question/:questionId" element={
          <>
            <h3 style={{ marginBottom: 8 }}>Редактирование вопроса #{params.questionId}</h3>

            {/* Кнопка "Назад к списку вопросов" — возвращает во вкладку списка */}
            <button className="btn ghost mt mb-8">← Назад к списку вопросов</button>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
              <div className="info">
                <h4>Редактирование вопроса #{params.questionId}</h4>
                <p className="muted">Измените текст и ответ.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label className="field-label">Текст вопроса</label>
                  <input type="text" placeholder="Введите текст вопроса..." value="" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
                </div>

                <div>
                  <label className="field-label">Ответ</label>
                  <input type="text" placeholder="Введите ответ..." value="" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
                </div>

                {/* Кнопка "Сохранить изменения" — сохраняет и возвращает на страницу просмотра загадки */}
                <button className="btn green mt mb-8">✅ Сохранить (вернёт к списку вопросов)</button>

                {/* Кнопка "Отмена" — возвращает без сохранения */}
                <button className="btn ghost mt mb-8">Отмена</button>

                {/* Кнопки навигации */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn ghost" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/edit-questions`}>← Назад к списку вопросов</button>
                  <button className="btn ghost">🖊️ Редактировать загадку (свойства)</button>
                </div>

                {/* Кнопка "Назад к предыдущей странице" */}
                <br />
                <button className="btn ghost mt mb-8" onClick={() => window.location.href = `/admin/riddles/${params.riddleId}/view`}>← На страницу просмотра загадки (из раздела редактирования вопроса)</button>

                {/* Кнопка "Назад к предыдущей странице" — возвращает на главную страницу админки */}
                <br />
                <button className="btn ghost mt" onClick={() => window.location.href = "/admin/qr"}>← На страницу QR-кодов (из раздела редактирования вопроса)</button>
              </div>
            </div>
          </>
        } />

      </Route>

      {/* Раздел "Настройки загадки" */}
      <Route path="/settings">
        <Route index element={
          <>
            <h3 style={{ marginBottom: 8 }}>Настройки загадки #{params.riddleId}</h3>

            {/* Кнопка "Назад к списку вопросов" — возвращает во вкладку списка */}
            <button className="btn ghost mt mb-8">← Назад к списку вопросов</button>

            {/* Кнопка "Сохранить настройки" — сохраняет и возвращает на просмотр */}
            <div style={{ padding: 12, background: "rgba(76,217,100,0.05)", borderRadius: 8 }}>
              <button className="btn green mt mb-8">✅ Сохранить настройки</button>

              {/* Кнопка "Отмена" — возвращает без сохранения */}
              <button className="btn ghost mt">Отмена</button>
            </div>

            {/* Поля настроек */}
            <h4 style={{ marginTop: 16 }}>Параметры загадки:</h4>

            {/* Поле "Показывать подсказки" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО (было исправлено) */}
            <div className="setting">
              <label className="field-label">Показывать подсказки</label>
              <input type="checkbox" checked={true} onChange={() => {}} />
              <span className="hint-text">При неправильном ответе загадка будет показывать подсказку.</span>
            </div>

            {/* Поле "Тайм-лимит" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО (было исправлено) */}
            <div className="setting">
              <label className="field-label">Тайм-лимит (секунды)</label>
              <input type="number" value="300" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
            </div>

            {/* Поле "Разрешать повторные попытки" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО (было исправлено) */}
            <div className="setting">
              <label className="field-label">Разрешать повторные ответы</label>
              <input type="checkbox" checked={true} onChange={() => {}} />
            </div>

            {/* Поле "Максимальное количество попыток" — ПЕРВОЕ ПРОБЛЕМНОЕ МЕСТО (было исправлено) */}
            <div className="setting">
              <label className="field-label">Макс. кол-во попыток</label>
              <input type="number" value="3" onChange={() => {}} style={{ width: "100%", padding: 8, borderRadius: 6 }} />
            </div>

            {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадки */}
            <br />
            <button className="btn ghost mt mb-8">← Назад к списку вопросов</button>

            {/* Кнопка "Назад к предыдущей странице" — возвращает на главную страницу админки */}
            <br />
            <button className="btn ghost mt" onClick={() => window.location.href = "/admin/qr"}>← На страницу QR-кодов (из раздела Загадок)</button>
          </>
        } />

        {/* Просмотр настроек загадки */}
        <Route path="/view" element={
          <>
            <h3 style={{ marginBottom: 8 }}>Настройки загадки #{params.riddleId}</h3>

            {/* Кнопка "Редактировать настройки" — перенаправляет на страницу редактирования */}
            <button className="btn green mt mb-8">⚙️ Редактировать настройки загадки</button>

            {/* Кнопка "Назад к списку вопросов" — возвращает во вкладку списка */}
            <button className="btn ghost mt mb-8">← Назад к списку вопросов</button>

            <h4 style={{ marginBottom: 8 }}>Текущие настройки:</h4>

            {/* Отображение текущих настроек */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
              <div className="info">
                <ul>
                  <li><strong>Показывать подсказки</strong>: Да</li>
                  <li><strong>Тайм-лимит</strong>: 300 сек.</li>
                  <li><strong>Разрешать повторные ответы</strong>: Да</li>
                  <li><strong>Макс. кол-во попыток</strong>: 3</li>
                </ul>
              </div>

              {/* Кнопка "Назад к предыдущей странице" — возвращает на страницу просмотра загадки */}
              <button className="btn ghost mt mb-8">← Назад к списку вопросов</button>

              {/* Кнопка "Назад к предыдущей странице" — возвращает на главную страницу админки */}
              <br />
              <button className="btn ghost mt" onClick={() => window.location.href = "/admin/qr"}>← На страницу QR-кодов (из раздела Загадок)</button>
            </div>
          </>
        } />

      </Route>

    </Routes>
  );
}