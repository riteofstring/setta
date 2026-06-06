import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ChatEvent, TerminalEvent, WorkflowEvent, WorkflowGraph } from "@generated/backend";
import { ipcChannels, ipcEvents } from "@shared/ipc";

describe("preload workspace API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
    vi.unstubAllEnvs();
    vi.stubEnv("SETTA_E2E", "");
    vi.stubEnv("SETTA_PIXI_WORKSPACE_DEBUG", "");
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

  test("exposes typed niri native view methods through IPC", async () => {
    const exposed: Record<string, unknown> = {};
    const invoke = vi.fn();
    const on = vi.fn();
    const removeListener = vi.fn();
    const send = vi.fn();
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
        send,
      },
    }));

    await import("./index");

    const api = exposed.setta as SettaAPI;
    const batch = {
      focusedSurfaceId: "surface_browser",
      totalBrowserPanes: 24,
      updates: [],
      visibleBrowserPanes: 6,
      workspaceId: "phase-4-browser-pane-benchmark",
    };
    if (!api.niriNativeViews) {
      throw new Error("niri native view API was not exposed");
    }
    api.niriNativeViews.batchBrowserViewUpdates(batch);
    await api.niriNativeViews.readBrowserViewStats();
    await api.niriNativeViews.teardownBrowserViews("phase-4-browser-pane-benchmark");
    const listener = vi.fn();
    const unsubscribe = api.niriNativeViews.onBrowserViewKey(listener);
    const handler = on.mock.calls[0]?.[1];
    if (typeof handler !== "function") {
      throw new Error("niri browser view key handler was not registered");
    }
    handler(
      {},
      {
        key: "ArrowRight",
        surfaceId: "surface_browser",
        workspaceId: "phase-4-browser-pane-benchmark",
      },
    );
    unsubscribe();

    expect(send).toHaveBeenCalledWith("niri:browser-view-batch", batch);
    expect(invoke).toHaveBeenNthCalledWith(1, ipcChannels.niriBrowserViewStats);
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      ipcChannels.niriBrowserViewsTeardown,
      "phase-4-browser-pane-benchmark",
    );
    expect(on).toHaveBeenCalledWith("niri:browser-view-key", expect.any(Function));
    expect(listener).toHaveBeenCalledWith({
      key: "ArrowRight",
      surfaceId: "surface_browser",
      workspaceId: "phase-4-browser-pane-benchmark",
    });
    expect(removeListener).toHaveBeenCalledWith("niri:browser-view-key", handler);
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

  test("exposes typed terminal methods through IPC", async () => {
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
    expect(Object.keys(api.terminal).sort()).toEqual([
      "attach",
      "close",
      "create",
      "input",
      "onEvent",
      "resize",
    ]);

    await api.terminal.create("workspace_api", "pane_terminal", {
      cols: 80,
      rows: 24,
    });
    await api.terminal.attach("workspace_api", "pane_terminal");
    await api.terminal.input({
      dataBase64: "aGVsbG8=",
      sessionId: "terminal_api",
    });
    await api.terminal.resize({
      cols: 100,
      rows: 30,
      sessionId: "terminal_api",
    });
    await api.terminal.close("terminal_api", "terminate");

    const event = terminalEvent();
    const listener = vi.fn();
    const unsubscribe = api.terminal.onEvent(listener);
    const handler = on.mock.calls.find((call) => call[0] === ipcEvents.terminalEvent)?.[1];
    if (typeof handler !== "function") {
      throw new Error("terminal event handler was not registered");
    }
    handler({}, event);
    unsubscribe();

    expectInvokeCalls(invoke, [
      [ipcChannels.terminalCreate, "workspace_api", "pane_terminal", "", "", 80, 24],
      [ipcChannels.terminalAttach, "workspace_api", "pane_terminal"],
      [
        ipcChannels.terminalInput,
        {
          dataBase64: "aGVsbG8=",
          sessionId: "terminal_api",
        },
      ],
      [
        ipcChannels.terminalResize,
        {
          cols: 100,
          rows: 30,
          sessionId: "terminal_api",
        },
      ],
      [ipcChannels.terminalClose, "terminal_api", "terminate"],
    ]);
    expect(on).toHaveBeenCalledWith(ipcEvents.terminalEvent, expect.any(Function));
    expect(listener).toHaveBeenCalledWith(event);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.terminalEvent, handler);
  });

  test("exposes typed workflow methods through IPC", async () => {
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
    const graph = workflowGraph();
    expect(Object.keys(api.workflow).sort()).toEqual([
      "cancelExecution",
      "createDefinition",
      "deleteDefinition",
      "executionEvents",
      "graphProjection",
      "listDefinitions",
      "onEvent",
      "readDefinition",
      "readExecution",
      "startExecution",
      "submitApproval",
      "updateDefinition",
      "validateDefinition",
    ]);

    await api.workflow.listDefinitions("workspace_api");
    await api.workflow.createDefinition("workspace_api", "Review", "phase 4", graph);
    await api.workflow.readDefinition("workspace_api", "workflow_definition_api");
    await api.workflow.updateDefinition(
      "workspace_api",
      "workflow_definition_api",
      "Review updated",
      "phase 4 updated",
      graph,
    );
    await api.workflow.deleteDefinition("workspace_api", "workflow_definition_api");
    await api.workflow.validateDefinition("workspace_api", graph);
    await api.workflow.startExecution("workspace_api", "workflow_definition_api");
    await api.workflow.startExecution(
      "workspace_api",
      "workflow_definition_api",
      "workflow_version_api",
    );
    await api.workflow.cancelExecution("workspace_api", "workflow_execution_api");
    await api.workflow.readExecution("workspace_api", "workflow_execution_api");
    await api.workflow.executionEvents("workspace_api", "workflow_execution_api", 10, 20);
    await api.workflow.graphProjection("workspace_api");
    await api.workflow.graphProjection(
      "workspace_api",
      "workflow_definition_api",
      "workflow_version_api",
      "workflow_execution_api",
    );
    await api.workflow.submitApproval({
      answers: [],
      approvalId: "approval_api",
      approved: true,
      cancelled: false,
      executionId: "workflow_execution_api",
      nodeExecutionId: "workflow_node_execution_api",
      response: "",
      workspaceId: "workspace_api",
    });

    const event = workflowEvent();
    const listener = vi.fn();
    const unsubscribe = api.workflow.onEvent(listener);
    const handler = on.mock.calls.find((call) => call[0] === ipcEvents.workflowEvent)?.[1];
    if (typeof handler !== "function") {
      throw new Error("workflow event handler was not registered");
    }
    handler({}, event);
    unsubscribe();

    expectInvokeCalls(invoke, [
      [ipcChannels.workflowListDefinitions, "workspace_api"],
      [ipcChannels.workflowCreateDefinition, "workspace_api", "Review", "phase 4", graph],
      [ipcChannels.workflowReadDefinition, "workspace_api", "workflow_definition_api"],
      [
        ipcChannels.workflowUpdateDefinition,
        "workspace_api",
        "workflow_definition_api",
        "Review updated",
        "phase 4 updated",
        graph,
      ],
      [ipcChannels.workflowDeleteDefinition, "workspace_api", "workflow_definition_api"],
      [ipcChannels.workflowValidateDefinition, "workspace_api", graph],
      [ipcChannels.workflowStartExecution, "workspace_api", "workflow_definition_api", ""],
      [
        ipcChannels.workflowStartExecution,
        "workspace_api",
        "workflow_definition_api",
        "workflow_version_api",
      ],
      [ipcChannels.workflowCancelExecution, "workspace_api", "workflow_execution_api"],
      [ipcChannels.workflowReadExecution, "workspace_api", "workflow_execution_api"],
      [ipcChannels.workflowExecutionEvents, "workspace_api", "workflow_execution_api", 10, 20],
      [ipcChannels.workflowGraphProjection, "workspace_api", "", "", ""],
      [
        ipcChannels.workflowGraphProjection,
        "workspace_api",
        "workflow_definition_api",
        "workflow_version_api",
        "workflow_execution_api",
      ],
      [
        ipcChannels.workflowSubmitApproval,
        {
          answers: [],
          approvalId: "approval_api",
          approved: true,
          cancelled: false,
          executionId: "workflow_execution_api",
          nodeExecutionId: "workflow_node_execution_api",
          response: "",
          workspaceId: "workspace_api",
        },
      ],
    ]);
    expect(on).toHaveBeenCalledWith(ipcEvents.workflowEvent, expect.any(Function));
    expect(listener).toHaveBeenCalledWith(event);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.workflowEvent, handler);
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

function terminalEvent(): TerminalEvent {
  return {
    emittedAt: "2026-06-06T12:00:00Z",
    eventId: "terminal_stream_test:1",
    paneId: "pane_terminal",
    payload: {
      byteCount: 5,
      cols: 80,
      cwd: "/tmp/workspace",
      dataBase64: "aGVsbG8=",
      droppedBytes: 0,
      droppedChunks: 0,
      exitCode: 0,
      message: "",
      rows: 24,
      status: "running",
    },
    schemaVersion: 1,
    sequence: 1,
    sessionId: "terminal_api",
    streamId: "terminal_stream_test",
    type: "terminal.output",
    workspaceId: "workspace_api",
  };
}

function workflowEvent(): WorkflowEvent {
  return {
    createdAt: "2026-06-05T12:00:00Z",
    definitionId: "workflow_definition_api",
    definitionVersionId: "workflow_version_api",
    details: {},
    executionId: "workflow_execution_api",
    id: "workflow_event_api",
    message: "workflow started",
    nodeExecutionId: "",
    nodeId: "",
    ordinal: 1,
    schemaVersion: 1,
    tokenId: "",
    type: "workflow.execution.started",
    workspaceId: "workspace_api",
  };
}

function workflowGraph(): WorkflowGraph {
  return {
    edges: [
      {
        condition: null,
        fromNodeId: "start",
        id: "start_end",
        kind: "normal",
        toNodeId: "end",
      },
    ],
    nodes: [
      {
        action: null,
        gateway: null,
        id: "start",
        kind: "start",
        loopGuard: null,
        title: "Start",
      },
      {
        action: null,
        gateway: null,
        id: "end",
        kind: "end",
        loopGuard: null,
        title: "End",
      },
    ],
  };
}
