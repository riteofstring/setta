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

const maxPendingOutputChunks = 640;
const maxChunksPerFrame = 10;
const maxDirtyRowsPerFrame = 32;
const maxScrollbackRows = 1200;
const rowHeightPx = 15;
const terminalChromeHeightPx = 68;

export interface SyntheticTerminalFrameLoop {
  cancelFrame(handle: number): void;
  requestFrame(callback: FrameRequestCallback): number;
}

const browserFrameLoop: SyntheticTerminalFrameLoop = {
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
    private readonly frameLoop: SyntheticTerminalFrameLoop = browserFrameLoop,
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

function renderTerminalContent(
  host: HTMLElement,
  pane: NiriPane,
): { root: HTMLElement; rows: HTMLElement; status: HTMLElement } {
  const document = host.ownerDocument;
  const root = document.createElement("div");
  root.className = "niri-pane-content niri-terminal-surface";

  const status = document.createElement("span");
  status.className = "niri-terminal-status";
  status.setAttribute("aria-live", "polite");
  status.setAttribute("data-terminal-status", "true");

  const rows = document.createElement("div");
  rows.className = "niri-terminal-rows";
  rows.setAttribute("aria-label", `${pane.title} virtualized terminal scrollback`);

  root.append(status, rows);
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
