import type { WorkspaceActivityEvent } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";

interface WorkspaceActivityEventWindow {
  isDestroyed: () => boolean;
  webContents: {
    send: (channel: string, event: WorkspaceActivityEvent) => void;
  };
}

export function forwardWorkspaceActivityEventToWindows(
  windows: WorkspaceActivityEventWindow[],
  event: WorkspaceActivityEvent,
) {
  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcEvents.workspaceActivityEvent, event);
    }
  }
}
