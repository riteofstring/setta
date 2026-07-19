import { describe, expect, test } from "vitest";

import { generateBenchmarkScene, phaseOneVisiblePaneCount } from "./benchmark-scene";
import { DEFAULT_PANE_BUDGET, PaneRuntimePolicy } from "./runtime-policy";
import {
  benchmarkHostPoolSizeFromSearch,
  benchmarkSceneOptionsFromSearch,
  hostPoolSizeForRuntime,
  presentationOptionsForRuntime,
  runtimePolicyBudgetForRuntime,
  runtimePolicyOptionsForRuntime,
} from "./runtime-mode-options";
import type { PaneRenderItem, SurfaceKind } from "./types";
import { createRealWorkspaceScene } from "./workspace-scene";

describe("workspace runtime mode options", () => {
  test("keeps benchmark movement content sync deferred for stress measurements", () => {
    expect(presentationOptionsForRuntime("benchmark")).toStrictEqual({
      syncAllRenderedContentDuringMovement: false,
    });
  });

  test("syncs all rendered workspace pane content during movement", () => {
    expect(presentationOptionsForRuntime("workspace")).toStrictEqual({
      syncAllRenderedContentDuringMovement: true,
    });
  });

  test("keeps benchmark overview degradation for the synthetic stress scene", () => {
    expect(runtimePolicyOptionsForRuntime("benchmark")).toStrictEqual({
      degradeDuringMovement: true,
      degradeDuringResize: true,
      degradeOverview: true,
      degradeOverviewDuringResize: true,
    });
  });

  test("uses the benchmark defaults while sizing workspace budgets to the scene", () => {
    const benchmarkScene = generateBenchmarkScene();
    const { scene: workspaceScene } = createRealWorkspaceScene({
      storedLayout: null,
      workspaceId: "setta:workspace-runtime-options-test",
      workspaceName: "Repo",
    });

    expect(runtimePolicyBudgetForRuntime("benchmark", benchmarkScene)).toStrictEqual(
      DEFAULT_PANE_BUDGET,
    );
    expect(runtimePolicyBudgetForRuntime("workspace", workspaceScene)).toStrictEqual({
      maxLiveHeavyDomPanes: workspaceScene.totalPanes,
      maxSnapshotPanes: workspaceScene.totalPanes,
    });
  });

  test("keeps real workspace panes live during movement and overview", () => {
    expect(runtimePolicyOptionsForRuntime("workspace")).toStrictEqual({
      degradeDuringMovement: false,
      degradeDuringResize: false,
      degradeOverview: false,
      degradeOverviewDuringResize: false,
    });
  });

  test("sizes the real workspace host pool to the scene rather than a fixed viewport cap", () => {
    const benchmarkScene = generateBenchmarkScene();
    const { scene: workspaceScene } = createRealWorkspaceScene({
      storedLayout: null,
      workspaceId: "setta:workspace-host-pool-test",
      workspaceName: "Repo",
    });

    expect(hostPoolSizeForRuntime("benchmark", benchmarkScene)).toBe(phaseOneVisiblePaneCount);
    expect(hostPoolSizeForRuntime("workspace", workspaceScene)).toBe(workspaceScene.totalPanes);
  });

  test("keeps every visible workspace surface live in a moving resize frame", () => {
    const scene = generateBenchmarkScene({ paneCount: 10, targetVisiblePanes: 10 });
    const items = [
      renderItem("conversation", "easy-button"),
      renderItem("browser", "browser"),
      renderItem("heavy", "fake-heavy-dom"),
      renderItem("light", "fake-dom"),
      renderItem("empty", "empty-frame"),
    ].map((item) => ({ ...item, resizing: true }));
    const policy = new PaneRuntimePolicy(
      runtimePolicyBudgetForRuntime("workspace", { ...scene, totalPanes: items.length }),
      runtimePolicyOptionsForRuntime("workspace"),
    );

    const summary = policy.apply(items, "moving");

    expect(items.map((item) => [item.paneId, item.runtimeState])).toEqual([
      ["conversation", "live"],
      ["browser", "live"],
      ["heavy", "live"],
      ["light", "live"],
      ["empty", "live"],
    ]);
    expect(summary.live).toBe(items.length);
    expect(summary.snapshot).toBe(0);
    expect(summary.liveThrottled).toBe(0);
  });

  test("parses explicit benchmark scene sizing from the URL search", () => {
    expect(
      benchmarkSceneOptionsFromSearch(
        "?workspaceBenchmarkPaneCount=17&workspaceBenchmarkVisiblePanes=17",
      ),
    ).toStrictEqual({
      paneCount: 17,
      targetVisiblePanes: 17,
    });
    expect(
      benchmarkHostPoolSizeFromSearch(
        "?workspaceBenchmarkPaneCount=17&workspaceBenchmarkVisiblePanes=17",
      ),
    ).toBe(17);
  });

  test("rejects invalid benchmark scene sizing", () => {
    expect(() => benchmarkSceneOptionsFromSearch("?workspaceBenchmarkPaneCount=0")).toThrow(
      "workspaceBenchmarkPaneCount must be a positive integer: 0",
    );
    expect(() =>
      benchmarkSceneOptionsFromSearch("?workspaceBenchmarkVisiblePanes=not-a-number"),
    ).toThrow("workspaceBenchmarkVisiblePanes must be a positive integer: not-a-number");
  });
});

function renderItem(paneId: string, surfaceKind: SurfaceKind): PaneRenderItem {
  return {
    focused: false,
    height: 120,
    maximized: false,
    moving: true,
    opacity: 1,
    paneId,
    presentationMode: "normal",
    resizing: false,
    runtimeState: "hidden",
    scale: 1,
    surfaceId: `${paneId}_surface`,
    surfaceKind,
    visible: true,
    width: 160,
    x: 0,
    y: 0,
    z: 1,
  };
}
