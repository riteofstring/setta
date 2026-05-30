import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { OpenDialogOptions } from "electron";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createBackendClient, type BackendClient, type ChatEvent } from "@generated/backend";
import { handleIpc, ipcEvents } from "@shared/ipc";
import { recordingRendererEventChannel, type RendererRecordedEvent } from "@shared/recording";
import { startBackendEventStream, type BackendEventStream } from "./backend-event-stream";
import { startBackend, type BackendHandle } from "./backend-supervisor";
import { forwardChatEventToWindows } from "./chat-event-forwarding";
import { createSessionRecorder, type SessionRecorder } from "./session-recorder";

let backend: BackendHandle | null = null;
let backendEventStream: BackendEventStream | null = null;
let backendStartupError: string | null = null;
let ipcRegistered = false;
let mainWindow: BrowserWindow | null = null;
let quitting = false;
let recorder: SessionRecorder | null = null;

function desktopRoot() {
  return process.cwd();
}

function repoRoot() {
  return resolve(desktopRoot(), "..");
}

async function prepareBackend(appDataDir: string) {
  try {
    backend = await startBackend(repoRoot(), appDataDir, process.env);
    backendStartupError = null;
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
      void stopChatEventStream();
      if (!exit.expected) {
        mainWindow?.webContents.send(ipcEvents.backendUnexpectedExit, exit);
        void recorder?.captureScreenshot(mainWindow, "backend-unexpected-exit");
      }
    });
    startChatEventStream();
  } catch (error) {
    backend = null;
    backendStartupError = error instanceof Error ? error.message : "backend failed to start";
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
        recorder?.recordAppEvent("chat_event_stream_" + event.type, event);
      },
    },
    sendEvent: forwardChatEvent,
  });
}

async function stopChatEventStream() {
  const stream = backendEventStream;
  backendEventStream = null;
  await stream?.stop();
}

function forwardChatEvent(event: ChatEvent) {
  forwardChatEventToWindows(BrowserWindow.getAllWindows(), event);
}

function settaAppDataDir() {
  return process.env.SETTA_APP_DATA_DIR ?? join(homedir(), ".setta");
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    height: 820,
    minHeight: 620,
    minWidth: 960,
    show: false,
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
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
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
    "chatSendMessage",
    async (_event, workspaceId, conversationId, prompt) => {
      return requireBackendClient().sendChatMessage({ conversationId, prompt, workspaceId });
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
    "chatSubmitApproval",
    async (_event, input) => {
      return requireBackendClient().submitApproval(input);
    },
    ipcObserver,
  );
}

function requireBackendClient(): BackendClient {
  if (!backend) {
    throw new Error(backendStartupError ?? "backend is not running");
  }
  return createBackendClient(backend.url, recorder?.createBackendFetch(fetch) ?? fetch);
}

async function stopBackend() {
  await stopChatEventStream();
  await backend?.stop();
  backend = null;
}

function requestQuit() {
  app.quit();
}

app.whenReady().then(async () => {
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
