import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";

import _ from "lodash";

import {
  getAuthRefreshStatus,
  getLatestLspDiagnostics,
  getLatestProjectState,
  type HttpapiAuthRefreshStatusResponse as AuthRefreshStatusResponse,
  type GetLatestProjectStateResponse,
} from "openapi/http";

import {
  initializeAppSessionFromCurrentDeployment,
  processAppProjectStateUpdateFromBackend,
  resetAppSessionState,
} from "plugins/appSubsystem";

import { DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST } from "plugins/appSubsystemFrontendHost";

import {
  buildFrontendAffinityCurrentAddress,
  clearFrontendWebsocketAffinity,
  setActiveFrontendWebsocketAffinityGeneration,
} from "state/actions/frontendWebsocketAffinity";

import { processLspDiagnostics } from "state/actions/lspDiagnostics";

import { addTemporaryNotification } from "state/actions/notifications";

import {
  addWebsocketConnection,
  clearAllWebsocketConnections,
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

import { C } from "utils/c";

import {
  ConnectionTypeEnum,
  createConnection,
  CurrentAddressUpdateMessage,
  UISettingRevealResultMessage,
  type ContentRef,
  type LSPDiagnosticsPayload,
  type WebsocketMessageType,
} from "utils/generatedTypes";

import {
  loadAgentRuns,
  receiveAgentProfilesUpdate,
  receiveEngineConfigsUpdate,
  receiveExternalAgentConfigsUpdate,
  receivePromptTemplatesUpdate,
  receiveTranscriptionProfilesUpdate,
} from "../ai";

import { requestAIFollowSnapshot } from "../aiFollow";

import { fetchListenerCoverageSnapshot } from "../listenerCoverage";

import {
  getCurrProjectConfigId,
  processProjectStateUpdateFromBackend,
} from "../sectionInfos";

import {
  initializeShareSessionFromCurrentDeployment,
  resetShareSessionState,
} from "../share";

import { receiveMessage } from "./websocketMessageHandlers";

import { sendCurrentAddress } from "./realtimeBinaryUpload";

export let wss: WebSocket | null = null;

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

export let activeWebsocketGeneration = 0;

let shareHeartbeatTimer: number | null = null;

let shareSessionRecoveryAttempts = 0;

let shareSessionRecoveryInFlight = false;

export type PendingUISettingRevealMessage = {
  content: unknown;
  socketGeneration: number;
};

type AuthRefreshStatusRouteResponse =
  ResponseDataAndStatus<AuthRefreshStatusResponse>;

export type BinaryUploadRouteResponse = ResponseDataAndStatus<ContentRef>;

type LatestProjectStateRouteResponse =
  ResponseDataAndStatus<GetLatestProjectStateResponse>;

type LatestLSPDiagnosticsRouteResponse =
  ResponseDataAndStatus<LSPDiagnosticsPayload>;

export type FrontendWebsocketEnvelope = {
  id?: string | null;
  messageType: WebsocketMessageType;
  content: unknown;
};

export type FrontendOutboundMessage =
  | CurrentAddressUpdateMessage
  | RealtimeUIChangeMessage
  | RealtimeDependencyEventMessage
  | UISettingRevealResultMessage;

export type WebsocketMessageHandler = (
  content: unknown,
  socketGeneration: number,
) => void;

export type FrontendIdentityContent = {
  frontendAffinityToken: string;
};

export type AgentProfilesUpdatedContent = {
  profiles: Parameters<typeof receiveAgentProfilesUpdate>[0];
};

export type PromptTemplatesUpdatedContent = {
  templates: Parameters<typeof receivePromptTemplatesUpdate>[0];
};

export type ConfigsUpdatedContent = {
  configs: Parameters<typeof receiveEngineConfigsUpdate>[0];
};

export type ExternalAgentConfigsUpdatedContent = {
  configs: Parameters<typeof receiveExternalAgentConfigsUpdate>[0];
};

export type TranscriptionProfilesUpdatedContent = {
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

export function wssReady(wss: WebSocket | null): wss is WebSocket {
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
  const isAppMode = isAppDeploymentWebsocketContext();
  const expiredMessage = isAppMode
    ? "App session expired. Refresh to continue."
    : "Share session expired. Refresh to continue.";
  if (shareSessionRecoveryAttempts >= SHARE_SESSION_RECOVERY_MAX_ATTEMPTS) {
    if (isAppMode) {
      resetAppSessionState(DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST);
    } else {
      resetShareSessionState();
    }
    addTemporaryNotification(expiredMessage);
    return;
  }
  shareSessionRecoveryInFlight = true;
  shareSessionRecoveryAttempts += 1;
  const recovered = isAppMode
    ? await initializeAppSessionFromCurrentDeployment(
        DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST,
        {
          forceNewSession: true,
        },
      )
    : await initializeShareSessionFromCurrentDeployment({
        forceNewSession: true,
      });
  shareSessionRecoveryInFlight = false;
  if (!recovered) {
    if (isAppMode) {
      resetAppSessionState(DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST);
    } else {
      resetShareSessionState();
    }
    addTemporaryNotification(expiredMessage);
    return;
  }
  shareSessionRecoveryAttempts = 0;
}

function isAppDeploymentWebsocketContext(): boolean {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode && shareSession.deploymentMode === "app") {
    return true;
  }
  return useServerMode.getState().mode === "app";
}

export function receiveFrontendProjectState(content: unknown): void {
  if (isAppDeploymentWebsocketContext()) {
    processAppProjectStateUpdateFromBackend(
      content as Parameters<typeof processAppProjectStateUpdateFromBackend>[0],
    );
    return;
  }
  processProjectStateUpdateFromBackend(
    content as Parameters<typeof processProjectStateUpdateFromBackend>[0],
  );
}
