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

export interface PaneRuntimePolicyOptions {
  degradeOverview?: boolean;
  degradeOverviewDuringResize?: boolean;
  degradeDuringMovement?: boolean;
  degradeDuringResize?: boolean;
}

type LiveCanvasSurfaceKind = "workflow-graph";
type LiveHeavyDomSurfaceKind =
  | "chat-dom"
  | "fake-heavy-dom"
  | "fake-long-chat"
  | "semantic-node-details"
  | "workflow-node-details"
  | "workflow-settings";
type SurfaceRuntimeCategory =
  | "always-live"
  | "browser"
  | "canvas"
  | "git-graph"
  | "heavy-dom"
  | "heavy-dom-budgeted"
  | "snapshot"
  | "terminal";

const liveCanvasSurfaceKinds = new Set<SurfaceKind>(["workflow-graph"]);
const liveHeavyDomSurfaceKinds = new Set<SurfaceKind>([
  "chat-dom",
  "fake-heavy-dom",
  "fake-long-chat",
  "semantic-node-details",
  "workflow-node-details",
  "workflow-settings",
]);
const movementDegradedSurfaceKinds = new Set<SurfaceKind>([
  "browser",
  "chat-dom",
  "fake-heavy-dom",
  "fake-long-chat",
  "fake-terminal",
  "git-graph",
  "semantic-node-details",
  "settings-dom",
  "terminal",
  "workflow-graph",
  "workflow-node-details",
  "workflow-settings",
]);
const surfaceRuntimeCategories = {
  browser: "browser",
  "chat-dom": "heavy-dom",
  "empty-frame": "always-live",
  "fake-dom": "always-live",
  "fake-heavy-dom": "heavy-dom",
  "fake-long-chat": "heavy-dom-budgeted",
  "fake-terminal": "terminal",
  "git-graph": "git-graph",
  "workflow-graph": "canvas",
  "settings-dom": "always-live",
  "semantic-node-details": "heavy-dom",
  snapshot: "snapshot",
  terminal: "terminal",
  "workflow-node-details": "heavy-dom",
  "workflow-settings": "heavy-dom",
} satisfies Record<SurfaceKind, SurfaceRuntimeCategory>;

export class PaneRuntimePolicy {
  private summary: PaneRuntimeSummary = emptySummary(DEFAULT_PANE_BUDGET);
  private readonly degradeOverview: boolean;
  private readonly degradeOverviewDuringResize: boolean;
  private readonly degradeDuringMovement: boolean;
  private readonly degradeDuringResize: boolean;

  constructor(
    private readonly budget: PaneRuntimeBudget = DEFAULT_PANE_BUDGET,
    options: PaneRuntimePolicyOptions = {},
  ) {
    this.degradeOverview = options.degradeOverview ?? true;
    this.degradeOverviewDuringResize = options.degradeOverviewDuringResize ?? true;
    this.degradeDuringMovement = options.degradeDuringMovement ?? true;
    this.degradeDuringResize = options.degradeDuringResize ?? true;
    this.summary = emptySummary(budget);
  }

  apply(items: PaneRenderItem[], movementPhase: "idle" | "moving"): PaneRuntimeSummary {
    const counters = {
      hidden: 0,
      liveBrowserPanes: 0,
      live: 0,
      liveHeavyDom: 0,
      liveTerminalRenderers: 0,
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
      liveTerminalRenderers: number;
      liveWebGpuCanvases: number;
    },
  ): void {
    if (kind === "browser") {
      counters.liveBrowserPanes += 1;
    } else if (isTerminalSurfaceKind(kind)) {
      counters.liveTerminalRenderers += 1;
    } else if (isLiveHeavyDomSurfaceKind(kind)) {
      counters.liveHeavyDom += 1;
    } else if (isLiveCanvasSurfaceKind(kind)) {
      counters.liveWebGpuCanvases += 1;
    }
  }

