import { Routes, Route, Link, Navigate } from "react-router-dom";
import { QUEST } from "./questConfig.js";
import Start from "./pages/Start.jsx";
import Station from "./pages/Station.jsx";
import Progress from "./pages/Progress.jsx";
import Final from "./pages/Final.jsx";

export default function App() {
  return (
    <div className="wrap">
      <div className="brand">
        <span className="dot" />
        <span>{QUEST.title}</span>
      </div>

      <Routes>
        <Route path="/" element={<Start />} />
        <Route path="/s/:id" element={<Station />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/final" element={<Final />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <div className="footer">
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
