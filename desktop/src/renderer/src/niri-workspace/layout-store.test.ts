import { afterEach, describe, expect, test } from "vitest";

import { NiriLikeLayoutEngine } from "./layout-engine";
import { NiriLayoutStore } from "./layout-store";
import type { PaneLimitPolicy, Rect } from "./types";
import { createRealWorkspaceScene } from "./workspace-scene";

const viewport: Rect = {
  height: 900,
  width: 1200,
  x: 0,
  y: 0,
};

describe("niri layout store", () => {
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
    expect(store.toScene().totalPanes).toBe(7);
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
    expect(afterSplit.totalPanes).toBe(7);
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
    const browserPaneId = store.focusedPaneId();
    store.moveFocusedPane("left");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 0,
      focusedPaneId: browserPaneId,
      focusedRowIndex: 1,
    });
    expect(store.toScene().columns[0]?.paneIds).toEqual(["workspace_pane_0", browserPaneId]);
    expect(store.toScene().columns[1]?.paneIds).toEqual(["workspace_pane_2"]);

    store.moveFocusedPane("right");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: browserPaneId,
      focusedRowIndex: 1,
    });
    expect(store.toScene().columns[0]?.paneIds).toEqual(["workspace_pane_0"]);
    expect(store.toScene().columns[1]?.paneIds).toEqual(["workspace_pane_2", browserPaneId]);
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
    expect(store.toScene().totalPanes).toBe(6);
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
      "niri pane limit reached for settings-dom",
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

  test("configures an empty frame into a selected pane type without moving it", () => {
    const store = createStore();
    const emptyPaneId = store.openEmptyFrame();
    const before = store.toScene().paneById.get(emptyPaneId);

    store.configurePane(emptyPaneId, {
      subtitle: "native browser proxy",
      surfaceKind: "browser",
      title: "Browser",
      tone: "orange",
    });

    const scene = store.toScene();
    const configured = scene.paneById.get(emptyPaneId);
    expect(configured).toMatchObject({
      paneId: emptyPaneId,
      sequence: before?.sequence,
      subtitle: "native browser proxy",
      surfaceKind: "browser",
      title: "Browser",
      tone: "orange",
    });
    expect(configured?.surfaceId).not.toBe(before?.surfaceId);
    expect(scene.columns[1]?.paneIds).toEqual([emptyPaneId]);
  });

  test("enforces pane limits when configuring an empty frame", () => {
    const store = createStore({ "settings-dom": 1 });
    const emptyPaneId = store.openEmptyFrame();

    expect(() =>
      store.configurePane(emptyPaneId, {
        surfaceKind: "settings-dom",
        title: "Settings",
      }),
    ).toThrow("niri pane limit reached for settings-dom");
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

  test("moves left and right to the nearest pane in visual vertical order", () => {
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
      focusedPaneId: middlePaneId,
      focusedRowIndex: 1,
    });

    store.moveFocus("up", viewport);
    expect(store.getSnapshot().focusedPaneId).toBe(upperPaneId);

    store.moveFocus("down", viewport);
    store.moveFocus("down", viewport);
    expect(store.getSnapshot().focusedPaneId).toBe(lowerPaneId);
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
      storageKey: "setta:niri-workspace:store-initial-snap",
      workspaceName: "Repo",
    });
    const store = new NiriLayoutStore(new NiriLikeLayoutEngine(scene), scene, "workspace_pane_4");

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 4,
      focusedPaneId: "workspace_pane_4",
      scrollColumn: 4,
      targetScrollColumn: 4,
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

  test("reorders columns by dragging a pane before an overview target", () => {
    const store = createStore();

    expect(store.reorderPaneBefore("workspace_pane_4", "workspace_pane_1")).toBe(true);

    expect(store.toScene().columns.map((column) => column.paneIds[0])).toEqual([
      "workspace_pane_0",
      "workspace_pane_4",
      "workspace_pane_1",
      "workspace_pane_2",
      "workspace_pane_3",
      "workspace_pane_5",
    ]);
    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: "workspace_pane_4",
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
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
    ]);
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

function createStore(paneLimits?: PaneLimitPolicy): NiriLayoutStore {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  const { focusedPaneId, scene } = createRealWorkspaceScene({
    storageKey: "setta:niri-workspace:store-test",
    workspaceName: "Repo",
  });
  return new NiriLayoutStore(new NiriLikeLayoutEngine(scene), scene, focusedPaneId, {
    paneLimits,
  });
}
