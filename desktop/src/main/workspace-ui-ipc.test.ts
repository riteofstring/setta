import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { BackendClient, WorkspaceUILayout } from "@generated/backend";
import { ipcChannels } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerWorkspaceUILayoutIpcHandlers } from "./workspace-ui-ipc";

describe("workspace UI IPC handlers", () => {
  test("forward pane metadata and layout operations to the backend client", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    } as Pick<IpcMain, "handle">;
    const backend = workspaceUIBackendClient();
    const layout = workspaceUILayout();

    registerWorkspaceUILayoutIpcHandlers({
      ipcMain: ipcMain as IpcMain,
      requireBackendClient: () => backend,
    });

    await invoke(handlers, ipcChannels.workspaceReadUISchema);
    await invoke(handlers, ipcChannels.workspaceListUIPanes, "workspace_api");
    await invoke(handlers, ipcChannels.workspaceReadUIPane, "workspace_api", "workspace_pane_1");
    await invoke(handlers, ipcChannels.workspaceReadUILayout, "workspace_api");
    await invoke(handlers, ipcChannels.workspaceSaveUILayout, layout);

    expect(backend.readWorkspaceUISchema).toHaveBeenCalledWith();
    expect(backend.listWorkspaceUIPanes).toHaveBeenCalledWith({ workspaceId: "workspace_api" });
    expect(backend.readWorkspaceUIPane).toHaveBeenCalledWith({
      paneId: "workspace_pane_1",
      workspaceId: "workspace_api",
    });
    expect(backend.readWorkspaceUILayout).toHaveBeenCalledWith({ workspaceId: "workspace_api" });
    expect(backend.saveWorkspaceUILayout).toHaveBeenCalledWith({ layout });
  });
});

async function invoke(
  handlers: Map<string, Parameters<IpcMain["handle"]>[1]>,
  channel: string,
  ...args: unknown[]
) {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`missing IPC handler for ${channel}`);
  }
  return handler({} as IpcMainInvokeEvent, ...args);
}

function workspaceUIBackendClient(): BackendClient {
  return {
    listWorkspaceUIPanes: vi.fn(async () => ({
      layoutPresent: false,
      panes: [],
      schema: workspaceUISchema(),
      workspaceId: "workspace_api",
    })),
    readWorkspaceUIPane: vi.fn(async () => ({
      pane: workspaceUIPaneDescriptor(),
      schema: workspaceUISchema(),
      workspaceId: "workspace_api",
    })),
    readWorkspaceUISchema: vi.fn(async () => workspaceUISchema()),
    readWorkspaceUILayout: vi.fn(async () => ({
      layout: null,
      workspaceId: "workspace_api",
    })),
    saveWorkspaceUILayout: vi.fn(async (request: { layout: WorkspaceUILayout }) => request.layout),
  } as unknown as BackendClient;
}

function workspaceUISchema() {
  return {
    columnWidthUnits: [],
    layoutSchemaVersion: 2,
    paneReadModes: [],
    paneRuntimeStatuses: [],
    paneTones: [],
    paneWriteModes: [],
    schemaVersion: 1,
    surfaceCloseModes: [],
    surfaceKinds: [],
  };
}

function workspaceUIPaneDescriptor() {
  return {
    canClosePane: false,
    canFocus: false,
    canMove: false,
    contentRefs: {
      chat: null,
      semanticNodeDetails: null,
      terminal: null,
      workflowGraph: null,
      workflowNodeDetails: null,
    },
    focused: true,
    location: {
      columnId: "workspace_column_1",
      columnIndex: 1,
      idealWidthSpec: { unit: "px", value: 520 },
      paneCount: 1,
      paneIndex: 0,
      planeIndex: 0,
      sequence: 1,
      slotIndex: 1,
      weight: 1,
      widthSpec: { unit: "px", value: 520 },
    },
    paneId: "workspace_pane_1",
    readModes: ["metadata"],
    runtimeState: { status: "layout_only" },
    subtitle: "workspace command surface",
    surfaceCloseModes: [],
    surfaceId: "workspace_surface_1",
    surfaceKind: "terminal",
    title: "Terminal",
    writeModes: [],
  };
}

function workspaceUILayout(): WorkspaceUILayout {
  return {
    columns: [],
    focusedPaneId: "workspace_pane_1",
    panes: [],
    revision: 1,
    schemaVersion: 2,
    workspaceId: "workspace_api",
  };
}
