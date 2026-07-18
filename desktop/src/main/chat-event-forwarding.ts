import type { ChatEvent } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";

interface ChatEventWindow {
  isDestroyed: () => boolean;
  webContents: {
    send: (channel: string, event: ChatEvent) => void;
  };
}

export function forwardChatEventToWindows(windows: ChatEventWindow[], event: ChatEvent) {
  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcEvents.chatEvent, event);
    }
  }
}
