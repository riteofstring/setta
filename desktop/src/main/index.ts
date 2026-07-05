import { app, BrowserWindow, dialog, ipcMain, powerMonitor } from "electron";
import type { OpenDialogOptions } from "electron";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";

import {
  createBackendClient,
  type BackendClient,
  type ChatEvent,
  type RunLivenessReason,
  type TerminalEvent,
  type WorkflowEvent,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { handleIpc, ipcEvents, ipcMessages } from "@shared/ipc";
import { recordingRendererEventChannel, type RendererRecordedEvent } from "@shared/recording";
import type {
  BackendEventStreamStatus,
  BackendProcessStatus,
  RuntimeRegistrySnapshot,
} from "@shared/types";
import { registerAppIpcHandlers } from "./app-ipc";
import { authenticatedBackendFetch } from "./backend-auth-fetch";
import { startBackendEventStream, type BackendEventStream } from "./backend-event-stream";
import { attachBackendObservers } from "./backend-main-observers";
import { createBackendRequestLifecycle } from "./backend-request-lifecycle";
import { createBackendStatusBroadcaster } from "./backend-status";
import { startBackend, type BackendHandle } from "./backend-supervisor";
import { registerChatAttachmentProtocol } from "./chat-attachment-protocol";
import { registerChatCodexIpcHandlers } from "./chat-codex-ipc";
import { forwardChatEventToWindows } from "./chat-event-forwarding";
import { registerChatIpcHandlers } from "./chat-ipc";
import { registerEasyRunIpcHandlers } from "./easy-run-ipc";
import { KnownRuntimeStore } from "./known-runtime-store";
import { registerRuntimeIpcHandlers } from "./runtime-ipc";
import { RuntimeRegistryController, type ActiveRuntime } from "./runtime-registry";
import { createElectronWebContentsViewRegistry } from "./workspace-browser-views";
import { createSessionRecorder, type SessionRecorder } from "./session-recorder";
import { startSemanticGraphEventForwarding } from "./semantic-graph-event-forwarding-stream";
import { registerSemanticGraphIpcHandlers } from "./semantic-graph-ipc";
import { forwardTerminalEventToWindows } from "./terminal-event-forwarding";
import { startTerminalEventStream, type TerminalEventStream } from "./terminal-event-stream";
import { registerTerminalIpcHandlers } from "./terminal-ipc";
import { registerAppWindowDragIpcHandlers } from "./window-drag";
import { startWorkspaceActivityEventForwarding } from "./workspace-activity-event-forwarding-stream";
import { registerWorkspaceActivityIpcHandlers } from "./workspace-activity-ipc";
import { forwardWorkflowEventToWindows } from "./workflow-event-forwarding";
import { startWorkflowEventStream, type WorkflowEventStream } from "./workflow-event-stream";
import { registerWorkflowIpcHandlers } from "./workflow-ipc";
import { registerWorkspaceUILayoutIpcHandlers } from "./workspace-ui-ipc";

let backend: BackendHandle | null = null;
let backendEventStream: BackendEventStream | null = null;
let semanticGraphEventStream: ReturnType<typeof startSemanticGraphEventForwarding> | null = null;
let terminalEventStream: TerminalEventStream | null = null;
let workspaceActivityEventStream: ReturnType<typeof startWorkspaceActivityEventForwarding> | null =
  null;
let workflowEventStream: WorkflowEventStream | null = null;
let backendStartupError: string | null = null;
let ipcRegistered = false;
let mainWindow: BrowserWindow | null = null;
let quitting = false;
let recorder: SessionRecorder | null = null;
let runtimeRegistry: RuntimeRegistryController | null = null;
const backendRequests = createBackendRequestLifecycle();
const backendStatuses = createBackendStatusBroadcaster(() => BrowserWindow.getAllWindows());
const compactWindowMinHeight = 320;
const compactWindowMinWidth = 320;
const backendRequestDrainTimeoutMs = 1_500;
const workspaceBrowserViews = createElectronWebContentsViewRegistry();
function desktopRoot() {
  return process.cwd();
}
function repoRoot() {
  return resolve(desktopRoot(), "..");
}
async function prepareBackend(appDataDir: string) {
  emitBackendProcessStatus({ message: "Starting backend", status: "starting" });
  try {
    backend = await startBackend(repoRoot(), appDataDir, process.env);
    backendStartupError = null;
    attachBackendObservers({
      backend,
      emitBackendProcessStatus,
      isE2E,
      mainWindow: () => mainWindow,
      recorder: () => recorder,
      runtimeRegistry: () => runtimeRegistry,
      stopBackendEventStreams,
    });
    runtimeRegistry = createRuntimeRegistry();
    await runtimeRegistry.load();
    const localRuntime = await runtimeRegistry.registerLocalRuntime({
      baseUrl: backend.url,
      deviceToken: backend.bootstrapToken,
    });
    await runtimeRegistry.connectStoredOrLocal(localRuntime.runtimeId);
  } catch (error) {
    backend = null;
    backendStartupError = error instanceof Error ? error.message : "backend failed to start";
    emitBackendProcessStatus({ message: backendStartupError, status: "failed" });
    emitBackendEventStreamStatus({ message: "Backend event stream stopped", status: "stopped" });
    recorder?.recordBackendStartupError(backendStartupError);
  }
}

function createRuntimeRegistry() {
  return new RuntimeRegistryController({
    clientDisplayName,
    fetchImpl: recorder?.createBackendFetch(fetch) ?? fetch,
    hooks: {
      activeRuntimeFailed: handleRuntimeFailed,
      activeRuntimeOffline: handleRuntimeOffline,
      activeRuntimeOnline: handleRuntimeOnline,
      beforeRuntimeSwitch,
    },
    onSnapshot: broadcastRuntimeSnapshot,
    store: new KnownRuntimeStore(app.getPath("userData")),
  });
}

async function handleRuntimeFailed(state: RuntimeRegistrySnapshot["connection"]) {
  backendRequests.setStopping(true);
  await stopBackendEventStreams();
  emitBackendProcessStatus({ message: state.message, status: "failed" });
  emitBackendEventStreamStatus({
    message: "Backend event stream stopped",
    status: "stopped",
  });
}

function handleRuntimeOffline(state: RuntimeRegistrySnapshot["connection"]) {
  backendRequests.setStopping(true);
  emitBackendProcessStatus({ message: state.message, status: "offline" });
}

function handleRuntimeOnline(runtime: ActiveRuntime) {
  backendRequests.setStopping(false);
  emitBackendProcessStatus({
    message: runtime.isLocal ? "Backend online" : `Connected to ${runtime.displayName}`,
    mode: runtime.isLocal ? (backend?.mode ?? "spawned") : "external",
    status: "online",
    url: runtime.baseUrl,
  });
  startBackendEventStreams();
}

async function beforeRuntimeSwitch() {
  await stopBackendEventStreams();
  await backendRequests.waitForIdle(backendRequestDrainTimeoutMs);
}

function startChatEventStream() {
  const runtime = activeRuntime();
  if (!runtime) {
    return;
  }
  void stopChatEventStream();
  backendEventStream = startBackendEventStream({
    authToken: runtime.deviceToken,
    baseURL: runtime.baseUrl,
    fetchImpl: backendFetch(),
    observer: {
      forwarded: (event) => {
        recorder?.recordAppEvent("chat_event_forwarded", {
          eventId: event.eventId,
          sequence: event.sequence,
          streamId: event.streamId,
          type: event.type,
        });
      },
      lifecycle: (event) => {
        emitBackendEventStreamStatus(event);
        recorder?.recordAppEvent("chat_event_stream_" + event.status, event);
        if (event.status === "reconnecting" || event.status === "resyncing") {
          void reconcileChatRunsInBackground("stream_resync");
        }
      },
    },
    sendEvent: forwardChatEvent,
  });
}

function startWorkflowEventStreamForwarding() {
  const runtime = activeRuntime();
  if (!runtime) {
    return;
  }
  void stopWorkflowEventStreamForwarding();
  workflowEventStream = startWorkflowEventStream({
    authToken: runtime.deviceToken,
    baseURL: runtime.baseUrl,
    fetchImpl: backendFetch(),
    sendEvent: forwardWorkflowEvent,
  });
}

function startSemanticGraphEventStreamForwarding() {
  const runtime = activeRuntime();
  if (!runtime) {
    return;
  }
  void stopSemanticGraphEventStreamForwarding();
  semanticGraphEventStream = startSemanticGraphEventForwarding({
    authToken: runtime.deviceToken,
    baseURL: runtime.baseUrl,
    fetchImpl: backendFetch(),
    recorder,
  });
}

function startTerminalEventStreamForwarding() {
  const runtime = activeRuntime();
  if (!runtime) {
    return;
  }
  void stopTerminalEventStreamForwarding();
  terminalEventStream = startTerminalEventStream({
    authToken: runtime.deviceToken,
    baseURL: runtime.baseUrl,
    fetchImpl: backendFetch(),
    sendEvent: forwardTerminalEvent,
  });
}

function startWorkspaceActivityEventStreamForwarding() {
  const runtime = activeRuntime();
  if (!runtime) {
    return;
  }
  void stopWorkspaceActivityEventStreamForwarding();
  workspaceActivityEventStream = startWorkspaceActivityEventForwarding({
    authToken: runtime.deviceToken,
    baseURL: runtime.baseUrl,
    fetchImpl: backendFetch(),
    recorder,
  });
}

async function stopChatEventStream() {
  const stream = backendEventStream;
  backendEventStream = null;
  await stream?.stop();
}

async function stopWorkflowEventStreamForwarding() {
  const stream = workflowEventStream;
  workflowEventStream = null;
  await stream?.stop();
}

async function stopSemanticGraphEventStreamForwarding() {
  const stream = semanticGraphEventStream;
  semanticGraphEventStream = null;
  await stream?.stop();
}

async function stopTerminalEventStreamForwarding() {
  const stream = terminalEventStream;
  terminalEventStream = null;
  await stream?.stop();
}

async function stopWorkspaceActivityEventStreamForwarding() {
  const stream = workspaceActivityEventStream;
  workspaceActivityEventStream = null;
  await stream?.stop();
}

async function stopBackendEventStreams() {
  await Promise.all([
    stopChatEventStream(),
    stopSemanticGraphEventStreamForwarding(),
    stopTerminalEventStreamForwarding(),
    stopWorkspaceActivityEventStreamForwarding(),
    stopWorkflowEventStreamForwarding(),
  ]);
}

function startBackendEventStreams() {
  startChatEventStream();
  startSemanticGraphEventStreamForwarding();
  startTerminalEventStreamForwarding();
  startWorkspaceActivityEventStreamForwarding();
  startWorkflowEventStreamForwarding();
}

function emitBackendProcessStatus(status: BackendProcessStatus) {
  backendStatuses.emitProcessStatus(status);
}

function emitBackendEventStreamStatus(status: BackendEventStreamStatus) {
  backendStatuses.emitEventStreamStatus(status);
}

function sendBackendStatuses(window: BrowserWindow) {
  backendStatuses.sendToWindow(window);
}

function broadcastRuntimeSnapshot(snapshot: RuntimeRegistrySnapshot) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcEvents.runtimeConnectionState, snapshot);
    }
  }
}

