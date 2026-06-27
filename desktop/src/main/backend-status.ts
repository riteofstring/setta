import { ipcEvents } from "@shared/ipc";
import type { BackendEventStreamStatus, BackendProcessStatus } from "@shared/types";

interface StatusWebContents {
  send: (channel: string, payload: unknown) => void;
}

interface StatusWindow {
  webContents: StatusWebContents;
}

export interface BackendStatusBroadcaster {
  currentEventStreamStatus: () => BackendEventStreamStatus;
  currentProcessStatus: () => BackendProcessStatus;
  emitEventStreamStatus: (status: BackendEventStreamStatus) => void;
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
  let eventStreamStatus: BackendEventStreamStatus = {
    message: "Backend event stream has not started",
    status: "stopped",
  };

  function broadcast(channel: string, payload: unknown) {
    for (const window of windows()) {
      window.webContents.send(channel, payload);
    }
  }

  return {
    currentEventStreamStatus: () => eventStreamStatus,
    currentProcessStatus: () => processStatus,
    emitEventStreamStatus: (status) => {
      eventStreamStatus = status;
      broadcast(ipcEvents.backendEventStreamStatus, status);
    },
    emitProcessStatus: (status) => {
      processStatus = status;
      broadcast(ipcEvents.backendProcessStatus, status);
    },
    sendToWindow: (window) => {
      window.webContents.send(ipcEvents.backendProcessStatus, processStatus);
      window.webContents.send(ipcEvents.backendEventStreamStatus, eventStreamStatus);
    },
  };
}
