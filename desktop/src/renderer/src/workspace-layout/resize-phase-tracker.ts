import type { Rect, ResizePhase } from "./types";

const defaultSettleDelayMs = 160;

export class ResizePhaseTracker {
  private lastChangedAt = 0;
  private lastViewport: Rect | null = null;
  private resizeActive = false;
  private settledEmitted = false;

  constructor(private readonly settleDelayMs = defaultSettleDelayMs) {}

  sample(viewport: Rect, timestamp: number): ResizePhase {
    if (!this.lastViewport) {
      this.lastViewport = { ...viewport };
      return "idle";
    }

    if (viewportSizeChanged(this.lastViewport, viewport)) {
      this.lastViewport = { ...viewport };
      this.lastChangedAt = timestamp;
      this.resizeActive = true;
      this.settledEmitted = false;
      return "active";
    }

    if (!this.resizeActive) {
      return "idle";
    }

    if (timestamp - this.lastChangedAt < this.settleDelayMs) {
      return "active";
    }

    if (!this.settledEmitted) {
      this.resizeActive = false;
      this.settledEmitted = true;
      return "settled";
    }

    return "idle";
  }
}

function viewportSizeChanged(previous: Rect, next: Rect): boolean {
  return previous.height !== next.height || previous.width !== next.width;
}
