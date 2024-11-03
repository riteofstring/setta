import { useFloatingBoxNextToMouseCursor } from "components/Utils/FloatingBox";
import { useEffect } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useSettings } from "state/definitions";
import { useDefaultConfigName } from "state/hooks/project";
import { useLoadSettings } from "state/hooks/settings";
import { useOpenCloseWebsocket } from "state/hooks/websocket";
import { HOME_ROUTER_PATH, SETTINGS_ROUTER_PATH } from "utils/constants";

export function GlobalWrapper({ children }) {
  useOpenCloseWebsocket();
  useSetHTMLTitle();
  useFloatingBoxNextToMouseCursor();
  const settingsLoaded = useLoadSettings();
  return settingsLoaded && children;
}

export function IndexRouteComponent() {
  const showDefaultConfigOnLoad = useSettings((x) => x.showDefaultConfigOnLoad);
  const defaultConfigName = useDefaultConfigName();
  if (!defaultConfigName) {
    return null;
  }

  return !showDefaultConfigOnLoad ? (
    <Navigate to={HOME_ROUTER_PATH} replace />
  ) : (
    <Navigate to={defaultConfigName} replace />
  );
}

function useSetHTMLTitle() {
  const { pathname } = useLocation();
  const { projectConfigName } = useParams();
  useEffect(() => {
    if (pathname === HOME_ROUTER_PATH) {
      document.title = "Home";
    } else if (pathname === SETTINGS_ROUTER_PATH) {
      document.title = "Settings";
    } else if (projectConfigName) {
      document.title = projectConfigName;
    } else {
      document.title = "setta.dev";
    }
  }, [pathname, projectConfigName]);
}
