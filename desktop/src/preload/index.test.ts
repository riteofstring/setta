import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ipcChannels } from "@shared/ipc";

describe("preload workspace API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
  });

  test("exposes typed workspace methods through IPC", async () => {
    const exposed: Record<string, unknown> = {};
    const invoke = vi.fn();
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name: string, api: unknown) => {
          exposed[name] = api;
        },
      },
      ipcRenderer: {
        invoke,
      },
    }));

    await import("./index");

    const api = exposed.setta as SettaAPI;
    expect(Object.keys(api.workspace).sort()).toEqual([
      "close",
      "openLocalFolder",
      "removeRecent",
      "reorder",
      "select",
      "session",
    ]);

    await api.workspace.session();
    await api.workspace.openLocalFolder();
    await api.workspace.select("workspace_api");
    await api.workspace.close("workspace_api");
    await api.workspace.reorder(["workspace_web", "workspace_api"]);
    await api.workspace.removeRecent("workspace_web");

    expect(invoke).toHaveBeenNthCalledWith(1, ipcChannels.workspaceSession);
    expect(invoke).toHaveBeenNthCalledWith(2, ipcChannels.workspaceOpenLocalFolder);
    expect(invoke).toHaveBeenNthCalledWith(3, ipcChannels.workspaceSelect, "workspace_api");
    expect(invoke).toHaveBeenNthCalledWith(4, ipcChannels.workspaceClose, "workspace_api");
    expect(invoke).toHaveBeenNthCalledWith(5, ipcChannels.workspaceReorder, [
      "workspace_web",
      "workspace_api",
    ]);
    expect(invoke).toHaveBeenNthCalledWith(6, ipcChannels.workspaceRemoveRecent, "workspace_web");
  });

  test("exposes typed chat methods through IPC", async () => {
    const exposed: Record<string, unknown> = {};
    const invoke = vi.fn();
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name: string, api: unknown) => {
          exposed[name] = api;
        },
      },
      ipcRenderer: {
        invoke,
      },
    }));

    await import("./index");

    const api = exposed.setta as SettaAPI;
    expect(Object.keys(api.chat).sort()).toEqual([
      "activeRun",
      "cancelRun",
      "createConversation",
      "listConversations",
      "messagePage",
      "sendMessage",
      "submitApproval",
    ]);

    await api.chat.listConversations("workspace_api");
    await api.chat.createConversation("workspace_api", "Plan");
    await api.chat.messagePage("workspace_api", "conversation_api", 10, 40);
    await api.chat.sendMessage("workspace_api", "conversation_api", "hello");
    await api.chat.cancelRun("workspace_api", "conversation_api");
    await api.chat.activeRun("workspace_api", "conversation_api");
    await api.chat.submitApproval({
      approvalId: "approval_api",
      approved: true,
      cancelled: false,
      conversationId: "conversation_api",
      response: "",
      workspaceId: "workspace_api",
    });

    expect(invoke).toHaveBeenNthCalledWith(1, ipcChannels.chatListConversations, "workspace_api");
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      ipcChannels.chatCreateConversation,
      "workspace_api",
      "Plan",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      ipcChannels.chatMessagePage,
      "workspace_api",
      "conversation_api",
      10,
      40,
    );
    expect(invoke).toHaveBeenNthCalledWith(
      4,
      ipcChannels.chatSendMessage,
      "workspace_api",
      "conversation_api",
      "hello",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      5,
      ipcChannels.chatCancelRun,
      "workspace_api",
      "conversation_api",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      6,
      ipcChannels.chatActiveRun,
      "workspace_api",
      "conversation_api",
    );
    expect(invoke).toHaveBeenNthCalledWith(7, ipcChannels.chatSubmitApproval, {
      approvalId: "approval_api",
      approved: true,
      cancelled: false,
      conversationId: "conversation_api",
      response: "",
      workspaceId: "workspace_api",
    });
  });
});
