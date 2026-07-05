import type { WorkspacePane } from "./types";

export interface TerminalSearchElements {
  closeButton: HTMLButtonElement;
  input: HTMLInputElement;
  nextButton: HTMLButtonElement;
  previousButton: HTMLButtonElement;
  root: HTMLElement;
  status: HTMLElement;
}

export interface TerminalPasteElements {
  cancelButton: HTMLButtonElement;
  confirmButton: HTMLButtonElement;
  message: HTMLElement;
  root: HTMLElement;
}

export interface TerminalSurfaceContent {
  closeButton: HTMLButtonElement;
  exitOverlay: HTMLElement;
  exitOverlayMessage: HTMLElement;
  pasteOverlay: TerminalPasteElements;
  restartButton: HTMLButtonElement;
  root: HTMLElement;
  search: TerminalSearchElements;
  viewport: HTMLElement;
}

export function renderXtermContent(host: HTMLElement, pane: WorkspacePane): TerminalSurfaceContent {
  const document = host.ownerDocument;
  const root = document.createElement("div");
  root.className = "workspace-pane-content workspace-terminal-surface workspace-xterm-surface";

  const viewport = document.createElement("div");
  viewport.className = "workspace-xterm-viewport";
  viewport.setAttribute("data-terminal-viewport", "true");
  viewport.setAttribute("aria-label", `${pane.title} terminal`);

  const search = renderTerminalSearch(document);
  const pasteOverlay = renderTerminalPasteOverlay(document);

  const exitOverlay = document.createElement("div");
  exitOverlay.className = "workspace-terminal-exit-overlay";
  exitOverlay.setAttribute("hidden", "true");
  const exitOverlayMessage = document.createElement("div");
  exitOverlayMessage.className = "workspace-terminal-exit-message";
  const actions = document.createElement("div");
  actions.className = "workspace-terminal-exit-actions";
  const restartButton = document.createElement("button");
  restartButton.className = "workspace-terminal-exit-action";
  restartButton.type = "button";
  restartButton.textContent = "Restart";
  const closeButton = document.createElement("button");
  closeButton.className = "workspace-terminal-exit-action";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  actions.append(restartButton, closeButton);
  exitOverlay.append(exitOverlayMessage, actions);

  root.append(search.root, viewport, pasteOverlay.root, exitOverlay);
  return {
    closeButton,
    exitOverlay,
    exitOverlayMessage,
    pasteOverlay,
    restartButton,
    root,
    search,
    viewport,
  };
}

function renderTerminalSearch(document: Document): TerminalSearchElements {
  const root = document.createElement("div");
  root.className = "workspace-terminal-search";
  root.setAttribute("hidden", "true");
  root.setAttribute("role", "search");
  root.setAttribute("data-terminal-search", "true");

  const input = document.createElement("input");
  input.className = "workspace-terminal-search-input";
  input.setAttribute("aria-label", "Search terminal scrollback");
  input.setAttribute("data-terminal-search-input", "true");
  input.spellcheck = false;
  input.type = "search";
  input.value = "";

  const status = document.createElement("span");
  status.className = "workspace-terminal-search-status";
  status.setAttribute("aria-live", "polite");

  const previousButton = document.createElement("button");
  previousButton.className = "workspace-terminal-search-button";
  previousButton.type = "button";
  previousButton.textContent = "Prev";
  previousButton.setAttribute("aria-label", "Previous terminal search result");

  const nextButton = document.createElement("button");
  nextButton.className = "workspace-terminal-search-button";
  nextButton.type = "button";
  nextButton.textContent = "Next";
  nextButton.setAttribute("aria-label", "Next terminal search result");

  const closeButton = document.createElement("button");
  closeButton.className = "workspace-terminal-search-button";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.setAttribute("aria-label", "Close terminal search");

  root.append(input, status, previousButton, nextButton, closeButton);
  return { closeButton, input, nextButton, previousButton, root, status };
}