  private runtimeStateForItem(
    item: PaneRenderItem,
    movementPhase: "idle" | "moving",
    counters: {
      liveBrowserPanes: number;
      liveHeavyDom: number;
      liveTerminalRenderers: number;
      liveWebGpuCanvases: number;
      snapshot: number;
    },
  ): PaneRuntimeState {
    if (!item.visible) {
      return "hidden";
    }
    if (this.keepsLiveChatDuringResize(item)) {
      return this.runtimeStateForUnfocusedVisibleKind(item.surfaceKind, "idle", counters);
    }
    if (this.degradesOverviewItem(item)) {
      return this.snapshotOrThrottle(counters);
    }
    if (this.degradesMovingSurface(item, movementPhase)) {
      return this.snapshotOrThrottle(counters);
    }
    if (item.focused) {
      return "live";
    }
    if (item.resizing && this.degradeDuringResize) {
      return this.runtimeStateForUnfocusedResizeKind(item.surfaceKind, counters);
    }

    return this.runtimeStateForUnfocusedVisibleKind(item.surfaceKind, movementPhase, counters);
  }

  private keepsLiveChatDuringResize(item: PaneRenderItem): boolean {
    return item.resizing && item.surfaceKind === "chat-dom";
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
    counters: {
      liveBrowserPanes: number;
      liveHeavyDom: number;
      liveTerminalRenderers: number;
      liveWebGpuCanvases: number;
      snapshot: number;
    },
  ): PaneRuntimeState {
    const category = surfaceRuntimeCategories[kind];
    switch (category) {
      case "canvas":
      case "heavy-dom":
      case "heavy-dom-budgeted":
      case "terminal":
        return this.snapshotOrThrottle(counters);
      case "always-live":
      case "browser":
      case "git-graph":
      case "snapshot":
        return this.runtimeStateForCategory(category, "idle", counters);
      default:
        assertNever(category);
    }
  }

  private runtimeStateForUnfocusedVisibleKind(
    kind: SurfaceKind,
    movementPhase: "idle" | "moving",
    counters: {
      liveBrowserPanes: number;
      liveHeavyDom: number;
      liveTerminalRenderers: number;
      liveWebGpuCanvases: number;
      snapshot: number;
    },
  ): PaneRuntimeState {
    return this.runtimeStateForCategory(surfaceRuntimeCategories[kind], movementPhase, counters);
  }

  private runtimeStateForCategory(
    category: SurfaceRuntimeCategory,
    movementPhase: "idle" | "moving",
    counters: {
      liveBrowserPanes: number;
      liveHeavyDom: number;
      liveTerminalRenderers: number;
      liveWebGpuCanvases: number;
      snapshot: number;
    },
  ): PaneRuntimeState {
    switch (category) {
      case "always-live":
        return "live";
      case "browser":
        return this.runtimeStateForBrowser(movementPhase, counters);
      case "canvas":
        return this.runtimeStateForCanvas(movementPhase, counters);
      case "git-graph":
        return "live";
      case "heavy-dom":
        return this.runtimeStateForHeavyDom(movementPhase, counters);
      case "heavy-dom-budgeted":
        return this.runtimeStateForBudgetedHeavyDom(counters);
      case "snapshot":
        return this.snapshotOrThrottle(counters);
      case "terminal":
        return this.runtimeStateForTerminal(movementPhase, counters);
      default:
        assertNever(category);
    }
  }

  private runtimeStateForCanvas(
    movementPhase: "idle" | "moving",
    counters: {
      liveWebGpuCanvases: number;
      snapshot: number;
    },
  ): PaneRuntimeState {
    if (this.degradeDuringMovement && movementPhase === "moving") {
      return this.snapshotOrThrottle(counters);
    }
    if (counters.liveWebGpuCanvases >= this.budget.maxLiveWebGpuCanvases) {
      return this.snapshotOrThrottle(counters);
    }
    return "live";
  }

  private runtimeStateForTerminal(
    movementPhase: "idle" | "moving",
    counters: {
      liveTerminalRenderers: number;
      snapshot: number;
    },
  ): PaneRuntimeState {
    if (this.degradeDuringMovement && movementPhase === "moving") {
      return this.snapshotOrThrottle(counters);
    }
    if (counters.liveTerminalRenderers >= this.budget.maxLiveTerminalRenderers) {
      return this.snapshotOrThrottle(counters);
    }
    return "live";
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

function isLiveCanvasSurfaceKind(kind: SurfaceKind): kind is LiveCanvasSurfaceKind {
  return liveCanvasSurfaceKinds.has(kind);
}

function isLiveHeavyDomSurfaceKind(kind: SurfaceKind): kind is LiveHeavyDomSurfaceKind {
  return liveHeavyDomSurfaceKinds.has(kind);
}

function isTerminalSurfaceKind(kind: SurfaceKind): boolean {
  return kind === "terminal" || kind === "fake-terminal";
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
