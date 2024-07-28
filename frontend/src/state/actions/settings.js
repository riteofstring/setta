import { dbLoadSettings } from "requests/settings";
import { useSettings } from "state/definitions";

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
