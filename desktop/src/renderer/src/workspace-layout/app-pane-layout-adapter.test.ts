import { appPaneLayoutSchemaVersion, type AppPaneLayout } from "@generated/backend";
import { describe, expect, test } from "vitest";

import {
  appPaneLayoutFromWorkspaceScene,
  appPaneLayoutToWorkspaceUILayout,
} from "./app-pane-layout-adapter";
import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import { WorkspaceLayoutStore } from "./layout-store";
import { createRealWorkspaceScene } from "./workspace-scene";

describe("app pane layout adapter", () => {
  test("stores current conversation panes as app-level conversation records", () => {
    const initial = createRealWorkspaceScene({
      storedLayout: null,
      workspaceId: "workspace_api",
      workspaceName: "Repo",
    });
    const store = new WorkspaceLayoutStore(
      new WorkspaceLikeLayoutEngine(initial.scene),
      initial.scene,
      initial.focusedPaneId,
    );
    const conversationPaneId = store.openPane({
      conversationConfig: { conversationId: "conversation_api" },
      surfaceKind: "conversation",
      subtitle: "Topic conversation",
      title: "Build the API",
      tone: "cyan",
    });
    store.togglePaneMaximized(conversationPaneId);

    const layout = appPaneLayoutFromWorkspaceScene({
      focusedPaneId: store.focusedPaneId(),
      maximizedPaneId: store.getSnapshot().maximizedPaneId,
      scene: store.toScene(),
      workspaceRootPath: "/tmp/setta-api",
    });

    expect(layout.schemaVersion).toBe(appPaneLayoutSchemaVersion);
    expect(layout.maximizedPaneId).toBe(conversationPaneId);
    expect(layout.columns.map((column) => [column.index, column.slotIndex])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(layout.panes.map((pane) => pane.surfaceKind)).toEqual([
      "master",
      "empty-frame",
      "conversation",
    ]);
    expect(layout.panes.find((pane) => pane.paneId === conversationPaneId)).toMatchObject({
      conversationConfig: {
        conversationId: "conversation_api",
        presentationIdentity: {
          subtitle: "Topic conversation",
          title: "Build the API",
          tone: "cyan",
        },
        resourceBindings: [{ folder: { rootPath: "/tmp/setta-api" }, kind: "folder" }],
      },
      masterConfig: null,
      surfaceKind: "conversation",
    });
  });

  test("restores app-level conversation records into the current workspace scene shape", () => {
    const layout: AppPaneLayout = {
      columns: [
        {
          columnId: "app_column_master",
          idealWidthSpec: { unit: "px", value: 520 },
          index: 0,
          paneIds: ["app_pane_master"],
          planeIndex: 0,
          previousProportionWidth: null,
          slotIndex: 0,
          widthSpec: { unit: "px", value: 520 },
        },
        {
          columnId: "app_column_0",
          idealWidthSpec: { unit: "px", value: 520 },
          index: 1,
          paneIds: ["app_pane_topic"],
          planeIndex: 0,
          previousProportionWidth: null,
          slotIndex: 1,
          widthSpec: { unit: "px", value: 520 },
        },
      ],
      focusedPaneId: "app_pane_master",
      maximizedPaneId: "app_pane_topic",
      panes: [
        {
          columnId: "app_column_master",
          conversationConfig: null,
          heat: 0,
          masterConfig: {},
          paneId: "app_pane_master",
          sequence: 0,
          subtitle: "Global coordinator",
          surfaceId: "app_surface_master",
          surfaceKind: "master",
          title: "Setta",
          tone: "slate",
          weight: 1,
        },
        {
          columnId: "app_column_0",
          conversationConfig: {
            conversationId: "conversation_api",
            presentationIdentity: {
              subtitle: "Topic conversation",
              title: "Build the API",
              tone: "cyan",
            },
            resourceBindings: [{ folder: { rootPath: "/tmp/setta-api" }, kind: "folder" }],
          },
          heat: 12,
          masterConfig: null,
          paneId: "app_pane_topic",
          sequence: 4,
          subtitle: "Topic conversation",
          surfaceId: "app_surface_topic",
          surfaceKind: "conversation",
          title: "Build the API",
          tone: "cyan",
          weight: 1,
        },
      ],
      schemaVersion: appPaneLayoutSchemaVersion,
    };

    const restored = appPaneLayoutToWorkspaceUILayout({
      layout,
      workspaceId: "workspace_api",
      workspaceRootPath: "/tmp/setta-api",
    });

    expect(restored.maximizedPaneId).toBe("app_pane_topic");
    expect(restored.layout).toMatchObject({
      focusedPaneId: "app_pane_topic",
      workspaceId: "workspace_api",
    });
    expect(restored.layout?.columns.map((column) => [column.index, column.slotIndex])).toEqual([
      [0, 0],
    ]);
    expect(restored.layout?.panes).toEqual([
      {
        columnId: "app_column_0",
        conversationConfig: { conversationId: "conversation_api" },
        heat: 12,
        paneId: "app_pane_topic",
        sequence: 4,
        subtitle: "Topic conversation",
        surfaceId: "app_surface_topic",
        surfaceKind: "conversation",
        title: "Build the API",
        tone: "cyan",
        weight: 1,
      },
    ]);
  });

  test("does not restore app conversation panes bound to a different workspace folder", () => {
    const layout: AppPaneLayout = {
      columns: [
        {
          columnId: "app_column_master",
          idealWidthSpec: { unit: "px", value: 520 },
          index: 0,
          paneIds: ["app_pane_master"],
          planeIndex: 0,
          previousProportionWidth: null,
          slotIndex: 0,
          widthSpec: { unit: "px", value: 520 },
        },
        {
          columnId: "app_column_0",
          idealWidthSpec: { unit: "px", value: 520 },
          index: 1,
          paneIds: ["app_pane_topic"],
          planeIndex: 0,
          previousProportionWidth: null,
          slotIndex: 1,
          widthSpec: { unit: "px", value: 520 },
        },
      ],
      focusedPaneId: "app_pane_topic",
      maximizedPaneId: "app_pane_topic",
      panes: [
        {
          columnId: "app_column_master",
          conversationConfig: null,
          heat: 0,
          masterConfig: {},
          paneId: "app_pane_master",
          sequence: 0,
          subtitle: "Global coordinator",
          surfaceId: "app_surface_master",
          surfaceKind: "master",
          title: "Setta",
          tone: "slate",
          weight: 1,
        },
        {
          columnId: "app_column_0",
          conversationConfig: {
            conversationId: "conversation_api",
            presentationIdentity: {
              subtitle: "Topic conversation",
              title: "Build the API",
              tone: "cyan",
            },
            resourceBindings: [{ folder: { rootPath: "/tmp/setta-api" }, kind: "folder" }],
          },
          heat: 12,
          masterConfig: null,
          paneId: "app_pane_topic",
          sequence: 4,
          subtitle: "Topic conversation",
          surfaceId: "app_surface_topic",
          surfaceKind: "conversation",
          title: "Build the API",
          tone: "cyan",
          weight: 1,
        },
      ],
      schemaVersion: appPaneLayoutSchemaVersion,
    };

    expect(
      appPaneLayoutToWorkspaceUILayout({
        layout,
        workspaceId: "workspace_other",
        workspaceRootPath: "/tmp/other",
      }),
    ).toEqual({
      layout: null,
      maximizedPaneId: null,
    });
  });

  test("ignores master records until the renderer has a master surface adapter", () => {
    const layout: AppPaneLayout = {
      columns: [
        {
          columnId: "app_column_0",
          idealWidthSpec: { unit: "px", value: 520 },
          index: 0,
          paneIds: ["app_pane_master"],
          planeIndex: 0,
          previousProportionWidth: null,
          slotIndex: 0,
          widthSpec: { unit: "px", value: 520 },
        },
      ],
      focusedPaneId: "app_pane_master",
      maximizedPaneId: "app_pane_master",
      panes: [
        {
          columnId: "app_column_0",
          conversationConfig: null,
          heat: 0,
          masterConfig: {},
          paneId: "app_pane_master",
          sequence: 0,
          subtitle: "Global coordinator",
          surfaceId: "app_surface_master",
          surfaceKind: "master",
          title: "Setta",
          tone: "slate",
          weight: 1,
        },
      ],
      schemaVersion: appPaneLayoutSchemaVersion,
    };

    expect(
      appPaneLayoutToWorkspaceUILayout({
        layout,
        workspaceId: "workspace_api",
        workspaceRootPath: "/tmp/setta-api",
      }),
    ).toEqual({
      layout: null,
      maximizedPaneId: null,
    });
  });
});