function sendRuntimeSnapshot(window: BrowserWindow) {
  const snapshot = runtimeRegistry?.snapshot();
  if (snapshot) {
    window.webContents.send(ipcEvents.runtimeConnectionState, snapshot);
  }
}

function clientDisplayName() {
  const name = hostname().trim();
  return name === "" ? "Setta Desktop" : `Setta Desktop (${name})`;
}

function forwardChatEvent(event: ChatEvent) {
  forwardChatEventToWindows(BrowserWindow.getAllWindows(), event);
}

function forwardWorkflowEvent(event: WorkflowEvent) {
  recorder?.recordAppEvent("workflow_event_forwarded", {
    eventId: event.id,
    executionId: event.executionId,
    ordinal: event.ordinal,
    type: event.type,
  });
  forwardWorkflowEventToWindows(BrowserWindow.getAllWindows(), event);
}

function forwardTerminalEvent(event: TerminalEvent) {
  recorder?.recordAppEvent("terminal_event_forwarded", {
    eventId: event.eventId,
    paneId: event.paneId,
    sequence: event.sequence,
    sessionId: event.sessionId,
    streamId: event.streamId,
    type: event.type,
    workspaceId: event.workspaceId,
  });
  forwardTerminalEventToWindows(BrowserWindow.getAllWindows(), event);
}

