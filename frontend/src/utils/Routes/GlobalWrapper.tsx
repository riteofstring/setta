import { useOpenCloseWebsocket } from "state/hooks/useWebsocket";
import { useSettings } from "state/definitions/settings";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { resetProjectStores } from "state/actions/reset";
import { loadSettings } from "state/actions/settings";
import {
  SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
  SAME_PROJECT_NEW_PROJECT_NAME,
  SWITCHING_CONFIG,
} from "./pageLoadTypes";

export function GlobalWrapper({ children }) {
  useOpenCloseWebsocket();
  useResetProjectState();
  const settingsLoaded = useSettings((x) => x.settingsLoaded);

  useEffect(() => {
    loadSettings();
  }, []);

  return settingsLoaded && children;
}

function useResetProjectState() {
  const { pathname, state } = useLocation();
  useEffect(() => {
    if (
      [
        SAME_PROJECT_NEW_PROJECT_NAME,
        SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
        SWITCHING_CONFIG,
      ].includes(state?.pageLoadType)
    ) {
      return;
    }
    resetProjectStores();
  }, [pathname]);
}
