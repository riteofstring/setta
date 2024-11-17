import { dbLoadSettings } from "requests/settings";
import { useSettings } from "state/definitions";

export async function loadSettings() {
  const res = await dbLoadSettings();
  if (res.status === 200) {
    useSettings.setState(res.data);
  }
}
