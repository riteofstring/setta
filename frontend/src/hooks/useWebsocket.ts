import { openWebSocket, sendLocation, sendMessage } from "dbRequests/websocket";
import { useCodeInfo } from "models/info/codeInfo";
import { useWebsocketRooms } from "models/websocket";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getSectionInfo } from "thunks/sections/getters";
import { createNewId } from "z_utils/utils";

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

export function useCodeCompletionWebsocketRoom(sectionId) {
  const [message, send] = useWebsocketRoom("codeCompletionRequest");
  const searchResults = message ? message.map((x) => ({ id: x, name: x })) : [];

  function _send(value) {
    let _value = value;
    const { chainedFrom } = getSectionInfo(sectionId);
    if (chainedFrom) {
      const { selectedItem } = getSectionInfo(chainedFrom);
      if (selectedItem) {
        const { name } = useCodeInfo.getState().x[selectedItem];
        _value = `${name}().${_value}`;
      }
    }
    send(_value);
  }

  return [searchResults, _send];
}
