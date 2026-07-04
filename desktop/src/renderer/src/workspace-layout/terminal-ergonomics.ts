import type { ISearchOptions } from "@xterm/addon-search";

export function terminalSearchOptions(incremental: boolean): ISearchOptions {
  return {
    decorations: {
      activeMatchBackground: "#facc15",
      activeMatchBorder: "#fde68a",
      activeMatchColorOverviewRuler: "#facc15",
      matchBackground: "#1d4ed8",
      matchBorder: "#93c5fd",
      matchOverviewRuler: "#60a5fa",
    },
    incremental,
  };
}

function browserClipboard(): Clipboard | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.navigator?.clipboard ?? null;
}

interface TerminalClipboardSelection {
  clearSelection(): void;
  getSelection(): string;
  hasSelection(): boolean;
}

export async function copyTerminalSelectionToClipboard(
  terminal: TerminalClipboardSelection | null,
  showStatus: (message: string) => void,
): Promise<void> {
  if (!terminal?.hasSelection()) {
    return;
  }
  const clipboard = browserClipboard();
  if (!clipboard?.writeText) {
    showStatus("Clipboard write is unavailable.");
    return;
  }
  try {
    await clipboard.writeText(terminal.getSelection());
    terminal.clearSelection();
    showStatus("Copied selection");
  } catch (error) {
    showStatus(`Copy failed: ${errorMessage(error)}`);
  }
}

export async function readTerminalClipboard(
  requestPaste: (text: string) => void,
  showStatus: (message: string) => void,
): Promise<void> {
  const clipboard = browserClipboard();
  if (!clipboard?.readText) {
    showStatus("Clipboard read is unavailable.");
    return;
  }
  try {
    requestPaste(await clipboard.readText());
  } catch (error) {
    showStatus(`Paste failed: ${errorMessage(error)}`);
  }
}

export function isTerminalCopyShortcut(event: KeyboardEvent): boolean {
  if (isMacPlatform()) {
    return isMacCommand(event, "c");
  }
  return isControlShiftCommand(event, "c");
}

export function isTerminalPasteShortcut(event: KeyboardEvent): boolean {
  if (isMacPlatform()) {
    return isMacCommand(event, "v");
  }
  return isControlShiftCommand(event, "v") || isShiftInsert(event);
}

export function isTerminalSearchShortcut(event: KeyboardEvent): boolean {
  if (isMacPlatform()) {
    return isMacCommand(event, "f");
  }
  return isControlShiftCommand(event, "f");
}

export function bytesFromBase64(dataBase64: string): Uint8Array {
  const raw = window.atob(dataBase64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

export function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

export function statusLabel(status: string, cwd: string): string {
  if (status === "running") {
    return cwd;
  }
  return status;
}

export function exitStatusLabel(exitCode: number, message: string): string {
  if (exitCode === 0) {
    return "Terminal exited";
  }
  return message || `Terminal exited with code ${exitCode}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Terminal failed";
}

function isMacPlatform(): boolean {
  return typeof window !== "undefined" && window.setta?.app.platform === "darwin";
}

function isMacCommand(event: KeyboardEvent, key: string): boolean {
  return event.metaKey && !event.ctrlKey && !event.altKey && normalizedKey(event) === key;
}

function isControlShiftCommand(event: KeyboardEvent, key: string): boolean {
  return event.ctrlKey && event.shiftKey && !event.altKey && normalizedKey(event) === key;
}

function isShiftInsert(event: KeyboardEvent): boolean {
  return event.shiftKey && !event.ctrlKey && !event.altKey && event.key === "Insert";
}

function normalizedKey(event: KeyboardEvent): string {
  return event.key.toLowerCase();
}
