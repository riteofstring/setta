import { describe, expect, test } from "vitest";

import { OVERVIEW_MAX_ZOOM_SCALE, OVERVIEW_MIN_ZOOM } from "./layout-engine-helpers";
import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import type { PaneRenderItem, Rect } from "./types";
import { createWorkspaceLayoutTestScene } from "./workspace-scene.test-fixtures";

const viewport: Rect = { height: 900, width: 1200, x: 0, y: 0 };

describe("overview drag-preview scale freeze", () => {
  test("freezes the overview scale while a drop preview reflows the layout", () => {
    const engine = createRealEngine();
    const committed = renderOverview(engine, viewport);
    const committedScale = requireRenderItem(committed, "workspace_pane_0").scale;

    // A cross-column row move reflows the grid (and would change the fit-all scale).
    const moveIntent = {
      kind: "row" as const,
      placement: "after" as const,
      targetPaneId: "workspace_pane_1",
    };
    expect(engine.previewPaneDropIntent("workspace_pane_0", moveIntent)).toBe(true);
    const previewed = renderOverview(engine, viewport);

    // The preview reflowed (pane_0 now stacks under pane_1) ...
    const movedPane = requireRenderItem(previewed, "workspace_pane_0");
    const targetPane = requireRenderItem(previewed, "workspace_pane_1");
    expect(movedPane.x).toBe(targetPane.x);
    expect(movedPane.y).toBeGreaterThan(targetPane.y);
    // ... yet every pane keeps the committed (frozen) scale.
    for (const item of previewed) {
      expect(item.scale).toBeCloseTo(committedScale, 6);
    }

    // The freeze is meaningful: committing the same move *does* change the scale,
    // so the preview was hiding a real rescale (the source of the zoom snap).
    engine.clearPaneReorderPreview();
    expect(engine.applyPaneDropIntent("workspace_pane_0", moveIntent)).toBe(true);
    const afterCommit = renderOverview(engine, viewport);
    expect(requireRenderItem(afterCommit, "workspace_pane_0").scale).not.toBeCloseTo(
      committedScale,
      6,
    );
  });
});

describe("overview user zoom", () => {
  test("scales the overview by the user zoom factor, capped below normal", () => {
    const engine = createRealEngine();
    const small: Rect = { height: 320, width: 420, x: 0, y: 0 };
    const fit = engine.overviewContentBounds(small).scale;
    expect(fit).toBeLessThan(OVERVIEW_MAX_ZOOM_SCALE);

    // Zoom 1 == fit-all.
    expect(engine.overviewContentBounds(small, null, 1).scale).toBeCloseTo(fit, 6);
    // Zooming in grows the scale, capped at the zoom-in ceiling ...
    expect(engine.overviewContentBounds(small, null, 2).scale).toBeGreaterThan(fit);
    expect(engine.overviewContentBounds(small, null, 100).scale).toBeCloseTo(
      OVERVIEW_MAX_ZOOM_SCALE,
      6,
    );
    // ... and zooming out drops below fit down to the zoom-out floor.
    expect(engine.overviewContentBounds(small, null, OVERVIEW_MIN_ZOOM).scale).toBeCloseTo(
      fit * OVERVIEW_MIN_ZOOM,
      6,
    );
    expect(engine.overviewContentBounds(small, null, 0.01).scale).toBeCloseTo(
      fit * OVERVIEW_MIN_ZOOM,
      6,
    );
  });

  test("renders panes at the zoomed scale and reports matching pan room", () => {
    const engine = createRealEngine();
    const small: Rect = { height: 320, width: 420, x: 0, y: 0 };
    const fitBounds = engine.overviewContentBounds(small, null, 1);
    const zoomedBounds = engine.overviewContentBounds(small, null, 2.5);
    const items = renderOverview(engine, small, 2.5);

    expect(items[0]?.scale).toBeCloseTo(zoomedBounds.scale, 6);
    // Zooming in enlarges the content, so there is more pan room than at fit.
    expect(zoomedBounds.maxPanX).toBeGreaterThan(fitBounds.maxPanX);
  });
});

describe("overview shares one layout with normal mode", () => {
  test("a wide/locked pane has the same intrinsic size in both modes (just scaled)", () => {
    const engine = createRealEngine();
    const firstColumn = engine.toScene().columns[0];
    if (!firstColumn) {
      throw new Error("expected at least one column");
    }
    const paneId = firstColumn.paneIds[0];
    if (!paneId) {
      throw new Error("expected a pane in the first column");
    }
    // Lock the column far wider than the viewport. Normal mode clamps it to fit, so
    // overview must clamp it identically -- otherwise its aspect ratio is wrong and
    // the zoom transition has to morph the width.
    engine.resizeColumn(firstColumn.columnId, { unit: "px", value: viewport.width * 3 });

    const normalItems: PaneRenderItem[] = [];
    engine.renderFrame(
      {
        focusedPaneId: paneId,
        maximizedPaneId: null,
        movementPhase: "idle",
        presentationMode: "normal",
        renderAllColumns: true,
        scrollColumn: 0,
        scrollRow: 0,
        viewport,
      },
      (item) => normalItems.push(item),
    );
    const normal = requireRenderItem(normalItems, paneId);
    const overview = requireRenderItem(renderOverview(engine, viewport), paneId);

    // Identical unscaled width/height -> overview is normal, just frozen and scaled.
    expect(normal.scale).toBe(1);
    expect(overview.scale).toBeLessThan(1);
    expect(overview.width).toBeCloseTo(normal.width, 5);
    expect(overview.height).toBeCloseTo(normal.height, 5);
  });
});

