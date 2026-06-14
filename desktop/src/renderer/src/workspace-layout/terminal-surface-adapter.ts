import type { FitAddon as XtermFitAddon } from "@xterm/addon-fit";
import type {
  TerminalEvent,
  TerminalProfile,
  TerminalProfileList,
  TerminalSessionSummary,
} from "@generated/backend";
import type { Terminal as XtermTerminal } from "@xterm/xterm";
import type { BackendProcessStatus } from "@shared/types";
import "@xterm/xterm/css/xterm.css";
import "./workspace-terminal.css";

import {
  base64FromBytes,
  browserClipboard,
  bytesFromBase64,
  errorMessage,
  exitStatusLabel,
  formatBytes,
  isTerminalCopyShortcut,
  isTerminalPasteShortcut,
  isTerminalSearchShortcut,
  statusLabel,
} from "./terminal-ergonomics";
import {
  defaultTerminalDisplaySettings,
  terminalTheme,
  terminalThemeBackground,
  type TerminalDisplaySettings,
} from "./terminal-display-settings";
import {
  profileForPane,
  selectedProfileIdForPane,
  subscribeTerminalProfilesChanged,
  terminalProfileDisplaySettings,
} from "./terminal-profiles";
import { terminalFitContext, terminalFitReady } from "./terminal-fit-context";
import {
  attachOrCreateTerminalSession,
  TerminalStartDeferred,
  terminalAPI,
} from "./terminal-surface-session";
import { renderXtermContent, type TerminalPasteElements } from "./terminal-surface-dom";
import { TerminalSearchController } from "./terminal-surface-search";
import { mountXtermTerminal, type TerminalDisposable } from "./terminal-surface-xterm";
import { assertNever, emptyTerminalStats, performanceNow } from "./terminal-surface-utils";
import {
  isWorkspaceArrowNavigationShortcut,
  workspaceShortcutKeyboardEventInit,
} from "./workspace-shortcuts";
import type {
  FreezeReason,
  WorkspacePane,
  PaneSnapshot,
  Rect,
  ResumeReason,
  SurfaceAdapter,
  SurfaceId,
  ViewportChangeReason,
  TerminalSurfaceStats,
} from "./types";

const maxPendingOutputChunks = 640;
const defaultCols = 80;
const defaultRows = 24;
const inputChunkBytes = 64 * 1024;
const largePasteWarningBytes = 16 * 1024;
const maxPasteBytes = 1024 * 1024;
const maxFitReadinessRetries = 4;
const resizeDebounceMs = 80;
interface PendingTerminalOutput {
  byteCount: number;
  dataBase64: string;
}
interface PendingPaste {
  byteCount: number;
  text: string;
}

type TerminalStatusEvent = TerminalEvent & {
  type: Exclude<TerminalEvent["type"], "terminal.output">;
};

export class TerminalSurfaceAdapter implements SurfaceAdapter {
  readonly kind = "terminal" as const;

  private destroyed = false;
  private droppedOutputChunks = 0;
  private exitOverlay: HTMLElement | null = null;
  private exitOverlayMessage: HTMLElement | null = null;
  private fitReadinessRetryCount = 0;
  private fitRetryTimer: number | null = null;
  private fitAddon: XtermFitAddon | null = null;
  private focused = false;
  private frozen = false;
  private host: HTMLElement | null = null;
  private lastResize: { cols: number; rows: number } | null = null;
  private lostSession = false;
  private pendingResize: { cols: number; rows: number } | null = null;
  private readonly pendingOutput: PendingTerminalOutput[] = [];
  private pendingPaste: PendingPaste | null = null;
  private pasteOverlay: TerminalPasteElements | null = null;
  private resizeTimer: number | null = null;
  private restartButton: HTMLButtonElement | null = null;
  private readonly searchController = new TerminalSearchController();
  private selectedProfile: TerminalProfile | null = null;
  private selectedProfileId = "";
  private sessionId: string | null = null;
  private sessionStatus = "";
  private settings: TerminalDisplaySettings = defaultTerminalDisplaySettings;
  private startPromise: Promise<void> | null = null;
  private status: HTMLElement | null = null;
  private terminal: XtermTerminal | null = null;
  private terminalDisposables: TerminalDisposable[] = [];
  private allowExplicitProfileStart = false;
  private unsubscribeProfileChanges: (() => void) | null = null;
  private unsubscribeBackendStatus: (() => void) | null = null;
  private unsubscribeEvents: (() => void) | null = null;
  private visible = false;

