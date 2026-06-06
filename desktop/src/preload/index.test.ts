import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ChatEvent } from "@generated/backend";
import { ipcChannels, ipcEvents } from "@shared/ipc";

describe("preload workspace API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
    vi.unstubAllEnvs();
    vi.stubEnv("SETTA_E2E", "");
    vi.stubEnv("SETTA_PIXI_WORKSPACE_DEBUG", "");
    vi.stubEnv("SETTA_PIXI_WORKSPACE_PROTOTYPE", "");
    vi.stubEnv("SETTA_PIXI_WORKSPACE_SYNTHETIC_EDGES_PER_NODE", "");
    vi.stubEnv("SETTA_PIXI_WORKSPACE_SYNTHETIC_NODE_COUNT", "");
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
    expect(Object.keys(api.app).sort()).toEqual([
      "flags",
      "installedEditors",
      "openExternalUrl",
      "openWorkspaceInEditor",
      "platform",
      "versions",
      "workspaceGitInfo",
    ]);

    expect(api.app.flags).toEqual({
      pixiWorkspaceDebug: false,
      pixiWorkspacePrototype: false,
      pixiWorkspaceSyntheticGraph: null,
    });
    await api.app.installedEditors();
    await api.app.openWorkspaceInEditor("vscode", "/tmp/api");
    await api.app.versions();
    await api.app.workspaceGitInfo("/tmp/api");
    await api.app.openExternalUrl("https://example.test/login");

    expect(api.app.platform).toBe(process.platform);
    expectInvokeCalls(invoke, [
      [ipcChannels.appInstalledEditors],
      [ipcChannels.appOpenWorkspaceInEditor, "vscode", "/tmp/api"],
      [ipcChannels.appVersions],
      [ipcChannels.appWorkspaceGitInfo, "/tmp/api"],
      [ipcChannels.appOpenExternalUrl, "https://example.test/login"],
    ]);
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
      "openPath",
      "removeRecent",
      "reorder",
      "select",
      "session",
    ]);

    await api.workspace.session();
    await api.workspace.openLocalFolder();
    await api.workspace.openPath("/tmp/recent");
    await api.workspace.select("workspace_api");
    await api.workspace.close("workspace_api");
    await api.workspace.reorder(["workspace_web", "workspace_api"]);
    await api.workspace.removeRecent("workspace_web");

    expectInvokeCalls(invoke, [
      [ipcChannels.workspaceSession],
      [ipcChannels.workspaceOpenLocalFolder],
      [ipcChannels.workspaceOpenPath, "/tmp/recent"],
      [ipcChannels.workspaceSelect, "workspace_api"],
      [ipcChannels.workspaceClose, "workspace_api"],
      [ipcChannels.workspaceReorder, ["workspace_web", "workspace_api"]],
      [ipcChannels.workspaceRemoveRecent, "workspace_web"],
    ]);
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
      "createConversation",
      "editQueuedMessage",
      "executeCommand",
      "listCommands",
      "listConversations",
      "markConversationRead",
      "messagePage",
      "onEvent",
      "queueMessage",
      "removeQueuedMessage",
      "runActivity",
      "runItemOutput",
      "sendMessage",
      "sendSteeringImmediately",
      "setCodexModel",
      "setCodexReasoningEffort",
      "steerMessage",
      "submitApproval",
    ]);

    await api.chat.listConversations("workspace_api");
    await api.chat.createConversation("workspace_api", "Plan");
    await api.chat.listCommands("workspace_api", "conversation_api");
    await api.chat.executeCommand("workspace_api", "conversation_api", "/goal");
    await api.chat.executeCommand("workspace_api", "conversation_api", "/goal replacement", {
      confirmGoalReplacement: true,
    });
    await api.chat.markConversationRead("workspace_api", "conversation_api");
    await api.chat.messagePage("workspace_api", "conversation_api", 10, 40);
    await api.chat.queueMessage("workspace_api", "conversation_api", "queued");
    await api.chat.editQueuedMessage(
      "workspace_api",
      "conversation_api",
      "message_queued",
      "edited",
    );
    await api.chat.removeQueuedMessage("workspace_api", "conversation_api", "message_queued");
    await api.chat.runActivity("workspace_api", "run_api", 100);
    await api.chat.runItemOutput("workspace_api", "run_api", "item_api", 0, 100);
    await api.chat.sendMessage("workspace_api", "conversation_api", "hello");
    await api.chat.setCodexModel("workspace_api", "conversation_api", "gpt-test");
    await api.chat.setCodexReasoningEffort("workspace_api", "conversation_api", "high");
    await api.chat.steerMessage("workspace_api", "conversation_api", "steer");
    await api.chat.sendSteeringImmediately("workspace_api", "conversation_api", "now");
    await api.chat.cancelRun("workspace_api", "conversation_api");
    await api.chat.activeRun("workspace_api", "conversation_api");
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

    expectInvokeCalls(invoke, [
      [ipcChannels.chatListConversations, "workspace_api"],
      [ipcChannels.chatCreateConversation, "workspace_api", "Plan"],
      [ipcChannels.chatListCommands, "workspace_api", "conversation_api"],
      [ipcChannels.chatExecuteCommand, "workspace_api", "conversation_api", "/goal", false],
      [
        ipcChannels.chatExecuteCommand,
        "workspace_api",
        "conversation_api",
        "/goal replacement",
        true,
      ],
      [ipcChannels.chatMarkConversationRead, "workspace_api", "conversation_api"],
      [ipcChannels.chatMessagePage, "workspace_api", "conversation_api", 10, 40],
      [ipcChannels.chatQueueMessage, "workspace_api", "conversation_api", "queued"],
      [
        ipcChannels.chatEditQueuedMessage,
        "workspace_api",
        "conversation_api",
        "message_queued",
        "edited",
      ],
      [ipcChannels.chatRemoveQueuedMessage, "workspace_api", "conversation_api", "message_queued"],
      [ipcChannels.chatRunActivity, "workspace_api", "run_api", 100],
      [ipcChannels.chatRunItemOutput, "workspace_api", "run_api", "item_api", 0, 100],
      [ipcChannels.chatSendMessage, "workspace_api", "conversation_api", "hello"],
      [ipcChannels.chatSetCodexModel, "workspace_api", "conversation_api", "gpt-test"],
      [ipcChannels.chatSetCodexReasoningEffort, "workspace_api", "conversation_api", "high"],
      [ipcChannels.chatSteerMessage, "workspace_api", "conversation_api", "steer"],
      [ipcChannels.chatSendSteeringImmediately, "workspace_api", "conversation_api", "now"],
      [ipcChannels.chatCancelRun, "workspace_api", "conversation_api"],
      [ipcChannels.chatActiveRun, "workspace_api", "conversation_api"],
      [
        ipcChannels.chatSubmitApproval,
        {
          approvalId: "approval_api",
          approved: true,
          answers: [],
          cancelled: false,
          conversationId: "conversation_api",
          response: "",
          workspaceId: "workspace_api",
        },
      ],
    ]);
    expect(on).toHaveBeenCalledWith(ipcEvents.chatEvent, expect.any(Function));
    expect(listener).toHaveBeenCalledWith(event);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.chatEvent, handler);
  });
});

function expectInvokeCalls(invoke: ReturnType<typeof vi.fn>, calls: unknown[][]) {
  expect(invoke).toHaveBeenCalledTimes(calls.length);
  for (const call of calls) {
    expect(invoke).toHaveBeenCalledWith(...call);
  }
}

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
