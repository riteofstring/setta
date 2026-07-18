import type { BrowserWindow } from "electron";
import { ipcEvents } from "@shared/ipc";
import type { TerminalEvent } from "@generated/backend";

export function forwardTerminalEventToWindows(
  windows: readonly BrowserWindow[],
  event: TerminalEvent,
): void {
  for (const window of windows) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(ipcEvents.terminalEvent, event);
    }
  }
}
