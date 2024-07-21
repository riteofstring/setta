import { dbLoadSettings } from "requests/settings";
import { useSettings } from "state/definitions/settings";
import { localStorageFns } from "state/hooks/localStorage";

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
    setSettings(res.data);
  }
}

function setSettings(payload) {
  useSettings.setState({ ...payload, settingsLoaded: true });
}
export function toggleSetting(settingName) {
  useSettings.setState((state) => ({ [settingName]: !state[settingName] }));
}
