import { useEffect, useState } from "react";
import { useSettings } from "state/stores/uiPreferenceStores";
import { res200 } from "utils/endpointUtils";
import { route_load_settings } from "utils/generatedEndpoints";
import { SettingsState } from "utils/generatedTypes";

const SETTINGS_RETRY_DELAY_MS = 500;

type LoadSettingsOptions = {
  enabled?: boolean;
};

export function useLoadSettings(options: LoadSettingsOptions = {}) {
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled) {
      setSettingsLoaded(false);
      return;
    }

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

    void loadSettings();

    return () => {
      isMounted = false;
      if (retryTimeout !== undefined) {
        window.clearTimeout(retryTimeout);
      }
    };
  }, [enabled]);

  return settingsLoaded;
}

export function updateSettings(newSettings: SettingsState) {
  useSettings.setState(newSettings);
}
