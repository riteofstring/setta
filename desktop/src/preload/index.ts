import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { decodeChatEvent, decodeTerminalEvent, decodeWorkflowEvent } from "@generated/backend";
import { createRendererIpcInvoke, ipcEvents, ipcMessages } from "@shared/ipc";
import type {
  BackendEventStreamStatus,
  BackendProcessStatus,
  DesktopPlatform,
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
    close: (sessionId: string, mode) => invoke("terminalClose", sessionId, mode),
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
    createConversation: (workspaceId: string, title: string) =>
      invoke("chatCreateConversation", workspaceId, title),
    deleteConversation: (workspaceId: string, conversationId: string) =>
      invoke("chatDeleteConversation", workspaceId, conversationId),
    editQueuedMessage: (
      workspaceId: string,
      conversationId: string,
      messageId: string,
      prompt: string,
    ) => invoke("chatEditQueuedMessage", workspaceId, conversationId, messageId, prompt),
    executeCommand: (workspaceId: string, conversationId: string, raw: string, options) =>
      invoke(
        "chatExecuteCommand",
        workspaceId,
        conversationId,
        raw,
        options?.confirmGoalReplacement ?? false,
      ),
    setCodexModel: (workspaceId: string, conversationId: string, modelId: string) =>
      invoke("chatSetCodexModel", workspaceId, conversationId, modelId),
    setCodexReasoningEffort: (workspaceId: string, conversationId: string, effort) =>
      invoke("chatSetCodexReasoningEffort", workspaceId, conversationId, effort),
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
      beforeOrdinal: number,
      limit: number,
    ) => invoke("chatMessagePage", workspaceId, conversationId, beforeOrdinal, limit),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeChatEvent(payload));
      };
      ipcRenderer.on(ipcEvents.chatEvent, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.chatEvent, handler);
      };
    },
    queueMessage: (workspaceId: string, conversationId: string, prompt: string) =>
      invoke("chatQueueMessage", workspaceId, conversationId, prompt),
    removeQueuedMessage: (workspaceId: string, conversationId: string, messageId: string) =>
      invoke("chatRemoveQueuedMessage", workspaceId, conversationId, messageId),
    runActivity: (workspaceId: string, runId: string, limit: number) =>
      invoke("chatRunActivity", workspaceId, runId, limit),
    runItemOutput: (
      workspaceId: string,
      runId: string,
      runItemId: string,
      afterOrdinal: number,
      limit: number,
    ) => invoke("chatRunItemOutput", workspaceId, runId, runItemId, afterOrdinal, limit),
    sendMessage: (workspaceId: string, conversationId: string, prompt: string) =>
      invoke("chatSendMessage", workspaceId, conversationId, prompt),
    sendSteeringImmediately: (workspaceId: string, conversationId: string, prompt = "") =>
      invoke("chatSendSteeringImmediately", workspaceId, conversationId, prompt),
    steerMessage: (workspaceId: string, conversationId: string, prompt: string) =>
      invoke("chatSteerMessage", workspaceId, conversationId, prompt),
    submitApproval: (input) => invoke("chatSubmitApproval", input),
  },
  codexAccount: {
    cancelLogin: (request) => invoke("codexAccountCancelLogin", request),
    logout: (request) => invoke("codexAccountLogout", request),
    read: () => invoke("codexAccountRead"),
    refresh: (request) => invoke("codexAccountRefresh", request),
    startLogin: (request) => invoke("codexAccountStartLogin", request),
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
    startExecution: (workspaceId, definitionId, versionId = "") =>
      invoke("workflowStartExecution", workspaceId, definitionId, versionId),
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
    removeRecent: (id: string) => invoke("workspaceRemoveRecent", id),
    reorder: (ids: string[]) => invoke("workspaceReorder", ids),
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

function decodeWorkspaceBrowserViewKeyEvent(value: unknown): WorkspaceBrowserViewKeyEvent {
  const record = assertStatusRecord(value, "WorkspaceBrowserViewKeyEvent");
  const key = stringField(record, "key", "WorkspaceBrowserViewKeyEvent");
  if (!isWorkspaceBrowserViewKey(key)) {
    throw new Error("WorkspaceBrowserViewKeyEvent.key is unsupported: " + key);
  }
  return {
    altKey: booleanField(record, "altKey", "WorkspaceBrowserViewKeyEvent"),
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

function booleanField(record: Record<string, unknown>, field: string, label: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(label + "." + field + " must be a boolean");
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

function integerField(record: Record<string, unknown>, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(label + "." + field + " must be an integer");
  }
  return value;
}
