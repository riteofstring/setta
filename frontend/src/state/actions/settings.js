import { dbLoadSettings } from "requests/settings";
import { useSettings } from "state/definitions";

export async function loadSettings() {
  const res = await dbLoadSettings();
  if (res.status === 200) {
    useSettings.setState(res.data);
  }
}

export function toggleSetting(settingName) {
  useSettings.setState((state) => ({ [settingName]: !state[settingName] }));
}
