import type {
  PaneRenderItem,
  PaneRuntimeBudget,
  PaneRuntimeState,
  PaneRuntimeSummary,
  SurfaceKind,
} from "./types";

export const DEFAULT_PANE_BUDGET: PaneRuntimeBudget = {
  maxLiveBrowserPanes: 6,
  maxLiveHeavyDomPanes: 12,
  maxLiveTerminalRenderers: 8,
  maxLiveWebGpuCanvases: 4,
  maxSnapshotPanes: 64,
};

export class PaneRuntimePolicy {
  private summary: PaneRuntimeSummary = emptySummary(DEFAULT_PANE_BUDGET);

  constructor(private readonly budget: PaneRuntimeBudget = DEFAULT_PANE_BUDGET) {
    this.summary = emptySummary(budget);
  }

  apply(items: PaneRenderItem[], movementPhase: "idle" | "moving"): PaneRuntimeSummary {
    const counters = {
      hidden: 0,
      liveBrowserPanes: 0,
      live: 0,
      liveHeavyDom: 0,
      liveThrottled: 0,
      liveWebGpuCanvases: 0,
      snapshot: 0,
      total: items.length,
    };

    for (const item of items) {
      item.runtimeState = this.runtimeStateForItem(item, movementPhase, counters);
      switch (item.runtimeState) {
        case "destroyed":
        case "hidden":
          counters.hidden += 1;
          break;
        case "live":
          counters.live += 1;
          this.countLiveSurface(item.surfaceKind, counters);
          break;
        case "live-throttled":
          counters.liveThrottled += 1;
          break;
        case "snapshot":
          counters.snapshot += 1;
          break;
        default:
          assertNever(item.runtimeState);
      }
    }

    this.summary = {
      budget: this.budget,
      hidden: counters.hidden,
      live: counters.live,
      liveThrottled: counters.liveThrottled,
      snapshot: counters.snapshot,
      total: counters.total,
    };
    return this.summary;
  }

  getSummary(): PaneRuntimeSummary {
    return this.summary;
  }

  private countLiveSurface(
    kind: SurfaceKind,
    counters: {
      liveHeavyDom: number;
      liveBrowserPanes: number;
      liveWebGpuCanvases: number;
    },
  ): void {
    switch (kind) {
      case "browser":
        counters.liveBrowserPanes += 1;
        return;
      case "chat-dom":
      case "fake-heavy-dom":
      case "fake-long-chat":
        counters.liveHeavyDom += 1;
        return;
      case "fake-canvas":
        counters.liveWebGpuCanvases += 1;
        return;
      case "fake-dom":
      case "settings-dom":
      case "snapshot":
        return;
      default:
        assertNever(kind);
    }
  }

  private runtimeStateForItem(
    item: PaneRenderItem,
    movementPhase: "idle" | "moving",
    counters: {
      liveBrowserPanes: number;
      liveHeavyDom: number;
      liveWebGpuCanvases: number;
      snapshot: number;
    },
  ): PaneRuntimeState {
    if (!item.visible) {
      return "hidden";
    }
    if (item.focused) {
      return "live";
    }

    return this.runtimeStateForUnfocusedVisibleKind(item.surfaceKind, movementPhase, counters);
  }

  private runtimeStateForUnfocusedVisibleKind(
    kind: SurfaceKind,
    movementPhase: "idle" | "moving",
    counters: {
      liveBrowserPanes: number;
      liveHeavyDom: number;
      liveWebGpuCanvases: number;
      snapshot: number;
    },
  ): PaneRuntimeState {
    switch (kind) {
      case "fake-dom":
      case "settings-dom":
        return "live";
      case "chat-dom":
      case "fake-heavy-dom":
        return this.runtimeStateForHeavyDom(movementPhase, counters);
      case "fake-long-chat":
        return this.runtimeStateForBudgetedHeavyDom(counters);
      case "fake-canvas":
        return this.runtimeStateForCanvas(movementPhase, counters);
      case "browser":
        return this.runtimeStateForBrowser(movementPhase, counters);
      case "snapshot":
        return this.snapshotOrThrottle(counters);
      default:
        assertNever(kind);
    }
  }

  private runtimeStateForCanvas(
    movementPhase: "idle" | "moving",
    counters: {
      liveWebGpuCanvases: number;
      snapshot: number;
    },
  ): PaneRuntimeState {
    if (movementPhase === "moving") {
      return this.snapshotOrThrottle(counters);
    }
    if (counters.liveWebGpuCanvases >= this.budget.maxLiveWebGpuCanvases) {
      return this.snapshotOrThrottle(counters);
    }
    return "live";
  }

  private runtimeStateForBrowser(
    _movementPhase: "idle" | "moving",
    counters: {
      liveBrowserPanes: number;
      snapshot: number;
    },
  ): PaneRuntimeState {
    if (counters.liveBrowserPanes >= this.budget.maxLiveBrowserPanes) {
      return this.snapshotOrThrottle(counters);
    }
    return "live";
  }

  private runtimeStateForHeavyDom(
    movementPhase: "idle" | "moving",
    counters: {
      liveHeavyDom: number;
      snapshot: number;
    },
  ): PaneRuntimeState {
    if (movementPhase === "moving") {
      return this.snapshotOrThrottle(counters);
    }
    if (counters.liveHeavyDom >= this.budget.maxLiveHeavyDomPanes) {
      return this.snapshotOrThrottle(counters);
    }
    return "live";
  }

  private runtimeStateForBudgetedHeavyDom(counters: {
    liveHeavyDom: number;
    snapshot: number;
  }): PaneRuntimeState {
    if (counters.liveHeavyDom >= this.budget.maxLiveHeavyDomPanes) {
      return this.snapshotOrThrottle(counters);
    }
    return "live";
  }

  private snapshotOrThrottle(counters: { snapshot: number }): PaneRuntimeState {
    if (counters.snapshot < this.budget.maxSnapshotPanes) {
      return "snapshot";
    }
    return "live-throttled";
  }
}

function emptySummary(budget: PaneRuntimeBudget): PaneRuntimeSummary {
  return {
    budget,
    hidden: 0,
    live: 0,
    liveThrottled: 0,
    snapshot: 0,
    total: 0,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled niri runtime policy value: ${String(value)}`);
}
