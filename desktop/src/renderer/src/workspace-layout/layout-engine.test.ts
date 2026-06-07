import { describe, expect, test } from "vitest";

import {
  generateBenchmarkScene,
  phaseOneFakePaneCount,
  phaseOneVisiblePaneCount,
} from "./benchmark-scene";
import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import { WorkspaceLayoutStore } from "./layout-store";
import type {
  WorkspaceScene,
  PaneRenderItem,
  PaneRuntimeState,
  Rect,
  SurfaceId,
  SurfaceKind,
} from "./types";
import { createRealWorkspaceScene } from "./workspace-scene";

const viewport: Rect = {
  height: 900,
  width: 1440,
  x: 0,
  y: 0,
};

describe("workspace browser-pane layout engine", () => {
  test("keeps the Phase 4 public surface contract explicit", () => {
    const runtimeState: PaneRuntimeState = "live";
    const surfaceId: SurfaceId = "workspace_surface_contract";
    const surfaceKind: SurfaceKind = "browser";

    expect({ runtimeState, surfaceId, surfaceKind }).toEqual({
      runtimeState: "live",
      surfaceId: "workspace_surface_contract",
      surfaceKind: "browser",
    });
  });

  test("generates the Phase 6 terminal/git graph benchmark scene without losing earlier surfaces", () => {
    const scene = generateBenchmarkScene();
    const browserPanes = scene.panes.filter((pane) => pane.surfaceKind === "browser");
    const gitGraphPanes = scene.panes.filter((pane) => pane.surfaceKind === "git-graph");
    const workflowGraphPanes = scene.panes.filter((pane) => pane.surfaceKind === "workflow-graph");
    const terminalPanes = scene.panes.filter((pane) => pane.surfaceKind === "fake-terminal");

    expect(scene.id).toBe("phase-6-terminal-git-graph-benchmark");
    expect(scene.totalPanes).toBe(phaseOneFakePaneCount);
    expect(scene.targetVisiblePanes).toBe(phaseOneVisiblePaneCount);
    expect(scene.visibleColumnCount).toBe(8);
    expect(scene.panesPerColumn).toBe(5);
    expect(scene.columns).toHaveLength(100);
    expect(scene.paneById.get("workspace_pane_0")?.surfaceKind).toBe("fake-dom");
    expect(scene.paneById.get("workspace_pane_1")?.surfaceKind).toBe("fake-long-chat");
    expect(scene.paneById.get("workspace_pane_2")?.surfaceKind).toBe("settings-dom");
    expect(scene.paneById.get("workspace_pane_3")?.surfaceKind).toBe("chat-dom");
    expect(scene.paneById.get("workspace_pane_4")?.surfaceKind).toBe("workflow-graph");
    expect(scene.paneById.get("workspace_pane_5")?.surfaceKind).toBe("fake-terminal");
    expect(scene.paneById.get("workspace_pane_6")?.surfaceKind).toBe("git-graph");
    expect(scene.panes.some((pane) => pane.surfaceKind === "fake-heavy-dom")).toBe(true);
    expect(workflowGraphPanes.length).toBeGreaterThanOrEqual(20);
    expect(gitGraphPanes.length).toBeGreaterThanOrEqual(6);
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
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const items = renderFrame(engine, viewport, 0, "workspace_pane_0");

    expect(items).toHaveLength(phaseOneVisiblePaneCount);
    expect(items[0]).toMatchObject({
      focused: true,
      paneId: "workspace_pane_0",
      runtimeState: "live",
      surfaceKind: "fake-dom",
      visible: true,
      x: 10,
    });
    expect(items.at(-1)?.paneId).toBe("workspace_pane_39");
  });

  test("uses scroll offset for transform-only horizontal movement", () => {
    const scene = generateBenchmarkScene();
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const items = renderFrame(engine, viewport, 4.25, "workspace_pane_25");

    expect(items).toHaveLength(phaseOneVisiblePaneCount);
    expect(items[0]?.paneId).toBe("workspace_pane_20");
    expect(items[0]?.x).toBeLessThan(0);
    expect(items.some((item) => item.focused && item.paneId === "workspace_pane_25")).toBe(true);
    expect(new Set(items.map((item) => item.surfaceId)).size).toBe(phaseOneVisiblePaneCount);
  });
});

