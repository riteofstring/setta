import type {
  BackendHealth,
  ChatMessage,
  MessagePage,
  OpenWorkspaceResponse,
  Run,
  WorkspaceSession,
} from "@generated/backend";
import type { RuntimeVersions, SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useWorkspaceStore } from "./workspace-store";

describe("workspace store", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      error: null,
      operation: null,
      session: null,
      status: "idle",
    });
  });

  test("loads the authoritative backend session", async () => {
    const session = workspaceSession("workspace_api");
    const sessionMock = vi.fn().mockResolvedValue(session);
    installSettaAPI({
      workspace: {
        session: sessionMock,
      },
    });

    await useWorkspaceStore.getState().loadSession();

    expect(useWorkspaceStore.getState().session).toEqual(session);
    expect(useWorkspaceStore.getState().status).toBe("ready");
    expect(sessionMock).toHaveBeenCalledOnce();
  });

  test("open local folder updates from backend response", async () => {
    const session = workspaceSession("workspace_web");
    const response: OpenWorkspaceResponse = {
      session,
      workspace: firstWorkspace(session),
    };
    installSettaAPI({
      workspace: {
        openLocalFolder: vi.fn().mockResolvedValue(response),
      },
    });

    await useWorkspaceStore.getState().openLocalFolder();

    expect(useWorkspaceStore.getState().session).toEqual(session);
    expect(useWorkspaceStore.getState().operation).toBeNull();
    expect(useWorkspaceStore.getState().status).toBe("ready");
  });

  test("canceled open dialog does not mutate the current session", async () => {
    const session = workspaceSession("workspace_api");
    useWorkspaceStore.setState({ session, status: "ready" });
    installSettaAPI({
      workspace: {
        openLocalFolder: vi.fn().mockResolvedValue(null),
      },
    });

    await useWorkspaceStore.getState().openLocalFolder();

    expect(useWorkspaceStore.getState().session).toEqual(session);
    expect(useWorkspaceStore.getState().operation).toBeNull();
  });

  test("select close reorder and remove recent replace state from backend responses", async () => {
    const selected = workspaceSession("workspace_api");
    const opened = workspaceSession("workspace_web");
    const closed = { ...selected, activeWorkspaces: [], selectedWorkspaceId: "" };
    const reordered = {
      ...selected,
      activeWorkspaces: [...selected.activeWorkspaces].reverse(),
    };
    const removed = { ...selected, recentWorkspaces: [] };
    installSettaAPI({
      workspace: {
        close: vi.fn().mockResolvedValue(closed),
        openPath: vi.fn().mockResolvedValue({
          session: opened,
          workspace: firstWorkspace(opened),
        }),
        removeRecent: vi.fn().mockResolvedValue(removed),
        reorder: vi.fn().mockResolvedValue(reordered),
        select: vi.fn().mockResolvedValue(selected),
      },
    });

    await useWorkspaceStore.getState().selectWorkspace("workspace_api");
    expect(useWorkspaceStore.getState().session).toEqual(selected);

    await useWorkspaceStore.getState().reorderWorkspaces(["workspace_web", "workspace_api"]);
    expect(useWorkspaceStore.getState().session).toEqual(reordered);

    await useWorkspaceStore.getState().closeWorkspace("workspace_api");
    expect(useWorkspaceStore.getState().session).toEqual(closed);

    await useWorkspaceStore.getState().openWorkspacePath("/tmp/web");
    expect(useWorkspaceStore.getState().session).toEqual(opened);

    await useWorkspaceStore.getState().removeRecent("workspace_api");
    expect(useWorkspaceStore.getState().session).toEqual(removed);
  });

  test("stores specific backend errors for the renderer", async () => {
    installSettaAPI({
      workspace: {
        session: vi.fn().mockRejectedValue(new Error("workspace path does not exist")),
      },
    });

    await useWorkspaceStore.getState().loadSession();

    expect(useWorkspaceStore.getState().status).toBe("error");
    expect(useWorkspaceStore.getState().error).toBe("workspace path does not exist");
  });

  test("clears workspace errors without fabricating a ready session", () => {
    useWorkspaceStore.setState({ error: "workspace failed", session: null, status: "error" });

    useWorkspaceStore.getState().clearError();

    expect(useWorkspaceStore.getState().error).toBeNull();
    expect(useWorkspaceStore.getState().status).toBe("idle");
  });

  test("newer operation result wins over older operation result", async () => {
    const older = deferred<WorkspaceSession>();
    const newer = deferred<WorkspaceSession>();
    const olderSession = workspaceSession("workspace_api");
    const newerSession = workspaceSession("workspace_web");
    installSettaAPI({
      workspace: {
        close: vi.fn().mockReturnValue(older.promise),
        select: vi.fn().mockReturnValue(newer.promise),
      },
    });

    const closePromise = useWorkspaceStore.getState().closeWorkspace("workspace_api");
    const selectPromise = useWorkspaceStore.getState().selectWorkspace("workspace_web");
    newer.resolve(newerSession);
    await selectPromise;
    older.resolve(olderSession);
    await closePromise;

    expect(useWorkspaceStore.getState().session).toEqual(newerSession);
    expect(useWorkspaceStore.getState().operation).toBeNull();
    expect(useWorkspaceStore.getState().status).toBe("ready");
  });

  test("stale older rejection does not overwrite newer success", async () => {
    const older = deferred<WorkspaceSession>();
    const newer = deferred<WorkspaceSession>();
    const newerSession = workspaceSession("workspace_web");
    installSettaAPI({
      workspace: {
        close: vi.fn().mockReturnValue(older.promise),
        select: vi.fn().mockReturnValue(newer.promise),
      },
    });

    const closePromise = useWorkspaceStore.getState().closeWorkspace("workspace_api");
    const selectPromise = useWorkspaceStore.getState().selectWorkspace("workspace_web");
    newer.resolve(newerSession);
    await selectPromise;
    older.reject(new Error("stale close failed"));
    await closePromise;

    expect(useWorkspaceStore.getState().session).toEqual(newerSession);
    expect(useWorkspaceStore.getState().error).toBeNull();
    expect(useWorkspaceStore.getState().status).toBe("ready");
  });

  test("stale older success does not clear a newer operation", async () => {
    const older = deferred<WorkspaceSession>();
    const newer = deferred<WorkspaceSession>();
    installSettaAPI({
      workspace: {
        close: vi.fn().mockReturnValue(newer.promise),
        select: vi.fn().mockReturnValue(older.promise),
      },
    });

    const selectPromise = useWorkspaceStore.getState().selectWorkspace("workspace_api");
    const closePromise = useWorkspaceStore.getState().closeWorkspace("workspace_web");
    older.resolve(workspaceSession("workspace_api"));
    await selectPromise;

    expect(useWorkspaceStore.getState().operation).toBe("closing");

    newer.resolve(workspaceSession("workspace_web"));
    await closePromise;
    expect(useWorkspaceStore.getState().operation).toBeNull();
  });

  test("stale canceled folder open does not clear a newer operation", async () => {
    const older = deferred<OpenWorkspaceResponse | null>();
    const newer = deferred<WorkspaceSession>();
    installSettaAPI({
      workspace: {
        openLocalFolder: vi.fn().mockReturnValue(older.promise),
        select: vi.fn().mockReturnValue(newer.promise),
      },
    });

    const openPromise = useWorkspaceStore.getState().openLocalFolder();
    const selectPromise = useWorkspaceStore.getState().selectWorkspace("workspace_web");
    older.resolve(null);
    await openPromise;

    expect(useWorkspaceStore.getState().operation).toBe("selecting");

    newer.resolve(workspaceSession("workspace_web"));
    await selectPromise;
    expect(useWorkspaceStore.getState().operation).toBeNull();
  });

  test("stale session load does not replace a newer operation result", async () => {
    const older = deferred<WorkspaceSession>();
    const newer = deferred<WorkspaceSession>();
    const newerSession = workspaceSession("workspace_web");
    installSettaAPI({
      workspace: {
        select: vi.fn().mockReturnValue(newer.promise),
        session: vi.fn().mockReturnValue(older.promise),
      },
    });

    const loadPromise = useWorkspaceStore.getState().loadSession();
    const selectPromise = useWorkspaceStore.getState().selectWorkspace("workspace_web");
    newer.resolve(newerSession);
    await selectPromise;
    older.resolve(workspaceSession("workspace_api"));
    await loadPromise;

    expect(useWorkspaceStore.getState().session).toEqual(newerSession);
    expect(useWorkspaceStore.getState().status).toBe("ready");
  });
});

