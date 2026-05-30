import { contextBridge, ipcRenderer } from "electron";

import type { BrowserPaneBounds, BrowserPanePoint, SettaAPI } from "@shared/types";

const api: SettaAPI = {
  app: {
    versions: () => ipcRenderer.invoke("app:versions"),
  },
  backend: {
    health: () => ipcRenderer.invoke("backend:health"),
  },
  workspace: {
    close: (id: string) => ipcRenderer.invoke("workspace:close", id),
    openLocalFolder: () => ipcRenderer.invoke("workspace:open-local-folder"),
    removeRecent: (id: string) => ipcRenderer.invoke("workspace:remove-recent", id),
    reorder: (ids: string[]) => ipcRenderer.invoke("workspace:reorder", ids),
    select: (id: string) => ipcRenderer.invoke("workspace:select", id),
    session: () => ipcRenderer.invoke("workspace:session"),
  },
  browserPane: {
    captureScreenshot: () => ipcRenderer.invoke("browser-pane:capture-screenshot"),
    click: (point: BrowserPanePoint) => ipcRenderer.invoke("browser-pane:click", point),
    events: () => ipcRenderer.invoke("browser-pane:events"),
    focus: () => ipcRenderer.invoke("browser-pane:focus"),
    inspect: (selector: string) => ipcRenderer.invoke("browser-pane:inspect", selector),
    loadPreview: () => ipcRenderer.invoke("browser-pane:load-preview"),
    setBounds: (bounds: BrowserPaneBounds) => ipcRenderer.invoke("browser-pane:set-bounds", bounds),
    status: () => ipcRenderer.invoke("browser-pane:status"),
    typeText: (text: string) => ipcRenderer.invoke("browser-pane:type-text", text),
  },
};

contextBridge.exposeInMainWorld("setta", api);
