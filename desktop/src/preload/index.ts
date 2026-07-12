import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import {
  decodeChatEvent,
  decodeConversationEvent,
  decodeSemanticGraphChangeEvent,
  decodeTerminalEvent,
  decodeWorkspaceActivityEvent,
  decodeWorkflowEvent,
} from "@generated/backend";
import { createRendererIpcInvoke, ipcEvents, ipcMessages } from "@shared/ipc";
import type {
  BackendEventStreamStatus,
  BackendProcessStatus,
  DesktopPlatform,
  KnownRuntimeView,
  RuntimeConnectionState,
  RuntimeConnectionStatus,
  RuntimeRegistrySnapshot,
  WorkspaceBrowserViewKeyEvent,
  WorkspaceBrowserViewSnapshot,
  SettaAPI,
} from "@shared/types";
import { installRendererRecorder } from "./renderer-recorder";

const invoke = createRendererIpcInvoke(ipcRenderer);
const appFlags = {
  workflowGraphDebug:
    process.env.SETTA_E2E === "1" || process.env.SETTA_WORKFLOW_GRAPH_DEBUG === "1",
  workflowGraphSyntheticGraph: parseWorkflowGraphSyntheticGraph(process.env),
};
const workspaceBrowserViewKeys = new Set<string>([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "Delete",
  "Enter",
  "b",
  "c",
  "g",
  "n",
  "o",
  "s",
  "t",
  "v",
] satisfies WorkspaceBrowserViewKeyEvent["key"][]);

