import _ from "lodash";
import { addBackendLogEvent } from "state/actions/backendLogEvents";
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
import {
  route_get_backend_init_status,
  route_get_latest_project_state,
} from "utils/generatedEndpoints";
import {
  Base64DependencyValue,
  BaseDependencyKeyUnion,
  BaseDependencyValueUnion,
  CodeObjType,
  ControlActionEvent,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  FrontendWebsocketMsgUnion,
  LiteralDependencyValue,
  RouteEnum,
  SectionDependencyKey,
  SectionParamDependencyKey,
  WebsocketConnectionTypeEnum,
  WebsocketMsg,
  WebsocketMsgRealtimeActionEvent,
  WebsocketMsgRealtimeUIChange,
  WebsocketMsgTypeForBackendEnum,
  WebsocketMsgTypeForFrontendEnum,
  createWebsocketConnectionInfo,
  createWebsocketMsgCurrentAddressUpdate,
} from "utils/generatedTypes";
import {
  receiveLLMApiKeysUpdate,
  receiveLLMConfigUpdate,
  receiveLLMResponseChunk,
} from "./ai";
import {
  receiveAIFollowToolArgumentsUpdate,
  receiveAIFollowToolResultUpdate,
  requestAIFollowSnapshot,
} from "./aiFollow";
import { updateArtifacts } from "./artifacts";
import {
  applyListenerCoverageSnapshot,
  dependencyKeyCovered,
  fetchListenerCoverageSnapshot,
  getListenerCoverageRecord,
} from "./listenerCoverage";
import { handleRenameRefactorBroadcast } from "./renameRefactors";
import {
  getCurrProjectConfigId,
  processProjectStateUpdateFromBackend,
  updateAllProjectMetadata,
} from "./sectionInfos";
import { updateSettings } from "./settings";
import {
  initializeShareSessionFromCurrentDeployment,
  resetShareSessionState,
} from "./share";

let wss: WebSocket | null;
let wasOpen = false;
let authLost = false;
const AUTH_CLOSE_CODE = 4401;
const SHARE_SESSION_MISSING_CODE = 4400;
const SHARE_SESSION_UNKNOWN_CODE = 4404;
const BOOTSTRAP_URL = `${C_ADDRESSES.BACKEND_ORIGIN}${RouteEnum.BOOTSTRAP_PAGE}`;
const AUTH_RECOVERY_INTERVAL_MS = 2000;
const SHARE_HEARTBEAT_INTERVAL_MS = 30000;
const SHARE_SESSION_RECOVERY_MAX_ATTEMPTS = 1;
let authRecoveryTimer: number | null = null;
let authRecoveryInFlight = false;
let lastPathname: string | null = null;
let lastShareSessionId: string | null = null;
let currentShareSessionId: string | null = null;
let currentRoute: string | null = null;
let shareHeartbeatTimer: number | null = null;
let shareSessionRecoveryAttempts = 0;
let shareSessionRecoveryInFlight = false;

