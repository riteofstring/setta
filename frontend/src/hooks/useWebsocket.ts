import { createNewId } from "z_utils/utils";
import { openWebSocket, sendLocation, sendMessage } from "dbRequests/websocket";
import { useWebsocketRooms } from "models/websocket";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export function useOpenCloseWebsocket() {
  const location = useLocation();

  useEffect(() => {
    openWebSocket(location.pathname);
  }, []);

  useEffect(() => {
    sendLocation(location.pathname);
  }, [location.pathname]);
}

export function useWebsocketRoom(messageType) {
  const [id, setId] = useState(null);
  const received = useWebsocketRooms((x) => x[id] ?? "");
  function send(message) {
    if (id) {
      sendMessage({ message, id, messageType });
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

  return [received, send];
}

export function useCodeCompletionWebsocketRoom() {
  const [message, send] = useWebsocketRoom("codeCompletionRequest");
  let searchResults = [];
  if (message) {
    searchResults = message.map((x) => ({ id: x, name: x }));
  }
  return [searchResults, send];
}
