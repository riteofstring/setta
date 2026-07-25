import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron";
import type { OpenDialogOptions } from "electron";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createBackendClient,
  type BackendClient,
  type CodexAccountChangeEvent,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { handleIpc, ipcEvents, ipcMessages } from "@shared/ipc";
import { recordingRendererEventChannel, type RendererRecordedEvent } from "@shared/recording";
import type { BackendProcessStatus, RuntimeRegistrySnapshot } from "@shared/types";
import { registerAppPaneLayoutIpcHandlers } from "./app-pane-layout-ipc";
import { registerAppIpcHandlers } from "./app-ipc";
import { authenticatedBackendFetch } from "./backend-auth-fetch";
import { attachBackendObservers } from "./backend-main-observers";
import { createBackendRequestLifecycle } from "./backend-request-lifecycle";
import { createBackendStatusBroadcaster } from "./backend-status";
import { startBackend, type BackendHandle } from "./backend-supervisor";
import {
  startCodexAccountEventStream,
  type CodexAccountEventStream,
} from "./codex-account-event-stream";
import { registerConversationIpcHandlers } from "./conversation-ipc";
import { ConversationEventRegistry } from "./conversation-event-registry";
import { KnownRuntimeStore } from "./known-runtime-store";
import {
  createLocalMacOSVoiceHelperFromEnvironment,
  type LocalMacOSVoiceHelper,
} from "./local-macos-voice-helper";
import {
  createLocalMacOSVoiceModelDownloadService,
  type LocalMacOSVoiceModelDownloadService,
} from "./local-macos-voice-model-download";
import { registerMasterIpcHandlers } from "./master-ipc";
import { configureMainRendererMicrophonePermissions } from "./microphone-permissions";
import { registerRuntimeIpcHandlers } from "./runtime-ipc";
import { registerRoleConfigurationIpcHandlers } from "./role-configuration-ipc";
import { RuntimeRegistryController, type ActiveRuntime } from "./runtime-registry";
import { SpeechCredentialCoordinator } from "./speech-credential-coordinator";
import {
  createElectronSafeStorageCredentialProtection,
  SpeechCredentialVault,
} from "./speech-credential-vault";
import { registerSpeechIpcHandlers } from "./speech-ipc";
import { SpeechProviderSelectionStore } from "./speech-provider-selection-store";
import { createElectronWebContentsViewRegistry } from "./workspace-browser-views";
import { createSessionRecorder, type SessionRecorder } from "./session-recorder";
import { registerAppWindowDragIpcHandlers } from "./window-drag";
import { registerWorkspaceUILayoutIpcHandlers } from "./workspace-ui-ipc";

let backend: BackendHandle | null = null;
let codexAccountEventStream: CodexAccountEventStream | null = null;
let backendStartupError: string | null = null;
let ipcRegistered = false;
let mainWindow: BrowserWindow | null = null;
let localMacOSVoiceHelper: LocalMacOSVoiceHelper | null = null;
let localMacOSVoiceModelDownloadService: LocalMacOSVoiceModelDownloadService | null = null;
let quitting = false;
let recorder: SessionRecorder | null = null;
let runtimeRegistry: RuntimeRegistryController | null = null;
let speechCredentialCoordinator: SpeechCredentialCoordinator | null = null;
let speechProviderSelectionStore: SpeechProviderSelectionStore | null = null;
const backendRequests = createBackendRequestLifecycle();
const localBackendRequests = createBackendRequestLifecycle();
const backendStatuses = createBackendStatusBroadcaster(() => BrowserWindow.getAllWindows());
const conversationEvents = new ConversationEventRegistry({
  backendConnection: () => {
    const runtime = activeRuntime();
    if (!runtime) {
      throw new Error(runtimeUnavailableMessage());
    }
    return { baseURL: runtime.baseUrl, fetchImpl: backendFetch() };
  },
  recordEvent: (event) => {
    recorder?.recordConversationEvent(event);
  },
});
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
function localMacOSVoiceResourceRoots() {
  return [
    join(process.resourcesPath, "local-macos-voice"),
    join(desktopRoot(), "out", "local-macos-voice"),
    join(desktopRoot(), "resources", "local-macos-voice"),
  ];
}
async function prepareBackend(appDataDir: string) {
  emitBackendProcessStatus({ message: "Starting backend", status: "starting" });
  try {
    backend = await startBackend(repoRoot(), appDataDir, process.env);
    localBackendRequests.setStopping(false);
    backendStartupError = null;
    backend.events.on("exit", () => {
      localBackendRequests.setStopping(true);
      void speechCredentialCoordinator?.setLocalRuntime(null);
    });
    attachBackendObservers({
      backend,
      emitBackendProcessStatus,
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
    await speechCredentialCoordinator?.setLocalRuntime({
      client: createLocalSpeechCredentialClient(localRuntime),
      runtimeId: localRuntime.runtimeId,
    });
    await runtimeRegistry.connectStoredOrLocal(localRuntime.runtimeId);
  } catch (error) {
    backend = null;
    localBackendRequests.setStopping(true);
    void speechCredentialCoordinator?.setLocalRuntime(null);
    backendStartupError = error instanceof Error ? error.message : "backend failed to start";
    emitBackendProcessStatus({ message: backendStartupError, status: "failed" });
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

async function stopBackendEventStreams() {
  const accountStream = codexAccountEventStream;
  codexAccountEventStream = null;
  await Promise.all([accountStream?.stop(), conversationEvents.stopAll()]);
}

function startBackendEventStreams() {
  const runtime = activeRuntime();
  if (!runtime) {
    return;
  }
  void codexAccountEventStream?.stop();
  codexAccountEventStream = startCodexAccountEventStream({
    baseURL: runtime.baseUrl,
    fetchImpl: backendFetch(),
    sendEvent: forwardCodexAccountChange,
  });
}

function forwardCodexAccountChange(event: CodexAccountChangeEvent) {
  recorder?.recordAppEvent("codex_account_changed", event);
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcEvents.codexAccountChange, event);
    }
  }
}

function emitBackendProcessStatus(status: BackendProcessStatus) {
  backendStatuses.emitProcessStatus(status);
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

function broadcastSpeechCredentialSettings(settings: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcEvents.speechCredentialSettingsChanged, settings);
    }
  }
}

