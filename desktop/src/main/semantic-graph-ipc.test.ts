import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { BackendClient } from "@generated/backend";
import { ipcChannels } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerSemanticGraphIpcHandlers } from "./semantic-graph-ipc";

describe("semantic graph IPC handlers", () => {
  test("forward read, mutation, and steering operations to the backend client", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    } as Pick<IpcMain, "handle">;
    const backend = semanticBackendClient();

    registerSemanticGraphIpcHandlers({
      ipcMain: ipcMain as IpcMain,
      requireBackendClient: () => backend,
    });

    const request = { workspaceId: "workspace_api" };
    await invoke(handlers, ipcChannels.semanticGraphRead, request);
    await invoke(handlers, ipcChannels.semanticGraphRenameNode, request);
    await invoke(handlers, ipcChannels.semanticGraphUpdateNode, request);
    await invoke(handlers, ipcChannels.semanticGraphDismissNode, request);
    await invoke(handlers, ipcChannels.semanticGraphPromoteNode, request);
    await invoke(handlers, ipcChannels.semanticGraphSplitNode, request);
    await invoke(handlers, ipcChannels.semanticGraphMergeNodes, request);
    await invoke(handlers, ipcChannels.semanticGraphCreateNode, request);
    await invoke(handlers, ipcChannels.semanticGraphCreateEdge, request);
    await invoke(handlers, ipcChannels.semanticGraphUpdateEdge, request);
    await invoke(handlers, ipcChannels.semanticGraphRemoveEdge, request);
    await invoke(handlers, ipcChannels.semanticGraphCreateSteeringDirective, request);
    await invoke(handlers, ipcChannels.semanticGraphUpdateSteeringDirective, request);

    expect(backend.readSemanticGraph).toHaveBeenCalledWith(request);
    expect(backend.renameSemanticNode).toHaveBeenCalledWith(request);
    expect(backend.updateSemanticNode).toHaveBeenCalledWith(request);
    expect(backend.dismissSemanticNode).toHaveBeenCalledWith(request);
    expect(backend.promoteSemanticNode).toHaveBeenCalledWith(request);
    expect(backend.splitSemanticNode).toHaveBeenCalledWith(request);
    expect(backend.mergeSemanticNodes).toHaveBeenCalledWith(request);
    expect(backend.createSemanticNode).toHaveBeenCalledWith(request);
    expect(backend.createSemanticEdge).toHaveBeenCalledWith(request);
    expect(backend.updateSemanticEdge).toHaveBeenCalledWith(request);
    expect(backend.removeSemanticEdge).toHaveBeenCalledWith(request);
    expect(backend.createSemanticSteeringDirective).toHaveBeenCalledWith(request);
    expect(backend.updateSemanticSteeringDirective).toHaveBeenCalledWith(request);
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

function semanticBackendClient() {
  const methods = {
    createSemanticEdge: vi.fn(async () => ({})),
    createSemanticNode: vi.fn(async () => ({})),
    createSemanticSteeringDirective: vi.fn(async () => ({})),
    dismissSemanticNode: vi.fn(async () => ({})),
    mergeSemanticNodes: vi.fn(async () => ({})),
    promoteSemanticNode: vi.fn(async () => ({})),
    readSemanticGraph: vi.fn(async () => ({})),
    removeSemanticEdge: vi.fn(async () => ({})),
    renameSemanticNode: vi.fn(async () => ({})),
    splitSemanticNode: vi.fn(async () => ({})),
    updateSemanticEdge: vi.fn(async () => ({})),
    updateSemanticNode: vi.fn(async () => ({})),
    updateSemanticSteeringDirective: vi.fn(async () => ({})),
  };
  return methods as unknown as BackendClient & typeof methods;
}
