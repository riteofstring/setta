import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { OpenDialogOptions } from "electron";
import { join, resolve } from "node:path";

import { fetchBackendHealth } from "./backend-health";
import { startBackend, type BackendHandle } from "./backend-supervisor";
import {
  closeWorkspace,
  fetchWorkspaceSession,
  openWorkspace,
  removeRecentWorkspace,
  reorderWorkspaces,
  selectWorkspace,
} from "./backend-workspace";
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
        mainWindow?.webContents.send("backend:unexpected-exit", exit);
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
  ipcMain.handle("app:versions", () => ({
    app: app.getVersion(),
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  }));
  ipcMain.handle("backend:health", async () => {
    if (!backend) {
      throw new Error(backendStartupError ?? "backend is not running");
    }
    return fetchBackendHealth(backend.url);
  });
  ipcMain.handle("workspace:session", async () => {
    if (!backend) {
      throw new Error(backendStartupError ?? "backend is not running");
    }
    return fetchWorkspaceSession(backend.url);
  });
  ipcMain.handle("workspace:open-local-folder", async () => {
    if (!backend) {
      throw new Error(backendStartupError ?? "backend is not running");
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
    return openWorkspace(backend.url, { rootPath });
  });
  ipcMain.handle("workspace:select", async (_event, id: string) => {
    if (!backend) {
      throw new Error(backendStartupError ?? "backend is not running");
    }
    return selectWorkspace(backend.url, { id });
  });
  ipcMain.handle("workspace:close", async (_event, id: string) => {
    if (!backend) {
      throw new Error(backendStartupError ?? "backend is not running");
    }
    return closeWorkspace(backend.url, { id });
  });
  ipcMain.handle("workspace:reorder", async (_event, ids: string[]) => {
    if (!backend) {
      throw new Error(backendStartupError ?? "backend is not running");
    }
    return reorderWorkspaces(backend.url, { ids });
  });
  ipcMain.handle("workspace:remove-recent", async (_event, id: string) => {
    if (!backend) {
      throw new Error(backendStartupError ?? "backend is not running");
    }
    return removeRecentWorkspace(backend.url, { id });
  });
  registerBrowserPaneIpc(() => browserPane);
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
