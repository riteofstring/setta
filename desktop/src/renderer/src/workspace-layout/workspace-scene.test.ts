import type { WorkflowNodeDetailsPaneConfig, WorkspaceUILayout } from "@generated/backend";
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
      "easy-button": 1,
      "semantic-node-details": 1,
      "settings-dom": 1,
      terminal: 10,
      "workflow-graph": 10,
      "workflow-node-details": 1,
      "workflow-settings": 1,
    });
  });

  test("serializes and restores the real workspace layout through the backend contract shape", () => {
    const workspaceId = "workspace_api";
    const initial = createRealWorkspaceScene({
      storedLayout: null,
      workspaceId,
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(initial.scene);
    const store = new WorkspaceLayoutStore(engine, initial.scene, initial.focusedPaneId);
    const paneId = store.openPane({
      surfaceKind: "terminal",
      terminalConfig: {
        cwdOverride: "/tmp/repo",
        profileId: "default",
        titleOverride: "Build shell",
      },
      title: "Build",
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

    expect(persisted).toMatchObject({
      focusedPaneId: paneId,
      schemaVersion: 1,
      workspaceId,
    });
    expect(persisted.panes.find((pane) => pane.paneId === paneId)?.terminalConfig).toEqual({
      cwdOverride: "/tmp/repo",
      profileId: "default",
      titleOverride: "Build shell",
    });
    expect(restored.focusedPaneId).toBe(paneId);
    expect(restored.layoutRecovery).toBeNull();
    expect(restored.scene.totalPanes).toBe(5);
    expect(restored.scene.columns).toHaveLength(5);
    expect(restored.scene.paneById.get(paneId)).toMatchObject({
      surfaceKind: "terminal",
      terminalConfig: {
        cwdOverride: "/tmp/repo",
        profileId: "default",
        titleOverride: "Build shell",
      },
      title: "Build",
      tone: "green",
    });
    expect(restored.scene.columns[1]?.paneIds).toEqual([paneId]);
    expect(restored.scene.columns.every((column) => column.paneIds.length === 1)).toBe(true);
  });

  test("omits empty terminal override fields when restoring local runtime state", () => {
    const restored = createRealWorkspaceScene({
      storedLayout: {
        ...storedLayout("workspace_api", ["workspace_pane_0"]),
        panes: [
          {
            ...storedPane(
              "workspace_pane_0",
              "workspace_column_0",
              "workspace_surface_0",
              "Terminal",
            ),
            surfaceKind: "terminal",
            terminalConfig: {
              cwdOverride: "",
              profileId: "default",
              titleOverride: "",
            },
          },
        ],
      },
      workspaceId: "workspace_api",
      workspaceName: "Repo",
    });

    expect(restored.scene.paneById.get("workspace_pane_0")?.terminalConfig).toEqual({
      profileId: "default",
    });
  });

  test("serializes and restores workflow node details pane targets", () => {
    const workspaceId = "workspace_api";
    const initial = createRealWorkspaceScene({
      storedLayout: null,
      workspaceId,
      workspaceName: "Repo",
    });
    const engine = new WorkspaceLikeLayoutEngine(initial.scene);
    const store = new WorkspaceLayoutStore(engine, initial.scene, initial.focusedPaneId);
    const config = workflowNodeDetailsConfig(workspaceId);
    const paneId = store.openPane({
      surfaceKind: "workflow-node-details",
      title: "Workflow Node",
      workflowNodeDetailsConfig: config,
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

    expect(
      persisted.panes.find((pane) => pane.paneId === paneId)?.workflowNodeDetailsConfig,
    ).toEqual(config);
    expect(restored.scene.paneById.get(paneId)?.workflowNodeDetailsConfig).toEqual(config);
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
    panes: [storedPane("workspace_pane_0", "workspace_column_0", "workspace_surface_0", "Chat")],
    schemaVersion: 1,
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
    heat: 0,
    paneId,
    sequence: 0,
    subtitle: "Repo",
    surfaceId,
    surfaceKind: "chat-dom" as const,
    terminalConfig: null,
    title,
    tone: "cyan" as const,
    weight: 1,
    workflowNodeDetailsConfig: null,
  };
}

function workflowNodeDetailsConfig(workspaceId: string): WorkflowNodeDetailsPaneConfig {
  return {
    definitionId: "workflow_definition_test",
    definitionName: "Review Workflow",
    definitionVersionId: "workflow_version_test",
    definitionVersionNumber: 1,
    executionId: "workflow_execution_test",
    nodeId: "activity",
    nodeExecutionId: "workflow_node_execution_test",
    nodeKind: "action",
    nodeLabel: "Activity",
    nodeStatus: "succeeded",
    projectionIncomingEdges: [],
    projectionOutgoingEdges: [],
    versionMismatch: false,
    viewMode: "run",
    workspaceId,
  };
}
