import { useWebsocket } from "hooks/useWebsocket";

export function GlobalWrapper({ children }) {
  useWebsocket();
  return children;
}
