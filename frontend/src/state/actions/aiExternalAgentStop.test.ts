import { resetProjectStores } from "state/utils";
import {
  route_get_agent_runs,
  route_get_external_agent_chat,
  route_stop_external_agent_run,
} from "utils/generatedEndpoints";
import { AgentRunStatusEnum, createAgentRun } from "utils/generatedTypes";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { addTemporaryNotification } from "./notifications";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_agent_runs: vi.fn(),
    route_get_external_agent_chat: vi.fn(),
    route_stop_external_agent_run: vi.fn(),
  };
});

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

const mockedRouteGetAgentRuns = vi.mocked(route_get_agent_runs);
const mockedRouteGetExternalAgentChat = vi.mocked(
  route_get_external_agent_chat,
);
const mockedRouteStopExternalAgentRun = vi.mocked(
  route_stop_external_agent_run,
);
const mockedAddTemporaryNotification = vi.mocked(addTemporaryNotification);

let useAIStore: typeof import("state/definitions").useAIStore;
let getDefaultChatDetails: typeof import("state/actions/aiChatDetails").getDefaultChatDetails;
let stopChatResponseLocally: typeof import("state/actions/aiChatStopState").stopChatResponseLocally;
let stopExternalChatResponse: typeof import("state/actions/aiExternalAgentStop").stopExternalChatResponse;
let memoryStorage: Storage;

describe("aiExternalAgentStop", () => {
  beforeAll(async () => {
    const storage = new Map<string, string>();
    memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
    };
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage;

    const definitions = await import("state/definitions");
    useAIStore = definitions.useAIStore;
    const aiChatDetails = await import("./aiChatDetails");
    const aiChatStopState = await import("./aiChatStopState");
    const aiExternalAgentStop = await import("./aiExternalAgentStop");
    getDefaultChatDetails = aiChatDetails.getDefaultChatDetails;
    stopChatResponseLocally = aiChatStopState.stopChatResponseLocally;
    stopExternalChatResponse = aiExternalAgentStop.stopExternalChatResponse;
  });

  beforeEach(() => {
    resetProjectStores();
    useAIStore.persist.setOptions({
      storage: {
        getItem: memoryStorage.getItem.bind(memoryStorage),
        setItem: memoryStorage.setItem.bind(memoryStorage),
        removeItem: memoryStorage.removeItem.bind(memoryStorage),
      },
    });
    vi.clearAllMocks();
    mockedRouteGetAgentRuns.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [],
    });
  });

  afterEach(() => {
    resetProjectStores();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("stops the newest matching running external run for the current project", async () => {
    const chatId = "chat-stop-external-latest";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
        },
      },
      agentRunsInitialLoadComplete: true,
      agentRuns: [
        createAgentRun({
          id: "run-project-a-older",
          status: AgentRunStatusEnum.running,
          startedAt: "2026-03-01T00:00:00Z",
          inputs: {
            runType: "external_agent",
            chatId,
            projectConfigId: "project-a",
          },
        }),
        createAgentRun({
          id: "run-project-a-newer",
          status: AgentRunStatusEnum.running,
          startedAt: "2026-03-02T00:00:00Z",
          inputs: {
            runType: "external_agent",
            chatId,
            projectConfigId: "project-a",
          },
        }),
        createAgentRun({
          id: "run-project-b-newest",
          status: AgentRunStatusEnum.running,
          startedAt: "2026-03-03T00:00:00Z",
          inputs: {
            runType: "external_agent",
            chatId,
            projectConfigId: "project-b",
          },
        }),
      ],
    });
    const localSnapshot = stopChatResponseLocally(chatId, {
      markInterruptedOptimistically: false,
      followProjectConfigId: "project-a",
    });
    mockedRouteStopExternalAgentRun.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createAgentRun({
        id: "run-project-a-newer",
        status: AgentRunStatusEnum.cancelled,
      }),
    });

    const stopped = await stopExternalChatResponse({
      chatId,
      projectConfigId: "project-a",
      failureMessage: "Failed to stop project chat.",
      localSnapshot,
    });

    expect(stopped).toBe(true);
    expect(mockedRouteStopExternalAgentRun).toHaveBeenCalledWith({
      runId: "run-project-a-newer",
    });
    expect(mockedRouteStopExternalAgentRun).not.toHaveBeenCalledWith({
      runId: "run-project-b-newest",
    });
    expect(mockedRouteGetAgentRuns).toHaveBeenCalledTimes(1);
    expect(mockedRouteGetExternalAgentChat).not.toHaveBeenCalled();
    expect(useAIStore.getState().chatDetails[chatId]?.waitingForResponse).toBe(
      false,
    );
    expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
  });

  it("treats a missing refreshed external run as success when hydration is already complete", async () => {
    const chatId = "chat-stop-external-refresh-complete";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
        },
      },
      agentRunsInitialLoadComplete: true,
      agentRuns: [],
    });
    const localSnapshot = stopChatResponseLocally(chatId, {
      markInterruptedOptimistically: false,
      followProjectConfigId: "project-a",
    });
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: false,
        toolCallArguments: {},
      },
    });

    const stopped = await stopExternalChatResponse({
      chatId,
      projectConfigId: "project-a",
      failureMessage: "Failed to stop project chat.",
      localSnapshot,
    });

    expect(stopped).toBe(true);
    expect(mockedRouteGetAgentRuns).toHaveBeenCalledTimes(1);
    expect(mockedRouteStopExternalAgentRun).not.toHaveBeenCalled();
    expect(mockedRouteGetExternalAgentChat).toHaveBeenCalledWith({
      chatId,
      projectConfigId: "project-a",
    });
    expect(useAIStore.getState().chatDetails[chatId]?.waitingForResponse).toBe(
      false,
    );
    expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
  });
});
