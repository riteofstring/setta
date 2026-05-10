import { C_ADDRESSES } from "@setta/app-subsystem-frontend-sdk";
import { resetProjectStores } from "state/utils";
import { WebsocketMessageTypeEnum } from "utils/generatedTypes";
import {
  ROOT_TRANSPORT_ROUTES,
  WEBSOCKET_TRANSPORT_ROUTES,
} from "utils/transportRouteConstants";
import { afterEach, beforeEach, vi } from "vitest";

const websocketReceiveMocks = vi.hoisted(() => ({
  initializeAppSessionFromCurrentDeploymentMock: vi.fn(),
  routeGetAuthRefreshStatusMock: vi.fn(),
  getAgentRunsMock: vi.fn(),
  getListenerCoverageMock: vi.fn(),
  getLatestProjectStateMock: vi.fn(),
  getLatestLspDiagnosticsMock: vi.fn(),
  processAppProjectStateUpdateFromBackendMock: vi.fn(),
  receivePluginRuntimeUpdateMock: vi.fn(),
  resetAppSessionStateMock: vi.fn(),
  uploadBinaryMock: vi.fn(),
}));

export const {
  initializeAppSessionFromCurrentDeploymentMock,
  routeGetAuthRefreshStatusMock,
  getAgentRunsMock,
  getListenerCoverageMock,
  getLatestProjectStateMock,
  getLatestLspDiagnosticsMock,
  processAppProjectStateUpdateFromBackendMock,
  receivePluginRuntimeUpdateMock,
  resetAppSessionStateMock,
  uploadBinaryMock,
} = websocketReceiveMocks;

vi.mock("openapi/http", () => ({
  getAuthRefreshStatus: routeGetAuthRefreshStatusMock,
  getAgentRuns: getAgentRunsMock,
  getLatestProjectState: getLatestProjectStateMock,
  getLatestLspDiagnostics: getLatestLspDiagnosticsMock,
  getListenerCoverage: getListenerCoverageMock,
  uploadBinary: uploadBinaryMock,
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: function <T>(promise: Promise<T>) {
      return promise;
    },
  };
});

vi.mock("plugins/runtime", () => ({
  receivePluginRuntimeUpdate: receivePluginRuntimeUpdateMock,
}));

vi.mock("plugins/appSubsystem", async () => {
  const actual = await vi.importActual<typeof import("plugins/appSubsystem")>(
    "plugins/appSubsystem",
  );
  return {
    ...actual,
    initializeAppSessionFromCurrentDeployment:
      initializeAppSessionFromCurrentDeploymentMock,
    processAppProjectStateUpdateFromBackend: (...args: unknown[]) =>
      processAppProjectStateUpdateFromBackendMock(...args),
    resetAppSessionState: (...args: unknown[]) =>
      resetAppSessionStateMock(...args),
  };
});

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

vi.mock("state/actions/uiSettingReveal", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/uiSettingReveal")
  >("state/actions/uiSettingReveal");
  return {
    ...actual,
    receiveUISettingReveal: vi.fn(),
  };
});

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

export class MockWebSocket {
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

export const expectedFrontendWebsocketPath =
  WEBSOCKET_TRANSPORT_ROUTES.frontend;

export function buildUISettingRevealMessage({
  id,
  requestId,
  settingId,
  revealActivationSteps = [],
}: {
  id: string;
  requestId: string;
  settingId: string;
  revealActivationSteps?: Array<{
    type: string;
    itemValue: string;
  }>;
}) {
  return {
    id,
    messageType: WebsocketMessageTypeEnum.UISettingReveal,
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

export function findRevealResultPayload(
  socket: MockWebSocket,
  requestId: string,
):
  | {
      requestId?: string;
      statuses?: unknown;
    }
  | undefined {
  const parsedPayloads = socket.send.mock.calls
    .map((call) => call[0])
    .filter((payload): payload is string => typeof payload === "string")
    .map((payload) => {
      try {
        return JSON.parse(payload) as {
          messageType?: string;
          content?: {
            requestId?: string;
            statuses?: unknown;
          };
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
        content?: {
          requestId?: string;
          statuses?: unknown;
        };
      } => payload !== null,
    );
  const matchingPayload = parsedPayloads.find(
    (payload) =>
      payload.messageType === "UISettingRevealResult" &&
      payload.content?.requestId === requestId,
  );
  return matchingPayload?.content;
}

export function expectedAuthRecoveryNotification() {
  return `Authentication required. Open ${C_ADDRESSES.BACKEND_ORIGIN}${ROOT_TRANSPORT_ROUTES.bootstrapPage} to continue.`;
}

export function registerOpenWebSocketTestHooks() {
  beforeEach(async () => {
    resetProjectStores();
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    initializeAppSessionFromCurrentDeploymentMock.mockReset();
    initializeAppSessionFromCurrentDeploymentMock.mockResolvedValue(false);
    processAppProjectStateUpdateFromBackendMock.mockReset();
    resetAppSessionStateMock.mockReset();
    (
      globalThis as unknown as {
        window?: typeof globalThis;
      }
    ).window = globalThis;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const {
      getAgentRuns,
      getAuthRefreshStatus,
      getLatestLspDiagnostics,
      getLatestProjectState,
      getListenerCoverage,
    } = await import("openapi/http");
    const { receiveUISettingReveal } = await import(
      "state/actions/uiSettingReveal"
    );
    vi.mocked(receiveUISettingReveal).mockReset();
    vi.mocked(getAuthRefreshStatus).mockResolvedValue({
      status: 200,
      data: { authCookieRefreshWindowSeconds: 120 },
      hasResponse: true,
    });
    vi.mocked(getAgentRuns).mockResolvedValue({
      status: 200,
      data: [],
      hasResponse: true,
    });
    vi.mocked(getListenerCoverage).mockResolvedValue({
      status: 404,
      data: null,
      hasResponse: true,
    });
    vi.mocked(getLatestProjectState).mockResolvedValue({
      status: 404,
      data: null,
      hasResponse: true,
    });
    vi.mocked(getLatestLspDiagnostics).mockResolvedValue({
      status: 404,
      data: null,
      hasResponse: true,
    });
  });

  afterEach(async () => {
    const { openWebSocket } = await import("state/actions/websocketReceive");
    openWebSocket.cancel();
    for (const socket of MockWebSocket.instances) {
      await socket.emit("close", { code: 1000 });
    }
    vi.clearAllTimers();
    MockWebSocket.instances = [];
    vi.useRealTimers();
    vi.clearAllMocks();
    resetProjectStores();
  });
}
