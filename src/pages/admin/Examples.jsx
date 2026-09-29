import AdminTab from "./AdminTab";
import ViewRiddle from "./ViewRiddle";
import EditRiddleEditor from "./EditRiddleEditor";
import AddQuestionForm from "./AddQuestionForm";
import CategoriesList from "./CategoriesList";
import RiddleSettings from "./RiddleSettings";

/**
 * Примеры использования компонентов админки.
 * 
 * Этот файл можно использовать для быстрого запуска и проверки работы кнопок.
 */

export default function Examples() {
  return (
    <div>
      <h1>🧪 Примеры использования компонентов</h1>

      {/* Пример 1: Главная страница админки с табами */}
      <section className="card">
        <h2>Пример 1: Главный компонент AdminTab</h2>
        <p>Это табличная панель с тремя вкладками: QR-коды, Капитаны, Загадки.</p>
        <AdminTab />
      </section>

      {/* Пример 2: Просмотр списка загадок */}
      <section className="card">
        <h2>Пример 2: Просмотр списка загадок</h2>
        <p>Показывает список загадок, кнопки добавления вопроса, редактирования и т.д.</p>
        <ViewRiddle riddleId={null} subTab="list" />
      </section>

      {/* Пример 3: Редактор свойств загадки */}
      <section className="card">
        <h2>Пример 3: Редактирование свойств загадки</h2>
        <p>Изменение заголовка, тайм-лимита и других параметров.</p>
        <EditRiddleEditor riddleId={1} />
      </section>

      {/* Пример 4: Добавление вопроса к загадке */}
      <section className="card">
        <h2>Пример 4: Добавление нового вопроса</h2>
        <p>Форма добавления текста и ответа на вопрос.</p>
        <AddQuestionForm riddleId={1} />
      </section>

      {/* Пример 5: Список категорий загадок */}
      <section className="card">
        <h2>Пример 5: Управление категориями</h2>
        <p>Просмотр и редактирование категорий загадок.</p>
        <CategoriesList />
      </section>

      {/* Пример 6: Настройки тайм-лимита */}
      <section className="card">
        <h2>Пример 6: Настройки тайм-лимита</h2>
        <p>Настройка тайм-лимита, показ подсказок и т.д.</p>
        <RiddleSettings riddleId={1} />
      </section>

    </div>
  );
}