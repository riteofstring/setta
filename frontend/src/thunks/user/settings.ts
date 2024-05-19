import { dbLoadSettings } from "dbRequests/settings";
import { darkModeLS, showMinimapLS } from "hooks/localStorageHooks";
import { useSettings } from "models/settings";

export function toggleDarkMode() {
  const [value, setValue] = darkModeLS();
  setValue(!value);
}

export function toggleMiniMap() {
  const [value, setValue] = showMinimapLS();
  setValue(!value);
}

export async function loadSettings() {
  const res = await dbLoadSettings();
  if (res.status === 200) {
    useSettings.getState().setSettings(res.data);
  }
}
