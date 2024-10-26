import { Navigate } from "react-router-dom";
import { useSettings } from "state/definitions";
import {
  useDefaultConfigName,
  useResetProjectState,
} from "state/hooks/project";
import { useLoadSettings } from "state/hooks/settings";
import { useOpenCloseWebsocket } from "state/hooks/websocket";
import { HOME_ROUTER_PATH } from "utils/constants";

export function GlobalWrapper({ children }) {
  useOpenCloseWebsocket();
  useResetProjectState();
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
