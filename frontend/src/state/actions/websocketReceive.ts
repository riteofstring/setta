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
import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
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
import { updateArtifacts } from "./artifacts";
import { handleRenameRefactorBroadcast } from "./renameRefactors";
import {
  getCurrProjectConfigId,
  processProjectStateUpdateFromBackend,
  updateAllProjectMetadata,
} from "./sectionInfos";
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
        const projectConfigId = getCurrProjectConfigId();
        if (projectConfigId !== NULL_PROJECT_CONFIG_ID) {
          const res = await route_get_latest_project_state({
            projectConfigId: getCurrProjectConfigId(),
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
    case WebsocketMsgTypeForFrontendEnum.LLMStreamingResponse:
      return receiveLLMResponseChunk(m.content);
    case WebsocketMsgTypeForFrontendEnum.LSPDiagnostics:
      return processTypeErrors(m.content);
    case WebsocketMsgTypeForFrontendEnum.Notification:
      return addNotificationFromWebsocketMsg(m.content);
    case WebsocketMsgTypeForFrontendEnum.ReturnRenameRefactorResults:
      return handleRenameRefactorBroadcast(m.content);
    case WebsocketMsgTypeForFrontendEnum.TerminalMetadata:
      // TODO
      return null;
    case WebsocketMsgTypeForFrontendEnum.UUIDMappingForLLM:
      return updateUUIDMappingForLLM(m.content);
    case WebsocketMsgTypeForFrontendEnum.UpdateFrontendProjectState:
      return processProjectStateUpdateFromBackend(m.content);
    case WebsocketMsgTypeForFrontendEnum.UpdateSettings:
      return updateSettings(m.content);
    case WebsocketMsgTypeForFrontendEnum.AllProjectMetadata:
      return updateAllProjectMetadata(m.content);
    case WebsocketMsgTypeForFrontendEnum.UpdateArtifacts:
      return updateArtifacts(m.content);
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
