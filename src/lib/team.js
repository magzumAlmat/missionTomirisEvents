const KEY = "event_tomiris_team";

export function getTeam() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch (e) {
    return "";
  }
}

export function setTeam(name) {
  try {
    localStorage.setItem(KEY, name || "");
  } catch (e) {
    /* ignore */
  }
}

// Номер команды выдаёт сервер при регистрации. Это ключ команды на точках
// и в боте для видео — чтобы не набирать название текстом каждый раз.
const NUMBER_KEY = "event_tomiris_team_no";

export function getTeamNumber() {
  try {
    return localStorage.getItem(NUMBER_KEY) || "";
  } catch (e) {
    return "";
  }
}

export function setTeamNumber(n) {
  try {
    localStorage.setItem(NUMBER_KEY, n ? String(n) : "");
  } catch (e) {
    /* ignore */
  }
}

// Имя самого участника — отдельно от названия команды.
const NAME_KEY = "event_tomiris_name";

export function getName() {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch (e) {
    return "";
  }
}

export function setName(name) {
  try {
    localStorage.setItem(NAME_KEY, name || "");
  } catch (e) {
    /* ignore */
  }
}
