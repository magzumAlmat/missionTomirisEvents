import { Routes, Route } from "react-router-dom";
import AdminTab from "./AdminTab";
import EditRiddle from "./EditRiddle";
import ViewRiddle from "./ViewRiddle";
import EditRiddleEditor from "./EditRiddleEditor";
import EditQuestion from "./EditQuestion";
import AddRiddle from "./AddRiddle";
import CategoriesList from "./CategoriesList";
import RiddleSettings from "./RiddleSettings";
import RiddleSettingsView from "./RiddleSettingsView";
import EditCategory from "./EditCategory";

export default function AdminRouter() {
  return (
    <Routes>
      {/* Главная страница админки — табличная панель */}
      <Route path="/" element={<AdminTab />} />

      {/* Раздел "Загадки" */}
      <Route path="riddles/list" element={
        <ViewRiddle subTab="list" />
      } />

      <Route path="riddles/:riddleId/edit-questions">
        <Route index element={
          <EditRiddleEditor riddleId={String(params.riddleId)} />
        } />
        <Route path="add-question" element={
          <AddQuestionForm riddleId={String(params.riddleId)} />
        } />
      </Route>

      {/* Раздел "Категории загадок" */}
      <Route path="riddles/categories">
        <Route index element={<CategoriesList />} />
        <Route path="edit/:categoryId" element={<EditCategory />} />
      </Route>

      {/* Настройки загадки */}
      <Route path="riddles/:riddleId/settings">
        <Route index element={<RiddleSettings riddleId={String(params.riddleId)} />} />
        <Route path="view" element={<RiddleSettingsView riddleId={String(params.riddleId)} />} />
      </Route>

      {/* Редактирование отдельного вопроса */}
      <Route path="riddles/:riddleId/questions/:questionId/edit">
        <Route index element={<EditQuestion />} />
      </Route>

    </Routes>
  );
}