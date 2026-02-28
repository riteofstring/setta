import {
  useAIStore,
  useListenerCoverage,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  createProjectConfig,
  createSettaLspDiagnosticsPayload,
  createSettaProjectConfigDiagnostics,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", () => ({
  route_binary_upload: vi.fn(),
  route_get_auth_refresh_status: vi.fn(),
  route_get_latest_project_state: vi.fn(),
  route_get_latest_lsp_diagnostics: vi.fn(),
}));

vi.mock("state/actions/lspDiagnostics", () => ({
  processLspDiagnostics: vi.fn(),
}));

vi.mock("state/actions/aiFollow", () => ({
  requestAIFollowSnapshot: vi.fn(),
  receiveAIFollowToolArgumentsUpdate: vi.fn(),
  receiveAIFollowToolResultUpdate: vi.fn(),
}));

vi.mock("state/actions/notifications", () => ({
  addNotificationFromWebsocketMsg: vi.fn(),
  addTemporaryNotification: vi.fn(),
}));

vi.mock("state/actions/websocketConnectionList", () => ({
  addWebsocketConnection: vi.fn(),
  clearAllWebsocketConnections: vi.fn(),
  setWebsocketConnections: vi.fn(),
}));

vi.mock("state/actions/sectionInfos", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/sectionInfos")
  >("state/actions/sectionInfos");
  return {
    ...actual,
    processProjectStateUpdateFromBackend: vi.fn(),
  };
});

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  listeners: Record<string, Array<(event?: unknown) => unknown>> = {};
  readyState = MockWebSocket.CONNECTING;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
  addEventListener(type: string, listener: (event?: unknown) => unknown) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }
  async emit(type: string, event?: unknown) {
    if (type === "open") {
      this.readyState = MockWebSocket.OPEN;
    }
    if (type === "close") {
      this.readyState = MockWebSocket.CLOSED;
    }
    const listeners = this.listeners[type] ?? [];
    for (const listener of listeners) {
      await listener(event);
    }
  }
}

describe("openWebSocket", () => {
  beforeEach(() => {
    resetProjectStores();
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    (globalThis as unknown as { window?: typeof globalThis }).window =
      globalThis;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    resetProjectStores();
  });

  it("hydrates LSP diagnostics after loading project state", async () => {
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {},
      topLevelSections: {},
      activeIds: [],
    });
    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = {};
      state.sectionVariants = {};
      state.sectionImpls = {};
      state.previewSectionVariantMap = {};
    });

    const { route_get_latest_project_state, route_get_latest_lsp_diagnostics } =
      await import("utils/generatedEndpoints");
    const { processLspDiagnostics } = await import(
      "state/actions/lspDiagnostics"
    );
    const { requestAIFollowSnapshot } = await import("state/actions/aiFollow");
    const { openWebSocket } = await import("state/actions/websocketReceive");

    const diagnosticsPayload = createSettaLspDiagnosticsPayload({
      projectConfigId: "project-1",
      genCode: createSettaProjectConfigDiagnostics({
        projectConfigId: "project-1",
        errors: {},
        isGenCode: true,
      }),
      codeSections: {},
      unmappedGenCode: [],
    });

    vi.mocked(route_get_latest_project_state).mockResolvedValue({
      status: 200,
      data: {
        projectState: projectConfig,
        completedOpIds: [],
        pendingOpIds: [],
      },
      hasResponse: true,
    });
    vi.mocked(route_get_latest_lsp_diagnostics).mockResolvedValue({
      status: 200,
      data: diagnosticsPayload,
      hasResponse: true,
    });

    openWebSocket("/project");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");

    expect(route_get_latest_project_state).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(requestAIFollowSnapshot).toHaveBeenCalledWith("project-1");
    expect(route_get_latest_lsp_diagnostics).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(processLspDiagnostics).toHaveBeenCalledWith(diagnosticsPayload);
  });

  it("sends realtime dependency events when listener coverage is unknown", async () => {
    const { openWebSocket, sendRealtimeDependencyEvent } = await import(
      "state/actions/websocketReceive"
    );
    openWebSocket("/project", "share-session-coverage-unknown");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    const sendCallCountBefore = socket.send.mock.calls.length;

    sendRealtimeDependencyEvent(
      {
        dependencyKey: {
          type: DependencyKeyTypeEnum.Section,
          sectionId: "section-unknown-coverage",
        },
        payload: {
          type: DependencyValueTypeEnum.Literal,
          payload: "hello",
        },
      },
      "project-unknown-coverage",
    );

    expect(socket.send).toHaveBeenCalledTimes(sendCallCountBefore + 1);
  });

  it("does not send realtime dependency events excluded by known coverage", async () => {
    const { openWebSocket, sendRealtimeDependencyEvent } = await import(
      "state/actions/websocketReceive"
    );
    openWebSocket("/project", "share-session-coverage-known");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    useListenerCoverage.setState((state) => {
      state.byProjectId["project-covered"] = {
        hasRealtimeWildcard: false,
        dependenciesByKey: {
          "different-section::": {
            type: DependencyKeyTypeEnum.Section,
            sectionId: "different-section",
          },
        },
      };
    });
    const sendCallCountBefore = socket.send.mock.calls.length;

    sendRealtimeDependencyEvent(
      {
        dependencyKey: {
          type: DependencyKeyTypeEnum.Section,
          sectionId: "not-covered",
        },
        payload: {
          type: DependencyValueTypeEnum.Literal,
          payload: "hello",
        },
      },
      "project-covered",
    );

    expect(socket.send).toHaveBeenCalledTimes(sendCallCountBefore);
  });

  it("applies revisioned llm api-key websocket snapshots", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    openWebSocket("/project", "share-session-api-keys");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    useAIStore.setState({
      apiKeys: { OPENAI_API_KEY: "old-secret" },
      apiKeysRevision: 1,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: "stale error",
    });

    await socket.emit("message", {
      data: JSON.stringify({
        id: null,
        messageType: "LLMApiKeysUpdated",
        content: {
          apiKeys: {
            OPENAI_API_KEY: "new-secret",
            ANTHROPIC_API_KEY: "new-anthropic-secret",
          },
          revision: 4,
          corrupt: false,
          errorCode: null,
          message: null,
        },
      }),
    });

    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({
      OPENAI_API_KEY: "new-secret",
      ANTHROPIC_API_KEY: "new-anthropic-secret",
    });
    expect(state.apiKeysRevision).toBe(4);
    expect(state.apiKeysLoadError).toBeNull();
  });
});
