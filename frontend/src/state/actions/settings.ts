import { dbLoadSettings } from "dbRequests/settings";
import { localStorageFns } from "state/hooks/localStorageHooks";
import { useSettings } from "state/definitions/settings";

export function toggleDarkMode() {
  const [value, setValue] = localStorageFns.darkMode.state();
  setValue(!value);
}

export function toggleMiniMap() {
  const [value, setValue] = localStorageFns.showMinimap.state();
  setValue(!value);
}

export async function loadSettings() {
  const res = await dbLoadSettings();
  if (res.status === 200) {
    useSettings.getState().setSettings(res.data);
  }
}