describe("real workspace layout column sizing", () => {
  test("keeps default fixed column widths stable across viewport resize", () => {
    const engine = createRealEngine();
    const wideItems = renderFrame(engine, { ...viewport, width: 1200 }, 0, "workspace_pane_0");
    const narrowItems = renderFrame(engine, { ...viewport, width: 900 }, 0, "workspace_pane_0");

    expect(wideItems[0]?.width).toBe(520);
    expect(narrowItems[0]?.width).toBe(520);
  });

  test("resizes single-pane columns to the current viewport height", () => {
    const engine = createRealEngine();
    const tallItems = renderFrame(engine, { ...viewport, height: 900 }, 0, "workspace_pane_0");
    const shortItems = renderFrame(engine, { ...viewport, height: 600 }, 0, "workspace_pane_0");

    expect(tallItems[0]).toMatchObject({
      height: 880,
      y: 10,
    });
    expect(shortItems[0]).toMatchObject({
      height: 580,
      y: 10,
    });
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

  test("keeps visual gaps between normal panes", () => {
    const engine = createRealEngine();
    const stackedPaneId = engine.splitPane("workspace_pane_0", "down");
    const items = renderFrame(engine, { ...viewport, width: 1200 }, 0, stackedPaneId);
    const firstColumnTop = requireRenderItem(items, "workspace_pane_0");
    const firstColumnBottom = requireRenderItem(items, stackedPaneId);
    const secondColumn = requireRenderItem(items, "workspace_pane_1");

    expect(secondColumn.x).toBe(firstColumnTop.x + firstColumnTop.width + 8);
    expect(firstColumnBottom.y).toBe(firstColumnTop.y + firstColumnTop.height + 8);
  });

  test("keeps next columns attached after shrinking a column", () => {
    const engine = createRealEngine();

    engine.resizeColumn("workspace_column_0", { unit: "px", value: 120 });

    const items = renderFrame(engine, { ...viewport, width: 1200 }, 0, "workspace_pane_0");
    const firstColumn = items.find((item) => item.paneId === "workspace_pane_0");
    const secondColumn = items.find((item) => item.paneId === "workspace_pane_1");

    expect(firstColumn).toMatchObject({
      width: 120,
      x: 10,
    });
    expect(secondColumn?.x).toBe((firstColumn?.x ?? 0) + (firstColumn?.width ?? 0) + 8);
  });

  test("collapses empty normal-layout slots so visible panes stay attached", () => {
    const engine = new WorkspaceLikeLayoutEngine(createSparseGeneratedPaneScene());
    const items = renderFrame(engine, { ...viewport, width: 1200 }, 0, "workspace_pane_0");

    expect(items.map((item) => item.paneId)).toEqual(["workspace_pane_0", "workspace_pane_8"]);
    expect(items[0]).toMatchObject({
      width: 520,
      x: 10,
    });
    expect(items[1]).toMatchObject({
      width: 520,
      x: 538,
    });
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

  test("keeps end-of-strip scrolling snapped to the focused pane lane", () => {
    const engine = createRealEngine();
    const items = renderFrame(engine, { ...viewport, width: 1200 }, 5, "workspace_pane_5");
    const laneItems = items.filter((item) => item.x >= 10 && item.x < 1200);
    const previousItem = items.find((item) => item.paneId === "workspace_pane_4");
    const focusedItem = items.find((item) => item.paneId === "workspace_pane_5");
    const rightmostPaneEdge = Math.max(...laneItems.map((item) => item.x + item.width));

    expect(engine.scrollColumnForFocusedColumnVisibility(5, 5, 1200)).toBe(5);
    expect(laneItems.map((item) => item.paneId)).toEqual(["workspace_pane_5"]);
    expect(previousItem ? previousItem.x + previousItem.width : 0).toBeLessThanOrEqual(10);
    expect(focusedItem?.x).toBe(10);
    expect(rightmostPaneEdge).toBe(530);
  });

  test("navigation snaps focused pane left edge to the viewport lane", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:left-snap",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);

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
      storageKey: "setta:workspace-layout:top-snap",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);
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
    expect(focusedItem?.y).toBe(10);
    expect(firstRowItem?.y).toBeLessThan(0);
  });

  test("keeps every pane attached to a visible column after moving out of a vertical stack", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:move-stack-pane",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);
    const stackedPaneId = store.splitFocusedPane("down");

    store.moveFocusedPane("right");

    const updatedScene = engine.toScene();
    const paneIdsInColumns = updatedScene.columns.flatMap((column) => column.paneIds);

    expect(updatedScene.columns.every((column) => column.paneIds.length > 0)).toBe(true);
    expect(new Set(paneIdsInColumns).size).toBe(updatedScene.panes.length);
    expect(paneIdsInColumns).toContain("workspace_pane_0");
    expect(paneIdsInColumns).toContain(stackedPaneId);
  });

  test("opens after the highest existing generated pane suffix in sparse scenes", () => {
    const engine = new WorkspaceLikeLayoutEngine(createSparseGeneratedPaneScene());

    const paneId = engine.openPane({
      surfaceKind: "terminal",
      title: "Build",
    });

    expect(paneId).toBe("workspace_pane_9");
    expect(engine.toScene().paneById.get(paneId)?.surfaceId).toBe("workspace_surface_9");
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

  test("normal zoom source frames include offscreen columns", () => {
    const engine = createRealEngine();
    const items = renderFrame(
      engine,
      { ...viewport, width: 900 },
      0,
      "workspace_pane_0",
      "normal",
      0,
      null,
      true,
    );
    const rightmostItem = items.find((item) => item.paneId === "workspace_pane_5");

    expect(items).toHaveLength(6);
    expect(rightmostItem).toMatchObject({
      presentationMode: "normal",
      scale: 1,
      visible: true,
    });
    expect(rightmostItem?.x).toBeGreaterThan(900);
  });

  test("renders pane reorder previews without committing column order", () => {
    const engine = createRealEngine();
    const committedOrder = engine.toScene().columns.map((column) => column.paneIds[0]);

    expect(engine.previewPaneReorder("workspace_pane_4", "workspace_pane_1", "before")).toBe(true);

    const previewItems = renderFrame(
      engine,
      { ...viewport, width: 4000 },
      0,
      "workspace_pane_4",
      "normal",
      0,
      null,
      true,
    );

    expect(paneOrderByX(previewItems)).toEqual([
      "workspace_pane_0",
      "workspace_pane_4",
      "workspace_pane_1",
      "workspace_pane_2",
      "workspace_pane_3",
      "workspace_pane_5",
    ]);
    expect(engine.toScene().columns.map((column) => column.paneIds[0])).toEqual(committedOrder);

    expect(engine.clearPaneReorderPreview()).toBe(true);
    const clearedItems = renderFrame(
      engine,
      { ...viewport, width: 4000 },
      0,
      "workspace_pane_4",
      "normal",
      0,
      null,
      true,
    );
    expect(paneOrderByX(clearedItems)).toEqual(committedOrder);
  });

  test("renders after-placement pane reorder previews", () => {
    const engine = createRealEngine();

    expect(engine.previewPaneReorder("workspace_pane_0", "workspace_pane_2", "after")).toBe(true);

    const previewItems = renderFrame(
      engine,
      { ...viewport, width: 4000 },
      0,
      "workspace_pane_0",
      "normal",
      0,
      null,
      true,
    );

    expect(paneOrderByX(previewItems)).toEqual([
      "workspace_pane_1",
      "workspace_pane_2",
      "workspace_pane_0",
      "workspace_pane_3",
      "workspace_pane_4",
      "workspace_pane_5",
    ]);
  });

  test("overview keeps split-down panes vertically stacked inside their column", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:overview-stack",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);
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
      storageKey: "setta:workspace-layout:split-plane-below",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);

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
      y: 10,
    });
    expect(items.find((item) => item.paneId === "workspace_pane_0")?.y).toBeLessThan(0);
  });

  test("split to plane below inserts at the focused horizontal slot", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:split-plane-slot",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);
    store.focusPaneBySurfaceKind("workflow-graph");
    const firstLowerPaneId = store.splitFocusedPaneToPlane("down");
    store.focusPaneBySurfaceKind("git-graph");

    const focusedPaneIdBeforeSplit = store.focusedPaneId();
    const secondLowerPaneId = store.splitFocusedPaneToPlane("down");
    const updatedScene = engine.toScene();
    const firstLowerColumn = updatedScene.columns.find((column) =>
      column.paneIds.includes(firstLowerPaneId),
    );
    const secondLowerColumn = updatedScene.columns.find((column) =>
      column.paneIds.includes(secondLowerPaneId),
    );
    const overviewItems = renderFrame(
      engine,
      { ...viewport, width: 1800 },
      0,
      secondLowerPaneId,
      "overview",
    );
    const focusedPaneItem = overviewItems.find((item) => item.paneId === focusedPaneIdBeforeSplit);
    const lowerPaneItem = overviewItems.find((item) => item.paneId === secondLowerPaneId);

    expect(firstLowerColumn?.slotIndex).toBe(5);
    expect(secondLowerColumn?.slotIndex).toBe(4);
    expect(lowerPaneItem?.x).toBe(focusedPaneItem?.x);
    expect(lowerPaneItem?.y).toBeGreaterThan(focusedPaneItem?.y ?? 0);
  });

  test("up and down navigation crosses horizontal planes by visual position", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:plane-navigation",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);
    const planePaneId = store.splitFocusedPaneToPlane("down");

    store.moveFocus("up", { ...viewport, width: 1200 });
    expect(store.focusedPaneId()).toBe("workspace_pane_0");

    store.moveFocus("down", { ...viewport, width: 1200 });
    expect(store.focusedPaneId()).toBe(planePaneId);
  });

  test("right navigation wraps to the beginning of the current horizontal plane", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:right-wrap-plane",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);
    const lowerPlanePaneId = store.splitFocusedPaneToPlane("down");

    store.focusPaneBySurfaceKind("workflow-graph");
    store.moveFocus("right", { ...viewport, width: 1200 });

    expect(store.focusedPaneId()).toBe("workspace_pane_0");
    expect(store.focusedPaneId()).not.toBe(lowerPlanePaneId);
  });

  test("left navigation wraps to the end of the current horizontal plane", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:left-wrap-plane",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);
    store.splitFocusedPaneToPlane("down");

    store.focusPaneBySurfaceKind("chat-dom");
    store.moveFocus("left");

    expect(store.focusedPaneId()).toBe("workspace_pane_5");
  });

  test("left and right navigation stay on a single-pane horizontal plane", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:single-pane-plane-wrap",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);
    const lowerPlanePaneId = store.splitFocusedPaneToPlane("down");

    store.moveFocus("right", { ...viewport, width: 1200 });
    expect(store.focusedPaneId()).toBe(lowerPlanePaneId);

    store.moveFocus("left", { ...viewport, width: 1200 });
    expect(store.focusedPaneId()).toBe(lowerPlanePaneId);
  });

  test("overview lays out separate horizontal planes vertically", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:overview-planes",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);
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

  test("clamps resized columns to the viewport while preserving their stored width", () => {
    const engine = createRealEngine();

    engine.resizeColumn("workspace_column_0", { unit: "px", value: 860 });

    expect(engine.toScene().columns[0]?.widthSpec).toEqual({ unit: "px", value: 860 });
    expect(engine.resolvedColumnWidth("workspace_column_0", 1200)).toBe(860);
    expect(engine.resolvedColumnWidth("workspace_column_0", 640)).toBe(620);
    expect(engine.resolvedColumnWidth("workspace_column_0", 1200)).toBe(860);
    expect(engine.toScene().columns[0]?.widthSpec).toEqual({ unit: "px", value: 860 });
  });

  test("allows resized columns to overflow when the developer option is disabled", () => {
    const engine = createRealEngine({ allowResizedPanesToOverflowViewport: true });

    engine.resizeColumn("workspace_column_0", { unit: "px", value: 860 });

    expect(engine.resolvedColumnWidth("workspace_column_0", 640)).toBe(860);
  });

  test("keeps the focused column visible after a viewport resize", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:resize-focus",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);

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
    expect(focusedItem?.x).toBe(10);
    expect(focusedItem?.y).toBe(10);
    expect((focusedItem?.x ?? 0) + (focusedItem?.width ?? 0)).toBeLessThanOrEqual(890);
  });

  test("keeps the focused end column snapped left as width narrows", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:resize-end-focus",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);

    store.focusPaneBySurfaceKind("workflow-graph");
    store.ensureFocusedPaneVisible({ ...viewport, width: 1200 });
    store.snapScrollToTarget();
    store.ensureFocusedPaneVisible({ ...viewport, width: 900 });
    store.snapScrollToTarget();

    const snapshot = store.getSnapshot();
    const items = renderFrame(
      engine,
      { ...viewport, width: 900 },
      snapshot.scrollColumn,
      snapshot.focusedPaneId,
      "normal",
      snapshot.scrollRow,
    );
    const focusedItem = items.find((item) => item.focused);

    expect(snapshot.focusedPaneId).toBe("workspace_pane_5");
    expect(focusedItem?.x).toBe(10);
    expect(focusedItem?.y).toBe(10);
    expect((focusedItem?.x ?? 0) + (focusedItem?.width ?? 0)).toBeLessThanOrEqual(890);
  });

  test("keeps a focused split-down pane anchored during viewport height resize", () => {
    const { focusedPaneId, scene } = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:resize-row-focus",
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);
    const stackedPaneId = store.splitFocusedPane("down");

    store.ensureFocusedPaneVisible({ ...viewport, height: 900, width: 1200 });
    store.snapScrollToTarget();

    const tallSnapshot = store.getSnapshot();
    const tallItems = renderFrame(
      engine,
      { ...viewport, height: 900, width: 1200 },
      tallSnapshot.scrollColumn,
      tallSnapshot.focusedPaneId,
      "normal",
      tallSnapshot.scrollRow,
    );
    const tallFocusedItem = tallItems.find((item) => item.paneId === stackedPaneId);
    expect(tallFocusedItem?.height).toBeCloseTo(335.384615);
    expect(tallFocusedItem?.y).toBe(10);

    store.ensureFocusedPaneVisible({ ...viewport, height: 600, width: 1200 });
    store.snapScrollToTarget();

    const shortSnapshot = store.getSnapshot();
    const shortItems = renderFrame(
      engine,
      { ...viewport, height: 600, width: 1200 },
      shortSnapshot.scrollColumn,
      shortSnapshot.focusedPaneId,
      "normal",
      shortSnapshot.scrollRow,
    );
    const focusedItem = shortItems.find((item) => item.paneId === stackedPaneId);
    const firstRowItem = shortItems.find((item) => item.paneId === "workspace_pane_0");

    expect(focusedItem?.height).toBeCloseTo(220);
    expect(focusedItem?.y).toBe(10);
    expect(firstRowItem?.y).toBeLessThan(0);
  });

  test("renders a maximized pane as a viewport-sized pane in normal layout flow", () => {
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
      height: viewport.height - 20,
      maximized: true,
      width: 1180,
      x: 10,
      y: 10,
      z: 2,
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

  test("pans naturally to the next pane while the maximized pane stays in layout flow", () => {
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
      y: 10,
    });
    expect(previouslyMaximizedItem).toMatchObject({
      height: viewport.height - 20,
      maximized: true,
      width: 1180,
      x: -1178,
      y: 10,
      z: 1,
    });
  });
});

