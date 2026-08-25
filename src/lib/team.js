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
