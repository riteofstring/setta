import _ from "lodash";
import {
  addNotificationFromWebsocketMsg,
  addTemporaryNotification,
} from "state/actions/notifications";
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
  WebsocketMsgUnion,
  WebsocketMsgUnionSchema,
} from "utils/generatedTypes";
import { receiveLLMResponseChunk, updateUUIDMappingForLLM } from "./ai";
import { updateWithFileChanges } from "./fileUpdates";
import {
  updateInteractiveArtifacts,
  updateInteractiveDependencies,
} from "./interactive";
import { processRenameRefactorResults } from "./referenceRenaming";
import { processProjectStateUpdateFromBackend } from "./sectionInfos";

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

function receiveMessage(message: string) {
  const m: WebsocketMsgUnion = WebsocketMsgUnionSchema.parse(
    JSON.parse(message),
  );
  console.log(m);
  switch (m.messageType) {
    case "AllConnections":
      return setWebsocketConnections(m.content);
    case "AllDependencies":
      return updateInteractiveDependencies(m.content);
    case "Artifact":
      return updateInteractiveArtifacts(m.content);
    case "LLMStreamingResponse":
      return receiveLLMResponseChunk(m.content);
    case "LSPDiagnostics":
      return processTypeErrors(m.content);
    case "NewTerminalCreated":
      return createTemporaryTerminalFromBackend(m.content);
    case "Notification":
      return addNotificationFromWebsocketMsg(m.content);
    case "ReturnRenameRefactorResults":
      return processRenameRefactorResults(m.content);
    case "SpecificFileWatcherUpdate":
      return updateWithFileChanges(m.content);
    case "TerminalMetadata":
      // TODO
      return null;
    case "UUIDMappingForLLM":
      return updateUUIDMappingForLLM(m.content);
    case "UpdateFrontendProjectState":
      return processProjectStateUpdateFromBackend(m.content);
    default:
      return m satisfies never;
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
