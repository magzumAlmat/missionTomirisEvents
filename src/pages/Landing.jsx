import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QUEST } from "../questConfig.js";

// Вычисление обратного отсчета до даты квеста
function useCountdown(targetDateStr) {
  const [timeLeft, setTimeLeft] = useState(() => calculateLeft(targetDateStr));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateLeft(targetDateStr));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDateStr]);

  return timeLeft;
}

function calculateLeft(targetDateStr) {
  // Пробуем распарсить дату из конфига или ставим дефолт +3 дня для интерактива
  const target = new Date("2026-09-14T12:00:00").getTime();
  const now = new Date().getTime();
  const diff = Math.max(0, target - now);

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, expired: diff <= 0 };
}

export default function Landing() {
  const navigate = useNavigate();
  const poster = QUEST.poster || {};
  const countdown = useCountdown(poster.date);
  const [activeFaq, setActiveFaq] = useState(null);

  const faqs = [
    {
      q: "Сколько человек может быть в одной команде?",
      a: "Рекомендуем от 1 до 5 человек. Вы можете проходить квест всей семьёй, с друзьями или коллегами.",
    },
    {
      q: "Нужен ли автомобиль для прохождения?",
      a: "Да! В команде должен быть хотя бы один автомобиль.",
    },
    {
      q: "Что нужно иметь с собой на старте?",
      a: "Качественно заряженный смартфон с выходом в интернет и камерой для считывания QR-кодов, а также удобную обувь и отличное настроение!",
    },
    {
      q: "Как проверяются ответы и начисляется приз?",
      a: "На каждой точке вы сканируете QR-код, разгадываете загадку и вводите ответ. Организаторы видят ваш прогресс в реальном времени. Команда, первой прошедшая все точки, получает суперприз!",
    },
  ];

  return (
    <div className="landing-container">
      {/* 🌟 HERO SECTION */}
      <div className="landing-hero-card card">
        <div className="hero-badge">🚀 ИММЕРСИВНЫЙ ГОРОДСКОЙ КВЕСТ</div>
        <h1 className="hero-title">{QUEST.title}</h1>
        <p className="hero-subtitle">{QUEST.intro}</p>

        {/* Картинка-постер */}
        <div className="hero-img-wrapper">
          <img
            src="/quest_hero.png"
            alt="EventTomiris Quest Poster"
            className="hero-img"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
          <div className="hero-img-overlay" />
        </div>

        {/* ⏱ ОБРАТНЫЙ ОТСЧЕТ */}
        <div className="countdown-box">
          <div className="countdown-header">
            <span className="live-dot" />
            <span>ДО СТАРТА ПРИКЛЮЧЕНИЯ ОСТАЛОСЬ:</span>
          </div>
          <div className="countdown-grid">
            <div className="time-card">
              <span className="time-num">
                {String(countdown.days).padStart(2, "0")}
              </span>
              <span className="time-lbl">ДНЕЙ</span>
            </div>
            <div className="time-colon">:</div>
            <div className="time-card">
              <span className="time-num">
                {String(countdown.hours).padStart(2, "0")}
              </span>
              <span className="time-lbl">ЧАСОВ</span>
            </div>
            <div className="time-colon">:</div>
            <div className="time-card">
              <span className="time-num">
                {String(countdown.minutes).padStart(2, "0")}
              </span>
              <span className="time-lbl">МИНУТ</span>
            </div>
            <div className="time-colon">:</div>
            <div className="time-card highlight">
              <span className="time-num">
                {String(countdown.seconds).padStart(2, "0")}
              </span>
              <span className="time-lbl">СЕКУНД</span>
            </div>
          </div>
          <p className="countdown-sub">
            📅 {poster.date || "14 сентября 2026"} · 🕒 {poster.time || "12:00"} · 📍 {poster.place || "Центр города"}
          </p>
        </div>

        {/* КНОПКИ ПРИЗЫВА К ДЕЙСТВИЮ */}
        <div className="hero-cta-group">
          <button
            className="btn green pulse-btn"
            onClick={() => navigate("/register")}
          >
            🔥 Зарегистрировать команду
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              const el = document.getElementById("features");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            🗺️ Подробности квеста
          </button>
        </div>
      </div>

      {/* 📊 КЛЮЧЕВЫЕ МЕТРИКИ КВЕСТА */}
      <div className="landing-stats-grid">
        <div className="stat-card">
          <span className="stat-icon">🗺️</span>
          <span className="stat-value">{QUEST.stations?.length || 11}</span>
          <span className="stat-label">Секретных локаций</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🏆</span>
          <span className="stat-value">1</span>
          <span className="stat-label">Главный Суперприз</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">⏱️</span>
          <span className="stat-value">2.5 ч</span>
          <span className="stat-label">Среднее время игры</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">👥</span>
          <span className="stat-value">1-5</span>
          <span className="stat-label">Игроков в команде</span>
        </div>
      </div>

      {/* 🧩 ОСОБЕННОСТИ И ФИШКИ */}
      <div className="card landing-section" id="features">
        <div className="eyebrow">Особенности</div>
        <h2>Почему стоит участвовать?</h2>

        <div className="features-list">
          <div className="feature-item">
            <span className="f-icon">📍</span>
            <div>
              <h3>Засекреченные QR-коды</h3>
              <p className="muted">
                Каждая точка спрятана в уникальном месте города. Сканируйте QR-код, чтобы открыть зашифрованное задание.
              </p>
            </div>
          </div>

          <div className="feature-item">
            <span className="f-icon">📱</span>
            <div>
              <h3>Интерактив без установки приложений</h3>
              <p className="muted">
                Всё работает прямо в браузере вашего смартфона. Уведомления организаторам отправляются мгновенно в Telegram.
              </p>
            </div>
          </div>

          <div className="feature-item">
            <span className="f-icon">🎁</span>
            <div>
              <h3>Настоящие призы на финише</h3>
              <p className="muted">
                Каждая отгаданная точка открывает дорогу к следующей. Пройдите все локации и заберите реальный приз!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 🚀 КАК ПРОХОДИТ ИГРА (STEPPER) */}
      <div className="card landing-section">
        <div className="eyebrow">Шаг за шагом</div>
        <h2>Как проходить квест</h2>

        <div className="steps-container">
          <div className="step-card">
            <span className="step-num">1</span>
            <div className="step-content">
              <h3>Соберите команду</h3>
              <p className="muted">Придумайте название команды и зарегистрируйтесь через форму на сайте.</p>
            </div>
          </div>

          <div className="step-card">
            <span className="step-num">2</span>
            <div className="step-content">
              <h3>Отсканируйте 1-й QR-код</h3>
              <p className="muted">На старте сканируйте QR-код — он откроет задание первой точки.</p>
            </div>
          </div>

          <div className="step-card">
            <span className="step-num">3</span>
            <div className="step-content">
              <h3>Отмечайтесь на точках</h3>
              <p className="muted">Нажмите «Я прибыл», назовите ответ организатору и нажмите «Я отгадал» — откроется подсказка к следующей точке.</p>
            </div>
          </div>

          <div className="step-card">
            <span className="step-num">4</span>
            <div className="step-content">
              <h3>Заберите приз!</h3>
              <p className="muted">Пройдите все точки быстрее других команд и получите заветную награду.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ❓ ВОПРОСЫ И ОТВЕТЫ (FAQ) */}
      <div className="card landing-section">
        <div className="eyebrow">Частые вопросы</div>
        <h2>Всё, что нужно знать</h2>

        <div className="faq-accordion">
          {faqs.map((faq, i) => {
            const isOpen = activeFaq === i;
            return (
              <div
                className={`faq-item ${isOpen ? "open" : ""}`}
                key={i}
                onClick={() => setActiveFaq(isOpen ? null : i)}
              >
                <div className="faq-header">
                  <span>{faq.q}</span>
                  <span className="faq-arrow">{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && <p className="faq-answer muted">{faq.a}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 🔥 ФИНАЛЬНЫЙ CTA ПРИЗЫВ */}
      <div className="card landing-cta-card">
        <h2>Готовы принять вызов?</h2>
        <p className="muted">
          Количество мест на участие ограничено. Зарегистрируйте вашу команду прямо сейчас!
        </p>
        <button
          className="btn green pulse-btn mt"
          onClick={() => navigate("/register")}
          style={{ width: "100%", fontSize: 18, padding: "16px" }}
        >
          🔥 Зарегистрировать команду
        </button>
      </div>

      {/* 📌 ЗАКРЕПЛЕННАЯ ПЛАШКА ДЛЯ МОБИЛЬНЫХ */}
      <div className="sticky-mobile-bar">
        <div className="sticky-timer">
          <span className="sticky-label">До старта:</span>
          <span className="sticky-val">
            {String(countdown.days).padStart(2, "0")}д {String(countdown.hours).padStart(2, "0")}ч {String(countdown.minutes).padStart(2, "0")}м
          </span>
        </div>
        <button className="btn green small-btn" onClick={() => navigate("/register")}>
          🔥 Участвовать
        </button>
      </div>
    </div>
  );
}
