import { useEffect, useState } from "react";
import { useSettings } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_load_settings } from "utils/generatedEndpoints";
import { SettingsState } from "utils/generatedTypes";

const SETTINGS_RETRY_DELAY_MS = 500;

export function useLoadSettings(runtimeConfigReady: boolean) {
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let retryTimeout: number | undefined;

    async function loadSettings() {
      const res = await route_load_settings();

      if (!isMounted) {
        return;
      }

      if (!res200(res)) {
        retryTimeout = window.setTimeout(() => {
          retryTimeout = undefined;
          void loadSettings();
        }, SETTINGS_RETRY_DELAY_MS);
        return;
      }

      useSettings.setState(res.data);
      setSettingsLoaded(true);
    }

    if (runtimeConfigReady) {
      void loadSettings();
    }

    return () => {
      isMounted = false;
      if (retryTimeout !== undefined) {
        window.clearTimeout(retryTimeout);
      }
    };
  }, [runtimeConfigReady]);

  return settingsLoaded;
}

export function updateSettings(newSettings: SettingsState) {
  useSettings.setState(newSettings);
}
