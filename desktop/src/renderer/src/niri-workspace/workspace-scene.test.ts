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
    expect(result.scene.columns.map((column) => column.slotIndex)).toEqual([0, 1, 2, 3, 4, 5]);
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
    ).toEqual(["Chat", "Browser", "Terminal", "Settings", "Git Graph", "Workflow Graph"]);
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

  test("drops stored columns that reference missing pane metadata", () => {
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    const storageKey = "setta:niri-workspace:corrupt";
    storage.setItem(
      storageKey,
      JSON.stringify({
        columns: [
          storedColumn("workspace_column_0", ["workspace_pane_0"]),
          storedColumn("missing_column", ["missing_pane"]),
        ],
        focusedPaneId: "missing_pane",
        panes: [
          {
            columnId: "stale_column",
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
        ],
        version: 4,
      }),
    );

    const restored = createRealWorkspaceScene({
      storageKey,
      workspaceName: "Ignored after restore",
    });

    expect(restored.focusedPaneId).toBe("workspace_pane_0");
    expect(restored.scene.columns).toHaveLength(1);
    expect(restored.scene.columns[0]?.paneIds).toEqual(["workspace_pane_0"]);
    expect(restored.scene.paneById.has("missing_pane")).toBe(false);
    expect(restored.scene.paneById.get("workspace_pane_0")?.columnId).toBe("workspace_column_0");
  });

  test("deduplicates restored surface ids before creating presentation adapters", () => {
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    const storageKey = "setta:niri-workspace:duplicate-surfaces";
    storage.setItem(
      storageKey,
      JSON.stringify({
        columns: [
          storedColumn("workspace_column_0", ["workspace_pane_0"]),
          storedColumn("workspace_column_1", ["workspace_pane_1"]),
        ],
        focusedPaneId: "workspace_pane_1",
        panes: [
          storedPane("workspace_pane_0", "workspace_column_0", "workspace_surface_0", "Chat"),
          storedPane("workspace_pane_1", "workspace_column_1", "workspace_surface_0", "Browser"),
        ],
        version: 4,
      }),
    );

    const restored = createRealWorkspaceScene({
      storageKey,
      workspaceName: "Ignored after restore",
    });
    const surfaceIds = restored.scene.panes.map((pane) => pane.surfaceId);

    expect(new Set(surfaceIds).size).toBe(2);
    expect(restored.scene.paneById.get("workspace_pane_1")?.surfaceId).toBe(
      "workspace_surface_0_workspace_pane_1",
    );
  });
});

function storedColumn(columnId: string, paneIds: string[]) {
  return {
    columnId,
    idealWidthSpec: { unit: "px", value: 520 },
    index: 0,
    paneIds,
    planeIndex: 0,
    widthSpec: { unit: "px", value: 520 },
  };
}

function storedPane(paneId: string, columnId: string, surfaceId: string, title: string) {
  return {
    columnId,
    heat: 0,
    paneId,
    sequence: 0,
    subtitle: "Repo",
    surfaceId,
    surfaceKind: "chat-dom",
    title,
    tone: "cyan",
    weight: 1,
  };
}

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
