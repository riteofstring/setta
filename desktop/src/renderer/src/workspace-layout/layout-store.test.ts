import { afterEach, describe, expect, test } from "vitest";

import { generateBenchmarkScene } from "./benchmark-scene";
import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import {
  minimumColumnWidth,
  OVERVIEW_MAX_ZOOM_SCALE,
  OVERVIEW_MIN_ZOOM,
} from "./layout-engine-helpers";
import { WorkspaceLayoutStore } from "./layout-store";
import {
  commitPaneResize,
  paneResizePreviewForPointerMove,
  type PaneResizeSession,
} from "./pane-resize-session";
import type {
  WorkspaceColumn,
  WorkspaceScene,
  OpenPaneRequest,
  PaneLimitPolicy,
  Rect,
} from "./types";
import { createWorkspaceLayoutTestScene } from "./workspace-scene.test-fixtures";

const viewport: Rect = {
  height: 900,
  width: 1200,
  x: 0,
  y: 0,
};

describe("workspace layout store", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("opens panes in a new column to the right of the focused column", () => {
    const store = createStore();

    const openedPaneId = store.openPane({
      surfaceKind: "browser",
      title: "Build",
      tone: "green",
    });

    expect(store.getSnapshot().focusedPaneId).toBe(openedPaneId);
    expect(store.toScene().totalPanes).toBe(5);
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedRowIndex: 0,
    });
    expect(store.toScene().columns[0]?.paneIds).toEqual(["workspace_pane_0"]);
    expect(store.toScene().columns[1]?.paneIds).toEqual([openedPaneId]);
    expect(store.toScene().columns[2]?.paneIds).toEqual(["workspace_pane_1"]);
  });

  test("split right creates an adjacent column and split down creates a vertical stack", () => {
    const store = createStore();

    const splitPaneId = store.splitFocusedPane("right");
    const afterSplit = store.toScene();

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: splitPaneId,
      focusedRowIndex: 0,
    });
    expect(afterSplit.totalPanes).toBe(5);
    expect(afterSplit.columns[1]?.paneIds).toEqual([splitPaneId]);

    store.moveFocus("left");
    const stackedPaneId = store.splitFocusedPane("down");
    const afterStack = store.toScene();

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 0,
      focusedPaneId: stackedPaneId,
      focusedRowIndex: 1,
    });
    expect(afterStack.columns[0]?.paneIds).toEqual(["workspace_pane_0", stackedPaneId]);
  });

  test("moves panes left and right by stacking them into adjacent columns", () => {
    const store = createStore();

    store.moveFocus("right");
    const conversationPaneId = store.focusedPaneId();
    store.moveFocusedPane("left");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 0,
      focusedPaneId: conversationPaneId,
      focusedRowIndex: 1,
    });
    expect(store.toScene().columns[0]?.paneIds).toEqual(["workspace_pane_0", conversationPaneId]);
    expect(store.toScene().columns[1]?.paneIds).toEqual(["workspace_pane_2"]);

    store.moveFocusedPane("right");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: conversationPaneId,
      focusedRowIndex: 1,
    });
    expect(store.toScene().columns[0]?.paneIds).toEqual(["workspace_pane_0"]);
    expect(store.toScene().columns[1]?.paneIds).toEqual(["workspace_pane_2", conversationPaneId]);
  });

  test("moves panes up and down inside a vertical stack", () => {
    const store = createStore();
    const stackedPaneId = store.splitFocusedPane("down");

    store.moveFocusedPane("up");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 0,
      focusedPaneId: stackedPaneId,
      focusedRowIndex: 0,
    });
    expect(store.toScene().columns[0]?.paneIds).toEqual([stackedPaneId, "workspace_pane_0"]);

    store.moveFocusedPane("down");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 0,
      focusedPaneId: stackedPaneId,
      focusedRowIndex: 1,
    });
    expect(store.toScene().columns[0]?.paneIds).toEqual(["workspace_pane_0", stackedPaneId]);
  });

  test("close keeps focus near the removed pane", () => {
    const store = createStore();
    const splitPaneId = store.splitFocusedPane("right");

    expect(store.closeFocusedPane()).toBe(splitPaneId);
    expect(store.toScene().paneById.has(splitPaneId)).toBe(false);
    expect(store.toScene().totalPanes).toBe(4);
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: "workspace_pane_1",
      focusedRowIndex: 0,
    });
  });

  test("keeps snapshots stable until layout state changes", () => {
    const store = createStore();
    const firstSnapshot = store.getSnapshot();

    expect(store.getSnapshot()).toBe(firstSnapshot);
    expect(firstSnapshot.revision).toBe(0);

    store.openPane({ title: "Logs" });

    expect(store.getSnapshot()).not.toBe(firstSnapshot);
    expect(store.getSnapshot().revision).toBe(firstSnapshot.revision + 1);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  test("enforces configured pane limits for explicit opens", () => {
    const store = createStore({ browser: 1 });

    expect(store.paneLimitState({ surfaceKind: "browser" })).toEqual({
      allowed: false,
      count: 1,
      limit: 1,
      surfaceKind: "browser",
    });
    expect(store.canOpenPane({ surfaceKind: "browser" })).toBe(false);
    expect(() => store.openPane({ surfaceKind: "browser", title: "Browser" })).toThrow(
      "workspace pane limit reached for browser",
    );
  });

  test("does not impose a pane limit on Easy Button conversations", () => {
    const store = createStore({ browser: 1 });

    for (let index = 0; index < 11; index += 1) {
      expect(
        store.canOpenPane({
          easyButtonConfig: { conversationId: `conversation_${index}` },
          surfaceKind: "easy-button",
        }),
      ).toBe(true);
      store.openPane({
        easyButtonConfig: { conversationId: `conversation_${index}` },
        surfaceKind: "easy-button",
        title: `Topic ${index}`,
      });
    }

    expect(store.paneLimitState({ surfaceKind: "easy-button" })).toEqual({
      allowed: true,
      count: 12,
      limit: null,
      surfaceKind: "easy-button",
    });
  });

  test("opens an empty frame to the right of the focused pane", () => {
    const store = createStore();

    const emptyPaneId = store.openEmptyFrame();
    const scene = store.toScene();

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: emptyPaneId,
      focusedRowIndex: 0,
    });
    expect(scene.paneById.get(emptyPaneId)).toMatchObject({
      subtitle: "choose a pane type",
      surfaceKind: "empty-frame",
      title: "New frame",
      tone: "slate",
    });
    expect(scene.columns[1]?.paneIds).toEqual([emptyPaneId]);
  });

  test("opens overview ghost empty frames around the target pane", () => {
    const rightStore = createStore();
    const rightPaneId = rightStore.openEmptyFrameNear("workspace_pane_1", "right");
    const rightScene = rightStore.toScene();

    expect(rightStore.getSnapshot()).toMatchObject({
      focusedPaneId: rightPaneId,
      focusedRowIndex: 0,
    });
    expect(rightScene.paneById.get(rightPaneId)).toMatchObject({
      subtitle: "choose a pane type",
      surfaceKind: "empty-frame",
      title: "New frame",
      tone: "slate",
    });
    expect(rightScene.columns.findIndex((column) => column.paneIds.includes(rightPaneId))).toBe(2);

    const aboveStore = createStore();
    const abovePaneId = aboveStore.openEmptyFrameNear("workspace_pane_1", "above");
    const aboveScene = aboveStore.toScene();
    const aboveTargetColumn = requireColumnForPane(aboveScene, "workspace_pane_1");
    const aboveColumn = requireColumnForPane(aboveScene, abovePaneId);

    expect(aboveColumn.planeIndex).toBe(aboveTargetColumn.planeIndex - 1);
    expect(aboveColumn.slotIndex).toBe(aboveTargetColumn.slotIndex);
    expect(aboveScene.columns.every((column) => column.planeIndex >= 0)).toBe(true);

    const belowStore = createStore();
    const belowPaneId = belowStore.openEmptyFrameNear("workspace_pane_1", "below");
    const belowScene = belowStore.toScene();
    const belowTargetColumn = requireColumnForPane(belowScene, "workspace_pane_1");
    const belowColumn = requireColumnForPane(belowScene, belowPaneId);

    expect(belowColumn.planeIndex).toBe(belowTargetColumn.planeIndex + 1);
    expect(belowColumn.slotIndex).toBe(belowTargetColumn.slotIndex);
  });

  test("configures an empty frame into a selected pane type without moving it", () => {
    const store = createStore();
    const emptyPaneId = store.openEmptyFrame();
    const before = store.toScene().paneById.get(emptyPaneId);

    store.configurePane(emptyPaneId, {
      subtitle: "workspace browser surface",
      surfaceKind: "browser",
      title: "Browser",
      tone: "green",
    });

    const scene = store.toScene();
    const configured = scene.paneById.get(emptyPaneId);
    expect(configured).toMatchObject({
      paneId: emptyPaneId,
      sequence: before?.sequence,
      subtitle: "workspace browser surface",
      surfaceKind: "browser",
      title: "Browser",
      tone: "green",
    });
    expect(configured?.surfaceId).not.toBe(before?.surfaceId);
    expect(scene.columns[1]?.paneIds).toEqual([emptyPaneId]);
  });

  test("renames panes without changing their layout position", () => {
    const store = createStore();

    expect(store.renamePane("workspace_pane_2", "  Build logs  ")).toBe(true);

    const scene = store.toScene();
    expect(scene.paneById.get("workspace_pane_2")?.title).toBe("Build logs");
    expect(scene.columns[2]?.paneIds).toEqual(["workspace_pane_2"]);
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 2,
      focusedPaneId: "workspace_pane_2",
      focusedRowIndex: 0,
    });
  });

  test("ignores blank pane renames", () => {
    const store = createStore();
    const originalTitle = store.toScene().paneById.get("workspace_pane_2")?.title;

    expect(store.renamePane("workspace_pane_2", "   ")).toBe(false);

    expect(store.toScene().paneById.get("workspace_pane_2")?.title).toBe(originalTitle);
  });

  test("enforces pane limits when configuring an empty frame", () => {
    const store = createStore({ browser: 1 });
    const emptyPaneId = store.openEmptyFrame();

    expect(() =>
      store.configurePane(emptyPaneId, {
        surfaceKind: "browser",
        title: "Browser",
      }),
    ).toThrow("workspace pane limit reached for browser");
    expect(store.toScene().paneById.get(emptyPaneId)?.surfaceKind).toBe("empty-frame");
  });

  test("allows reconfiguring a pane that already owns a limited surface kind", () => {
    const store = createStore({ browser: 1 });
    const paneId = "workspace_pane_3";
    const before = store.toScene().paneById.get(paneId);

    expect(() =>
      store.configurePane(paneId, {
        surfaceKind: "browser",
        title: "Browser Reloaded",
      }),
    ).not.toThrow();

    const configured = store.toScene().paneById.get(paneId);
    expect(configured).toMatchObject({
      paneId,
      surfaceKind: "browser",
      title: "Browser Reloaded",
    });
    expect(configured?.surfaceId).not.toBe(before?.surfaceId);
  });

  test("preserves an easy button binding only while the pane remains an easy button", () => {
    const store = createStore();
    const easyButtonConfig = { conversationId: "conversation-1" };
    const paneId = store.openPane({
      easyButtonConfig,
      surfaceKind: "easy-button",
      title: "Topic",
    });

    store.configurePane(paneId, { title: "Renamed topic" });
    expect(store.toScene().paneById.get(paneId)?.easyButtonConfig).toEqual(easyButtonConfig);

    store.configurePane(paneId, {
      surfaceKind: "browser",
      title: "Browser",
    });
    expect(store.toScene().paneById.get(paneId)?.easyButtonConfig).toBeUndefined();
  });

  test("rejects duplicate easy button conversation bindings before layout mutation", () => {
    const store = createStore();
    const firstPaneId = store.openPane({
      easyButtonConfig: { conversationId: "conversation-1" },
      surfaceKind: "easy-button",
      title: "Topic",
    });
    const emptyPaneId = store.openEmptyFrame();
    const before = store.toScene();
    const duplicateRequest = {
      easyButtonConfig: { conversationId: "conversation-1" },
      surfaceKind: "easy-button",
      title: "Topic copy",
    } as const;

    expect(store.canOpenPane(duplicateRequest)).toBe(false);
    expect(() => store.openPane(duplicateRequest)).toThrow(
      `conversation conversation-1 is already bound to pane ${firstPaneId}`,
    );
    expect(() => store.configurePane(emptyPaneId, duplicateRequest)).toThrow(
      `conversation conversation-1 is already bound to pane ${firstPaneId}`,
    );
    expect(store.toScene()).toEqual(before);
  });

  test("rejects invalid easy button bindings before pane creation mutates layout", () => {
    const invalidRequests = [
      { surfaceKind: "easy-button", title: "Missing binding" },
      {
        easyButtonConfig: { conversationId: "" },
        surfaceKind: "easy-button",
        title: "Empty binding",
      },
      {
        easyButtonConfig: { conversationId: " conversation_1" },
        surfaceKind: "easy-button",
        title: "Whitespace binding",
      },
      {
        easyButtonConfig: { conversationId: "conversation_1" },
        surfaceKind: "empty-frame",
      },
    ] as unknown as OpenPaneRequest[];
    const store = createStore();
    const before = store.toScene();

    for (const request of invalidRequests) {
      expect(() => store.openPane(request)).toThrow();
    }

    expect(store.toScene().totalPanes).toBe(before.totalPanes);
    expect(store.toScene().columns).toEqual(before.columns);
  });

  test("rejects an invalid easy button configuration without replacing the pane", () => {
    const store = createStore();
    const emptyPaneId = store.openEmptyFrame();
    const before = store.toScene().paneById.get(emptyPaneId);
    const invalidRequest = {
      surfaceKind: "easy-button",
      title: "Missing binding",
    } as unknown as OpenPaneRequest;

    expect(() => store.configurePane(emptyPaneId, invalidRequest)).toThrow(
      "easy-button panes require an easyButtonConfig conversation binding",
    );
    expect(store.toScene().paneById.get(emptyPaneId)).toEqual(before);
  });

  test("uses the current row count inside a stacked column", () => {
    const store = createStore();
    const paneId = store.splitFocusedPane("down");

    expect(store.getSnapshot()).toMatchObject({
      focusedPaneId: paneId,
      focusedRowIndex: 1,
    });

    store.moveFocus("down");

    expect(store.getSnapshot()).toMatchObject({
      focusedPaneId: paneId,
      focusedRowIndex: 1,
    });

    store.moveFocus("up");

    expect(store.getSnapshot()).toMatchObject({
      focusedPaneId: "workspace_pane_0",
      focusedRowIndex: 0,
    });
  });

  test("clamps row focus when navigating from a stack into a shorter column", () => {
    const store = createStore();

    store.splitFocusedPane("down");
    store.moveFocus("right");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: "workspace_pane_1",
      focusedRowIndex: 0,
    });
  });

  test("moves left and right into the top pane of a vertical split column", () => {
    const store = createStore();

    store.moveFocus("right", viewport);
    const upperPaneId = store.focusedPaneId();
    const middlePaneId = store.splitFocusedPane("down");
    const lowerPaneId = store.splitFocusedPane("down");

    store.moveFocus("left", viewport);
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 0,
      focusedPaneId: "workspace_pane_0",
      focusedRowIndex: 0,
    });

    store.moveFocus("right", viewport);
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: upperPaneId,
      focusedRowIndex: 0,
      targetScrollRow: 0,
    });

    store.moveFocus("down", viewport);
    expect(store.getSnapshot()).toMatchObject({
      focusedPaneId: middlePaneId,
      targetScrollRow: 0,
    });

    store.moveFocus("down", viewport);
    expect(store.getSnapshot()).toMatchObject({
      focusedPaneId: lowerPaneId,
      targetScrollRow: 0,
    });
  });

  test("moves focus from an unfocused pane title bar target", () => {
    const store = createStore();

    expect(store.getSnapshot().focusedPaneId).toBe("workspace_pane_0");

    expect(store.moveFocusFromPane("workspace_pane_2", "right", viewport)).toBe(true);

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 3,
      focusedPaneId: "workspace_pane_3",
      focusedRowIndex: 0,
    });
  });

  test("keeps column focus navigation active while overview is open", () => {
    const store = createStore();

    store.toggleOverviewMode();
    store.moveFocus("right");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: "workspace_pane_1",
      focusedRowIndex: 0,
      presentationMode: "overview",
    });
  });

  test("keeps overview focus changes from rewriting normal scroll targets", () => {
    const store = createStore();
    store.splitFocusedPaneToPlane("down");
    const lowerPlaneSnapshot = store.getSnapshot();

    store.toggleOverviewMode();
    store.moveFocus("up", viewport);
    store.ensureFocusedPaneVisible(viewport);

    expect(store.getSnapshot()).toMatchObject({
      focusedPaneId: "workspace_pane_0",
      presentationMode: "overview",
      targetScrollColumn: lowerPlaneSnapshot.targetScrollColumn,
      targetScrollRow: lowerPlaneSnapshot.targetScrollRow,
    });
  });

  test("pans the overview surface and clamps to content bounds", () => {
    // A min card width keeps thumbnails readable (the "floor"), so a narrow
    // viewport overflows and must be pannable.
    const store = createOverflowingOverviewStore();
    const narrow: Rect = { height: 360, width: 480, x: 0, y: 0 };

    // No panning outside overview.
    expect(store.panOverviewBy(200, 200, narrow)).toBe(false);

    store.toggleOverviewMode();
    expect(store.panOverviewBy(10_000, 10_000, narrow)).toBe(true);
    expect(store.getSnapshot().overviewPanX).toBeGreaterThan(0);

    // Already at the far edge: panning further is a no-op.
    expect(store.panOverviewBy(10_000, 10_000, narrow)).toBe(false);

    // Panning back past the origin clamps at zero.
    expect(store.panOverviewBy(-10_000, -10_000, narrow)).toBe(true);
    expect(store.getSnapshot()).toMatchObject({ overviewPanX: 0, overviewPanY: 0 });
  });

  test("resets overview pan when leaving and re-entering overview", () => {
    const store = createOverflowingOverviewStore();
    const narrow: Rect = { height: 360, width: 480, x: 0, y: 0 };

    store.toggleOverviewMode();
    store.panOverviewBy(10_000, 10_000, narrow);
    expect(store.getSnapshot().overviewPanX).toBeGreaterThan(0);

    store.toggleOverviewMode();
    expect(store.getSnapshot()).toMatchObject({ overviewPanX: 0, overviewPanY: 0 });
  });

  test("overview zoom defaults to fit, resets on re-entry, and no-ops outside overview", () => {
    const { store } = createOverviewZoomFixture();
    const small: Rect = { height: 320, width: 420, x: 0, y: 0 };

    expect(store.getSnapshot().overviewZoom).toBe(1);
    expect(store.zoomOverviewBy(2, 200, 160, small)).toBe(false);

    store.toggleOverviewMode();
    expect(store.zoomOverviewBy(2, 200, 160, small)).toBe(true);
    expect(store.getSnapshot().overviewZoom).toBeGreaterThan(1);

    store.toggleOverviewMode();
    store.toggleOverviewMode();
    expect(store.getSnapshot().overviewZoom).toBe(1);
  });

  test("clamps overview zoom between the zoom-out floor and the zoom-in cap", () => {
    const { engine, store } = createOverviewZoomFixture();
    const small: Rect = { height: 320, width: 420, x: 0, y: 0 };

    store.toggleOverviewMode();
    const fit = engine.overviewContentBounds(small).scale;

    // Zooming out drops below fit (smaller than fit-all) and saturates at the floor.
    let outGuard = 0;
    while (store.zoomOverviewBy(0.5, 200, 160, small) && outGuard < 64) {
      outGuard += 1;
    }
    expect(outGuard).toBeLessThan(64);
    expect(store.getSnapshot().overviewZoom).toBeCloseTo(OVERVIEW_MIN_ZOOM, 5);
    expect(
      engine.overviewContentBounds(small, null, store.getSnapshot().overviewZoom).scale,
    ).toBeLessThan(fit);

    // Zooming back in saturates at the cap.
    let inGuard = 0;
    while (store.zoomOverviewBy(2, 200, 160, small) && inGuard < 64) {
      inGuard += 1;
    }
    expect(inGuard).toBeLessThan(64);
    const effective = engine.overviewContentBounds(
      small,
      null,
      store.getSnapshot().overviewZoom,
    ).scale;
    expect(effective).toBeCloseTo(OVERVIEW_MAX_ZOOM_SCALE, 5);
  });

  test("zooming in enables overview panning that fit-all did not allow", () => {
    const { engine, store } = createOverviewZoomFixture();
    const small: Rect = { height: 320, width: 420, x: 0, y: 0 };

    store.toggleOverviewMode();
    // Fit-all already fits this viewport, so there is no pan room.
    expect(store.panOverviewBy(10_000, 10_000, small)).toBe(false);

    // Zooming in overflows the viewport, which opens pan room.
    for (let index = 0; index < 6; index += 1) {
      store.zoomOverviewBy(2, 210, 160, small);
    }
    expect(
      engine.overviewContentBounds(small, null, store.getSnapshot().overviewZoom).maxPanX,
    ).toBeGreaterThan(0);
    expect(store.panOverviewBy(10_000, 10_000, small)).toBe(true);
    expect(store.getSnapshot().overviewPanX).toBeGreaterThan(0);
  });

  test("previews an insert frame on the exact slot and clears it on exit", () => {
    const { store } = createOverviewZoomFixture();
    const vp: Rect = { height: 720, width: 1024, x: 0, y: 0 };

    // No preview outside overview.
    expect(store.previewInsertFrame("workspace_pane_0", "right", vp)).toBe(false);

    store.toggleOverviewMode();
    expect(store.previewInsertFrame("workspace_pane_0", "right", vp)).toBe(true);
    const target = store.getSnapshot().overviewInsertPreviewTarget;
    if (!target) {
      throw new Error("expected an insert preview target");
    }
    expect(target).toMatchObject({ paneId: "workspace_pane_0", placement: "right" });
    expect(target.width).toBeGreaterThan(0);
    expect(store.hasInsertFramePreview()).toBe(true);
    expect(store.insertFramePreview()).toEqual({
      anchorPaneId: "workspace_pane_0",
      placement: "right",
    });

    // Re-previewing the same slot is a no-op.
    expect(store.previewInsertFrame("workspace_pane_0", "right", vp)).toBe(false);

    expect(store.clearInsertFramePreview()).toBe(true);
    expect(store.getSnapshot().overviewInsertPreviewTarget).toBeNull();
    expect(store.hasInsertFramePreview()).toBe(false);

    // Leaving overview drops any active preview.
    store.previewInsertFrame("workspace_pane_0", "below", vp);
    store.toggleOverviewMode();
    expect(store.hasInsertFramePreview()).toBe(false);
    expect(store.getSnapshot().overviewInsertPreviewTarget).toBeNull();
  });

  test("zoom keeps the surface point under the cursor fixed", () => {
    // A benchmark scene overflows comfortably even at fit, so the focal-preserving
    // pan lands strictly inside the bounds (not clamped) and is testable exactly.
    const { engine, store } = createBenchmarkOverviewFixture();
    const vp: Rect = { height: 720, width: 1024, x: 0, y: 0 };
    const focalX = 700;
    const focalY = 500;

    store.toggleOverviewMode();
    const before = engine.overviewContentBounds(vp, null, store.getSnapshot().overviewZoom);
    // The niri-style benchmark scene overflows horizontally (the scroll axis).
    expect(before.maxPanX).toBeGreaterThan(0);
    const start = store.getSnapshot();
    const surfaceXBefore = (focalX - (before.baseXOffset - start.overviewPanX)) / before.scale;

    expect(store.zoomOverviewBy(1.5, focalX, focalY, vp)).toBe(true);

    const end = store.getSnapshot();
    const after = engine.overviewContentBounds(vp, null, end.overviewZoom);
    const surfaceXAfter = (focalX - (after.baseXOffset - end.overviewPanX)) / after.scale;

    // Horizontal pan stayed strictly within bounds, so the focal point is preserved.
    expect(end.overviewPanX).toBeGreaterThan(0);
    expect(end.overviewPanX).toBeLessThan(after.maxPanX);
    expect(surfaceXAfter).toBeCloseTo(surfaceXBefore, 1);
    // The content fits vertically, so the vertical pan stays pinned at the origin.
    expect(end.overviewPanY).toBe(0);
  });

  test("animates overview progress toward the selected presentation mode", () => {
    const store = createStore();

    expect(store.getSnapshot()).toMatchObject({
      overviewProgress: 0,
      presentationMode: "normal",
    });

    store.toggleOverviewMode();

    expect(store.getSnapshot()).toMatchObject({
      overviewProgress: 0,
      presentationMode: "overview",
    });
    expect(store.advanceFrame(70)).toBe("moving");
    expect(store.getSnapshot().overviewProgress).toBeGreaterThan(0);
    expect(store.getSnapshot().overviewProgress).toBeLessThan(1);

    store.advanceFrame(1000);
    expect(store.getSnapshot().overviewProgress).toBeGreaterThan(0);
    expect(store.getSnapshot().overviewProgress).toBeLessThan(1);

    for (let index = 0; index < 80; index += 1) {
      store.advanceFrame(16);
    }
    expect(store.getSnapshot()).toMatchObject({
      overviewProgress: 1,
      presentationMode: "overview",
    });

    store.toggleOverviewMode();
    expect(store.advanceFrame(70)).toBe("moving");
    expect(store.getSnapshot().overviewProgress).toBeGreaterThan(0);
    expect(store.getSnapshot().overviewProgress).toBeLessThan(1);
  });

  test("constructs at the initial focused pane without a startup scroll animation", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    const { scene } = createLayoutStoreTestScene("setta:workspace-layout:store-initial-snap");
    const store = new WorkspaceLayoutStore(
      new WorkspaceLikeLayoutEngine(scene),
      scene,
      "workspace_pane_3",
    );

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 3,
      focusedPaneId: "workspace_pane_3",
      scrollColumn: 3,
      targetScrollColumn: 3,
    });
  });

  test("focuses explicit pane ids for overview selection", () => {
    const store = createStore();

    store.toggleOverviewMode();

    expect(store.focusPane("workspace_pane_2")).toBe(true);
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 2,
      focusedPaneId: "workspace_pane_2",
      presentationMode: "overview",
    });
    expect(store.focusPane("missing")).toBe(false);
  });

  test("focuses pane ids without reveal while preserving scroll targets", () => {
    const store = createStore();
    const revealingStore = createStore();
    store.scrollToColumn(1);
    store.snapScrollToTarget();
    revealingStore.scrollToColumn(1);
    revealingStore.snapScrollToTarget();
    const before = store.getSnapshot();

    expect(revealingStore.focusPane("workspace_pane_3")).toBe(true);
    expect(store.focusPaneWithoutReveal("workspace_pane_3")).toBe(true);

    expect(focusState(store.getSnapshot())).toEqual(focusState(revealingStore.getSnapshot()));
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 3,
      focusedPaneId: "workspace_pane_3",
      scrollColumn: before.scrollColumn,
      scrollRow: before.scrollRow,
      targetScrollColumn: before.targetScrollColumn,
      targetScrollRow: before.targetScrollRow,
    });
    store.ensureFocusedPaneVisible(viewport);
    expect(store.getSnapshot()).toMatchObject({
      scrollColumn: before.scrollColumn,
      scrollRow: before.scrollRow,
      targetScrollColumn: before.targetScrollColumn,
      targetScrollRow: before.targetScrollRow,
    });
    expect(store.advanceFrame(16)).toBe("idle");

    expect(store.focusPane("workspace_pane_3")).toBe(true);
    store.ensureFocusedPaneVisible(viewport);
    expect(store.getSnapshot()).toMatchObject({
      targetScrollColumn: 3,
    });
    expect(store.focusPaneWithoutReveal("missing")).toBe(false);
  });

  test("focuses every pane id without reveal in a multi-plane layout", () => {
    const store = createStore();
    store.focusPane("workspace_pane_1");
    const lowerPlanePaneId = store.splitFocusedPaneToPlane("down");
    store.focusPane("workspace_pane_0");
    store.splitFocusedPane("down");
    const paneIds = store.toScene().panes.map((pane) => pane.paneId);
    expect(paneIds).toContain(lowerPlanePaneId);

    for (const paneId of paneIds) {
      expect(store.focusPaneWithoutReveal(paneId)).toBe(true);
      expect(store.getSnapshot().focusedPaneId).toBe(paneId);
    }
  });

  test("continues an existing reveal animation after focus without reveal", () => {
    const store = createStore();

    expect(store.focusPane("workspace_pane_3")).toBe(true);
    const inFlightReveal = store.getSnapshot();
    expect(inFlightReveal.scrollColumn).toBe(0);
    expect(inFlightReveal.targetScrollColumn).toBe(3);

    expect(store.focusPaneWithoutReveal("workspace_pane_1")).toBe(true);
    const afterFocus = store.getSnapshot();
    expect(afterFocus).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: "workspace_pane_1",
      scrollColumn: inFlightReveal.scrollColumn,
      targetScrollColumn: inFlightReveal.targetScrollColumn,
      targetScrollRow: inFlightReveal.targetScrollRow,
    });

    let movement: "idle" | "moving" = "moving";
    for (let frame = 0; frame < 100 && movement === "moving"; frame += 1) {
      store.ensureFocusedPaneVisible(viewport);
      movement = store.advanceFrame(16);
    }

    expect(movement).toBe("idle");
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: "workspace_pane_1",
      scrollColumn: inFlightReveal.targetScrollColumn,
      targetScrollColumn: inFlightReveal.targetScrollColumn,
      targetScrollRow: inFlightReveal.targetScrollRow,
    });
  });

  test("focuses across columns without reveal after revealed focus", () => {
    const store = createStore();

    expect(store.focusPane("workspace_pane_3")).toBe(true);
    const afterRevealedFocus = store.getSnapshot();

    expect(store.focusPaneWithoutReveal("workspace_pane_1")).toBe(true);

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: "workspace_pane_1",
      scrollColumn: afterRevealedFocus.scrollColumn,
      scrollRow: afterRevealedFocus.scrollRow,
      targetScrollColumn: afterRevealedFocus.targetScrollColumn,
      targetScrollRow: afterRevealedFocus.targetScrollRow,
    });
  });

  test("reorders panes inside the same stacked column", () => {
    const store = createStore();
    const lowerPaneId = store.splitFocusedPane("down");

    expect(
      store.applyPaneDropIntent(lowerPaneId, {
        kind: "row",
        placement: "before",
        targetPaneId: "workspace_pane_0",
      }),
    ).toBe(true);

    expect(store.toScene().columns[0]?.paneIds).toEqual([lowerPaneId, "workspace_pane_0"]);
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 0,
      focusedPaneId: lowerPaneId,
      focusedRowIndex: 0,
    });
  });

  test("commits an after-placement row drop once", () => {
    const store = createStore();
    const lowerPaneId = store.splitFocusedPane("down");
    const revisionBeforeDrop = store.getSnapshot().revision;

    expect(
      store.applyPaneDropIntent("workspace_pane_0", {
        kind: "row",
        placement: "after",
        targetPaneId: lowerPaneId,
      }),
    ).toBe(true);

    expect(store.toScene().columns[0]?.paneIds).toEqual([lowerPaneId, "workspace_pane_0"]);
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 0,
      focusedPaneId: "workspace_pane_0",
      focusedRowIndex: 1,
      revision: revisionBeforeDrop + 1,
    });
  });

  test("skips no-op row drops without bumping revision", () => {
    const store = createStore();
    const lowerPaneId = store.splitFocusedPane("down");
    const revisionBeforeDrop = store.getSnapshot().revision;

    expect(
      store.applyPaneDropIntent(lowerPaneId, {
        kind: "row",
        placement: "after",
        targetPaneId: "workspace_pane_0",
      }),
    ).toBe(false);

    expect(store.toScene().columns[0]?.paneIds).toEqual(["workspace_pane_0", lowerPaneId]);
    expect(store.getSnapshot().revision).toBe(revisionBeforeDrop);
  });

  test("skips drop onto self without bumping revision", () => {
    const store = createStore();
    const revisionBeforeDrop = store.getSnapshot().revision;

    expect(
      store.applyPaneDropIntent("workspace_pane_0", {
        kind: "row",
        placement: "after",
        targetPaneId: "workspace_pane_0",
      }),
    ).toBe(false);

    expect(store.getSnapshot().revision).toBe(revisionBeforeDrop);
  });

  test("skips no-op column drops without bumping revision", () => {
    const store = createStore();
    const sourceColumn = requireColumnForPane(store.toScene(), "workspace_pane_0");
    const targetColumn = requireColumnForPane(store.toScene(), "workspace_pane_1");
    const revisionBeforeDrop = store.getSnapshot().revision;

    expect(
      store.applyPaneDropIntent("workspace_pane_0", {
        kind: "column",
        planeIndex: targetColumn.planeIndex,
        slotPlacement: "before",
        targetColumnId: targetColumn.columnId,
      }),
    ).toBe(false);

    expect(requireColumnForPane(store.toScene(), "workspace_pane_0").columnId).toBe(
      sourceColumn.columnId,
    );
    expect(store.getSnapshot().revision).toBe(revisionBeforeDrop);
  });

  test("bounds preview notifications to changed drag intents", () => {
    const store = createStore();
    const revisions: number[] = [];
    store.subscribe((snapshot) => {
      revisions.push(snapshot.revision);
    });

    expect(
      store.previewPaneDropIntent("workspace_pane_0", {
        kind: "row",
        placement: "before",
        targetPaneId: "workspace_pane_1",
      }),
    ).toBe(true);
    expect(
      store.previewPaneDropIntent("workspace_pane_0", {
        kind: "row",
        placement: "before",
        targetPaneId: "workspace_pane_1",
      }),
    ).toBe(false);
    expect(
      store.previewPaneDropIntent("workspace_pane_0", {
        kind: "column",
        planeIndex: 0,
        slotPlacement: "after",
        targetColumnId: "workspace_column_1",
      }),
    ).toBe(true);
    expect(store.clearPaneDropPreview()).toBe(true);
    expect(store.clearPaneDropPreview()).toBe(false);

    expect(revisions).toEqual([1, 2, 3]);
  });

  test("focuses an existing surface by kind", () => {
    const store = createStore();

    expect(store.focusPaneBySurfaceKind("browser")).toBe("workspace_pane_3");
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 3,
      focusedPaneId: "workspace_pane_3",
      focusedRowIndex: 0,
    });
  });

  test("resets the focused column to its ideal original width", () => {
    const store = createStore();
    const focusedColumnId = store.focusedColumnId();

    store.resizeColumn(focusedColumnId, { unit: "px", value: 680 });
    expect(store.toScene().columns[0]?.widthSpec).toEqual({ unit: "px", value: 680 });

    store.resetFocusedColumnWidth();

    expect(store.toScene().columns[0]?.widthSpec).toEqual({ unit: "px", value: 520 });
  });

  test("resizes only the column that owns the targeted pane", () => {
    const store = createStore();

    expect(store.resizePaneColumn("workspace_pane_1", { unit: "px", value: 680 })).toBe(
      "workspace_column_1",
    );

    expect(store.toScene().columns.map((column) => column.widthSpec)).toEqual([
      { unit: "px", value: 520 },
      { unit: "px", value: 680 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
    ]);
  });

  test("resizes same-slot columns across vertical planes", () => {
    const store = createStore();
    const lowerPaneId = store.splitFocusedPaneToPlane("down");
    const lowerColumn = requireColumnForPane(store.toScene(), lowerPaneId);

    expect(store.resizePaneColumn(lowerPaneId, { unit: "px", value: 680 })).toBe(
      lowerColumn.columnId,
    );

    const scene = store.toScene();
    expect(requireColumnForPane(scene, "workspace_pane_0").widthSpec).toEqual({
      unit: "px",
      value: 680,
    });
    expect(requireColumnForPane(scene, lowerPaneId).widthSpec).toEqual({
      unit: "px",
      value: 680,
    });
  });

  test("manual horizontal resize previews movement and commits once", () => {
    const store = createStore();
    const revisions: number[] = [];
    store.subscribe((snapshot) => {
      revisions.push(snapshot.revision);
    });
    const session = {
      axis: "horizontal",
      columnId: "workspace_column_0",
      pointerId: 1,
      startClientX: 500,
      startWidth: 520,
    } satisfies PaneResizeSession;

    expect(paneResizePreviewForPointerMove(session, { clientX: 0, clientY: 0 })).toEqual({
      axis: "horizontal",
      width: minimumColumnWidth,
    });
    expect(store.toScene().columns[0]?.widthSpec).toEqual({ unit: "px", value: 520 });
    expect(revisions).toEqual([]);

    expect(commitPaneResize(store, session, { clientX: 0, clientY: 0 })).toBe(true);

    expect(store.toScene().columns[0]?.widthSpec).toEqual({
      unit: "px",
      value: minimumColumnWidth,
    });
    expect(revisions).toEqual([1]);
  });

  test("resizes adjacent panes inside a vertical split", () => {
    const store = createStore();
    const lowerPaneId = store.splitFocusedPane("down");

    expect(store.resizePaneSplit("workspace_pane_0", lowerPaneId, 1.45, 0.55)).toBe(true);

    const panes = store.toScene().paneById;
    expect(panes.get("workspace_pane_0")?.weight).toBe(1.45);
    expect(panes.get(lowerPaneId)?.weight).toBe(0.55);
    expect(store.resizePaneSplit(lowerPaneId, "workspace_pane_0", 1, 1)).toBe(false);
  });

  test("manual pane height resize previews movement and commits the row once", () => {
    const store = createStore();
    const lowerPaneId = store.splitFocusedPane("down");
    expect(store.toScene().paneById.get("workspace_pane_0")?.heightPx).toBeUndefined();
    const startRevision = store.getSnapshot().revision;
    const revisions: number[] = [];
    store.subscribe((snapshot) => {
      revisions.push(snapshot.revision);
    });
    const session = {
      axis: "height",
      paneId: "workspace_pane_0",
      pointerId: 1,
      startBottom: 400,
      startClientY: 200,
      startDesignatedHeight: null,
      startHeight: 200,
      viewportBottom: 900,
      viewportHeight: 900,
    } satisfies PaneResizeSession;

    expect(paneResizePreviewForPointerMove(session, { clientX: 0, clientY: 260 })).toEqual({
      axis: "height",
      height: 260,
      heightPx: 260,
    });
    expect(revisions).toEqual([]);

    expect(commitPaneResize(store, session, { clientX: 0, clientY: 260 })).toBe(true);

    const panes = store.toScene().paneById;
    for (const paneId of [
      "workspace_pane_0",
      "workspace_pane_1",
      "workspace_pane_2",
      "workspace_pane_3",
    ]) {
      expect(panes.get(paneId)?.heightPx).toBe(260);
    }
    expect(panes.get(lowerPaneId)?.heightPx).toBeUndefined();
    expect(revisions).toEqual([startRevision + 1]);
  });

  test("manual pane height resize snaps back to viewport height defaults", () => {
    const store = createStore();
    store.resizePaneRow("workspace_pane_0", 480);
    const session = {
      axis: "height",
      paneId: "workspace_pane_0",
      pointerId: 1,
      startBottom: 480,
      startClientY: 100,
      startDesignatedHeight: 480,
      startHeight: 480,
      viewportBottom: 900,
      viewportHeight: 900,
    } satisfies PaneResizeSession;

    expect(paneResizePreviewForPointerMove(session, { clientX: 0, clientY: 520 })).toEqual({
      axis: "height",
      height: 900,
      heightPx: null,
    });

    expect(commitPaneResize(store, session, { clientX: 0, clientY: 520 })).toBe(true);

    const panes = store.toScene().paneById;
    for (const paneId of [
      "workspace_pane_0",
      "workspace_pane_1",
      "workspace_pane_2",
      "workspace_pane_3",
    ]) {
      expect(panes.get(paneId)?.heightPx).toBeUndefined();
    }
  });

  test("tracks maximized pane state without applying it to the next focused pane", () => {
    const store = createStore();

    store.togglePaneMaximized("workspace_pane_1");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: "workspace_pane_1",
      maximizedPaneId: "workspace_pane_1",
    });

    store.moveFocus("right");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 2,
      focusedPaneId: "workspace_pane_2",
      maximizedPaneId: "workspace_pane_1",
    });
  });

  test("clears maximized state when the maximized pane is closed", () => {
    const store = createStore();

    store.togglePaneMaximized("workspace_pane_0");
    store.closeFocusedPane();

    expect(store.getSnapshot().maximizedPaneId).toBeNull();
  });
});

