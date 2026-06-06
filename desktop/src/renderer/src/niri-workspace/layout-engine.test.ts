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
  test("keeps default fixed column widths stable across viewport resize", () => {
    const engine = createRealEngine();
    const wideItems = renderFrame(engine, { ...viewport, width: 1200 }, 0, "workspace_pane_0");
    const narrowItems = renderFrame(engine, { ...viewport, width: 900 }, 0, "workspace_pane_0");

    expect(wideItems[0]?.width).toBe(520);
    expect(narrowItems[0]?.width).toBe(520);
  });

  test("still supports proportional column widths when a policy requests them", () => {
    const engine = createRealEngine();

    engine.resizeColumn("workspace_column_0", { unit: "proportion", value: 0.5 });

    expect(engine.resolvedColumnWidth("workspace_column_0", 1200)).toBe(590);
    expect(engine.resolvedColumnWidth("workspace_column_0", 900)).toBe(440);
  });

  test("preserves horizontal overflow while rendering a next-column peek and overscan cache", () => {
    const engine = createRealEngine();
    const items = renderFrame(engine, { ...viewport, width: 1200 }, 0, "workspace_pane_0");

    expect(items).toHaveLength(5);
    expect(items[0]?.x).toBe(10);
    expect(items[1]?.x).toBe(538);
    expect(items[2]?.x).toBe(1066);
    expect(items[2]?.x).toBeLessThan(1200);
    expect(items[3]?.x).toBeGreaterThan(1200);
    expect(items[4]?.x).toBeGreaterThan(1200);
    expect(engine.totalColumnOverflowWidth(1200)).toBeGreaterThan(1200);
  });

  test("renders cached columns on both sides while horizontally scrolled", () => {
    const engine = createRealEngine();
    const items = renderFrame(engine, { ...viewport, width: 1200 }, 1, "workspace_pane_1");

    expect(items.map((item) => item.paneId)).toEqual([
      "workspace_pane_0",
      "workspace_pane_1",
      "workspace_pane_2",
      "workspace_pane_3",
      "workspace_pane_4",
      "workspace_pane_5",
    ]);
    expect(items[0]?.x).toBeLessThan(0);
    expect(items.at(-1)?.x).toBeGreaterThan(1200);
  });

  test("clamps end-of-strip scrolling so existing panes fill the viewport", () => {
    const engine = createRealEngine();
    const items = renderFrame(engine, { ...viewport, width: 1200 }, 5, "workspace_pane_5");
    const visibleItems = items.filter((item) => item.x < 1200 && item.x + item.width > 0);
    const rightmostPaneEdge = Math.max(...visibleItems.map((item) => item.x + item.width));

    expect(engine.scrollColumnForFocusedColumnVisibility(5, 5, 1200)).toBeCloseTo(3.75);
    expect(visibleItems.map((item) => item.paneId)).toEqual([
      "workspace_pane_3",
      "workspace_pane_4",
      "workspace_pane_5",
    ]);
    expect(items.find((item) => item.paneId === "workspace_pane_5")?.x).toBeGreaterThan(10);
    expect(rightmostPaneEdge).toBeGreaterThanOrEqual(1190);
  });

  test("navigation snaps focused pane left edge to the viewport lane", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:niri-workspace:left-snap",
      workspaceName: "Repo",
    });
    const engine = new NiriLikeLayoutEngine(scene);
    const store = new NiriLayoutStore(engine, scene, focusedPaneId);

    store.moveFocus("right");
    const snapshot = store.getSnapshot();
    const items = renderFrame(
      engine,
      { ...viewport, width: 1200 },
      snapshot.targetScrollColumn,
      snapshot.focusedPaneId,
      "normal",
      snapshot.targetScrollRow,
    );

    expect(snapshot.focusedPaneId).toBe("workspace_pane_1");
    expect(items.find((item) => item.focused)?.x).toBe(10);
  });

  test("navigation snaps focused split-down pane top edge to the viewport lane", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:niri-workspace:top-snap",
      workspaceName: "Repo",
    });
    const engine = new NiriLikeLayoutEngine(scene);
    const store = new NiriLayoutStore(engine, scene, focusedPaneId);
    const stackedPaneId = store.splitFocusedPane("down");
    const snapshot = store.getSnapshot();
    const items = renderFrame(
      engine,
      { ...viewport, width: 1200 },
      snapshot.targetScrollColumn,
      snapshot.focusedPaneId,
      "normal",
      snapshot.targetScrollRow,
    );
    const focusedItem = items.find((item) => item.paneId === stackedPaneId);
    const firstRowItem = items.find((item) => item.paneId === "workspace_pane_0");

    expect(focusedItem?.focused).toBe(true);
    expect(focusedItem?.y).toBe(38);
    expect(firstRowItem?.y).toBeLessThan(0);
  });

  test("keeps every pane attached to a visible column after moving out of a vertical stack", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:niri-workspace:move-stack-pane",
      workspaceName: "Repo",
    });
    const engine = new NiriLikeLayoutEngine(scene);
    const store = new NiriLayoutStore(engine, scene, focusedPaneId);
    const stackedPaneId = store.splitFocusedPane("down");

    store.moveFocusedPane("right");

    const updatedScene = engine.toScene();
    const paneIdsInColumns = updatedScene.columns.flatMap((column) => column.paneIds);

    expect(updatedScene.columns.every((column) => column.paneIds.length > 0)).toBe(true);
    expect(new Set(paneIdsInColumns).size).toBe(updatedScene.panes.length);
    expect(paneIdsInColumns).toContain("workspace_pane_0");
    expect(paneIdsInColumns).toContain(stackedPaneId);
  });

  test("overview renders the whole real workspace as scaled columns", () => {
    const engine = createRealEngine();
    const items = renderFrame(
      engine,
      { ...viewport, width: 1200 },
      0,
      "workspace_pane_0",
      "overview",
    );

    expect(items).toHaveLength(6);
    expect(items.every((item) => item.presentationMode === "overview")).toBe(true);
    expect(items.every((item) => item.scale < 1)).toBe(true);
    expect(items[0]?.x).toBeGreaterThanOrEqual(10);
    expect(
      (items.at(-1)?.x ?? 0) + (items.at(-1)?.width ?? 0) * (items.at(-1)?.scale ?? 1),
    ).toBeLessThanOrEqual(1190);
  });

  test("overview keeps split-down panes vertically stacked inside their column", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:niri-workspace:overview-stack",
      workspaceName: "Repo",
    });
    const engine = new NiriLikeLayoutEngine(scene);
    const store = new NiriLayoutStore(engine, scene, focusedPaneId);
    const stackedPaneId = store.splitFocusedPane("down");
    const items = renderFrame(engine, { ...viewport, width: 1200 }, 0, stackedPaneId, "overview");
    const chatItem = items.find((item) => item.paneId === "workspace_pane_0");
    const stackedItem = items.find((item) => item.paneId === stackedPaneId);

    expect(chatItem?.x).toBe(stackedItem?.x);
    expect(stackedItem?.y).toBeGreaterThan(chatItem?.y ?? 0);
    expect(stackedItem?.scale).toBe(chatItem?.scale);
  });

  test("split to plane below creates a separate horizontal plane and snaps into view", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:niri-workspace:split-plane-below",
      workspaceName: "Repo",
    });
    const engine = new NiriLikeLayoutEngine(scene);
    const store = new NiriLayoutStore(engine, scene, focusedPaneId);

    const planePaneId = store.splitFocusedPaneToPlane("down");
    const snapshot = store.getSnapshot();
    const updatedScene = engine.toScene();
    const planeColumn = updatedScene.columns.find((column) => column.paneIds.includes(planePaneId));
    const items = renderFrame(
      engine,
      { ...viewport, width: 1200 },
      snapshot.targetScrollColumn,
      snapshot.focusedPaneId,
      "normal",
      snapshot.targetScrollRow,
    );

    expect(planeColumn?.planeIndex).toBe(1);
    expect(snapshot.targetScrollColumn).toBe(0);
    expect(snapshot.targetScrollRow).toBeGreaterThan(0);
    expect(items.find((item) => item.paneId === planePaneId)).toMatchObject({
      focused: true,
      x: 10,
      y: 38,
    });
    expect(items.find((item) => item.paneId === "workspace_pane_0")?.y).toBeLessThan(0);
  });

  test("up and down navigation crosses horizontal planes by visual position", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:niri-workspace:plane-navigation",
      workspaceName: "Repo",
    });
    const engine = new NiriLikeLayoutEngine(scene);
    const store = new NiriLayoutStore(engine, scene, focusedPaneId);
    const planePaneId = store.splitFocusedPaneToPlane("down");

    store.moveFocus("up", { ...viewport, width: 1200 });
    expect(store.focusedPaneId()).toBe("workspace_pane_0");

    store.moveFocus("down", { ...viewport, width: 1200 });
    expect(store.focusedPaneId()).toBe(planePaneId);
  });

  test("overview lays out separate horizontal planes vertically", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:niri-workspace:overview-planes",
      workspaceName: "Repo",
    });
    const engine = new NiriLikeLayoutEngine(scene);
    const store = new NiriLayoutStore(engine, scene, focusedPaneId);
    const planePaneId = store.splitFocusedPaneToPlane("down");

    const items = renderFrame(engine, { ...viewport, width: 1200 }, 0, planePaneId, "overview");
    const originalPlaneItem = items.find((item) => item.paneId === "workspace_pane_0");
    const lowerPlaneItem = items.find((item) => item.paneId === planePaneId);

    expect(originalPlaneItem?.x).toBe(lowerPlaneItem?.x);
    expect(lowerPlaneItem?.y).toBeGreaterThan(originalPlaneItem?.y ?? 0);
    expect(items.every((item) => item.runtimeState === "live")).toBe(true);
  });

  test("resets a resized column back to its ideal original width", () => {
    const engine = createRealEngine();

    engine.resizeColumn("workspace_column_0", { unit: "px", value: 640 });
    expect(engine.resolvedColumnWidth("workspace_column_0", 900)).toBe(640);

    engine.resetColumnWidth("workspace_column_0");

    expect(engine.toScene().columns[0]?.widthSpec).toEqual({ unit: "px", value: 520 });
    expect(engine.resolvedColumnWidth("workspace_column_0", 900)).toBe(520);
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

  test("renders an active maximized pane as the full viewport without resizing columns", () => {
    const engine = createRealEngine();
    const items = renderFrame(
      engine,
      { ...viewport, width: 1200 },
      1,
      "workspace_pane_1",
      "normal",
      0,
      "workspace_pane_1",
    );
    const maximizedItem = items.find((item) => item.paneId === "workspace_pane_1");

    expect(maximizedItem).toMatchObject({
      height: viewport.height,
      maximized: true,
      width: 1200,
      x: 0,
      y: 0,
      z: 20,
    });
    expect(engine.toScene().columns.map((column) => column.widthSpec)).toEqual([
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
    ]);
  });

  test("does not inherit viewport scaling when focus moves away from a maximized pane", () => {
    const engine = createRealEngine();
    const items = renderFrame(
      engine,
      { ...viewport, width: 1200 },
      2,
      "workspace_pane_2",
      "normal",
      0,
      "workspace_pane_1",
    );
    const focusedItem = items.find((item) => item.paneId === "workspace_pane_2");
    const previouslyMaximizedItem = items.find((item) => item.paneId === "workspace_pane_1");

    expect(focusedItem).toMatchObject({
      focused: true,
      maximized: false,
      width: 520,
      x: 10,
      y: 38,
    });
    expect(previouslyMaximizedItem?.maximized).toBe(false);
  });
});

function renderFrame(
  engine: NiriLikeLayoutEngine,
  frameViewport: Rect,
  scrollColumn: number,
  focusedPaneId: string,
  presentationMode: "normal" | "overview" = "normal",
  scrollRow = 0,
  maximizedPaneId: string | null = null,
): PaneRenderItem[] {
  const items: PaneRenderItem[] = [];
  engine.renderFrame(
    {
      focusedPaneId,
      maximizedPaneId,
      movementPhase: "moving",
      presentationMode,
      scrollColumn,
      scrollRow,
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
