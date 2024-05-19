import { dbLoadSettings, dbSetDarkMode, dbLoadConstants } from "dbRequests/settings";
import { useSettings } from "models/settings";
import { COMMON_CONSTS } from "utils/constants";

export function toggleDarkMode() {
  useSettings.getState().toggleSetting("darkMode");
  dbSetDarkMode(useSettings.getState().darkMode);
}

export function toggleMiniMap() {
  useSettings.getState().toggleSetting("showMiniMap");
  // dbSetDarkMode(useSettings.getState().darkMode);
}

export async function loadSettings() {
  const res = await dbLoadSettings();
  if (res.status === 200) {
    useSettings.getState().setSettings(res.data);
  }
}

export async function loadConstants() {
  const res = await dbLoadConstants();
  if (res.status === 200) {
    for (const [k, v] of Object.entries(res.data)) {
      COMMON_CONSTS[k] = v;
    }
  }
  console.log("COMMON_CONSTS", COMMON_CONSTS)
}
