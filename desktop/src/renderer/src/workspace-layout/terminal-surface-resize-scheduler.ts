import type { TerminalSessionSummary } from "@generated/backend";

import { errorMessage } from "./terminal-ergonomics";
import { terminalAPI } from "./terminal-surface-session";

interface TerminalDimensions {
  cols: number;
  rows: number;
}

interface TerminalResizeDispatch extends TerminalDimensions {
  runtimeVersion: number;
  sessionId: string;
}

interface TerminalResizeSnapshot {
  destroyed: boolean;
  runtimeVersion: number;
  sessionId: string | null;
  status: string;
}

interface TerminalSurfaceSessionResizerOptions {
  applySessionSummary: (session: TerminalSessionSummary) => void;
  current: () => TerminalResizeSnapshot;
  showStatus: (message: string) => void;
}

interface ResizePreflight {
  api: NonNullable<ReturnType<typeof terminalAPI>>;
  sessionId: string;
}

export class TerminalSurfaceSessionResizer {
  private lastResize: TerminalDimensions | null = null;
  private pendingResize: TerminalResizeDispatch | null = null;
  private resizeTimer: number | null = null;

  constructor(
    private readonly delayMs: number,
    private readonly options: TerminalSurfaceSessionResizerOptions,
  ) {}

  setLastResize(dimensions: TerminalDimensions): void {
    this.lastResize = dimensions;
    if (
      this.pendingResize?.cols === dimensions.cols &&
      this.pendingResize.rows === dimensions.rows
    ) {
      this.pendingResize = null;
      if (this.resizeTimer !== null) {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = null;
      }
    }
  }

  currentCanResize(): boolean {
    return terminalSessionStatusCanResize(this.options.current().status);
  }

  schedule(cols: number, rows: number): void {
    const snapshot = this.options.current();
    const sessionId = snapshot.sessionId;
    if (!sessionId || !this.isCurrent(sessionId, snapshot.runtimeVersion)) {
      return;
    }
    if (this.lastResize?.cols === cols && this.lastResize.rows === rows) {
      return;
    }
    this.pendingResize = { cols, rows, runtimeVersion: snapshot.runtimeVersion, sessionId };
    if (this.resizeTimer !== null) {
      return;
    }
    this.resizeTimer = window.setTimeout(() => this.dispatchPendingResize(), this.delayMs);
  }

  async resizeImmediately(dimensions: TerminalDimensions, runtimeVersion: number): Promise<void> {
    const preflight = this.resizePreflight(dimensions, runtimeVersion);
    if (!preflight) {
      return;
    }
    this.clear();
    try {
      const response = await preflight.api.resize({
        ...dimensions,
        sessionId: preflight.sessionId,
      });
      if (this.isCurrent(preflight.sessionId, runtimeVersion)) {
        this.options.applySessionSummary(response.session);
      }
    } catch (error: unknown) {
      if (this.isCurrent(preflight.sessionId, runtimeVersion)) {
        this.options.showStatus(`Terminal resize failed: ${errorMessage(error)}`);
      }
    }
  }

  clear(): void {
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    this.pendingResize = null;
  }

  private dispatchPendingResize(): void {
    this.resizeTimer = null;
    const next = this.pendingResize;
    this.pendingResize = null;
    if (!next || !this.isCurrent(next.sessionId, next.runtimeVersion)) {
      return;
    }
    this.lastResize = { cols: next.cols, rows: next.rows };
    void terminalAPI()?.resize({
      cols: next.cols,
      rows: next.rows,
      sessionId: next.sessionId,
    });
  }

  private resizePreflight(
    dimensions: TerminalDimensions,
    runtimeVersion: number,
  ): ResizePreflight | null {
    const sessionId = this.options.current().sessionId;
    if (!sessionId || !this.isCurrent(sessionId, runtimeVersion)) {
      return null;
    }
    if (this.lastResize?.cols === dimensions.cols && this.lastResize.rows === dimensions.rows) {
      return null;
    }
    const api = terminalAPI();
    return api ? { api, sessionId } : null;
  }

  private isCurrent(sessionId: string, runtimeVersion: number): boolean {
    const snapshot = this.options.current();
    return (
      !snapshot.destroyed &&
      snapshot.runtimeVersion === runtimeVersion &&
      snapshot.sessionId === sessionId &&
      terminalSessionStatusCanResize(snapshot.status)
    );
  }
}

function terminalSessionStatusCanResize(status: string): boolean {
  return status === "running" || status === "starting";
}
