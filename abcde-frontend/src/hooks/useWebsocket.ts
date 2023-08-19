import {
  closeWebSocket,
  openWebSocket,
  sendCurrPage,
} from "dbRequests/websocket";
import { useAuth } from "models/auth";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useWebsocket() {
  const isAuthenticated = useAuth((x) => x.isAuthenticated);
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      openWebSocket(location.pathname);
    } else {
      closeWebSocket();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    sendCurrPage(location.pathname);
  }, [location.pathname]);
}
