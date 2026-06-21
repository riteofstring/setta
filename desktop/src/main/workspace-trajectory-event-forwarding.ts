import type { BrowserWindow } from "electron";

import type { WorkspaceTrajectoryRuntimeEvent } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";

export function forwardWorkspaceTrajectoryRuntimeEventToWindows(
  windows: readonly BrowserWindow[],
  event: WorkspaceTrajectoryRuntimeEvent,
): void {
  for (const window of windows) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(ipcEvents.workspaceTrajectoryRuntimeEvent, event);
    }
  }
}
