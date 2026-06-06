import { execFile } from "node:child_process";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  createBackendClient,
  type BackendClient,
  type ChatEvent,
  type WorkflowEvent,
} from "@generated/backend";
import { handleIpc, ipcEvents, ipcMessages } from "@shared/ipc";
import { recordingRendererEventChannel, type RendererRecordedEvent } from "@shared/recording";
import type { BackendEventStreamStatus, BackendProcessStatus } from "@shared/types";
import { startBackendEventStream, type BackendEventStream } from "./backend-event-stream";
import { createBackendStatusBroadcaster } from "./backend-status";
import { startBackend, type BackendHandle } from "./backend-supervisor";
import { forwardChatEventToWindows } from "./chat-event-forwarding";
import { listInstalledEditorApps, openWorkspaceInEditor } from "./editor-apps";
import { createElectronWebContentsViewRegistry } from "./niri-browser-views";
import { createSessionRecorder, type SessionRecorder } from "./session-recorder";
import { forwardWorkflowEventToWindows } from "./workflow-event-forwarding";
import { startWorkflowEventStream, type WorkflowEventStream } from "./workflow-event-stream";
import { readWorkspaceGitInfo } from "./workspace-actions";

let backend: BackendHandle | null = null;
let backendEventStream: BackendEventStream | null = null;
let workflowEventStream: WorkflowEventStream | null = null;
let backendStartupError: string | null = null;
let ipcRegistered = false;
let mainWindow: BrowserWindow | null = null;
let quitting = false;
let recorder: SessionRecorder | null = null;
const backendStatuses = createBackendStatusBroadcaster(() => BrowserWindow.getAllWindows());
const execFileAsync = promisify(execFile);
const compactWindowMinHeight = 320;
const compactWindowMinWidth = 320;
const niriBrowserViews = createElectronWebContentsViewRegistry();

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
    emitBackendProcessStatus({
      message: backend.mode === "external" ? "Using external backend" : "Backend online",
      mode: backend.mode,
      status: "online",
      url: backend.url,
    });
    recorder?.recordAppEvent("backend_started", {
      mode: backend.mode,
      url: backend.url,
    });
    for (const line of backend.recentLogs()) {
      recorder?.recordBackendLog(line);
    }
    backend.events.on("log", (line) => {
      recorder?.recordBackendLog(line);
    });
    backend.events.on("exit", (exit) => {
      recorder?.recordBackendExit(exit);
      void stopBackendEventStreams();
      if (!exit.expected) {
        emitBackendProcessStatus({ message: "Backend exited unexpectedly", status: "offline" });
        mainWindow?.webContents.send(ipcEvents.backendUnexpectedExit, exit);
        void recorder?.captureScreenshot(mainWindow, "backend-unexpected-exit");
      }
    });
    startChatEventStream();
    startWorkflowEventStreamForwarding();
  } catch (error) {
    backend = null;
    backendStartupError = error instanceof Error ? error.message : "backend failed to start";
    emitBackendProcessStatus({ message: backendStartupError, status: "failed" });
    emitBackendEventStreamStatus({ message: "Backend event stream stopped", status: "stopped" });
    recorder?.recordBackendStartupError(backendStartupError);
  }
}

function startChatEventStream() {
  if (!backend) {
    return;
  }
  void stopChatEventStream();
  backendEventStream = startBackendEventStream({
    baseURL: backend.url,
    fetchImpl: recorder?.createBackendFetch(fetch) ?? fetch,
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
      },
    },
    sendEvent: forwardChatEvent,
  });
}

