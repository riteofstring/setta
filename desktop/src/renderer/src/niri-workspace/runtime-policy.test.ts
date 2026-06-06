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

describe("niri pane runtime policy", () => {
  test("keeps focused surfaces live while enforcing visible heavy budgets", () => {
    const items = [
      renderItem("light", "fake-dom", false),
      renderItem("focused-heavy", "fake-heavy-dom", true),
      renderItem("heavy-over-budget", "fake-heavy-dom", false),
      renderItem("canvas-live", "fake-canvas", false),
      renderItem("canvas-over-budget", "pixi-canvas", false),
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
      renderItem("focused-canvas", "fake-canvas", true),
      renderItem("moving-heavy", "fake-heavy-dom", false),
      renderItem("moving-long-chat", "fake-long-chat", false),
      renderItem("moving-chat", "chat-dom", false),
      renderItem("moving-canvas", "pixi-canvas", false),
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

  test("keeps focused browser panes live while enforcing browser live budget", () => {
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
      ["browser-1", "snapshot"],
      ["browser-2", "snapshot"],
    ]);
    expect(summary.live).toBe(1);
    expect(summary.snapshot).toBe(2);
  });

  test("keeps browser panes live during movement until the browser budget is full", () => {
    const items = [
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
      ["browser-1", "live"],
      ["browser-2", "live"],
      ["browser-over-budget", "snapshot"],
    ]);
    expect(summary.live).toBe(2);
    expect(summary.snapshot).toBe(1);
  });
});

function renderItem(paneId: string, surfaceKind: SurfaceKind, focused: boolean): PaneRenderItem {
  return {
    focused,
    height: 120,
    moving: false,
    opacity: 1,
    paneId,
    resizing: false,
    runtimeState: "live",
    surfaceId: `${paneId}_surface`,
    surfaceKind,
    visible: true,
    width: 160,
    x: 0,
    y: 0,
    z: focused ? 2 : 1,
  };
}
