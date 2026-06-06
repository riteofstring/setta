import { describe, expect, test } from "vitest";

import {
  generateBenchmarkScene,
  phaseOneFakePaneCount,
  phaseOneVisiblePaneCount,
} from "./benchmark-scene";
import { NiriLikeLayoutEngine } from "./layout-engine";
import { NiriLayoutStore } from "./layout-store";
import type { PaneRenderItem, PaneRuntimeState, Rect, SurfaceId, SurfaceKind } from "./types";
import { createRealWorkspaceScene } from "./workspace-scene";

const viewport: Rect = {
  height: 900,
  width: 1440,
  x: 0,
  y: 0,
};

describe("niri browser-pane layout engine", () => {
  test("keeps the Phase 4 public surface contract explicit", () => {
    const runtimeState: PaneRuntimeState = "live";
    const surfaceId: SurfaceId = "niri_surface_contract";
    const surfaceKind: SurfaceKind = "browser";

    expect({ runtimeState, surfaceId, surfaceKind }).toEqual({
      runtimeState: "live",
      surfaceId: "niri_surface_contract",
      surfaceKind: "browser",
    });
  });

  test("generates the Phase 6 terminal/git graph benchmark scene without losing earlier surfaces", () => {
    const scene = generateBenchmarkScene();
    const browserPanes = scene.panes.filter((pane) => pane.surfaceKind === "browser");
    const gitGraphPanes = scene.panes.filter((pane) => pane.surfaceKind === "git-graph");
    const pixiCanvasPanes = scene.panes.filter((pane) => pane.surfaceKind === "pixi-canvas");
    const terminalPanes = scene.panes.filter((pane) => pane.surfaceKind === "terminal");

    expect(scene.id).toBe("phase-6-terminal-git-graph-benchmark");
    expect(scene.totalPanes).toBe(phaseOneFakePaneCount);
    expect(scene.targetVisiblePanes).toBe(phaseOneVisiblePaneCount);
    expect(scene.visibleColumnCount).toBe(8);
    expect(scene.panesPerColumn).toBe(5);
    expect(scene.columns).toHaveLength(100);
    expect(scene.paneById.get("niri_pane_0")?.surfaceKind).toBe("fake-dom");
    expect(scene.paneById.get("niri_pane_1")?.surfaceKind).toBe("fake-long-chat");
    expect(scene.paneById.get("niri_pane_2")?.surfaceKind).toBe("settings-dom");
    expect(scene.paneById.get("niri_pane_3")?.surfaceKind).toBe("chat-dom");
    expect(scene.paneById.get("niri_pane_4")?.surfaceKind).toBe("pixi-canvas");
    expect(scene.paneById.get("niri_pane_5")?.surfaceKind).toBe("terminal");
    expect(scene.paneById.get("niri_pane_6")?.surfaceKind).toBe("git-graph");
    expect(scene.panes.some((pane) => pane.surfaceKind === "fake-heavy-dom")).toBe(true);
    expect(scene.panes.some((pane) => pane.surfaceKind === "fake-canvas")).toBe(true);
    expect(gitGraphPanes.length).toBeGreaterThanOrEqual(6);
    expect(pixiCanvasPanes.length).toBeGreaterThanOrEqual(4);
    expect(terminalPanes.length).toBeGreaterThanOrEqual(6);
    expect(browserPanes.length).toBeGreaterThanOrEqual(20);
    expect(
      scene.panes
        .slice(0, phaseOneVisiblePaneCount)
        .filter((pane) => pane.surfaceKind === "browser"),
    ).toHaveLength(4);
  });

  test("renders a deterministic 40-pane frame from 500 fake panes", () => {
    const scene = generateBenchmarkScene();
    const engine = new NiriLikeLayoutEngine(scene);
    const items = renderFrame(engine, viewport, 0, "niri_pane_0");

    expect(items).toHaveLength(phaseOneVisiblePaneCount);
    expect(items[0]).toMatchObject({
      focused: true,
      paneId: "niri_pane_0",
      runtimeState: "live",
      surfaceKind: "fake-dom",
      visible: true,
      x: 10,
    });
    expect(items.at(-1)?.paneId).toBe("niri_pane_39");
  });

  test("uses scroll offset for transform-only horizontal movement", () => {
    const scene = generateBenchmarkScene();
    const engine = new NiriLikeLayoutEngine(scene);
    const items = renderFrame(engine, viewport, 4.25, "niri_pane_25");

    expect(items).toHaveLength(phaseOneVisiblePaneCount);
    expect(items[0]?.paneId).toBe("niri_pane_20");
    expect(items[0]?.x).toBeLessThan(0);
    expect(items.some((item) => item.focused && item.paneId === "niri_pane_25")).toBe(true);
    expect(new Set(items.map((item) => item.surfaceId)).size).toBe(phaseOneVisiblePaneCount);
  });
});

