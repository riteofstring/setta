import type {
  PaneRenderItem,
  PaneRuntimeBudget,
  PaneRuntimeState,
  PaneRuntimeSummary,
  SurfaceKind,
} from "./types";

export const DEFAULT_PANE_BUDGET: PaneRuntimeBudget = {
  maxLiveHeavyDomPanes: 12,
  maxSnapshotPanes: 64,
};

export interface PaneRuntimePolicyOptions {
  degradeOverview?: boolean;
  degradeOverviewDuringResize?: boolean;
  degradeDuringMovement?: boolean;
  degradeDuringResize?: boolean;
}

type LiveHeavyDomSurfaceKind = "easy-button" | "fake-heavy-dom";
type SurfaceRuntimeCategory = "always-live" | "browser" | "heavy-dom" | "snapshot";

const liveHeavyDomSurfaceKinds = new Set<SurfaceKind>(["easy-button", "fake-heavy-dom"]);
const frozenLiveVisualSurfaceKinds = new Set<SurfaceKind>([
  "easy-button",
  "empty-frame",
  "fake-dom",
  "fake-heavy-dom",
  "settings-dom",
]);
const movementDegradedSurfaceKinds = new Set<SurfaceKind>([
  "browser",
  "easy-button",
  "fake-heavy-dom",
  "settings-dom",
]);
const surfaceRuntimeCategories = {
  browser: "browser",
  "easy-button": "heavy-dom",
  "empty-frame": "always-live",
  "fake-dom": "always-live",
  "fake-heavy-dom": "heavy-dom",
  "settings-dom": "always-live",
  snapshot: "snapshot",
} satisfies Record<SurfaceKind, SurfaceRuntimeCategory>;

interface RuntimeCounters {
  liveHeavyDom: number;
  snapshot: number;
}

export class PaneRuntimePolicy {
  private summary: PaneRuntimeSummary = emptySummary(DEFAULT_PANE_BUDGET);
  private readonly degradeOverview: boolean;
  private readonly degradeOverviewDuringResize: boolean;
  private readonly degradeDuringMovement: boolean;
  private readonly degradeDuringResize: boolean;

  constructor(
    private budget: PaneRuntimeBudget = DEFAULT_PANE_BUDGET,
    options: PaneRuntimePolicyOptions = {},
  ) {
    this.degradeOverview = options.degradeOverview ?? true;
    this.degradeOverviewDuringResize = options.degradeOverviewDuringResize ?? true;
    this.degradeDuringMovement = options.degradeDuringMovement ?? true;
    this.degradeDuringResize = options.degradeDuringResize ?? true;
    this.summary = emptySummary(budget);
  }

  setBudget(budget: PaneRuntimeBudget): void {
    this.budget = budget;
  }

  apply(items: PaneRenderItem[], movementPhase: "idle" | "moving"): PaneRuntimeSummary {
    const counters = {
      hidden: 0,
      live: 0,
      liveHeavyDom: 0,
      liveThrottled: 0,
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

  private countLiveSurface(kind: SurfaceKind, counters: RuntimeCounters): void {
    if (isLiveHeavyDomSurfaceKind(kind)) {
      counters.liveHeavyDom += 1;
    }
  }

  private runtimeStateForItem(
    item: PaneRenderItem,
    movementPhase: "idle" | "moving",
    counters: RuntimeCounters,
  ): PaneRuntimeState {
    if (!item.visible) {
      return "hidden";
    }
    if (this.degradesOverviewItem(item)) {
      return this.frozenVisualOrSnapshot(item.surfaceKind, counters);
    }
    if (this.degradesMovingSurface(item, movementPhase)) {
      return this.frozenVisualOrSnapshot(item.surfaceKind, counters);
    }
    if (item.focused) {
      return "live";
    }
    if (item.resizing && this.degradeDuringResize) {
      return this.runtimeStateForUnfocusedResizeKind(item.surfaceKind, counters);
    }

    return this.runtimeStateForUnfocusedVisibleKind(item.surfaceKind, movementPhase, counters);
  }

  private degradesOverviewItem(item: PaneRenderItem): boolean {
    if (item.presentationMode !== "overview") {
      return false;
    }
    return this.degradeOverview || (item.resizing && this.degradeOverviewDuringResize);
  }

  private degradesMovingSurface(item: PaneRenderItem, movementPhase: "idle" | "moving"): boolean {
    return (
      this.degradeDuringMovement &&
      movementPhase === "moving" &&
      movementDegradedSurfaceKinds.has(item.surfaceKind)
    );
  }

  private runtimeStateForUnfocusedResizeKind(
    kind: SurfaceKind,
    counters: RuntimeCounters,
  ): PaneRuntimeState {
    const category = surfaceRuntimeCategories[kind];
    switch (category) {
      case "heavy-dom":
        return this.snapshotOrThrottle(counters);
      case "always-live":
      case "browser":
      case "snapshot":
        return this.runtimeStateForCategory(category, "idle", counters);
      default:
        assertNever(category);
    }
  }

  private runtimeStateForUnfocusedVisibleKind(
    kind: SurfaceKind,
    movementPhase: "idle" | "moving",
    counters: RuntimeCounters,
  ): PaneRuntimeState {
    return this.runtimeStateForCategory(surfaceRuntimeCategories[kind], movementPhase, counters);
  }

  private runtimeStateForCategory(
    category: SurfaceRuntimeCategory,
    movementPhase: "idle" | "moving",
    counters: RuntimeCounters,
  ): PaneRuntimeState {
    switch (category) {
      case "always-live":
        return "live";
      case "browser":
        return this.runtimeStateForBrowser(movementPhase, counters);
      case "heavy-dom":
        return this.runtimeStateForHeavyDom(movementPhase, counters);
      case "snapshot":
        return this.snapshotOrThrottle(counters);
      default:
        assertNever(category);
    }
  }

  private runtimeStateForBrowser(
    movementPhase: "idle" | "moving",
    counters: { snapshot: number },
  ): PaneRuntimeState {
    if (this.degradeDuringMovement && movementPhase === "moving") {
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
    if (this.degradeDuringMovement && movementPhase === "moving") {
      return this.snapshotOrThrottle(counters);
    }
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

  private frozenVisualOrSnapshot(
    kind: SurfaceKind,
    counters: { snapshot: number },
  ): PaneRuntimeState {
    if (frozenLiveVisualSurfaceKinds.has(kind)) {
      return "live-throttled";
    }
    return this.snapshotOrThrottle(counters);
  }
}

function isLiveHeavyDomSurfaceKind(kind: SurfaceKind): kind is LiveHeavyDomSurfaceKind {
  return liveHeavyDomSurfaceKinds.has(kind);
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
  throw new Error(`Unhandled workspace runtime policy value: ${String(value)}`);
}