function settaAppDataDir() {
  return process.env.SETTA_APP_DATA_DIR ?? join(homedir(), ".setta");
}

function configureElectronUserDataPath() {
  if (!isE2E() || !process.env.SETTA_APP_DATA_DIR) {
    return;
  }
  app.setPath("userData", join(process.env.SETTA_APP_DATA_DIR, "electron-user-data"));
}

function isE2E() {
  return process.env.SETTA_E2E === "1";
}

function isVisibleE2E() {
  return process.env.SETTA_E2E_VISIBLE === "1";
}

function shouldShowMainWindow() {
  return !isE2E() || isVisibleE2E();
}

function testOpenWorkspaceRoot() {
  if (!isE2E()) {
    return "";
  }
  return process.env.SETTA_E2E_OPEN_WORKSPACE_ROOT ?? "";
}

function mainWindowInitialSize() {
  return {
    height: e2eWindowDimension("SETTA_E2E_WINDOW_HEIGHT", 820),
    width: e2eWindowDimension("SETTA_E2E_WINDOW_WIDTH", 1280),
  };
}

function e2eWindowDimension(envName: string, fallback: number) {
  if (!isE2E()) {
    return fallback;
  }
  const rawValue = process.env[envName];
  if (!rawValue) {
    return fallback;
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 320) {
    throw new Error(`${envName} must be an integer >= 320`);
  }
  return value;
}