interface SettaAPIOverrides {
  workspace?: Partial<SettaAPI["workspace"]>;
}

function installSettaAPI(overrides: SettaAPIOverrides) {
  const fallbackSession = workspaceSession("workspace_api");
  const fallbackWorkspace = firstWorkspace(fallbackSession);
  const workspaceAPI: SettaAPI["workspace"] = {
    close: async () => fallbackSession,
    openLocalFolder: async () => ({ session: fallbackSession, workspace: fallbackWorkspace }),
    openPath: async () => ({ session: fallbackSession, workspace: fallbackWorkspace }),
    readUILayout: async (workspaceId) => ({ layout: null, workspaceId }),
    removeRecent: async () => fallbackSession,
    reorder: async () => fallbackSession,
    saveUILayout: async (layout) => layout,
    select: async () => fallbackSession,
    selectedConversations: async () => ({ selectedConversationIdsByWorkspaceId: {} }),
    setSelectedConversation: async (workspaceId, conversationId) => ({
      selectedConversationIdsByWorkspaceId: { [workspaceId]: conversationId },
    }),
    session: async () => fallbackSession,
    ...overrides.workspace,
  };
  const api: SettaAPI = {
    app: {
      flags: {
        workflowGraphDebug: false,
        workflowGraphSyntheticGraph: null,
      },
      captureRendererRegion: async () => ({
        capturedAt: 0,
        height: 1,
        imageDataUrl: "data:image/png;base64,",
        width: 1,
      }),
      installedEditors: async () => [],
      endWindowDrag: async () => {},
      moveWindowDrag: async () => {},
      openWorkspaceInEditor: async () => {},
      openExternalUrl: async () => {},
      platform: "darwin",
      startWindowDrag: async () => {},
      versions: async (): Promise<RuntimeVersions> => ({
        app: "test",
        chrome: "test",
        electron: "test",
        node: "test",
      }),
      workspaceGitInfo: async () => ({
        branchName: "main",
        commitShort: "0000000",
        worktreeName: "workspace",
        worktreeRoot: "/tmp/workspace",
      }),
    },
    backend: {
      health: async (): Promise<BackendHealth> => ({
        name: "setta-backend",
        ok: true,
        protocolVersion: 1,
        version: "test",
      }),
      onEventStreamStatus: () => () => {},
      onProcessStatus: () => () => {},
    },
    appearance: {
      presets: async () => {
        throw new Error("appearance presets are not used by workspace store tests");
      },
      read: async () => {
        throw new Error("appearance read is not used by workspace store tests");
      },
      update: async () => {
        throw new Error("appearance update is not used by workspace store tests");
      },
    },
    chat: {
      activeRun: async () => ({ hasActiveRun: false, run: null }),
      cancelRun: async () => emptyRun(),
      createConversation: async () => emptyConversation(),
      deleteConversation: async () => ({
        conversations: [],
        corruption: emptyCorruption(),
        diagnostics: [],
      }),
      editQueuedMessage: async () => ({
        conversation: emptyConversation(),
        page: emptyMessagePage(),
        queue: { messages: [], runs: [] },
        run: emptyRun(),
        userMessage: emptyMessage(),
      }),
      executeCommand: async () => ({
        conversation: emptyConversation(),
        message: null,
        page: emptyMessagePage(),
        result: {
          action: "display",
          goal: null,
          kind: "goal",
          message: "Goal set: test",
          models: [],
          raw: "/goal test",
          reasoningEfforts: [],
          selectedReasoningEffort: null,
          selectedModel: "",
          title: "Goal",
        },
      }),
      listCommands: async () => ({ commands: [] }),
      listConversations: async () => ({
        conversations: [],
        corruption: emptyCorruption(),
        diagnostics: [],
      }),
      markConversationRead: async () => ({
        activeRunId: "",
        pinnedAt: "",
        conversation: emptyConversation(),
        latestReadRelevantMarker: 0,
        messageCount: 0,
        readMarker: 0,
      }),
      messagePage: async () => emptyMessagePage(),
      onEvent: () => () => {},
      queueMessage: async () => ({
        conversation: emptyConversation(),
        page: emptyMessagePage(),
        queue: { messages: [], runs: [] },
        run: emptyRun(),
        userMessage: emptyMessage(),
      }),
      runActivity: async () => ({
        items: [],
        output: [],
        runId: "run_test",
      }),
      runItemOutput: async () => ({
        hasMore: false,
        nextOrdinal: 0,
        output: [],
        runId: "run_test",
        runItemId: "run_item_test",
      }),
      removeQueuedMessage: async () => ({
        conversation: emptyConversation(),
        page: emptyMessagePage(),
        queue: { messages: [], runs: [] },
        removedMessageId: "message_test",
        removedRunId: "run_test",
      }),
      sendMessage: async () => ({
        assistantMessage: emptyMessage(),
        conversation: emptyConversation(),
        page: emptyMessagePage(),
        run: emptyRun(),
        userMessage: emptyMessage(),
      }),
      setCodexModel: async () => ({
        conversation: emptyConversation(),
        message: null,
        page: emptyMessagePage(),
        result: {
          action: "display",
          goal: null,
          kind: "model",
          message: "Model set: gpt-test",
          models: [],
          raw: "/model",
          reasoningEfforts: [],
          selectedReasoningEffort: null,
          selectedModel: "gpt-test",
          title: "Model",
        },
      }),
      setCodexReasoningEffort: async () => ({
        conversation: emptyConversation(),
        message: null,
        page: emptyMessagePage(),
        result: {
          action: "display",
          goal: null,
          kind: "model",
          message: "Reasoning set: High",
          models: [],
          raw: "/model",
          reasoningEfforts: [],
          selectedReasoningEffort: "high",
          selectedModel: "",
          title: "Model",
        },
      }),
      setConversationPinned: async () => ({
        activeRunId: "",
        pinnedAt: "",
        conversation: emptyConversation(),
        latestReadRelevantMarker: 0,
        messageCount: 0,
        readMarker: 0,
      }),
      steerMessage: async () => ({
        conversation: emptyConversation(),
        page: emptyMessagePage(),
        run: emptyRun(),
        userMessage: emptyMessage(),
      }),
      sendSteeringImmediately: async () => ({
        activeRun: emptyRun(),
        cancelledRun: emptyRun(),
        conversation: emptyConversation(),
        page: emptyMessagePage(),
        queue: { messages: [], runs: [] },
        replayedSteeringMessageIds: [],
      }),
      submitApproval: async () => emptyRun(),
    },
    codexAccount: {
      cancelLogin: async () => emptyCodexAccountState(),
      logout: async () => emptyCodexAccountState(),
      read: async () => emptyCodexAccountState(),
      refresh: async () => emptyCodexAccountState(),
      startLogin: async () => ({
        login: {
          authUrl: "",
          error: "",
          loginId: "",
          status: "succeeded",
          type: "chatgpt",
          userCode: "",
          verificationUrl: "",
        },
        state: emptyCodexAccountState(),
      }),
    },
    workspaceActivity: unimplementedWorkspaceActivityAPI(),
    terminal: unimplementedTerminalAPI(),
    semanticGraph: unimplementedSemanticGraphAPI(),
    workflow: unimplementedWorkflowAPI(),
    workspace: workspaceAPI,
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setta: api,
    },
  });
}

