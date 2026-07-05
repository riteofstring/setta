import { describe, expect, test } from "vitest";

import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import type { PaneRenderItem, Rect, WorkspaceScene } from "./types";

const viewport: Rect = {
  height: 900,
  width: 12000,
  x: 0,
  y: 0,
};

describe("real workspace ultra-wide layout", () => {
  test("renders every pane that intersects an ultra-wide viewport", () => {
    const scene = createUltraWideRealPaneScene(24);
    const engine = new WorkspaceLikeLayoutEngine(scene);
    const items = renderFrame(engine, viewport, "workspace_pane_0");
    const viewportIntersectingItems = items.filter(
      (item) => item.x < viewport.width && item.x + item.width > 0,
    );

    expect(viewportIntersectingItems).toHaveLength(23);
    expect(viewportIntersectingItems.length).toBeGreaterThan(18);
    expect(viewportIntersectingItems.map((item) => item.paneId)).toEqual(
      Array.from({ length: 23 }, (_value, index) => `workspace_pane_${index}`),
    );
  });
});

function renderFrame(
  engine: WorkspaceLikeLayoutEngine,
  frameViewport: Rect,
  focusedPaneId: string,
): PaneRenderItem[] {
  const items: PaneRenderItem[] = [];
  engine.renderFrame(
    {
      focusedPaneId,
      maximizedPaneId: null,
      movementPhase: "moving",
      presentationMode: "normal",
      scrollColumn: 0,
      scrollRow: 0,
      viewport: frameViewport,
    },
    (item) => items.push(item),
  );
  return items;
}

function createUltraWideRealPaneScene(paneCount: number): WorkspaceScene {
  const panes = Array.from({ length: paneCount }, (_value, index) => ({
    columnId: `workspace_column_${index}`,
    heat: (index * 37) % 100,
    paneId: `workspace_pane_${index}`,
    sequence: index,
    subtitle: "ultra-wide pane",
    surfaceId: `workspace_surface_${index}`,
    surfaceKind: index % 3 === 0 ? "chat-dom" : index % 3 === 1 ? "terminal" : "workflow-graph",
    title: `Pane ${index + 1}`,
    tone: "slate",
    weight: 1,
  })) satisfies WorkspaceScene["panes"];
  const columns = panes.map((pane, index) => ({
    columnId: pane.columnId,
    idealWidthSpec: { unit: "px", value: 520 },
    index,
    paneIds: [pane.paneId],
    planeIndex: 0,
    slotIndex: index,
    widthSpec: { unit: "px", value: 520 },
  })) satisfies WorkspaceScene["columns"];
  return {
    columnGap: 8,
    columns,
    defaultColumnWidthSpec: { unit: "px", value: 520 },
    id: "ultra-wide-real-pane-scene",
    paneById: new Map(panes.map((pane) => [pane.paneId, pane])),
    panes,
    panesPerColumn: 1,
    padding: 10,
    renderOverscanColumns: 2,
    rowGap: 8,
    targetVisiblePanes: panes.length,
    totalPanes: panes.length,
    visibleColumnCount: 3,
  };
}
