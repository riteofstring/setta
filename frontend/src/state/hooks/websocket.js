import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { openWebSocket, sendLocation } from "requests/websocket";

export function useOpenCloseWebsocket() {
  const location = useLocation();

  useEffect(() => {
    openWebSocket(location.pathname);
  }, []);

  useEffect(() => {
    sendLocation(location.pathname);
  }, [location.pathname]);
}
