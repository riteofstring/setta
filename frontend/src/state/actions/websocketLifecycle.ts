import _ from "lodash";
import {
  buildFrontendAffinityCurrentAddress,
  clearFrontendWebsocketAffinity,
} from "state/actions/frontendWebsocketAffinity";
import { processLspDiagnostics } from "state/actions/lspDiagnostics";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  addWebsocketConnection,
  clearAllWebsocketConnections,
} from "state/actions/websocketConnectionList";
import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
import { useServerMode, useShareSession } from "state/stores/sessionStores";
import { C } from "utils/c";
import { C_ADDRESSES } from "utils/c_addresses";
import { res200 } from "utils/endpointUtils";
import {
  route_get_auth_refresh_status,
  route_get_latest_lsp_diagnostics,
  route_get_latest_project_state,
} from "utils/generatedEndpoints";
import {
  RouteEnum,
  WebsocketConnectionTypeEnum,
  createWebsocketConnectionInfo,
  createWebsocketMsgCurrentAddressUpdate,
} from "utils/generatedTypes";
import { loadAgentRuns } from "./aiAgentRuns";
import { requestAIFollowSnapshot } from "./aiFollow";
import {
  initializeAppSessionFromCurrentDeployment,
  resetAppSessionState,
} from "./app";
import { fetchListenerCoverageSnapshot } from "./listenerCoverage";
import { getCurrProjectConfigId } from "./sectionEffectiveImpls";
import { processProjectStateUpdateFromBackend } from "./sectionProjectStateSync";
import {
  initializeShareSessionFromCurrentDeployment,
  resetShareSessionState,
} from "./share";
import { receiveFrontendWebsocketMessage } from "./websocketIncomingMessages";
import {
  beginWebsocketGeneration,
  isSocketGenerationCurrent,
  sendMessage,
  sendMessageForGeneration,
  websocketTransportState,
  wssReady,
} from "./websocketRuntime";

let wasOpen = false;
let authLost = false;
const AUTH_CLOSE_CODE = 4401;
const SHARE_SESSION_MISSING_CODE = 4400;
const SHARE_SESSION_UNKNOWN_CODE = 4404;
const BOOTSTRAP_URL = `${C_ADDRESSES.BACKEND_ORIGIN}${RouteEnum.BOOTSTRAP_PAGE}`;
const AUTH_RECOVERY_INTERVAL_MS = 2000;
const DEFAULT_AUTH_REFRESH_WINDOW_SECONDS =
  C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS;
const SHARE_HEARTBEAT_INTERVAL_MS = 30000;
const SHARE_SESSION_RECOVERY_MAX_ATTEMPTS = 1;
let authRecoveryTimer: number | null = null;
let authRecoveryInFlight = false;
let authRefreshTimer: number | null = null;
let authRefreshInFlight = false;
let authRefreshWindowSeconds = DEFAULT_AUTH_REFRESH_WINDOW_SECONDS;
let authRefreshIntervalMs = getAuthRefreshIntervalMs(
  DEFAULT_AUTH_REFRESH_WINDOW_SECONDS,
);
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
    const isDeploymentMode = Boolean(shareSessionId);
    if (!isDeploymentMode) {
      stopShareHeartbeat();
    }
    const route = isDeploymentMode
      ? RouteEnum.WEBSOCKET_SHARE_FRONTEND
      : RouteEnum.WEBSOCKET_FRONTEND;
    const targetUrl = isDeploymentMode
      ? `${C_ADDRESSES.WEBSOCKET}${route}?shareSessionId=${encodeURIComponent(
          shareSessionId ?? "",
        )}`
      : `${C_ADDRESSES.WEBSOCKET}${route}`;
    if (
      wssReady(websocketTransportState.wss) &&
      currentRoute === route &&
      currentShareSessionId === shareSessionId
    ) {
      sendCurrentAddress(buildFrontendAffinityCurrentAddress(pathname));
      return;
    }
    if (
      websocketTransportState.wss &&
      (currentRoute !== route || currentShareSessionId !== shareSessionId)
    ) {
      closeWebSocketForReplacement();
    }
    if (websocketTransportState.wss) {
      return;
    }

    const socketGeneration = beginWebsocketGeneration();
    const socket = new WebSocket(targetUrl);
    websocketTransportState.wss = socket;
    const shareSessionIdForSocket = shareSessionId;
    currentShareSessionId = shareSessionId;
    currentRoute = route;

    socket.addEventListener("open", async () => {
      if (
        !isSocketGenerationCurrent(socketGeneration) ||
        websocketTransportState.wss !== socket
      ) {
        return;
      }
      await handleSocketOpen({
        pathname,
        shareSessionId,
        isDeploymentMode,
      });
    });

    socket.addEventListener("message", (event) => {
      if (
        !isSocketGenerationCurrent(socketGeneration) ||
        websocketTransportState.wss !== socket
      ) {
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
      handleSocketClose({
        event,
        socket,
        socketGeneration,
        pathname,
        shareSessionIdForSocket,
      });
    });
  },
  1000,
  { leading: true },
);

