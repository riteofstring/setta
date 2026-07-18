import type { WorkflowEvent } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";

interface WorkflowEventWindow {
  isDestroyed: () => boolean;
  webContents: {
    send: (channel: string, event: WorkflowEvent) => void;
  };
}

export function forwardWorkflowEventToWindows(
  windows: WorkflowEventWindow[],
  event: WorkflowEvent,
) {
  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcEvents.workflowEvent, event);
    }
  }
}
