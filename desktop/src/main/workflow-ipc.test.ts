import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { BackendClient, WorkflowGraphViewLayout } from "@generated/backend";
import { ipcChannels } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerWorkflowIpcHandlers } from "./workflow-ipc";

describe("workflow IPC handlers", () => {
  test("forward graph view-layout reads and updates to the backend client", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    } as Pick<IpcMain, "handle">;
    const backend = workflowBackendClient();
    const request = {
      target: {
        definitionVersion: {
          definitionId: "workflow_definition_api",
          versionId: "workflow_version_api",
        },
        kind: "definition_version",
        workflowExecution: null,
      },
      workspaceId: "workspace_api",
    } as const;
    const updateRequest = {
      ...request,
      positions: [{ nodeId: "start", x: -40, y: 20 }],
    };

    registerWorkflowIpcHandlers({
      ipcMain: ipcMain as IpcMain,
      requireBackendClient: () => backend,
    });

    await invoke(handlers, ipcChannels.workflowReadGraphViewLayout, request);
    await invoke(handlers, ipcChannels.workflowUpdateGraphViewLayout, updateRequest);

    expect(backend.readWorkflowGraphViewLayout).toHaveBeenCalledWith(request);
    expect(backend.updateWorkflowGraphViewLayout).toHaveBeenCalledWith(updateRequest);
  });
});

async function invoke(
  handlers: Map<string, Parameters<IpcMain["handle"]>[1]>,
  channel: string,
  request: unknown,
) {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`handler ${channel} was not registered`);
  }
  return handler({} as IpcMainInvokeEvent, request);
}

function workflowBackendClient() {
  const layout: WorkflowGraphViewLayout = {
    positions: [],
    schemaVersion: 1,
    target: {
      definitionVersion: {
        definitionId: "workflow_definition_api",
        versionId: "workflow_version_api",
      },
      kind: "definition_version",
      workflowExecution: null,
    },
    updatedAt: "",
    workspaceId: "workspace_api",
  };
  const methods = {
    readWorkflowGraphViewLayout: vi.fn(async () => layout),
    updateWorkflowGraphViewLayout: vi.fn(async () => layout),
  };
  return methods as unknown as BackendClient & typeof methods;
}
