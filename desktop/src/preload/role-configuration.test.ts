import type { SettaAPI } from "@shared/types";
import { ipcChannels } from "@shared/ipc";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("preload role configuration API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
  });

  test("exposes generated role configuration operations through typed IPC", async () => {
    const invoke = vi.fn();
    const exposed: Record<string, unknown> = {};
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name: string, api: unknown) => {
          exposed[name] = api;
        },
      },
      ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn(), send: vi.fn() },
    }));
    await import("./index");
    const api = exposed.setta as SettaAPI;
    const conversationRequest = {
      conversationId: "conversation_roles",
      workspaceId: "workspace_roles",
    };
    const globalUpdate = { updates: [{ profile: null, role: "agent" as const }] };
    const workspaceRequest = { workspaceId: "workspace_roles" };
    const workspaceUpdate = { ...workspaceRequest, ...globalUpdate };
    const conversationUpdate = { ...conversationRequest, ...globalUpdate };

    await api.roles!.readModels();
    await api.roles!.readGlobal();
    await api.roles!.readWorkspace(workspaceRequest);
    await api.roles!.readConversation(conversationRequest);
    await api.roles!.updateGlobal(globalUpdate);
    await api.roles!.updateWorkspace(workspaceUpdate);
    await api.roles!.updateConversation(conversationUpdate);

    expect(invoke).toHaveBeenCalledWith(ipcChannels.roleConfigurationReadModels);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.roleConfigurationReadGlobal);
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.roleConfigurationReadWorkspace,
      workspaceRequest,
    );
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.roleConfigurationReadConversation,
      conversationRequest,
    );
    expect(invoke).toHaveBeenCalledWith(ipcChannels.roleConfigurationUpdateGlobal, globalUpdate);
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.roleConfigurationUpdateWorkspace,
      workspaceUpdate,
    );
    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.roleConfigurationUpdateConversation,
      conversationUpdate,
    );
  });
});