function renderFrame(
  engine: WorkspaceLikeLayoutEngine,
  frameViewport: Rect,
  scrollColumn: number,
  focusedPaneId: string,
  presentationMode: "normal" | "overview" = "normal",
  scrollRow = 0,
  maximizedPaneId: string | null = null,
  renderAllColumns = false,
): PaneRenderItem[] {
  const items: PaneRenderItem[] = [];
  engine.renderFrame(
    {
      focusedPaneId,
      maximizedPaneId,
      movementPhase: "moving",
      presentationMode,
      renderAllColumns,
      scrollColumn,
      scrollRow,
      viewport: frameViewport,
    },
    (item) => items.push(item),
  );
  return items;
}

function requireRenderItem(items: PaneRenderItem[], paneId: string): PaneRenderItem {
  const item = items.find((candidate) => candidate.paneId === paneId);
  if (!item) {
    throw new Error(`render item ${paneId} was not found`);
  }
  return item;
}

function createRealEngine(
  options?: ConstructorParameters<typeof WorkspaceLikeLayoutEngine>[1],
): WorkspaceLikeLayoutEngine {
  const { scene } = createRealWorkspaceScene({
    storageKey: "setta:workspace-layout:engine-test",
    workspaceName: "Repo",
  });
  return new WorkspaceLikeLayoutEngine(scene, options);
}

