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
  WebsocketMsgAllConnectionsSchema,
  WebsocketMsgAllDependenciesSchema,
  WebsocketMsgArtifactSchema,
  WebsocketMsgLLMStreamingResponseSchema,
  WebsocketMsgLSPDiagnosticsSchema,
  WebsocketMsgNewTerminalCreatedSchema,
  WebsocketMsgNotificationSchema,
  WebsocketMsgRenameRefactorResultsSchema,
  WebsocketMsgSpecificFileWatcherUpdateSchema,
  WebsocketMsgTerminalMetadataSchema,
  WebsocketMsgUpdateFrontendProjectStateSchema,
  WebsocketMsgUUIDMappingSchema,
} from "utils/generatedTypes";
import { z } from "zod/v4";
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

export const WebsocketMsgUnionSchema = z.discriminatedUnion("messageType", [
  WebsocketMsgAllConnectionsSchema,
  WebsocketMsgAllDependenciesSchema,
  WebsocketMsgArtifactSchema,
  WebsocketMsgLLMStreamingResponseSchema,
  WebsocketMsgLSPDiagnosticsSchema,
  WebsocketMsgNewTerminalCreatedSchema,
  WebsocketMsgNotificationSchema,
  WebsocketMsgRenameRefactorResultsSchema,
  WebsocketMsgSpecificFileWatcherUpdateSchema,
  WebsocketMsgTerminalMetadataSchema,
  WebsocketMsgUUIDMappingSchema,
  WebsocketMsgUpdateFrontendProjectStateSchema,
]);

export type WebsocketMsgUnion = z.infer<typeof WebsocketMsgUnionSchema>;

function receiveMessage(message: string) {
  const m: WebsocketMsgUnion = WebsocketMsgUnionSchema.parse(
    JSON.parse(message),
  );
  console.log(m);
  switch (m.messageType) {
    case "ALL_CONNECTIONS":
      return setWebsocketConnections(m.content);
    case "ALL_DEPENDENCIES":
      return updateInteractiveDependencies(m.content);
    case "ARTIFACT":
      return updateInteractiveArtifacts(m.content);
    case "LLM_STREAMING_RESPONSE":
      return receiveLLMResponseChunk(m.content);
    case "LSP_DIAGNOSTICS":
      return processTypeErrors(m.content);
    case "NEW_TERMINAL_CREATED":
      return createTemporaryTerminalFromBackend(m.content);
    case "NOTIFICATION":
      return addNotificationFromWebsocketMsg(m.content);
    case "RETURN_RENAME_REFACTOR_RESULTS":
      return processRenameRefactorResults(m.content);
    case "SPECIFIC_FILE_WATCHER_UPDATE":
      return updateWithFileChanges(m.content);
    case "TERMINAL_METADATA":
      // TODO
      return null;
    case "UUID_MAPPING_FOR_LLM":
      return updateUUIDMappingForLLM(m.content);
    case "UPDATE_FRONTEND_PROJECT_STATE":
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
