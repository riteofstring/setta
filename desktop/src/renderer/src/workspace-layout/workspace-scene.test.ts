import { workspaceUILayoutSchemaVersion, type WorkspaceUILayout } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import { WorkspaceLayoutStore } from "./layout-store";
import {
  createRealWorkspaceScene,
  defaultRealWorkspacePaneLimits,
  workspaceUILayoutFromScene,
} from "./workspace-scene";

describe("real workspace layout scene", () => {
  test("creates the default real workspace when no persisted layout exists", () => {
    const result = createRealWorkspaceScene({
      storedLayout: null,
      workspaceId: "workspace_api",
      workspaceName: "Repo",
    });

    expect(result.focusedPaneId).toBe("workspace_pane_0");
    expect(result.layoutRecovery).toBeNull();
    expect(result.scene.id).toBe("workspace_api");
    expect(result.scene.columns).toHaveLength(1);
    expect(result.scene.defaultColumnWidthSpec).toEqual({ unit: "px", value: 520 });
    expect(result.scene.renderOverscanColumns).toBe(2);
    expect(result.scene.visibleColumnCount).toBe(1);
    expect(result.scene.totalPanes).toBe(1);
    expect(result.scene.columns.map((column) => column.slotIndex)).toEqual([0]);
    expect(result.scene.paneById.get("workspace_pane_0")).toMatchObject({
      subtitle: "Repo",
      surfaceKind: "empty-frame",
      title: "New frame",
    });
  });

  test("defines default pane limits for surviving workspace surfaces", () => {
    expect(defaultRealWorkspacePaneLimits).toEqual({
      browser: 10,
      "empty-frame": 10,
    });
  });

  test("serializes and restores the workspace layout through the backend contract shape", () => {
    const workspaceId = "workspace_api";
    const initial = createRealWorkspaceScene({
      storedLayout: null,
      workspaceId,
      workspaceName: "Repo",
    });
    const store = new WorkspaceLayoutStore(
      new WorkspaceLikeLayoutEngine(initial.scene),
      initial.scene,
      initial.focusedPaneId,
    );
    const paneId = store.openPane({
      surfaceKind: "browser",
      title: "Browser",
      tone: "slate",
    });

    const persisted = workspaceUILayoutFromScene(
      workspaceId,
      store.toScene(),
      store.focusedPaneId(),
    );
    const restored = createRealWorkspaceScene({
      storedLayout: persisted,
      workspaceId,
      workspaceName: "Ignored after restore",
    });

    expect(persisted).toMatchObject({
      focusedPaneId: paneId,
      schemaVersion: workspaceUILayoutSchemaVersion,
      workspaceId,
    });
    expect(restored.focusedPaneId).toBe(paneId);
    expect(restored.layoutRecovery).toBeNull();
    expect(restored.scene.totalPanes).toBe(2);
    expect(restored.scene.paneById.get(paneId)).toMatchObject({
      surfaceKind: "browser",
      title: "Browser",
      tone: "slate",
    });
  });

  test("serializes and restores an easy button conversation binding", () => {
    const workspaceId = "workspace_api";
    const initial = createRealWorkspaceScene({
      storedLayout: null,
      workspaceId,
      workspaceName: "Repo",
    });
    const store = new WorkspaceLayoutStore(
      new WorkspaceLikeLayoutEngine(initial.scene),
      initial.scene,
      initial.focusedPaneId,
    );
    const easyButtonConfig = { conversationId: "conversation-1" };
    const paneId = store.openPane({
      easyButtonConfig,
      surfaceKind: "easy-button",
      title: "Topic",
    });

    const persisted = workspaceUILayoutFromScene(
      workspaceId,
      store.toScene(),
      store.focusedPaneId(),
    );
    const restored = createRealWorkspaceScene({
      storedLayout: persisted,
      workspaceId,
      workspaceName: "Ignored after restore",
    });

    expect(persisted.panes.find((pane) => pane.paneId === paneId)?.easyButtonConfig).toEqual(
      easyButtonConfig,
    );
    expect(restored.scene.paneById.get(paneId)?.easyButtonConfig).toEqual(easyButtonConfig);
  });

  test("serializes and restores a Browser pane as a product surface", () => {
    const workspaceId = "workspace_api";
    const initial = createRealWorkspaceScene({
      storedLayout: null,
      workspaceId,
      workspaceName: "Repo",
    });
    const store = new WorkspaceLayoutStore(
      new WorkspaceLikeLayoutEngine(initial.scene),
      initial.scene,
      initial.focusedPaneId,
    );
    const paneId = store.openPane({
      subtitle: "workspace browser surface",
      surfaceKind: "browser",
      title: "Browser",
      tone: "green",
    });

    const persisted = workspaceUILayoutFromScene(
      workspaceId,
      store.toScene(),
      store.focusedPaneId(),
    );
    const restored = createRealWorkspaceScene({
      storedLayout: persisted,
      workspaceId,
      workspaceName: "Ignored after restore",
    });

    expect(persisted.panes.find((pane) => pane.paneId === paneId)).toMatchObject({
      easyButtonConfig: null,
      surfaceKind: "browser",
    });
    expect(restored.scene.paneById.get(paneId)).toMatchObject({
      surfaceKind: "browser",
      title: "Browser",
      tone: "green",
    });
  });

  test("opens and restores one easy button view per conversation without a pane cap", () => {
    const workspaceId = "workspace_api";
    const initial = createRealWorkspaceScene({
      storedLayout: null,
      workspaceId,
      workspaceName: "Repo",
    });
    const store = new WorkspaceLayoutStore(
      new WorkspaceLikeLayoutEngine(initial.scene),
      initial.scene,
      initial.focusedPaneId,
      { paneLimits: defaultRealWorkspacePaneLimits },
    );
    const easyButtonConfig = { conversationId: "conversation-1" };
    const firstPaneId = store.openPane({
      easyButtonConfig,
      surfaceKind: "easy-button",
      title: "Topic",
    });
    expect(() =>
      store.openPane({
        easyButtonConfig,
        surfaceKind: "easy-button",
        title: "Topic copy",
      }),
    ).toThrow("conversation conversation-1 is already bound to pane");

    for (let index = 2; index <= 11; index += 1) {
      store.openPane({
        easyButtonConfig: { conversationId: `conversation-${index}` },
        surfaceKind: "easy-button",
        title: `Topic ${index}`,
      });
    }

    expect(store.paneLimitState({ surfaceKind: "easy-button" })).toEqual({
      allowed: true,
      count: 11,
      limit: null,
      surfaceKind: "easy-button",
    });

    const persisted = workspaceUILayoutFromScene(
      workspaceId,
      store.toScene(),
      store.focusedPaneId(),
    );
    const restored = createRealWorkspaceScene({
      storedLayout: persisted,
      workspaceId,
      workspaceName: "Ignored after restore",
    });

    expect(restored.scene.paneById.get(firstPaneId)?.easyButtonConfig).toEqual(easyButtonConfig);
    expect(restored.scene.panes.filter((pane) => pane.surfaceKind === "easy-button")).toHaveLength(
      11,
    );
  });

  test("drops persisted columns that reference missing pane metadata", () => {
    const restored = createRealWorkspaceScene({
      storedLayout: {
        ...storedLayout("workspace_api", ["workspace_pane_0"]),
        columns: [
          storedColumn("workspace_column_0", 0, ["workspace_pane_0"]),
          storedColumn("missing_column", 1, ["missing_pane"]),
        ],
      },
      workspaceId: "workspace_api",
      workspaceName: "Ignored after restore",
    });

    expect(restored.focusedPaneId).toBe("workspace_pane_0");
    expect(restored.scene.columns).toHaveLength(1);
    expect(restored.scene.columns[0]?.paneIds).toEqual(["workspace_pane_0"]);
    expect(restored.scene.paneById.has("missing_pane")).toBe(false);
    expect(restored.scene.paneById.get("workspace_pane_0")?.columnId).toBe("workspace_column_0");
  });
});

function storedLayout(workspaceId: string, paneIds: string[]): WorkspaceUILayout {
  return {
    columns: [storedColumn("workspace_column_0", 0, paneIds)],
    focusedPaneId: paneIds[0] ?? "",
    panes: [storedPane("workspace_pane_0", "workspace_column_0", "workspace_surface_0", "Frame")],
    schemaVersion: workspaceUILayoutSchemaVersion,
    workspaceId,
  };
}

function storedColumn(columnId: string, index: number, paneIds: string[]) {
  return {
    columnId,
    idealWidthSpec: { unit: "px", value: 520 } as const,
    index,
    paneIds,
    planeIndex: 0,
    previousProportionWidth: null,
    slotIndex: index,
    widthSpec: { unit: "px", value: 520 } as const,
  };
}

function storedPane(paneId: string, columnId: string, surfaceId: string, title: string) {
  return {
    columnId,
    easyButtonConfig: null,
    heat: 0,
    paneId,
    sequence: 0,
    subtitle: "Repo",
    surfaceId,
    surfaceKind: "empty-frame" as const,
    title,
    tone: "slate" as const,
    weight: 1,
  };
}
