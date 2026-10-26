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

const time = (iso) => (iso ? new Date(iso).toLocaleTimeString("ru-RU", { timeZone: "Asia/Almaty" }) : "—");
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" }) : "—");

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
export function buildParticipantsListText(participants, { groups, loners }, standingsRows = [], mode = "all") {
  if (participants.length === 0) {
    return "📋 <b>Список участников пока пуст.</b>\nНикто ещё не зарегистрировался через форму.";
  }

  const currentGroups = groups.filter((g) => !g.team.archived);
  const archived = groups.length - currentGroups.length;
  const targetGroups = mode === "current" && (currentGroups.length > 0 || loners.length > 0) ? currentGroups : groups;

  const currentMembers = [...targetGroups.flatMap((g) => g.members), ...loners];
  const listForStats = mode === "current" ? currentMembers : participants;
  const withCar = listForStats.filter((p) => p.hasCar).length;
  const withoutCar = listForStats.length - withCar;

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

  const isCurrentOnly = mode === "current" && archived > 0;
  let msg = isCurrentOnly
    ? `📋 <b>УЧАСТНИКИ ТЕКУЩЕГО КВЕСТА</b> (${currentMembers.length} чел.)\n\n`
    : `📋 <b>БАЗА УЧАСТНИКОВ</b> (всего: ${participants.length} чел.)\n\n`;

  if (targetGroups.length === 0) {
    msg += `   <i>В текущем квесте пока нет зарегистрированных команд.</i>\n\n`;
  }

  for (const { team, members } of targetGroups) {
    const declared = team.size ? `${members.length} из ${team.size}` : `${members.length}`;
    // Команда без номера — из прошлых мероприятий: её номер уже стёрт очисткой.
    const head = team.archived
      ? `🗂 <b>«${escapeHtml(team.name)}»</b> <i>(прошлый квест)</i>`
      : `👥 <b>№${team.number} «${escapeHtml(team.name)}»</b>`;
    msg += `${head} — зарегистрировано ${declared}\n`;
    msg += `   ⭐️ Капитан: <b>${escapeHtml(team.captainName || "—")}</b> · <code>${escapeHtml(
      team.captainPhone || "—"
    )}</code>\n`;

    // Прогресс по локациям (если квест уже идёт).
    const prog = team.number ? progressByTeam.get(team.number) : null;
    if (prog && prog.solved > 0) {
      const status = prog.finishedAt
        ? `🏁 финиш в ${time(prog.finishedAt)}`
        : `🏃 в процессе (последняя: ${time(prog.lastAt)})`;
      msg += `   🧩 <b>Пройдено: ${prog.solved}</b> · ${status}\n`;
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
  if (isCurrentOnly) {
    msg += `📊 <b>Итого в этом квесте:</b> ${currentMembers.length} чел. (🚘 На машине: ${withCar} | 🚶 Без авто: ${withoutCar})\n`;
    msg += `👥 <b>Команд:</b> ${currentGroups.length} | 🙋 Без команды: ${loners.length}\n`;
    msg += `🗂 <i>В архиве прошлых квестов ещё ${archived} команд (${participants.length - currentMembers.length} чел.)</i>`;
  } else {
    msg += `📊 <b>Итого:</b> ${participants.length} чел. (🚘 На машине: ${withCar} | 🚶 Без авто: ${withoutCar})\n`;
    msg += `👥 <b>Команд в этом квесте:</b> ${currentGroups.length}`;
    if (archived) msg += ` | 🗂 из прошлых: ${archived}`;
    msg += ` | 🙋 Без команды: ${loners.length}`;
  }
  return msg;
}

/**
 * Таблица квеста. rows приходят из store.standings() — они уже отсортированы
 * по сумме баллов, затем по времени финиша.
 *
 * Показывает:
 *  - сумму баллов и число взятых локаций
 *  - общее время квеста (старт → финиш)
 *  - время на каждой локации (прибытие → решение)
 *  - статус «в процессе» / «финиш»
 */
export function buildStandingsText(rows, total) {
  if (!rows.length) {
    return "🏁 <b>Таблица пуста.</b>\nНи одна команда ещё не зарегистрирована.";
  }

  const finishedCount = rows.filter((r) => r.finishedAt).length;

  let msg = `🏁 <b>ТАБЛИЦА КВЕСТА</b> (всего локаций: ${total})\n`;
  if (finishedCount) msg += `🏆 Финишировало: ${finishedCount} из ${rows.length}\n`;
  msg += `\n`;

  rows.forEach((r, i) => {
    const place = r.finishedAt ? `🏆 ${i + 1}.` : `${i + 1}.`;
    msg += `${place} <b>№${r.teamNumber || "—"} ${escapeHtml(r.teamName || "без названия")}</b>\n`;
    msg += `   ⭐ Баллы: <b>${r.totalScore ?? 0}</b> · 🧩 Пройдено: <b>${r.solved}</b>/${total}`;
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

    msg += `   🕒 Последняя локация: ${time(r.lastAt)}\n`;

    // Время на каждой локации (прибытие → решение).
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
      msg += `   📍 По локациям: ${parts.join(" ")}\n`;
    }

    msg += `   📸 Материалов от капитана: ${r.media}\n\n`;
  });

  msg += `───────────────\n`;
  msg += `Победитель — команда с наибольшей суммой баллов; при равенстве — раньше финишировавшая. Баллы за творческие задания считаются отдельно.`;
  return msg;
}
