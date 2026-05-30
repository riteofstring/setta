import { contextBridge, ipcRenderer } from "electron";

import type { BrowserPaneBounds, BrowserPanePoint, SettaAPI } from "@shared/types";

const api: SettaAPI = {
  app: {
    versions: () => ipcRenderer.invoke("app:versions"),
  },
  backend: {
    health: () => ipcRenderer.invoke("backend:health"),
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
