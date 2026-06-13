import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ChatEvent,
  TerminalEvent,
  UpdateAppearanceSettingsRequest,
  WorkflowEvent,
  WorkflowGraph,
} from "@generated/backend";
import { ipcChannels, ipcEvents } from "@shared/ipc";

describe("preload workspace API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
    vi.unstubAllEnvs();
    vi.stubEnv("SETTA_E2E", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_DEBUG", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT", "");
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
      "endWindowDrag",
      "flags",
      "installedEditors",
      "moveWindowDrag",
      "openExternalUrl",
      "openWorkspaceInEditor",
      "platform",
      "startWindowDrag",
      "versions",
      "workspaceGitInfo",
    ]);

    expect(api.app.flags).toEqual({
      workflowGraphDebug: false,
      workflowGraphSyntheticGraph: null,
    });
    const dragPoint = { screenX: 200, screenY: 120 };
    await api.app.installedEditors();
    await api.app.startWindowDrag(dragPoint);
    await api.app.moveWindowDrag({ screenX: 230, screenY: 140 });
    await api.app.endWindowDrag();
    await api.app.openWorkspaceInEditor("vscode", "/tmp/api");
    await api.app.versions();
    await api.app.workspaceGitInfo("/tmp/api");
    await api.app.openExternalUrl("https://example.test/login");

    expect(api.app.platform).toBe(process.platform);
    expectInvokeCalls(invoke, [
      [ipcChannels.appInstalledEditors],
      [ipcChannels.appWindowDragStart, dragPoint],
      [ipcChannels.appWindowDragMove, { screenX: 230, screenY: 140 }],
      [ipcChannels.appWindowDragEnd],
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
      "selectedConversations",
      "session",
      "setSelectedConversation",
    ]);

    await api.workspace.session();
    await api.workspace.openLocalFolder();
    await api.workspace.openPath("/tmp/recent");
    await api.workspace.select("workspace_api");
    await api.workspace.selectedConversations();
    await api.workspace.setSelectedConversation("workspace_api", "conversation_api");
    await api.workspace.close("workspace_api");
    await api.workspace.reorder(["workspace_web", "workspace_api"]);
    await api.workspace.removeRecent("workspace_web");

    expectInvokeCalls(invoke, [
      [ipcChannels.workspaceSession],
      [ipcChannels.workspaceOpenLocalFolder],
      [ipcChannels.workspaceOpenPath, "/tmp/recent"],
      [ipcChannels.workspaceSelect, "workspace_api"],
      [ipcChannels.workspaceSelectedConversations],
      [ipcChannels.workspaceSetSelectedConversation, "workspace_api", "conversation_api"],
      [ipcChannels.workspaceClose, "workspace_api"],
      [ipcChannels.workspaceReorder, ["workspace_web", "workspace_api"]],
      [ipcChannels.workspaceRemoveRecent, "workspace_web"],
    ]);
  });

  test("exposes typed workspace native view methods through IPC", async () => {
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
    if (!api.workspaceNativeViews) {
      throw new Error("workspace native view API was not exposed");
    }
    api.workspaceNativeViews.batchBrowserViewUpdates(batch);
    await api.workspaceNativeViews.readBrowserViewStats();
    await api.workspaceNativeViews.teardownBrowserViews("phase-4-browser-pane-benchmark");
    const keyListener = vi.fn();
    const unsubscribeKey = api.workspaceNativeViews.onBrowserViewKey(keyListener);
    const keyHandler = on.mock.calls.find(
      (call) => call[0] === ipcEvents.workspaceBrowserViewKey,
    )?.[1];
    if (typeof keyHandler !== "function") {
      throw new Error("workspace browser view key handler was not registered");
    }
    keyHandler(
      {},
      {
        altKey: false,
        key: "ArrowRight",
        metaKey: false,
        shiftKey: false,
        surfaceId: "surface_browser",
        workspaceId: "phase-4-browser-pane-benchmark",
      },
    );
    unsubscribeKey();
    const snapshotListener = vi.fn();
    const unsubscribeSnapshot = api.workspaceNativeViews.onBrowserViewSnapshot(snapshotListener);
    const snapshotHandler = on.mock.calls.find(
      (call) => call[0] === ipcEvents.workspaceBrowserViewSnapshot,
    )?.[1];
    if (typeof snapshotHandler !== "function") {
      throw new Error("workspace browser view snapshot handler was not registered");
    }
    snapshotHandler(
      {},
      {
        capturedAt: 99,
        height: 120,
        imageDataUrl: "data:image/png;base64,AAAA",
        paneId: "pane_browser",
        surfaceId: "surface_browser",
        title: "Browser",
        width: 240,
        workspaceId: "phase-4-browser-pane-benchmark",
      },
    );
    unsubscribeSnapshot();

    expect(send).toHaveBeenCalledWith("workspace:browser-view-batch", batch);
    expect(invoke).toHaveBeenNthCalledWith(1, ipcChannels.workspaceBrowserViewStats);
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      ipcChannels.workspaceBrowserViewsTeardown,
      "phase-4-browser-pane-benchmark",
    );
    expect(on).toHaveBeenCalledWith("workspace:browser-view-key", expect.any(Function));
    expect(on).toHaveBeenCalledWith("workspace:browser-view-snapshot", expect.any(Function));
    expect(keyListener).toHaveBeenCalledWith({
      altKey: false,
      key: "ArrowRight",
      metaKey: false,
      shiftKey: false,
      surfaceId: "surface_browser",
      workspaceId: "phase-4-browser-pane-benchmark",
    });
    expect(snapshotListener).toHaveBeenCalledWith({
      capturedAt: 99,
      height: 120,
      imageDataUrl: "data:image/png;base64,AAAA",
      paneId: "pane_browser",
      surfaceId: "surface_browser",
      title: "Browser",
      width: 240,
      workspaceId: "phase-4-browser-pane-benchmark",
    });
    expect(removeListener).toHaveBeenCalledWith("workspace:browser-view-key", keyHandler);
    expect(removeListener).toHaveBeenCalledWith("workspace:browser-view-snapshot", snapshotHandler);
  });

  test("exposes typed appearance methods through IPC", async () => {
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
    expect(Object.keys(api.appearance).sort()).toEqual(["presets", "read", "update"]);
    const request = { settings: {} } as unknown as UpdateAppearanceSettingsRequest;

    await api.appearance.presets();
    await api.appearance.read();
    await api.appearance.update(request);

    expectInvokeCalls(invoke, [
      [ipcChannels.appearancePresets],
      [ipcChannels.appearanceRead],
      [ipcChannels.appearanceUpdate, request],
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
      "deleteConversation",
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
      "setConversationPinned",
      "steerMessage",
      "submitApproval",
    ]);

    await api.chat.listConversations("workspace_api");
    await api.chat.createConversation("workspace_api", "Plan");
    await api.chat.deleteConversation("workspace_api", "conversation_archive");
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
    await api.chat.setConversationPinned("workspace_api", "conversation_api", true);
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
      [ipcChannels.chatDeleteConversation, "workspace_api", "conversation_archive"],
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
      [ipcChannels.chatSetConversationPinned, "workspace_api", "conversation_api", true],
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
      "createProfile",
      "deleteProfile",
      "input",
      "listProfiles",
      "onEvent",
      "resize",
      "selectDefaultProfile",
      "updateProfile",
    ]);

    const profileInput = {
      args: [],
      cwd: "",
      cwdMode: "project" as const,
      env: {},
      fontFamily: "Fira Code",
      fontSize: 14,
      launchMode: "shell" as const,
      name: "Project shell",
      scrollback: 1200,
      shellPath: "",
      themeId: "setta-dark" as const,
    };
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
    await api.terminal.listProfiles();
    await api.terminal.createProfile({ profile: profileInput });
    await api.terminal.updateProfile({ id: "profile_project", profile: profileInput });
    await api.terminal.selectDefaultProfile({ id: "profile_project" });
    await api.terminal.deleteProfile({ id: "profile_project" });

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
      [ipcChannels.terminalListProfiles],
      [ipcChannels.terminalCreateProfile, { profile: profileInput }],
      [ipcChannels.terminalUpdateProfile, { id: "profile_project", profile: profileInput }],
      [ipcChannels.terminalSelectDefaultProfile, { id: "profile_project" }],
      [ipcChannels.terminalDeleteProfile, { id: "profile_project" }],
    ]);
    expect(on).toHaveBeenCalledWith(ipcEvents.terminalEvent, expect.any(Function));
    expect(listener).toHaveBeenCalledWith(event);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.terminalEvent, handler);
  });

  test("exposes typed semantic graph methods through IPC", async () => {
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
    expect(Object.keys(api.semanticGraph).sort()).toEqual([
      "acceptCartographerPatch",
      "attachChatMessage",
      "attachChatRun",
      "attachFileRange",
      "attachRunItem",
      "attachWorkflowExecution",
      "attachWorkflowNode",
      "buildCartographerWindow",
      "createEdge",
      "createNode",
      "createSteeringDirective",
      "dismissNode",
      "endActivity",
      "listActivity",
      "listActivityPage",
      "listCartographerCursors",
      "listCartographerPatches",
      "listCartographerRuns",
      "listCartographerWindows",
      "listContextPacks",
      "listEvidence",
      "mergeNodes",
      "processCartographerWindow",
      "promoteNode",
      "read",
      "readActivitySummary",
      "readCartographerProcessingState",
      "readCartographerRun",
      "readContextPack",
      "readEventHistory",
      "readNodeDetail",
      "readSteeringState",
      "rejectCartographerPatch",
      "removeEdge",
      "renameNode",
      "splitNode",
      "updateEdge",
      "updateLayoutPositions",
      "updateNode",
      "updateSteeringDirective",
    ]);

    const workspaceId = "workspace_api";
    const cartographerSourceRefs = {
      chatConversationId: "",
      chatMessageId: "",
      chatRunId: "",
      runItemId: "",
      workflowDefinitionId: "",
      workflowExecutionId: "workflow_execution_api",
      workflowNodeExecutionId: "",
      workflowNodeId: "",
    };
    await api.semanticGraph.read({ workspaceId });
    await api.semanticGraph.readNodeDetail({ nodeId: "node_api", workspaceId });
    await api.semanticGraph.listEvidence({ targetEntityId: "node_api", workspaceId });
    await api.semanticGraph.listActivity({ limit: 10, targetEntityId: "node_api", workspaceId });
    await api.semanticGraph.listActivityPage({
      actorId: "",
      actorKind: null,
      chatConversationId: "",
      chatMessageId: "",
      chatRunId: "",
      limit: 10,
      offset: 0,
      sourceId: "",
      sourceKind: null,
      targetEntityId: "",
      workflowExecutionId: "",
      workflowNodeId: "",
      workspaceId,
    });
    await api.semanticGraph.listContextPacks({
      chatRunId: "",
      limit: 10,
      offset: 0,
      targetEntityId: "node_api",
      workflowExecutionId: "",
      workspaceId,
    });
    await api.semanticGraph.buildCartographerWindow({
      runStatus: "",
      sourceRefs: cartographerSourceRefs,
      summary: "Manual cartographer window",
      targetEntityId: "node_api",
      terminalReason: "",
      triggerKind: "manual",
      workspaceId,
    });
    await api.semanticGraph.processCartographerWindow({
      windowId: "cartographer_window_api",
      workspaceId,
    });
    await api.semanticGraph.readCartographerProcessingState({});
    await api.semanticGraph.readCartographerRun({
      runId: "cartographer_run_api",
      workspaceId,
    });
    await api.semanticGraph.listCartographerRuns({
      chatRunId: "",
      limit: 10,
      targetEntityId: "node_api",
      workflowExecutionId: "workflow_execution_api",
      workspaceId,
    });
    await api.semanticGraph.listCartographerWindows({
      chatRunId: "",
      limit: 10,
      runId: "",
      sourceId: "",
      sourceKind: "workflow_execution",
      workflowExecutionId: "workflow_execution_api",
      workspaceId,
    });
    await api.semanticGraph.listCartographerCursors({
      chatRunId: "",
      limit: 10,
      workflowExecutionId: "workflow_execution_api",
      workspaceId,
    });
    await api.semanticGraph.listCartographerPatches({
      limit: 10,
      runId: "cartographer_run_api",
      semanticTargetId: "node_api",
      status: "pending_review",
      workspaceId,
    });
    await api.semanticGraph.acceptCartographerPatch({
      patchId: "cartographer_patch_api",
      workspaceId,
    });
    await api.semanticGraph.rejectCartographerPatch({
      patchId: "cartographer_patch_api",
      workspaceId,
    });
    await api.semanticGraph.readActivitySummary({ recentLimit: 3, workspaceId });
    await api.semanticGraph.readContextPack({ packId: "context_pack_api", workspaceId });
    await api.semanticGraph.readSteeringState({ targetEntityId: "node_api", workspaceId });
    await api.semanticGraph.readEventHistory({
      beforeLogicalClock: 0,
      limit: 20,
      targetEntityId: "node_api",
      workspaceId,
    });
    await api.semanticGraph.updateLayoutPositions({
      positions: [{ entityId: "node_api", pinned: true, x: 12, y: -8 }],
      workspaceId,
    });
    await api.semanticGraph.attachWorkflowExecution({
      activityKind: "exploring",
      actorId: "user_api",
      actorKind: "user",
      nodeId: "node_api",
      summary: "",
      workflowExecutionId: "workflow_execution_api",
      workspaceId,
    });
    await api.semanticGraph.attachWorkflowNode({
      activityKind: "debugging",
      actorId: "user_api",
      actorKind: "user",
      nodeId: "node_api",
      summary: "",
      workflowDefinitionId: "",
      workflowExecutionId: "workflow_execution_api",
      workflowNodeExecutionId: "workflow_node_execution_api",
      workflowNodeId: "workflow_node_api",
      workspaceId,
    });
    await api.semanticGraph.attachChatRun({
      activityKind: "exploring",
      actorId: "user_api",
      actorKind: "user",
      chatRunId: "run_api",
      nodeId: "node_api",
      summary: "",
      workspaceId,
    });
    await api.semanticGraph.attachChatMessage({
      activityKind: "exploring",
      actorId: "user_api",
      actorKind: "user",
      chatConversationId: "conversation_api",
      chatMessageId: "message_api",
      nodeId: "node_api",
      summary: "",
      workspaceId,
    });
    await api.semanticGraph.attachRunItem({
      activityKind: "validating",
      actorId: "user_api",
      actorKind: "user",
      chatRunId: "run_api",
      nodeId: "node_api",
      runItemId: "run_item_api",
      summary: "",
      workspaceId,
    });
    await api.semanticGraph.attachFileRange({
      activityKind: "editing",
      actorId: "user_api",
      actorKind: "user",
      nodeId: "node_api",
      path: "docs/plan.md",
      rangeEnd: 2,
      rangeStart: 1,
      summary: "",
      workspaceId,
    });
    await api.semanticGraph.endActivity({
      activityIntervalId: "activity_api",
      actorId: "user_api",
      actorKind: "user",
      workspaceId,
    });
    await api.semanticGraph.renameNode({
      actorId: "user_api",
      actorKind: "user",
      label: "Renamed node",
      nodeId: "node_api",
      workspaceId,
    });
    await api.semanticGraph.updateNode({
      actorId: "user_api",
      actorKind: "user",
      kind: null,
      nodeId: "node_api",
      summary: "Updated summary",
      workspaceId,
    });
    await api.semanticGraph.dismissNode({
      actorId: "user_api",
      actorKind: "user",
      nodeId: "node_api",
      workspaceId,
    });
    await api.semanticGraph.promoteNode({
      actorId: "user_api",
      actorKind: "user",
      nodeId: "node_api",
      workspaceId,
    });
    await api.semanticGraph.splitNode({
      actorId: "user_api",
      actorKind: "user",
      nodes: [{ kind: "finding", label: "Child", nodeId: "node_child", summary: "" }],
      reassignments: { activity: [], edges: [], evidence: [], layout: [], steering: [] },
      sourceNodeId: "node_api",
      workspaceId,
    });
    await api.semanticGraph.mergeNodes({
      actorId: "user_api",
      actorKind: "user",
      reassignments: { activity: [], edges: [], evidence: [], layout: [], steering: [] },
      sourceNodeIds: ["node_child"],
      targetNode: { kind: "decision", label: "Merged", nodeId: "node_merged", summary: "" },
      workspaceId,
    });
    await api.semanticGraph.createNode({
      actorId: "user_api",
      actorKind: "user",
      kind: "constraint",
      label: "Constraint",
      nodeId: "node_constraint",
      summary: "",
      workspaceId,
    });
    await api.semanticGraph.createEdge({
      actorId: "user_api",
      actorKind: "user",
      edgeId: "edge_api",
      fromNodeId: "node_constraint",
      kind: "constrains",
      label: "constrains",
      summary: "",
      toNodeId: "node_api",
      workspaceId,
    });
    await api.semanticGraph.updateEdge({
      actorId: "user_api",
      actorKind: "user",
      edgeId: "edge_api",
      kind: null,
      label: null,
      summary: "Updated edge",
      workspaceId,
    });
    await api.semanticGraph.removeEdge({
      actorId: "user_api",
      actorKind: "user",
      edgeId: "edge_api",
      workspaceId,
    });
    await api.semanticGraph.createSteeringDirective({
      actorId: "user_api",
      actorKind: "user",
      chatConversationId: "",
      chatMessageId: "",
      chatRunId: "",
      instruction: "Focus here",
      kind: "focus",
      runItemId: "",
      scope: "session",
      targetEntityId: "node_api",
      workflowDefinitionId: "",
      workflowExecutionId: "",
      workflowNodeExecutionId: "",
      workflowNodeId: "",
      workspaceId,
    });
    await api.semanticGraph.updateSteeringDirective({
      actorId: "user_api",
      actorKind: "user",
      directiveId: "steering_api",
      instruction: null,
      status: "completed",
      supersedesDirectiveId: "",
      workspaceId,
    });

    expectInvokeCalls(invoke, [
      [ipcChannels.semanticGraphRead, { workspaceId }],
      [ipcChannels.semanticGraphNodeDetail, { nodeId: "node_api", workspaceId }],
      [ipcChannels.semanticGraphEvidenceList, { targetEntityId: "node_api", workspaceId }],
      [
        ipcChannels.semanticGraphActivityList,
        { limit: 10, targetEntityId: "node_api", workspaceId },
      ],
      [
        ipcChannels.semanticGraphActivityPage,
        {
          actorId: "",
          actorKind: null,
          chatConversationId: "",
          chatMessageId: "",
          chatRunId: "",
          limit: 10,
          offset: 0,
          sourceId: "",
          sourceKind: null,
          targetEntityId: "",
          workflowExecutionId: "",
          workflowNodeId: "",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphContextPackList,
        {
          chatRunId: "",
          limit: 10,
          offset: 0,
          targetEntityId: "node_api",
          workflowExecutionId: "",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphCartographerWindowBuild,
        {
          runStatus: "",
          sourceRefs: cartographerSourceRefs,
          summary: "Manual cartographer window",
          targetEntityId: "node_api",
          terminalReason: "",
          triggerKind: "manual",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphCartographerWindowProcess,
        {
          windowId: "cartographer_window_api",
          workspaceId,
        },
      ],
      [ipcChannels.semanticGraphCartographerProcessingState, {}],
      [
        ipcChannels.semanticGraphCartographerRunRead,
        {
          runId: "cartographer_run_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphCartographerRunList,
        {
          chatRunId: "",
          limit: 10,
          targetEntityId: "node_api",
          workflowExecutionId: "workflow_execution_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphCartographerWindowList,
        {
          chatRunId: "",
          limit: 10,
          runId: "",
          sourceId: "",
          sourceKind: "workflow_execution",
          workflowExecutionId: "workflow_execution_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphCartographerCursorList,
        {
          chatRunId: "",
          limit: 10,
          workflowExecutionId: "workflow_execution_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphCartographerPatchList,
        {
          limit: 10,
          runId: "cartographer_run_api",
          semanticTargetId: "node_api",
          status: "pending_review",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphCartographerPatchAccept,
        {
          patchId: "cartographer_patch_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphCartographerPatchReject,
        {
          patchId: "cartographer_patch_api",
          workspaceId,
        },
      ],
      [ipcChannels.semanticGraphActivitySummary, { recentLimit: 3, workspaceId }],
      [ipcChannels.semanticGraphContextPackRead, { packId: "context_pack_api", workspaceId }],
      [ipcChannels.semanticGraphSteeringRead, { targetEntityId: "node_api", workspaceId }],
      [
        ipcChannels.semanticGraphEventHistory,
        {
          beforeLogicalClock: 0,
          limit: 20,
          targetEntityId: "node_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphLayoutUpdate,
        {
          positions: [{ entityId: "node_api", pinned: true, x: 12, y: -8 }],
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphAttachWorkflowExecution,
        {
          activityKind: "exploring",
          actorId: "user_api",
          actorKind: "user",
          nodeId: "node_api",
          summary: "",
          workflowExecutionId: "workflow_execution_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphAttachWorkflowNode,
        {
          activityKind: "debugging",
          actorId: "user_api",
          actorKind: "user",
          nodeId: "node_api",
          summary: "",
          workflowDefinitionId: "",
          workflowExecutionId: "workflow_execution_api",
          workflowNodeExecutionId: "workflow_node_execution_api",
          workflowNodeId: "workflow_node_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphAttachChatRun,
        {
          activityKind: "exploring",
          actorId: "user_api",
          actorKind: "user",
          chatRunId: "run_api",
          nodeId: "node_api",
          summary: "",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphAttachChatMessage,
        {
          activityKind: "exploring",
          actorId: "user_api",
          actorKind: "user",
          chatConversationId: "conversation_api",
          chatMessageId: "message_api",
          nodeId: "node_api",
          summary: "",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphAttachRunItem,
        {
          activityKind: "validating",
          actorId: "user_api",
          actorKind: "user",
          chatRunId: "run_api",
          nodeId: "node_api",
          runItemId: "run_item_api",
          summary: "",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphAttachFileRange,
        {
          activityKind: "editing",
          actorId: "user_api",
          actorKind: "user",
          nodeId: "node_api",
          path: "docs/plan.md",
          rangeEnd: 2,
          rangeStart: 1,
          summary: "",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphActivityEnd,
        {
          activityIntervalId: "activity_api",
          actorId: "user_api",
          actorKind: "user",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphRenameNode,
        {
          actorId: "user_api",
          actorKind: "user",
          label: "Renamed node",
          nodeId: "node_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphUpdateNode,
        {
          actorId: "user_api",
          actorKind: "user",
          kind: null,
          nodeId: "node_api",
          summary: "Updated summary",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphDismissNode,
        {
          actorId: "user_api",
          actorKind: "user",
          nodeId: "node_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphPromoteNode,
        {
          actorId: "user_api",
          actorKind: "user",
          nodeId: "node_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphSplitNode,
        {
          actorId: "user_api",
          actorKind: "user",
          nodes: [{ kind: "finding", label: "Child", nodeId: "node_child", summary: "" }],
          reassignments: { activity: [], edges: [], evidence: [], layout: [], steering: [] },
          sourceNodeId: "node_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphMergeNodes,
        {
          actorId: "user_api",
          actorKind: "user",
          reassignments: { activity: [], edges: [], evidence: [], layout: [], steering: [] },
          sourceNodeIds: ["node_child"],
          targetNode: { kind: "decision", label: "Merged", nodeId: "node_merged", summary: "" },
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphCreateNode,
        {
          actorId: "user_api",
          actorKind: "user",
          kind: "constraint",
          label: "Constraint",
          nodeId: "node_constraint",
          summary: "",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphCreateEdge,
        {
          actorId: "user_api",
          actorKind: "user",
          edgeId: "edge_api",
          fromNodeId: "node_constraint",
          kind: "constrains",
          label: "constrains",
          summary: "",
          toNodeId: "node_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphUpdateEdge,
        {
          actorId: "user_api",
          actorKind: "user",
          edgeId: "edge_api",
          kind: null,
          label: null,
          summary: "Updated edge",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphRemoveEdge,
        {
          actorId: "user_api",
          actorKind: "user",
          edgeId: "edge_api",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphCreateSteeringDirective,
        {
          actorId: "user_api",
          actorKind: "user",
          chatConversationId: "",
          chatMessageId: "",
          chatRunId: "",
          instruction: "Focus here",
          kind: "focus",
          runItemId: "",
          scope: "session",
          targetEntityId: "node_api",
          workflowDefinitionId: "",
          workflowExecutionId: "",
          workflowNodeExecutionId: "",
          workflowNodeId: "",
          workspaceId,
        },
      ],
      [
        ipcChannels.semanticGraphUpdateSteeringDirective,
        {
          actorId: "user_api",
          actorKind: "user",
          directiveId: "steering_api",
          instruction: null,
          status: "completed",
          supersedesDirectiveId: "",
          workspaceId,
        },
      ],
    ]);
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
    runnerKind: null,
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
    layout: { nodes: [] },
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