async function createWindow() {
  const windowSize = mainWindowInitialSize();
  mainWindow = new BrowserWindow({
    backgroundColor: "#18181b",
    height: windowSize.height,
    minHeight: compactWindowMinHeight,
    minWidth: compactWindowMinWidth,
    show: false,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden" as const,
          // The 12px traffic lights sit 13px from the top and left edges,
          // centering vertically in the 38px renderer shell top bar.
          trafficLightPosition: { x: 13, y: 13 },
        }
      : {}),
    title: "Setta",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
    },
    width: windowSize.width,
  });
  recorder?.attachWindow(mainWindow);

  registerIpc();

  mainWindow.once("ready-to-show", () => {
    if (shouldShowMainWindow()) {
      mainWindow?.show();
    } else {
      recorder?.recordAppEvent("window_hidden_for_e2e", {});
    }
  });
  mainWindow.on("closed", () => {
    workspaceBrowserViews.teardownAll();
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(rendererURLWithE2EQuery(process.env.ELECTRON_RENDERER_URL));
  } else {
    const query = rendererE2EQuery();
    if (query) {
      await mainWindow.loadFile(join(__dirname, "../renderer/index.html"), { query });
    } else {
      await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
    }
  }
  if (mainWindow) {
    setTimeout(() => {
      if (mainWindow) {
        sendBackendStatuses(mainWindow);
        sendRuntimeSnapshot(mainWindow);
      }
    }, 0);
  }
}

