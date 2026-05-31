import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { decodeChatEvent } from "@generated/backend";
import { createRendererIpcInvoke, ipcEvents } from "@shared/ipc";
import type {
  BackendEventStreamStatus,
  BackendProcessStatus,
  DesktopPlatform,
  SettaAPI,
} from "@shared/types";
import { installRendererRecorder } from "./renderer-recorder";

const invoke = createRendererIpcInvoke(ipcRenderer);

const api: SettaAPI = {
  app: {
    installedEditors: () => invoke("appInstalledEditors"),
    openWorkspaceInEditor: (editorId: string, rootPath: string) =>
      invoke("appOpenWorkspaceInEditor", editorId, rootPath),
    openExternalUrl: (url: string) => invoke("appOpenExternalUrl", url),
    platform: process.platform as DesktopPlatform,
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
  chat: {
    activeRun: (workspaceId: string, conversationId: string) =>
      invoke("chatActiveRun", workspaceId, conversationId),
    cancelRun: (workspaceId: string, conversationId: string) =>
      invoke("chatCancelRun", workspaceId, conversationId),
    createConversation: (workspaceId: string, title: string) =>
      invoke("chatCreateConversation", workspaceId, title),
    deleteConversation: (workspaceId: string, conversationId: string) =>
      invoke("chatDeleteConversation", workspaceId, conversationId),
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
    listCommands: (workspaceId: string, conversationId: string) =>
      invoke("chatListCommands", workspaceId, conversationId),
    listConversations: (workspaceId: string) => invoke("chatListConversations", workspaceId),
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
    steerMessage: (workspaceId: string, conversationId: string, prompt: string) =>
      invoke("chatSteerMessage", workspaceId, conversationId, prompt),
    submitApproval: (input) => invoke("chatSubmitApproval", input),
    updateUserMessage: (
      workspaceId: string,
      conversationId: string,
      messageId: string,
      text: string,
    ) => invoke("chatUpdateUserMessage", workspaceId, conversationId, messageId, text),
  },
  codexAccount: {
    cancelLogin: (request) => invoke("codexAccountCancelLogin", request),
    logout: (request) => invoke("codexAccountLogout", request),
    read: () => invoke("codexAccountRead"),
    refresh: (request) => invoke("codexAccountRefresh", request),
    startLogin: (request) => invoke("codexAccountStartLogin", request),
  },
  workspace: {
    close: (id: string) => invoke("workspaceClose", id),
    openLocalFolder: () => invoke("workspaceOpenLocalFolder"),
    removeRecent: (id: string) => invoke("workspaceRemoveRecent", id),
    reorder: (ids: string[]) => invoke("workspaceReorder", ids),
    select: (id: string) => invoke("workspaceSelect", id),
    session: () => invoke("workspaceSession"),
  },
};

installRendererRecorder(ipcRenderer);
contextBridge.exposeInMainWorld("setta", api);

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

function integerField(record: Record<string, unknown>, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(label + "." + field + " must be an integer");
  }
  return value;
}