function unimplementedWorkspaceActivityAPI(): SettaAPI["workspaceActivity"] {
  return {
    onEvent: () => () => {},
    snapshot: async () => {
      throw new Error("workspace activity API is not implemented in this test");
    },
    executionSnapshot: async () => {
      throw new Error("workspace activity API is not implemented in this test");
    },
  };
}

function unimplementedTerminalAPI(): SettaAPI["terminal"] {
  const unavailable = async (): Promise<never> => {
    throw new Error("terminal API is not implemented in this test");
  };
  return {
    attach: unavailable,
    close: unavailable,
    create: unavailable,
    createProfile: unavailable,
    deleteProfile: unavailable,
    input: unavailable,
    listProfiles: unavailable,
    onEvent: () => () => {},
    resize: unavailable,
    selectDefaultProfile: unavailable,
    updateProfile: unavailable,
  };
}

function unimplementedWorkflowAPI(): SettaAPI["workflow"] {
  const unavailable = async (): Promise<never> => {
    throw new Error("workflow API is not implemented in this test");
  };
  return {
    cancelExecution: unavailable,
    createDefinition: unavailable,
    deleteDefinition: unavailable,
    executionEvents: unavailable,
    graphProjection: unavailable,
    listDefinitions: unavailable,
    listExecutions: unavailable,
    onEvent: () => () => {},
    readDefinition: unavailable,
    readExecution: unavailable,
    startExecution: unavailable,
    submitApproval: unavailable,
    updateDefinition: unavailable,
    validateDefinition: unavailable,
  };
}

