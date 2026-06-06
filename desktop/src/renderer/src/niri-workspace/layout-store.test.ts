import { afterEach, describe, expect, test } from "vitest";

import { NiriLikeLayoutEngine } from "./layout-engine";
import { NiriLayoutStore } from "./layout-store";
import { createRealWorkspaceScene } from "./workspace-scene";

describe("niri layout store", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("opens, splits, moves, and closes panes against the real workspace layout", () => {
    const store = createStore();

    const openedPaneId = store.openPane({
      surfaceKind: "terminal",
      title: "Build",
      tone: "green",
    });

    expect(store.getSnapshot().focusedPaneId).toBe(openedPaneId);
    expect(store.toScene().totalPanes).toBe(7);
    expect(store.toScene().columns[0]?.paneIds).toContain(openedPaneId);

    const splitPaneId = store.splitFocusedPane("right");
    const afterSplit = store.toScene();

    expect(store.getSnapshot()).toMatchObject({
      focusedColumnIndex: 1,
      focusedPaneId: splitPaneId,
      focusedRowIndex: 0,
    });
    expect(afterSplit.totalPanes).toBe(8);
    expect(afterSplit.columns[1]?.paneIds).toEqual([splitPaneId]);

    store.moveFocusedPane("left");

    expect(store.getSnapshot().focusedPaneId).toBe(splitPaneId);
    expect(store.toScene().columns[0]?.paneIds).toContain(splitPaneId);

    expect(store.closeFocusedPane()).toBe(splitPaneId);
    expect(store.toScene().paneById.has(splitPaneId)).toBe(false);
    expect(store.toScene().totalPanes).toBe(7);
  });

  test("keeps snapshots stable until layout state changes", () => {
    const store = createStore();
    const firstSnapshot = store.getSnapshot();

    expect(store.getSnapshot()).toBe(firstSnapshot);

    store.openPane({ title: "Logs" });

    expect(store.getSnapshot()).not.toBe(firstSnapshot);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  test("uses the current row count after opening panes in a column", () => {
    const store = createStore();
    const paneId = store.openPane({ title: "Third row" });

    expect(store.getSnapshot()).toMatchObject({
      focusedPaneId: paneId,
      focusedRowIndex: 2,
    });

    store.moveFocus("down");

    expect(store.getSnapshot()).toMatchObject({
      focusedPaneId: paneId,
      focusedRowIndex: 2,
    });

    store.moveFocus("up");

    expect(store.getSnapshot().focusedRowIndex).toBe(1);
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
