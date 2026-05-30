import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { OpenDialogOptions } from "electron";
import { join, resolve } from "node:path";

import { createBackendClient, type BackendClient } from "@generated/backend";
import { handleIpc, ipcEvents } from "@shared/ipc";
import { startBackend, type BackendHandle } from "./backend-supervisor";
import {
  createBrowserPane,
  registerBrowserPaneIpc,
  type BrowserPaneController,
} from "./browser-pane";

let backend: BackendHandle | null = null;
let backendStartupError: string | null = null;
let browserPane: BrowserPaneController | null = null;
let ipcRegistered = false;
let mainWindow: BrowserWindow | null = null;
let quitting = false;

function desktopRoot() {
  return process.cwd();
}

function repoRoot() {
  return resolve(desktopRoot(), "..");
}

async function prepareBackend() {
  try {
    backend = await startBackend(repoRoot(), app.getPath("userData"), process.env);
    backendStartupError = null;
    backend.events.on("exit", (exit) => {
      if (!exit.expected) {
        mainWindow?.webContents.send(ipcEvents.backendUnexpectedExit, exit);
      }
    });
  } catch (error) {
    backend = null;
    backendStartupError = error instanceof Error ? error.message : "backend failed to start";
  }
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

  browserPane = createBrowserPane(mainWindow, join(desktopRoot(), "static/browser-preview.html"));
  registerIpc();

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    browserPane?.destroy();
    browserPane = null;
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
  handleIpc(ipcMain, "appVersions", () => ({
    app: app.getVersion(),
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  }));
  handleIpc(ipcMain, "backendHealth", async () => {
    return requireBackendClient().backendHealth();
  });
  handleIpc(ipcMain, "workspaceSession", async () => {
    return requireBackendClient().workspaceSession();
  });
  handleIpc(ipcMain, "workspaceOpenLocalFolder", async () => {
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
  });
  handleIpc(ipcMain, "workspaceSelect", async (_event, id) => {
    return requireBackendClient().selectWorkspace({ id });
  });
  handleIpc(ipcMain, "workspaceClose", async (_event, id) => {
    return requireBackendClient().closeWorkspace({ id });
  });
  handleIpc(ipcMain, "workspaceReorder", async (_event, ids) => {
    return requireBackendClient().reorderWorkspace({ ids });
  });
  handleIpc(ipcMain, "workspaceRemoveRecent", async (_event, id) => {
    return requireBackendClient().removeRecentWorkspace({ id });
  });
  registerBrowserPaneIpc(() => browserPane);
}

function requireBackendClient(): BackendClient {
  if (!backend) {
    throw new Error(backendStartupError ?? "backend is not running");
  }
  return createBackendClient(backend.url);
}

async function stopBackend() {
  await backend?.stop();
  backend = null;
}

function requestQuit() {
  app.quit();
}

app.whenReady().then(async () => {
  await prepareBackend();
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
  void stopBackend().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.once("SIGINT", requestQuit);
process.once("SIGTERM", requestQuit);
