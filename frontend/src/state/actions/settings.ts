import { useEffect, useState } from "react";
import { useSettings } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_load_settings } from "utils/generatedEndpoints";
import { SettingsState } from "utils/generatedTypes";

export function useLoadSettings() {
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  async function fn() {
    const res = await route_load_settings();
    if (res200(res)) {
      useSettings.setState(res.data);
    }
    setSettingsLoaded(true);
  }

  useEffect(() => {
    fn();
  }, []);

  return settingsLoaded;
}

export function updateSettings(newSettings: SettingsState) {
  useSettings.setState(newSettings);
}
