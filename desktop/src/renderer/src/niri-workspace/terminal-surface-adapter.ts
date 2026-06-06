import type { FitAddon as XtermFitAddon } from "@xterm/addon-fit";
import type { TerminalEvent, TerminalSessionSummary } from "@generated/backend";
import type { Terminal as XtermTerminal } from "@xterm/xterm";
import type { BackendProcessStatus } from "@shared/types";
import "@xterm/xterm/css/xterm.css";

import type {
  FreezeReason,
  NiriPane,
  PaneSnapshot,
  Rect,
  ResumeReason,
  SurfaceAdapter,
  SurfaceId,
  ViewportChangeReason,
  TerminalSurfaceStats,
} from "./types";

const maxPendingOutputChunks = 640;
const maxScrollbackRows = 1200;
const defaultCols = 80;
const defaultRows = 24;
const inputChunkBytes = 64 * 1024;
const resizeDebounceMs = 80;

interface Disposable {
  dispose(): void;
}

interface PendingTerminalOutput {
  byteCount: number;
  dataBase64: string;
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
  private fitAddon: XtermFitAddon | null = null;
  private focused = false;
  private frozen = false;
  private host: HTMLElement | null = null;
  private lastResize: { cols: number; rows: number } | null = null;
  private lostSession = false;
  private pendingResize: { cols: number; rows: number } | null = null;
  private readonly pendingOutput: PendingTerminalOutput[] = [];
  private resizeTimer: number | null = null;
  private sessionId: string | null = null;
  private sessionStatus = "";
  private startPromise: Promise<void> | null = null;
  private status: HTMLElement | null = null;
  private terminal: XtermTerminal | null = null;
  private terminalDisposables: Disposable[] = [];
  private unsubscribeBackendStatus: (() => void) | null = null;
  private unsubscribeEvents: (() => void) | null = null;
  private visible = false;

  private stats: TerminalSurfaceStats = emptyTerminalStats();

  constructor(
    private readonly pane: NiriPane,
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
    void this.mountTerminal(content.viewport)
      .then(() => {
        this.startSession();
      })
      .catch((error: unknown) => {
        this.showStatus(errorMessage(error));
      });
  }

