import type { EasyRunEvent } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";

interface EasyRunEventWindow {
  isDestroyed: () => boolean;
  webContents: {
    isDestroyed: () => boolean;
    send: (channel: string, event: EasyRunEvent) => void;
  };
}

export function forwardEasyRunEventToWindows(
  windows: readonly EasyRunEventWindow[],
  event: EasyRunEvent,
): void {
  for (const window of windows) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(ipcEvents.easyRunEvent, event);
    }
  }
}
