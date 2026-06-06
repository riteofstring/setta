import { afterEach, describe, expect, test } from "vitest";

import { NiriLikeLayoutEngine } from "./layout-engine";
import { NiriLayoutStore } from "./layout-store";
import { createRealWorkspaceScene } from "./workspace-scene";

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

    store.openPane({ title: "Logs" });

    expect(store.getSnapshot()).not.toBe(firstSnapshot);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
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

function createStore(): NiriLayoutStore {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  const { focusedPaneId, scene } = createRealWorkspaceScene({
    storageKey: "setta:niri-workspace:store-test",
    workspaceName: "Repo",
  });
  return new NiriLayoutStore(new NiriLikeLayoutEngine(scene), scene, focusedPaneId);
}