export const openWebSocket = _.debounce(
  (pathname: string, shareSessionId: string | null = null) => {
    if (authLost) {
      return;
    }
    lastPathname = pathname;
    lastShareSessionId = shareSessionId;
    const isShareMode = Boolean(shareSessionId);
    if (!isShareMode) {
      stopShareHeartbeat();
    }
    const route = isShareMode
      ? RouteEnum.WEBSOCKET_SHARE_FRONTEND
      : RouteEnum.WEBSOCKET_FRONTEND;
    const targetUrl = isShareMode
      ? `${C_ADDRESSES.WEBSOCKET}${route}?shareSessionId=${encodeURIComponent(
          shareSessionId ?? "",
        )}`
      : `${C_ADDRESSES.WEBSOCKET}${route}`;
    if (
      wss &&
      (currentRoute !== route || currentShareSessionId !== shareSessionId)
    ) {
      closeWebSocket();
    }
    if (!wss) {
      const socket = new WebSocket(targetUrl);
      wss = socket;
      const shareSessionIdForSocket = shareSessionId;
      currentShareSessionId = shareSessionId;
      currentRoute = route;
      wss.addEventListener("open", async () => {
        sendCurrentAddress(pathname);
        addTemporaryNotification("Connected to server");
        addWebsocketConnection(
          createWebsocketConnectionInfo({
            id: "main",
            connectionType: WebsocketConnectionTypeEnum.SERVER,
            currentAddress: pathname,
            shareSessionId,
          }),
        );
        wasOpen = true;
        if (isShareMode) {
          startShareHeartbeat();
          const projectConfigId = getCurrProjectConfigId();
          if (projectConfigId !== NULL_PROJECT_CONFIG_ID) {
            await fetchListenerCoverageSnapshot(projectConfigId);
          }
        }
        if (!isShareMode) {
          const projectConfigId = getCurrProjectConfigId();
          if (projectConfigId !== NULL_PROJECT_CONFIG_ID) {
            const res = await route_get_latest_project_state({
              projectConfigId: getCurrProjectConfigId(),
            });
            if (res200(res)) {
              processProjectStateUpdateFromBackend(res.data);
              await requestAIFollowSnapshot(projectConfigId);
            }
          }
        }
      });

      wss.addEventListener("message", (event) => {
        receiveMessage(event.data);
      });

      wss.addEventListener("error", closeWebSocket);

      socket.addEventListener("close", (event: CloseEvent) => {
        if (wss && wss !== socket) {
          return;
        }
        stopShareHeartbeat();
        wss = null;
        currentShareSessionId = null;
        currentRoute = null;
        if (
          event.code === SHARE_SESSION_MISSING_CODE ||
          event.code === SHARE_SESSION_UNKNOWN_CODE
        ) {
          wasOpen = false;
          clearAllWebsocketConnections();
          if (!shareSessionIdForSocket) {
            return;
          }
          void handleShareSessionRecovery();
          return;
        }
        if (event.code === AUTH_CLOSE_CODE) {
          authLost = true;
          wasOpen = false;
          clearAllWebsocketConnections();
          addTemporaryNotification(
            `Authentication required. Open ${BOOTSTRAP_URL} to continue.`,
          );
          scheduleAuthRecovery(pathname);
          return;
        }
        if (wasOpen) {
          addTemporaryNotification("Server connection lost");
          wasOpen = false;
        }
        clearAllWebsocketConnections();
        // Attempt to reconnect
        setTimeout(() => {
          openWebSocket(lastPathname ?? pathname, lastShareSessionId);
        }, 3000);
      });
    }
  },
  1000,
  { leading: true },
);

function clearAuthRecoveryTimer() {
  if (authRecoveryTimer === null) {
    return;
  }
  window.clearTimeout(authRecoveryTimer);
  authRecoveryTimer = null;
}

function scheduleAuthRecovery(pathname: string) {
  if (!authLost) {
    return;
  }
  if (authRecoveryTimer !== null) {
    return;
  }
  authRecoveryTimer = window.setTimeout(() => {
    authRecoveryTimer = null;
    void attemptAuthRecovery(pathname);
  }, AUTH_RECOVERY_INTERVAL_MS);
}

async function attemptAuthRecovery(pathname: string) {
  if (!authLost || authRecoveryInFlight) {
    return;
  }
  authRecoveryInFlight = true;
  const res = await route_get_backend_init_status();
  authRecoveryInFlight = false;
  if (res200(res)) {
    authLost = false;
    clearAuthRecoveryTimer();
    openWebSocket(lastPathname ?? pathname, lastShareSessionId);
    return;
  }
  scheduleAuthRecovery(pathname);
}

function closeWebSocket() {
  if (wss) {
    wss.close();
    wss = null;
  }
  stopShareHeartbeat();
}

function wssReady(wss: WebSocket | null): wss is WebSocket {
  return wss !== null && wss.readyState === 1;
}

function startShareHeartbeat() {
  stopShareHeartbeat();
  shareHeartbeatTimer = window.setInterval(() => {
    if (currentShareSessionId === null || !wssReady(wss)) {
      return;
    }
    const currentAddress = lastPathname;
    if (!currentAddress) {
      return;
    }
    sendCurrentAddress(currentAddress);
  }, SHARE_HEARTBEAT_INTERVAL_MS);
}

function stopShareHeartbeat() {
  if (shareHeartbeatTimer === null) {
    return;
  }
  window.clearInterval(shareHeartbeatTimer);
  shareHeartbeatTimer = null;
}

