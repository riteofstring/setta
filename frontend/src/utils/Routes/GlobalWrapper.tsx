import { useOpenCloseWebsocket } from "hooks/useWebsocket";
import { useSettings } from "models/settings";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { resetProjectStores } from "thunks/reset";
import { loadSettings } from "thunks/user/settings";
import {
  SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
  SAME_PROJECT_NEW_PROJECT_NAME,
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
      ].includes(state?.pageLoadType)
    ) {
      return;
    }
    resetProjectStores();
  }, [pathname]);
}