function renderTerminalPasteOverlay(document: Document): TerminalPasteElements {
  const root = document.createElement("div");
  root.className = "workspace-terminal-paste-overlay";
  root.setAttribute("hidden", "true");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("data-terminal-paste-overlay", "true");

  const message = document.createElement("div");
  message.className = "workspace-terminal-paste-message";
  message.setAttribute("data-terminal-paste-message", "true");

  const actions = document.createElement("div");
  actions.className = "workspace-terminal-paste-actions";

  const confirmButton = document.createElement("button");
  confirmButton.className = "workspace-terminal-paste-action";
  confirmButton.type = "button";
  confirmButton.textContent = "Paste";
  confirmButton.setAttribute("data-terminal-paste-confirm", "true");

  const cancelButton = document.createElement("button");
  cancelButton.className = "workspace-terminal-paste-action";
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.setAttribute("data-terminal-paste-cancel", "true");

  actions.append(confirmButton, cancelButton);
  root.append(message, actions);
  return { cancelButton, confirmButton, message, root };
}

export class TerminalSurfaceChrome {
  private exitOverlay: HTMLElement | null = null;
  private exitOverlayMessage: HTMLElement | null = null;
  private host: HTMLElement | null = null;
  private pasteOverlay: TerminalPasteElements | null = null;
  private restartButton: HTMLButtonElement | null = null;
  private statusText = "";

  mount(host: HTMLElement, content: TerminalSurfaceContent): void {
    this.host = host;
    this.exitOverlay = content.exitOverlay;
    this.exitOverlayMessage = content.exitOverlayMessage;
    this.pasteOverlay = content.pasteOverlay;
    this.restartButton = content.restartButton;
  }

  unmount(): void {
    this.exitOverlay = null;
    this.exitOverlayMessage = null;
    this.host = null;
    this.pasteOverlay = null;
    this.restartButton = null;
  }

  showStatus(message: string): void {
    this.statusText = message;
    if (this.host) {
      this.host.dataset.terminalStatusText = message;
    }
  }

  showExitOverlay(message: string): void {
    this.showExitOverlayWithAction(message, "Restart");
  }

  showExitOverlayWithAction(message: string, actionLabel: string): void {
    showTerminalExitOverlay(
      this.exitOverlay,
      this.exitOverlayMessage,
      this.restartButton,
      message,
      actionLabel,
    );
  }

  hideExitOverlay(): void {
    hideTerminalExitOverlay(this.exitOverlay);
  }

  showPasteOverlay(message: string, confirmable: boolean): void {
    showTerminalPasteOverlay(this.pasteOverlay, message, confirmable);
  }

  hidePasteOverlay(): void {
    hideTerminalPasteOverlay(this.pasteOverlay);
  }

  syncHostStatus(): void {
    if (this.host) {
      this.host.dataset.terminalStatusText = this.statusText;
    }
  }
}

function showTerminalExitOverlay(
  overlay: HTMLElement | null,
  messageElement: HTMLElement | null,
  actionButton: HTMLButtonElement | null,
  message: string,
  actionLabel: string,
): void {
  if (messageElement) {
    messageElement.textContent = message;
  }
  if (actionButton) {
    actionButton.textContent = actionLabel;
  }
  overlay?.removeAttribute("hidden");
}

function hideTerminalExitOverlay(overlay: HTMLElement | null): void {
  overlay?.setAttribute("hidden", "true");
}

function showTerminalPasteOverlay(
  overlay: TerminalPasteElements | null,
  message: string,
  confirmable: boolean,
): void {
  if (!overlay) {
    return;
  }
  overlay.message.textContent = message;
  overlay.confirmButton.hidden = !confirmable;
  overlay.cancelButton.textContent = confirmable ? "Cancel" : "Dismiss";
  overlay.root.removeAttribute("hidden");
  overlay.cancelButton.focus?.();
}

function hideTerminalPasteOverlay(overlay: TerminalPasteElements | null): void {
  overlay?.root.setAttribute("hidden", "true");
}
