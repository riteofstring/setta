/**
 * The idle scheduler.
 *
 * The graph draws only while something is moving. A pushed batch, a pointer
 * move, a fold, a camera ease, or an unsettled node keeps the loop awake; when
 * the last of them finishes, the loop stops and the process goes quiet. That is
 * the plan's "run `requestAnimationFrame` only while motion or visible live
 * changes require it ... sleep when the graph is static, occluded, or the app
 * is backgrounded ... resume without a catch-up burst".
 *
 * Resuming without a burst is the part that needs care: after a sleep the next
 * timestamp can be seconds later. The delta is clamped, so the graph continues
 * from where it was rather than fast-forwarding every eased value in one frame.
 *
 * The host's frame source, cancel, and clock are injected so the loop is
 * exercisable without a browser.
 */

export interface GraphFrameSchedulerHost {
  requestFrame(callback: (timestampMs: number) => void): number;
  cancelFrame(handle: number): void;
}

export interface GraphFrameTiming {
  readonly timestampMs: number;
  readonly deltaSeconds: number;
}

/** `continue` keeps the loop awake for another frame; `idle` lets it sleep. */
export type GraphFrameOutcome = "continue" | "idle";

/** Longest delta a single frame may advance the graph clock by. */
export const graphMaximumFrameDeltaSeconds = 0.05;

export class GraphFrameScheduler {
  private handle: number | null = null;
  private lastTimestampMs: number | null = null;
  private visible = true;
  private stopped = false;
  private pendingRequest = false;

  constructor(
    private readonly host: GraphFrameSchedulerHost,
    private readonly render: (timing: GraphFrameTiming) => GraphFrameOutcome,
  ) {}

  /** Wakes the loop. Safe to call from every event that changes the picture. */
  requestFrame(): void {
    if (this.stopped || !this.visible) {
      this.pendingRequest = true;
      return;
    }
    this.pendingRequest = false;
    if (this.handle !== null) {
      return;
    }
    this.handle = this.host.requestFrame(this.tick);
  }

  /**
   * Occlusion and backgrounding. A hidden graph stops entirely; becoming
   * visible again resumes from the current clock rather than replaying the
   * frames that were skipped.
   */
  setVisible(visible: boolean): void {
    if (visible === this.visible) {
      return;
    }
    this.visible = visible;
    if (!visible) {
      // A scheduled frame represented unfinished visible work. Preserve that
      // wake across cancellation even when no new batch arrives while hidden.
      this.pendingRequest = this.pendingRequest || this.handle !== null;
      this.cancel();
      return;
    }
    this.lastTimestampMs = null;
    if (this.pendingRequest) {
      this.requestFrame();
    }
  }

  stop(): void {
    this.stopped = true;
    this.cancel();
  }

  isAwake(): boolean {
    return this.handle !== null;
  }

  private cancel(): void {
    if (this.handle === null) {
      return;
    }
    this.host.cancelFrame(this.handle);
    this.handle = null;
    this.lastTimestampMs = null;
  }

  private readonly tick = (timestampMs: number): void => {
    this.handle = null;
    if (this.stopped || !this.visible) {
      return;
    }
    const rawDeltaMs = this.lastTimestampMs === null ? 0 : timestampMs - this.lastTimestampMs;
    this.lastTimestampMs = timestampMs;
    const deltaSeconds = Math.min(graphMaximumFrameDeltaSeconds, Math.max(0, rawDeltaMs) / 1000);
    const outcome = this.render({
      timestampMs,
      deltaSeconds,
    });
    if (outcome === "continue" || this.pendingRequest) {
      this.pendingRequest = false;
      this.handle = this.host.requestFrame(this.tick);
      return;
    }
    // Asleep: the next `requestFrame` restarts from the current clock, so the
    // graph never owes itself the time it spent idle.
    this.lastTimestampMs = null;
  };
}
