import {
  base64FromBytes,
  errorMessage,
  isTerminalCopyShortcut,
  isTerminalPasteShortcut,
  isTerminalSearchShortcut,
} from "./terminal-ergonomics";
import type { TerminalPasteController } from "./terminal-surface-paste";
import type { TerminalSearchController } from "./terminal-surface-search";
import { terminalAPI } from "./terminal-surface-session";
import { createTerminalInputTrace } from "./terminal-latency-recorder";
import {
  isWorkspaceArrowNavigationShortcut,
  workspaceShortcutKeyboardEventInit,
} from "./workspace-shortcuts";

const inputChunkBytes = 64 * 1024;

interface TerminalInputCallbacks {
  showStatus: (message: string) => void;
}

interface TerminalKeyEventControllers {
  pasteController: Pick<TerminalPasteController, "copySelectionToClipboard" | "pasteFromClipboard">;
  searchController: Pick<TerminalSearchController, "open">;
}

export function handleTerminalKeyEvent(
  event: KeyboardEvent,
  { pasteController, searchController }: TerminalKeyEventControllers,
): boolean {
  event.stopPropagation();
  if (event.type !== "keydown") {
    return true;
  }
  if (isWorkspaceArrowNavigationShortcut(event)) {
    event.preventDefault();
    dispatchWorkspaceShortcut(event);
    return false;
  }
  if (isTerminalCopyShortcut(event)) {
    event.preventDefault();
    void pasteController.copySelectionToClipboard();
    return false;
  }
  if (isTerminalPasteShortcut(event)) {
    event.preventDefault();
    void pasteController.pasteFromClipboard();
    return false;
  }
  if (isTerminalSearchShortcut(event)) {
    event.preventDefault();
    searchController.open();
    return false;
  }
  return true;
}

export function sendTerminalInput(
  data: string,
  sessionId: string | null,
  { showStatus }: TerminalInputCallbacks,
): void {
  if (!sessionId) {
    return;
  }
  const bytes = new TextEncoder().encode(data);
  const api = terminalAPI();
  if (!api) {
    showStatus("Terminal preload API is unavailable.");
    return;
  }
  if (bytes.length <= inputChunkBytes) {
    api.input({
      dataBase64: base64FromBytes(bytes),
      sessionId,
      trace: createTerminalInputTrace(sessionId, bytes.length),
    });
    return;
  }
  sendChunkedTerminalInput(api, sessionId, bytes);
}

export function openTerminalExternalUrl(
  event: MouseEvent,
  uri: string,
  { showStatus }: TerminalInputCallbacks,
): void {
  event.preventDefault();
  event.stopPropagation();
  const api = window.setta?.app;
  if (!api) {
    showStatus("External URL API is unavailable.");
    return;
  }
  void api.openExternalUrl(uri).catch((error: unknown) => {
    showStatus(`Link blocked: ${errorMessage(error)}`);
  });
}

function dispatchWorkspaceShortcut(event: KeyboardEvent): void {
  window.dispatchEvent(new KeyboardEvent("keydown", workspaceShortcutKeyboardEventInit(event)));
}

function sendChunkedTerminalInput(
  api: NonNullable<ReturnType<typeof terminalAPI>>,
  sessionId: string,
  bytes: Uint8Array,
): void {
  for (let offset = 0; offset < bytes.length; offset += inputChunkBytes) {
    const chunk = bytes.slice(offset, offset + inputChunkBytes);
    api.input({
      dataBase64: base64FromBytes(chunk),
      sessionId,
      trace: createTerminalInputTrace(sessionId, chunk.length),
    });
  }
}
