import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  BackendClient,
  WorkspaceUILayout,
  WorkspaceUIPaneOperation,
} from "@generated/backend";
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
    const operation = focusPaneOperation();

    registerWorkspaceUILayoutIpcHandlers({
      ipcMain: ipcMain as IpcMain,
      requireBackendClient: () => backend,
    });

    await invoke(handlers, ipcChannels.workspaceReadUISchema);
    await invoke(handlers, ipcChannels.workspaceListUIPanes, "workspace_api");
    await invoke(handlers, ipcChannels.workspaceReadUIPane, "workspace_api", "workspace_pane_1");
    await invoke(handlers, ipcChannels.workspaceReadUILayout, "workspace_api");
    await invoke(handlers, ipcChannels.workspaceInitializeUILayout, "workspace_api");
    await invoke(handlers, ipcChannels.workspaceResetUILayout, "workspace_api");
    await invoke(handlers, ipcChannels.workspaceApplyUIPaneOperation, "workspace_api", operation);

    expect(backend.readWorkspaceUISchema).toHaveBeenCalledWith();
    expect(backend.listWorkspaceUIPanes).toHaveBeenCalledWith({ workspaceId: "workspace_api" });
    expect(backend.readWorkspaceUIPane).toHaveBeenCalledWith({
      paneId: "workspace_pane_1",
      workspaceId: "workspace_api",
    });
    expect(backend.readWorkspaceUILayout).toHaveBeenCalledWith({ workspaceId: "workspace_api" });
    expect(backend.initializeWorkspaceUILayout).toHaveBeenCalledWith({
      workspaceId: "workspace_api",
    });
    expect(backend.resetWorkspaceUILayout).toHaveBeenCalledWith({ workspaceId: "workspace_api" });
    expect(backend.applyWorkspaceUIPaneOperation).toHaveBeenCalledWith({
      operation,
      workspaceId: "workspace_api",
    });
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
    initializeWorkspaceUILayout: vi.fn(async () => workspaceUILayout()),
    resetWorkspaceUILayout: vi.fn(async () => workspaceUILayout()),
    applyWorkspaceUIPaneOperation: vi.fn(async () => ({
      beforeAfterDimensions: [],
      changed: false,
      layout: workspaceUILayout(),
      operationResult: {
        close: null,
        configure: null,
        focusedPaneId: "workspace_pane_1",
        kind: "focus_pane",
        move: null,
        open: null,
        paneId: "workspace_pane_1",
        previousFocusedPaneId: "workspace_pane_1",
        rename: null,
        reorder: null,
        resize: null,
      },
      revision: 1,
      warnings: [],
      workspaceId: "workspace_api",
    })),
  } as unknown as BackendClient;
}

function focusPaneOperation(): WorkspaceUIPaneOperation {
  return {
    close: null,
    configure: null,
    kind: "focus_pane",
    move: null,
    open: null,
    paneId: "workspace_pane_1",
    rename: null,
    reorder: null,
    resize: null,
    resizeColumn: null,
  };
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
    schemaVersion: 3,
    workspaceId: "workspace_api",
  };
}