function startWorkflowEventStreamForwarding() {
  if (!backend) {
    return;
  }
  void stopWorkflowEventStreamForwarding();
  workflowEventStream = startWorkflowEventStream({
    baseURL: backend.url,
    fetchImpl: recorder?.createBackendFetch(fetch) ?? fetch,
    sendEvent: forwardWorkflowEvent,
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

async function stopBackendEventStreams() {
  await Promise.all([stopChatEventStream(), stopWorkflowEventStreamForwarding()]);
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

function settaAppDataDir() {
  return process.env.SETTA_APP_DATA_DIR ?? join(homedir(), ".setta");
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

async function createWindow() {
  mainWindow = new BrowserWindow({
    backgroundColor: "#18181b",
    height: 820,
    minHeight: compactWindowMinHeight,
    minWidth: compactWindowMinWidth,
    show: false,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 12, y: 12 },
        }
      : {}),
    title: "Setta",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
    },
    width: 1280,
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
    niriBrowserViews.teardownAll();
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
  const niriScene = process.env.SETTA_E2E_NIRI_SCENE;
  if (!niriScene) {
    return null;
  }
  return { niriScene };
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
  ipcMain.on(ipcMessages.niriBrowserViewBatch, (event, batch) => {
    niriBrowserViews.applyBatch(event, batch);
  });
  handleIpc(
    ipcMain,
    "appInstalledEditors",
    () => {
      return listInstalledEditorApps(readEditorIconDataURL);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appOpenWorkspaceInEditor",
    async (_event, editorId, rootPath) => {
      await openWorkspaceInEditor(editorId, rootPath, {
        openPath: shell.openPath,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appWorkspaceGitInfo",
    async (_event, rootPath) => {
      return readWorkspaceGitInfo(rootPath);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appVersions",
    () => ({
      app: app.getVersion(),
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
    }),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appOpenExternalUrl",
    async (_event, rawURL) => {
      await openExternalURL(rawURL);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "backendHealth",
    async () => {
      return requireBackendClient().backendHealth();
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
  handleIpc(
    ipcMain,
    "chatListConversations",
    async (_event, workspaceId) => {
      return requireBackendClient().listConversations({ workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatCreateConversation",
    async (_event, workspaceId, title) => {
      return requireBackendClient().createConversation({ title, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatMarkConversationRead",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().markConversationRead({ conversationId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatMessagePage",
    async (_event, workspaceId, conversationId, beforeOrdinal, limit) => {
      return requireBackendClient().getMessagePage({
        beforeOrdinal,
        conversationId,
        limit,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatListCommands",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().listChatCommands({ conversationId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatExecuteCommand",
    async (_event, workspaceId, conversationId, raw, confirmGoalReplacement) => {
      return requireBackendClient().executeChatCommand({
        confirmGoalReplacement,
        conversationId,
        raw,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSetCodexModel",
    async (_event, workspaceId, conversationId, modelId) => {
      return requireBackendClient().setChatCodexModel({
        conversationId,
        modelId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSetCodexReasoningEffort",
    async (_event, workspaceId, conversationId, reasoningEffort) => {
      return requireBackendClient().setChatCodexReasoningEffort({
        conversationId,
        reasoningEffort,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSendMessage",
    async (_event, workspaceId, conversationId, prompt) => {
      return requireBackendClient().sendChatMessage({ conversationId, prompt, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatQueueMessage",
    async (_event, workspaceId, conversationId, prompt) => {
      return requireBackendClient().queueChatMessage({ conversationId, prompt, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatEditQueuedMessage",
    async (_event, workspaceId, conversationId, messageId, prompt) => {
      return requireBackendClient().editQueuedChatMessage({
        conversationId,
        messageId,
        prompt,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatRemoveQueuedMessage",
    async (_event, workspaceId, conversationId, messageId) => {
      return requireBackendClient().removeQueuedChatMessage({
        conversationId,
        messageId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSteerMessage",
    async (_event, workspaceId, conversationId, prompt) => {
      return requireBackendClient().steerChatMessage({ conversationId, prompt, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSendSteeringImmediately",
    async (_event, workspaceId, conversationId, prompt) => {
      return requireBackendClient().sendSteeringImmediately({
        conversationId,
        prompt,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatCancelRun",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().cancelRun({ conversationId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatActiveRun",
    async (_event, workspaceId, conversationId) => {
      return requireBackendClient().getActiveRun({ conversationId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatRunActivity",
    async (_event, workspaceId, runId, limit) => {
      return requireBackendClient().getRunActivity({ limit, runId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatRunItemOutput",
    async (_event, ...args) => {
      const [workspaceId, runId, runItemId, afterOrdinal, limit] = args;
      return requireBackendClient().getRunItemOutputPage({
        afterOrdinal,
        limit,
        runId,
        runItemId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "chatSubmitApproval",
    async (_event, input) => {
      return requireBackendClient().submitApproval(input);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowListDefinitions",
    async (_event, workspaceId) => {
      return requireBackendClient().listWorkflowDefinitions({ workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowCreateDefinition",
    async (_event, workspaceId, name, description, graph) => {
      return requireBackendClient().createWorkflowDefinition({
        description,
        graph,
        name,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowReadDefinition",
    async (_event, workspaceId, definitionId) => {
      return requireBackendClient().readWorkflowDefinition({ definitionId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowUpdateDefinition",
    async (_event, ...args) => {
      const [workspaceId, definitionId, name, description, graph] = args;
      return requireBackendClient().updateWorkflowDefinition({
        definitionId,
        description,
        graph,
        name,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowDeleteDefinition",
    async (_event, workspaceId, definitionId) => {
      return requireBackendClient().deleteWorkflowDefinition({ definitionId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowValidateDefinition",
    async (_event, workspaceId, graph) => {
      return requireBackendClient().validateWorkflowDefinition({ graph, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowStartExecution",
    async (_event, workspaceId, definitionId, versionId) => {
      return requireBackendClient().startWorkflowExecution({
        definitionId,
        versionId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowCancelExecution",
    async (_event, workspaceId, executionId) => {
      return requireBackendClient().cancelWorkflowExecution({ executionId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowReadExecution",
    async (_event, workspaceId, executionId) => {
      return requireBackendClient().readWorkflowExecution({ executionId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowExecutionEvents",
    async (_event, workspaceId, executionId, beforeOrdinal, limit) => {
      return requireBackendClient().getWorkflowExecutionEvents({
        beforeOrdinal,
        executionId,
        limit,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowGraphProjection",
    async (_event, workspaceId, definitionId, versionId, executionId) => {
      return requireBackendClient().readWorkflowGraphProjection({
        definitionId,
        executionId,
        versionId,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "workflowSubmitApproval",
    async (_event, request) => {
      return requireBackendClient().submitWorkflowApproval(request);
    },
    ipcObserver,
  );
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
    "niriBrowserViewStats",
    () => {
      return niriBrowserViews.readStats();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "niriBrowserViewsTeardown",
    (_event, workspaceId) => {
      return niriBrowserViews.teardownWorkspace(workspaceId);
    },
    ipcObserver,
  );
}

function externalURL(rawURL: string) {
  const url = new URL(rawURL);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("external URL must use http or https: " + rawURL);
  }
  return url.toString();
}

async function openExternalURL(rawURL: string) {
  const url = externalURL(rawURL);
  if (process.env.SETTA_E2E_BLOCK_EXTERNAL_OPEN === "1") {
    recorder?.recordAppEvent("external_url_open_blocked", { url });
    return;
  }
  await shell.openExternal(url);
}

function requireBackendClient(): BackendClient {
  if (!backend) {
    throw new Error(backendStartupError ?? "backend is not running");
  }
  return createBackendClient(backend.url, recorder?.createBackendFetch(fetch) ?? fetch);
}

async function readEditorIconDataURL(iconPath: string, appPath: string) {
  if (process.platform === "darwin" && iconPath.endsWith(".icns")) {
    return convertIcnsToDataURL(iconPath);
  }
  const icon = await app.getFileIcon(appPath, { size: "large" });
  return icon.toDataURL();
}

async function convertIcnsToDataURL(iconPath: string) {
  const dir = await mkdtemp(join(tmpdir(), "setta-editor-icon-"));
  const outputPath = join(dir, "icon.png");
  try {
    await execFileAsync(
      "/usr/bin/sips",
      ["-s", "format", "png", "-Z", "32", iconPath, "--out", outputPath],
      {
        timeout: 5_000,
        windowsHide: true,
      },
    );
    const bytes = await readFile(outputPath);
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

async function stopBackend() {
  await stopBackendEventStreams();
  await backend?.stop();
  backend = null;
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