const api: SettaAPI = {
  app: {
    flags: appFlags,
    installedEditors: () => invoke("appInstalledEditors"),
    captureRendererRegion: (request) => invoke("appCaptureRendererRegion", request),
    endWindowDrag: () => invoke("appWindowDragEnd"),
    moveWindowDrag: (point) => invoke("appWindowDragMove", point),
    openWorkspaceInEditor: (editorId: string, rootPath: string) =>
      invoke("appOpenWorkspaceInEditor", editorId, rootPath),
    openExternalUrl: (url: string) => invoke("appOpenExternalUrl", url),
    platform: process.platform as DesktopPlatform,
    startWindowDrag: (point) => invoke("appWindowDragStart", point),
    versions: () => invoke("appVersions"),
    workspaceGitInfo: (rootPath: string) => invoke("appWorkspaceGitInfo", rootPath),
  },
  backend: {
    health: () => invoke("backendHealth"),
    onEventStreamStatus: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeBackendEventStreamStatus(payload));
      };
      ipcRenderer.on(ipcEvents.backendEventStreamStatus, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.backendEventStreamStatus, handler);
      };
    },
    onProcessStatus: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeBackendProcessStatus(payload));
      };
      ipcRenderer.on(ipcEvents.backendProcessStatus, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.backendProcessStatus, handler);
      };
    },
  },
  runtimes: {
    addByPairingUrl: (pairingUrl) => invoke("runtimeAddByPairingUrl", pairingUrl),
    current: () => invoke("runtimeCurrent"),
    list: () => invoke("runtimeList"),
    onConnectionState: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeRuntimeRegistrySnapshot(payload));
      };
      ipcRenderer.on(ipcEvents.runtimeConnectionState, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.runtimeConnectionState, handler);
      };
    },
    remove: (runtimeId) => invoke("runtimeRemove", runtimeId),
    switch: (runtimeId) => invoke("runtimeSwitch", runtimeId),
  },
  workspaceActivity: {
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeWorkspaceActivityEvent(payload));
      };
      ipcRenderer.on(ipcEvents.workspaceActivityEvent, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.workspaceActivityEvent, handler);
      };
    },
    snapshot: async (workspaceId, limit) => {
      const response = await invoke("workspaceActivitySnapshot", workspaceId, limit);
      return response.snapshot;
    },
    executionSnapshot: async (workspaceId, executionId, limit) => {
      const response = await invoke(
        "workspaceActivityExecutionSnapshot",
        workspaceId,
        executionId,
        limit,
      );
      return response.snapshot;
    },
  },
  conversations: {
    askStatus: (request) => invoke("conversationAskNarratorStatus", request),
    create: (request) => invoke("conversationCreateTopic", request),
    list: (request) => invoke("conversationListTopicConversations", request),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeConversationEvent(payload));
      };
      ipcRenderer.on(ipcEvents.conversationEvent, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.conversationEvent, handler);
      };
    },
    queue: (request) => invoke("conversationQueueTurn", request),
    read: (request) => invoke("conversationReadSnapshot", request),
    release: (request) => invoke("conversationReleaseEvents", request),
    send: (request) => invoke("conversationSendTurn", request),
    steer: (request) => invoke("conversationSteerTurn", request),
    stop: (request) => invoke("conversationStopTurn", request),
    submitInput: (request) => invoke("conversationSubmitInput", request),
    submitApproval: (request) => invoke("conversationSubmitApproval", request),
    subscribe: (request) => invoke("conversationSubscribeEvents", request),
  },
  master: {
    submitInput: (request) => invoke("masterSubmitInput", request),
  },
  speech: {
    createTranscriptionSession: () => invoke("speechCreateTranscriptionSession"),
    readCapabilities: () => invoke("speechReadCapabilities"),
    readMasterVoiceSelection: () => invoke("speechReadMasterVoiceSelection"),
  },
  appearance: {
    presets: () => invoke("appearancePresets"),
    read: () => invoke("appearanceRead"),
    update: (request) => invoke("appearanceUpdate", request),
  },
  workspaceNativeViews: {
    batchBrowserViewUpdates: (batch) => {
      ipcRenderer.send(ipcMessages.workspaceBrowserViewBatch, batch);
    },
    onBrowserViewKey: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeWorkspaceBrowserViewKeyEvent(payload));
      };
      ipcRenderer.on(ipcEvents.workspaceBrowserViewKey, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.workspaceBrowserViewKey, handler);
      };
    },
    onBrowserViewSnapshot: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeWorkspaceBrowserViewSnapshot(payload));
      };
      ipcRenderer.on(ipcEvents.workspaceBrowserViewSnapshot, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.workspaceBrowserViewSnapshot, handler);
      };
    },
    readBrowserViewStats: () => invoke("workspaceBrowserViewStats"),
    teardownBrowserViews: (workspaceId: string) =>
      invoke("workspaceBrowserViewsTeardown", workspaceId),
  },
  terminal: {
    attach: (workspaceId: string, paneId: string) => invoke("terminalAttach", workspaceId, paneId),
    close: (request) => invoke("terminalClose", request),
    createProfile: (request) => invoke("terminalCreateProfile", request),
    create: (workspaceId, paneId, options) =>
      invoke(
        "terminalCreate",
        workspaceId,
        paneId,
        options.profileId ?? "",
        options.cwd ?? "",
        options.cols,
        options.rows,
      ),
    deleteProfile: (request) => invoke("terminalDeleteProfile", request),
    input: (input) => invoke("terminalInput", input),
    listProfiles: () => invoke("terminalListProfiles"),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeTerminalEvent(payload));
      };
      ipcRenderer.on(ipcEvents.terminalEvent, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.terminalEvent, handler);
      };
    },
    resize: (request) => invoke("terminalResize", request),
    selectDefaultProfile: (request) => invoke("terminalSelectDefaultProfile", request),
    updateProfile: (request) => invoke("terminalUpdateProfile", request),
  },
  chat: {
    activeRun: (workspaceId: string, conversationId: string) =>
      invoke("chatActiveRun", workspaceId, conversationId),
    cancelRun: (workspaceId: string, conversationId: string) =>
      invoke("chatCancelRun", workspaceId, conversationId),
    reconcileRuns: (request) => invoke("chatReconcileRuns", request),
    createConversation: (workspaceId: string, title: string) =>
      invoke("chatCreateConversation", workspaceId, title),
    deleteConversation: (workspaceId: string, conversationId: string) =>
      invoke("chatDeleteConversation", workspaceId, conversationId),
    editQueuedMessage: (workspaceId: string, conversationId: string, messageId: string, input) =>
      invoke("chatEditQueuedMessage", workspaceId, conversationId, messageId, input),
    createImageAttachmentFromBytes: (
      workspaceId: string,
      conversationId: string,
      fileName: string,
      dataBase64: string,
    ) =>
      invoke(
        "chatCreateImageAttachmentFromBytes",
        workspaceId,
        conversationId,
        fileName,
        dataBase64,
      ),
    selectImageAttachments: (workspaceId: string, conversationId: string, maxCount: number) =>
      invoke("chatSelectImageAttachments", workspaceId, conversationId, maxCount),
    executeCommand: (workspaceId: string, conversationId: string, raw: string, options) =>
      invoke(
        "chatExecuteCommand",
        workspaceId,
        conversationId,
        raw,
        options?.confirmGoalReplacement ?? false,
      ),
    readCodexDefaults: () => invoke("chatReadCodexDefaults"),
    openCodexModelPicker: (workspaceId: string, conversationId: string) =>
      invoke("chatOpenCodexModelPicker", workspaceId, conversationId),
    openCodexPermissionPicker: (workspaceId: string, conversationId: string) =>
      invoke("chatOpenCodexPermissionPicker", workspaceId, conversationId),
    setCodexModel: (workspaceId: string, conversationId: string, modelId: string) =>
      invoke("chatSetCodexModel", workspaceId, conversationId, modelId),
    setCodexPermissionPreset: (workspaceId: string, conversationId: string, preset, confirmed) =>
      invoke("chatSetCodexPermissionPreset", workspaceId, conversationId, preset, confirmed),
    setCodexReasoningEffort: (workspaceId: string, conversationId: string, effort) =>
      invoke("chatSetCodexReasoningEffort", workspaceId, conversationId, effort),
    updateCodexDefaults: (request) => invoke("chatUpdateCodexDefaults", request),
    setConversationPinned: (workspaceId: string, conversationId: string, pinned: boolean) =>
      invoke("chatSetConversationPinned", workspaceId, conversationId, pinned),
    listCommands: (workspaceId: string, conversationId: string) =>
      invoke("chatListCommands", workspaceId, conversationId),
    listConversations: (workspaceId: string) => invoke("chatListConversations", workspaceId),
    markConversationRead: (workspaceId: string, conversationId: string) =>
      invoke("chatMarkConversationRead", workspaceId, conversationId),
    messagePage: (
      workspaceId: string,
      conversationId: string,
      beforeBlockOrdinal: number,
      limit: number,
    ) => invoke("chatMessagePage", workspaceId, conversationId, beforeBlockOrdinal, limit),
    listComposerPromptHistory: (
      workspaceId: string,
      conversationId: string,
      beforeOrdinal: number,
      limit: number,
    ) => invoke("chatListComposerPromptHistory", workspaceId, conversationId, beforeOrdinal, limit),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeChatEvent(payload));
      };
      ipcRenderer.on(ipcEvents.chatEvent, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.chatEvent, handler);
      };
    },
    queueMessage: (workspaceId: string, conversationId: string, input) =>
      invoke("chatQueueMessage", workspaceId, conversationId, input),
    removeQueuedMessage: (workspaceId: string, conversationId: string, messageId: string) =>
      invoke("chatRemoveQueuedMessage", workspaceId, conversationId, messageId),
    runActivity: (workspaceId: string, runId: string, afterItemId: string, limit: number) =>
      invoke("chatRunActivity", workspaceId, runId, afterItemId, limit),
    runItemOutput: (
      workspaceId: string,
      runId: string,
      runItemId: string,
      afterOrdinal: number,
      limit: number,
    ) => invoke("chatRunItemOutput", workspaceId, runId, runItemId, afterOrdinal, limit),
    listBackgroundTerminals: (workspaceId: string, conversationId: string) =>
      invoke("chatListBackgroundTerminals", workspaceId, conversationId),
    getBackgroundTerminalOutput: (
      workspaceId: string,
      conversationId: string,
      processId: string,
      afterOrdinal: number,
      limit: number,
    ) =>
      invoke(
        "chatGetBackgroundTerminalOutput",
        workspaceId,
        conversationId,
        processId,
        afterOrdinal,
        limit,
      ),
    killBackgroundTerminal: (workspaceId: string, conversationId: string, processId: string) =>
      invoke("chatKillBackgroundTerminal", workspaceId, conversationId, processId),
    killAllBackgroundTerminals: (workspaceId: string, conversationId: string) =>
      invoke("chatKillAllBackgroundTerminals", workspaceId, conversationId),
    sendMessage: (workspaceId: string, conversationId: string, input) =>
      invoke("chatSendMessage", workspaceId, conversationId, input),
    sendSteeringImmediately: (workspaceId: string, conversationId: string, input) =>
      invoke("chatSendSteeringImmediately", workspaceId, conversationId, input ?? null),
    steerMessage: (workspaceId: string, conversationId: string, input) =>
      invoke("chatSteerMessage", workspaceId, conversationId, input),
    submitApproval: (input) => invoke("chatSubmitApproval", input),
  },
  codexAccount: {
    cancelLogin: (request) => invoke("codexAccountCancelLogin", request),
    logout: (request) => invoke("codexAccountLogout", request),
    read: () => invoke("codexAccountRead"),
    refresh: (request) => invoke("codexAccountRefresh", request),
    startLogin: (request) => invoke("codexAccountStartLogin", request),
  },
  semanticGraph: {
    attachChatMessage: (request) => invoke("semanticGraphAttachChatMessage", request),
    attachChatRun: (request) => invoke("semanticGraphAttachChatRun", request),
    attachFileRange: (request) => invoke("semanticGraphAttachFileRange", request),
    attachRunItem: (request) => invoke("semanticGraphAttachRunItem", request),
    attachWorkflowExecution: (request) => invoke("semanticGraphAttachWorkflowExecution", request),
    attachWorkflowNode: (request) => invoke("semanticGraphAttachWorkflowNode", request),
    acceptCartographerPatch: (request) => invoke("semanticGraphCartographerPatchAccept", request),
    buildCartographerWindow: (request) => invoke("semanticGraphCartographerWindowBuild", request),
    processCartographerWindow: (request) =>
      invoke("semanticGraphCartographerWindowProcess", request),
    readCartographerProcessingState: (request) =>
      invoke("semanticGraphCartographerProcessingState", request),
    createEdge: (request) => invoke("semanticGraphCreateEdge", request),
    createNode: (request) => invoke("semanticGraphCreateNode", request),
    createSteeringDirective: (request) => invoke("semanticGraphCreateSteeringDirective", request),
    dismissNode: (request) => invoke("semanticGraphDismissNode", request),
    endActivity: (request) => invoke("semanticGraphActivityEnd", request),
    listCartographerCursors: (request) => invoke("semanticGraphCartographerCursorList", request),
    listCartographerPatches: (request) => invoke("semanticGraphCartographerPatchList", request),
    listCartographerRuns: (request) => invoke("semanticGraphCartographerRunList", request),
    listCartographerWindows: (request) => invoke("semanticGraphCartographerWindowList", request),
    listActivity: (request) => invoke("semanticGraphActivityList", request),
    listActivityPage: (request) => invoke("semanticGraphActivityPage", request),
    listContextPacks: (request) => invoke("semanticGraphContextPackList", request),
    listEvidence: (request) => invoke("semanticGraphEvidenceList", request),
    mergeNodes: (request) => invoke("semanticGraphMergeNodes", request),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeSemanticGraphChangeEvent(payload));
      };
      ipcRenderer.on(ipcEvents.semanticGraphEvent, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.semanticGraphEvent, handler);
      };
    },
    promoteNode: (request) => invoke("semanticGraphPromoteNode", request),
    read: (request) => invoke("semanticGraphRead", request),
    readActivitySummary: (request) => invoke("semanticGraphActivitySummary", request),
    readCartographerRun: (request) => invoke("semanticGraphCartographerRunRead", request),
    readContextPack: (request) => invoke("semanticGraphContextPackRead", request),
    readEventHistory: (request) => invoke("semanticGraphEventHistory", request),
    readNodeDetail: (request) => invoke("semanticGraphNodeDetail", request),
    readSteeringState: (request) => invoke("semanticGraphSteeringRead", request),
    rejectCartographerPatch: (request) => invoke("semanticGraphCartographerPatchReject", request),
    removeEdge: (request) => invoke("semanticGraphRemoveEdge", request),
    renameNode: (request) => invoke("semanticGraphRenameNode", request),
    splitNode: (request) => invoke("semanticGraphSplitNode", request),
    updateEdge: (request) => invoke("semanticGraphUpdateEdge", request),
    updateLayoutPositions: (request) => invoke("semanticGraphLayoutUpdate", request),
    updateNode: (request) => invoke("semanticGraphUpdateNode", request),
    updateSteeringDirective: (request) => invoke("semanticGraphUpdateSteeringDirective", request),
  },
  workflow: {
    cancelExecution: (workspaceId, executionId) =>
      invoke("workflowCancelExecution", workspaceId, executionId),
    createDefinition: (workspaceId, name, description, graph) =>
      invoke("workflowCreateDefinition", workspaceId, name, description, graph),
    deleteDefinition: (workspaceId, definitionId) =>
      invoke("workflowDeleteDefinition", workspaceId, definitionId),
    executionEvents: (workspaceId, executionId, beforeOrdinal, limit) =>
      invoke("workflowExecutionEvents", workspaceId, executionId, beforeOrdinal, limit),
    graphProjection: (workspaceId, definitionId = "", versionId = "", executionId = "") =>
      invoke("workflowGraphProjection", workspaceId, definitionId, versionId, executionId),
    listDefinitions: (workspaceId) => invoke("workflowListDefinitions", workspaceId),
    listExecutions: (workspaceId, definitionId, limit) =>
      invoke("workflowListExecutions", workspaceId, definitionId, limit),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeWorkflowEvent(payload));
      };
      ipcRenderer.on(ipcEvents.workflowEvent, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.workflowEvent, handler);
      };
    },
    readDefinition: (workspaceId, definitionId) =>
      invoke("workflowReadDefinition", workspaceId, definitionId),
    readExecution: (workspaceId, executionId) =>
      invoke("workflowReadExecution", workspaceId, executionId),
    readNodeTrajectory: (request) => invoke("workflowReadNodeTrajectory", request),
    retryNodeRunLiveness: (request) => invoke("workflowRetryNodeRunLiveness", request),
    startExecution: (workspaceId, definitionId, versionId = "") =>
      invoke("workflowStartExecution", workspaceId, definitionId, versionId),
    steerNodeRun: (request) => invoke("workflowSteerNodeRun", request),
    stopNodeRun: (request) => invoke("workflowStopNodeRun", request),
    submitApproval: (request) => invoke("workflowSubmitApproval", request),
    updateDefinition: (workspaceId, definitionId, name, description, graph) =>
      invoke("workflowUpdateDefinition", workspaceId, definitionId, name, description, graph),
    validateDefinition: (workspaceId, graph) =>
      invoke("workflowValidateDefinition", workspaceId, graph),
  },
  workspace: {
    close: (id: string) => invoke("workspaceClose", id),
    openLocalFolder: () => invoke("workspaceOpenLocalFolder"),
    openPath: (rootPath: string) => invoke("workspaceOpenPath", rootPath),
    readUILayout: (workspaceId: string) => invoke("workspaceReadUILayout", workspaceId),
    removeRecent: (id: string) => invoke("workspaceRemoveRecent", id),
    reorder: (ids: string[]) => invoke("workspaceReorder", ids),
    saveUILayout: (layout) => invoke("workspaceSaveUILayout", layout),
    select: (id: string) => invoke("workspaceSelect", id),
    selectedConversations: () => invoke("workspaceSelectedConversations"),
    setSelectedConversation: (workspaceId: string, conversationId: string) =>
      invoke("workspaceSetSelectedConversation", workspaceId, conversationId),
    session: () => invoke("workspaceSession"),
  },
};

