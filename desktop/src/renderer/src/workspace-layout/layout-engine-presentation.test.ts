import { describe, expect, test } from "vitest";

import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import type { PaneRenderItem, Rect } from "./types";
import { createWorkspaceLayoutTestScene } from "./workspace-scene.test-fixtures";

const viewport: Rect = {
  height: 900,
  width: 1440,
  x: 0,
  y: 0,
};

describe("real workspace layout maximized panes", () => {
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

  test("keeps maximized pane aspect ratio unchanged between normal and overview endpoints", () => {
    const engine = createRealEngine();
    const maximizedPaneId = "workspace_pane_1";
    const normalItems = renderFrame(
      engine,
      { ...viewport, width: 1200 },
      1,
      maximizedPaneId,
      "normal",
      0,
      maximizedPaneId,
      true,
    );
    const overviewItems = renderFrame(
      engine,
      { ...viewport, width: 1200 },
      0,
      maximizedPaneId,
      "overview",
      0,
      maximizedPaneId,
    );
    const normalMaximizedItem = requireRenderItem(normalItems, maximizedPaneId);
    const overviewMaximizedItem = requireRenderItem(overviewItems, maximizedPaneId);

    expect(overviewMaximizedItem.maximized).toBe(true);
    expect(overviewMaximizedItem.width / overviewMaximizedItem.height).toBeCloseTo(
      normalMaximizedItem.width / normalMaximizedItem.height,
      6,
    );
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

describe("compact mobile layout", () => {
  const mobileViewport: Rect = { height: 700, width: 390, x: 0, y: 0 };

  test("renders every pane at the full viewport size without scene padding", () => {
    const engine = createRealEngine();
    engine.setCompactLayout(true);
    const items = renderFrame(engine, mobileViewport, 0, "workspace_pane_0");
    const firstItem = requireRenderItem(items, "workspace_pane_0");
    const secondItem = requireRenderItem(items, "workspace_pane_1");

    expect(firstItem).toMatchObject({
      height: mobileViewport.height,
      width: mobileViewport.width,
      x: 0,
      y: 0,
    });
    expect(secondItem).toMatchObject({
      height: mobileViewport.height,
      width: mobileViewport.width,
      x: mobileViewport.width + 8,
    });
  });

  test("gives stacked panes a full-height page each and matching scroll offsets", () => {
    const engine = createRealEngine();
    const stackedPaneId = engine.splitPane("workspace_pane_0", "down");
    engine.setCompactLayout(true);
    const items = renderFrame(engine, mobileViewport, 0, stackedPaneId);
    const topItem = requireRenderItem(items, "workspace_pane_0");
    const bottomItem = requireRenderItem(items, stackedPaneId);

    expect(topItem.height).toBe(mobileViewport.height);
    expect(bottomItem.height).toBe(mobileViewport.height);
    expect(bottomItem.y).toBe(topItem.y + mobileViewport.height + 8);
    expect(engine.verticalScrollOffsetForPane(stackedPaneId, mobileViewport.height)).toBe(
      mobileViewport.height + 8,
    );
  });

  test("restores the regular column sizing when compact layout is disabled", () => {
    const engine = createRealEngine();
    engine.setCompactLayout(true);
    engine.setCompactLayout(false);
    const items = renderFrame(engine, { ...viewport, width: 1200 }, 0, "workspace_pane_0");
    const firstItem = requireRenderItem(items, "workspace_pane_0");

    expect(firstItem).toMatchObject({
      height: viewport.height - 20,
      width: 520,
      x: 10,
      y: 10,
    });
  });
});

describe("overview surface pan", () => {
  const narrow: Rect = { height: 360, width: 520, x: 0, y: 0 };

  test("exposes pan bounds and shifts panes to reveal off-screen content", () => {
    const engine = createRealEngine({ overviewCardMinWidthPx: 360 });
    const bounds = engine.overviewContentBounds(narrow);
    expect(bounds.maxPanX).toBeGreaterThan(0);

    const base = requireRenderItem(renderOverviewPan(engine, narrow, 0, 0), "workspace_pane_0");
    const panned = requireRenderItem(
      renderOverviewPan(engine, narrow, bounds.maxPanX, 0),
      "workspace_pane_0",
    );

    expect(panned.x).toBeCloseTo(base.x - bounds.maxPanX, 3);
  });

  test("clamps over-pan to the content bounds", () => {
    const engine = createRealEngine({ overviewCardMinWidthPx: 360 });
    const bounds = engine.overviewContentBounds(narrow);

    const atMax = requireRenderItem(
      renderOverviewPan(engine, narrow, bounds.maxPanX, 0),
      "workspace_pane_0",
    );
    const beyond = requireRenderItem(
      renderOverviewPan(engine, narrow, bounds.maxPanX + 800, 0),
      "workspace_pane_0",
    );

    expect(beyond.x).toBeCloseTo(atMax.x, 3);
  });

  test("reports no pan room for a workspace that already fits", () => {
    const engine = createRealEngine();
    const bounds = engine.overviewContentBounds({ height: 900, width: 4000, x: 0, y: 0 });

    expect(bounds.maxPanX).toBe(0);
    expect(bounds.maxPanY).toBe(0);
  });
});

function renderOverviewPan(
  engine: WorkspaceLikeLayoutEngine,
  frameViewport: Rect,
  overviewPanX: number,
  overviewPanY: number,
): PaneRenderItem[] {
  const items: PaneRenderItem[] = [];
  engine.renderFrame(
    {
      focusedPaneId: "workspace_pane_0",
      maximizedPaneId: null,
      movementPhase: "idle",
      overviewPanX,
      overviewPanY,
      presentationMode: "overview",
      scrollColumn: 0,
      scrollRow: 0,
      viewport: frameViewport,
    },
    (item) => items.push(item),
  );
  return items;
}

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
  const { scene } = createWorkspaceLayoutTestScene({
    storedLayout: null,
    workspaceId: "setta:workspace-layout:engine-test",
    workspaceName: "Repo",
  });
  const builder = new WorkspaceLikeLayoutEngine(scene);
  builder.openPane({
    adjacentToColumnId: "workspace_column_3",
    surfaceKind: "browser",
    title: "Logs",
    tone: "green",
  });
  builder.openPane({
    adjacentToColumnId: "workspace_column_4",
    surfaceKind: "fake-heavy-dom",
    title: "Notes",
    tone: "cyan",
  });
  return new WorkspaceLikeLayoutEngine(builder.toScene(), options);
}