describe("real niri workspace column sizing", () => {
  test("recomputes proportional column widths from the viewport", () => {
    const engine = createRealEngine();
    const wideItems = renderFrame(engine, { ...viewport, width: 1200 }, 0, "workspace_pane_0");
    const narrowItems = renderFrame(engine, { ...viewport, width: 900 }, 0, "workspace_pane_0");

    expect(wideItems[0]?.width).toBe(590);
    expect(narrowItems[0]?.width).toBe(440);
  });

  test("preserves horizontal overflow instead of shrinking all columns into the viewport", () => {
    const engine = createRealEngine();
    const items = renderFrame(engine, { ...viewport, width: 1200 }, 0, "workspace_pane_0");

    expect(items).toHaveLength(3);
    expect(items[0]?.x).toBe(10);
    expect(items[1]?.x).toBe(608);
    expect(items[2]?.x).toBeGreaterThan(1200);
    expect(engine.totalColumnOverflowWidth(1200)).toBeGreaterThan(1200);
  });

  test("locks a proportional column to its current resolved width", () => {
    const engine = createRealEngine();

    engine.lockColumnWidth("workspace_column_0", 1200);

    expect(engine.toScene().columns[0]?.widthSpec).toEqual({ unit: "px", value: 590 });
    expect(engine.resolvedColumnWidth("workspace_column_0", 900)).toBe(590);
  });

  test("unlocks a fixed column back to its previous proportion", () => {
    const engine = createRealEngine();

    engine.lockColumnWidth("workspace_column_0", 1200);
    engine.unlockColumnWidth("workspace_column_0", 900);

    expect(engine.toScene().columns[0]?.widthSpec).toEqual({ unit: "proportion", value: 0.5 });
    expect(engine.resolvedColumnWidth("workspace_column_0", 900)).toBe(440);
  });

  test("keeps the focused column visible after a viewport resize", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:niri-workspace:resize-focus",
      workspaceName: "Repo",
    });
    const engine = new NiriLikeLayoutEngine(scene);
    const store = new NiriLayoutStore(engine, scene, focusedPaneId);

    store.moveFocus("right");
    store.moveFocus("right");
    store.ensureFocusedColumnVisible({ ...viewport, width: 900 });

    const snapshot = store.getSnapshot();
    const items = renderFrame(
      engine,
      { ...viewport, width: 900 },
      snapshot.targetScrollColumn,
      snapshot.focusedPaneId,
    );
    const focusedItem = items.find((item) => item.focused);

    expect(snapshot.focusedPaneId).toBe("workspace_pane_2");
    expect(focusedItem?.x).toBeGreaterThanOrEqual(10);
    expect((focusedItem?.x ?? 0) + (focusedItem?.width ?? 0)).toBeLessThanOrEqual(890);
  });
});

function renderFrame(
  engine: NiriLikeLayoutEngine,
  frameViewport: Rect,
  scrollColumn: number,
  focusedPaneId: string,
): PaneRenderItem[] {
  const items: PaneRenderItem[] = [];
  engine.renderFrame(
    {
      focusedPaneId,
      movementPhase: "moving",
      scrollColumn,
      viewport: frameViewport,
    },
    (item) => items.push(item),
  );
  return items;
}

function createRealEngine(): NiriLikeLayoutEngine {
  const { scene } = createRealWorkspaceScene({
    storageKey: "setta:niri-workspace:engine-test",
    workspaceName: "Repo",
  });
  return new NiriLikeLayoutEngine(scene);
}
