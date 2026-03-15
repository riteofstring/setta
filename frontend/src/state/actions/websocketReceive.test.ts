import {
  useAIStore,
  useListenerCoverage,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { C } from "utils/c";
import {
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  WebsocketConnectionTypeEnum,
  WebsocketMsgTypeForFrontendEnum,
  createAgentRun,
  createProjectConfig,
  createSettaLspDiagnosticsPayload,
  createSettaProjectConfigDiagnostics,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", () => ({
  route_binary_upload: vi.fn(),
  route_get_auth_refresh_status: vi.fn(),
  route_get_agent_runs: vi.fn(),
  route_get_listener_coverage: vi.fn(),
  route_get_latest_project_state: vi.fn(),
  route_get_latest_lsp_diagnostics: vi.fn(),
}));

vi.mock("state/actions/lspDiagnostics", () => ({
  processLspDiagnostics: vi.fn(),
}));

vi.mock("state/actions/aiFollow", () => ({
  requestAIFollowSnapshot: vi.fn(),
}));

vi.mock("state/actions/aiFollowToolArguments", () => ({
  receiveAIFollowToolArgumentsUpdate: vi.fn(),
}));

vi.mock("state/actions/aiFollowHighlights", () => ({
  receiveAIFollowToolResultUpdate: vi.fn(),
}));

vi.mock("state/actions/notifications", () => ({
  addNotificationFromWebsocketMsg: vi.fn(),
  addTemporaryNotification: vi.fn(),
}));

vi.mock("state/actions/uiSettingRevealRequests", () => ({
  receiveUISettingReveal: vi.fn(),
}));

vi.mock("state/actions/websocketConnectionList", () => ({
  addWebsocketConnection: vi.fn(),
  clearAllWebsocketConnections: vi.fn(),
  setWebsocketConnections: vi.fn(),
}));

vi.mock("state/actions/sectionProjectStateSync", () => ({
  processProjectStateUpdateFromBackend: vi.fn(),
}));

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

function buildUISettingRevealMessage({
  id,
  requestId,
  settingId,
  revealActivationSteps = [],
}: {
  id: string;
  requestId: string;
  settingId: string;
  revealActivationSteps?: Array<{ type: string; itemValue: string }>;
}) {
  return {
    id,
    messageType: WebsocketMsgTypeForFrontendEnum.UISettingReveal,
    content: {
      projectConfigId: "project-1",
      chatId: null,
      requestId,
      durationMs: 1500,
      reveals: [
        {
          settingId,
          side: "left",
          overviewTabKey: "WatchCode",
          uiEditorTabName: null,
          pluginId: null,
          paneId: null,
          strategy: "dom_anchor",
          anchorId: settingId,
          pluginRevealKey: null,
          revealActivationSteps,
        },
      ],
    },
  };
}

function findRevealResultPayload(
  socket: MockWebSocket,
  requestId: string,
): { requestId?: string; statuses?: unknown } | undefined {
  const parsedPayloads = socket.send.mock.calls
    .map((call) => call[0])
    .filter((payload): payload is string => typeof payload === "string")
    .map((payload) => {
      try {
        return JSON.parse(payload) as {
          messageType?: string;
          content?: { requestId?: string; statuses?: unknown };
        };
      } catch {
        return null;
      }
    })
    .filter(
      (
        payload,
      ): payload is {
        messageType?: string;
        content?: { requestId?: string; statuses?: unknown };
      } => payload !== null,
    );
  const matchingPayload = parsedPayloads.find(
    (payload) =>
      payload.messageType === "UISettingRevealResult" &&
      payload.content?.requestId === requestId,
  );
  return matchingPayload?.content;
}