function broadcastSpeechProviderSelection(settings: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcEvents.speechProviderSelectionChanged, settings);
    }
  }
}

function broadcastLocalMacOSVoiceModelDownload(status: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcEvents.speechLocalMacOSVoiceModelDownloadChanged, status);
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

function testRelocateWorkspaceRoot() {
  if (!isE2E()) {
    return "";
  }
  return process.env.SETTA_E2E_RELOCATE_WORKSPACE_ROOT ?? "";
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
  const trustedRendererURL = mainRendererDocumentURL();
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
  configureMainRendererMicrophonePermissions({
    session: mainWindow.webContents.session,
    trustedRendererURL,
    trustedWebContents: mainWindow.webContents,
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
    await mainWindow.loadURL(rendererURLWithQuery(process.env.ELECTRON_RENDERER_URL));
  } else {
    const query = rendererQuery();
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

function mainRendererDocumentURL(): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return rendererURLWithQuery(process.env.ELECTRON_RENDERER_URL);
  }
  const url = pathToFileURL(join(__dirname, "../renderer/index.html"));
  const query = rendererQuery();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function rendererURLWithQuery(rawURL: string): string {
  const query = rendererQuery();
  if (!query) {
    return rawURL;
  }
  const url = new URL(rawURL);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function rendererQuery(): Record<string, string> | null {
  const query: Record<string, string> = {};
  const workspaceScene = process.env.SETTA_E2E_NIRI_SCENE;
  if (workspaceScene) {
    query.workspaceScene = workspaceScene;
  }
  return Object.keys(query).length > 0 ? query : null;
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
  registerAppPaneLayoutIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
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
    "workspaceOpenPath",
    async (_event, rootPath) => {
      return requireBackendClient().openWorkspace({ rootPath });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceRelocateLocalFolder",
    async (_event, id) => {
      const scriptedRoot = testRelocateWorkspaceRoot();
      if (scriptedRoot) {
        return requireBackendClient().relocateWorkspace({ id, rootPath: scriptedRoot });
      }
      const options: OpenDialogOptions = {
        properties: ["openDirectory"],
        title: "Locate Workspace Folder",
      };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled) {
        return null;
      }
      const rootPath = result.filePaths[0];
      if (!rootPath) {
        throw new Error("locate folder dialog returned no selected path");
      }
      return requireBackendClient().relocateWorkspace({ id, rootPath });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workspaceRefreshAvailability",
    async (_event, id) => {
      return requireBackendClient().refreshWorkspaceAvailability({ id });
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
  registerSpeechIpcHandlers({
    ipcMain,
    ipcObserver,
    onProviderSelectionChanged: broadcastSpeechProviderSelection,
    requireLocalMacOSVoiceHelper,
    requireLocalMacOSVoiceModelDownloadService,
    requireBackendClient,
    requireSpeechCredentialCoordinator,
    requireSpeechProviderSelectionStore,
  });
  registerMasterIpcHandlers({
    ipcMain,
    ipcObserver,
    requireBackendClient,
  });
  registerConversationIpcHandlers({
    conversationEvents,
    ipcMain,
    ipcObserver,
    requireBackendClient,
  });
  registerRoleConfigurationIpcHandlers({ ipcMain, ipcObserver, requireBackendClient });
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
}

function requireBackendClient(): BackendClient {
  const runtime = activeRuntime();
  if (!runtime) {
    throw new Error(runtimeUnavailableMessage());
  }
  return createBackendClient(runtime.baseUrl, backendRequests.wrapFetch(backendFetch()));
}

function createLocalSpeechCredentialClient(localRuntime: {
  baseUrl: string;
  deviceToken: string;
  runtimeId: string;
}): BackendClient {
  const fetchImpl = recorder?.createBackendFetch(fetch) ?? fetch;
  const authenticatedFetch = authenticatedBackendFetch(fetchImpl, localRuntime.deviceToken, () => {
    if (activeRuntime()?.runtimeId === localRuntime.runtimeId) {
      void runtimeRegistry?.markActiveRuntimeRevoked();
    }
  });
  return createBackendClient(
    localRuntime.baseUrl,
    localBackendRequests.wrapFetch(authenticatedFetch),
  );
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

function requireSpeechCredentialCoordinator(): SpeechCredentialCoordinator {
  if (!speechCredentialCoordinator) {
    throw new Error("speech credential coordinator is not ready");
  }
  return speechCredentialCoordinator;
}

function requireSpeechProviderSelectionStore(): SpeechProviderSelectionStore {
  if (!speechProviderSelectionStore) {
    throw new Error("speech provider selection store is not ready");
  }
  return speechProviderSelectionStore;
}

function requireLocalMacOSVoiceHelper(): LocalMacOSVoiceHelper {
  if (!localMacOSVoiceHelper) {
    throw new Error("local macOS voice helper is not ready");
  }
  return localMacOSVoiceHelper;
}

function requireLocalMacOSVoiceModelDownloadService(): LocalMacOSVoiceModelDownloadService {
  if (!localMacOSVoiceModelDownloadService) {
    throw new Error("local macOS voice model download service is not ready");
  }
  return localMacOSVoiceModelDownloadService;
}

function createSpeechCredentialCoordinator(): SpeechCredentialCoordinator {
  let vault: SpeechCredentialVault | null = null;
  let secureStorageUnavailableMessage: string | undefined;
  try {
    vault = new SpeechCredentialVault(
      app.getPath("userData"),
      createElectronSafeStorageCredentialProtection({ app, safeStorage }),
    );
  } catch (error) {
    secureStorageUnavailableMessage =
      error instanceof Error ? error.message : "Secure storage is unavailable.";
  }
  return new SpeechCredentialCoordinator({
    onSettingsChanged: broadcastSpeechCredentialSettings,
    secureStorageUnavailableMessage,
    vault,
  });
}

function runtimeUnavailableMessage() {
  const snapshot = runtimeRegistry?.snapshot();
  return snapshot?.connection.message ?? backendStartupError ?? "runtime is not connected";
}

async function stopBackend() {
  backendRequests.setStopping(true);
  localBackendRequests.setStopping(true);
  emitBackendProcessStatus({ message: "Backend is stopping", status: "offline" });
  await stopBackendEventStreams();
  await Promise.all([
    backendRequests.waitForIdle(backendRequestDrainTimeoutMs),
    localBackendRequests.waitForIdle(backendRequestDrainTimeoutMs),
  ]);
  await backend?.stop();
  backend = null;
  void speechCredentialCoordinator?.setLocalRuntime(null);
}

function requestQuit() {
  app.quit();
}

app.whenReady().then(async () => {
  if (isE2E() && !isVisibleE2E()) {
    app.dock?.hide();
  }
  const appDataDir = settaAppDataDir();
  recorder = createSessionRecorder(process.env, {
    appDataDir,
    desktopRoot: desktopRoot(),
    repoRoot: repoRoot(),
  });
  speechCredentialCoordinator = createSpeechCredentialCoordinator();
  speechProviderSelectionStore = new SpeechProviderSelectionStore(
    app.getPath("userData"),
    process.platform,
  );
  localMacOSVoiceModelDownloadService = createLocalMacOSVoiceModelDownloadService({
    onStatusChanged: broadcastLocalMacOSVoiceModelDownload,
    platform: process.platform,
    userDataDir: app.getPath("userData"),
  });
  localMacOSVoiceHelper = createLocalMacOSVoiceHelperFromEnvironment(
    process.env,
    process.platform,
    {
      defaultModel: localMacOSVoiceModelDownloadService.defaultModelConfiguration(),
      resourceRoots: localMacOSVoiceResourceRoots(),
    },
  );
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
  localMacOSVoiceModelDownloadService?.shutdown();
  localMacOSVoiceModelDownloadService = null;
  localMacOSVoiceHelper?.shutdown();
  localMacOSVoiceHelper = null;
  recorder?.close();
});

process.once("SIGINT", requestQuit);
process.once("SIGTERM", requestQuit);

configureElectronUserDataPath();
