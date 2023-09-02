import { createNewId } from "abcde-utils/src/utils";
import {
  closeWebSocket,
  openWebSocket,
  sendLocation,
  sendMessage,
} from "dbRequests/websocket";
import { useUser } from "models/user";
import { useWebsocketRooms } from "models/websocket";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export function useOpenCloseWebsocket() {
  const isAuthenticated = useUser((x) => x.isAuthenticated);
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      openWebSocket(location.pathname);
    } else {
      closeWebSocket();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    sendLocation(location.pathname);
  }, [location.pathname]);
}

export function useWebsocketRoom() {
  const [id, setId] = useState(null);
  const message = useWebsocketRooms((x) => x[id] ?? "");
  function send(x) {
    if (id) {
      sendMessage(x, id);
    }
  }

  useEffect(() => {
    const _id = createNewId();
    useWebsocketRooms.getState().createRoom(_id);
    setId(_id);

    // cleanup
    return () => {
      useWebsocketRooms.getState().deleteRoom(_id);
    };
  }, []);

  return [message, send];
}

export function useSearchWebsocketRoom() {
  const [message, send] = useWebsocketRoom();
  if (message) {
    const searchResults = message.map((x) => ({ id: x, name: x }));
    return [searchResults, send];
  }
  return [[], send];
}
