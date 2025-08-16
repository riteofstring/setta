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
import { NULL_PROJECT_CONFIG_ID, useProjectState } from "state/definitions";
import { C_ADDRESSES } from "utils/c_addresses";
import { res200 } from "utils/endpointUtils";
import { route_get_latest_project_state } from "utils/generatedEndpoints";
import {
  createWebsocketConnectionInfo,
  createWebsocketMsgCurrentAddressUpdate,
  FrontendWebsocketMsgUnion,
  RouteEnum,
  WebsocketConnectionTypeEnum,
  WebsocketMsg,
  WebsocketMsgTypeForFrontendEnum,
} from "utils/generatedTypes";
import { receiveLLMResponseChunk, updateUUIDMappingForLLM } from "./ai";
import {
  updateInteractiveArtifacts,
  updateInteractiveDependencies,
} from "./interactive";
import { processRenameRefactorResults } from "./referenceRenaming";
import { processProjectStateUpdateFromBackend } from "./sectionInfos";
import { updateSettings } from "./settings";

let wss: WebSocket | null;
let wasOpen = false;

export const openWebSocket = _.debounce(
  (pathname) => {
    if (!wss) {
      wss = new WebSocket(
        `${C_ADDRESSES.WEBSOCKET}${RouteEnum.WEBSOCKET_FRONTEND}`,
      );
      wss.addEventListener("open", async () => {
        sendCurrentAddress(pathname);
        addTemporaryNotification("Connected to server");
        addWebsocketConnection(
          createWebsocketConnectionInfo({
            id: "main",
            connectionType: WebsocketConnectionTypeEnum.SERVER,
            currentAddress: pathname,
          }),
        );
        wasOpen = true;
        const projectConfigId = useProjectState.getState().projectConfig.id;
        if (projectConfigId !== NULL_PROJECT_CONFIG_ID) {
          const res = await route_get_latest_project_state({
            projectConfigId: useProjectState.getState().projectConfig.id,
          });
          if (res200(res)) {
            processProjectStateUpdateFromBackend(res.data);
          }
        }
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
  const m: FrontendWebsocketMsgUnion = JSON.parse(message);
  console.log(m);
  switch (m.messageType) {
    case WebsocketMsgTypeForFrontendEnum.AllConnections:
      return setWebsocketConnections(m.content);
    case WebsocketMsgTypeForFrontendEnum.AllDependencies:
      return updateInteractiveDependencies(m.content);
    case WebsocketMsgTypeForFrontendEnum.Artifact:
      return updateInteractiveArtifacts(m.content);
    case WebsocketMsgTypeForFrontendEnum.LLMStreamingResponse:
      return receiveLLMResponseChunk(m.content);
    case WebsocketMsgTypeForFrontendEnum.LSPDiagnostics:
      return processTypeErrors(m.content);
    case WebsocketMsgTypeForFrontendEnum.Notification:
      return addNotificationFromWebsocketMsg(m.content);
    case WebsocketMsgTypeForFrontendEnum.ReturnRenameRefactorResults:
      return processRenameRefactorResults(m.content);
    case WebsocketMsgTypeForFrontendEnum.TerminalMetadata:
      // TODO
      return null;
    case WebsocketMsgTypeForFrontendEnum.UUIDMappingForLLM:
      return updateUUIDMappingForLLM(m.content);
    case WebsocketMsgTypeForFrontendEnum.UpdateFrontendProjectState:
      return processProjectStateUpdateFromBackend(m.content);
    case WebsocketMsgTypeForFrontendEnum.UpdateSettings:
      return updateSettings(m.content);
    default:
      return m satisfies never;
  }
}

export function sendCurrentAddress(currentAddress: string) {
  sendMessage(
    createWebsocketMsgCurrentAddressUpdate({ content: currentAddress }),
  );
}

export function sendMessage(message: WebsocketMsg) {
  if (wssReady(wss)) {
    wss.send(JSON.stringify(message));
  }
}
