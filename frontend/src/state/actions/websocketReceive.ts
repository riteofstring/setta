import _ from "lodash";
import {
  getAuthRefreshStatus,
  getLatestLspDiagnostics,
  getLatestProjectState,
  uploadBinary,
  type HttpapiAuthRefreshStatusResponse as AuthRefreshStatusResponse,
  type GetLatestProjectStateResponse,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { processAppProjectStateUpdateFromBackend } from "state/actions/appProjectState";
import { addBackendLogEvent } from "state/actions/backendLogEvents";
import {
  buildFrontendAffinityCurrentAddress,
  clearFrontendWebsocketAffinity,
  setActiveFrontendWebsocketAffinityGeneration,
  setFrontendAffinityToken,
} from "state/actions/frontendWebsocketAffinity";
import { processLspDiagnostics } from "state/actions/lspDiagnostics";
import { processNameValidationErrors } from "state/actions/nameValidation";
import {
  addNotificationFromWebsocketMsg,
  addTemporaryNotification,
} from "state/actions/notifications";
import {
  registerRealtimeDependencySenders,
  sendRealtimeDependencyValue,
} from "state/actions/realtimeDependencySend";
import {
  addWebsocketConnection,
  clearAllWebsocketConnections,
  setWebsocketConnections,
} from "state/actions/websocketConnectionList";
import {
  NULL_PROJECT_CONFIG_ID,
  useServerMode,
  useShareSession,
} from "state/definitions";
import {
  buildBootstrapPageUrl,
  buildFrontendWebsocketUrl,
  getFrontendWebsocketRoute,
} from "utils/backendOriginTransport";
import { encodeBinaryFrame } from "utils/binaryWebsocket";
import { C } from "utils/c";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  BinaryDependencyValue,
  ConnectionTypeEnum,
  createConnection,
  createCurrentAddressUpdateMessage,
  CurrentAddressUpdateMessage,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  MessageTypeEnum,
  NotificationTypeEnum,
  SectionDependencyKey,
  UISettingRevealContent,
  UISettingRevealResultMessage,
  UISettingRevealResultStatus,
  WebsocketMessageTypeEnum,
  type ContentRef,
  type LSPDiagnosticsPayload,
  type WebsocketMessageType,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  loadAgentRuns,
  receiveAgentProfilesUpdate,
  receiveAgentRunUpdate,
  receiveEngineConfigsUpdate,
  receiveExternalAgentConfigsUpdate,
  receiveLLMApiKeysSnapshotUpdate,
  receiveLLMConfigUpdate,
  receiveLLMResponseChunk,
  receivePromptTemplatesUpdate,
  receiveTranscriptionProfilesUpdate,
} from "./ai";
import {
  receiveAIFollowToolArgumentsUpdate,
  receiveAIFollowToolResultUpdate,
  requestAIFollowSnapshot,
} from "./aiFollow";
import {
  initializeAppSessionFromCurrentDeployment,
  resetAppSessionState,
} from "./app";
import { updateArtifacts } from "./artifacts";
import {
  applyListenerCoverageSnapshot,
  dependencyKeyCovered,
  fetchListenerCoverageSnapshot,
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
import {
  parseUISettingRevealContent,
  receiveUISettingReveal,
  type UISettingRevealExecutionContext,
} from "./uiSettingReveal";

export {
  sendRealtimeDependencyEvent,
  sendRealtimeSectionLiteral,
  sendRealtimeSectionParamLiteral,
} from "state/actions/realtimeDependencySend";

let wss: WebSocket | null = null;
let wasOpen = false;
let authLost = false;
const AUTH_CLOSE_CODE = 4401;
const SHARE_SESSION_MISSING_CODE = 4400;
const SHARE_SESSION_UNKNOWN_CODE = 4404;
const BOOTSTRAP_URL = buildBootstrapPageUrl();
const FRONTEND_WEBSOCKET_ROUTE = getFrontendWebsocketRoute();
const AUTH_RECOVERY_INTERVAL_MS = 2000;
const SHARE_HEARTBEAT_INTERVAL_MS = 30000;
const SHARE_SESSION_RECOVERY_MAX_ATTEMPTS = 1;
const REALTIME_BINARY_OVERSIZE_COOLDOWN_MS = 5000;
let authRecoveryTimer: number | null = null;
let authRecoveryInFlight = false;
let authRefreshTimer: number | null = null;
let authRefreshInFlight = false;
let authRefreshWindowSeconds = C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS;
let authRefreshIntervalMs = getAuthRefreshIntervalMs(
  C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS,
);
let lastPathname: string | null = null;
let lastShareSessionId: string | null = null;
let currentShareSessionId: string | null = null;
let currentRoute: string | null = null;
let activeWebsocketGeneration = 0;
let shareHeartbeatTimer: number | null = null;
let shareSessionRecoveryAttempts = 0;
let shareSessionRecoveryInFlight = false;
let lastRealtimeBinaryOversizeWarningAt = 0;
type PendingUISettingRevealMessage = {
  content: unknown;
  socketGeneration: number;
};
type AuthRefreshStatusRouteResponse =
  ResponseDataAndStatus<AuthRefreshStatusResponse>;
type BinaryUploadRouteResponse = ResponseDataAndStatus<ContentRef>;
type LatestProjectStateRouteResponse =
  ResponseDataAndStatus<GetLatestProjectStateResponse>;
type LatestLSPDiagnosticsRouteResponse =
  ResponseDataAndStatus<LSPDiagnosticsPayload>;
type FrontendWebsocketEnvelope = {
  id?: string | null;
  messageType: WebsocketMessageType;
  content: unknown;
};
type FrontendOutboundMessage =
  | CurrentAddressUpdateMessage
  | RealtimeUIChangeMessage
  | RealtimeDependencyEventMessage
  | UISettingRevealResultMessage;
type WebsocketMessageHandler = (
  content: unknown,
  socketGeneration: number,
) => void;
type FrontendIdentityContent = {
  frontendAffinityToken: string;
};
type AgentProfilesUpdatedContent = {
  profiles: Parameters<typeof receiveAgentProfilesUpdate>[0];
};
type PromptTemplatesUpdatedContent = {
  templates: Parameters<typeof receivePromptTemplatesUpdate>[0];
};
type ConfigsUpdatedContent = {
  configs: Parameters<typeof receiveEngineConfigsUpdate>[0];
};
type ExternalAgentConfigsUpdatedContent = {
  configs: Parameters<typeof receiveExternalAgentConfigsUpdate>[0];
};
type TranscriptionProfilesUpdatedContent = {
  profiles: Parameters<typeof receiveTranscriptionProfilesUpdate>[0];
};
type WebsocketOpenRequest = {
  pathname: string;
  route: string;
  shareSessionId: string | null;
  targetUrl: string;
};
function beginWebsocketGeneration(): number {
  activeWebsocketGeneration += 1;
  setActiveFrontendWebsocketAffinityGeneration(activeWebsocketGeneration);
  clearFrontendWebsocketAffinity(activeWebsocketGeneration);
  return activeWebsocketGeneration;
}
export const openWebSocket = _.debounce(
  (pathname: string, shareSessionId: string | null = null) => {
    if (authLost) {
      return;
    }
    lastPathname = pathname;
    lastShareSessionId = shareSessionId;
    if (shareSessionId === null) {
      stopShareHeartbeat();
    }
    const openRequest: WebsocketOpenRequest = {
      pathname,
      route: FRONTEND_WEBSOCKET_ROUTE,
      shareSessionId,
      targetUrl: buildFrontendWebsocketUrl(shareSessionId),
    };
    if (reuseOpenWebSocket(openRequest)) {
      return;
    }
    if (shouldReplaceOpenWebSocket(openRequest)) {
      closeWebSocketForReplacement();
    }
    if (wss !== null) {
      return;
    }
    createWebSocket(openRequest);
  },
  1000,
  { leading: true },
);
function reuseOpenWebSocket({
  pathname,
  route,
  shareSessionId,
}: WebsocketOpenRequest): boolean {
  if (
    !wssReady(wss) ||
    currentRoute !== route ||
    currentShareSessionId !== shareSessionId
  ) {
    return false;
  }
  sendCurrentAddress(buildFrontendAffinityCurrentAddress(pathname));
  return true;
}
function shouldReplaceOpenWebSocket({
  route,
  shareSessionId,
}: WebsocketOpenRequest): boolean {
  return Boolean(
    wss && (currentRoute !== route || currentShareSessionId !== shareSessionId),
  );
}
function createWebSocket({
  pathname,
  route,
  shareSessionId,
  targetUrl,
}: WebsocketOpenRequest): void {
  const socketGeneration = beginWebsocketGeneration();
  const socket = new WebSocket(targetUrl);
  wss = socket;
  currentShareSessionId = shareSessionId;
  currentRoute = route;
  socket.addEventListener("open", async () => {
    await handleWebSocketOpen(
      socket,
      socketGeneration,
      pathname,
      shareSessionId,
    );
  });
  socket.addEventListener("message", (event) => {
    if (activeWebsocketGeneration !== socketGeneration || wss !== socket) {
      return;
    }
    if (typeof event.data !== "string") {
      return;
    }
    receiveMessage(event.data, socketGeneration);
  });
  socket.addEventListener("error", () => {
    handleWebSocketTransportError(socket, socketGeneration);
  });
  socket.addEventListener("close", (event: CloseEvent) => {
    handleWebSocketClose({
      event,
      pathname,
      shareSessionId,
      socket,
      socketGeneration,
    });
  });
}
async function handleWebSocketOpen(
  socket: WebSocket,
  socketGeneration: number,
  pathname: string,
  shareSessionId: string | null,
): Promise<void> {
  if (activeWebsocketGeneration !== socketGeneration || wss !== socket) {
    return;
  }
  sendCurrentAddress(buildFrontendAffinityCurrentAddress(pathname));
  addTemporaryNotification("Connected to server");
  addWebsocketConnection(
    createConnection({
      id: "main",
      connectionType: ConnectionTypeEnum.SERVER,
      currentAddress: pathname,
      ...(shareSessionId ? { shareSessionId } : {}),
    }),
  );
  wasOpen = true;
  if (shareSessionId !== null) {
    startShareHeartbeat();
    const projectConfigId = getCurrProjectConfigId();
    if (projectConfigId !== NULL_PROJECT_CONFIG_ID) {
      await fetchListenerCoverageSnapshot(projectConfigId);
    }
    return;
  }
  await bootstrapWebsocketProjectState();
}
async function bootstrapWebsocketProjectState(): Promise<void> {
  const projectConfigId = getCurrProjectConfigId();
  let runImmediateAuthRefresh = true;
  if (projectConfigId !== NULL_PROJECT_CONFIG_ID) {
    const res = (await callOpenAPI(
      getLatestProjectState({
        body: {
          projectConfigId: getCurrProjectConfigId(),
        },
      } as Parameters<typeof getLatestProjectState>[0]),
    )) as LatestProjectStateRouteResponse;
    if (res200(res)) {
      processProjectStateUpdateFromBackend(res.data);
      void loadAgentRuns();
      await requestAIFollowSnapshot(projectConfigId);
      const diagnosticsRes = (await callOpenAPI(
        getLatestLspDiagnostics({
          body: { projectConfigId },
        } as Parameters<typeof getLatestLspDiagnostics>[0]),
      )) as LatestLSPDiagnosticsRouteResponse;
      if (res200(diagnosticsRes)) {
        processLspDiagnostics(diagnosticsRes.data);
      }
      runImmediateAuthRefresh = false;
    }
  }
  startAuthRefresh({ runImmediately: runImmediateAuthRefresh });
}
function handleWebSocketClose({
  event,
  pathname,
  shareSessionId,
  socket,
  socketGeneration,
}: {
  event: CloseEvent;
  pathname: string;
  shareSessionId: string | null;
  socket: WebSocket;
  socketGeneration: number;
}): void {
  if (activeWebsocketGeneration !== socketGeneration) {
    return;
  }
  if (wss && wss !== socket) {
    return;
  }
  stopAuthRefresh();
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
    clearFrontendWebsocketAffinity(socketGeneration);
    if (shareSessionId === null) {
      return;
    }
    void handleShareSessionRecovery();
    return;
  }
  if (event.code === AUTH_CLOSE_CODE) {
    authLost = true;
    wasOpen = false;
    clearAllWebsocketConnections();
    clearFrontendWebsocketAffinity(socketGeneration);
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
  clearFrontendWebsocketAffinity(socketGeneration);
  // Attempt to reconnect
  setTimeout(() => {
    openWebSocket(lastPathname ?? pathname, lastShareSessionId);
  }, 3000);
}
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
  stopAuthRefresh();
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
  const res = (await callOpenAPI(
    getAuthRefreshStatus(),
  )) as AuthRefreshStatusRouteResponse;
  authRecoveryInFlight = false;
  if (res200(res)) {
    updateAuthRefreshWindowSeconds(res.data.authCookieRefreshWindowSeconds);
    authLost = false;
    clearAuthRecoveryTimer();
    openWebSocket(lastPathname ?? pathname, lastShareSessionId);
    return;
  }
  scheduleAuthRecovery(pathname);
}
function closeWebSocketForReplacement() {
  const socketGeneration = beginWebsocketGeneration();
  if (wss) {
    wss.close();
    wss = null;
  }
  clearFrontendWebsocketAffinity(socketGeneration);
  stopAuthRefresh();
  stopShareHeartbeat();
}
function handleWebSocketTransportError(
  socket: WebSocket,
  socketGeneration: number,
) {
  if (activeWebsocketGeneration !== socketGeneration) {
    return;
  }
  if (wss !== socket) {
    return;
  }
  if (
    socket.readyState === WebSocket.CLOSED ||
    socket.readyState === WebSocket.CLOSING
  ) {
    return;
  }
  socket.close();
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
    sendCurrentAddress(buildFrontendAffinityCurrentAddress(currentAddress));
  }, SHARE_HEARTBEAT_INTERVAL_MS);
}
function stopShareHeartbeat() {
  if (shareHeartbeatTimer === null) {
    return;
  }
  window.clearInterval(shareHeartbeatTimer);
  shareHeartbeatTimer = null;
}
function startAuthRefresh({ runImmediately }: { runImmediately: boolean }) {
  stopAuthRefresh();
  if (authLost) {
    return;
  }
  // This remains HTTP polling rather than a websocket push because the server
  // needs an authenticated HTTP request to rotate the browser auth cookie.
  // Websocket traffic can report auth loss (4401), but it cannot extend cookie
  // expiry for an otherwise idle tab.
  if (runImmediately) {
    void runAuthRefresh();
  }
  authRefreshTimer = window.setInterval(() => {
    void runAuthRefresh();
  }, authRefreshIntervalMs);
}
function stopAuthRefresh() {
  if (authRefreshTimer === null) {
    return;
  }
  window.clearInterval(authRefreshTimer);
  authRefreshTimer = null;
}
async function runAuthRefresh() {
  if (authLost || authRefreshInFlight) {
    return;
  }
  authRefreshInFlight = true;
  const res = (await callOpenAPI(
    getAuthRefreshStatus(),
  )) as AuthRefreshStatusRouteResponse;
  authRefreshInFlight = false;
  if (res200(res)) {
    updateAuthRefreshWindowSeconds(res.data.authCookieRefreshWindowSeconds);
    return;
  }
  if (!res.hasResponse) {
    return;
  }
  if (res.status === 401 && wssReady(wss)) {
    wss.close(AUTH_CLOSE_CODE);
  }
}
function getAuthRefreshIntervalMs(windowSeconds: number): number {
  return Math.max(1000, Math.floor(windowSeconds * 1000 * 0.5));
}
function updateAuthRefreshWindowSeconds(
  windowSeconds: number | null | undefined,
) {
  if (windowSeconds === null || windowSeconds === undefined) {
    return;
  }
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    return;
  }
  if (windowSeconds === authRefreshWindowSeconds) {
    return;
  }
  authRefreshWindowSeconds = windowSeconds;
  const nextIntervalMs = getAuthRefreshIntervalMs(windowSeconds);
  if (nextIntervalMs === authRefreshIntervalMs) {
    return;
  }
  authRefreshIntervalMs = nextIntervalMs;
  if (authRefreshTimer !== null && !authLost) {
    startAuthRefresh({ runImmediately: false });
  }
}
async function handleShareSessionRecovery() {
  if (shareSessionRecoveryInFlight) {
    return;
  }
  const shareSession = useShareSession.getState();
  const serverMode = useServerMode.getState();
  const isAppMode =
    shareSession.deploymentMode === "app" || serverMode.mode === "app";
  const expiredMessage = isAppMode
    ? "App session expired. Refresh to continue."
    : "Share session expired. Refresh to continue.";
  if (shareSessionRecoveryAttempts >= SHARE_SESSION_RECOVERY_MAX_ATTEMPTS) {
    if (isAppMode) {
      resetAppSessionState();
    } else {
      resetShareSessionState();
    }
    addTemporaryNotification(expiredMessage);
    return;
  }
  shareSessionRecoveryInFlight = true;
  shareSessionRecoveryAttempts += 1;
  const recovered = isAppMode
    ? await initializeAppSessionFromCurrentDeployment({
        forceNewSession: true,
      })
    : await initializeShareSessionFromCurrentDeployment({
        forceNewSession: true,
      });
  shareSessionRecoveryInFlight = false;
  if (!recovered) {
    if (isAppMode) {
      resetAppSessionState();
    } else {
      resetShareSessionState();
    }
    addTemporaryNotification(expiredMessage);
    return;
  }
  shareSessionRecoveryAttempts = 0;
}
function createWebsocketMessageHandler<T>(
  handler: (content: T, socketGeneration: number) => void,
): WebsocketMessageHandler {
  return (content, socketGeneration) => {
    handler(content as T, socketGeneration);
  };
}
function receiveFrontendProjectState(content: unknown): void {
  if (useServerMode.getState().mode === "app") {
    processAppProjectStateUpdateFromBackend(
      content as Parameters<typeof processAppProjectStateUpdateFromBackend>[0],
    );
    return;
  }
  processProjectStateUpdateFromBackend(
    content as Parameters<typeof processProjectStateUpdateFromBackend>[0],
  );
}
const websocketMessageHandlers = {
  [WebsocketMessageTypeEnum.FrontendIdentity]:
    createWebsocketMessageHandler<FrontendIdentityContent>(
      (content, socketGeneration) => {
        setFrontendAffinityToken(
          content.frontendAffinityToken,
          socketGeneration,
        );
      },
    ),
  [WebsocketMessageTypeEnum.AllConnections]: createWebsocketMessageHandler<
    Parameters<typeof setWebsocketConnections>[0]
  >((content) => {
    setWebsocketConnections(content);
  }),
  [WebsocketMessageTypeEnum.LLMStreamingResponse]:
    createWebsocketMessageHandler<
      Parameters<typeof receiveLLMResponseChunk>[0]
    >((content) => {
      receiveLLMResponseChunk(content);
    }),
  [WebsocketMessageTypeEnum.LSPDiagnostics]: createWebsocketMessageHandler<
    Parameters<typeof processLspDiagnostics>[0]
  >((content) => {
    processLspDiagnostics(content);
  }),
  [WebsocketMessageTypeEnum.NameValidationErrors]:
    createWebsocketMessageHandler<
      Parameters<typeof processNameValidationErrors>[0]
    >((content) => {
      processNameValidationErrors(content);
    }),
  [WebsocketMessageTypeEnum.Notification]: createWebsocketMessageHandler<
    Parameters<typeof addNotificationFromWebsocketMsg>[0]
  >((content) => {
    addNotificationFromWebsocketMsg(content);
  }),
  [WebsocketMessageTypeEnum.ReturnRenameRefactorResults]:
    createWebsocketMessageHandler<
      Parameters<typeof handleRenameRefactorBroadcast>[0]
    >((content) => {
      handleRenameRefactorBroadcast(content);
    }),
  [WebsocketMessageTypeEnum.UpdateFrontendProjectState]:
    createWebsocketMessageHandler((content) => {
      receiveFrontendProjectState(content);
    }),
  [WebsocketMessageTypeEnum.UpdateSettings]: createWebsocketMessageHandler<
    Parameters<typeof updateSettings>[0]
  >((content) => {
    updateSettings(content);
  }),
  [WebsocketMessageTypeEnum.AllProjectMetadata]: createWebsocketMessageHandler<
    Parameters<typeof updateAllProjectMetadata>[0]
  >((content) => {
    updateAllProjectMetadata(content);
  }),
  [WebsocketMessageTypeEnum.UpdateArtifacts]: createWebsocketMessageHandler<
    Parameters<typeof updateArtifacts>[0]
  >((content) => {
    updateArtifacts(content);
  }),
  [WebsocketMessageTypeEnum.ListenerCoverageSnapshot]:
    createWebsocketMessageHandler<
      Parameters<typeof applyListenerCoverageSnapshot>[0]
    >((content) => {
      applyListenerCoverageSnapshot(content);
    }),
  [WebsocketMessageTypeEnum.LLMConfigUpdated]: createWebsocketMessageHandler<
    Parameters<typeof receiveLLMConfigUpdate>[0]
  >((content) => {
    receiveLLMConfigUpdate(content);
  }),
  [WebsocketMessageTypeEnum.LLMApiKeysUpdated]: createWebsocketMessageHandler<
    Parameters<typeof receiveLLMApiKeysSnapshotUpdate>[0]
  >((content) => {
    receiveLLMApiKeysSnapshotUpdate(content);
  }),
  [WebsocketMessageTypeEnum.BackendLogEvent]: createWebsocketMessageHandler<
    Parameters<typeof addBackendLogEvent>[0]
  >((content) => {
    addBackendLogEvent(content);
  }),
  [WebsocketMessageTypeEnum.AIFollowToolArgumentsUpdate]:
    createWebsocketMessageHandler<
      Parameters<typeof receiveAIFollowToolArgumentsUpdate>[0]
    >((content) => {
      receiveAIFollowToolArgumentsUpdate(content);
    }),
  [WebsocketMessageTypeEnum.AIFollowToolResultUpdate]:
    createWebsocketMessageHandler<
      Parameters<typeof receiveAIFollowToolResultUpdate>[0]
    >((content) => {
      receiveAIFollowToolResultUpdate(content);
    }),
  [WebsocketMessageTypeEnum.UISettingReveal]: createWebsocketMessageHandler(
    (content, socketGeneration) => {
      enqueueUISettingRevealMessage({
        content,
        socketGeneration,
      });
    },
  ),
  [WebsocketMessageTypeEnum.AgentProfilesUpdated]:
    createWebsocketMessageHandler<AgentProfilesUpdatedContent>((content) => {
      receiveAgentProfilesUpdate(content.profiles);
    }),
  [WebsocketMessageTypeEnum.AgentRunUpdated]: createWebsocketMessageHandler<
    Parameters<typeof receiveAgentRunUpdate>[0]
  >((content) => {
    receiveAgentRunUpdate(content);
  }),
  [WebsocketMessageTypeEnum.PromptTemplatesUpdated]:
    createWebsocketMessageHandler<PromptTemplatesUpdatedContent>((content) => {
      receivePromptTemplatesUpdate(content.templates);
    }),
  [WebsocketMessageTypeEnum.ExternalAgentConfigsUpdated]:
    createWebsocketMessageHandler<ExternalAgentConfigsUpdatedContent>(
      (content) => {
        receiveExternalAgentConfigsUpdate(content.configs);
      },
    ),
  [WebsocketMessageTypeEnum.EngineConfigsUpdated]:
    createWebsocketMessageHandler<ConfigsUpdatedContent>((content) => {
      receiveEngineConfigsUpdate(content.configs);
    }),
  [WebsocketMessageTypeEnum.TranscriptionProfilesUpdated]:
    createWebsocketMessageHandler<TranscriptionProfilesUpdatedContent>(
      (content) => {
        receiveTranscriptionProfilesUpdate(content.profiles);
      },
    ),
} satisfies Record<WebsocketMessageType, WebsocketMessageHandler>;
function receiveMessage(message: string, socketGeneration: number) {
  const m = JSON.parse(message) as FrontendWebsocketEnvelope;
  websocketMessageHandlers[m.messageType](m.content, socketGeneration);
}
function enqueueUISettingRevealMessage(
  message: PendingUISettingRevealMessage,
): void {
  void handleUISettingRevealMessage(message.content, message.socketGeneration);
}
async function handleUISettingRevealMessage(
  content: unknown,
  socketGeneration: number,
): Promise<void> {
  const fallbackProjectConfigId = getCurrProjectConfigId();
  const projectConfigId = resolveRevealProjectConfigId(
    content,
    fallbackProjectConfigId,
  );
  const requestId = resolveRevealRequestId(content);
  let statuses: UISettingRevealResultStatusPayload[] = [];
  const revealContent = parseUISettingRevealContent(content);
  if (revealContent === null) {
    statuses = buildMalformedRevealStatuses(
      content,
      "Invalid UISettingReveal payload.",
    );
    sendUISettingRevealResult({
      projectConfigId,
      requestId,
      statuses,
      socketGeneration,
    });
    return;
  }
  const revealExecutionContext: UISettingRevealExecutionContext = {
    requestId: revealContent.requestId,
    requestedProjectConfigId: revealContent.projectConfigId.trim(),
    socketGeneration,
    isSocketGenerationActive: () =>
      isSocketGenerationCurrent(socketGeneration) && wssReady(wss),
  };
  try {
    const revealStatuses = await receiveUISettingReveal(
      revealContent,
      revealExecutionContext,
    );
    statuses = Array.isArray(revealStatuses) ? revealStatuses : [];
  } catch (error) {
    const rawMessage =
      error instanceof Error && error.message.trim() !== ""
        ? error.message
        : String(error);
    const normalizedMessage = `Failed to process UI setting reveal: ${rawMessage}`;
    statuses = revealContent.reveals.map((target) => ({
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: normalizedMessage,
    }));
  }
  const ackContextMismatchStatuses = resolveAckContextMismatchStatuses({
    content: revealContent,
    executionContext: revealExecutionContext,
  });
  if (ackContextMismatchStatuses !== null) {
    statuses = ackContextMismatchStatuses;
  }
  sendUISettingRevealResult({
    projectConfigId: revealContent.projectConfigId,
    requestId: revealContent.requestId,
    statuses,
    socketGeneration,
  });
}
function sendUISettingRevealResult({
  projectConfigId,
  requestId,
  statuses,
  socketGeneration,
}: {
  projectConfigId: string;
  requestId: string;
  statuses: UISettingRevealResultStatus[];
  socketGeneration: number;
}): void {
  const revealResultMessage: UISettingRevealResultMessage = {
    id: null,
    messageType: MessageTypeEnum.UISettingRevealResult,
    content: {
      projectConfigId,
      requestId,
      statuses,
    },
  };
  sendMessageForGeneration(revealResultMessage, socketGeneration);
}
function resolveRevealProjectConfigId(
  content: unknown,
  fallbackProjectConfigId: string,
): string {
  const fallbackNormalizedId =
    typeof fallbackProjectConfigId === "string" &&
    fallbackProjectConfigId.trim() !== ""
      ? fallbackProjectConfigId
      : NULL_PROJECT_CONFIG_ID;
  if (!isRecord(content)) {
    return fallbackNormalizedId;
  }
  const candidateProjectConfigId = content.projectConfigId;
  if (
    typeof candidateProjectConfigId === "string" &&
    candidateProjectConfigId.trim() !== ""
  ) {
    return candidateProjectConfigId;
  }
  return fallbackNormalizedId;
}
function resolveRevealRequestId(content: unknown): string {
  if (isRecord(content)) {
    const candidateRequestId = content.requestId;
    if (
      typeof candidateRequestId === "string" &&
      candidateRequestId.trim() !== ""
    ) {
      return candidateRequestId;
    }
  }
  return createNewId();
}
function buildMalformedRevealStatuses(
  content: unknown,
  errorMessage: string,
): UISettingRevealResultStatus[] {
  const settingIds = extractRevealSettingIds(content);
  return settingIds.map((settingId) => ({
    settingId,
    status: "failed",
    errorCode: "mutation_failed",
    errorMessage,
  }));
}
function extractRevealSettingIds(content: unknown): string[] {
  if (!isRecord(content)) {
    return [];
  }
  if (!Array.isArray(content.reveals)) {
    return [];
  }
  const ids: string[] = [];
  for (const reveal of content.reveals) {
    if (!isRecord(reveal)) {
      continue;
    }
    if (
      typeof reveal.settingId !== "string" ||
      reveal.settingId.trim() === ""
    ) {
      continue;
    }
    ids.push(reveal.settingId);
  }
  return ids;
}
function resolveAckContextMismatchStatuses({
  content,
  executionContext,
}: {
  content: UISettingRevealContent;
  executionContext: UISettingRevealExecutionContext;
}): UISettingRevealResultStatus[] | null {
  if (!executionContext.isSocketGenerationActive()) {
    return buildExecutionContextMismatchStatuses(
      content.reveals,
      "UI setting reveal execution context mismatch: websocket generation changed " +
        `before request ${executionContext.requestId} completed.`,
    );
  }
  const activeProjectConfigId = getCurrProjectConfigId().trim();
  const requestedProjectConfigId = executionContext.requestedProjectConfigId;
  if (activeProjectConfigId === requestedProjectConfigId) {
    return null;
  }
  return buildExecutionContextMismatchStatuses(
    content.reveals,
    "UI setting reveal execution context mismatch: requested project " +
      `${requestedProjectConfigId} but active project is ${activeProjectConfigId}.`,
  );
}
function buildExecutionContextMismatchStatuses(
  reveals: Array<UISettingRevealContent["reveals"][number]>,
  errorMessage: string,
): UISettingRevealResultStatus[] {
  return reveals.map((target) => ({
    settingId: target.settingId,
    status: "failed",
    errorCode: "mutation_failed",
    errorMessage,
  }));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function sendCurrentAddress(currentAddress: string) {
  sendMessage(createCurrentAddressUpdateMessage({ content: currentAddress }));
}
export function sendRealtimeSectionBinary(
  sectionId: string,
  payload: ArrayBuffer,
  mimeType = "image/png",
  projectConfigIdOverride?: string | null,
) {
  if (
    C.REALTIME_BINARY_MAX_BYTES > 0 &&
    payload.byteLength > C.REALTIME_BINARY_MAX_BYTES
  ) {
    void sendRealtimeSectionBinaryViaUpload(sectionId, payload, mimeType);
    return;
  }
  const dependencyKey: SectionDependencyKey = {
    type: DependencyKeyTypeEnum.Section,
    sectionId,
  };
  const dependencyValue: BinaryDependencyValue = {
    payload: {
      contentId: createNewId(),
      byteLength: payload.byteLength,
      mimeType,
    },
    type: DependencyValueTypeEnum.Binary,
  };
  sendRealtimeDependencyValue({
    binaryPayload: payload,
    dependencyKey,
    projectConfigIdOverride,
    value: dependencyValue,
  });
}
function sendMessage(message: FrontendOutboundMessage) {
  if (wssReady(wss)) {
    wss.send(JSON.stringify(message));
  }
}
function sendMessageForGeneration(
  message: FrontendOutboundMessage,
  socketGeneration: number,
): void {
  if (!isSocketGenerationCurrent(socketGeneration)) {
    return;
  }
  sendMessage(message);
}
function isSocketGenerationCurrent(socketGeneration: number): boolean {
  return activeWebsocketGeneration === socketGeneration;
}
function sendBinaryMessage(
  message: FrontendOutboundMessage,
  payload: ArrayBuffer,
) {
  if (wssReady(wss)) {
    const frame = encodeBinaryFrame(message, payload);
    wss.send(frame);
  }
}
registerRealtimeDependencySenders({
  sendBinaryMessage,
  sendMessage,
});
function maybeWarnRealtimeOversize(message: string) {
  const now = Date.now();
  if (
    now - lastRealtimeBinaryOversizeWarningAt <
    REALTIME_BINARY_OVERSIZE_COOLDOWN_MS
  ) {
    return;
  }
  lastRealtimeBinaryOversizeWarningAt = now;
  addTemporaryNotification(message, NotificationTypeEnum.warning);
}
async function uploadRealtimeBinaryPayload(
  payload: ArrayBuffer,
  mimeType: string,
) {
  const blob = new Blob([payload], { type: mimeType });
  const res = (await callOpenAPI(
    uploadBinary({
      body: {
        durable: false,
        file: blob,
      },
    } as Parameters<typeof uploadBinary>[0]),
  )) as BinaryUploadRouteResponse;
  if (!res200(res) || !res.data) {
    return null;
  }
  return res.data;
}
async function sendRealtimeSectionBinaryViaUpload(
  sectionId: string,
  payload: ArrayBuffer,
  mimeType: string,
) {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  const dependencyKey: SectionDependencyKey = {
    type: DependencyKeyTypeEnum.Section,
    sectionId,
  };
  if (!dependencyKeyCovered(projectConfigId, dependencyKey)) {
    return;
  }
  const ref = await uploadRealtimeBinaryPayload(payload, mimeType);
  if (!ref) {
    maybeWarnRealtimeOversize(
      "Realtime snapshot too large to send. Upload failed.",
    );
    return;
  }
  const dependencyValue: BinaryDependencyValue = {
    payload: ref,
    type: DependencyValueTypeEnum.Binary,
  };
  sendRealtimeDependencyValue({
    dependencyKey,
    projectConfigIdOverride: projectConfigId,
    value: dependencyValue,
  });
}
