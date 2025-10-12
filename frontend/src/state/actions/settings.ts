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
      console.log("[useLoadSettings] loaded settings", {
        gridPattern: res.data.gui?.gridPattern,
      });
      useSettings.setState(res.data);
    } else {
      console.log("[useLoadSettings] failed to load settings", res);
    }
    setSettingsLoaded(true);
  }

  useEffect(() => {
    fn();
  }, []);

  return settingsLoaded;
}

export function updateSettings(newSettings: SettingsState) {
  console.log("[updateSettings] applying new settings", {
    gridPattern: newSettings.gui?.gridPattern,
  });
  useSettings.setState(newSettings);
}
