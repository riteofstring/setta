import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { decodeCodexAccountChangeEvent, decodeConversationEvent } from "@generated/backend";
import { createRendererIpcInvoke, ipcEvents, ipcMessages } from "@shared/ipc";
import {
  decodeLocalMacOSVoiceModelDownloadStatus,
  decodeSpeechCredentialSettings,
  decodeSpeechProviderSelectionSettings,
} from "@shared/speech-ipc";
import { workspaceBrowserViewKeyValues } from "@shared/types";
import type {
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
const workspaceBrowserViewKeys = new Set<string>(workspaceBrowserViewKeyValues);

const api: SettaAPI = {
  app: {
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
  appLayout: {
    readPaneLayout: () => invoke("appPaneLayoutRead"),
    savePaneLayout: (layout) => invoke("appPaneLayoutSave", layout),
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
  conversations: {
    archive: (request) => invoke("conversationArchiveTopic", request),
    disposeSide: (request) => invoke("conversationDisposeSide", request),
    discardInput: (request) => invoke("conversationDiscardInput", request),
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
    sendSide: (request) => invoke("conversationSendSideTurn", request),
    readInputState: (request) => invoke("conversationReadInputState", request),
    waitInputState: (request) => invoke("conversationWaitInputState", request),
    readArtifact: (request) => invoke("conversationReadArtifact", request),
    read: (request) => invoke("conversationReadSnapshot", request),
    release: (request) => invoke("conversationReleaseEvents", request),
    retryInput: (request) => invoke("conversationRetryInput", request),
    stop: (request) => invoke("conversationStopTurn", request),
    submitInput: (request) => invoke("conversationSubmitInput", request),
    submitApproval: (request) => invoke("conversationSubmitApproval", request),
    subscribe: (request) => invoke("conversationSubscribeEvents", request),
    updatePresentation: (request) => invoke("conversationUpdatePresentation", request),
  },
  master: {
    cancelInput: (request) => invoke("masterCancelInput", request),
    readActiveInteraction: () => invoke("masterReadActiveInteraction"),
    resolvePresentation: (request) => invoke("masterResolvePresentation", request),
    submitInput: (request) => invoke("masterSubmitInput", request),
    waitInteraction: (request) => invoke("masterWaitInteraction", request),
    waitPresentation: (request) => invoke("masterWaitPresentation", request),
  },
  roles: {
    readConversation: (request) => invoke("roleConfigurationReadConversation", request),
    readGlobal: () => invoke("roleConfigurationReadGlobal"),
    readModels: () => invoke("roleConfigurationReadModels"),
    readWorkspace: (request) => invoke("roleConfigurationReadWorkspace", request),
    updateConversation: (request) => invoke("roleConfigurationUpdateConversation", request),
    updateGlobal: (request) => invoke("roleConfigurationUpdateGlobal", request),
    updateWorkspace: (request) => invoke("roleConfigurationUpdateWorkspace", request),
  },
  speech: {
    cancelLocalMacOSVoiceCapture: (request) =>
      invoke("speechCancelLocalMacOSVoiceCapture", request),
    cancelSynthesis: (operationId) => invoke("speechCancelSynthesis", operationId),
    createTranscriptionSession: (request) => invoke("speechCreateTranscriptionSession", request),
    finishLocalMacOSVoiceCapture: (request) =>
      invoke("speechFinishLocalMacOSVoiceCapture", request),
    onCredentialSettingsChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeSpeechCredentialSettings(payload));
      };
      ipcRenderer.on(ipcEvents.speechCredentialSettingsChanged, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.speechCredentialSettingsChanged, handler);
      };
    },
    onProviderSelectionChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeSpeechProviderSelectionSettings(payload));
      };
      ipcRenderer.on(ipcEvents.speechProviderSelectionChanged, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.speechProviderSelectionChanged, handler);
      };
    },
    onLocalMacOSVoiceModelDownloadChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeLocalMacOSVoiceModelDownloadStatus(payload));
      };
      ipcRenderer.on(ipcEvents.speechLocalMacOSVoiceModelDownloadChanged, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.speechLocalMacOSVoiceModelDownloadChanged, handler);
      };
    },
    readCapabilities: () => invoke("speechReadCapabilities"),
    readCredentialSettings: (request) => invoke("speechReadCredentialSettings", request),
    listLocalMacOSVoices: () => invoke("speechListLocalMacOSVoices"),
    readLocalMacOSVoiceHealth: () => invoke("speechReadLocalMacOSVoiceHealth"),
    readLocalMacOSVoiceModelDownload: () => invoke("speechReadLocalMacOSVoiceModelDownload"),
    readMasterVoiceSelection: () => invoke("speechReadMasterVoiceSelection"),
    readNarratorVoiceDefault: () => invoke("speechReadNarratorVoiceDefault"),
    readProviderSelection: () => invoke("speechReadProviderSelection"),
    removeCredential: (request) => invoke("speechRemoveCredential", request),
    saveCredential: (request) => invoke("speechSaveCredential", request),
    startLocalMacOSVoiceCapture: (request) => invoke("speechStartLocalMacOSVoiceCapture", request),
    startLocalMacOSVoiceModelDownload: () => invoke("speechStartLocalMacOSVoiceModelDownload"),
    synthesize: (request, operationId) => invoke("speechSynthesize", { operationId, request }),
    updateMasterVoiceSelection: (request) => invoke("speechUpdateMasterVoiceSelection", request),
    updateNarratorVoiceDefault: (request) => invoke("speechUpdateNarratorVoiceDefault", request),
    updateProviderSelection: (request) => invoke("speechUpdateProviderSelection", request),
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
  codexAccount: {
    cancelLogin: (request) => invoke("codexAccountCancelLogin", request),
    logout: (request) => invoke("codexAccountLogout", request),
    onChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        listener(decodeCodexAccountChangeEvent(payload));
      };
      ipcRenderer.on(ipcEvents.codexAccountChange, handler);
      return () => {
        ipcRenderer.removeListener(ipcEvents.codexAccountChange, handler);
      };
    },
    read: () => invoke("codexAccountRead"),
    refresh: (request) => invoke("codexAccountRefresh", request),
    startLogin: (request) => invoke("codexAccountStartLogin", request),
  },
  workspace: {
    close: (id: string) => invoke("workspaceClose", id),
    openLocalFolder: () => invoke("workspaceOpenLocalFolder"),
    openPath: (rootPath: string) => invoke("workspaceOpenPath", rootPath),
    relocateLocalFolder: (id: string) => invoke("workspaceRelocateLocalFolder", id),
    readUILayout: (workspaceId: string) => invoke("workspaceReadUILayout", workspaceId),
    refreshAvailability: (id: string) => invoke("workspaceRefreshAvailability", id),
    removeRecent: (id: string) => invoke("workspaceRemoveRecent", id),
    reorder: (ids: string[]) => invoke("workspaceReorder", ids),
    saveUILayout: (layout) => invoke("workspaceSaveUILayout", layout),
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
