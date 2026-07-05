import type { WorkspaceUIEvent } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";

interface WorkspaceUIEventWindow {
  isDestroyed: () => boolean;
  webContents: {
    isDestroyed?: () => boolean;
    send: (channel: string, event: WorkspaceUIEvent) => void;
  };
}

export function forwardWorkspaceUIEventToWindows(
  windows: readonly WorkspaceUIEventWindow[],
  event: WorkspaceUIEvent,
): void {
  for (const window of windows) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed?.()) {
      window.webContents.send(ipcEvents.workspaceUIEvent, event);
    }
  }
}