  private stats: TerminalSurfaceStats = emptyTerminalStats();

  constructor(
    private readonly pane: WorkspacePane,
    private readonly workspaceId: string = "empty",
  ) {}

  get surfaceId(): SurfaceId {
    return this.pane.surfaceId;
  }

  mount(host: HTMLElement): void {
    this.ensureNotDestroyed();
    this.host = host;
    host.dataset.surfaceId = this.surfaceId;
    host.dataset.surfaceKind = this.kind;
    const content = renderXtermContent(host, this.pane);
    this.status = content.status;
    this.exitOverlay = content.exitOverlay;
    this.exitOverlayMessage = content.exitOverlayMessage;
    this.restartButton = content.restartButton;
    this.searchController.setElements(content.search);
    this.pasteOverlay = content.pasteOverlay;
    content.viewport.addEventListener("copy", (event) => this.handleCopyEvent(event), {
      capture: true,
    });
    content.viewport.addEventListener("paste", (event) => this.handlePasteEvent(event), {
      capture: true,
    });
    content.search.input.addEventListener("input", () => this.searchController.findNext(true));
    content.search.input.addEventListener("keydown", (event) =>
      this.searchController.handleKeydown(event),
    );
    content.search.nextButton.addEventListener("click", () =>
      this.searchController.findNext(false),
    );
    content.search.previousButton.addEventListener("click", () =>
      this.searchController.findPrevious(),
    );
    content.search.closeButton.addEventListener("click", () => this.searchController.close());
    content.pasteOverlay.confirmButton.addEventListener("click", () => this.confirmPendingPaste());
    content.pasteOverlay.cancelButton.addEventListener("click", () => this.cancelPendingPaste());
    content.restartButton.addEventListener("click", () => this.restartSession());
    content.closeButton.addEventListener("click", () => this.closeExitedSession());
    host.replaceChildren(content.root);
    this.syncHostState();
    const api = terminalAPI();
    if (!api) {
      this.showStatus("Terminal preload API is unavailable.");
      return;
    }
    this.unsubscribeEvents = api.onEvent((event) => this.handleTerminalEvent(event));
    this.unsubscribeBackendStatus =
      window.setta?.backend.onProcessStatus((status) => this.handleBackendProcessStatus(status)) ??
      null;
    this.unsubscribeProfileChanges = subscribeTerminalProfilesChanged((profiles) => {
      this.applyProfileList(profiles);
    });
    void this.loadProfiles()
      .then(() => this.mountTerminal(content.viewport))
      .then(() => {
        this.startSessionIfFocused();
      })
      .catch((error: unknown) => {
        this.showStatus(errorMessage(error));
      });
  }

  unmount(): void {
    this.clearResizeTimer();
    this.clearFitRetryTimer();
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = null;
    this.unsubscribeBackendStatus?.();
    this.unsubscribeBackendStatus = null;
    this.unsubscribeProfileChanges?.();
    this.unsubscribeProfileChanges = null;
    this.disposeTerminal();
    this.host?.replaceChildren();
    this.host = null;
    this.status = null;
    this.exitOverlay = null;
    this.exitOverlayMessage = null;
    this.restartButton = null;
    this.searchController.setElements(null);
    this.pasteOverlay = null;
    this.pendingPaste = null;
    this.visible = false;
    this.startPromise = null;
    this.writeStats(0);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncHostState();
    if (visible) {
      this.fitAndResize();
    }
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.syncHostState();
    if (focused) {
      this.terminal?.focus();
      this.fitAndResize();
      this.startSessionIfFocused();
    }
  }