async function handleShareSessionRecovery() {
  if (shareSessionRecoveryInFlight) {
    return;
  }
  if (shareSessionRecoveryAttempts >= SHARE_SESSION_RECOVERY_MAX_ATTEMPTS) {
    resetShareSessionState();
    addTemporaryNotification("Share session expired. Refresh to continue.");
    return;
  }
  shareSessionRecoveryInFlight = true;
  shareSessionRecoveryAttempts += 1;
  const recovered = await initializeShareSessionFromCurrentDeployment({
    forceNewSession: true,
  });
  shareSessionRecoveryInFlight = false;
  if (!recovered) {
    resetShareSessionState();
    addTemporaryNotification("Share session expired. Refresh to continue.");
    return;
  }
  shareSessionRecoveryAttempts = 0;
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
    case WebsocketMsgTypeForFrontendEnum.UpdateFrontendProjectState:
      return processProjectStateUpdateFromBackend(m.content);
    case WebsocketMsgTypeForFrontendEnum.UpdateSettings:
      return updateSettings(m.content);
    case WebsocketMsgTypeForFrontendEnum.AllProjectMetadata:
      return updateAllProjectMetadata(m.content);
    case WebsocketMsgTypeForFrontendEnum.UpdateArtifacts:
      return updateArtifacts(m.content);
    case WebsocketMsgTypeForFrontendEnum.ListenerCoverageSnapshot:
      return applyListenerCoverageSnapshot(m.content);
    case WebsocketMsgTypeForFrontendEnum.LLMConfigUpdated:
      return receiveLLMConfigUpdate(m.content);
    case WebsocketMsgTypeForFrontendEnum.LLMApiKeysUpdated:
      return receiveLLMApiKeysUpdate(m.content);
    case WebsocketMsgTypeForFrontendEnum.BackendLogEvent:
      return addBackendLogEvent(m.content);
    case WebsocketMsgTypeForFrontendEnum.AIFollowToolArgumentsUpdate:
      return receiveAIFollowToolArgumentsUpdate(m.content);
    case WebsocketMsgTypeForFrontendEnum.AIFollowToolResultUpdate:
      return receiveAIFollowToolResultUpdate(m.content);
    default:
      return m satisfies never;
  }
}

function sendCurrentAddress(currentAddress: string) {
  sendMessage(
    createWebsocketMsgCurrentAddressUpdate({ content: currentAddress }),
  );
}

function emitRealtimeDependencyValue(
  dependencyKey: BaseDependencyKeyUnion,
  value: BaseDependencyValueUnion,
) {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  const coverage = getListenerCoverageRecord(projectConfigId);
  if (!coverage || !dependencyKeyCovered(projectConfigId, dependencyKey)) {
    return;
  }

  const message: WebsocketMsgRealtimeUIChange = {
    id: null,
    messageType: WebsocketMsgTypeForBackendEnum.RealtimeUIChange,
    content: {
      projectConfigId,
      dependencyKey,
      value,
    },
  };
  sendMessage(message);
}

type ControlActionEventInput = {
  controlName: string;
  actionId: string;
  actionControlType: CodeObjType;
  payload?: string | null;
};

export function sendRealtimeControlAction(
  action: ControlActionEventInput,
): void {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }

  const actionEvent: ControlActionEvent = {
    controlName: action.controlName,
    actionId: action.actionId,
    actionControlType: action.actionControlType,
    payload: action.payload ?? null,
    timestampMs: Date.now(),
  };
  const message: WebsocketMsgRealtimeActionEvent = {
    id: null,
    messageType: WebsocketMsgTypeForBackendEnum.RealtimeActionEvent,
    content: {
      projectConfigId,
      actionEvent,
    },
  };
  sendMessage(message);
}

export function sendRealtimeSectionParamLiteral(
  sectionId: string,
  codeObjId: string,
  value: string,
) {
  const dependencyKey: SectionParamDependencyKey = {
    type: DependencyKeyTypeEnum.SectionParam,
    sectionId,
    codeObjId,
  };
  const dependencyValue: LiteralDependencyValue = {
    payload: value,
    type: DependencyValueTypeEnum.Literal,
  };
  emitRealtimeDependencyValue(dependencyKey, dependencyValue);
}

export function sendRealtimeSectionLiteral(sectionId: string, value: string) {
  const dependencyKey: SectionDependencyKey = {
    type: DependencyKeyTypeEnum.Section,
    sectionId,
  };
  const dependencyValue: LiteralDependencyValue = {
    payload: value,
    type: DependencyValueTypeEnum.Literal,
  };
  emitRealtimeDependencyValue(dependencyKey, dependencyValue);
}

export function sendRealtimeSectionBase64(
  sectionId: string,
  base64Payload: string,
) {
  const dependencyKey: SectionDependencyKey = {
    type: DependencyKeyTypeEnum.Section,
    sectionId,
  };
  const dependencyValue: Base64DependencyValue = {
    payload: base64Payload,
    type: DependencyValueTypeEnum.Base64,
  };
  emitRealtimeDependencyValue(dependencyKey, dependencyValue);
}

function sendMessage(message: WebsocketMsg) {
  if (wssReady(wss)) {
    wss.send(JSON.stringify(message));
  }
}