function unimplementedSemanticGraphAPI(): SettaAPI["semanticGraph"] {
  const unavailable = async (): Promise<never> => {
    throw new Error("semantic graph API is not implemented in this test");
  };
  return {
    acceptCartographerPatch: unavailable,
    attachChatMessage: unavailable,
    attachChatRun: unavailable,
    attachFileRange: unavailable,
    attachRunItem: unavailable,
    attachWorkflowExecution: unavailable,
    attachWorkflowNode: unavailable,
    buildCartographerWindow: unavailable,
    createEdge: unavailable,
    createNode: unavailable,
    createSteeringDirective: unavailable,
    dismissNode: unavailable,
    endActivity: unavailable,
    listActivity: unavailable,
    listActivityPage: unavailable,
    listCartographerCursors: unavailable,
    listCartographerPatches: unavailable,
    listCartographerRuns: unavailable,
    listCartographerWindows: unavailable,
    listContextPacks: unavailable,
    listEvidence: unavailable,
    mergeNodes: unavailable,
    onEvent: () => () => {},
    processCartographerWindow: unavailable,
    promoteNode: unavailable,
    read: unavailable,
    readActivitySummary: unavailable,
    readCartographerProcessingState: unavailable,
    readCartographerRun: unavailable,
    readContextPack: unavailable,
    readEventHistory: unavailable,
    readNodeDetail: unavailable,
    readSteeringState: unavailable,
    rejectCartographerPatch: unavailable,
    removeEdge: unavailable,
    renameNode: unavailable,
    splitNode: unavailable,
    updateEdge: unavailable,
    updateLayoutPositions: unavailable,
    updateNode: unavailable,
    updateSteeringDirective: unavailable,
  };
}