  unmount(): void {
    this.clearResizeTimer();
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = null;
    this.unsubscribeBackendStatus?.();
    this.unsubscribeBackendStatus = null;
    this.disposeTerminal();
    this.host?.replaceChildren();
    this.host = null;
    this.status = null;
    this.exitOverlay = null;
    this.exitOverlayMessage = null;
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

  private async mountTerminal(viewport: HTMLElement): Promise<void> {
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ]);
    if (!this.host || this.destroyed || !this.host.contains(viewport)) {
      return;
    }
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      rows: defaultRows,
      scrollback: maxScrollbackRows,
      theme: {
        background: "#09090b",
        cursor: "#e4e4e7",
        foreground: "#e4e4e7",
        selectionBackground: "#3f3f46",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(viewport);
    this.terminal = terminal;
    this.fitAddon = fitAddon;
    this.terminalDisposables = [
      terminal.onData((data) => {
        this.sendInput(data);
      }),
      terminal.onResize(({ cols, rows }) => {
        this.scheduleResize(cols, rows);
      }),
    ];
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
        this.applySessionSummary(response.session);
        this.fitAndResize();
      })
      .catch((error: unknown) => {
        if (this.sessionId) {
          this.showLostSession(errorMessage(error));
          return;
        }
        this.showStatus(errorMessage(error));
        this.showExitOverlay("Terminal failed");
      });
  }

  private async attachOrCreateSession(
    api: NonNullable<ReturnType<typeof terminalAPI>>,
    dimensions: { cols: number; rows: number },
  ) {
    try {
      return await api.attach(this.workspaceId, this.pane.paneId);
    } catch (error: unknown) {
      if (this.sessionId) {
        throw error;
      }
      this.showStatus("Starting shell");
      return api.create(this.workspaceId, this.pane.paneId, {
        cols: dimensions.cols,
        rows: dimensions.rows,
      });
    }
  }

  private applySessionSummary(session: TerminalSessionSummary): void {
    this.sessionId = session.id;
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

  private sendInput(data: string): void {
    if (!this.sessionId) {
      return;
    }
    const bytes = new TextEncoder().encode(data);
    for (let offset = 0; offset < bytes.length; offset += inputChunkBytes) {
      const chunk = bytes.slice(offset, offset + inputChunkBytes);
      void terminalAPI()?.input({
        dataBase64: base64FromBytes(chunk),
        sessionId: this.sessionId,
      });
    }
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

  private restartSession(): void {
    const previousSessionId = this.sessionId;
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
    if (!this.visible || this.frozen || !this.host || !this.fitAddon || !this.terminal) {
      this.writeStats(0);
      return;
    }
    if (this.host.clientWidth <= 0 || this.host.clientHeight <= 0) {
      return;
    }
    this.fitAddon.fit();
    this.scheduleResize(this.terminal.cols, this.terminal.rows);
    this.writeStats(1);
    this.syncHostState();
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
  }

  private clearResizeTimer(): void {
    if (this.resizeTimer === null) {
      return;
    }
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = null;
    this.pendingResize = null;
  }

  private showStatus(message: string): void {
    if (this.status) {
      this.status.textContent = message;
    }
  }

  private showExitOverlay(message: string): void {
    if (this.exitOverlayMessage) {
      this.exitOverlayMessage.textContent = message;
    }
    this.exitOverlay?.removeAttribute("hidden");
  }

  private hideExitOverlay(): void {
    this.exitOverlay?.setAttribute("hidden", "true");
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
    this.host.dataset.terminalSessionId = this.sessionId ?? "";
    this.host.dataset.terminalStatus = this.sessionStatus;
    this.host.dataset.terminalScrollbackRows = String(this.stats.scrollbackRows);
    this.host.dataset.terminalVirtualRows = String(this.stats.renderedRows);
    this.host.style.visibility = this.visible ? "visible" : "hidden";
  }
}

function emptyTerminalStats(): TerminalSurfaceStats {
  return {
    dirtyRows: 0,
    droppedOutputChunks: 0,
    liveTerminalRendererCount: 0,
    pendingOutputChunks: 0,
    renderedRows: 0,
    scrollbackRows: 0,
  };
}

function performanceNow(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}

function renderXtermContent(
  host: HTMLElement,
  pane: NiriPane,
): {
  closeButton: HTMLButtonElement;
  exitOverlay: HTMLElement;
  exitOverlayMessage: HTMLElement;
  restartButton: HTMLButtonElement;
  root: HTMLElement;
  status: HTMLElement;
  viewport: HTMLElement;
} {
  const document = host.ownerDocument;
  const root = document.createElement("div");
  root.className = "niri-pane-content niri-terminal-surface niri-xterm-surface";

  const header = document.createElement("div");
  header.className = "niri-terminal-header";
  const title = document.createElement("h2");
  title.textContent = pane.title;
  const status = document.createElement("span");
  status.className = "niri-terminal-status";
  header.append(title, status);

  const viewport = document.createElement("div");
  viewport.className = "niri-xterm-viewport";
  viewport.setAttribute("aria-label", `${pane.title} terminal`);
  viewport.addEventListener("keydown", stopTerminalKeyPropagation, { capture: true });

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

  root.append(header, viewport, exitOverlay);
  return { closeButton, exitOverlay, exitOverlayMessage, restartButton, root, status, viewport };
}

function stopTerminalKeyPropagation(event: KeyboardEvent): void {
  event.stopPropagation();
}

function terminalAPI() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.setta?.terminal ?? null;
}

function bytesFromBase64(dataBase64: string): Uint8Array {
  const raw = window.atob(dataBase64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function statusLabel(status: string, cwd: string): string {
  if (status === "running") {
    return cwd;
  }
  return status;
}

function exitStatusLabel(exitCode: number, message: string): string {
  if (exitCode === 0) {
    return "Terminal exited";
  }
  return message || `Terminal exited with code ${exitCode}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Terminal failed";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled terminal event type: ${String(value)}`);
}