function createStore(paneLimits?: PaneLimitPolicy): WorkspaceLayoutStore {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  const { focusedPaneId, scene } = createLayoutStoreTestScene("setta:workspace-layout:store-test");
  return new WorkspaceLayoutStore(new WorkspaceLikeLayoutEngine(scene), scene, focusedPaneId, {
    paneLimits,
  });
}

function focusState(snapshot: ReturnType<WorkspaceLayoutStore["getSnapshot"]>) {
  return {
    focusedColumnIndex: snapshot.focusedColumnIndex,
    focusedPaneId: snapshot.focusedPaneId,
    focusedRowIndex: snapshot.focusedRowIndex,
  };
}

function createOverviewZoomFixture(): {
  engine: WorkspaceLikeLayoutEngine;
  store: WorkspaceLayoutStore;
} {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  const { focusedPaneId, scene } = createLayoutStoreTestScene(
    "setta:workspace-layout:store-overview-zoom",
  );
  const engine = new WorkspaceLikeLayoutEngine(scene);
  const store = new WorkspaceLayoutStore(engine, scene, focusedPaneId);
  return { engine, store };
}

function createBenchmarkOverviewFixture(): {
  engine: WorkspaceLikeLayoutEngine;
  store: WorkspaceLayoutStore;
} {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  const scene = generateBenchmarkScene();
  const engine = new WorkspaceLikeLayoutEngine(scene);
  const store = new WorkspaceLayoutStore(engine, scene, scene.panes[0]?.paneId);
  return { engine, store };
}

function createOverflowingOverviewStore(): WorkspaceLayoutStore {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  const { focusedPaneId, scene } = createLayoutStoreTestScene(
    "setta:workspace-layout:store-overview-pan",
  );
  return new WorkspaceLayoutStore(
    new WorkspaceLikeLayoutEngine(scene, { overviewCardMinWidthPx: 360 }),
    scene,
    focusedPaneId,
  );
}

function createLayoutStoreTestScene(workspaceId: string) {
  return createWorkspaceLayoutTestScene({
    storedLayout: null,
    workspaceId,
    workspaceName: "Repo",
  });
}

function columnForPane(scene: WorkspaceScene, paneId: string): WorkspaceColumn | undefined {
  return scene.columns.find((column) => column.paneIds.includes(paneId));
}

function requireColumnForPane(scene: WorkspaceScene, paneId: string): WorkspaceColumn {
  const column = columnForPane(scene, paneId);
  if (!column) {
    throw new Error(`column for pane ${paneId} was not found`);
  }
  return column;
}
