import { afterEach, describe, expect, test } from "vitest";

import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import { WorkspaceLayoutStore } from "./layout-store";
import {
  createRealWorkspaceScene,
  defaultRealWorkspacePaneLimits,
  persistRealWorkspaceScene,
} from "./workspace-scene";

describe("real workspace layout scene", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("creates the default real workspace when no stored layout exists", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });

    const result = createRealWorkspaceScene({
      storageKey: "setta:workspace-layout:test",
      workspaceName: "Repo",
    });

    expect(result.focusedPaneId).toBe("workspace_pane_0");
    expect(result.layoutRecovery).toBeNull();
    expect(result.scene.id).toBe("setta:workspace-layout:test");
    expect(result.scene.columns).toHaveLength(4);
    expect(result.scene.defaultColumnWidthSpec).toEqual({ unit: "px", value: 520 });
    expect(result.scene.renderOverscanColumns).toBe(2);
    expect(result.scene.visibleColumnCount).toBe(3);
    expect(result.scene.totalPanes).toBe(4);
    expect(result.scene.columns.every((column) => column.paneIds.length === 1)).toBe(true);
    expect(result.scene.columns.map((column) => column.slotIndex)).toEqual([0, 1, 2, 3]);
    expect(result.scene.columns.map((column) => column.widthSpec)).toEqual([
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
    ]);
    expect(
      result.scene.columns.map((column) => {
        const paneId = column.paneIds[0];
        return paneId ? result.scene.paneById.get(paneId)?.title : "";
      }),
    ).toEqual(["Chat", "Terminal", "Workflow Graph", "Settings"]);
    expect(result.scene.paneById.get("workspace_pane_0")).toMatchObject({
      subtitle: "Repo",
      surfaceKind: "chat-dom",
      title: "Chat",
    });
    expect(result.scene.paneById.get("workspace_pane_1")?.surfaceKind).toBe("terminal");
  });

  test("defines default pane limits for addable real workspace surfaces", () => {
    expect(defaultRealWorkspacePaneLimits).toEqual({
      "chat-dom": 10,
      "semantic-node-details": 1,
      "settings-dom": 1,
      terminal: 10,
      "workflow-graph": 10,
      "workflow-node-details": 1,
      "workflow-settings": 1,
    });
  });

  test("persists and restores the real workspace layout", () => {
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    const storageKey = "setta:workspace-layout:repo";
    const initial = createRealWorkspaceScene({
      storageKey,
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(initial.scene);
    const store = new WorkspaceLayoutStore(engine, initial.scene, initial.focusedPaneId);
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
    expect(restored.layoutRecovery).toBeNull();
    expect(restored.scene.totalPanes).toBe(5);
    expect(restored.scene.columns).toHaveLength(5);
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
    const storageKey = "setta:workspace-layout:corrupt";
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

  test("resets invalid stored layout instead of throwing during render", () => {
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    const storageKey = "setta:workspace-layout:invalid-json";
    storage.setItem(storageKey, "{");

    const restored = createRealWorkspaceScene({
      storageKey,
      workspaceName: "Repo",
    });

    expect(storage.getItem(storageKey)).toBeNull();
    expect(restored.layoutRecovery?.message).toContain("not JSON");
    expect(restored.scene.panes.map((pane) => pane.title)).toEqual([
      "Chat",
      "Terminal",
      "Workflow Graph",
      "Settings",
    ]);
  });

  test("resets stored diagnostic surfaces from real workspace layouts", () => {
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    const storageKey = "setta:workspace-layout:diagnostic-surface";
    storage.setItem(
      storageKey,
      JSON.stringify({
        columns: [storedColumn("workspace_column_0", ["workspace_pane_0"])],
        focusedPaneId: "workspace_pane_0",
        panes: [
          {
            ...storedPane("workspace_pane_0", "workspace_column_0", "workspace_surface_0", "Git"),
            surfaceKind: "git-graph",
          },
        ],
        version: 4,
      }),
    );

    const restored = createRealWorkspaceScene({
      storageKey,
      workspaceName: "Repo",
    });

    expect(storage.getItem(storageKey)).toBeNull();
    expect(restored.layoutRecovery?.message).toContain("product layout contract");
    expect(restored.scene.panes.some((pane) => pane.surfaceKind === "git-graph")).toBe(false);
  });

  test("deduplicates restored surface ids before creating presentation adapters", () => {
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    const storageKey = "setta:workspace-layout:duplicate-surfaces";
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
