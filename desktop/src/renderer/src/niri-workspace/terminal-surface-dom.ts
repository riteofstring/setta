import type { NiriPane } from "./types";

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
  profileSelect: HTMLSelectElement;
  restartButton: HTMLButtonElement;
  root: HTMLElement;
  search: TerminalSearchElements;
  status: HTMLElement;
  viewport: HTMLElement;
}

export function renderXtermContent(host: HTMLElement, pane: NiriPane): TerminalSurfaceContent {
  const document = host.ownerDocument;
  const root = document.createElement("div");
  root.className = "niri-pane-content niri-terminal-surface niri-xterm-surface";

  const header = document.createElement("div");
  header.className = "niri-terminal-header";
  const title = document.createElement("h2");
  title.textContent = pane.title;
  const status = document.createElement("span");
  status.className = "niri-terminal-status";
  const profileSelect = document.createElement("select");
  profileSelect.className = "niri-terminal-profile-select";
  profileSelect.setAttribute("aria-label", "Terminal profile");
  profileSelect.setAttribute("data-terminal-profile-select", "true");
  header.append(title, status, profileSelect);

  const viewport = document.createElement("div");
  viewport.className = "niri-xterm-viewport";
  viewport.setAttribute("data-terminal-viewport", "true");
  viewport.setAttribute("aria-label", `${pane.title} terminal`);

  const search = renderTerminalSearch(document);
  const pasteOverlay = renderTerminalPasteOverlay(document);

  const exitOverlay = document.createElement("div");
  exitOverlay.className = "niri-terminal-exit-overlay";
  exitOverlay.setAttribute("hidden", "true");
  const exitOverlayMessage = document.createElement("div");
  exitOverlayMessage.className = "niri-terminal-exit-message";
  const actions = document.createElement("div");
  actions.className = "niri-terminal-exit-actions";
  const restartButton = document.createElement("button");
  restartButton.className = "niri-terminal-exit-action";
  restartButton.type = "button";
  restartButton.textContent = "Restart";
  const closeButton = document.createElement("button");
  closeButton.className = "niri-terminal-exit-action";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  actions.append(restartButton, closeButton);
  exitOverlay.append(exitOverlayMessage, actions);

  root.append(header, search.root, viewport, pasteOverlay.root, exitOverlay);
  return {
    closeButton,
    exitOverlay,
    exitOverlayMessage,
    pasteOverlay,
    profileSelect,
    restartButton,
    root,
    search,
    status,
    viewport,
  };
}

function renderTerminalSearch(document: Document): TerminalSearchElements {
  const root = document.createElement("div");
  root.className = "niri-terminal-search";
  root.setAttribute("hidden", "true");
  root.setAttribute("role", "search");
  root.setAttribute("data-terminal-search", "true");

  const input = document.createElement("input");
  input.className = "niri-terminal-search-input";
  input.setAttribute("aria-label", "Search terminal scrollback");
  input.setAttribute("data-terminal-search-input", "true");
  input.spellcheck = false;
  input.type = "search";
  input.value = "";

  const status = document.createElement("span");
  status.className = "niri-terminal-search-status";
  status.setAttribute("aria-live", "polite");

  const previousButton = document.createElement("button");
  previousButton.className = "niri-terminal-search-button";
  previousButton.type = "button";
  previousButton.textContent = "Prev";
  previousButton.setAttribute("aria-label", "Previous terminal search result");

  const nextButton = document.createElement("button");
  nextButton.className = "niri-terminal-search-button";
  nextButton.type = "button";
  nextButton.textContent = "Next";
  nextButton.setAttribute("aria-label", "Next terminal search result");

  const closeButton = document.createElement("button");
  closeButton.className = "niri-terminal-search-button";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.setAttribute("aria-label", "Close terminal search");

  root.append(input, status, previousButton, nextButton, closeButton);
  return { closeButton, input, nextButton, previousButton, root, status };
}

function renderTerminalPasteOverlay(document: Document): TerminalPasteElements {
  const root = document.createElement("div");
  root.className = "niri-terminal-paste-overlay";
  root.setAttribute("hidden", "true");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("data-terminal-paste-overlay", "true");

  const message = document.createElement("div");
  message.className = "niri-terminal-paste-message";
  message.setAttribute("data-terminal-paste-message", "true");

  const actions = document.createElement("div");
  actions.className = "niri-terminal-paste-actions";

  const confirmButton = document.createElement("button");
  confirmButton.className = "niri-terminal-paste-action";
  confirmButton.type = "button";
  confirmButton.textContent = "Paste";
  confirmButton.setAttribute("data-terminal-paste-confirm", "true");

  const cancelButton = document.createElement("button");
  cancelButton.className = "niri-terminal-paste-action";
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.setAttribute("data-terminal-paste-cancel", "true");

  actions.append(confirmButton, cancelButton);
  root.append(message, actions);
  return { cancelButton, confirmButton, message, root };
}
