import type { Terminal as XtermTerminal } from "@xterm/xterm";

import { browserClipboard, errorMessage, formatBytes } from "./terminal-ergonomics";

const largePasteWarningBytes = 16 * 1024;
const maxPasteBytes = 1024 * 1024;

interface PendingPaste {
  byteCount: number;
  text: string;
}

export interface TerminalPasteControllerHost {
  getSessionId: () => string | null;
  getTerminal: () => XtermTerminal | null;
  hidePasteOverlay: () => void;
  sendInput: (data: string) => void;
  showPasteOverlay: (message: string, confirmable: boolean) => void;
  showStatus: (message: string) => void;
}

export class TerminalPasteController {
  private pendingPaste: PendingPaste | null = null;

  constructor(private readonly host: TerminalPasteControllerHost) {}

  handleCopyEvent(event: ClipboardEvent): void {
    const terminal = this.host.getTerminal();
    if (!terminal?.hasSelection()) {
      return;
    }
    const selection = terminal.getSelection();
    event.clipboardData?.setData("text/plain", selection);
    event.preventDefault();
    terminal.clearSelection();
    this.host.showStatus("Copied selection");
  }

  handlePasteEvent(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text.length === 0) {
      return;
    }
    event.preventDefault();
    this.requestPaste(text);
  }

  async copySelectionToClipboard(): Promise<void> {
    const terminal = this.host.getTerminal();
    if (!terminal?.hasSelection()) {
      return;
    }
    const clipboard = browserClipboard();
    if (!clipboard?.writeText) {
      this.host.showStatus("Clipboard write is unavailable.");
      return;
    }
    try {
      await clipboard.writeText(terminal.getSelection());
      terminal.clearSelection();
      this.host.showStatus("Copied selection");
    } catch (error) {
      this.host.showStatus(`Copy failed: ${errorMessage(error)}`);
    }
  }

  async pasteFromClipboard(): Promise<void> {
    const clipboard = browserClipboard();
    if (!clipboard?.readText) {
      this.host.showStatus("Clipboard read is unavailable.");
      return;
    }
    try {
      this.requestPaste(await clipboard.readText());
    } catch (error) {
      this.host.showStatus(`Paste failed: ${errorMessage(error)}`);
    }
  }

  confirmPendingPaste(): void {
    const pending = this.pendingPaste;
    if (!pending) {
      this.host.hidePasteOverlay();
      return;
    }
    this.pendingPaste = null;
    this.host.hidePasteOverlay();
    this.host.showStatus(`Pasting ${formatBytes(pending.byteCount)}`);
    this.pasteText(pending.text);
  }

  cancelPendingPaste(): void {
    this.pendingPaste = null;
    this.host.hidePasteOverlay();
    this.host.showStatus("Paste cancelled");
    this.host.getTerminal()?.focus();
  }

  clearPendingPaste(): void {
    this.pendingPaste = null;
  }

  private requestPaste(text: string): void {
    if (text.length === 0) {
      return;
    }
    if (!this.host.getSessionId()) {
      this.host.showStatus("Terminal session is not ready.");
      return;
    }
    const byteCount = new TextEncoder().encode(text).byteLength;
    if (byteCount > maxPasteBytes) {
      this.pendingPaste = null;
      this.host.showPasteOverlay(
        `Paste is ${formatBytes(byteCount)}; limit is ${formatBytes(maxPasteBytes)}.`,
        false,
      );
      this.host.showStatus("Paste rejected");
      return;
    }
    if (byteCount >= largePasteWarningBytes) {
      this.pendingPaste = { byteCount, text };
      this.host.showPasteOverlay(`Paste ${formatBytes(byteCount)} into terminal?`, true);
      this.host.showStatus("Paste waiting for confirmation");
      return;
    }
    this.pasteText(text);
  }

  private pasteText(text: string): void {
    const terminal = this.host.getTerminal();
    if (!terminal) {
      this.host.sendInput(text);
      return;
    }
    terminal.paste(text);
    terminal.focus();
  }
}
