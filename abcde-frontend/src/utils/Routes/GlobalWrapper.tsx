import { useWebsocket } from "hooks/useWebsocket";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { resetProjectStores } from "thunks/reset";

export function GlobalWrapper({ children }) {
  useWebsocket();
  useResetProjectState();
  return children;
}

function useResetProjectState() {
  const location = useLocation();
  useEffect(() => {
    resetProjectStores();
  }, [location.pathname]);
}
