import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ChatEvent } from "@generated/backend";
import { ipcChannels, ipcEvents } from "@shared/ipc";

describe("preload workspace API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
  });

  test("exposes typed app methods through IPC", async () => {
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
    expect(Object.keys(api.app).sort()).toEqual(["openExternalUrl", "versions"]);

    await api.app.versions();
    await api.app.openExternalUrl("https://example.test/login");

    expect(invoke).toHaveBeenNthCalledWith(1, ipcChannels.appVersions);
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      ipcChannels.appOpenExternalUrl,
      "https://example.test/login",
    );
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
    const on = vi.fn();
    const removeListener = vi.fn();
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name: string, api: unknown) => {
          exposed[name] = api;
        },
      },
      ipcRenderer: {
        invoke,
        on,
        removeListener,
      },
    }));

    await import("./index");

    const api = exposed.setta as SettaAPI;
    expect(Object.keys(api.chat).sort()).toEqual([
      "activeRun",
      "cancelRun",
      "clearQuarantine",
      "createConversation",
      "executeCommand",
      "listCommands",
      "listConversations",
      "messagePage",
      "onEvent",
      "quarantineCorruptState",
      "queueMessage",
      "resetWorkspaceState",
      "runActivity",
      "runItemOutput",
      "sendMessage",
      "steerMessage",
      "submitApproval",
    ]);

    await api.chat.listConversations("workspace_api");
    await api.chat.createConversation("workspace_api", "Plan");
    await api.chat.listCommands("workspace_api", "conversation_api");
    await api.chat.executeCommand("workspace_api", "conversation_api", "/goal");
    await api.chat.messagePage("workspace_api", "conversation_api", 10, 40);
    await api.chat.queueMessage("workspace_api", "conversation_api", "queued");
    await api.chat.runActivity("workspace_api", "run_api", 100);
    await api.chat.runItemOutput("workspace_api", "run_api", "item_api", 0, 100);
    await api.chat.sendMessage("workspace_api", "conversation_api", "hello");
    await api.chat.steerMessage("workspace_api", "conversation_api", "steer");
    await api.chat.cancelRun("workspace_api", "conversation_api");
    await api.chat.activeRun("workspace_api", "conversation_api");
    await api.chat.quarantineCorruptState("workspace_api", "workspace_api");
    await api.chat.resetWorkspaceState("workspace_api", "workspace_api");
    await api.chat.clearQuarantine("workspace_api", "workspace_api");
    await api.chat.submitApproval({
      approvalId: "approval_api",
      approved: true,
      answers: [],
      cancelled: false,
      conversationId: "conversation_api",
      response: "",
      workspaceId: "workspace_api",
    });
    const listener = vi.fn();
    const unsubscribe = api.chat.onEvent(listener);
    const event = chatEvent();
    const handler = on.mock.calls[0]?.[1];
    if (typeof handler !== "function") {
      throw new Error("chat event handler was not registered");
    }
    handler({}, event);
    unsubscribe();

    expect(invoke).toHaveBeenNthCalledWith(1, ipcChannels.chatListConversations, "workspace_api");
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      ipcChannels.chatCreateConversation,
      "workspace_api",
      "Plan",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      ipcChannels.chatListCommands,
      "workspace_api",
      "conversation_api",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      4,
      ipcChannels.chatExecuteCommand,
      "workspace_api",
      "conversation_api",
      "/goal",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      5,
      ipcChannels.chatMessagePage,
      "workspace_api",
      "conversation_api",
      10,
      40,
    );
    expect(invoke).toHaveBeenNthCalledWith(
      6,
      ipcChannels.chatQueueMessage,
      "workspace_api",
      "conversation_api",
      "queued",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      7,
      ipcChannels.chatRunActivity,
      "workspace_api",
      "run_api",
      100,
    );
    expect(invoke).toHaveBeenNthCalledWith(
      8,
      ipcChannels.chatRunItemOutput,
      "workspace_api",
      "run_api",
      "item_api",
      0,
      100,
    );
    expect(invoke).toHaveBeenNthCalledWith(
      9,
      ipcChannels.chatSendMessage,
      "workspace_api",
      "conversation_api",
      "hello",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      10,
      ipcChannels.chatSteerMessage,
      "workspace_api",
      "conversation_api",
      "steer",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      11,
      ipcChannels.chatCancelRun,
      "workspace_api",
      "conversation_api",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      12,
      ipcChannels.chatActiveRun,
      "workspace_api",
      "conversation_api",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      13,
      ipcChannels.chatQuarantineCorruptState,
      "workspace_api",
      "workspace_api",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      14,
      ipcChannels.chatResetWorkspaceState,
      "workspace_api",
      "workspace_api",
    );
    expect(invoke).toHaveBeenNthCalledWith(
      15,
      ipcChannels.chatClearQuarantine,
      "workspace_api",
      "workspace_api",
    );
    expect(invoke).toHaveBeenNthCalledWith(16, ipcChannels.chatSubmitApproval, {
      approvalId: "approval_api",
      approved: true,
      answers: [],
      cancelled: false,
      conversationId: "conversation_api",
      response: "",
      workspaceId: "workspace_api",
    });
    expect(on).toHaveBeenCalledWith(ipcEvents.chatEvent, expect.any(Function));
    expect(listener).toHaveBeenCalledWith(event);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.chatEvent, handler);
  });
});

function chatEvent(): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: "event_stream_test:1",
    payload: {
      message: {
        conversationId: "conversation_api",
        createdAt: "2026-05-29T20:00:00Z",
        delivery: "normal",
        id: "message_user",
        ordinal: 1,
        parts: [
          {
            format: "plain",
            id: "part_user",
            text: "hello",
            type: "text",
          },
        ],
        role: "user",
        runId: "",
        schemaVersion: 1,
        status: "complete",
        updatedAt: "2026-05-29T20:00:00Z",
      },
    },
    runId: "run_api",
    schemaVersion: 1,
    sequence: 1,
    streamId: "event_stream_test",
    type: "chat.message.created",
    workspaceId: "workspace_api",
  };
}
