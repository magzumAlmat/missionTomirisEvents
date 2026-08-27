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
 * Список зарегистрированных, сгруппированный по командам.
 * groups/loners приходят из store.participantsByTeam().
 */
export function buildParticipantsListText(participants, { groups, loners }) {
  if (participants.length === 0) {
    return "📋 <b>Список участников пока пуст.</b>\nНикто ещё не зарегистрировался через форму.";
  }

  const withCar = participants.filter((p) => p.hasCar).length;
  const withoutCar = participants.length - withCar;

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
 */
export function buildStandingsText(rows, total) {
  if (!rows.length) {
    return "🏁 <b>Таблица пуста.</b>\nНи одна команда ещё не зарегистрирована.";
  }

  let msg = `🏁 <b>ТАБЛИЦА КВЕСТА</b> (точек всего: ${total})\n\n`;
  rows.forEach((r, i) => {
    const place = r.finishedAt ? `🏆 ${i + 1}.` : `${i + 1}.`;
    msg += `${place} <b>№${r.teamNumber || "—"} ${escapeHtml(r.teamName || "без названия")}</b>\n`;
    msg += `   🧩 Точек: <b>${r.solved}</b>/${total}`;
    msg += r.finishedAt ? ` · 🏁 финиш в ${time(r.finishedAt)}\n` : `\n`;
    msg += `   🕒 Последняя точка: ${time(r.lastAt)}\n`;
    msg += `   📸 Материалов от капитана: ${r.media}\n\n`;
  });
  msg += `───────────────\n`;
  msg += `Победитель — команда, первой взявшая все точки. Приз выдаётся после проверки материалов капитана.`;
  return msg;
}
