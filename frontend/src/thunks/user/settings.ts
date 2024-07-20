import { dbLoadSettings, dbSetDarkMode } from "dbRequests/settings";
import { useSettings } from "models/settings";

export function toggleDarkMode() {
  useSettings.getState().toggleDarkMode();
  dbSetDarkMode(useSettings.getState().darkMode);
}

export async function loadSettings() {
  const res = await dbLoadSettings();
  if (res.status === 200) {
    useSettings.getState().setSettings(res.data);
  }
}
