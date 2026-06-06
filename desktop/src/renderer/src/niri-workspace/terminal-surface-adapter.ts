import type { FitAddon as XtermFitAddon } from "@xterm/addon-fit";
import type { TerminalEvent } from "@generated/backend";
import type { Terminal as XtermTerminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import type {
  FreezeReason,
  NiriPane,
  PaneSnapshot,
  Rect,
  ResumeReason,
  SurfaceAdapter,
  SurfaceId,
  TerminalSurfaceStats,
  ViewportChangeReason,
} from "./types";

interface TerminalFrameLoop {
  cancelFrame(handle: number): void;
  requestFrame(callback: FrameRequestCallback): number;
}

const browserFrameLoop: TerminalFrameLoop = {
  cancelFrame(handle) {
    if (typeof window !== "undefined") {
      window.cancelAnimationFrame(handle);
    }
  },
  requestFrame(callback) {
    if (typeof window === "undefined") {
      return 0;
    }
    return window.requestAnimationFrame(callback);
  },
};

const maxPendingOutputChunks = 640;
const maxChunksPerFrame = 10;
const maxDirtyRowsPerFrame = 32;
const maxScrollbackRows = 1200;
const rowHeightPx = 15;
const terminalChromeHeightPx = 68;
const defaultCols = 80;
const defaultRows = 24;
const inputChunkBytes = 64 * 1024;
const resizeDebounceMs = 80;

interface Disposable {
  dispose(): void;
}

export class TerminalSurfaceAdapter implements SurfaceAdapter {
  readonly kind = "terminal" as const;

  private destroyed = false;
  private fitAddon: XtermFitAddon | null = null;
  private focused = false;
  private frozen = false;
  private host: HTMLElement | null = null;
  private lastResize: { cols: number; rows: number } | null = null;
  private pendingResize: { cols: number; rows: number } | null = null;
  private resizeTimer: number | null = null;
  private sessionId: string | null = null;
  private startPromise: Promise<void> | null = null;
  private status: HTMLElement | null = null;
  private terminal: XtermTerminal | null = null;
  private terminalDisposables: Disposable[] = [];
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
    host.replaceChildren(content.root);
    this.syncHostState();
    const api = terminalAPI();
    if (!api) {
      this.showStatus("Terminal preload API is unavailable.");
      return;
    }
    this.unsubscribeEvents = api.onEvent((event) => this.handleTerminalEvent(event));
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
    this.disposeTerminal();
    this.host?.replaceChildren();
    this.host = null;
    this.status = null;
    this.visible = false;
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
    this.showStatus("Starting shell");
    this.startPromise = api
      .create(this.workspaceId, this.pane.paneId, {
        cols: dimensions.cols,
        rows: dimensions.rows,
      })
      .then((response) => {
        this.sessionId = response.session.id;
        this.lastResize = {
          cols: response.session.cols,
          rows: response.session.rows,
        };
        this.showStatus(statusLabel(response.session.status, response.session.cwd));
        this.syncHostState();
        this.fitAndResize();
      })
      .catch((error: unknown) => {
        this.showStatus(errorMessage(error));
      });
  }

  private handleTerminalEvent(event: TerminalEvent): void {
    if (!this.eventMatchesPane(event)) {
      return;
    }
    this.sessionId = event.sessionId;
    switch (event.type) {
      case "terminal.output":
        this.writeOutput(event.payload.dataBase64, event.payload.byteCount);
        break;
      case "terminal.started":
        this.showStatus(statusLabel(event.payload.status, event.payload.cwd));
        break;
      case "terminal.exited":
        this.showStatus(exitStatusLabel(event.payload.exitCode, event.payload.message));
        break;
      case "terminal.closed":
        this.showStatus("Terminal closed");
        break;
      case "terminal.error":
        this.showStatus(event.payload.message || "Terminal failed");
        break;
      default:
        assertNever(event.type);
    }
    this.syncHostState();
  }

  private eventMatchesPane(event: TerminalEvent): boolean {
    if (this.sessionId) {
      return event.sessionId === this.sessionId;
    }
    return event.workspaceId === this.workspaceId && event.paneId === this.pane.paneId;
  }

  private writeOutput(dataBase64: string, byteCount: number): void {
    const terminal = this.terminal;
    if (!terminal || dataBase64 === "") {
      return;
    }
    terminal.write(bytesFromBase64(dataBase64));
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

  private writeStats(dirtyRows: number): void {
    const bufferLength = this.terminal?.buffer.active.length ?? 0;
    this.stats = {
      dirtyRows,
      droppedOutputChunks: 0,
      liveTerminalRendererCount: this.visible && !this.frozen && this.host && this.terminal ? 1 : 0,
      pendingOutputChunks: 0,
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
    this.host.dataset.terminalPendingChunks = String(this.stats.pendingOutputChunks);
    this.host.dataset.terminalSessionId = this.sessionId ?? "";
    this.host.dataset.terminalScrollbackRows = String(this.stats.scrollbackRows);
    this.host.dataset.terminalVirtualRows = String(this.stats.renderedRows);
    this.host.style.visibility = this.visible ? "visible" : "hidden";
  }
}

export class SyntheticTerminalSessionState {
  private readonly dirtyRowIndexes = new Set<number>();
  private readonly pendingOutput: string[] = [];
  private readonly rows: string[] = [];
  private droppedOutputChunks = 0;

  constructor(readonly sessionId: string) {}

  get droppedChunks(): number {
    return this.droppedOutputChunks;
  }

  get pendingChunkCount(): number {
    return this.pendingOutput.length;
  }

  get hasPendingOutput(): boolean {
    return this.pendingOutput.length > 0;
  }

  get scrollbackRowCount(): number {
    return this.rows.length;
  }

  drainPendingOutput(maxChunks: number): number {
    const chunkCount = Math.min(maxChunks, this.pendingOutput.length);
    const chunks = this.pendingOutput.splice(0, chunkCount);
    for (const chunk of chunks) {
      this.appendRow(chunk);
    }
    this.trimScrollback();
    return chunkCount;
  }

  enqueueOutput(chunks: readonly string[]): void {
    this.pendingOutput.push(...chunks);
    this.dropOverflowOutput();
  }

  takeVirtualRows(rowCount: number): Array<{ absoluteIndex: number; text: string }> {
    const boundedRowCount = Math.max(1, rowCount);
    const start = Math.max(0, this.rows.length - boundedRowCount);
    return this.rows.slice(start).map((text, index) => ({
      absoluteIndex: start + index,
      text,
    }));
  }

  takeDirtyRows(maxRows: number): number[] {
    const dirtyRows = [...this.dirtyRowIndexes]
      .sort((left, right) => left - right)
      .slice(0, maxRows);
    for (const index of dirtyRows) {
      this.dirtyRowIndexes.delete(index);
    }
    return dirtyRows;
  }

  private appendRow(text: string): void {
    this.rows.push(text);
    this.dirtyRowIndexes.add(this.rows.length - 1);
  }

  private dropOverflowOutput(): void {
    const overflow = this.pendingOutput.length - maxPendingOutputChunks;
    if (overflow <= 0) {
      return;
    }
    this.pendingOutput.splice(0, overflow);
    this.droppedOutputChunks += overflow;
  }

  private trimScrollback(): void {
    const overflow = this.rows.length - maxScrollbackRows;
    if (overflow <= 0) {
      return;
    }
    this.rows.splice(0, overflow);
    this.remapDirtyRowsAfterTrim(overflow);
  }

  private remapDirtyRowsAfterTrim(overflow: number): void {
    const remappedRows = [...this.dirtyRowIndexes]
      .map((index) => index - overflow)
      .filter((index) => index >= 0);
    this.dirtyRowIndexes.clear();
    for (const index of remappedRows) {
      this.dirtyRowIndexes.add(index);
    }
  }
}

export class SyntheticTerminalSurfaceAdapter implements SurfaceAdapter {
  readonly kind = "fake-terminal" as const;

  private destroyed = false;
  private focused = false;
  private frameHandle: number | null = null;
  private frozen = false;
  private host: HTMLElement | null = null;
  private lastDirtyRows = 0;
  private renderedRowElements: HTMLElement[] = [];
  private renderedRows = 0;
  private rowsRoot: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private visible = false;
  private visibleRowCount = 18;

  private stats: TerminalSurfaceStats = emptyTerminalStats();

  constructor(
    private readonly pane: NiriPane,
    private readonly session: SyntheticTerminalSessionState = seededTerminalSession(pane),
    private readonly frameLoop: TerminalFrameLoop = browserFrameLoop,
  ) {}

  get isRendering(): boolean {
    return this.frameHandle !== null;
  }

  get surfaceId(): SurfaceId {
    return this.pane.surfaceId;
  }

  enqueueOutputFlood(chunkCount: number): void {
    this.session.enqueueOutput(terminalOutputLines(this.pane, chunkCount, "flood"));
    this.updateLoop();
  }

  mount(host: HTMLElement): void {
    this.ensureNotDestroyed();
    this.host = host;
    host.dataset.surfaceId = this.surfaceId;
    host.dataset.surfaceKind = this.kind;
    const content = renderTerminalContent(host, this.pane);
    this.rowsRoot = content.rows;
    this.status = content.status;
    host.replaceChildren(content.root);
    this.syncHostState();
    this.updateLoop();
  }

  unmount(): void {
    this.stopLoop();
    this.host?.replaceChildren();
    this.host = null;
    this.renderedRowElements = [];
    this.rowsRoot = null;
    this.status = null;
    this.visible = false;
    this.writeStats(0);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) {
      this.writeStats(0);
    }
    this.syncHostState();
    this.updateLoop();
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.syncHostState();
  }

  setViewport(rect: Rect, reason: ViewportChangeReason): void {
    this.visibleRowCount = visibleRowsForHeight(rect.height);
    this.host?.setAttribute("data-viewport-reason", reason);
    this.host?.setAttribute(
      "data-surface-viewport",
      `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    );
    this.ensureRowElements();
    this.renderRows(true);
  }

  freeze(reason: FreezeReason): void {
    this.frozen = true;
    this.host?.setAttribute("data-freeze-reason", reason);
    this.writeStats(0);
    this.syncHostState();
    this.updateLoop();
  }

  resume(reason: ResumeReason): void {
    this.frozen = false;
    this.host?.setAttribute("data-resume-reason", reason);
    this.syncHostState();
    this.updateLoop();
  }

  captureSnapshot(): Promise<PaneSnapshot> {
    return Promise.resolve({
      capturedAt: performanceNow(),
      label: `${this.pane.title} terminal ${this.session.scrollbackRowCount} rows`,
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
    this.unmount();
    this.destroyed = true;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error(`terminal surface ${this.surfaceId} has already been destroyed`);
    }
  }

  private ensureRowElements(): void {
    if (!this.rowsRoot || this.renderedRowElements.length === this.visibleRowCount) {
      return;
    }
    const document = this.rowsRoot.ownerDocument;
    this.renderedRowElements = [];
    for (let index = 0; index < this.visibleRowCount; index += 1) {
      const row = document.createElement("div");
      row.className = "niri-terminal-row";
      this.renderedRowElements.push(row);
    }
    this.rowsRoot.replaceChildren(...this.renderedRowElements);
  }

  private paint = (): void => {
    this.frameHandle = null;
    if (!this.visible || this.frozen || !this.host) {
      this.writeStats(0);
      return;
    }
    const drainedChunks = this.session.drainPendingOutput(maxChunksPerFrame);
    if (drainedChunks === 0) {
      this.writeStats(0);
      this.syncHostState();
      return;
    }
    this.renderRows(false);
    this.updateLoop();
  };

  private renderRows(force: boolean): void {
    this.ensureRowElements();
    const virtualRows = this.session.takeVirtualRows(this.visibleRowCount);
    const dirtyRows = this.session.takeDirtyRows(maxDirtyRowsPerFrame);
    const dirtyRowSet = new Set(dirtyRows);
    let renderedThisFrame = 0;

    for (let index = 0; index < this.renderedRowElements.length; index += 1) {
      const row = virtualRows[index];
      const element = this.renderedRowElements[index];
      if (!row || !element) {
        continue;
      }
      if (
        force ||
        dirtyRowSet.has(row.absoluteIndex) ||
        element.dataset.rowIndex !== String(row.absoluteIndex)
      ) {
        element.dataset.rowIndex = String(row.absoluteIndex);
        element.textContent = row.text;
        renderedThisFrame += 1;
      }
    }

    this.renderedRows = virtualRows.length;
    this.writeStats(renderedThisFrame);
    this.syncHostState();
  }

  private stopLoop(): void {
    if (this.frameHandle === null) {
      return;
    }
    this.frameLoop.cancelFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private syncHostState(): void {
    if (!this.host) {
      return;
    }
    this.host.dataset.surfaceFocused = String(this.focused);
    this.host.dataset.surfaceFrozen = String(this.frozen);
    this.host.dataset.surfaceVisible = String(this.visible);
    this.host.dataset.terminalDirtyRows = String(this.stats.dirtyRows);
    this.host.dataset.terminalPendingChunks = String(this.stats.pendingOutputChunks);
    this.host.dataset.terminalScrollbackRows = String(this.stats.scrollbackRows);
    this.host.dataset.terminalVirtualRows = String(this.renderedRows);
    this.host.style.visibility = this.visible ? "visible" : "hidden";
    if (this.status) {
      this.status.textContent = `${this.session.scrollbackRowCount} rows / ${this.session.pendingChunkCount} queued`;
    }
  }

  private updateLoop(): void {
    if (!this.visible || this.frozen || !this.host || !this.session.hasPendingOutput) {
      this.stopLoop();
      return;
    }
    if (this.frameHandle === null) {
      this.frameHandle = this.frameLoop.requestFrame(this.paint);
    }
  }

  private writeStats(dirtyRows: number): void {
    if (dirtyRows > 0) {
      this.lastDirtyRows = dirtyRows;
    }
    this.stats = {
      dirtyRows: dirtyRows > 0 ? dirtyRows : this.lastDirtyRows,
      droppedOutputChunks: this.session.droppedChunks,
      liveTerminalRendererCount: this.visible && !this.frozen && this.host ? 1 : 0,
      pendingOutputChunks: this.session.pendingChunkCount,
      renderedRows: this.renderedRows,
      scrollbackRows: this.session.scrollbackRowCount,
    };
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
): { root: HTMLElement; status: HTMLElement; viewport: HTMLElement } {
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

  root.append(header, viewport);
  return { root, status, viewport };
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

function renderTerminalContent(
  host: HTMLElement,
  pane: NiriPane,
): { root: HTMLElement; rows: HTMLElement; status: HTMLElement } {
  const document = host.ownerDocument;
  const root = document.createElement("div");
  root.className = "niri-pane-content niri-terminal-surface";

  const header = document.createElement("div");
  header.className = "niri-terminal-header";
  const title = document.createElement("h2");
  title.textContent = pane.title;
  const status = document.createElement("span");
  status.className = "niri-terminal-status";
  header.append(title, status);

  const rows = document.createElement("div");
  rows.className = "niri-terminal-rows";
  rows.setAttribute("aria-label", `${pane.title} virtualized terminal scrollback`);

  root.append(header, rows);
  return { root, rows, status };
}

function seededTerminalSession(pane: NiriPane): SyntheticTerminalSessionState {
  const session = new SyntheticTerminalSessionState(pane.surfaceId);
  session.enqueueOutput(terminalOutputLines(pane, 180, "seed"));
  return session;
}

function terminalOutputLines(pane: NiriPane, count: number, source: string): string[] {
  const lines: string[] = [];
  const prefix = `setta:${pane.sequence.toString(16).padStart(2, "0")}`;
  for (let index = 0; index < count; index += 1) {
    const sample = (pane.sequence * 97 + index * 17) % 997;
    lines.push(`${prefix} ${source} ${String(index).padStart(4, "0")} packet=${sample}`);
  }
  return lines;
}

function visibleRowsForHeight(height: number): number {
  const availableHeight = Math.max(rowHeightPx * 4, height - terminalChromeHeightPx);
  return Math.max(6, Math.min(36, Math.floor(availableHeight / rowHeightPx)));
}
