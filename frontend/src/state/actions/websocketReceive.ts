import _ from "lodash";
import { processAppProjectStateUpdateFromBackend } from "state/actions/appProjectState";
import { addBackendLogEvent } from "state/actions/backendLogEvents";
import {
  buildFrontendAffinityCurrentAddress,
  clearFrontendWebsocketAffinity,
  setActiveFrontendWebsocketAffinityGeneration,
  setFrontendWebsocketAffinityId,
  updateFrontendWebsocketAffinity,
} from "state/actions/frontendWebsocketAffinity";
import { processLspDiagnostics } from "state/actions/lspDiagnostics";
import { processNameValidationErrors } from "state/actions/nameValidation";
import {
  addNotificationFromWebsocketMsg,
  addTemporaryNotification,
} from "state/actions/notifications";
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
import { encodeBinaryFrame } from "utils/binaryWebsocket";
import { C } from "utils/c";
import { C_ADDRESSES } from "utils/c_addresses";
import { res200 } from "utils/endpointUtils";
import {
  route_binary_upload,
  route_get_auth_refresh_status,
  route_get_latest_lsp_diagnostics,
  route_get_latest_project_state,
} from "utils/generatedEndpoints";
import {
  BaseDependencyKeyUnion,
  BaseDependencyValueUnion,
  BinaryDependencyValue,
  DependencyEvent,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  FrontendWebsocketMsgUnion,
  LiteralDependencyValue,
  RouteEnum,
  SectionDependencyKey,
  SectionParamDependencyKey,
  SettaNotificationTypeEnum,
  UISettingRevealContent,
  WebsocketConnectionTypeEnum,
  WebsocketMsg,
  WebsocketMsgRealtimeDependencyEvent,
  WebsocketMsgRealtimeUIChange,
  WebsocketMsgTypeForBackendEnum,
  WebsocketMsgTypeForFrontendEnum,
  WebsocketMsgUISettingRevealResult,
  createWebsocketConnectionInfo,
  createWebsocketMsgCurrentAddressUpdate,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  receiveAgentProfilesUpdate,
  receiveEngineConfigsUpdate,
  receiveExternalAgentConfigsUpdate,
  receiveLLMApiKeysUpdate,
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
import { receiveUISettingReveal } from "./uiSettingReveal";

let wss: WebSocket | null = null;
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
const REALTIME_BINARY_OVERSIZE_COOLDOWN_MS = 5000;
const FRONTEND_IDENTITY_MESSAGE_TYPE = "FrontendIdentity";
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
let activeWebsocketGeneration = 0;
let shareHeartbeatTimer: number | null = null;
let shareSessionRecoveryAttempts = 0;
let shareSessionRecoveryInFlight = false;
let lastRealtimeBinaryOversizeWarningAt = 0;

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
      wssReady(wss) &&
      currentRoute === route &&
      currentShareSessionId === shareSessionId
    ) {
      sendCurrentAddress(buildFrontendAffinityCurrentAddress(pathname));
      return;
    }
    if (
      wss &&
      (currentRoute !== route || currentShareSessionId !== shareSessionId)
    ) {
      closeWebSocketForReplacement();
    }
    if (!wss) {
      const socketGeneration = beginWebsocketGeneration();
      const socket = new WebSocket(targetUrl);
      wss = socket;
      const shareSessionIdForSocket = shareSessionId;
      currentShareSessionId = shareSessionId;
      currentRoute = route;
      wss.addEventListener("open", async () => {
        if (activeWebsocketGeneration !== socketGeneration || wss !== socket) {
          return;
        }
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
        } else {
          const projectConfigId = getCurrProjectConfigId();
          let runImmediateAuthRefresh = true;
          if (projectConfigId !== NULL_PROJECT_CONFIG_ID) {
            const res = await route_get_latest_project_state({
              projectConfigId: getCurrProjectConfigId(),
            });
            if (res200(res)) {
              processProjectStateUpdateFromBackend(res.data);
              await requestAIFollowSnapshot(projectConfigId);
              const diagnosticsRes = await route_get_latest_lsp_diagnostics({
                projectConfigId,
              });
              if (res200(diagnosticsRes)) {
                processLspDiagnostics(diagnosticsRes.data);
              }
              runImmediateAuthRefresh = false;
            }
          }
          startAuthRefresh({ runImmediately: runImmediateAuthRefresh });
        }
      });

      wss.addEventListener("message", (event) => {
        if (activeWebsocketGeneration !== socketGeneration || wss !== socket) {
          return;
        }
        if (typeof event.data !== "string") {
          return;
        }
        receiveMessage(event.data, socketGeneration);
      });

      wss.addEventListener("error", () => {
        handleWebSocketTransportError(socket, socketGeneration);
      });

      socket.addEventListener("close", (event: CloseEvent) => {
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

function receiveMessage(message: string, socketGeneration: number) {
  const parsedMessage: unknown = JSON.parse(message);
  if (isFrontendIdentityMessage(parsedMessage)) {
    setFrontendWebsocketAffinityId(
      parsedMessage.content.websocketId,
      socketGeneration,
    );
    return;
  }
  const m: FrontendWebsocketMsgUnion =
    parsedMessage as FrontendWebsocketMsgUnion;
  switch (m.messageType) {
    case WebsocketMsgTypeForFrontendEnum.AllConnections:
      setWebsocketConnections(m.content);
      updateFrontendWebsocketAffinity({
        connections: m.content,
        currentAddress: lastPathname
          ? buildFrontendAffinityCurrentAddress(lastPathname)
          : null,
        shareSessionId: currentShareSessionId,
        socketGeneration,
      });
      return;
    case WebsocketMsgTypeForFrontendEnum.LLMStreamingResponse:
      return receiveLLMResponseChunk(m.content);
    case WebsocketMsgTypeForFrontendEnum.LSPDiagnostics:
      return processLspDiagnostics(m.content);
    case WebsocketMsgTypeForFrontendEnum.NameValidationErrors:
      return processNameValidationErrors(m.content);
    case WebsocketMsgTypeForFrontendEnum.Notification:
      return addNotificationFromWebsocketMsg(m.content);
    case WebsocketMsgTypeForFrontendEnum.ReturnRenameRefactorResults:
      return handleRenameRefactorBroadcast(m.content);
    case WebsocketMsgTypeForFrontendEnum.TerminalMetadata:
      // TODO
      return null;
    case WebsocketMsgTypeForFrontendEnum.UpdateFrontendProjectState:
      if (useServerMode.getState().mode === "app") {
        return processAppProjectStateUpdateFromBackend(m.content);
      }
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
    case WebsocketMsgTypeForFrontendEnum.UISettingReveal:
      void handleUISettingRevealMessage(m.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.AgentProfilesUpdated:
      return receiveAgentProfilesUpdate(m.content.profiles);
    case WebsocketMsgTypeForFrontendEnum.PromptTemplatesUpdated:
      return receivePromptTemplatesUpdate(m.content.templates);
    case WebsocketMsgTypeForFrontendEnum.ExternalAgentConfigsUpdated:
      return receiveExternalAgentConfigsUpdate(m.content.configs);
    case WebsocketMsgTypeForFrontendEnum.EngineConfigsUpdated:
      return receiveEngineConfigsUpdate(m.content.configs);
    case WebsocketMsgTypeForFrontendEnum.TranscriptionProfilesUpdated:
      return receiveTranscriptionProfilesUpdate(m.content.profiles);
    default:
      return m satisfies never;
  }
}

type FrontendIdentityMessage = {
  messageType: typeof FRONTEND_IDENTITY_MESSAGE_TYPE;
  content: {
    websocketId: string;
  };
};

function isFrontendIdentityMessage(
  message: unknown,
): message is FrontendIdentityMessage {
  if (!isRecord(message)) {
    return false;
  }
  if (message.messageType !== FRONTEND_IDENTITY_MESSAGE_TYPE) {
    return false;
  }
  if (!isRecord(message.content)) {
    return false;
  }
  return (
    typeof message.content.websocketId === "string" &&
    message.content.websocketId.trim() !== ""
  );
}

async function handleUISettingRevealMessage(content: unknown): Promise<void> {
  const fallbackProjectConfigId = getCurrProjectConfigId();
  const projectConfigId = resolveRevealProjectConfigId(
    content,
    fallbackProjectConfigId,
  );
  const requestId = resolveRevealRequestId(content);
  let statuses: Array<{
    settingId: string;
    status: "revealed" | "failed";
    errorCode: string | null;
    errorMessage: string | null;
  }> = [];
  if (!isValidUISettingRevealContent(content)) {
    statuses = buildMalformedRevealStatuses(
      content,
      "Invalid UISettingReveal payload.",
    );
    sendUISettingRevealResult({
      projectConfigId,
      requestId,
      statuses,
    });
    return;
  }
  try {
    const revealStatuses = await receiveUISettingReveal(content);
    statuses = Array.isArray(revealStatuses) ? revealStatuses : [];
  } catch (error) {
    const rawMessage =
      error instanceof Error && error.message.trim() !== ""
        ? error.message
        : String(error);
    const normalizedMessage = `Failed to process UI setting reveal: ${rawMessage}`;
    statuses = content.reveals.map((target) => ({
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: normalizedMessage,
    }));
  }
  sendUISettingRevealResult({
    projectConfigId: content.projectConfigId,
    requestId: content.requestId,
    statuses,
  });
}

function sendUISettingRevealResult({
  projectConfigId,
  requestId,
  statuses,
}: {
  projectConfigId: string;
  requestId: string;
  statuses: Array<{
    settingId: string;
    status: "revealed" | "failed";
    errorCode: string | null;
    errorMessage: string | null;
  }>;
}): void {
  const revealResultMessage: WebsocketMsgUISettingRevealResult = {
    id: null,
    messageType: WebsocketMsgTypeForBackendEnum.UISettingRevealResult,
    content: {
      projectConfigId,
      requestId,
      statuses,
    },
  };
  sendMessage(revealResultMessage);
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
): Array<{
  settingId: string;
  status: "revealed" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
}> {
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

function isValidUISettingRevealContent(
  content: unknown,
): content is UISettingRevealContent {
  if (!isRecord(content)) {
    return false;
  }
  if (
    typeof content.projectConfigId !== "string" ||
    content.projectConfigId.trim() === ""
  ) {
    return false;
  }
  if (
    typeof content.requestId !== "string" ||
    content.requestId.trim() === ""
  ) {
    return false;
  }
  if (content.chatId !== null && typeof content.chatId !== "string") {
    return false;
  }
  if (!Number.isFinite(content.durationMs)) {
    return false;
  }
  if (!Array.isArray(content.reveals)) {
    return false;
  }
  return content.reveals.every((reveal) =>
    isValidUISettingRevealTarget(reveal),
  );
}

function isValidUISettingRevealTarget(reveal: unknown): boolean {
  if (!isRecord(reveal)) {
    return false;
  }
  if (typeof reveal.settingId !== "string" || reveal.settingId.trim() === "") {
    return false;
  }
  if (reveal.side !== "left" && reveal.side !== "right") {
    return false;
  }
  if (
    reveal.overviewTabKey !== null &&
    typeof reveal.overviewTabKey !== "string"
  ) {
    return false;
  }
  if (
    reveal.uiEditorTabName !== null &&
    typeof reveal.uiEditorTabName !== "string"
  ) {
    return false;
  }
  if (reveal.pluginId !== null && typeof reveal.pluginId !== "string") {
    return false;
  }
  if (reveal.paneId !== null && typeof reveal.paneId !== "string") {
    return false;
  }
  if (
    reveal.strategy !== "dom_anchor" &&
    reveal.strategy !== "plugin_handler"
  ) {
    return false;
  }
  if (reveal.anchorId !== null && typeof reveal.anchorId !== "string") {
    return false;
  }
  if (
    reveal.pluginRevealKey !== null &&
    typeof reveal.pluginRevealKey !== "string"
  ) {
    return false;
  }
  if (!Array.isArray(reveal.revealActivationSteps)) {
    return false;
  }
  for (const step of reveal.revealActivationSteps) {
    if (!isRecord(step)) {
      return false;
    }
    if (
      step.type !== "project_ai_settings_accordion_item" &&
      step.type !== "run_instructions_accordion_item"
    ) {
      return false;
    }
    if (typeof step.itemValue !== "string") {
      return false;
    }
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sendCurrentAddress(currentAddress: string) {
  sendMessage(
    createWebsocketMsgCurrentAddressUpdate({ content: currentAddress }),
  );
}

function emitRealtimeDependencyValue(
  dependencyKey: BaseDependencyKeyUnion,
  value: BaseDependencyValueUnion,
  binaryPayload?: ArrayBuffer,
  projectConfigIdOverride?: string | null,
) {
  const projectConfigId = projectConfigIdOverride ?? getCurrProjectConfigId();
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
  if (value.type === DependencyValueTypeEnum.Binary && binaryPayload) {
    sendBinaryMessage(message, binaryPayload);
    return;
  }
  sendMessage(message);
}

type DependencyEventInput = {
  dependencyKey: BaseDependencyKeyUnion;
  payload?: BaseDependencyValueUnion | null;
  binaryPayload?: ArrayBuffer;
  timestampMs?: number;
};

export function sendRealtimeDependencyEvent(
  event: DependencyEventInput,
  projectConfigIdOverride?: string | null,
): void {
  const projectConfigId = projectConfigIdOverride ?? getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  const coverage = getListenerCoverageRecord(projectConfigId);
  if (coverage && !dependencyKeyCovered(projectConfigId, event.dependencyKey)) {
    return;
  }

  const dependencyEvent: DependencyEvent = {
    dependencyKey: event.dependencyKey,
    payload: event.payload ?? null,
    timestampMs: event.timestampMs ?? Date.now(),
  };
  const message: WebsocketMsgRealtimeDependencyEvent = {
    id: null,
    messageType: WebsocketMsgTypeForBackendEnum.RealtimeDependencyEvent,
    content: {
      projectConfigId,
      dependencyEvent,
    },
  };
  if (
    dependencyEvent.payload?.type === DependencyValueTypeEnum.Binary &&
    event.binaryPayload
  ) {
    sendBinaryMessage(message, event.binaryPayload);
    return;
  }
  sendMessage(message);
}

export function sendRealtimeSectionParamLiteral(
  sectionId: string,
  codeObjId: string,
  value: string,
  projectConfigIdOverride?: string | null,
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
  emitRealtimeDependencyValue(
    dependencyKey,
    dependencyValue,
    undefined,
    projectConfigIdOverride,
  );
}

export function sendRealtimeSectionLiteral(
  sectionId: string,
  value: string,
  projectConfigIdOverride?: string | null,
) {
  const dependencyKey: SectionDependencyKey = {
    type: DependencyKeyTypeEnum.Section,
    sectionId,
  };
  const dependencyValue: LiteralDependencyValue = {
    payload: value,
    type: DependencyValueTypeEnum.Literal,
  };
  emitRealtimeDependencyValue(
    dependencyKey,
    dependencyValue,
    undefined,
    projectConfigIdOverride,
  );
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
  emitRealtimeDependencyValue(
    dependencyKey,
    dependencyValue,
    payload,
    projectConfigIdOverride,
  );
}

function sendMessage(message: WebsocketMsg) {
  if (wssReady(wss)) {
    wss.send(JSON.stringify(message));
  }
}

function sendBinaryMessage(message: WebsocketMsg, payload: ArrayBuffer) {
  if (wssReady(wss)) {
    const frame = encodeBinaryFrame(message, payload);
    wss.send(frame);
  }
}

function maybeWarnRealtimeOversize(message: string) {
  const now = Date.now();
  if (
    now - lastRealtimeBinaryOversizeWarningAt <
    REALTIME_BINARY_OVERSIZE_COOLDOWN_MS
  ) {
    return;
  }
  lastRealtimeBinaryOversizeWarningAt = now;
  addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
}

async function uploadRealtimeBinaryPayload(
  payload: ArrayBuffer,
  mimeType: string,
) {
  const blob = new Blob([payload], { type: mimeType });
  const form = new FormData();
  form.append("file", blob, "realtime.bin");
  form.append("durable", "false");
  const res = await route_binary_upload(form);
  if (!res200(res)) {
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
  emitRealtimeDependencyValue(dependencyKey, dependencyValue);
}
