import { openWebSocket, sendLocation, sendMessage } from "dbRequests/websocket";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useProjectConfig } from "models/info/projectConfig";
import { useWebsocketRooms } from "models/websocket";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getProjectDataToGenerateCode } from "thunks/generateCode";
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
  const send = useCallback(
    (message) => {
      if (id) {
        sendMessage({ message, id, messageType });
      }
    },
    [id]
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
      let _value = value;
      const { chainedFrom } = getSectionInfo(sectionId);
      if (chainedFrom) {
        const { selectedItem } = getSectionInfo(chainedFrom);
        if (selectedItem) {
          const { name } = useCodeInfo.getState().x[selectedItem];
          _value = `${name}().${_value}`;
        }
      }
      send({ projectConfigId, sectionId, paramInfoId: null, value: _value });
    }, 100),
    [send]
  );

  return [searchResults, _send];
}

export function textFieldInitializeCode(sectionId, paramInfoId) {
  const id = createNewId();
  const project = getProjectDataToGenerateCode();
  sendMessage({
    id,
    messageType: "textFieldInitializeCode",
    message: { project, sectionId, paramInfoId },
  });
}

export function useTextFieldCompletionWebsocketRoom(sectionId, paramInfoId) {
  const [message, send] = useWebsocketRoom("textFieldCompletion");
  const searchResults = message || [];

  const _send = useCallback(
    _.debounce((value) => {
      const projectConfigId = useProjectConfig.getState().id;
      send({ projectConfigId, sectionId, paramInfoId, value });
    }, 100),
    [send]
  );

  return [searchResults, _send];
}
