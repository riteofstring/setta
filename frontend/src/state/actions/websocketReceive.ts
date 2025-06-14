import _ from "lodash";
import {
  receiveLLMResponseChunk,
  updateUUIDMappingForLLM,
} from "state/actions/ai";
import { updateWithFileChanges } from "state/actions/fileUpdates";
import {
  updateInteractiveArtifacts,
  updateInteractiveDependencies,
} from "state/actions/interactive";
import {
  addNotificationFromWebsocketMsg,
  addTemporaryNotification,
} from "state/actions/notifications";
import { processRenameRefactorResults } from "state/actions/referenceRenaming";
import { processProjectStateUpdateFromBackend } from "state/actions/sectionInfos";
import { processTypeErrors } from "state/actions/typeCheck";
import {
  addWebsocketConnection,
  clearAllWebsocketConnections,
  setWebsocketConnections,
} from "state/actions/websocketConnectionList";
import { createTemporaryTerminalFromBackend } from "state/hooks/terminals/terminal";
import { C_ADDRESSES } from "utils/c_addresses";
import {
  createWebsocketConnectionInfo,
  RouteEnum,
  WebsocketConnectionTypeEnum,
  WebsocketMsgTypeForFrontendEnum,
} from "utils/generatedTypes";

let wss: WebSocket | null;
let wasOpen = false;

export const openWebSocket = _.debounce(
  (pathname) => {
    if (!wss) {
      wss = new WebSocket(
        `${C_ADDRESSES.WEBSOCKET}${RouteEnum.WEBSOCKET_FRONTEND}`,
      );
      wss.addEventListener("open", () => {
        sendLocation(pathname);
        addTemporaryNotification("Connected to server");
        addWebsocketConnection(
          createWebsocketConnectionInfo({
            id: "main",
            connectionType: WebsocketConnectionTypeEnum.SERVER,
            location: null,
          }),
        );
        wasOpen = true;
      });

      wss.addEventListener("message", (event) => {
        receiveMessage(event.data);
      });

      wss.addEventListener("error", closeWebSocket);

      wss.addEventListener("close", () => {
        wss = null;
        if (wasOpen) {
          addTemporaryNotification("Server connection lost");
          wasOpen = false;
        }
        clearAllWebsocketConnections();
        // Attempt to reconnect
        setTimeout(() => {
          openWebSocket(pathname);
        }, 3000);
      });
    }
  },
  1000,
  { leading: true },
);

function closeWebSocket() {
  if (wss) {
    wss.close();
    wss = null;
  }
}

function wssReady(wss: WebSocket | null): wss is WebSocket {
  return wss !== null && wss.readyState === 1;
}

function receiveMessage(message) {
  const m = JSON.parse(message);
  console.log(m);
  if (m.messageType === WebsocketMsgTypeForFrontendEnum.ALL_CONNECTIONS) {
    setWebsocketConnections(m.content);
  } else if (
    m.messageType === WebsocketMsgTypeForFrontendEnum.LSP_DIAGNOSTICS
  ) {
    processTypeErrors(m.content);
  } else if (m.messageType === WebsocketMsgTypeForFrontendEnum.NOTIFICATION) {
    addNotificationFromWebsocketMsg(m.content);
  } else if (m.messageType === WebsocketMsgTypeForFrontendEnum.ARTIFACT) {
    updateInteractiveArtifacts(m.content);
  } else if (
    m.messageType === WebsocketMsgTypeForFrontendEnum.ALL_DEPENDENCIES
  ) {
    updateInteractiveDependencies(m.content);
  } else if (
    m.messageType ===
    WebsocketMsgTypeForFrontendEnum.SPECIFIC_FILE_WATCHER_UPDATE
  ) {
    updateWithFileChanges(m.content);
  } else if (
    m.messageType === WebsocketMsgTypeForFrontendEnum.TERMINAL_METADATA
  ) {
    // TODO: implement
    // console.log(m.content);
  } else if (
    m.messageType === WebsocketMsgTypeForFrontendEnum.LLM_STREAMING_RESPONSE
  ) {
    receiveLLMResponseChunk(m.content);
  } else if (
    m.messageType === WebsocketMsgTypeForFrontendEnum.UUID_MAPPING_FOR_LLM
  ) {
    updateUUIDMappingForLLM(m.content);
  } else if (
    m.messageType ===
    WebsocketMsgTypeForFrontendEnum.RETURN_RENAME_REFACTOR_RESULTS
  ) {
    processRenameRefactorResults(m.content);
  } else if (
    m.messageType ===
    WebsocketMsgTypeForFrontendEnum.UPDATE_FRONTEND_PROJECT_STATE
  ) {
    processProjectStateUpdateFromBackend(m.content);
  } else if (
    m.messageType === WebsocketMsgTypeForFrontendEnum.NEW_TERMINAL_CREATED
  ) {
    createTemporaryTerminalFromBackend(m.content);
  } else {
    throw Error("invalid websocket message type");
  }
}

export function sendLocation(pathname) {
  if (wssReady(wss)) {
    wss.send(JSON.stringify({ location: pathname }));
  }
}

export async function sendMessage({ content, id, messageType }) {
  if (wssReady(wss)) {
    wss.send(
      JSON.stringify({
        id,
        content,
        toWebsocketId: "main",
        messageType,
      }),
    );
  }
}