describe("openWebSocket", () => {
  beforeEach(async () => {
    resetProjectStores();
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    (globalThis as unknown as { window?: typeof globalThis }).window =
      globalThis;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    const { route_get_agent_runs } = await import("utils/generatedEndpoints");
    const { route_get_listener_coverage } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    vi.mocked(route_get_agent_runs).mockResolvedValue({
      status: 200,
      data: [],
      hasResponse: true,
    });
    vi.mocked(route_get_listener_coverage).mockResolvedValue({
      status: 404,
      data: null,
      hasResponse: true,
    });
  });

  afterEach(async () => {
    for (const socket of MockWebSocket.instances) {
      await socket.emit("close", { code: 1000 });
    }
    vi.clearAllTimers();
    MockWebSocket.instances = [];
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

  it("merges workflow run websocket updates into the agent run store", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    useAIStore.setState({
      agentRuns: [
        createAgentRun({
          id: "workflow-run-1",
          status: "running",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
        }),
      ],
    });

    openWebSocket("/project");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-agent-run",
        messageType: WebsocketMsgTypeForFrontendEnum.AgentRunUpdated,
        content: createAgentRun({
          id: "workflow-run-1",
          status: "completed",
          finishedAt: "2026-03-13T00:00:05Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
          events: [
            {
              timestamp: "2026-03-13T00:00:05Z",
              type: "run_completed",
              payload: {},
            },
          ],
        }),
      }),
    });

    expect(
      useAIStore.getState().agentRuns.find((run) => run.id === "workflow-run-1")
        ?.status,
    ).toBe("completed");
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

  it("uploads oversized realtime section snapshots and emits the uploaded binary reference", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-binary-upload";
    });
    const { openWebSocket } = await import("state/actions/websocketLifecycle");
    const { sendRealtimeSectionBinary } = await import(
      "state/actions/websocketRealtime"
    );
    const { route_binary_upload, route_get_listener_coverage } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_listener_coverage).mockResolvedValue({
      status: 200,
      data: {
        projectConfigId: "project-binary-upload",
        hasRealtimeWildcard: true,
        dependencies: [],
      },
      hasResponse: true,
    });
    vi.mocked(route_binary_upload).mockResolvedValue({
      status: 200,
      data: {
        contentId: "binary-upload-1",
        byteLength: C.REALTIME_BINARY_MAX_BYTES + 1,
        mimeType: "image/png",
      },
      hasResponse: true,
    });

    openWebSocket("/project", "share-session-binary-upload");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");

    sendRealtimeSectionBinary(
      "section-binary-upload",
      new ArrayBuffer(C.REALTIME_BINARY_MAX_BYTES + 1),
      "image/png",
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(route_binary_upload).toHaveBeenCalledTimes(1);
    const realtimePayload = socket.send.mock.calls
      .map((call) => call[0])
      .filter((payload): payload is string => typeof payload === "string")
      .map((payload) => {
        try {
          return JSON.parse(payload) as {
            messageType?: string;
            content?: {
              projectConfigId?: string;
              dependencyKey?: unknown;
              value?: unknown;
            };
          };
        } catch {
          return null;
        }
      })
      .find(
        (payload) =>
          payload?.messageType === "RealtimeUIChange" &&
          payload.content?.projectConfigId === "project-binary-upload",
      );

    expect(realtimePayload?.content).toEqual({
      projectConfigId: "project-binary-upload",
      dependencyKey: {
        type: DependencyKeyTypeEnum.Section,
        sectionId: "section-binary-upload",
      },
      value: {
        type: DependencyValueTypeEnum.Binary,
        payload: {
          contentId: "binary-upload-1",
          byteLength: C.REALTIME_BINARY_MAX_BYTES + 1,
          mimeType: "image/png",
        },
      },
    });
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
    expect(state.apiKeysAuthoritative).toBe(true);
  });

  it("does not set frontend websocket affinity from AllConnections payloads", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    const { buildFrontendAffinityCurrentAddress, getFrontendAffinityToken } =
      await import("state/actions/frontendWebsocketAffinity");
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });

    openWebSocket("/project");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-affinity",
        messageType: WebsocketMsgTypeForFrontendEnum.AllConnections,
        content: [
          {
            id: "frontend-origin",
            connectionType: WebsocketConnectionTypeEnum.FRONTEND,
            currentAddress: buildFrontendAffinityCurrentAddress("/project"),
            shareSessionId: null,
          },
        ],
      }),
    });

    expect(getFrontendAffinityToken()).toBeNull();
  });

  it("updates frontend websocket affinity from FrontendIdentity and keeps it stable", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    const { getFrontendAffinityToken } = await import(
      "state/actions/frontendWebsocketAffinity"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });

    openWebSocket("/project");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-affinity-identity",
        messageType: WebsocketMsgTypeForFrontendEnum.FrontendIdentity,
        content: { frontendAffinityToken: "frontend-handshake" },
      }),
    });
    expect(getFrontendAffinityToken()).toBe("frontend-handshake");

    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-affinity-stale-snapshot",
        messageType: WebsocketMsgTypeForFrontendEnum.AllConnections,
        content: [],
      }),
    });
    expect(getFrontendAffinityToken()).toBe("frontend-handshake");
  });

  it("clears affinity immediately on socket replacement and ignores stale socket identity events", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    const { getFrontendAffinityToken } = await import(
      "state/actions/frontendWebsocketAffinity"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });

    openWebSocket("/project");
    vi.runAllTimers();

    const firstSocket = MockWebSocket.instances[0];
    await firstSocket.emit("open");
    await firstSocket.emit("message", {
      data: JSON.stringify({
        id: "msg-first-identity",
        messageType: WebsocketMsgTypeForFrontendEnum.FrontendIdentity,
        content: { frontendAffinityToken: "frontend-first" },
      }),
    });
    expect(getFrontendAffinityToken()).toBe("frontend-first");

    openWebSocket("/project", "share-session-replacement");
    vi.advanceTimersByTime(1000);

    const secondSocket = MockWebSocket.instances[1];
    expect(secondSocket).toBeDefined();
    expect(getFrontendAffinityToken()).toBeNull();

    await firstSocket.emit("message", {
      data: JSON.stringify({
        id: "msg-stale-identity",
        messageType: WebsocketMsgTypeForFrontendEnum.FrontendIdentity,
        content: { frontendAffinityToken: "frontend-stale" },
      }),
    });
    expect(getFrontendAffinityToken()).toBeNull();

    await secondSocket.emit("open");
    expect(getFrontendAffinityToken()).toBeNull();
  });

  it("repopulates affinity from active-socket FrontendIdentity after replacement clear", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    const { getFrontendAffinityToken } = await import(
      "state/actions/frontendWebsocketAffinity"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });

    openWebSocket("/project");
    vi.runAllTimers();

    const firstSocket = MockWebSocket.instances[0];
    await firstSocket.emit("open");
    await firstSocket.emit("message", {
      data: JSON.stringify({
        id: "msg-first-identity",
        messageType: WebsocketMsgTypeForFrontendEnum.FrontendIdentity,
        content: { frontendAffinityToken: "frontend-first" },
      }),
    });
    expect(getFrontendAffinityToken()).toBe("frontend-first");

    openWebSocket("/project", "share-session-replacement");
    vi.advanceTimersByTime(1000);

    const secondSocket = MockWebSocket.instances[1];
    await secondSocket.emit("open");

    await secondSocket.emit("message", {
      data: JSON.stringify({
        id: "msg-second-identity",
        messageType: WebsocketMsgTypeForFrontendEnum.FrontendIdentity,
        content: { frontendAffinityToken: "frontend-second-token" },
      }),
    });
    expect(getFrontendAffinityToken()).toBe("frontend-second-token");
  });

  it("reconnects once after an active-socket transport error followed by close", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    openWebSocket("/project");
    vi.runAllTimers();
    const socket = MockWebSocket.instances[0];
    await socket.emit("open");

    await socket.emit("error");
    expect(socket.close).toHaveBeenCalledTimes(1);

    await socket.emit("close", { code: 1006 });
    const reconnectTimeoutCalls = setTimeoutSpy.mock.calls.filter(
      (call) => call[1] === 3000,
    );
    expect(reconnectTimeoutCalls).toHaveLength(1);

    vi.advanceTimersByTime(3000);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1000);
  });

  it("ignores stale-socket transport errors after socket replacement", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });

    openWebSocket("/project");
    vi.runAllTimers();
    const firstSocket = MockWebSocket.instances[0];
    await firstSocket.emit("open");

    openWebSocket("/project", "share-session-replacement-error");
    vi.advanceTimersByTime(1000);
    const secondSocket = MockWebSocket.instances[1];

    expect(firstSocket.close).toHaveBeenCalledTimes(1);
    expect(secondSocket.close).toHaveBeenCalledTimes(0);

    await firstSocket.emit("error");

    expect(firstSocket.close).toHaveBeenCalledTimes(1);
    expect(secondSocket.close).toHaveBeenCalledTimes(0);
  });

  it("does not schedule reconnect from stale close events during socket replacement", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    openWebSocket("/project");
    vi.runAllTimers();
    const firstSocket = MockWebSocket.instances[0];
    await firstSocket.emit("open");

    openWebSocket("/project", "share-session-replacement-close");
    vi.advanceTimersByTime(1000);

    await firstSocket.emit("close", { code: 1006 });
    const reconnectTimeoutCalls = setTimeoutSpy.mock.calls.filter(
      (call) => call[1] === 3000,
    );
    expect(reconnectTimeoutCalls).toHaveLength(0);
  });

  it("sends current address updates when pathname changes on an open socket", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    const { buildFrontendAffinityCurrentAddress } = await import(
      "state/actions/frontendWebsocketAffinity"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });

    openWebSocket("/project");
    vi.runAllTimers();
    const socket = MockWebSocket.instances[0];
    await socket.emit("open");

    const sendCountAfterOpen = socket.send.mock.calls.length;

    openWebSocket("/project-updated");
    vi.advanceTimersByTime(1000);

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(socket.send.mock.calls.length).toBeGreaterThan(sendCountAfterOpen);

    const currentAddressPayloads = socket.send.mock.calls
      .map((call) => call[0])
      .filter((payload): payload is string => typeof payload === "string")
      .map((payload) => {
        try {
          return JSON.parse(payload) as {
            messageType?: string;
            content?: unknown;
          };
        } catch {
          return null;
        }
      })
      .filter(
        (payload): payload is { messageType?: string; content?: unknown } =>
          payload !== null,
      )
      .filter((payload) => payload.messageType === "CurrentAddressUpdate");

    const latestCurrentAddressPayload =
      currentAddressPayloads[currentAddressPayloads.length - 1];
    expect(latestCurrentAddressPayload?.content).toBe(
      buildFrontendAffinityCurrentAddress("/project-updated"),
    );
  });

  it("routes UISettingReveal websocket messages to the reveal action", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-1";
    });
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { receiveUISettingReveal } = await import(
      "state/actions/uiSettingRevealRequests"
    );
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    vi.mocked(receiveUISettingReveal).mockResolvedValue([
      {
        settingId: "core.watch_code.enabled",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);

    openWebSocket("/project");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-1",
        messageType: WebsocketMsgTypeForFrontendEnum.UISettingReveal,
        content: {
          projectConfigId: "project-1",
          chatId: null,
          requestId: "request-1",
          durationMs: 1500,
          reveals: [
            {
              settingId: "core.watch_code.enabled",
              side: "left",
              overviewTabKey: "WatchCode",
              uiEditorTabName: null,
              pluginId: null,
              paneId: null,
              strategy: "dom_anchor",
              anchorId: "core.watch_code.enabled",
              pluginRevealKey: null,
              revealActivationSteps: [
                {
                  type: "run_instructions_accordion_item",
                  itemValue: "run-instructions-codegen-targets",
                },
              ],
            },
          ],
        },
      }),
    });
    await Promise.resolve();

    expect(receiveUISettingReveal).toHaveBeenCalledTimes(1);
    expect(receiveUISettingReveal).toHaveBeenCalledWith(
      expect.objectContaining({
        reveals: [
          expect.objectContaining({
            settingId: "core.watch_code.enabled",
            revealActivationSteps: [
              {
                type: "run_instructions_accordion_item",
                itemValue: "run-instructions-codegen-targets",
              },
            ],
          }),
        ],
      }),
      expect.objectContaining({
        requestId: "request-1",
        requestedProjectConfigId: "project-1",
        socketGeneration: expect.any(Number),
      }),
    );
    const revealResultPayload = socket.send.mock.calls
      .map((call) => call[0])
      .filter((payload): payload is string => typeof payload === "string")
      .map((payload) => {
        try {
          return JSON.parse(payload) as {
            messageType?: string;
            content?: { requestId?: string; statuses?: unknown };
          };
        } catch {
          return null;
        }
      })
      .find(
        (payload) =>
          payload?.messageType === "UISettingRevealResult" &&
          payload.content?.requestId === "request-1",
      );
    expect(revealResultPayload).not.toBeUndefined();
    expect(revealResultPayload?.content?.statuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
  });

  it("processes UISettingReveal messages concurrently within one websocket generation", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-1";
    });
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { receiveUISettingReveal } = await import(
      "state/actions/uiSettingRevealRequests"
    );
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    let resolveFirstReveal:
      | ((
          value: Array<{
            settingId: string;
            status: "revealed" | "failed";
            errorCode: string | null;
            errorMessage: string | null;
          }>,
        ) => void)
      | null = null;
    const firstRevealPromise = new Promise<
      Array<{
        settingId: string;
        status: "revealed" | "failed";
        errorCode: string | null;
        errorMessage: string | null;
      }>
    >((resolve) => {
      resolveFirstReveal = resolve;
    });
    vi.mocked(receiveUISettingReveal)
      .mockImplementationOnce(() => firstRevealPromise)
      .mockResolvedValueOnce([
        {
          settingId: "core.project.name",
          status: "revealed",
          errorCode: null,
          errorMessage: null,
        },
      ]);

    openWebSocket("/project");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify(
        buildUISettingRevealMessage({
          id: "msg-queue-1",
          requestId: "request-queue-1",
          settingId: "core.watch_code.enabled",
        }),
      ),
    });
    await socket.emit("message", {
      data: JSON.stringify(
        buildUISettingRevealMessage({
          id: "msg-queue-2",
          requestId: "request-queue-2",
          settingId: "core.project.name",
        }),
      ),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(receiveUISettingReveal).toHaveBeenCalledTimes(2);

    if (resolveFirstReveal === null) {
      throw new Error("Missing first reveal resolver.");
    }
    resolveFirstReveal([
      {
        settingId: "core.watch_code.enabled",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }

    const firstAck = findRevealResultPayload(socket, "request-queue-1");
    const secondAck = findRevealResultPayload(socket, "request-queue-2");
    expect(firstAck?.statuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
    expect(secondAck?.statuses).toEqual([
      {
        settingId: "core.project.name",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
  });

  it("does not send UISettingReveal ACKs after websocket generation rollover", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { receiveUISettingReveal } = await import(
      "state/actions/uiSettingRevealRequests"
    );
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    let resolveReveal:
      | ((
          value: Array<{
            settingId: string;
            status: "revealed" | "failed";
            errorCode: string | null;
            errorMessage: string | null;
          }>,
        ) => void)
      | null = null;
    const revealPromise = new Promise<
      Array<{
        settingId: string;
        status: "revealed" | "failed";
        errorCode: string | null;
        errorMessage: string | null;
      }>
    >((resolve) => {
      resolveReveal = resolve;
    });
    vi.mocked(receiveUISettingReveal).mockImplementation(() => revealPromise);

    openWebSocket("/project");
    vi.runAllTimers();
    const originalSocket = MockWebSocket.instances[0];
    await originalSocket.emit("open");
    await originalSocket.emit("message", {
      data: JSON.stringify(
        buildUISettingRevealMessage({
          id: "msg-rollover-1",
          requestId: "request-rollover-1",
          settingId: "core.watch_code.enabled",
        }),
      ),
    });
    await Promise.resolve();

    openWebSocket("/project", "share-session-replacement");
    vi.advanceTimersByTime(1000);
    const replacementSocket = MockWebSocket.instances[1];
    await replacementSocket.emit("open");

    if (resolveReveal === null) {
      throw new Error("Missing reveal resolver.");
    }
    resolveReveal([
      {
        settingId: "core.watch_code.enabled",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(
      findRevealResultPayload(originalSocket, "request-rollover-1"),
    ).toBeUndefined();
    expect(
      findRevealResultPayload(replacementSocket, "request-rollover-1"),
    ).toBeUndefined();
  });

  it("sends structured reveal failure statuses when reveal handling throws", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-1";
    });
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { receiveUISettingReveal } = await import(
      "state/actions/uiSettingRevealRequests"
    );
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    vi.mocked(receiveUISettingReveal).mockRejectedValue(
      new Error("reveal crashed"),
    );

    openWebSocket("/project", "share-session-reveal-error");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-2",
        messageType: WebsocketMsgTypeForFrontendEnum.UISettingReveal,
        content: {
          projectConfigId: "project-1",
          chatId: null,
          requestId: "request-2",
          durationMs: 1500,
          reveals: [
            {
              settingId: "core.watch_code.enabled",
              side: "left",
              overviewTabKey: "WatchCode",
              uiEditorTabName: null,
              pluginId: null,
              paneId: null,
              strategy: "dom_anchor",
              anchorId: "core.watch_code.enabled",
              pluginRevealKey: null,
              revealActivationSteps: [],
            },
          ],
        },
      }),
    });
    await Promise.resolve();

    const revealResultPayload = socket.send.mock.calls
      .map((call) => call[0])
      .filter((payload): payload is string => typeof payload === "string")
      .map((payload) => {
        try {
          return JSON.parse(payload) as {
            messageType?: string;
            content?: { requestId?: string; statuses?: unknown };
          };
        } catch {
          return null;
        }
      })
      .find(
        (payload) =>
          payload?.messageType === "UISettingRevealResult" &&
          payload.content?.requestId === "request-2",
      );
    expect(revealResultPayload?.content?.statuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: "Failed to process UI setting reveal: reveal crashed",
      },
    ]);
  });

  it("acks malformed UISettingReveal payloads without throwing", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { receiveUISettingReveal } = await import(
      "state/actions/uiSettingRevealRequests"
    );
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });

    openWebSocket("/project", "share-session-reveal-malformed");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-3",
        messageType: WebsocketMsgTypeForFrontendEnum.UISettingReveal,
        content: {
          projectConfigId: "project-1",
          chatId: null,
          requestId: "request-3",
          durationMs: 1500,
          reveals: null,
        },
      }),
    });
    await Promise.resolve();

    expect(receiveUISettingReveal).not.toHaveBeenCalled();
    const revealResultPayload = socket.send.mock.calls
      .map((call) => call[0])
      .filter((payload): payload is string => typeof payload === "string")
      .map((payload) => {
        try {
          return JSON.parse(payload) as {
            messageType?: string;
            content?: { requestId?: string; statuses?: unknown };
          };
        } catch {
          return null;
        }
      })
      .find(
        (payload) =>
          payload?.messageType === "UISettingRevealResult" &&
          payload.content?.requestId === "request-3",
      );
    expect(revealResultPayload).not.toBeUndefined();
    expect(revealResultPayload?.content?.statuses).toEqual([]);
  });

  it("returns structured failure statuses for malformed reveal targets when ids are available", async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    const { route_get_auth_refresh_status } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_get_auth_refresh_status).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });

    openWebSocket("/project", "share-session-reveal-malformed-target");
    vi.runAllTimers();

    const socket = MockWebSocket.instances[0];
    await socket.emit("open");
    await socket.emit("message", {
      data: JSON.stringify({
        id: "msg-4",
        messageType: WebsocketMsgTypeForFrontendEnum.UISettingReveal,
        content: {
          projectConfigId: "project-1",
          chatId: null,
          requestId: "request-4",
          durationMs: 1500,
          reveals: [
            {
              settingId: "core.watch_code.enabled",
              side: "left",
              overviewTabKey: "WatchCode",
              uiEditorTabName: null,
              pluginId: null,
              paneId: null,
              strategy: "dom_anchor",
              anchorId: "core.watch_code.enabled",
              pluginRevealKey: null,
              revealActivationSteps: {},
            },
          ],
        },
      }),
    });
    await Promise.resolve();

    const revealResultPayload = socket.send.mock.calls
      .map((call) => call[0])
      .filter((payload): payload is string => typeof payload === "string")
      .map((payload) => {
        try {
          return JSON.parse(payload) as {
            messageType?: string;
            content?: { requestId?: string; statuses?: unknown };
          };
        } catch {
          return null;
        }
      })
      .find(
        (payload) =>
          payload?.messageType === "UISettingRevealResult" &&
          payload.content?.requestId === "request-4",
      );
    expect(revealResultPayload?.content?.statuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: "Invalid UISettingReveal payload.",
      },
    ]);
  });
});
