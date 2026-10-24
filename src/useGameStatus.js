import { useState, useEffect } from "react";
import { fetchSettings } from "./lib/api.js";
import { QUEST } from "./questConfig.js";

/**
 * В questSettings дата хранится без часового пояса («2026-10-18T12:00:00»).
 * Квест проходит в Алматы (UTC+5), поэтому трактуем её явно как алматинскую,
 * а не как локальную зону устройства.
 */
function parseQuestDate(value) {
  if (!value) return null;
  let s = String(value).trim();
  const hasOffset = /[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasOffset) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00";
    s += "+05:00";
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calculateTimeLeft(targetDateStr) {
  const parsed = parseQuestDate(targetDateStr);
  if (!parsed) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  const target = parsed.getTime();
  const now = Date.now();
  const diff = Math.max(0, target - now);

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, expired: diff <= 0 };
}

export function useGameStatus() {
  const poster = QUEST.poster || {};
  const [settings, setSettings] = useState(() => {
    try {
      const cached = localStorage.getItem("quest_settings_cache");
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(!settings);

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((data) => {
        if (!cancelled && data.settings) {
          setSettings(data.settings);
          try {
            localStorage.setItem("quest_settings_cache", JSON.stringify(data.settings));
          } catch {}
        }
      })
      .catch(() => {
        // Fallback to default
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const targetDate = settings?.targetDate || "2026-10-18T12:00:00";
  const displayDate = settings?.displayDate || poster.date || "18 октября 2026";
  const displayTime = settings?.displayTime || poster.time || "12:00";
  const place = settings?.place || poster.place || "Парковка у школы 216, Адрес: Курильская улица, 17";
  const forceOpen = Boolean(settings?.forceOpen);

  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(targetDate));

  useEffect(() => {
    setTimeLeft(calculateTimeLeft(targetDate));
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(targetDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  const isGameStarted = forceOpen || timeLeft.expired;

  return {
    isGameStarted,
    forceOpen,
    timeLeft,
    targetDate,
    displayDate,
    displayTime,
    place,
    loading,
    refresh: async () => {
      try {
        const data = await fetchSettings();
        if (data.settings) setSettings(data.settings);
      } catch {}
    },
  };
}
