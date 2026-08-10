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