installRendererRecorder(ipcRenderer);
contextBridge.exposeInMainWorld("setta", api);

function parseWorkflowGraphSyntheticGraph(env: NodeJS.ProcessEnv) {
  const nodeCount = optionalPositiveIntegerEnv(
    env.SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT,
    "SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT",
  );
  const edgesPerNode = optionalPositiveIntegerEnv(
    env.SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE,
    "SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE",
  );
  if (nodeCount === null && edgesPerNode === null) {
    return null;
  }
  if (nodeCount === null || edgesPerNode === null) {
    throw new Error(
      "SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT and SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE must be set together",
    );
  }
  return { edgesPerNode, nodeCount };
}

function optionalPositiveIntegerEnv(value: string | undefined, name: string) {
  if (value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer: ${value}`);
  }
  return parsed;
}

function decodeBackendProcessStatus(value: unknown): BackendProcessStatus {
  const record = assertStatusRecord(value, "BackendProcessStatus");
  const status = stringField(record, "status", "BackendProcessStatus");
  const message = stringField(record, "message", "BackendProcessStatus");
  if (status === "starting" || status === "offline" || status === "failed") {
    return { message, status };
  }
  if (status === "online") {
    const mode = stringField(record, "mode", "BackendProcessStatus");
    if (mode !== "external" && mode !== "spawned") {
      throw new Error("BackendProcessStatus.mode is unsupported: " + mode);
    }
    return {
      message,
      mode,
      status,
      url: stringField(record, "url", "BackendProcessStatus"),
    };
  }
  throw new Error("BackendProcessStatus.status is unsupported: " + status);
}

function decodeBackendEventStreamStatus(value: unknown): BackendEventStreamStatus {
  const record = assertStatusRecord(value, "BackendEventStreamStatus");
  const status = stringField(record, "status", "BackendEventStreamStatus");
  const message = stringField(record, "message", "BackendEventStreamStatus");
  if (status === "connecting") {
    return {
      attempt: integerField(record, "attempt", "BackendEventStreamStatus"),
      message,
      status,
    };
  }
  if (status === "connected") {
    return {
      lastSequence: integerField(record, "lastSequence", "BackendEventStreamStatus"),
      lastStreamId: stringField(record, "lastStreamId", "BackendEventStreamStatus"),
      message,
      status,
    };
  }
  if (status === "reconnecting") {
    return {
      attempt: integerField(record, "attempt", "BackendEventStreamStatus"),
      lastSequence: integerField(record, "lastSequence", "BackendEventStreamStatus"),
      lastStreamId: stringField(record, "lastStreamId", "BackendEventStreamStatus"),
      message,
      status,
    };
  }
  if (status === "resyncing") {
    return {
      lastSequence: integerField(record, "lastSequence", "BackendEventStreamStatus"),
      lastStreamId: stringField(record, "lastStreamId", "BackendEventStreamStatus"),
      message,
      status,
    };
  }
  if (status === "stopped") {
    return { message, status };
  }
  throw new Error("BackendEventStreamStatus.status is unsupported: " + status);
}

function decodeRuntimeRegistrySnapshot(value: unknown): RuntimeRegistrySnapshot {
  const record = assertStatusRecord(value, "RuntimeRegistrySnapshot");
  const rawRuntimes = record.runtimes;
  if (!Array.isArray(rawRuntimes)) {
    throw new Error("RuntimeRegistrySnapshot.runtimes must be an array");
  }
  return {
    activeRuntimeId: nullableStringField(record, "activeRuntimeId", "RuntimeRegistrySnapshot"),
    connection: decodeRuntimeConnectionState(
      requireRuntimeField(record, "connection", "RuntimeRegistrySnapshot"),
    ),
    runtimes: rawRuntimes.map((runtime, index) =>
      decodeKnownRuntimeView(runtime, `RuntimeRegistrySnapshot.runtimes[${index}]`),
    ),
    switching: booleanField(record, "switching", "RuntimeRegistrySnapshot"),
  };
}

function decodeKnownRuntimeView(value: unknown, label: string): KnownRuntimeView {
  const record = assertStatusRecord(value, label);
  return {
    active: booleanField(record, "active", label),
    baseUrl: stringField(record, "baseUrl", label),
    connectionMessage: stringField(record, "connectionMessage", label),
    connectionStatus: decodeRuntimeConnectionStatus(
      stringField(record, "connectionStatus", label),
      `${label}.connectionStatus`,
    ),
    displayName: stringField(record, "displayName", label),
    infrastructureProvider: decodeRuntimeInfrastructureProvider(
      requireRuntimeField(record, "infrastructureProvider", label),
      `${label}.infrastructureProvider`,
    ),
    isLocal: booleanField(record, "isLocal", label),
    lastConnected: nullableStringField(record, "lastConnected", label),
    runtimeId: stringField(record, "runtimeId", label),
  };
}

function decodeRuntimeInfrastructureProvider(
  value: unknown,
  label: string,
): KnownRuntimeView["infrastructureProvider"] {
  const record = assertStatusRecord(value, label);
  return {
    displayName: stringField(record, "displayName", label),
    iconUrl: stringField(record, "iconUrl", label),
    id: stringField(record, "id", label),
  };
}

function decodeRuntimeConnectionState(value: unknown): RuntimeConnectionState {
  const label = "RuntimeConnectionState";
  const record = assertStatusRecord(value, label);
  return {
    message: stringField(record, "message", label),
    protocolVersion: nullableNumberField(record, "protocolVersion", label),
    runtimeId: nullableStringField(record, "runtimeId", label),
    status: decodeRuntimeConnectionStatus(stringField(record, "status", label), `${label}.status`),
    updatedAt: stringField(record, "updatedAt", label),
  };
}

function decodeRuntimeConnectionStatus(value: string, label: string): RuntimeConnectionStatus {
  switch (value) {
    case "connected":
    case "connecting":
    case "disconnected":
    case "incompatible":
    case "mismatched":
    case "revoked":
    case "unreachable":
      return value;
    default:
      throw new Error(label + " is unsupported: " + value);
  }
}

function decodeWorkspaceBrowserViewKeyEvent(value: unknown): WorkspaceBrowserViewKeyEvent {
  const record = assertStatusRecord(value, "WorkspaceBrowserViewKeyEvent");
  const key = stringField(record, "key", "WorkspaceBrowserViewKeyEvent");
  if (!isWorkspaceBrowserViewKey(key)) {
    throw new Error("WorkspaceBrowserViewKeyEvent.key is unsupported: " + key);
  }
  return {
    altKey: booleanField(record, "altKey", "WorkspaceBrowserViewKeyEvent"),
    ctrlKey: booleanField(record, "ctrlKey", "WorkspaceBrowserViewKeyEvent"),
    key,
    metaKey: booleanField(record, "metaKey", "WorkspaceBrowserViewKeyEvent"),
    shiftKey: booleanField(record, "shiftKey", "WorkspaceBrowserViewKeyEvent"),
    surfaceId: stringField(record, "surfaceId", "WorkspaceBrowserViewKeyEvent"),
    workspaceId: stringField(record, "workspaceId", "WorkspaceBrowserViewKeyEvent"),
  };
}

function isWorkspaceBrowserViewKey(key: string): key is WorkspaceBrowserViewKeyEvent["key"] {
  return workspaceBrowserViewKeys.has(key);
}

function decodeWorkspaceBrowserViewSnapshot(value: unknown): WorkspaceBrowserViewSnapshot {
  const record = assertStatusRecord(value, "WorkspaceBrowserViewSnapshot");
  return {
    capturedAt: numberField(record, "capturedAt", "WorkspaceBrowserViewSnapshot"),
    height: numberField(record, "height", "WorkspaceBrowserViewSnapshot"),
    imageDataUrl: stringField(record, "imageDataUrl", "WorkspaceBrowserViewSnapshot"),
    paneId: stringField(record, "paneId", "WorkspaceBrowserViewSnapshot"),
    surfaceId: stringField(record, "surfaceId", "WorkspaceBrowserViewSnapshot"),
    title: stringField(record, "title", "WorkspaceBrowserViewSnapshot"),
    width: numberField(record, "width", "WorkspaceBrowserViewSnapshot"),
    workspaceId: stringField(record, "workspaceId", "WorkspaceBrowserViewSnapshot"),
  };
}

function assertStatusRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(label + "." + field + " must be a string");
  }
  return value;
}

function nullableStringField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): string | null {
  const value = record[field];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(label + "." + field + " must be a string or null");
  }
  return value;
}

function booleanField(record: Record<string, unknown>, field: string, label: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(label + "." + field + " must be a boolean");
  }
  return value;
}

function nullableNumberField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): number | null {
  const value = record[field];
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(label + "." + field + " must be a finite number or null");
  }
  return value;
}

function numberField(record: Record<string, unknown>, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(label + "." + field + " must be a finite number");
  }
  return value;
}

function requireRuntimeField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): unknown {
  if (!(field in record)) {
    throw new Error(label + "." + field + " is required");
  }
  return record[field];
}

function integerField(record: Record<string, unknown>, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(label + "." + field + " must be an integer");
  }
  return value;
}
