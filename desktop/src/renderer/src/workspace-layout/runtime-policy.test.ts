import { describe, expect, test } from "vitest";

import { PaneRuntimePolicy } from "./runtime-policy";
import type { PaneRenderItem, PaneRuntimeBudget, SurfaceKind } from "./types";

const budget: PaneRuntimeBudget = {
  maxLiveBrowserPanes: 6,
  maxLiveHeavyDomPanes: 1,
  maxLiveTerminalRenderers: 8,
  maxLiveWebGpuCanvases: 1,
  maxSnapshotPanes: 8,
};

describe("workspace pane runtime policy", () => {
  test("keeps focused surfaces live while enforcing visible heavy budgets", () => {
    const items = [
      renderItem("light", "fake-dom", false),
      renderItem("focused-heavy", "fake-heavy-dom", true),
      renderItem("heavy-over-budget", "fake-heavy-dom", false),
      renderItem("canvas-live", "workflow-graph", false),
      renderItem("canvas-over-budget", "workflow-graph", false),
    ];
    const summary = new PaneRuntimePolicy(budget).apply(items, "idle");

    expect(items.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["light", "live"],
      ["focused-heavy", "live"],
      ["heavy-over-budget", "snapshot"],
      ["canvas-live", "live"],
      ["canvas-over-budget", "snapshot"],
    ]);
    expect(summary).toMatchObject({
      hidden: 0,
      live: 3,
      liveThrottled: 0,
      snapshot: 2,
      total: 5,
    });
  });

  test("degrades heavy and canvas surfaces during movement", () => {
    const items = [
      renderItem("focused-canvas", "workflow-graph", true),
      renderItem("moving-heavy", "fake-heavy-dom", false),
      renderItem("moving-long-chat", "fake-long-chat", false),
      renderItem("moving-chat", "chat-dom", false),
      renderItem("moving-canvas", "workflow-graph", false),
      renderItem("moving-light", "fake-dom", false),
      renderItem("moving-settings", "settings-dom", false),
    ];

    const summary = new PaneRuntimePolicy(budget).apply(items, "moving");

    expect(items.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["focused-canvas", "live"],
      ["moving-heavy", "snapshot"],
      ["moving-long-chat", "live"],
      ["moving-chat", "snapshot"],
      ["moving-canvas", "snapshot"],
      ["moving-light", "live"],
      ["moving-settings", "live"],
    ]);
    expect(summary.snapshot).toBe(3);
    expect(summary.budget.maxLiveWebGpuCanvases).toBe(1);
  });

  test("keeps rendered workspace surfaces live during movement when movement degradation is disabled", () => {
    const workspaceBudget = {
      ...budget,
      maxLiveHeavyDomPanes: 4,
      maxLiveTerminalRenderers: 4,
      maxLiveWebGpuCanvases: 4,
    };
    const items = [
      renderItem("moving-heavy", "fake-heavy-dom", false),
      renderItem("moving-chat", "chat-dom", false),
      renderItem("moving-canvas", "workflow-graph", false),
      renderItem("moving-terminal", "terminal", false),
    ];

    const summary = new PaneRuntimePolicy(workspaceBudget, {
      degradeDuringMovement: false,
    }).apply(items, "moving");

    expect(items.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["moving-heavy", "live"],
      ["moving-chat", "live"],
      ["moving-canvas", "live"],
      ["moving-terminal", "live"],
    ]);
    expect(summary.live).toBe(4);
    expect(summary.snapshot).toBe(0);
  });

  test("uses throttling instead of opaque fallback when snapshot budget is exhausted", () => {
    const items = [
      renderItem("heavy-1", "fake-heavy-dom", false),
      renderItem("heavy-2", "fake-heavy-dom", false),
    ];
    const noSnapshots = {
      ...budget,
      maxLiveHeavyDomPanes: 0,
      maxSnapshotPanes: 0,
    };

    const summary = new PaneRuntimePolicy(noSnapshots).apply(items, "idle");

    expect(items.map((item) => item.runtimeState)).toEqual(["live-throttled", "live-throttled"]);
    expect(summary.liveThrottled).toBe(2);
  });

  test("keeps all visible browser panes live without applying the browser budget", () => {
    const items = [
      renderItem("focused-browser", "browser", true),
      renderItem("browser-1", "browser", false),
      renderItem("browser-2", "browser", false),
    ];
    const oneBrowser = {
      ...budget,
      maxLiveBrowserPanes: 1,
    };

    const summary = new PaneRuntimePolicy(oneBrowser).apply(items, "idle");

    expect(items.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["focused-browser", "live"],
      ["browser-1", "live"],
      ["browser-2", "live"],
    ]);
    expect(summary.live).toBe(3);
    expect(summary.snapshot).toBe(0);
  });

  test("snapshots visible browser panes during movement", () => {
    const items = [
      renderItem("focused-browser", "browser", true),
      renderItem("browser-1", "browser", false),
      renderItem("browser-2", "browser", false),
      renderItem("browser-over-budget", "browser", false),
    ];
    const twoBrowsers = {
      ...budget,
      maxLiveBrowserPanes: 2,
    };

    const summary = new PaneRuntimePolicy(twoBrowsers).apply(items, "moving");

    expect(items.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["focused-browser", "snapshot"],
      ["browser-1", "snapshot"],
      ["browser-2", "snapshot"],
      ["browser-over-budget", "snapshot"],
    ]);
    expect(summary.live).toBe(0);
    expect(summary.snapshot).toBe(4);
  });

  test("budgets terminal renderers and keeps graph renderers live during movement", () => {
    const items = [
      renderItem("terminal-focused", "terminal", true),
      renderItem("terminal-live", "terminal", false),
      renderItem("terminal-over-budget", "terminal", false),
      renderItem("graph-moving", "git-graph", false),
    ];
    const twoTerminals = {
      ...budget,
      maxLiveTerminalRenderers: 2,
    };

    const idleSummary = new PaneRuntimePolicy(twoTerminals).apply(items.slice(0, 3), "idle");

    expect(items.slice(0, 3).map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["terminal-focused", "live"],
      ["terminal-live", "live"],
      ["terminal-over-budget", "snapshot"],
    ]);
    expect(idleSummary.live).toBe(2);
    expect(idleSummary.snapshot).toBe(1);

    const movingSummary = new PaneRuntimePolicy(twoTerminals).apply(items, "moving");

    expect(items.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["terminal-focused", "live"],
      ["terminal-live", "snapshot"],
      ["terminal-over-budget", "snapshot"],
      ["graph-moving", "live"],
    ]);
    expect(movingSummary.snapshot).toBe(2);
  });

  test("uses snapshots for every visible overview pane even when focused", () => {
    const items = [
      { ...renderItem("focused-browser", "browser", true), presentationMode: "overview" },
      { ...renderItem("overview-terminal", "terminal", false), presentationMode: "overview" },
      { ...renderItem("overview-settings", "settings-dom", false), presentationMode: "overview" },
      { ...renderItem("overview-light", "fake-dom", false), presentationMode: "overview" },
    ] satisfies PaneRenderItem[];

    const summary = new PaneRuntimePolicy(budget).apply(items, "idle");

    expect(items.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["focused-browser", "snapshot"],
      ["overview-terminal", "snapshot"],
      ["overview-settings", "snapshot"],
      ["overview-light", "snapshot"],
    ]);
    expect(summary.snapshot).toBe(4);
  });

  test("keeps workspace overview panes live when overview degradation is disabled", () => {
    const workspaceBudget = {
      ...budget,
      maxLiveHeavyDomPanes: 4,
      maxLiveTerminalRenderers: 4,
      maxLiveWebGpuCanvases: 4,
    };
    const items = [
      { ...renderItem("focused-browser", "browser", true), presentationMode: "overview" },
      { ...renderItem("overview-terminal", "terminal", false), presentationMode: "overview" },
      { ...renderItem("overview-settings", "settings-dom", false), presentationMode: "overview" },
      { ...renderItem("overview-light", "fake-dom", false), presentationMode: "overview" },
    ] satisfies PaneRenderItem[];

    const summary = new PaneRuntimePolicy(workspaceBudget, {
      degradeDuringMovement: false,
      degradeOverview: false,
    }).apply(items, "idle");

    expect(items.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["focused-browser", "live"],
      ["overview-terminal", "live"],
      ["overview-settings", "live"],
      ["overview-light", "live"],
    ]);
    expect(summary.live).toBe(4);
    expect(summary.snapshot).toBe(0);
  });

  test("uses snapshots for workspace overview panes only during active resize", () => {
    const workspaceBudget = {
      ...budget,
      maxLiveHeavyDomPanes: 4,
      maxLiveTerminalRenderers: 4,
      maxLiveWebGpuCanvases: 4,
    };
    const idleItems = [
      { ...renderItem("focused-browser", "browser", true), presentationMode: "overview" },
      { ...renderItem("overview-chat", "chat-dom", false), presentationMode: "overview" },
      { ...renderItem("overview-terminal", "terminal", false), presentationMode: "overview" },
      { ...renderItem("overview-settings", "settings-dom", false), presentationMode: "overview" },
    ] satisfies PaneRenderItem[];
    const resizingItems = idleItems.map((item) => ({ ...item, resizing: true }));
    const policy = new PaneRuntimePolicy(workspaceBudget, {
      degradeDuringMovement: false,
      degradeOverview: false,
    });

    policy.apply(idleItems, "idle");
    expect(idleItems.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["focused-browser", "live"],
      ["overview-chat", "live"],
      ["overview-terminal", "live"],
      ["overview-settings", "live"],
    ]);

    policy.apply(resizingItems, "moving");
    expect(resizingItems.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["focused-browser", "snapshot"],
      ["overview-chat", "live"],
      ["overview-terminal", "snapshot"],
      ["overview-settings", "snapshot"],
    ]);
  });

  test("degrades expensive unfocused panes but keeps real chat live during active resize", () => {
    const workspaceBudget = {
      ...budget,
      maxLiveHeavyDomPanes: 4,
      maxLiveTerminalRenderers: 4,
      maxLiveWebGpuCanvases: 4,
    };
    const items = [
      { ...renderItem("focused-canvas", "workflow-graph", true), resizing: true },
      { ...renderItem("resizing-chat", "chat-dom", false), resizing: true },
      { ...renderItem("resizing-heavy", "fake-heavy-dom", false), resizing: true },
      { ...renderItem("resizing-canvas", "workflow-graph", false), resizing: true },
      { ...renderItem("resizing-terminal", "terminal", false), resizing: true },
      { ...renderItem("resizing-browser", "browser", false), resizing: true },
      { ...renderItem("resizing-settings", "settings-dom", false), resizing: true },
      { ...renderItem("resizing-graph", "git-graph", false), resizing: true },
    ] satisfies PaneRenderItem[];

    const summary = new PaneRuntimePolicy(workspaceBudget, {
      degradeDuringMovement: false,
    }).apply(items, "moving");

    expect(items.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["focused-canvas", "live"],
      ["resizing-chat", "live"],
      ["resizing-heavy", "snapshot"],
      ["resizing-canvas", "snapshot"],
      ["resizing-terminal", "snapshot"],
      ["resizing-browser", "live"],
      ["resizing-settings", "live"],
      ["resizing-graph", "live"],
    ]);
    expect(summary.snapshot).toBe(3);
  });
});

function renderItem(paneId: string, surfaceKind: SurfaceKind, focused: boolean): PaneRenderItem {
  return {
    focused,
    height: 120,
    maximized: false,
    moving: false,
    opacity: 1,
    paneId,
    presentationMode: "normal",
    resizing: false,
    runtimeState: "live",
    scale: 1,
    surfaceId: `${paneId}_surface`,
    surfaceKind,
    visible: true,
    width: 160,
    x: 0,
    y: 0,
    z: focused ? 2 : 1,
  };
}
