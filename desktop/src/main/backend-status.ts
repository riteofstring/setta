import { ipcEvents } from "@shared/ipc";
import type { BackendProcessStatus } from "@shared/types";

interface StatusWebContents {
  send: (channel: string, payload: unknown) => void;
}

interface StatusWindow {
  webContents: StatusWebContents;
}

export interface BackendStatusBroadcaster {
  currentProcessStatus: () => BackendProcessStatus;
  emitProcessStatus: (status: BackendProcessStatus) => void;
  sendToWindow: (window: StatusWindow) => void;
}

export function createBackendStatusBroadcaster(
  windows: () => StatusWindow[],
): BackendStatusBroadcaster {
  let processStatus: BackendProcessStatus = {
    message: "Backend has not started",
    status: "offline",
  };

  function broadcast(channel: string, payload: unknown) {
    for (const window of windows()) {
      window.webContents.send(channel, payload);
    }
  }

  return {
    currentProcessStatus: () => processStatus,
    emitProcessStatus: (status) => {
      processStatus = status;
      broadcast(ipcEvents.backendProcessStatus, status);
    },
    sendToWindow: (window) => {
      window.webContents.send(ipcEvents.backendProcessStatus, processStatus);
    },
  };
}
