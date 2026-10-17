export default function CountdownTimer({
  timeLeft,
  displayDate,
  displayTime,
  place,
  title = "ДО НАЧАЛА КВЕСТА ОСТАЛОСЬ",
  compact = false,
}) {
  if (!timeLeft) return null;

  return (
    <div className="countdown-box" style={compact ? { padding: "14px 10px", margin: "14px 0" } : undefined}>
      <div className="countdown-header">
        <span className="live-dot" />
        <span>{title}</span>
      </div>

      <div className="countdown-grid">
        <div className="time-card">
          <span className="time-num">{timeLeft.days}</span>
          <span className="time-lbl">ДНЕЙ</span>
        </div>
        <span className="time-colon">:</span>
        <div className="time-card">
          <span className="time-num">{String(timeLeft.hours).padStart(2, "0")}</span>
          <span className="time-lbl">ЧАСОВ</span>
        </div>
        <span className="time-colon">:</span>
        <div className="time-card">
          <span className="time-num">{String(timeLeft.minutes).padStart(2, "0")}</span>
          <span className="time-lbl">МИНУТ</span>
        </div>
        <span className="time-colon">:</span>
        <div className="time-card highlight">
          <span className="time-num">{String(timeLeft.seconds).padStart(2, "0")}</span>
          <span className="time-lbl">СЕКУНД</span>
        </div>
      </div>

      {(displayDate || displayTime || place) && (
        <div className="countdown-sub" style={{ textAlign: "center", marginTop: 12 }}>
          {displayDate && <span>📅 {displayDate}</span>}
          {displayTime && <span> · 🕒 {displayTime}</span>}
          {place && (
            <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 12 }}>
              📍 {place}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
