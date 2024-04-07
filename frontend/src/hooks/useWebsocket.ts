import { openWebSocket, sendLocation, sendMessage } from "dbRequests/websocket";
import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useWebsocketRooms } from "models/websocket";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
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

function useWebsocketRoom(messageType) {
  const [id, setId] = useState(null);
  const received = useWebsocketRooms((x) => x[id] ?? "");
  const send = useCallback(
    (message) => {
      if (id) {
        sendMessage({ message, id, messageType });
      }
    },
    [id],
  );

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

  const _send = useCallback(
    _.debounce((value) => {
      const projectConfigId = useProjectConfig.getState().id;
      send({ projectConfigId, sectionId, paramInfoId: null, value });
    }, 100),
    [send],
  );

  return [searchResults, _send];
}
