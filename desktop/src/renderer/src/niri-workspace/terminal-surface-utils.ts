import type { TerminalSurfaceStats } from "./types";

export function emptyTerminalStats(): TerminalSurfaceStats {
  return {
    dirtyRows: 0,
    droppedOutputChunks: 0,
    liveTerminalRendererCount: 0,
    pendingOutputChunks: 0,
    renderedRows: 0,
    scrollbackRows: 0,
  };
}

export function performanceNow(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}

export function eventTargetsTerminalSurface(event: Event): boolean {
  if (event.target instanceof Element && event.target.closest(".niri-terminal-surface")) {
    return true;
  }
  return event
    .composedPath()
    .some(
      (target) => target instanceof Element && target.classList.contains("niri-terminal-surface"),
    );
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled terminal event type: ${String(value)}`);
}
