import type { BrowserWindow } from "electron";

import type { SemanticGraphChangeEvent } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";

export function forwardSemanticGraphEventToWindows(
  windows: readonly BrowserWindow[],
  event: SemanticGraphChangeEvent,
): void {
  for (const window of windows) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(ipcEvents.semanticGraphEvent, event);
    }
  }
}
