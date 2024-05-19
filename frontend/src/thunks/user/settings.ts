import { dbLoadSettings } from "dbRequests/settings";
import { darkModeState } from "hooks/localStorageHooks";
import { useSettings } from "models/settings";

export function toggleDarkMode() {
  const [darkMode, setDarkMode] = darkModeState();
  setDarkMode(!darkMode);
}

export function toggleMiniMap() {
  useSettings.getState().toggleSetting("showMiniMap");
}

export async function loadSettings() {
  const res = await dbLoadSettings();
  if (res.status === 200) {
    useSettings.getState().setSettings(res.data);
  }
}
