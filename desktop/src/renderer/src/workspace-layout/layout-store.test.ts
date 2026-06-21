import { afterEach, describe, expect, test } from "vitest";

import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import { minimumColumnWidth } from "./layout-engine-helpers";
import { WorkspaceLayoutStore } from "./layout-store";
import {
  commitPaneResize,
  paneResizePreviewForPointerMove,
  type PaneResizeSession,
} from "./pane-resize-session";
import type { WorkspaceColumn, WorkspaceScene, PaneLimitPolicy, Rect } from "./types";
import { createRealWorkspaceScene } from "./workspace-scene";

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
      surfaceKind: "terminal",
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
    const terminalPaneId = store.focusedPaneId();
    store.moveFocusedPane("left");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 0,
      focusedPaneId: terminalPaneId,
      focusedRowIndex: 1,
    });
    expect(store.toScene().columns[0]?.paneIds).toEqual(["workspace_pane_0", terminalPaneId]);
    expect(store.toScene().columns[1]?.paneIds).toEqual(["workspace_pane_2"]);

    store.moveFocusedPane("right");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: terminalPaneId,
      focusedRowIndex: 1,
    });
    expect(store.toScene().columns[0]?.paneIds).toEqual(["workspace_pane_0"]);
    expect(store.toScene().columns[1]?.paneIds).toEqual(["workspace_pane_2", terminalPaneId]);
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
    const store = createStore({
      "chat-dom": 10,
      "settings-dom": 1,
    });

    expect(store.paneLimitState({ surfaceKind: "settings-dom" })).toEqual({
      allowed: false,
      count: 1,
      limit: 1,
      surfaceKind: "settings-dom",
    });
    expect(store.canOpenPane({ surfaceKind: "settings-dom" })).toBe(false);
    expect(() => store.openPane({ surfaceKind: "settings-dom", title: "Settings" })).toThrow(
      "workspace pane limit reached for settings-dom",
    );

    expect(store.canOpenPane({ surfaceKind: "chat-dom" })).toBe(true);
    for (let index = 1; index < 10; index += 1) {
      store.openPane({ surfaceKind: "chat-dom", title: `Chat ${index}` });
    }
    expect(store.paneLimitState({ surfaceKind: "chat-dom" })).toEqual({
      allowed: false,
      count: 10,
      limit: 10,
      surfaceKind: "chat-dom",
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
      subtitle: "workspace command surface",
      surfaceKind: "terminal",
      title: "Terminal",
      tone: "green",
    });

    const scene = store.toScene();
    const configured = scene.paneById.get(emptyPaneId);
    expect(configured).toMatchObject({
      paneId: emptyPaneId,
      sequence: before?.sequence,
      subtitle: "workspace command surface",
      surfaceKind: "terminal",
      title: "Terminal",
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
    const store = createStore({ "settings-dom": 1 });
    const emptyPaneId = store.openEmptyFrame();

    expect(() =>
      store.configurePane(emptyPaneId, {
        surfaceKind: "settings-dom",
        title: "Settings",
      }),
    ).toThrow("workspace pane limit reached for settings-dom");
    expect(store.toScene().paneById.get(emptyPaneId)?.surfaceKind).toBe("empty-frame");
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
    const { scene } = createRealWorkspaceScene({
      storedLayout: null,
      workspaceId: "setta:workspace-layout:store-initial-snap",
      workspaceName: "Repo",
    });
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

  test("drops a pane before a target row through the legacy reorder wrapper", () => {
    const store = createStore();

    expect(store.reorderPaneBefore("workspace_pane_3", "workspace_pane_1")).toBe(true);

    expect(requireColumnForPane(store.toScene(), "workspace_pane_1").paneIds).toEqual([
      "workspace_pane_3",
      "workspace_pane_1",
    ]);
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: "workspace_pane_3",
      focusedRowIndex: 0,
    });
  });

  test("reorders panes inside the same stacked column", () => {
    const store = createStore();
    const lowerPaneId = store.splitFocusedPane("down");

    expect(store.reorderPaneBefore(lowerPaneId, "workspace_pane_0")).toBe(true);

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

  test("focuses an existing surface by kind for sidebar entry points", () => {
    const store = createStore();

    expect(store.focusPaneBySurfaceKind("settings-dom")).toBe("workspace_pane_3");
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
  const { focusedPaneId, scene } = createRealWorkspaceScene({
    storedLayout: null,
    workspaceId: "setta:workspace-layout:store-test",
    workspaceName: "Repo",
  });
  return new WorkspaceLayoutStore(new WorkspaceLikeLayoutEngine(scene), scene, focusedPaneId, {
    paneLimits,
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
