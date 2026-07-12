import type { BrowserWindow } from "electron";

import { ipcEvents } from "@shared/ipc";
import type { BackendProcessStatus } from "@shared/types";
import type { BackendHandle } from "./backend-supervisor";
import type { RuntimeRegistryController } from "./runtime-registry";
import type { SessionRecorder } from "./session-recorder";

interface BackendExitEvent {
  code: number | null;
  expected: boolean;
  signal: NodeJS.Signals | null;
}

interface BackendObserverOptions {
  backend: BackendHandle;
  emitBackendProcessStatus: (status: BackendProcessStatus) => void;
  isE2E: () => boolean;
  mainWindow: () => BrowserWindow | null;
  recorder: () => SessionRecorder | null;
  runtimeRegistry: () => RuntimeRegistryController | null;
  stopBackendEventStreams: () => Promise<void>;
}

export function attachBackendObservers(options: BackendObserverOptions): void {
  options.recorder()?.recordAppEvent("backend_started", {
    ...(options.isE2E() ? { bootstrapToken: options.backend.bootstrapToken } : {}),
    mode: options.backend.mode,
    url: options.backend.url,
  });
  for (const line of options.backend.recentLogs()) {
    options.recorder()?.recordBackendLog(line);
  }
  options.backend.events.on("log", (line) => {
    options.recorder()?.recordBackendLog(line);
  });
  options.backend.events.on("exit", (exit) => {
    options.recorder()?.recordBackendExit(exit);
    void options.stopBackendEventStreams();
    if (!exit.expected) {
      handleUnexpectedBackendExit(exit, options);
    }
  });
}

function handleUnexpectedBackendExit(
  exit: BackendExitEvent,
  options: BackendObserverOptions,
): void {
  const registry = options.runtimeRegistry();
  if (registry?.currentRuntime()?.isLocal) {
    void registry.markActiveRuntimeUnreachable("Local backend exited unexpectedly");
  } else {
    options.emitBackendProcessStatus({
      message: "Backend exited unexpectedly",
      status: "offline",
    });
  }
  const window = options.mainWindow();
  window?.webContents.send(ipcEvents.backendUnexpectedExit, exit);
  void options.recorder()?.captureScreenshot(window, "backend-unexpected-exit");
}