function emptyCodexAccountState() {
  return {
    account: null,
    diagnostic: "",
    login: null,
    requiresOpenaiAuth: true,
    status: "unauthenticated" as const,
  };
}

function emptyConversation() {
  return {
    archivedAt: "",
    codexSettings: null,
    createdAt: "2026-05-29T20:00:00Z",
    harnessRefs: [],
    id: "conversation_test",
    internal: false,
    schemaVersion: 1,
    title: "Test",
    updatedAt: "2026-05-29T20:00:00Z",
    workflow: null,
    workspaceId: "workspace_api",
  };
}

function emptyCorruption() {
  return {
    byKind: [],
    bySeverity: [],
    hasCorruption: false,
    total: 0,
  };
}

function emptyMessage(): ChatMessage {
  return {
    conversationId: "conversation_test",
    createdAt: "2026-05-29T20:00:00Z",
    delivery: "normal",
    id: "message_test",
    ordinal: 1,
    parts: [{ format: "plain", id: "part_test", text: "", type: "text" }],
    role: "user",
    runId: "",
    schemaVersion: 1,
    status: "complete",
    updatedAt: "2026-05-29T20:00:00Z",
  };
}

function emptyMessagePage(): MessagePage {
  return {
    conversation: emptyConversation(),
    goal: null,
    hasMoreOlder: false,
    messages: [],
    olderBeforeOrdinal: 0,
    queue: { messages: [], runs: [] },
    runItemOutputs: [],
    runItems: [],
    transcript: [],
  };
}

function emptyRun(): Run {
  return {
    assistantMessageId: "message_assistant",
    completedAt: "",
    conversationId: "conversation_test",
    error: "",
    harness: "codex",
    id: "run_test",
    pendingApproval: null,
    promptSummary: "",
    schemaVersion: 1,
    startedAt: "2026-05-29T20:00:00Z",
    status: "completed",
    triggerMessageId: "message_test",
    workspaceId: "workspace_api",
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  reject: (error: Error) => void;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] | null = null;
  let reject: Deferred<T>["reject"] | null = null;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  if (!resolve || !reject) {
    throw new Error("deferred promise callbacks were not initialized");
  }
  return { promise, reject, resolve };
}

function firstWorkspace(session: WorkspaceSession) {
  const workspace = session.activeWorkspaces[0];
  if (workspace === undefined) {
    throw new Error("test session must include an active workspace");
  }
  return workspace;
}

function workspaceSession(selectedWorkspaceId: string): WorkspaceSession {
  return {
    activeWorkspaces: [
      {
        displayName: "api",
        id: "workspace_api",
        lastOpenedAt: "2026-05-29T20:00:00Z",
        rootPath: "/tmp/api",
      },
      {
        displayName: "web",
        id: "workspace_web",
        lastOpenedAt: "2026-05-29T20:05:00Z",
        rootPath: "/tmp/web",
      },
    ],
    recentWorkspaces: [
      {
        displayName: "web",
        id: "workspace_web",
        lastOpenedAt: "2026-05-29T20:05:00Z",
        rootPath: "/tmp/web",
      },
      {
        displayName: "api",
        id: "workspace_api",
        lastOpenedAt: "2026-05-29T20:00:00Z",
        rootPath: "/tmp/api",
      },
    ],
    selectedWorkspaceId,
  };
}
