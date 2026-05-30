import { contextBridge, ipcRenderer } from "electron";

import { createRendererIpcInvoke } from "@shared/ipc";
import type { BrowserPaneBounds, BrowserPanePoint, SettaAPI } from "@shared/types";

const invoke = createRendererIpcInvoke(ipcRenderer);

const api: SettaAPI = {
  app: {
    versions: () => invoke("appVersions"),
  },
  backend: {
    health: () => invoke("backendHealth"),
  },
  workspace: {
    close: (id: string) => invoke("workspaceClose", id),
    openLocalFolder: () => invoke("workspaceOpenLocalFolder"),
    removeRecent: (id: string) => invoke("workspaceRemoveRecent", id),
    reorder: (ids: string[]) => invoke("workspaceReorder", ids),
    select: (id: string) => invoke("workspaceSelect", id),
    session: () => invoke("workspaceSession"),
  },
  browserPane: {
    captureScreenshot: () => invoke("browserPaneCaptureScreenshot"),
    click: (point: BrowserPanePoint) => invoke("browserPaneClick", point),
    events: () => invoke("browserPaneEvents"),
    focus: () => invoke("browserPaneFocus"),
    inspect: (selector: string) => invoke("browserPaneInspect", selector),
    loadPreview: () => invoke("browserPaneLoadPreview"),
    setBounds: (bounds: BrowserPaneBounds) => invoke("browserPaneSetBounds", bounds),
    status: () => invoke("browserPaneStatus"),
    typeText: (text: string) => invoke("browserPaneTypeText", text),
  },
};

contextBridge.exposeInMainWorld("setta", api);
