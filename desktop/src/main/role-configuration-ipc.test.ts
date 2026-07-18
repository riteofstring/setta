import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { BackendClient, RoleConfiguration, RoleModelCatalog } from "@generated/backend";
import { ipcChannels } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerRoleConfigurationIpcHandlers } from "./role-configuration-ipc";

describe("role configuration IPC handlers", () => {
  test("forwards global, workspace, conversation, and model-catalog requests", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const globalConfiguration = { scope: { kind: "global" } } as RoleConfiguration;
    const conversationConfiguration = {
      scope: {
        conversationId: "conversation_roles",
        kind: "conversation",
        workspaceId: "workspace_roles",
      },
    } as RoleConfiguration;
    const workspaceConfiguration = {
      scope: {
        conversationId: null,
        kind: "workspace",
        workspaceId: "workspace_roles",
      },
    } as RoleConfiguration;
    const modelCatalog = { defaultModelId: "gpt-5.6-sol" } as RoleModelCatalog;
    const backend = {
      readConversationRoleConfiguration: vi.fn(async () => conversationConfiguration),
      readGlobalRoleConfiguration: vi.fn(async () => globalConfiguration),
      readRoleModelCatalog: vi.fn(async () => modelCatalog),
      readWorkspaceRoleConfiguration: vi.fn(async () => workspaceConfiguration),
      updateConversationRoleProfiles: vi.fn(async () => conversationConfiguration),
      updateGlobalRoleProfiles: vi.fn(async () => globalConfiguration),
      updateWorkspaceRoleProfiles: vi.fn(async () => workspaceConfiguration),
    } as unknown as BackendClient;
    registerRoleConfigurationIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler),
      } as Pick<IpcMain, "handle">,
      requireBackendClient: () => backend,
    });
    const conversationRequest = {
      conversationId: "conversation_roles",
      workspaceId: "workspace_roles",
    };
    const globalUpdate = { updates: [{ profile: null, role: "agent" as const }] };
    const workspaceRequest = { workspaceId: "workspace_roles" };
    const workspaceUpdate = { ...workspaceRequest, ...globalUpdate };
    const conversationUpdate = { ...conversationRequest, ...globalUpdate };

    await invoke(handlers, ipcChannels.roleConfigurationReadModels);
    await invoke(handlers, ipcChannels.roleConfigurationReadGlobal);
    await invoke(handlers, ipcChannels.roleConfigurationReadWorkspace, workspaceRequest);
    await invoke(handlers, ipcChannels.roleConfigurationReadConversation, conversationRequest);
    await invoke(handlers, ipcChannels.roleConfigurationUpdateGlobal, globalUpdate);
    await invoke(handlers, ipcChannels.roleConfigurationUpdateWorkspace, workspaceUpdate);
    await invoke(handlers, ipcChannels.roleConfigurationUpdateConversation, conversationUpdate);

    expect(backend.readRoleModelCatalog).toHaveBeenCalledOnce();
    expect(backend.readGlobalRoleConfiguration).toHaveBeenCalledOnce();
    expect(backend.readWorkspaceRoleConfiguration).toHaveBeenCalledWith(workspaceRequest);
    expect(backend.readConversationRoleConfiguration).toHaveBeenCalledWith(conversationRequest);
    expect(backend.updateGlobalRoleProfiles).toHaveBeenCalledWith(globalUpdate);
    expect(backend.updateWorkspaceRoleProfiles).toHaveBeenCalledWith(workspaceUpdate);
    expect(backend.updateConversationRoleProfiles).toHaveBeenCalledWith(conversationUpdate);
  });
});

async function invoke(
  handlers: Map<string, Parameters<IpcMain["handle"]>[1]>,
  channel: string,
  request?: unknown,
) {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`handler ${channel} was not registered`);
  }
  return request === undefined
    ? handler({} as IpcMainInvokeEvent)
    : handler({} as IpcMainInvokeEvent, request);
}
