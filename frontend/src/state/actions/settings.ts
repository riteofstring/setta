import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  loadSettings,
  type SettingsstateFrontendSettingsState as SettingsState,
} from "openapi/http";
import { useEffect, useState } from "react";
import { useSettings } from "state/definitions";
const SETTINGS_RETRY_DELAY_MS = 500;
type LoadSettingsOptions = {
  enabled?: boolean;
};
type LoadSettingsRouteResponse = ResponseDataAndStatus<SettingsState>;
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
    async function loadSettingsOnce() {
      const res = (await callOpenAPI(
        loadSettings(),
      )) as LoadSettingsRouteResponse;
      if (!isMounted) {
        return;
      }
      if (!res200(res)) {
        retryTimeout = window.setTimeout(() => {
          retryTimeout = undefined;
          void loadSettingsOnce();
        }, SETTINGS_RETRY_DELAY_MS);
        return;
      }
      useSettings.setState(res.data);
      setSettingsLoaded(true);
    }
    void loadSettingsOnce();
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