describe("overview insert-frame preview (non-committing)", () => {
  test("reflows the overview for a previewed insert without committing or leaking state", () => {
    const engine = createRealEngine();
    const before = renderOverview(engine, viewport);
    const beforeCount = before.length;
    const totalBefore = engine.toScene().totalPanes;

    expect(engine.previewInsertFrame("workspace_pane_0", "right")).toBe(true);
    // Re-previewing the same slot is a no-op.
    expect(engine.previewInsertFrame("workspace_pane_0", "right")).toBe(false);
    expect(engine.hasInsertFramePreview()).toBe(true);

    const previewed = renderOverview(engine, viewport);
    // The placeholder pane itself is never rendered (the affordance marks its slot).
    expect(previewed.length).toBe(beforeCount);
    // The existing panes reflowed to make room (shift and/or rescale).
    const beforeById = new Map(before.map((item) => [item.paneId, item]));
    const reflowed = previewed.some((item) => {
      const original = beforeById.get(item.paneId);
      return (
        original !== undefined &&
        (Math.abs(original.x - item.x) > 0.5 || Math.abs(original.scale - item.scale) > 0.0001)
      );
    });
    expect(reflowed).toBe(true);
    // Nothing was committed: the preview render restored engine state.
    expect(engine.toScene().totalPanes).toBe(totalBefore);

    // Clearing restores the exact original frame.
    expect(engine.clearInsertFramePreview()).toBe(true);
    const after = renderOverview(engine, viewport);
    expect(after.map((item) => `${item.paneId}:${item.x.toFixed(2)}`)).toEqual(
      before.map((item) => `${item.paneId}:${item.x.toFixed(2)}`),
    );
  });

  test("overviewInsertPreviewBounds returns the previewed pane's exact slot without leaking", () => {
    const engine = createRealEngine();
    const totalBefore = engine.toScene().totalPanes;

    expect(engine.previewInsertFrame("workspace_pane_0", "right")).toBe(true);
    const rect = engine.overviewInsertPreviewBounds(viewport);
    if (!rect) {
      throw new Error("expected an insert preview rect");
    }
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(engine.toScene().totalPanes).toBe(totalBefore);

    // No preview -> no rect.
    engine.clearInsertFramePreview();
    expect(engine.overviewInsertPreviewBounds(viewport)).toBeNull();
  });

  test("the insert affordance bounds track the overview pan (no drift)", () => {
    const engine = createRealEngine();
    // A viewport small enough (and zoom high enough) that the content overflows,
    // so there is real pan room to test against.
    const small: Rect = { height: 320, width: 420, x: 0, y: 0 };
    const zoom = 100;
    const bounds = engine.overviewContentBounds(small, null, zoom);
    expect(bounds.maxPanX).toBeGreaterThan(0);
    const panX = bounds.maxPanX / 2;

    // The renderer offsets every pane by the pan, so the anchor pane moves by -pan.
    const anchor0 = requireRenderItem(renderOverview(engine, small, zoom), "workspace_pane_1");
    const anchorPanned = requireRenderItem(
      renderOverview(engine, small, zoom, panX, 0),
      "workspace_pane_1",
    );
    expect(anchorPanned.x - anchor0.x).toBeCloseTo(-panX, 3);

    // The "add pane" affordance must follow that same pan; before the fix its bounds
    // were computed at pan 0 and drifted off the slot once the overview was panned.
    expect(engine.previewInsertFrame("workspace_pane_1", "right")).toBe(true);
    const ghost0 = engine.overviewInsertPreviewBounds(small, null, zoom, 0, 0);
    const ghostPanned = engine.overviewInsertPreviewBounds(small, null, zoom, panX, 0);
    if (!ghost0 || !ghostPanned) {
      throw new Error("expected insert preview rects");
    }
    expect(ghostPanned.left - ghost0.left).toBeCloseTo(-panX, 3);
    // The ghost shifts in lockstep with the pane it annotates (stays on the slot).
    expect(ghostPanned.left - ghost0.left).toBeCloseTo(anchorPanned.x - anchor0.x, 3);
  });
});

function renderOverview(
  engine: WorkspaceLikeLayoutEngine,
  frameViewport: Rect,
  overviewZoom = 1,
  overviewPanX = 0,
  overviewPanY = 0,
): PaneRenderItem[] {
  const items: PaneRenderItem[] = [];
  engine.renderFrame(
    {
      focusedPaneId: "workspace_pane_0",
      maximizedPaneId: null,
      movementPhase: "idle",
      overviewPanX,
      overviewPanY,
      overviewZoom,
      presentationMode: "overview",
      scrollColumn: 0,
      scrollRow: 0,
      viewport: frameViewport,
    },
    (item) => items.push(item),
  );
  return items;
}

function createRealEngine(): WorkspaceLikeLayoutEngine {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  const { scene } = createWorkspaceLayoutTestScene({
    storedLayout: null,
    workspaceId: "setta:workspace-layout:overview-zoom-engine-test",
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
  return new WorkspaceLikeLayoutEngine(builder.toScene());
}

function requireRenderItem(items: PaneRenderItem[], paneId: string): PaneRenderItem {
  const item = items.find((candidate) => candidate.paneId === paneId);
  if (!item) {
    throw new Error(`render item ${paneId} was not found`);
  }
  return item;
}
