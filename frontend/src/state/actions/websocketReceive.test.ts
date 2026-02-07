import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
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
  listeners: Record<string, Array<(event?: unknown) => unknown>> = {};
  send = vi.fn();
  close = vi.fn();
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
});
