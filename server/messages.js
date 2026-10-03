/**
 * Тексты сообщений для Telegram — в одном месте.
 *
 * Зачем: таблицу квеста показывают оба бота (организаторский и тот, что
 * принимает видео), а список участников — организаторский. Пока формат жил
 * в двух файлах, он мог разойтись: судья видел бы разные цифры в разных чатах.
 */

/** Telegram-разметка ломается на «<», «>» и «&» — экранируем. */
export function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

const time = (iso) => (iso ? new Date(iso).toLocaleTimeString("ru-RU") : "—");
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU") : "—");

/**
 * Длительность в человекочитаемом виде: «12 мин», «1 ч 05 мин», «2 ч 30 мин».
 * Возвращает «—», если разница некорректна.
 */
export function durationText(fromIso, toIso) {
  if (!fromIso || !toIso) return "—";
  const ms = new Date(toIso) - new Date(fromIso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} мин`;
  return `${h} ч ${String(m).padStart(2, "0")} мин`;
}

/**
 * Список зарегистрированных, сгруппированный по командам.
 * groups/loners приходят из store.participantsByTeam().
 * standingsRows — необязательный массив из store.standings() для показа
 * прогресса по точкам у каждой команды.
 */
export function buildParticipantsListText(participants, { groups, loners }, standingsRows = []) {
  if (participants.length === 0) {
    return "📋 <b>Список участников пока пуст.</b>\nНикто ещё не зарегистрировался через форму.";
  }

  const withCar = participants.filter((p) => p.hasCar).length;
  const withoutCar = participants.length - withCar;

  // Индекс прогресса по номеру команды для быстрой подстановки.
  const progressByTeam = new Map();
  for (const r of standingsRows) {
    if (r.teamNumber) progressByTeam.set(r.teamNumber, r);
  }

  function memberLines(p, idx) {
    return (
      `   ${idx}. 👤 <b>${escapeHtml(p.name)}</b>\n` +
      `      📞 <code>${escapeHtml(p.phone)}</code>\n` +
      `      🚘 За рулём: ${p.hasCar ? "Да 🚗" : "Нет 🚶"}\n` +
      `      📅 ${dateTime(p.createdAt)}\n`
    );
  }

  const current = groups.filter((g) => !g.team.archived).length;
  const archived = groups.length - current;

  let msg = `📋 <b>БАЗА УЧАСТНИКОВ</b> (всего: ${participants.length} чел.)\n\n`;

  for (const { team, members } of groups) {
    const declared = team.size ? `${members.length} из ${team.size}` : `${members.length}`;
    // Команда без номера — из прошлых мероприятий: её номер уже стёрт очисткой.
    const head = team.archived
      ? `🗂 <b>«${escapeHtml(team.name)}»</b> <i>(прошлый квест)</i>`
      : `👥 <b>№${team.number} «${escapeHtml(team.name)}»</b>`;
    msg += `${head} — зарегистрировано ${declared}\n`;
    msg += `   ⭐️ Капитан: <b>${escapeHtml(team.captainName || "—")}</b> · <code>${escapeHtml(
      team.captainPhone || "—"
    )}</code>\n`;

    // Прогресс по точкам (если квест уже идёт).
    const prog = team.number ? progressByTeam.get(team.number) : null;
    if (prog && prog.solved > 0) {
      const status = prog.finishedAt
        ? `🏁 финиш в ${time(prog.finishedAt)}`
        : `🏃 в процессе (последняя: ${time(prog.lastAt)})`;
      msg += `   🧩 <b>Точек: ${prog.solved}</b> · ${status}\n`;
    }

    if (members.length === 0) {
      msg += `   <i>Пока никто не зарегистрировался под этой командой.</i>\n`;
    } else {
      members.forEach((p, i) => {
        msg += memberLines(p, i + 1);
      });
    }
    msg += `\n`;
  }

  if (loners.length) {
    msg += `🙋 <b>БЕЗ КОМАНДЫ</b> — ${loners.length} чел.\n`;
    loners.forEach((p, i) => {
      msg += memberLines(p, i + 1);
    });
    msg += `\n`;
  }

  msg += `───────────────\n`;
  msg += `📊 <b>Итого:</b> ${participants.length} чел. (🚘 На машине: ${withCar} | 🚶 Без авто: ${withoutCar})\n`;
  msg += `👥 <b>Команд в этом квесте:</b> ${current}`;
  if (archived) msg += ` | 🗂 из прошлых: ${archived}`;
  msg += ` | 🙋 Без команды: ${loners.length}`;
  return msg;
}

/**
 * Таблица квеста. rows приходят из store.standings() — они уже отсортированы:
 * сначала финишировавшие по времени финиша, затем по числу взятых точек.
 *
 * Теперь показывает:
 *  - общее время квеста (старт → финиш)
 *  - время на каждой точке (прибытие → решение)
 *  - статус «в процессе» / «финиш»
 *  - место среди финишировавших
 */
export function buildStandingsText(rows, total) {
  if (!rows.length) {
    return "🏁 <b>Таблица пуста.</b>\nНи одна команда ещё не зарегистрирована.";
  }

  const finishedCount = rows.filter((r) => r.finishedAt).length;

  let msg = `🏁 <b>ТАБЛИЦА КВЕСТА</b> (точек всего: ${total})\n`;
  if (finishedCount) msg += `🏆 Финишировало: ${finishedCount} из ${rows.length}\n`;
  msg += `\n`;

  rows.forEach((r, i) => {
    const place = r.finishedAt ? `🏆 ${i + 1}.` : `${i + 1}.`;
    msg += `${place} <b>№${r.teamNumber || "—"} ${escapeHtml(r.teamName || "без названия")}</b>\n`;
    msg += `   🧩 Точек: <b>${r.solved}</b>/${total}`;
    if (r.finishedAt) {
      msg += ` · 🏁 финиш в ${time(r.finishedAt)}`;
    } else if (r.solved > 0) {
      msg += ` · 🏃 в процессе`;
    }
    msg += `\n`;

    // Общее время квеста (старт = первое прибытие, финиш = finishedAt).
    if (r.finishedAt && r.arrivals) {
      const firstArrival = Object.values(r.arrivals).filter(Boolean).sort()[0];
      if (firstArrival) {
        msg += `   ⏱ Общее время: <b>${durationText(firstArrival, r.finishedAt)}</b>\n`;
      }
    }

    msg += `   🕒 Последняя точка: ${time(r.lastAt)}\n`;

    // Время на каждой точке (прибытие → решение).
    if (r.stations && Object.keys(r.stations).length > 0) {
      const stationIds = Object.keys(r.stations).sort((a, b) => Number(a) - Number(b));
      const parts = stationIds.map((id) => {
        const solveAt = r.stations[id];
        const arriveAt = r.arrivals?.[id];
        if (arriveAt && solveAt) {
          const mins = Math.round((new Date(solveAt) - new Date(arriveAt)) / 60000);
          return `${id}(${mins}м)`;
        }
        return `${id}(${time(solveAt)})`;
      });
      msg += `   📍 По точкам: ${parts.join(" ")}\n`;
    }

    msg += `   📸 Материалов от капитана: ${r.media}\n\n`;
  });

  msg += `───────────────\n`;
  msg += `Победитель — команда, первой взявшая все точки. Приз выдаётся после проверки материалов капитана.`;
  return msg;
}