async function handleSocketOpen({
  pathname,
  shareSessionId,
  isDeploymentMode,
}: {
  pathname: string;
  shareSessionId: string | null;
  isDeploymentMode: boolean;
}) {
  sendCurrentAddress(buildFrontendAffinityCurrentAddress(pathname));
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
  if (isDeploymentMode) {
    startShareHeartbeat();
    const projectConfigId = getCurrProjectConfigId();
    if (projectConfigId !== NULL_PROJECT_CONFIG_ID) {
      await fetchListenerCoverageSnapshot(projectConfigId);
    }
    return;
  }

  const projectConfigId = getCurrProjectConfigId();
  const hydrated = await hydrateLatestProjectState(projectConfigId);
  startAuthRefresh({ runImmediately: !hydrated });
}

async function hydrateLatestProjectState(projectConfigId: string) {
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return false;
  }
  const res = await route_get_latest_project_state({
    projectConfigId,
  });
  if (!res200(res)) {
    return false;
  }
  processProjectStateUpdateFromBackend(res.data);
  void loadAgentRuns();
  await requestAIFollowSnapshot(projectConfigId);
  const diagnosticsRes = await route_get_latest_lsp_diagnostics({
    projectConfigId,
  });
  if (res200(diagnosticsRes)) {
    processLspDiagnostics(diagnosticsRes.data);
  }
  return true;
}

function handleSocketClose({
  event,
  socket,
  socketGeneration,
  pathname,
  shareSessionIdForSocket,
}: {
  event: CloseEvent;
  socket: WebSocket;
  socketGeneration: number;
  pathname: string;
  shareSessionIdForSocket: string | null;
}) {
  if (!isSocketGenerationCurrent(socketGeneration)) {
    return;
  }
  if (websocketTransportState.wss && websocketTransportState.wss !== socket) {
    return;
  }
  stopAuthRefresh();
  stopShareHeartbeat();
  websocketTransportState.wss = null;
  currentShareSessionId = null;
  currentRoute = null;
  if (
    event.code === SHARE_SESSION_MISSING_CODE ||
    event.code === SHARE_SESSION_UNKNOWN_CODE
  ) {
    wasOpen = false;
    clearAllWebsocketConnections();
    clearFrontendWebsocketAffinity(socketGeneration);
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
  const res = await route_get_auth_refresh_status();
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
  if (websocketTransportState.wss) {
    websocketTransportState.wss.close();
    websocketTransportState.wss = null;
  }
  clearFrontendWebsocketAffinity(socketGeneration);
  stopAuthRefresh();
  stopShareHeartbeat();
}

function handleWebSocketTransportError(
  socket: WebSocket,
  socketGeneration: number,
) {
  if (!isSocketGenerationCurrent(socketGeneration)) {
    return;
  }
  if (websocketTransportState.wss !== socket) {
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

function startShareHeartbeat() {
  stopShareHeartbeat();
  shareHeartbeatTimer = window.setInterval(() => {
    if (
      currentShareSessionId === null ||
      !wssReady(websocketTransportState.wss)
    ) {
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
  const res = await route_get_auth_refresh_status();
  authRefreshInFlight = false;
  if (res200(res)) {
    updateAuthRefreshWindowSeconds(res.data.authCookieRefreshWindowSeconds);
    return;
  }
  if (!res.hasResponse) {
    return;
  }
  if (res.status === 401 && wssReady(websocketTransportState.wss)) {
    websocketTransportState.wss.close(AUTH_CLOSE_CODE);
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

function receiveMessage(message: string, socketGeneration: number) {
  receiveFrontendWebsocketMessage(message, {
    socketGeneration,
    isSocketGenerationCurrent,
    isSocketOpen: () => wssReady(websocketTransportState.wss),
    sendMessageForGeneration,
  });
}

function sendCurrentAddress(currentAddress: string) {
  sendMessage(
    createWebsocketMsgCurrentAddressUpdate({ content: currentAddress }),
  );
}
