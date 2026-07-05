import {
  backendEndpoints,
  backendProtocolVersion,
  createBackendClient,
  decodeChatEvent,
  decodeSemanticGraphChangeEvent,
  decodeTerminalEvent,
  decodeWorkspaceActivityEvent,
  decodeWorkspaceUIEvent,
  decodeWorkflowEvent,
  type BackendClient,
  type RuntimeInfoResponse,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import type {
  BackendEventStreamStatus,
  BackendProcessStatus,
  RuntimeRegistrySnapshot,
  SettaAPI,
} from "@shared/types";
import {
  detectWebPlatform,
  errorMessage,
  transparentSVGDataURL,
  webDeviceDisplayName,
  webRuntimeVersions,
} from "./setta-web-api-utils";
import {
  cursorFromServerSentEvent,
  cursorFromStreamedEvent,
  startWebBackendEventStream,
  type WebEventStreamOptions,
} from "./web-backend-event-stream";
import { subscribeForWebPush } from "./setta-web-push";

const webDeviceStorageKey = "setta.web.device-session.v1";

interface StoredWebDeviceSession {
  deviceId: string;
  deviceToken: string;
  pairedAt: string;
  protocolVersion: number;
  runtimeId: string;
}

interface ParsedWebPairingURL {
  pairingToken: string;
  runtimeId: string;
}

interface WebEventStreamRegistration {
  start: () => void;
  stop: () => void;
  stopActive: () => void;
}

export function installWebSettaAPIIfNeeded(): void {
  const target = window as Window & { setta?: SettaAPI };
  if (target.setta) {
    return;
  }
  target.setta = createWebSettaAPI();
  installWebPWA(target.setta);
  void completePairingFromLocation(target.setta);
}

export function createWebSettaAPI(options: { fetchImpl?: BackendFetch } = {}): SettaAPI {
  const baseURL = sameOriginBaseURL();
  const rawFetch = options.fetchImpl ?? fetch.bind(window);
  const connectionListeners = new Set<(snapshot: RuntimeRegistrySnapshot) => void>();
  const processStatusListeners = new Set<(status: BackendProcessStatus) => void>();
  const eventStreamStatusListeners = new Set<(status: BackendEventStreamStatus) => void>();
  const eventStreams = new Set<WebEventStreamRegistration>();

  const api: SettaAPI = {
    app: {
      captureRendererRegion: async (request) => ({
        capturedAt: Date.now(),
        height: request.height,
        imageDataUrl: transparentSVGDataURL(request.width, request.height),
        width: request.width,
      }),
      endWindowDrag: async () => {},
      flags: {
        workflowGraphDebug: false,
        workflowGraphSyntheticGraph: null,
      },
      installedEditors: async () => [],
      moveWindowDrag: async () => {},
      openExternalUrl: async (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
      openWorkspaceInEditor: async () => {},
      platform: detectWebPlatform(),
      startWindowDrag: async () => {},
      versions: async () => webRuntimeVersions(),
      workspaceGitInfo: async (rootPath) => ({
        branchName: "",
        commitShort: "",
        worktreeName: "",
        worktreeRoot: rootPath,
      }),
    },
    appearance: {
      presets: () => requireClient().readAppearancePresets(),
      read: () => requireClient().readAppearanceSettings(),
      update: (request) => requireClient().updateAppearanceSettings(request),
    },
    backend: {
      health: () => publicClient().backendHealth(),
      onEventStreamStatus: (listener) => {
        eventStreamStatusListeners.add(listener);
        return () => {
          eventStreamStatusListeners.delete(listener);
        };
      },
      onProcessStatus: (listener) => {
        processStatusListeners.add(listener);
        listener({
          message: "Connected to same-origin Setta runtime",
          mode: "external",
          status: "online",
          url: baseURL,
        });
        return () => {
          processStatusListeners.delete(listener);
        };
      },
    },
    chat: {
      activeRun: (workspaceId, conversationId) =>
        requireClient().getActiveRun({ conversationId, workspaceId }),
      cancelRun: (workspaceId, conversationId) =>
        requireClient().cancelRun({ conversationId, workspaceId }),
      reconcileRuns: (request) => requireClient().reconcileChatRuns(request),
      createConversation: (workspaceId, title) =>
        requireClient().createConversation({ title, workspaceId }),
      deleteConversation: (workspaceId, conversationId) =>
        requireClient().deleteConversation({ conversationId, workspaceId }),
      editQueuedMessage: (workspaceId, conversationId, messageId, input) =>
        requireClient().editQueuedChatMessage({ conversationId, input, messageId, workspaceId }),
      createImageAttachmentFromBytes: (workspaceId, conversationId, fileName, dataBase64) =>
        requireClient().createChatImageAttachmentFromBytes({
          conversationId,
          dataBase64,
          fileName,
          workspaceId,
        }),
      selectImageAttachments: async () => [],
      executeCommand: (workspaceId, conversationId, raw, commandOptions) =>
        requireClient().executeChatCommand({
          confirmGoalReplacement: commandOptions?.confirmGoalReplacement ?? false,
          conversationId,
          raw,
          workspaceId,
        }),
      readCodexDefaults: () => requireClient().readChatCodexDefaults(),
      openCodexModelPicker: (workspaceId, conversationId) =>
        requireClient().openChatCodexModelPicker({ conversationId, workspaceId }),
      openCodexPermissionPicker: (workspaceId, conversationId) =>
        requireClient().openChatCodexPermissionPicker({ conversationId, workspaceId }),
      listCommands: (workspaceId, conversationId) =>
        requireClient().listChatCommands({ conversationId, workspaceId }),
      listConversations: (workspaceId) => requireClient().listConversations({ workspaceId }),
      markConversationRead: (workspaceId, conversationId) =>
        requireClient().markConversationRead({ conversationId, workspaceId }),
      messagePage: (workspaceId, conversationId, beforeBlockOrdinal, limit) =>
        requireClient().getMessagePage({ beforeBlockOrdinal, conversationId, limit, workspaceId }),
      listComposerPromptHistory: (workspaceId, conversationId, beforeOrdinal, limit) =>
        requireClient().listComposerPromptHistory({
          beforeOrdinal,
          conversationId,
          limit,
          workspaceId,
        }),
      onEvent: (listener) =>
        subscribeWebBackendEventStream({
          baseURL,
          cursorForEvent: cursorFromStreamedEvent,
          decode: decodeChatEvent,
          endpoint: backendEndpoints.EventStream,
          fetchImpl: rawFetch,
          lifecycle: (status) => {
            for (const statusListener of eventStreamStatusListeners) {
              statusListener(status);
            }
          },
          sendEvent: listener,
          streamName: "backend event stream",
        }),
      queueMessage: (workspaceId, conversationId, input) =>
        requireClient().queueChatMessage({ conversationId, input, workspaceId }),
      removeQueuedMessage: (workspaceId, conversationId, messageId) =>
        requireClient().removeQueuedChatMessage({ conversationId, messageId, workspaceId }),
      runActivity: (workspaceId, runId, afterItemId, limit) =>
        requireClient().getRunActivity({ afterItemId, limit, runId, workspaceId }),
      runItemOutput: (workspaceId, runId, runItemId, afterOrdinal, limit) =>
        requireClient().getRunItemOutputPage({
          afterOrdinal,
          limit,
          runId,
          runItemId,
          workspaceId,
        }),
      listBackgroundTerminals: (workspaceId, conversationId) =>
        requireClient().listBackgroundTerminals({ conversationId, workspaceId }),
      getBackgroundTerminalOutput: (workspaceId, conversationId, processId, afterOrdinal, limit) =>
        requireClient().getBackgroundTerminalOutput({
          afterOrdinal,
          conversationId,
          limit,
          processId,
          workspaceId,
        }),
      killBackgroundTerminal: (workspaceId, conversationId, processId) =>
        requireClient().killBackgroundTerminal({ conversationId, processId, workspaceId }),
      killAllBackgroundTerminals: (workspaceId, conversationId) =>
        requireClient().killAllBackgroundTerminals({ conversationId, workspaceId }),
      sendMessage: (workspaceId, conversationId, input) =>
        requireClient().sendChatMessage({ conversationId, input, workspaceId }),
      sendSteeringImmediately: (workspaceId, conversationId, input) =>
        requireClient().sendSteeringImmediately({
          conversationId,
          input: input ?? null,
          workspaceId,
        }),
      setCodexModel: (workspaceId, conversationId, modelId) =>
        requireClient().setChatCodexModel({ conversationId, modelId, workspaceId }),
      setCodexPermissionPreset: (workspaceId, conversationId, preset, confirmed) =>
        requireClient().setChatCodexPermissionPreset({
          confirmed,
          conversationId,
          preset,
          workspaceId,
        }),
      setCodexReasoningEffort: (workspaceId, conversationId, effort) =>
        requireClient().setChatCodexReasoningEffort({
          conversationId,
          reasoningEffort: effort,
          workspaceId,
        }),
      updateCodexDefaults: (request) => requireClient().updateChatCodexDefaults(request),
      setConversationPinned: (workspaceId, conversationId, pinned) =>
        requireClient().setConversationPinned({ conversationId, pinned, workspaceId }),
      steerMessage: (workspaceId, conversationId, input) =>
        requireClient().steerChatMessage({ conversationId, input, workspaceId }),
      submitApproval: (input) => requireClient().submitApproval(input),
    },
    codexAccount: {
      cancelLogin: (request) => requireClient().cancelCodexLogin(request),
      logout: (request) => requireClient().logoutCodexAccount(request),
      read: () => requireClient().readCodexAccount(),
      refresh: (request) => requireClient().refreshCodexAccount(request),
      startLogin: (request) => requireClient().startCodexLogin(request),
    },
    runtimes: {
      addByPairingUrl: async (pairingUrl) => {
        const parsed = parseWebPairingURL(pairingUrl);
        const info = await publicClient().runtimeInfo();
        if (info.runtimeId !== parsed.runtimeId) {
          throw new Error(
            `pairing URL runtime_id ${parsed.runtimeId} does not match this runtime ${info.runtimeId}`,
          );
        }
        const paired = await publicClient().completePairing({
          clientDisplayName: webDeviceDisplayName(),
          pairingToken: parsed.pairingToken,
        });
        if (paired.runtimeId !== info.runtimeId) {
          throw new Error(
            `pairing response runtime_id ${paired.runtimeId} does not match this runtime ${info.runtimeId}`,
          );
        }
        saveStoredDeviceSession({
          deviceId: paired.deviceId,
          deviceToken: paired.deviceToken,
          pairedAt: new Date().toISOString(),
          protocolVersion: paired.protocolVersion,
          runtimeId: paired.runtimeId,
        });
        const snapshot = await runtimeSnapshot("connected after pairing", info);
        startInactiveEventStreams();
        emitConnectionSnapshot(snapshot);
        await subscribeForWebPush(info, requireClient(), true);
        return snapshot;
      },
      current: async () => {
        const snapshot = await runtimeSnapshot("loaded current web runtime");
        emitConnectionSnapshot(snapshot);
        return snapshot;
      },
      list: async () => {
        const snapshot = await runtimeSnapshot("listed web runtime");
        return snapshot.runtimes;
      },
      onConnectionState: (listener) => {
        connectionListeners.add(listener);
        return () => {
          connectionListeners.delete(listener);
        };
      },
      remove: async (runtimeId) => {
        const stored = loadStoredDeviceSession();
        if (stored && stored.runtimeId === runtimeId) {
          localStorage.removeItem(webDeviceStorageKey);
          stopActiveEventStreams();
        }
        const snapshot = await runtimeSnapshot("removed web runtime credentials");
        emitConnectionSnapshot(snapshot);
        return snapshot;
      },
      switch: async () => runtimeSnapshot("same-origin web runtime is already active"),
    },
    semanticGraph: {
      acceptCartographerPatch: (request) => requireClient().acceptCartographerPatch(request),
      attachChatMessage: (request) => requireClient().attachSemanticNodeToChatMessage(request),
      attachChatRun: (request) => requireClient().attachSemanticNodeToChatRun(request),
      attachFileRange: (request) => requireClient().attachSemanticNodeToFileRange(request),
      attachRunItem: (request) => requireClient().attachSemanticNodeToRunItem(request),
      attachWorkflowExecution: (request) =>
        requireClient().attachSemanticNodeToWorkflowExecution(request),
      attachWorkflowNode: (request) => requireClient().attachSemanticNodeToWorkflowNode(request),
      buildCartographerWindow: (request) => requireClient().buildCartographerWindow(request),
      createEdge: (request) => requireClient().createSemanticEdge(request),
      createNode: (request) => requireClient().createSemanticNode(request),
      createSteeringDirective: (request) =>
        requireClient().createSemanticSteeringDirective(request),
      dismissNode: (request) => requireClient().dismissSemanticNode(request),
      endActivity: (request) => requireClient().endSemanticActivity(request),
      listActivity: (request) => requireClient().listSemanticActivity(request),
      listActivityPage: (request) => requireClient().listSemanticActivityPage(request),
      listCartographerCursors: (request) => requireClient().listCartographerCursors(request),
      listCartographerPatches: (request) => requireClient().listCartographerPatches(request),
      listCartographerRuns: (request) => requireClient().listCartographerRuns(request),
      listCartographerWindows: (request) => requireClient().listCartographerWindows(request),
      listContextPacks: (request) => requireClient().listSemanticContextPacks(request),
      listEvidence: (request) => requireClient().listSemanticEvidence(request),
      mergeNodes: (request) => requireClient().mergeSemanticNodes(request),
      onEvent: (listener) =>
        subscribeWebBackendEventStream({
          baseURL,
          cursorForEvent: cursorFromStreamedEvent,
          decode: decodeSemanticGraphChangeEvent,
          endpoint: backendEndpoints.SemanticGraphChangeEventStream,
          fetchImpl: rawFetch,
          sendEvent: listener,
          streamName: "semantic graph event stream",
        }),
      processCartographerWindow: (request) => requireClient().processCartographerWindow(request),
      promoteNode: (request) => requireClient().promoteSemanticNode(request),
      read: (request) => requireClient().readSemanticGraph(request),
      readActivitySummary: (request) => requireClient().readSemanticActivitySummary(request),
      readCartographerProcessingState: (request) =>
        requireClient().readCartographerProcessingState(request),
      readCartographerRun: (request) => requireClient().readCartographerRun(request),
      readContextPack: (request) => requireClient().readSemanticContextPack(request),
      readEventHistory: (request) => requireClient().readSemanticEventHistory(request),
      readNodeDetail: (request) => requireClient().readSemanticNodeDetail(request),
      readSteeringState: (request) => requireClient().readSemanticSteeringState(request),
      rejectCartographerPatch: (request) => requireClient().rejectCartographerPatch(request),
      removeEdge: (request) => requireClient().removeSemanticEdge(request),
      renameNode: (request) => requireClient().renameSemanticNode(request),
      splitNode: (request) => requireClient().splitSemanticNode(request),
      updateEdge: (request) => requireClient().updateSemanticEdge(request),
      updateLayoutPositions: (request) => requireClient().updateSemanticLayoutPositions(request),
      updateNode: (request) => requireClient().updateSemanticNode(request),
      updateSteeringDirective: (request) =>
        requireClient().updateSemanticSteeringDirective(request),
    },
    terminal: {
      attach: (workspaceId, paneId) => requireClient().attachTerminal({ paneId, workspaceId }),
      close: (request) => requireClient().closeTerminal(request),
      create: (workspaceId, paneId, options) =>
        requireClient().createTerminal({
          cols: options.cols,
          cwd: options.cwd ?? "",
          paneId,
          profileId: options.profileId ?? "",
          rows: options.rows,
          workspaceId,
        }),
      createProfile: (request) => requireClient().createTerminalProfile(request),
      deleteProfile: (request) => requireClient().deleteTerminalProfile(request),
      input: (input) => requireClient().terminalInput(input),
      listProfiles: () => requireClient().listTerminalProfiles(),
      onEvent: (listener) =>
        subscribeWebBackendEventStream({
          baseURL,
          cursorForEvent: cursorFromStreamedEvent,
          decode: decodeTerminalEvent,
          endpoint: backendEndpoints.TerminalEventStream,
          fetchImpl: rawFetch,
          sendEvent: listener,
          streamName: "terminal event stream",
        }),
      resize: (request) => requireClient().resizeTerminal(request),
      selectDefaultProfile: (request) => requireClient().selectDefaultTerminalProfile(request),
      updateProfile: (request) => requireClient().updateTerminalProfile(request),
    },
    workflow: {
      cancelExecution: (workspaceId, executionId) =>
        requireClient().cancelWorkflowExecution({ executionId, workspaceId }),
      createDefinition: (workspaceId, name, description, graph) =>
        requireClient().createWorkflowDefinition({ description, graph, name, workspaceId }),
      deleteDefinition: (workspaceId, definitionId) =>
        requireClient().deleteWorkflowDefinition({ definitionId, workspaceId }),
      executionEvents: (workspaceId, executionId, beforeOrdinal, limit) =>
        requireClient().getWorkflowExecutionEvents({
          beforeOrdinal,
          executionId,
          limit,
          workspaceId,
        }),
      graphProjection: (workspaceId, definitionId = "", versionId = "", executionId = "") =>
        requireClient().readWorkflowGraphProjection({
          definitionId,
          executionId,
          versionId,
          workspaceId,
        }),
      listDefinitions: (workspaceId) => requireClient().listWorkflowDefinitions({ workspaceId }),
      listExecutions: (workspaceId, definitionId, limit) =>
        requireClient().listWorkflowExecutions({ definitionId, limit, workspaceId }),
      onEvent: (listener) =>
        subscribeWebBackendEventStream({
          baseURL,
          cursorForEvent: (_event, message) =>
            cursorFromServerSentEvent(message, "workflow event stream"),
          decode: decodeWorkflowEvent,
          endpoint: backendEndpoints.WorkflowEventStream,
          fetchImpl: rawFetch,
          sendEvent: listener,
          streamName: "workflow event stream",
        }),
      readDefinition: (workspaceId, definitionId) =>
        requireClient().readWorkflowDefinition({ definitionId, workspaceId }),
      readExecution: (workspaceId, executionId) =>
        requireClient().readWorkflowExecution({ executionId, workspaceId }),
      readNodeTrajectory: (request) => requireClient().readWorkflowNodeTrajectory(request),
      retryNodeRunLiveness: (request) => requireClient().retryWorkflowNodeRunLiveness(request),
      startExecution: (workspaceId, definitionId, versionId = "") =>
        requireClient().startWorkflowExecution({ definitionId, versionId, workspaceId }),
      steerNodeRun: (request) => requireClient().steerWorkflowNodeRun(request),
      stopNodeRun: (request) => requireClient().stopWorkflowNodeRun(request),
      submitApproval: (request) => requireClient().submitWorkflowApproval(request),
      updateDefinition: (workspaceId, definitionId, name, description, graph) =>
        requireClient().updateWorkflowDefinition({
          definitionId,
          description,
          graph,
          name,
          workspaceId,
        }),
      validateDefinition: (workspaceId, graph) =>
        requireClient().validateWorkflowDefinition({ graph, workspaceId }),
    },
    workspace: {
      close: (id) => requireClient().closeWorkspace({ id }),
      listUIPanes: (workspaceId) => requireClient().listWorkspaceUIPanes({ workspaceId }),
      onUIEvent: (workspaceId, listener) =>
        subscribeWebBackendEventStream({
          baseURL,
          cursorForEvent: (_event, message) =>
            cursorFromServerSentEvent(message, "workspace UI event stream"),
          decode: decodeWorkspaceUIEvent,
          endpoint: backendEndpoints.WorkspaceUIEventStream,
          fetchImpl: rawFetch,
          query: { workspaceId: requireWorkspaceID(workspaceId) },
          sendEvent: listener,
          streamName: "workspace UI event stream",
        }),
      openLocalFolder: async () => {
        const rootPath = window.prompt("Workspace path")?.trim() ?? "";
        if (rootPath === "") {
          return null;
        }
        return requireClient().openWorkspace({ rootPath });
      },
      openPath: (rootPath) => requireClient().openWorkspace({ rootPath }),
      readUIPane: (workspaceId, paneId) =>
        requireClient().readWorkspaceUIPane({ paneId, workspaceId }),
      readUISchema: () => requireClient().readWorkspaceUISchema(),
      readUILayout: (workspaceId) => requireClient().readWorkspaceUILayout({ workspaceId }),
      removeRecent: (id) => requireClient().removeRecentWorkspace({ id }),
      reorder: (ids) => requireClient().reorderWorkspace({ ids }),
      saveUILayout: (layout) => requireClient().saveWorkspaceUILayout({ layout }),
      select: (id) => requireClient().selectWorkspace({ id }),
      selectedConversations: () => requireClient().workspaceSelectedConversations(),
      session: () => requireClient().workspaceSession(),
      setSelectedConversation: (workspaceId, conversationId) =>
        requireClient().setWorkspaceSelectedConversation({ conversationId, workspaceId }),
    },
    workspaceActivity: {
      executionSnapshot: async (workspaceId, executionId, limit) => {
        const response = await requireClient().readWorkflowExecutionActivity({
          executionId,
          limit,
          workspaceId,
        });
        return response.snapshot;
      },
      onEvent: (listener) =>
        subscribeWebBackendEventStream({
          baseURL,
          cursorForEvent: cursorFromStreamedEvent,
          decode: decodeWorkspaceActivityEvent,
          endpoint: backendEndpoints.WorkspaceActivityEventStream,
          fetchImpl: rawFetch,
          sendEvent: listener,
          streamName: "workspace activity event stream",
        }),
      snapshot: async (workspaceId, limit) => {
        const response = await requireClient().readWorkspaceActivitySnapshot({
          limit,
          workspaceId,
        });
        return response.snapshot;
      },
    },
  };

  function publicClient(): BackendClient {
    return createBackendClient(baseURL, rawFetch);
  }

  function requireClient(): BackendClient {
    const stored = loadStoredDeviceSession();
    if (!stored) {
      throw new Error("Pair this browser with the runtime before using Setta.");
    }
    return createBackendClient(
      baseURL,
      authenticatedWebFetch(
        rawFetch,
        () => stored.deviceToken,
        () => {
          localStorage.removeItem(webDeviceStorageKey);
          stopActiveEventStreams();
          void runtimeSnapshot("runtime access was revoked").then(emitConnectionSnapshot);
        },
      ),
    );
  }

  async function runtimeSnapshot(
    message: string,
    knownInfo?: RuntimeInfoResponse,
  ): Promise<RuntimeRegistrySnapshot> {
    const now = new Date().toISOString();
    let info: RuntimeInfoResponse;
    try {
      info = knownInfo ?? (await publicClient().runtimeInfo());
    } catch (error) {
      return {
        activeRuntimeId: null,
        connection: {
          message: errorMessage(error),
          protocolVersion: null,
          runtimeId: null,
          status: "unreachable",
          updatedAt: now,
        },
        runtimes: [],
        switching: false,
      };
    }
    const stored = loadStoredDeviceSession();
    if (!stored || stored.runtimeId !== info.runtimeId) {
      stopActiveEventStreams();
      return runtimeSnapshotForInfo(
        info,
        stored ? "revoked" : "disconnected",
        stored
          ? "Stored web pairing no longer matches this runtime."
          : "Pair this browser with the runtime.",
        now,
      );
    }
    if (info.protocolVersion !== backendProtocolVersion) {
      return runtimeSnapshotForInfo(
        info,
        "incompatible",
        `runtime protocol ${info.protocolVersion} is not supported by this web client`,
        now,
      );
    }
    try {
      await requireClient().listDevices({});
    } catch (error) {
      localStorage.removeItem(webDeviceStorageKey);
      stopActiveEventStreams();
      return runtimeSnapshotForInfo(info, "revoked", errorMessage(error), now);
    }
    void subscribeForWebPush(info, requireClient(), false);
    return runtimeSnapshotForInfo(info, "connected", message, now);
  }

  function runtimeSnapshotForInfo(
    info: RuntimeInfoResponse,
    status: RuntimeRegistrySnapshot["connection"]["status"],
    message: string,
    updatedAt: string,
  ): RuntimeRegistrySnapshot {
    return {
      activeRuntimeId: info.runtimeId,
      connection: {
        message,
        protocolVersion: info.protocolVersion,
        runtimeId: info.runtimeId,
        status,
        updatedAt,
      },
      runtimes: [
        {
          active: true,
          baseUrl: baseURL,
          connectionMessage: message,
          connectionStatus: status,
          displayName: info.displayName,
          infrastructureProvider: info.infrastructureProvider,
          isLocal: false,
          lastConnected: status === "connected" ? updatedAt : null,
          runtimeId: info.runtimeId,
        },
      ],
      switching: false,
    };
  }

  function emitConnectionSnapshot(snapshot: RuntimeRegistrySnapshot) {
    for (const listener of connectionListeners) {
      listener(snapshot);
    }
  }

  function subscribeWebBackendEventStream<T>(options: WebEventStreamOptions<T>): () => void {
    let unsubscribeActive: (() => void) | null = null;
    const registration: WebEventStreamRegistration = {
      start: () => {
        if (unsubscribeActive) {
          return;
        }
        const stored = loadStoredDeviceSession();
        if (!stored) {
          options.lifecycle?.({
            message: "Pair this browser with the runtime before opening event streams.",
            status: "stopped",
          });
          return;
        }
        unsubscribeActive = startWebBackendEventStream({
          ...options,
          authToken: stored.deviceToken,
        });
      },
      stop: () => {
        registration.stopActive();
        eventStreams.delete(registration);
      },
      stopActive: () => {
        if (!unsubscribeActive) {
          return;
        }
        unsubscribeActive();
        unsubscribeActive = null;
      },
    };
    eventStreams.add(registration);
    registration.start();
    return registration.stop;
  }

  function startInactiveEventStreams() {
    for (const registration of eventStreams) {
      registration.start();
    }
  }

  function stopActiveEventStreams() {
    for (const registration of eventStreams) {
      registration.stopActive();
    }
  }

  return api;
}

export function authenticatedWebFetch(
  fetchImpl: BackendFetch,
  token: () => string,
  onUnauthorized: () => void,
): BackendFetch {
  return async (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token()}`);
    const response = await fetchImpl(input, { ...init, headers });
    if (response.status === 401) {
      onUnauthorized();
    }
    return response;
  };
}

function requireWorkspaceID(workspaceId: string): string {
  if (workspaceId === "") {
    throw new Error("workspace UI event subscription requires workspaceId");
  }
  return workspaceId;
}

function parseWebPairingURL(rawURL: string): ParsedWebPairingURL {
  let parsed: URL;
  try {
    parsed = new URL(rawURL);
  } catch (error) {
    throw new Error(errorMessage(error), { cause: error });
  }
  if (parsed.protocol !== "setta:" || parsed.hostname !== "pair") {
    throw new Error("pairing URL must start with setta://pair");
  }
  return {
    pairingToken: requiredPairingParam(parsed, "tok"),
    runtimeId: requiredPairingParam(parsed, "rt"),
  };
}

function requiredPairingParam(parsed: URL, name: string): string {
  const value = parsed.searchParams.get(name);
  if (value === null || value === "") {
    throw new Error(`pairing URL is missing ${name}`);
  }
  return value;
}

function sameOriginBaseURL(): string {
  const url = new URL(window.location.origin);
  url.pathname = "/";
  return url.toString();
}

function saveStoredDeviceSession(session: StoredWebDeviceSession) {
  localStorage.setItem(webDeviceStorageKey, JSON.stringify(session));
}

function loadStoredDeviceSession(): StoredWebDeviceSession | null {
  const raw = localStorage.getItem(webDeviceStorageKey);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredWebDeviceSession(parsed)) {
      localStorage.removeItem(webDeviceStorageKey);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(webDeviceStorageKey);
    return null;
  }
}

function isStoredWebDeviceSession(value: unknown): value is StoredWebDeviceSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<Record<keyof StoredWebDeviceSession, unknown>>;
  return (
    typeof record.deviceId === "string" &&
    typeof record.deviceToken === "string" &&
    typeof record.pairedAt === "string" &&
    typeof record.protocolVersion === "number" &&
    typeof record.runtimeId === "string"
  );
}

function installWebPWA(api: SettaAPI) {
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js");
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    (window as Window & { __settaInstallPrompt?: Event }).__settaInstallPrompt = event;
    window.dispatchEvent(new CustomEvent("setta:pwa-install-available"));
  });
  void api.runtimes.current().then(async (snapshot) => {
    if (snapshot.connection.status === "connected") {
      const info = await createBackendClient(sameOriginBaseURL(), fetch.bind(window)).runtimeInfo();
      await subscribeForWebPush(
        info,
        createBackendClient(
          sameOriginBaseURL(),
          authenticatedWebFetch(
            fetch.bind(window),
            () => loadStoredDeviceSession()?.deviceToken ?? "",
            () => {},
          ),
        ),
        false,
      );
    }
  });
}

async function completePairingFromLocation(api: SettaAPI) {
  const url = new URL(window.location.href);
  const pairingUrl = url.searchParams.get("pair");
  if (!pairingUrl) {
    await applyNotificationNavigation(url, api);
    return;
  }
  await api.runtimes.addByPairingUrl(pairingUrl);
  url.searchParams.delete("pair");
  window.history.replaceState({}, "", url);
}

async function applyNotificationNavigation(url: URL, api: SettaAPI) {
  const workspaceId = url.searchParams.get("workspaceId");
  const conversationId = url.searchParams.get("conversationId");
  if (!workspaceId || !conversationId) {
    return;
  }
  try {
    await api.workspace.setSelectedConversation(workspaceId, conversationId);
  } finally {
    url.searchParams.delete("workspaceId");
    url.searchParams.delete("conversationId");
    url.searchParams.delete("runId");
    url.searchParams.delete("approvalId");
    window.history.replaceState({}, "", url);
  }
}
