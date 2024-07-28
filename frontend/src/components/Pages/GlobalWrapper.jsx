import { useSettings } from "state/definitions";
import { useResetProjectState } from "state/hooks/project";
import { useLoadSettings } from "state/hooks/settings";
import { useOpenCloseWebsocket } from "state/hooks/websocket";

export function GlobalWrapper({ children }) {
  useOpenCloseWebsocket();
  useResetProjectState();
  const settingsLoaded = useLoadSettings();
  console.log("settingsLoaded", settingsLoaded);
  return settingsLoaded && children;
}
