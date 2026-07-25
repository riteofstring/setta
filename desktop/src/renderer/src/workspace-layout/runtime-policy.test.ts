import { describe, expect, test } from "vitest";

import { PaneRuntimePolicy } from "./runtime-policy";
import type { PaneRenderItem, PaneRuntimeBudget, SurfaceKind } from "./types";

const budget: PaneRuntimeBudget = {
  maxLiveHeavyDomPanes: 1,
  maxSnapshotPanes: 8,
};

describe("workspace pane runtime policy", () => {
  test("keeps focused surfaces live while enforcing the heavy DOM budget", () => {
    const items = [
      renderItem("light", "fake-dom", false),
      renderItem("focused-heavy", "fake-heavy-dom", true),
      renderItem("heavy-over-budget", "fake-heavy-dom", false),
      renderItem("browser", "browser", false),
    ];

    const summary = new PaneRuntimePolicy(budget).apply(items, "idle");

    expect(runtimeStates(items)).toEqual([
      ["light", "live"],
      ["focused-heavy", "live"],
      ["heavy-over-budget", "snapshot"],
      ["browser", "live"],
    ]);
    expect(summary).toMatchObject({
      hidden: 0,
      live: 3,
      liveThrottled: 0,
      snapshot: 1,
      total: 4,
    });
  });

  test("budgets Easy Button panes as heavy DOM surfaces", () => {
    const items = [
      renderItem("focused-easy", "easy-button", true),
      renderItem("background-easy", "easy-button", false),
    ];

    const summary = new PaneRuntimePolicy({ ...budget, maxLiveHeavyDomPanes: 0 }).apply(
      items,
      "idle",
    );

    expect(runtimeStates(items)).toEqual([
      ["focused-easy", "live"],
      ["background-easy", "snapshot"],
    ]);
    expect(summary.live).toBe(1);
    expect(summary.snapshot).toBe(1);
  });

  test("freezes expensive DOM surfaces during movement", () => {
    const items = [
      renderItem("focused-easy", "easy-button", true),
      renderItem("moving-heavy", "fake-heavy-dom", false),
      renderItem("moving-light", "fake-dom", false),
      renderItem("moving-settings", "settings-dom", false),
    ];

    const summary = new PaneRuntimePolicy(budget).apply(items, "moving");

    expect(runtimeStates(items)).toEqual([
      ["focused-easy", "live-throttled"],
      ["moving-heavy", "live-throttled"],
      ["moving-light", "live"],
      ["moving-settings", "live-throttled"],
    ]);
    expect(summary.liveThrottled).toBe(3);
    expect(summary.snapshot).toBe(0);
  });

  test("snapshots browser panes during movement", () => {
    const items = [
      renderItem("focused-browser", "browser", true),
      renderItem("background-browser", "browser", false),
    ];

    const summary = new PaneRuntimePolicy(budget).apply(items, "moving");

    expect(runtimeStates(items)).toEqual([
      ["focused-browser", "snapshot"],
      ["background-browser", "snapshot"],
    ]);
    expect(summary.snapshot).toBe(2);
  });

  test("keeps rendered workspace surfaces live when movement degradation is disabled", () => {
    const items = [
      renderItem("moving-heavy", "fake-heavy-dom", false),
      renderItem("moving-easy", "easy-button", false),
      renderItem("moving-browser", "browser", false),
      renderItem("moving-settings", "settings-dom", false),
    ];

    const summary = new PaneRuntimePolicy(
      { ...budget, maxLiveHeavyDomPanes: 4 },
      { degradeDuringMovement: false },
    ).apply(items, "moving");

    expect(runtimeStates(items)).toEqual([
      ["moving-heavy", "live"],
      ["moving-easy", "live"],
      ["moving-browser", "live"],
      ["moving-settings", "live"],
    ]);
    expect(summary.live).toBe(4);
  });

  test("uses throttling when the snapshot budget is exhausted", () => {
    const items = [
      renderItem("heavy-1", "fake-heavy-dom", false),
      renderItem("heavy-2", "fake-heavy-dom", false),
    ];

    const summary = new PaneRuntimePolicy({
      maxLiveHeavyDomPanes: 0,
      maxSnapshotPanes: 0,
    }).apply(items, "idle");

    expect(items.map((item) => item.runtimeState)).toEqual(["live-throttled", "live-throttled"]);
    expect(summary.liveThrottled).toBe(2);
  });

  test("freezes every visible overview pane even when focused", () => {
    const items = [
      overviewItem("focused-browser", "browser", true),
      overviewItem("overview-easy", "easy-button", false),
      overviewItem("overview-settings", "settings-dom", false),
      overviewItem("overview-light", "fake-dom", false),
    ];

    const summary = new PaneRuntimePolicy(budget).apply(items, "idle");

    expect(runtimeStates(items)).toEqual([
      ["focused-browser", "snapshot"],
      ["overview-easy", "live-throttled"],
      ["overview-settings", "live-throttled"],
      ["overview-light", "live-throttled"],
    ]);
    expect(summary.liveThrottled).toBe(3);
    expect(summary.snapshot).toBe(1);
  });

  test("keeps workspace overview panes live when overview degradation is disabled", () => {
    const items = [
      overviewItem("focused-browser", "browser", true),
      overviewItem("overview-easy", "easy-button", false),
      overviewItem("overview-settings", "settings-dom", false),
      overviewItem("overview-light", "fake-dom", false),
    ];

    const summary = new PaneRuntimePolicy(
      { ...budget, maxLiveHeavyDomPanes: 4 },
      { degradeDuringMovement: false, degradeOverview: false },
    ).apply(items, "idle");

    expect(items.every((item) => item.runtimeState === "live")).toBe(true);
    expect(summary.live).toBe(4);
  });

  test("snapshots only unfocused heavy DOM panes during active resize", () => {
    const items = [
      resizingItem("focused-heavy", "fake-heavy-dom", true),
      resizingItem("background-heavy", "fake-heavy-dom", false),
      resizingItem("browser", "browser", false),
      resizingItem("settings", "settings-dom", false),
    ];

    const summary = new PaneRuntimePolicy(
      { ...budget, maxLiveHeavyDomPanes: 4 },
      { degradeDuringMovement: false },
    ).apply(items, "moving");

    expect(runtimeStates(items)).toEqual([
      ["focused-heavy", "live"],
      ["background-heavy", "snapshot"],
      ["browser", "live"],
      ["settings", "live"],
    ]);
    expect(summary.snapshot).toBe(1);
  });
});

function overviewItem(paneId: string, surfaceKind: SurfaceKind, focused: boolean): PaneRenderItem {
  return { ...renderItem(paneId, surfaceKind, focused), presentationMode: "overview" };
}

function resizingItem(paneId: string, surfaceKind: SurfaceKind, focused: boolean): PaneRenderItem {
  return { ...renderItem(paneId, surfaceKind, focused), resizing: true };
}

function runtimeStates(items: readonly PaneRenderItem[]) {
  return items.map((item) => [item.paneId, item.runtimeState]);
}

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
