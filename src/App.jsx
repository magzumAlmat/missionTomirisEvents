import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { QUEST } from "./questConfig.js";
import Start from "./pages/Start.jsx";
import Station from "./pages/Station.jsx";

import Admin from "./pages/Admin.jsx";
import AdminProgress from "./pages/AdminProgress.jsx";
import Register from "./pages/Register.jsx";
import Landing from "./pages/Landing.jsx";
import Profile from "./pages/Profile.jsx";

export default function App() {
  const location = useLocation();
  // Во время игры (на страницах станций) скрываем Презентация/Регистрация/В начало
  const isStationPage = location.pathname.startsWith("/s/");
  const isAdminPage = location.pathname.startsWith("/admin");
  const isProfilePage = location.pathname === "/profile";

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
        <Route path="/profile" element={<Profile />} />

        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/progress" element={<AdminProgress />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {!isAdminPage && (
        <div className="footer">
          {!isStationPage && (
            <>
              <Link className="small" to="/landing">✨ Презентация</Link>
              {" · "}
              <Link className="small" to="/register">📝 Регистрация</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

