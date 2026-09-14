import { Routes, Route, Link, Navigate } from "react-router-dom";
import { QUEST } from "./questConfig.js";
import Start from "./pages/Start.jsx";
import Station from "./pages/Station.jsx";
import Progress from "./pages/Progress.jsx";
import Admin from "./pages/Admin.jsx";
import AdminProgress from "./pages/AdminProgress.jsx";
import Register from "./pages/Register.jsx";
import Landing from "./pages/Landing.jsx";

export default function App() {
  return (
    <div className="wrap">
      <div className="brand">
        <span className="dot" />
        <span>{QUEST.title}</span>
      </div>

      <Routes>
        <Route path="/" element={<Start />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/welcome" element={<Landing />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reg" element={<Register />} />
        <Route path="/s/:id" element={<Station />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/progress" element={<AdminProgress />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <div className="footer">
        <Link className="small" to="/landing">
          ✨ Презентация
        </Link>{" "}
        · {" "}
        <Link className="small" to="/register">
          📝 Регистрация
        </Link>{" "}
        · {" "}
        <Link className="small" to="/progress">
          Мой прогресс
        </Link>{" "}
        · {" "}
        <Link className="small" to="/">
          В начало
        </Link>
      </div>
    </div>
  );
}