  setViewport(rect: Rect, reason: ViewportChangeReason): void {
    this.host?.setAttribute("data-viewport-reason", reason);
    this.host?.setAttribute(
      "data-surface-viewport",
      `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    );
    this.fitAndResize();
  }

  freeze(reason: FreezeReason): void {
    this.frozen = true;
    this.host?.setAttribute("data-freeze-reason", reason);
    this.syncHostState();
  }

  resume(reason: ResumeReason): void {
    this.frozen = false;
    this.host?.setAttribute("data-resume-reason", reason);
    this.syncHostState();
    this.fitAndResize();
    if (this.focused) {
      this.terminal?.focus();
      this.fitAndResize();
      this.startSessionIfFocused();
    }
  }

  captureSnapshot(): Promise<PaneSnapshot> {
    return Promise.resolve({
      capturedAt: performanceNow(),
      label: `${this.pane.title} terminal`,
      surfaceId: this.surfaceId,
    });
  }

  getTerminalStats(): TerminalSurfaceStats {
    return this.stats;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    const sessionId = this.sessionId;
    this.unmount();
    this.destroyed = true;
    if (sessionId) {
      void terminalAPI()
        ?.close(sessionId, "terminate")
        .catch((error: unknown) => {
          console.error("failed to close terminal session", errorMessage(error));
        });
    }
  }

  private async loadProfiles(): Promise<void> {
    const profile = await this.loadSelectedProfile();
    if (!profile) {
      this.showStatus("Terminal profiles are unavailable.");
    }
  }

  private async loadSelectedProfile(): Promise<TerminalProfile | null> {
    const api = terminalAPI();
    if (!api) {
      return null;
    }
    const profiles = await api.listProfiles();
    this.applyProfileList(profiles);
    return this.selectedProfile;
  }

  private applyProfileList(profiles: TerminalProfileList): void {
    const preferredProfileId =
      this.selectedProfileId ||
      this.pane.terminalConfig?.profileId ||
      selectedProfileIdForPane(this.pane, profiles);
    this.selectedProfile =
      profiles.profiles.find((profile) => profile.id === preferredProfileId) ??
      profileForPane(this.pane, profiles) ??
      profiles.profiles[0] ??
      null;
    this.selectedProfileId = this.selectedProfile?.id ?? profiles.defaultProfileId;
    this.applyDisplaySettings(terminalProfileDisplaySettings(this.selectedProfile));
  }

  private showDeferredProfileStart(profile: TerminalProfile): void {
    this.sessionStatus = "waiting";
    this.showStatus(`${profile.name} requires start`);
    this.showExitOverlayWithAction(`Start ${profile.name}?`, "Start");
    this.syncHostState();
  }

  private async mountTerminal(viewport: HTMLElement): Promise<void> {
    this.settings = terminalProfileDisplaySettings(this.selectedProfile);
    const mounted = await mountXtermTerminal({
      isCurrent: () => Boolean(this.host && !this.destroyed && this.host.contains(viewport)),
      onData: (data) => {
        this.sendInput(data);
      },
      onOpenExternalUrl: (event, uri) => {
        this.openExternalUrl(event, uri);
      },
      onResize: ({ cols, rows }) => {
        this.scheduleResize(cols, rows);
      },
      onSearchResults: (results) => {
        this.searchController.handleResults(results);
      },
      settings: this.settings,
      terminalKeyHandler: (event) => this.handleTerminalKeyEvent(event),
      viewport,
    });
    if (!mounted) {
      return;
    }
    this.terminal = mounted.terminal;
    this.fitAddon = mounted.fitAddon;
    this.searchController.setSearchAddon(mounted.searchAddon);
    this.searchController.setTerminal(mounted.terminal);
    this.terminalDisposables = mounted.disposables;
    this.fitAndResize();
    this.drainPendingOutput();
  }

  private startSession(): void {
    if (this.startPromise) {
      return;
    }
    if (this.workspaceId === "empty") {
      this.showStatus("Open a workspace to start terminal.");
      return;
    }
    const api = terminalAPI();
    if (!api) {
      this.showStatus("Terminal preload API is unavailable.");
      return;
    }
    const dimensions = this.currentDimensions();
    this.hideExitOverlay();
    this.showStatus(this.sessionId ? "Attaching shell" : "Starting shell");
    this.startPromise = this.attachOrCreateSession(api, dimensions)
      .then((response) => {
        this.allowExplicitProfileStart = false;
        this.applySessionSummary(response.session);
        this.fitAndResize();
      })
      .catch((error: unknown) => {
        if (error instanceof TerminalStartDeferred) {
          return;
        }
        this.allowExplicitProfileStart = false;
        if (this.sessionId) {
          this.showLostSession(errorMessage(error));
          return;
        }
        this.showStatus(errorMessage(error));
        this.showExitOverlay("Terminal failed");
      });
  }

  private startSessionIfFocused(): void {
    if (!this.focused) {
      this.showStatus("Focus terminal to start shell.");
      return;
    }
    this.startSession();
  }

  private async attachOrCreateSession(
    api: NonNullable<ReturnType<typeof terminalAPI>>,
    dimensions: { cols: number; rows: number },
  ) {
    const profile = this.selectedProfile ?? (await this.loadSelectedProfile());
    return attachOrCreateTerminalSession(api, {
      allowExplicitProfileStart: this.allowExplicitProfileStart,
      cwdOverride: this.pane.terminalConfig?.cwdOverride ?? "",
      dimensions,
      paneId: this.pane.paneId,
      profile,
      profileId: this.selectedProfileId,
      sessionId: this.sessionId,
      showDeferredProfileStart: (deferredProfile) => {
        this.showDeferredProfileStart(deferredProfile);
      },
      showStartingStatus: () => {
        this.showStatus("Starting shell");
      },
      workspaceId: this.workspaceId,
    });
  }

  private applySessionSummary(session: TerminalSessionSummary): void {
    this.sessionId = session.id;
    this.selectedProfileId = session.profileId;
    this.sessionStatus = session.status;
    this.lostSession = false;
    this.lastResize = {
      cols: session.cols,
      rows: session.rows,
    };
    this.showStatus(statusLabel(session.status, session.cwd));
    if (session.status === "exited") {
      this.showExitOverlay(exitStatusLabel(session.exitCode, session.message));
    } else if (session.status === "error") {
      this.showExitOverlay(session.message || "Terminal failed");
    } else if (session.status === "closed") {
      this.showExitOverlay("Terminal closed");
    } else {
      this.hideExitOverlay();
    }
    this.syncHostState();
  }

  private handleTerminalEvent(event: TerminalEvent): void {
    if (!this.eventMatchesPane(event)) {
      return;
    }
    this.sessionId = event.sessionId;
    this.sessionStatus = event.payload.status;
    if (event.type === "terminal.output") {
      this.hideExitOverlay();
      this.writeOutput(event.payload.dataBase64, event.payload.byteCount);
      this.syncHostState();
      return;
    }
    this.handleTerminalStatusEvent(event as TerminalStatusEvent);
    this.syncHostState();
  }

  private handleTerminalStatusEvent(event: TerminalStatusEvent): void {
    switch (event.type) {
      case "terminal.started":
        this.showStatus(statusLabel(event.payload.status, event.payload.cwd));
        this.hideExitOverlay();
        break;
      case "terminal.exited":
        this.showStatus(exitStatusLabel(event.payload.exitCode, event.payload.message));
        this.showExitOverlay(exitStatusLabel(event.payload.exitCode, event.payload.message));
        break;
      case "terminal.closed":
        this.showStatus("Terminal closed");
        this.showExitOverlay("Terminal closed");
        break;
      case "terminal.error":
        this.showStatus(event.payload.message || "Terminal failed");
        this.showExitOverlay(event.payload.message || "Terminal failed");
        break;
      case "terminal.bufferTruncated":
        this.droppedOutputChunks += Math.max(1, event.payload.droppedChunks);
        this.showStatus(event.payload.message || "Terminal output buffer truncated");
        this.writeStats(this.stats.dirtyRows);
        break;
      default:
        assertNever(event.type);
    }
  }

  private eventMatchesPane(event: TerminalEvent): boolean {
    if (this.sessionId) {
      return event.sessionId === this.sessionId;
    }
    return event.workspaceId === this.workspaceId && event.paneId === this.pane.paneId;
  }

  private writeOutput(dataBase64: string, byteCount: number): void {
    const terminal = this.terminal;
    if (dataBase64 === "") {
      return;
    }
    if (!terminal) {
      this.enqueuePendingOutput({ byteCount, dataBase64 });
      return;
    }
    this.writeOutputToTerminal(terminal, dataBase64, byteCount);
  }

  private enqueuePendingOutput(output: PendingTerminalOutput): void {
    this.pendingOutput.push(output);
    const overflow = this.pendingOutput.length - maxPendingOutputChunks;
    if (overflow > 0) {
      this.pendingOutput.splice(0, overflow);
      this.droppedOutputChunks += overflow;
    }
    this.writeStats(0);
    this.syncHostState();
  }

  private drainPendingOutput(): void {
    const terminal = this.terminal;
    if (!terminal || this.pendingOutput.length === 0) {
      return;
    }
    const outputs = this.pendingOutput.splice(0);
    let dirtyRows = 0;
    for (const output of outputs) {
      this.writeOutputToTerminal(terminal, output.dataBase64, output.byteCount);
      dirtyRows = Math.max(dirtyRows, Math.max(1, Math.min(defaultRows, output.byteCount)));
    }
    this.writeStats(dirtyRows);
    this.syncHostState();
  }

  private writeOutputToTerminal(
    terminal: XtermTerminal,
    dataBase64: string,
    byteCount: number,
  ): void {
    terminal.write(bytesFromBase64(dataBase64), () => terminal.scrollToBottom());
    this.writeStats(Math.max(1, Math.min(defaultRows, byteCount)));
    this.syncHostState();
  }

  private handleTerminalKeyEvent(event: KeyboardEvent): boolean {
    event.stopPropagation();
    if (event.type !== "keydown") {
      return true;
    }
    if (isWorkspaceArrowNavigationShortcut(event)) {
      event.preventDefault();
      this.dispatchWorkspaceShortcut(event);
      return false;
    }
    if (isTerminalCopyShortcut(event)) {
      event.preventDefault();
      void this.copySelectionToClipboard();
      return false;
    }
    if (isTerminalPasteShortcut(event)) {
      event.preventDefault();
      void this.pasteFromClipboard();
      return false;
    }
    if (isTerminalSearchShortcut(event)) {
      event.preventDefault();
      this.searchController.open();
      return false;
    }
    return true;
  }

  private dispatchWorkspaceShortcut(event: KeyboardEvent): void {
    window.dispatchEvent(new KeyboardEvent("keydown", workspaceShortcutKeyboardEventInit(event)));
  }

  private handleCopyEvent(event: ClipboardEvent): void {
    const terminal = this.terminal;
    if (!terminal?.hasSelection()) {
      return;
    }
    const selection = terminal.getSelection();
    event.clipboardData?.setData("text/plain", selection);
    event.preventDefault();
    terminal.clearSelection();
    this.showStatus("Copied selection");
  }

  private handlePasteEvent(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text.length === 0) {
      return;
    }
    event.preventDefault();
    this.requestPaste(text);
  }

  private async copySelectionToClipboard(): Promise<void> {
    const terminal = this.terminal;
    if (!terminal?.hasSelection()) {
      return;
    }
    const clipboard = browserClipboard();
    if (!clipboard?.writeText) {
      this.showStatus("Clipboard write is unavailable.");
      return;
    }
    try {
      await clipboard.writeText(terminal.getSelection());
      terminal.clearSelection();
      this.showStatus("Copied selection");
    } catch (error) {
      this.showStatus(`Copy failed: ${errorMessage(error)}`);
    }
  }

  private async pasteFromClipboard(): Promise<void> {
    const clipboard = browserClipboard();
    if (!clipboard?.readText) {
      this.showStatus("Clipboard read is unavailable.");
      return;
    }
    try {
      this.requestPaste(await clipboard.readText());
    } catch (error) {
      this.showStatus(`Paste failed: ${errorMessage(error)}`);
    }
  }

  private requestPaste(text: string): void {
    if (text.length === 0) {
      return;
    }
    if (!this.sessionId) {
      this.showStatus("Terminal session is not ready.");
      return;
    }
    const byteCount = new TextEncoder().encode(text).byteLength;
    if (byteCount > maxPasteBytes) {
      this.pendingPaste = null;
      this.showPasteOverlay(
        `Paste is ${formatBytes(byteCount)}; limit is ${formatBytes(maxPasteBytes)}.`,
        false,
      );
      this.showStatus("Paste rejected");
      return;
    }
    if (byteCount >= largePasteWarningBytes) {
      this.pendingPaste = { byteCount, text };
      this.showPasteOverlay(`Paste ${formatBytes(byteCount)} into terminal?`, true);
      this.showStatus("Paste waiting for confirmation");
      return;
    }
    this.pasteText(text);
  }

  private confirmPendingPaste(): void {
    const pending = this.pendingPaste;
    if (!pending) {
      this.hidePasteOverlay();
      return;
    }
    this.pendingPaste = null;
    this.hidePasteOverlay();
    this.showStatus(`Pasting ${formatBytes(pending.byteCount)}`);
    this.pasteText(pending.text);
  }

  private cancelPendingPaste(): void {
    this.pendingPaste = null;
    this.hidePasteOverlay();
    this.showStatus("Paste cancelled");
    this.terminal?.focus();
  }

  private pasteText(text: string): void {
    const terminal = this.terminal;
    if (!terminal) {
      this.sendInput(text);
      return;
    }
    terminal.paste(text);
    terminal.focus();
  }

  private sendInput(data: string): void {
    if (!this.sessionId) {
      return;
    }
    const bytes = new TextEncoder().encode(data);
    const api = terminalAPI();
    if (!api) {
      this.showStatus("Terminal preload API is unavailable.");
      return;
    }
    if (bytes.length <= inputChunkBytes) {
      void api
        .input({
          dataBase64: base64FromBytes(bytes),
          sessionId: this.sessionId,
        })
        .catch((error: unknown) => {
          this.showStatus(`Terminal input failed: ${errorMessage(error)}`);
        });
      return;
    }
    void this.sendChunkedInput(api, this.sessionId, bytes);
  }

  private async sendChunkedInput(
    api: NonNullable<ReturnType<typeof terminalAPI>>,
    sessionId: string,
    bytes: Uint8Array,
  ): Promise<void> {
    try {
      for (let offset = 0; offset < bytes.length; offset += inputChunkBytes) {
        const chunk = bytes.slice(offset, offset + inputChunkBytes);
        await api.input({
          dataBase64: base64FromBytes(chunk),
          sessionId,
        });
      }
    } catch (error) {
      this.showStatus(`Terminal input failed: ${errorMessage(error)}`);
    }
  }

  private openExternalUrl(event: MouseEvent, uri: string): void {
    event.preventDefault();
    event.stopPropagation();
    const api = window.setta?.app;
    if (!api) {
      this.showStatus("External URL API is unavailable.");
      return;
    }
    void api.openExternalUrl(uri).catch((error: unknown) => {
      this.showStatus(`Link blocked: ${errorMessage(error)}`);
    });
  }

  private handleBackendProcessStatus(status: BackendProcessStatus): void {
    if ((status.status === "offline" || status.status === "failed") && this.sessionId) {
      this.showLostSession("Terminal session lost");
      return;
    }
    if (status.status !== "online" || !this.lostSession) {
      return;
    }
    this.sessionId = null;
    this.sessionStatus = "";
    this.lostSession = false;
    this.startPromise = null;
    this.terminal?.clear();
    this.startSession();
  }

  private applyDisplaySettings(settings: TerminalDisplaySettings): void {
    this.settings = settings;
    this.host?.style.setProperty(
      "--workspace-terminal-background",
      terminalThemeBackground(settings.themeId),
    );
    const terminal = this.terminal;
    if (!terminal) {
      return;
    }
    terminal.options = {
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      scrollback: settings.scrollback,
      theme: terminalTheme(settings.themeId),
    };
    this.fitAndResize();
  }

  private restartSession(): void {
    const previousSessionId = this.sessionId;
    this.allowExplicitProfileStart = true;
    this.sessionId = null;
    this.sessionStatus = "";
    this.lostSession = false;
    this.startPromise = null;
    this.droppedOutputChunks = 0;
    this.terminal?.clear();
    this.hideExitOverlay();
    const api = terminalAPI();
    const closePrevious =
      previousSessionId && api
        ? api.close(previousSessionId, "terminate").catch(() => undefined)
        : Promise.resolve();
    void closePrevious.then(() => {
      this.startSession();
    });
  }

  private closeExitedSession(): void {
    const sessionId = this.sessionId;
    const api = terminalAPI();
    if (!sessionId || !api) {
      this.showLostSession("Terminal session lost");
      return;
    }
    void api
      .close(sessionId, "terminate")
      .then((response) => {
        this.applySessionSummary(response.session);
      })
      .catch((error: unknown) => {
        this.showStatus(errorMessage(error));
      });
  }

  private showLostSession(message: string): void {
    this.lostSession = true;
    this.sessionStatus = "lost";
    this.showStatus(message);
    this.showExitOverlay(message);
    this.syncHostState();
  }

  private fitAndResize(): void {
    const fitContext = terminalFitContext({
      fitAddon: this.fitAddon,
      focused: this.focused,
      frozen: this.frozen,
      host: this.host,
      terminal: this.terminal,
      visible: this.visible,
    });
    if (!fitContext) {
      this.writeStats(0);
      return;
    }
    if (fitContext.host.clientWidth <= 0 || fitContext.host.clientHeight <= 0) {
      return;
    }
    if (!terminalFitReady(fitContext.terminal)) {
      this.scheduleFitRetry();
      this.writeStats(0);
      return;
    }
    this.fitReadinessRetryCount = 0;
    fitContext.fitAddon.fit();
    this.scheduleResize(fitContext.terminal.cols, fitContext.terminal.rows);
    this.writeStats(1);
    this.syncHostState();
  }

  private scheduleFitRetry(): void {
    if (this.fitRetryTimer !== null || this.fitReadinessRetryCount >= maxFitReadinessRetries) {
      return;
    }
    this.fitReadinessRetryCount += 1;
    this.fitRetryTimer = window.setTimeout(() => {
      this.fitRetryTimer = null;
      this.fitAndResize();
    }, 16);
  }

  private scheduleResize(cols: number, rows: number): void {
    if (!this.sessionId) {
      return;
    }
    if (this.lastResize?.cols === cols && this.lastResize.rows === rows) {
      return;
    }
    this.pendingResize = { cols, rows };
    if (this.resizeTimer !== null) {
      return;
    }
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = null;
      const next = this.pendingResize;
      this.pendingResize = null;
      if (!next || !this.sessionId) {
        return;
      }
      this.lastResize = next;
      void terminalAPI()?.resize({
        cols: next.cols,
        rows: next.rows,
        sessionId: this.sessionId,
      });
    }, resizeDebounceMs);
  }

  private currentDimensions(): { cols: number; rows: number } {
    return {
      cols: this.terminal?.cols ?? defaultCols,
      rows: this.terminal?.rows ?? defaultRows,
    };
  }

  private disposeTerminal(): void {
    for (const disposable of this.terminalDisposables) {
      disposable.dispose();
    }
    this.terminalDisposables = [];
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
    this.searchController.setSearchAddon(null);
    this.searchController.setTerminal(null);
  }

  private clearResizeTimer(): void {
    if (this.resizeTimer === null) {
      return;
    }
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = null;
    this.pendingResize = null;
  }

  private clearFitRetryTimer(): void {
    if (this.fitRetryTimer !== null) {
      window.clearTimeout(this.fitRetryTimer);
      this.fitRetryTimer = null;
    }
    this.fitReadinessRetryCount = 0;
  }

  private showStatus(message: string): void {
    if (this.status) {
      this.status.textContent = message;
    }
  }

  private showExitOverlay(message: string): void {
    this.showExitOverlayWithAction(message, "Restart");
  }

  private showExitOverlayWithAction(message: string, actionLabel: string): void {
    if (this.exitOverlayMessage) {
      this.exitOverlayMessage.textContent = message;
    }
    if (this.restartButton) {
      this.restartButton.textContent = actionLabel;
    }
    this.exitOverlay?.removeAttribute("hidden");
  }

  private hideExitOverlay(): void {
    this.exitOverlay?.setAttribute("hidden", "true");
  }

  private showPasteOverlay(message: string, confirmable: boolean): void {
    if (!this.pasteOverlay) {
      return;
    }
    this.pasteOverlay.message.textContent = message;
    this.pasteOverlay.confirmButton.hidden = !confirmable;
    this.pasteOverlay.cancelButton.textContent = confirmable ? "Cancel" : "Dismiss";
    this.pasteOverlay.root.removeAttribute("hidden");
    this.pasteOverlay.cancelButton.focus?.();
  }

  private hidePasteOverlay(): void {
    this.pasteOverlay?.root.setAttribute("hidden", "true");
  }

  private writeStats(dirtyRows: number): void {
    const bufferLength = this.terminal?.buffer.active.length ?? 0;
    this.stats = {
      dirtyRows,
      droppedOutputChunks: this.droppedOutputChunks,
      liveTerminalRendererCount: this.visible && !this.frozen && this.host && this.terminal ? 1 : 0,
      pendingOutputChunks: this.pendingOutput.length,
      renderedRows: this.terminal?.rows ?? 0,
      scrollbackRows: bufferLength,
    };
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error(`terminal surface ${this.surfaceId} has already been destroyed`);
    }
  }

  private syncHostState(): void {
    if (!this.host) {
      return;
    }
    this.host.dataset.surfaceFocused = String(this.focused);
    this.host.dataset.surfaceFrozen = String(this.frozen);
    this.host.dataset.surfaceVisible = String(this.visible);
    this.host.dataset.terminalDirtyRows = String(this.stats.dirtyRows);
    this.host.dataset.terminalLost = String(this.lostSession);
    this.host.dataset.terminalPendingChunks = String(this.stats.pendingOutputChunks);
    this.host.dataset.terminalProfileId = this.selectedProfileId;
    this.host.dataset.terminalSessionId = this.sessionId ?? "";
    this.host.dataset.terminalStatus = this.sessionStatus;
    this.host.dataset.terminalScrollbackRows = String(this.stats.scrollbackRows);
    this.host.dataset.terminalVirtualRows = String(this.stats.renderedRows);
    this.host.style.visibility = this.visible ? "visible" : "hidden";
  }
}
