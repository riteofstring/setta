import { useSettings } from "state/definitions";
import { useResetProjectState } from "state/hooks/project";
import { useLoadSettings } from "state/hooks/settings";
import { useOpenCloseWebsocket } from "state/hooks/websocket";

export function GlobalWrapper({ children }) {
  useOpenCloseWebsocket();
  useResetProjectState();
  useLoadSettings();
  const settingsLoaded = useSettings((x) => x.settingsLoaded);
  return settingsLoaded && children;
}
