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

import { bytesFromBase64, errorMessage, exitStatusLabel, statusLabel } from "./terminal-ergonomics";
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
import { runtimeProfileScopeKey } from "./terminal-runtime-scope";
import { terminalFitContext, terminalFitReady } from "./terminal-fit-context";
import {
  TerminalSurfaceFitScheduler,
  snapTerminalViewportToWholeRows,
  terminalViewportHasSize,
  warnIfTerminalViewportSuspiciouslySmall,
} from "./terminal-surface-fit-scheduler";
import {
  handleTerminalKeyEvent,
  openTerminalExternalUrl,
  sendTerminalInput,
} from "./terminal-surface-input";
import {
  attachOrCreateTerminalSession,
  TerminalProfileUnavailable,
  TerminalStartCancelled,
  TerminalStartDeferred,
  terminalAPI,
} from "./terminal-surface-session";
import { renderXtermContent, TerminalSurfaceChrome } from "./terminal-surface-dom";
import { TerminalOutputBuffer } from "./terminal-surface-output-buffer";
import {
  type ScheduledTerminalOutput,
  TerminalOutputScheduler,
  TerminalPresentationScheduler,
} from "./terminal-output-scheduler";
import { writeTerminalOutputBatch } from "./terminal-output-writer";
import { TerminalPasteController } from "./terminal-surface-paste";
import { TerminalSurfaceSessionResizer } from "./terminal-surface-resize-scheduler";
import { TerminalSearchController } from "./terminal-surface-search";
import { mountXtermTerminal, type TerminalDisposable } from "./terminal-surface-xterm";
import { recordTerminalOutputStage } from "./terminal-latency-recorder";
import { setHostPaneChromeTitle, terminalPaneTitle } from "./pane-title-metadata";
import { assertNever, emptyTerminalStats, performanceNow } from "./terminal-surface-utils";
import { requestTerminalPaneClose } from "./terminal-pane-close";
import {
  syncTerminalHostState,
  terminalSurfaceLimits,
  type TerminalStatusEvent,
} from "./terminal-surface-state";
import { useRuntimeStore } from "../stores/runtime-store";
import type {
  FreezeReason,
  WorkspacePane,
  PaneSnapshot,
  Rect,
  ResumeReason,
  SurfaceAdapter,
  SurfaceId,
  SurfacePaneCloseRequest,
  ViewportChangeReason,
  TerminalSurfaceStats,
} from "./types";

const { defaultCols, defaultRows, resizeDebounceMs, sessionStartFitWaitMs } = terminalSurfaceLimits;

type FitWaiter = (dimensions: { cols: number; rows: number } | null) => void;