function rendererURLWithE2EQuery(rawURL: string): string {
  const query = rendererE2EQuery();
  if (!query) {
    return rawURL;
  }
  const url = new URL(rawURL);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function rendererE2EQuery(): Record<string, string> | null {
  const workspaceScene = process.env.SETTA_E2E_NIRI_SCENE;
  if (!workspaceScene) {
    return null;
  }
  return { workspaceScene };
}

function registerIpc() {
  if (ipcRegistered) {
    return;
  }
  ipcRegistered = true;
  const ipcObserver = recorder?.createIpcObserver();
  ipcMain.on(recordingRendererEventChannel, (_event, event: RendererRecordedEvent) => {
    recorder?.recordRendererEvent(event);
  });
  ipcMain.on(ipcMessages.workspaceBrowserViewBatch, (event, batch) => {
    workspaceBrowserViews.applyBatch(event, batch);
  });
  registerAppIpcHandlers({
    ipcMain,
    ipcObserver,
    recordAppEvent: (type, payload) => recorder?.recordAppEvent(type, payload),
  });
  registerAppWindowDragIpcHandlers({
    ipcMain,
    ipcObserver,
    windowFromEvent: (event) => BrowserWindow.fromWebContents(event.sender),
  });
  handleIpc(
    ipcMain,
    "backendHealth",
    async () => {
      return requireBackendClient().backendHealth();
    },
    ipcObserver,
  );
  registerRuntimeIpcHandlers({ ipcMain, ipcObserver, requireRuntimeRegistry });
  handleIpc(
    ipcMain,
    "appearanceRead",
    async () => {
      return requireBackendClient().readAppearanceSettings();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appearancePresets",
    async () => {
      return requireBackendClient().readAppearancePresets();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appearanceUpdate",
    async (_event, request) => {
      return requireBackendClient().updateAppearanceSettings(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceSession",
    async () => {
      return requireBackendClient().workspaceSession();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceOpenLocalFolder",
    async () => {
      const scriptedRoot = testOpenWorkspaceRoot();
      if (scriptedRoot) {
        return requireBackendClient().openWorkspace({ rootPath: scriptedRoot });
      }
      const options: OpenDialogOptions = {
        properties: ["openDirectory"],
        title: "Open Workspace Folder",
      };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled) {
        return null;
      }
      const rootPath = result.filePaths[0];
      if (!rootPath) {
        throw new Error("open folder dialog returned no selected path");
      }
      return requireBackendClient().openWorkspace({ rootPath });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceSelect",
    async (_event, id) => {
      return requireBackendClient().selectWorkspace({ id });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceSelectedConversations",
    async () => {
      return requireBackendClient().workspaceSelectedConversations();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceSetSelectedConversation",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().setWorkspaceSelectedConversation({
        conversationId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceOpenPath",
    async (_event, rootPath) => {
      return requireBackendClient().openWorkspace({ rootPath });
    },
    ipcObserver,
  );
  registerWorkspaceUILayoutIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
  handleIpc(
    ipcMain,
    "workspaceClose",
    async (_event, id) => {
      return requireBackendClient().closeWorkspace({ id });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceReorder",
    async (_event, ids) => {
      return requireBackendClient().reorderWorkspace({ ids });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceRemoveRecent",
    async (_event, id) => {
      return requireBackendClient().removeRecentWorkspace({ id });
    },
    ipcObserver,
  );
  registerWorkspaceActivityIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
  registerEasyRunIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
  registerChatIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
  registerChatCodexIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
  registerWorkflowIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
  handleIpc(
    ipcMain,
    "codexAccountRead",
    async () => {
      return requireBackendClient().readCodexAccount();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "codexAccountRefresh",
    async (_event, request) => {
      return requireBackendClient().refreshCodexAccount(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "codexAccountStartLogin",
    async (_event, request) => {
      return requireBackendClient().startCodexLogin(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "codexAccountCancelLogin",
    async (_event, request) => {
      return requireBackendClient().cancelCodexLogin(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "codexAccountLogout",
    async (_event, request) => {
      return requireBackendClient().logoutCodexAccount(request);
    },
    ipcObserver,
  );
  registerSemanticGraphIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
  handleIpc(
    ipcMain,
    "workspaceBrowserViewStats",
    () => {
      return workspaceBrowserViews.readStats();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceBrowserViewsTeardown",
    (_event, workspaceId) => {
      return workspaceBrowserViews.teardownWorkspace(workspaceId);
    },
    ipcObserver,
  );
  registerTerminalIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
}

function requireBackendClient(): BackendClient {
  const runtime = activeRuntime();
  if (!runtime) {
    throw new Error(runtimeUnavailableMessage());
  }
  return createBackendClient(runtime.baseUrl, backendRequests.wrapFetch(backendFetch()));
}

function backendFetch(): BackendFetch {
  const runtime = activeRuntime();
  if (!runtime) {
    throw new Error(runtimeUnavailableMessage());
  }
  const fetchImpl = recorder?.createBackendFetch(fetch) ?? fetch;
  return authenticatedBackendFetch(fetchImpl, runtime.deviceToken, () => {
    void runtimeRegistry?.markActiveRuntimeRevoked();
  });
}

function activeRuntime(): ActiveRuntime | null {
  return runtimeRegistry?.currentRuntime() ?? null;
}

function requireRuntimeRegistry(): RuntimeRegistryController {
  if (!runtimeRegistry) {
    throw new Error(backendStartupError ?? "runtime registry is not ready");
  }
  return runtimeRegistry;
}

function runtimeUnavailableMessage() {
  const snapshot = runtimeRegistry?.snapshot();
  return snapshot?.connection.message ?? backendStartupError ?? "runtime is not connected";
}

async function stopBackend() {
  backendRequests.setStopping(true);
  emitBackendProcessStatus({ message: "Backend is stopping", status: "offline" });
  await stopBackendEventStreams();
  await backendRequests.waitForIdle(backendRequestDrainTimeoutMs);
  await backend?.stop();
  backend = null;
}

function requestQuit() {
  app.quit();
}

function registerPowerMonitorHandlers() {
  powerMonitor.on("resume", () => {
    void reconcileChatRunsInBackground("wake_recheck");
  });
}

async function reconcileChatRunsInBackground(reason: RunLivenessReason) {
  if (!backend) {
    return;
  }
  try {
    await requireBackendClient().reconcileChatRuns({
      conversationId: "",
      reason,
      workspaceId: "",
    });
    recorder?.recordAppEvent("chat_runs_reconciled", { reason });
  } catch (error) {
    recorder?.recordAppEvent("chat_runs_reconcile_failed", {
      message: error instanceof Error ? error.message : String(error),
      reason,
    });
  }
}

app.whenReady().then(async () => {
  if (isE2E() && !isVisibleE2E()) {
    app.dock?.hide();
  }
  registerPowerMonitorHandlers();
  const appDataDir = settaAppDataDir();
  recorder = createSessionRecorder(process.env, {
    appDataDir,
    desktopRoot: desktopRoot(),
    repoRoot: repoRoot(),
  });
  registerChatAttachmentProtocol(appDataDir);
  await prepareBackend(appDataDir);
  await createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on("before-quit", (event) => {
  if (quitting || backend === null) {
    return;
  }
  event.preventDefault();
  quitting = true;
  void (async () => {
    await recorder?.captureScreenshot(mainWindow, "app-before-quit");
    await stopBackend();
    recorder?.close();
    app.quit();
  })();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  recorder?.close();
});

process.once("SIGINT", requestQuit);
process.once("SIGTERM", requestQuit);

configureElectronUserDataPath();