function paneOrderByX(items: readonly PaneRenderItem[]): string[] {
  return items.toSorted((left, right) => left.x - right.x).map((item) => item.paneId);
}

function createSparseGeneratedPaneScene(): WorkspaceScene {
  const panes = [
    {
      columnId: "workspace_column_0",
      heat: 0,
      paneId: "workspace_pane_0",
      sequence: 0,
      subtitle: "Repo",
      surfaceId: "workspace_surface_0",
      surfaceKind: "chat-dom",
      title: "Chat",
      tone: "cyan",
      weight: 1,
    },
    {
      columnId: "workspace_column_8",
      heat: 0,
      paneId: "workspace_pane_8",
      sequence: 8,
      subtitle: "Old",
      surfaceId: "workspace_surface_8",
      surfaceKind: "chat-dom",
      title: "Old Chat",
      tone: "cyan",
      weight: 1,
    },
  ] satisfies WorkspaceScene["panes"];
  const columns = [
    {
      columnId: "workspace_column_0",
      idealWidthSpec: { unit: "px", value: 520 },
      index: 0,
      paneIds: ["workspace_pane_0"],
      planeIndex: 0,
      widthSpec: { unit: "px", value: 520 },
    },
    {
      columnId: "workspace_column_8",
      idealWidthSpec: { unit: "px", value: 520 },
      index: 1,
      paneIds: ["workspace_pane_8"],
      planeIndex: 0,
      widthSpec: { unit: "px", value: 520 },
    },
  ] satisfies WorkspaceScene["columns"];
  return {
    columnGap: 8,
    columns,
    defaultColumnWidthSpec: { unit: "px", value: 520 },
    id: "sparse-generated-pane-scene",
    paneById: new Map(panes.map((pane) => [pane.paneId, pane])),
    panes,
    panesPerColumn: 1,
    padding: 10,
    renderOverscanColumns: 2,
    rowGap: 8,
    targetVisiblePanes: panes.length,
    totalPanes: panes.length,
    visibleColumnCount: 2,
  };
}
