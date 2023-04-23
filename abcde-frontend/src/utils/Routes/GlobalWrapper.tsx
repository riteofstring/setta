import { useWebsocket } from "hooks/useWebsocket";
import { resetStores, STATE_TYPES } from "models/utils";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function GlobalWrapper({ children }) {
  useWebsocket();
  useResetProjectState();
  return children;
}

function useResetProjectState() {
  const location = useLocation();
  useEffect(() => {
    resetStores(STATE_TYPES.PROJECT_STATE);
  }, [location.pathname]);
}
