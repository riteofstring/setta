import { afterEach, describe, expect, test } from "vitest";

import { NiriLikeLayoutEngine } from "./layout-engine";
import { NiriLayoutStore } from "./layout-store";
import {
  createRealWorkspaceScene,
  defaultRealWorkspacePaneLimits,
  persistRealWorkspaceScene,
} from "./workspace-scene";

describe("real niri workspace scene", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("creates the default real workspace when no stored layout exists", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });

    const result = createRealWorkspaceScene({
      storageKey: "setta:niri-workspace:test",
      workspaceName: "Repo",
    });

    expect(result.focusedPaneId).toBe("workspace_pane_0");
    expect(result.scene.id).toBe("setta:niri-workspace:test");
    expect(result.scene.columns).toHaveLength(6);
    expect(result.scene.defaultColumnWidthSpec).toEqual({ unit: "px", value: 520 });
    expect(result.scene.renderOverscanColumns).toBe(2);
    expect(result.scene.visibleColumnCount).toBe(3);
    expect(result.scene.totalPanes).toBe(6);
    expect(result.scene.columns.every((column) => column.paneIds.length === 1)).toBe(true);
    expect(result.scene.columns.map((column) => column.widthSpec)).toEqual([
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
    ]);
    expect(result.scene.columns.map((column) => column.idealWidthSpec)).toEqual([
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
      { unit: "px", value: 520 },
    ]);
    expect(
      result.scene.columns.map((column) => {
        const paneId = column.paneIds[0];
        return paneId ? result.scene.paneById.get(paneId)?.title : "";
      }),
    ).toEqual(["Chat", "Browser", "Terminal", "Settings", "Git Graph", "Canvas"]);
    expect(result.scene.paneById.get("workspace_pane_0")).toMatchObject({
      subtitle: "Repo",
      surfaceKind: "chat-dom",
      title: "Chat",
    });
    expect(result.scene.paneById.get("workspace_pane_1")?.surfaceKind).toBe("browser");
  });

  test("defines default pane limits for addable real workspace surfaces", () => {
    expect(defaultRealWorkspacePaneLimits).toEqual({
      browser: 10,
      "chat-dom": 10,
      "git-graph": 1,
      "pixi-canvas": 10,
      "settings-dom": 1,
      terminal: 10,
    });
  });

  test("persists and restores the real workspace layout", () => {
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    const storageKey = "setta:niri-workspace:repo";
    const initial = createRealWorkspaceScene({
      storageKey,
      workspaceName: "Repo",
    });
    const engine = new NiriLikeLayoutEngine(initial.scene);
    const store = new NiriLayoutStore(engine, initial.scene, initial.focusedPaneId);
    const paneId = store.openPane({
      surfaceKind: "terminal",
      title: "Build",
      tone: "green",
    });

    persistRealWorkspaceScene(storageKey, store.toScene(), store.focusedPaneId());

    const restored = createRealWorkspaceScene({
      storageKey,
      workspaceName: "Ignored after restore",
    });

    expect(restored.focusedPaneId).toBe(paneId);
    expect(restored.scene.totalPanes).toBe(7);
    expect(restored.scene.columns).toHaveLength(7);
    expect(restored.scene.paneById.get(paneId)).toMatchObject({
      surfaceKind: "terminal",
      title: "Build",
      tone: "green",
    });
    expect(restored.scene.columns[1]?.paneIds).toEqual([paneId]);
    expect(restored.scene.columns.every((column) => column.paneIds.length === 1)).toBe(true);
  });
});

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return [...entries.keys()][index] ?? null;
    },
    get length() {
      return entries.size;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
}