export class TerminalSurfaceAdapter implements SurfaceAdapter {
  readonly kind = "terminal" as const;
  private destroyed = false;
  private readonly chrome = new TerminalSurfaceChrome();
  private fitAddon: XtermFitAddon | null = null;
  private fitReadinessRetryCount = 0;
  private fitRetryTimer: number | null = null;
  private focused = false;
  private frozen = false;
  private host: HTMLElement | null = null;
  private deferOutputUntilSessionReady = false;
  private lostSession = false;
  private readonly outputBuffer = new TerminalOutputBuffer();
  private readonly outputScheduler = new TerminalOutputScheduler<ScheduledTerminalOutput>({
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    write: (outputs) => this.writeOutputBatch(outputs),
  });
  private readonly presentationScheduler = new TerminalPresentationScheduler({
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    present: (dirtyRows) => {
      this.writeStats(dirtyRows);
      this.syncHostState();
    },
    requestFrame: (callback) => window.requestAnimationFrame(callback),
  });
  private fitWaiters: FitWaiter[] = [];
  private profilesLoaded = false;
  private reattachRequired = false;
  private resetTerminalBeforeReplayDrain = false;
  private readonly pasteController = new TerminalPasteController({
    getSessionId: () => this.sessionId,
    getTerminal: () => this.terminal,
    hidePasteOverlay: () => this.chrome.hidePasteOverlay(),
    sendInput: (data) => this.sendInput(data),
    showPasteOverlay: (message, confirmable) => this.chrome.showPasteOverlay(message, confirmable),
    showStatus: (message) => this.chrome.showStatus(message),
  });
  private readonly searchController = new TerminalSearchController();
  private selectedProfile: TerminalProfile | null = null;
  private selectedProfileId = "";
  private sessionId: string | null = null;
  private sessionStatus = "";
  private settings: TerminalDisplaySettings = defaultTerminalDisplaySettings;
  private startPromise: Promise<void> | null = null;
  private terminal: XtermTerminal | null = null;
  private terminalDisposables: TerminalDisposable[] = [];
  private allowExplicitProfileStart = false;
  private unsubscribeProfileChanges: (() => void) | null = null;
  private unsubscribeBackendStatus: (() => void) | null = null;
  private unsubscribeEvents: (() => void) | null = null;
  private unsubscribeStreamStatus: (() => void) | null = null;
  private unsubscribeRuntimeChanges: (() => void) | null = null;
  private visible = false;
  private runtimeProfileScopeKey = "";
  private runtimeProfileVersion = 0;
  private stats: TerminalSurfaceStats = emptyTerminalStats();
  private readonly fitScheduler = new TerminalSurfaceFitScheduler(() => this.fitAndResize());
  private readonly sessionResizer = new TerminalSurfaceSessionResizer(resizeDebounceMs, {
    applySessionSummary: (session) => this.applySessionSummary(session),
    current: () => ({
      destroyed: this.destroyed,
      runtimeVersion: this.runtimeProfileVersion,
      sessionId: this.sessionId,
      status: this.sessionStatus,
    }),
    showStatus: (message) => this.chrome.showStatus(message),
  });
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
    setHostPaneChromeTitle(host, terminalPaneTitle(this.pane.terminalConfig?.cwdOverride ?? ""));
    const content = renderXtermContent(host, this.pane);
    this.chrome.mount(host, content);
    this.searchController.setElements(content.search);
    this.fitScheduler.setViewport(content.viewport);
    content.viewport.addEventListener(
      "copy",
      (event) => this.pasteController.handleCopyEvent(event),
      {
        capture: true,
      },
    );
    content.viewport.addEventListener(
      "paste",
      (event) => this.pasteController.handlePasteEvent(event),
      {
        capture: true,
      },
    );
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
    content.pasteOverlay.confirmButton.addEventListener("click", () =>
      this.pasteController.confirmPendingPaste(),
    );
    content.pasteOverlay.cancelButton.addEventListener("click", () =>
      this.pasteController.cancelPendingPaste(),
    );
    content.restartButton.addEventListener("click", () => this.restartSession());
    content.closeButton.addEventListener("click", () => this.closeExitedSession());
    host.replaceChildren(content.root);
    this.syncHostState();
    const api = terminalAPI();
    if (!api) {
      this.chrome.showStatus("Terminal preload API is unavailable.");
      return;
    }
    this.unsubscribeEvents = api.onEvent((event) => this.handleTerminalEvent(event));
    this.unsubscribeStreamStatus = api.onStatus((status) => {
      if (status.kind === "backpressure" || status.kind === "error") {
        this.chrome.showStatus(status.message);
      }
    });
    this.unsubscribeBackendStatus =
      window.setta?.backend.onProcessStatus((status) => this.handleBackendProcessStatus(status)) ??
      null;
    this.runtimeProfileScopeKey = runtimeProfileScopeKey(useRuntimeStore.getState().snapshot);
    this.unsubscribeRuntimeChanges = useRuntimeStore.subscribe((state) => {
      const nextScopeKey = runtimeProfileScopeKey(state.snapshot);
      if (nextScopeKey !== this.runtimeProfileScopeKey) {
        this.handleRuntimeProfileScopeChanged(nextScopeKey);
      }
    });
    this.unsubscribeProfileChanges = subscribeTerminalProfilesChanged((profiles) => {
      this.applyProfileList(profiles);
      this.startSessionIfActive();
    });
    const runtimeVersion = this.runtimeProfileVersion;
    void this.loadProfiles(runtimeVersion)
      .then(() => this.mountTerminal(content.viewport))
      .then(() => {
        if (this.destroyed || !this.host) {
          return;
        }
        this.startSessionIfActive();
      })
      .catch((error: unknown) => {
        if (runtimeVersion === this.runtimeProfileVersion) {
          this.chrome.showStatus(errorMessage(error));
        }
      });
  }
  unmount(): void {
    this.sessionResizer.clear();
    this.fitScheduler.clear();
    this.clearFitRetry();
    this.resolveFitWaiters(null);
    this.outputScheduler.clear();
    this.presentationScheduler.clear();
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = null;
    this.unsubscribeStreamStatus?.();
    this.unsubscribeStreamStatus = null;
    this.unsubscribeBackendStatus?.();
    this.unsubscribeBackendStatus = null;
    this.unsubscribeProfileChanges?.();
    this.unsubscribeProfileChanges = null;
    this.unsubscribeRuntimeChanges?.();
    this.unsubscribeRuntimeChanges = null;
    this.disposeTerminal();
    if (this.sessionId) {
      this.reattachRequired = true;
    }
    this.host?.replaceChildren();
    this.host = null;
    this.fitScheduler.setViewport(null);
    this.chrome.unmount();
    this.searchController.setElements(null);
    this.pasteController.clearPendingPaste();
    this.visible = false;
    this.writeStats(0);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncHostState();
    if (visible) {
      this.fitScheduler.queue();
      this.drainPendingOutput();
      this.startSessionIfActive();
    }
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.syncHostState();
    if (focused) {
      this.terminal?.focus();
      this.fitScheduler.queue();
      this.drainPendingOutput();
      this.startSessionIfActive();
    }
  }

  setViewport(rect: Rect, reason: ViewportChangeReason): void {
    this.host?.setAttribute("data-viewport-reason", reason);
    this.host?.setAttribute(
      "data-surface-viewport",
      `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    );
    this.fitScheduler.queue();
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
    this.fitScheduler.queue();
    this.drainPendingOutput();
    if (this.focused) {
      this.terminal?.focus();
      this.fitScheduler.queue();
    }
    this.startSessionIfActive();
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
  requestPaneClose({ confirm }: SurfacePaneCloseRequest) {
    return requestTerminalPaneClose({
      api: terminalAPI(),
      applySessionSummary: (session) => this.applySessionSummary(session),
      confirm,
      getSessionId: () => this.sessionId,
      getSessionStatus: () => this.sessionStatus,
      owner: this,
      showExitOverlay: (message) => this.chrome.showExitOverlay(message),
      showStatus: (message) => this.chrome.showStatus(message),
      waitForPendingSessionStart: () => (this.sessionId ? null : this.startPromise),
    });
  }
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.unmount();
    this.destroyed = true;
  }
  private async loadProfiles(runtimeVersion = this.runtimeProfileVersion): Promise<void> {
    if (!this.runtimeProfileLoadAvailable()) {
      this.chrome.showStatus("Waiting for runtime connection.");
      return;
    }
    const profile = await this.loadSelectedProfile(runtimeVersion);
    if (this.destroyed || runtimeVersion !== this.runtimeProfileVersion) {
      return;
    }
    if (!profile) {
      this.chrome.showStatus("Terminal profiles are unavailable.");
    }
  }
  private async loadSelectedProfile(
    runtimeVersion = this.runtimeProfileVersion,
  ): Promise<TerminalProfile | null> {
    const api = terminalAPI();
    if (!api) {
      return null;
    }
    const profiles = await api.listProfiles();
    if (this.destroyed || runtimeVersion !== this.runtimeProfileVersion) {
      return null;
    }
    this.applyProfileList(profiles);
    return this.selectedProfile;
  }
  private applyProfileList(profiles: TerminalProfileList): void {
    this.profilesLoaded = true;
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
    this.clearDeferredProfileStartIfAutoStartAllowed();
  }
  private showDeferredProfileStart(profile: TerminalProfile): void {
    this.sessionStatus = "waiting";
    this.chrome.showStatus(`${profile.name} requires start`);
    this.chrome.showExitOverlayWithAction(`Start ${profile.name}?`, "Start");
    this.syncHostState();
  }
  private clearDeferredProfileStartIfAutoStartAllowed(): void {
    if (
      this.sessionStatus !== "waiting" ||
      this.sessionId ||
      (this.selectedProfile &&
        !this.selectedProfile.safeAutoStart &&
        !this.allowExplicitProfileStart)
    ) {
      return;
    }
    this.sessionStatus = "";
    this.chrome.hideExitOverlay();
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
      terminalKeyHandler: (event) =>
        handleTerminalKeyEvent(event, {
          pasteController: this.pasteController,
          searchController: this.searchController,
        }),
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
    this.fitScheduler.queue();
    this.drainPendingOutput();
  }
  private startSession(): void {
    if (this.destroyed || !this.host) {
      return;
    }
    if (this.shouldSkipSessionStart()) {
      return;
    }
    const blockedMessage = this.sessionStartBlockedMessage();
    if (blockedMessage) {
      this.chrome.showStatus(blockedMessage);
      return;
    }
    const api = terminalAPI();
    if (!api) {
      this.chrome.showStatus("Terminal preload API is unavailable.");
      return;
    }
    const dimensions = this.currentDimensions();
    this.chrome.hideExitOverlay();
    this.chrome.showStatus(this.sessionId ? "Attaching shell" : "Starting shell");
    this.deferOutputUntilSessionReady = true;
    const runtimeVersion = this.runtimeProfileVersion;
    const startPromise = this.attachOrCreateSession(api, dimensions, runtimeVersion)
      .then(async (response) => {
        await this.handleSessionStartResponse(response.session, runtimeVersion);
      })
      .catch((error: unknown) => {
        this.handleSessionStartError(error, runtimeVersion);
      })
      .finally(() => {
        if (this.startPromise === startPromise) {
          this.startPromise = null;
        }
      });
    this.startPromise = startPromise;
  }
  private shouldSkipSessionStart(): boolean {
    return (
      Boolean(this.startPromise) ||
      (Boolean(this.sessionId) && !this.reattachRequired) ||
      (this.sessionStatus === "waiting" && !this.allowExplicitProfileStart)
    );
  }
  private sessionStartBlockedMessage(): string | null {
    if (this.workspaceId === "empty") {
      return "Open a workspace to start terminal.";
    }
    if (!this.runtimeProfileLoadAvailable()) {
      return "Waiting for runtime connection.";
    }
    return null;
  }
  private handleSessionStartResponse(
    session: TerminalSessionSummary,
    runtimeVersion: number,
  ): Promise<void> {
    if (this.destroyed || runtimeVersion !== this.runtimeProfileVersion) {
      return Promise.resolve();
    }
    this.allowExplicitProfileStart = false;
    this.applySessionSummary(session);
    this.resetTerminalBeforeReplayDrain = true;
    return this.resizeSessionToFittedDimensions(runtimeVersion).finally(() => {
      if (this.destroyed || runtimeVersion !== this.runtimeProfileVersion) {
        return;
      }
      this.deferOutputUntilSessionReady = false;
      this.drainPendingOutput();
      this.fitScheduler.queue();
    });
  }
  private handleSessionStartError(error: unknown, runtimeVersion: number): void {
    if (this.destroyed || runtimeVersion !== this.runtimeProfileVersion) {
      return;
    }
    this.deferOutputUntilSessionReady = false;
    if (error instanceof TerminalStartDeferred || error instanceof TerminalStartCancelled) {
      return;
    }
    if (error instanceof TerminalProfileUnavailable) {
      this.chrome.showStatus(error.message);
      return;
    }
    this.allowExplicitProfileStart = false;
    if (this.sessionId) {
      this.showLostSession(errorMessage(error));
      return;
    }
    const message = errorMessage(error);
    this.chrome.showStatus(message);
    this.chrome.showExitOverlay(message);
  }
  private startSessionIfActive(): void {
    if (!this.visible || this.frozen) {
      return;
    }
    this.startSession();
  }
  private async attachOrCreateSession(
    api: NonNullable<ReturnType<typeof terminalAPI>>,
    dimensions: { cols: number; rows: number },
    runtimeVersion: number,
  ) {
    if (!this.profilesLoaded) {
      await this.loadSelectedProfile(runtimeVersion);
    }
    if (this.destroyed || runtimeVersion !== this.runtimeProfileVersion) {
      throw new TerminalStartDeferred("terminal runtime changed before start completed");
    }
    const profile = this.selectedProfile;
    return attachOrCreateTerminalSession(api, {
      allowExplicitProfileStart: this.allowExplicitProfileStart,
      cwdOverride: this.pane.terminalConfig?.cwdOverride ?? "",
      dimensions,
      isCurrent: () =>
        !this.destroyed && Boolean(this.host) && runtimeVersion === this.runtimeProfileVersion,
      paneId: this.pane.paneId,
      profile,
      profileId: this.selectedProfileId,
      sessionId: this.sessionId,
      showDeferredProfileStart: (deferredProfile) => {
        this.showDeferredProfileStart(deferredProfile);
      },
      showStartingStatus: () => {
        this.chrome.showStatus("Starting shell");
      },
      workspaceId: this.workspaceId,
    });
  }
  private handleRuntimeProfileScopeChanged(nextScopeKey: string): void {
    this.runtimeProfileScopeKey = nextScopeKey;
    this.runtimeProfileVersion += 1;
    this.profilesLoaded = false;
    this.selectedProfile = null;
    this.selectedProfileId = this.pane.terminalConfig?.profileId ?? "";
    this.allowExplicitProfileStart = false;
    this.deferOutputUntilSessionReady = false;
    this.startPromise = null;
    if (!this.sessionId) {
      this.sessionStatus = "";
      this.chrome.hideExitOverlay();
      this.syncHostState();
    }
    const runtimeVersion = this.runtimeProfileVersion;
    void this.loadProfiles(runtimeVersion)
      .then(() => {
        if (runtimeVersion === this.runtimeProfileVersion) {
          this.startSessionIfActive();
        }
      })
      .catch((error: unknown) => {
        if (runtimeVersion === this.runtimeProfileVersion) {
          this.chrome.showStatus(errorMessage(error));
        }
      });
  }
  private runtimeProfileLoadAvailable(): boolean {
    const snapshot = useRuntimeStore.getState().snapshot;
    return !snapshot || snapshot.connection.status === "connected";
  }
  private applySessionSummary(session: TerminalSessionSummary): void {
    this.sessionId = session.id;
    this.selectedProfileId = session.profileId;
    this.sessionStatus = session.status;
    this.reattachRequired = false;
    this.lostSession = false;
    this.sessionResizer.setLastResize({
      cols: session.cols,
      rows: session.rows,
    });
    this.showTerminalCwd(session.cwd);
    this.chrome.showStatus(statusLabel(session.status, session.cwd));
    if (session.status === "exited") {
      this.chrome.showExitOverlay(exitStatusLabel(session.exitCode, session.message));
    } else if (session.status === "error") {
      this.chrome.showExitOverlay(session.message || "Terminal failed");
    } else if (session.status === "closed") {
      this.chrome.showExitOverlay("Terminal closed");
    } else {
      this.chrome.hideExitOverlay();
    }
    if (!this.sessionResizer.currentCanResize()) {
      this.cancelPendingSessionSizing();
    }
    this.syncHostState();
  }
  private handleTerminalEvent(event: TerminalEvent): void {
    const matchesPane = this.sessionId
      ? event.sessionId === this.sessionId
      : event.workspaceId === this.workspaceId && event.paneId === this.pane.paneId;
    if (!matchesPane) {
      return;
    }
    this.sessionId = event.sessionId;
    this.sessionStatus = event.payload.status;
    if (event.type === "terminal.output") {
      recordTerminalOutputStage("terminal_output_renderer_received", event);
      this.chrome.hideExitOverlay();
      this.writeOutput(event);
      this.syncHostState();
      return;
    }
    this.handleTerminalStatusEvent(event as TerminalStatusEvent);
    this.syncHostState();
  }
  private handleTerminalStatusEvent(event: TerminalStatusEvent): void {
    switch (event.type) {
      case "terminal.started":
        this.showTerminalCwd(event.payload.cwd);
        this.chrome.showStatus(statusLabel(event.payload.status, event.payload.cwd));
        this.chrome.hideExitOverlay();
        break;
      case "terminal.exited":
        this.chrome.showStatus(exitStatusLabel(event.payload.exitCode, event.payload.message));
        this.chrome.showExitOverlay(exitStatusLabel(event.payload.exitCode, event.payload.message));
        this.cancelPendingSessionSizing();
        break;
      case "terminal.closed":
        this.chrome.showStatus("Terminal closed");
        this.chrome.showExitOverlay("Terminal closed");
        this.cancelPendingSessionSizing();
        break;
      case "terminal.error":
        this.chrome.showStatus(event.payload.message || "Terminal failed");
        this.chrome.showExitOverlay(event.payload.message || "Terminal failed");
        this.cancelPendingSessionSizing();
        break;
      case "terminal.bufferTruncated":
        this.outputBuffer.addDroppedChunks(Math.max(1, event.payload.droppedChunks));
        this.chrome.showStatus(event.payload.message || "Terminal replay history truncated");
        this.writeStats(this.stats.dirtyRows);
        break;
      default:
        assertNever(event.type);
    }
  }
  private writeOutput(event: TerminalEvent): void {
    const terminal = this.terminal;
    const { byteCount, dataBase64 } = event.payload;
    if (dataBase64 === "") {
      return;
    }
    if (!terminal || this.frozen || this.deferOutputUntilSessionReady) {
      this.outputBuffer.enqueue({ byteCount, dataBase64, event });
      this.presentationScheduler.schedule(0);
      return;
    }
    this.outputScheduler.enqueue({ bytes: bytesFromBase64(dataBase64), event });
  }
  private drainPendingOutput(): void {
    const terminal = this.terminal;
    if (!terminal || this.frozen || this.deferOutputUntilSessionReady) {
      return;
    }
    const reset = this.resetTerminalBeforeReplayDrainIfNeeded(terminal);
    if (!this.outputBuffer.hasPending) {
      if (reset) {
        this.writeStats(0);
        this.syncHostState();
      }
      return;
    }
    const outputs = this.outputBuffer.drain();
    this.outputScheduler.enqueueBulk(
      outputs.map((output) => ({
        bytes: bytesFromBase64(output.dataBase64),
        event: output.event,
      })),
    );
  }
  private writeOutputBatch(outputs: ScheduledTerminalOutput[]): void {
    const dirtyRows = writeTerminalOutputBatch(this.terminal, outputs);
    if (dirtyRows !== null) {
      this.presentationScheduler.schedule(dirtyRows);
    }
  }
  private sendInput(data: string): void {
    sendTerminalInput(data, this.sessionId, {
      showStatus: (message) => this.chrome.showStatus(message),
    });
  }
  private openExternalUrl(event: MouseEvent, uri: string): void {
    openTerminalExternalUrl(event, uri, {
      showStatus: (message) => this.chrome.showStatus(message),
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
    this.reattachRequired = false;
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
    this.fitScheduler.queue();
  }
  private restartSession(): void {
    const previousSessionId = this.sessionId;
    this.allowExplicitProfileStart = true;
    this.sessionId = null;
    this.sessionStatus = "";
    this.reattachRequired = false;
    this.lostSession = false;
    this.startPromise = null;
    this.outputBuffer.resetDroppedChunks();
    this.terminal?.clear();
    this.chrome.hideExitOverlay();
    const api = terminalAPI();
    const closePrevious =
      previousSessionId && api
        ? api.close({ confirmed: true, sessionId: previousSessionId }).catch(() => undefined)
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
      .close({ confirmed: false, sessionId })
      .then((response) => {
        if (response.session !== null) {
          this.applySessionSummary(response.session);
        }
      })
      .catch((error: unknown) => {
        this.chrome.showStatus(errorMessage(error));
      });
  }
  private showLostSession(message: string): void {
    this.lostSession = true;
    this.sessionStatus = "lost";
    this.chrome.showStatus(message);
    this.chrome.showExitOverlay(message);
    this.syncHostState();
  }
  private fitAndResize(): void {
    const dimensions = this.fitTerminal();
    if (!dimensions) {
      return;
    }
    this.scheduleResize(dimensions.cols, dimensions.rows);
  }
  private fitTerminal(): { cols: number; rows: number } | null {
    const fitContext = terminalFitContext({
      fitAddon: this.fitAddon,
      frozen: this.frozen,
      terminal: this.terminal,
      viewport: this.fitScheduler.viewport,
      visible: this.visible,
    });
    if (!fitContext) {
      this.writeStats(0);
      return null;
    }
    // This viewport must be sized by the pane layout, not by the xterm content,
    // or fitting feeds the current terminal row count back into itself.
    if (!terminalViewportHasSize(fitContext.viewport)) {
      return null;
    }
    if (!terminalFitReady(fitContext.terminal)) {
      this.scheduleFitRetry();
      this.writeStats(0);
      return null;
    }
    this.fitReadinessRetryCount = 0;
    warnIfTerminalViewportSuspiciouslySmall(fitContext.viewport);
    fitContext.fitAddon.fit();
    snapTerminalViewportToWholeRows(fitContext.viewport, fitContext.terminal.rows);
    this.writeStats(1);
    this.syncHostState();
    const dimensions = {
      cols: fitContext.terminal.cols,
      rows: fitContext.terminal.rows,
    };
    this.resolveFitWaiters(dimensions);
    return dimensions;
  }
  private async resizeSessionToFittedDimensions(runtimeVersion: number): Promise<void> {
    const dimensions =
      (await this.fittedDimensionsForSessionStart(runtimeVersion)) ?? this.currentDimensions();
    if (this.destroyed || runtimeVersion !== this.runtimeProfileVersion) {
      return;
    }
    await this.sessionResizer.resizeImmediately(dimensions, runtimeVersion);
  }
  private async fittedDimensionsForSessionStart(
    runtimeVersion: number,
  ): Promise<{ cols: number; rows: number } | null> {
    const dimensions = this.fitTerminal();
    if (dimensions) {
      return dimensions;
    }
    if (!this.visible || this.frozen || !this.fitScheduler.viewport || !this.terminal) {
      return null;
    }
    this.fitScheduler.queue();
    return new Promise((resolve) => {
      let settled = false;
      const waiter: FitWaiter = (nextDimensions) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeout);
        if (this.destroyed || runtimeVersion !== this.runtimeProfileVersion) {
          resolve(null);
          return;
        }
        resolve(nextDimensions);
      };
      const timeout = window.setTimeout(() => {
        this.fitWaiters = this.fitWaiters.filter((candidate) => candidate !== waiter);
        waiter(null);
      }, sessionStartFitWaitMs);
      this.fitWaiters.push(waiter);
    });
  }
  private scheduleResize(cols: number, rows: number): void {
    this.sessionResizer.schedule(cols, rows);
  }
  private scheduleFitRetry(): void {
    if (
      this.fitRetryTimer !== null ||
      this.fitReadinessRetryCount >= terminalSurfaceLimits.maxFitReadinessRetries
    ) {
      return;
    }
    this.fitReadinessRetryCount += 1;
    this.fitRetryTimer = window.setTimeout(() => {
      this.fitRetryTimer = null;
      this.fitAndResize();
    }, 16);
  }
  private clearFitRetry(): void {
    if (this.fitRetryTimer !== null) {
      window.clearTimeout(this.fitRetryTimer);
      this.fitRetryTimer = null;
    }
    this.fitReadinessRetryCount = 0;
  }
  private cancelPendingSessionSizing(): void {
    this.fitScheduler.clear();
    this.clearFitRetry();
    this.sessionResizer.clear();
    this.resolveFitWaiters(null);
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
  private resolveFitWaiters(dimensions: { cols: number; rows: number } | null): void {
    if (this.fitWaiters.length === 0) {
      return;
    }
    const waiters = this.fitWaiters;
    this.fitWaiters = [];
    for (const waiter of waiters) {
      waiter(dimensions);
    }
  }
  private resetTerminalBeforeReplayDrainIfNeeded(terminal: XtermTerminal): boolean {
    if (!this.resetTerminalBeforeReplayDrain) {
      return false;
    }
    this.resetTerminalBeforeReplayDrain = false;
    terminal.reset();
    return true;
  }
  private showTerminalCwd(cwd: string): void {
    if (this.host) {
      setHostPaneChromeTitle(this.host, terminalPaneTitle(cwd));
    }
  }
  private writeStats(dirtyRows: number): void {
    const bufferLength = this.terminal?.buffer.active.length ?? 0;
    this.stats = {
      dirtyRows,
      droppedOutputChunks: this.outputBuffer.droppedChunkCount,
      liveTerminalRendererCount: this.visible && !this.frozen && this.host && this.terminal ? 1 : 0,
      pendingOutputChunks: this.outputBuffer.pendingChunkCount,
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
    syncTerminalHostState(this.host, {
      dirtyRows: this.stats.dirtyRows,
      focused: this.focused,
      frozen: this.frozen,
      lostSession: this.lostSession,
      pendingOutputChunks: this.stats.pendingOutputChunks,
      profileId: this.selectedProfileId,
      renderedRows: this.stats.renderedRows,
      scrollbackRows: this.stats.scrollbackRows,
      sessionId: this.sessionId,
      sessionStatus: this.sessionStatus,
      visible: this.visible,
    });
    this.chrome.syncHostStatus();
  }
}
