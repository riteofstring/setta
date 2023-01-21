import { closeWebSocket, openWebSocket } from "dbRequests/websocket";
import { useAuth } from "models/auth";
import { useEffect } from "react";

export function useOpenWebsocket() {
  const isAuthenticated = useAuth((x) => x.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      openWebSocket();
    } else {
      closeWebSocket();
    }
  }, [isAuthenticated]);
}
