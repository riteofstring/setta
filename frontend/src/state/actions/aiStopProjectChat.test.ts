import { resetProjectStores } from "state/utils";
import {
  route_get_agent_runs,
  route_get_external_agent_chat,
  route_get_llm_chat,
  route_stop_external_agent_run,
  route_stop_llm_chat,
} from "utils/generatedEndpoints";
import {
  AgentRunStatusEnum,
  SettaNotificationTypeEnum,
  StreamingEventTypeEnum,
  createAgentRun,
  createAssistantChatMessage,
  createMessageTextContent,
} from "utils/generatedTypes";
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
    route_get_llm_chat: vi.fn(),
    route_stop_external_agent_run: vi.fn(),
    route_stop_llm_chat: vi.fn(),
  };
});

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

const mockedRouteGetExternalAgentChat = vi.mocked(
  route_get_external_agent_chat,
);
const mockedRouteGetLLMChat = vi.mocked(route_get_llm_chat);
const mockedRouteGetAgentRuns = vi.mocked(route_get_agent_runs);
const mockedRouteStopExternalAgentRun = vi.mocked(
  route_stop_external_agent_run,
);
const mockedRouteStopLlmChat = vi.mocked(route_stop_llm_chat);
const mockedAddTemporaryNotification = vi.mocked(addTemporaryNotification);

let useAIStore: typeof import("state/definitions").useAIStore;
let useLocalStorage: typeof import("state/definitions").useLocalStorage;
let stopProjectChatResponse: typeof import("state/actions/ai").stopProjectChatResponse;
let stopManagedSectionChatResponse: typeof import("state/actions/ai").stopManagedSectionChatResponse;
let getDefaultChatDetails: typeof import("state/actions/ai").getDefaultChatDetails;
let receiveLLMResponseChunk: typeof import("state/actions/ai").receiveLLMResponseChunk;
let memoryStorage: Storage;

describe("stopProjectChatResponse", () => {
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
    useLocalStorage = definitions.useLocalStorage;
    const ai = await import("state/actions/ai");
    stopProjectChatResponse = ai.stopProjectChatResponse;
    stopManagedSectionChatResponse = ai.stopManagedSectionChatResponse;
    getDefaultChatDetails = ai.getDefaultChatDetails;
    receiveLLMResponseChunk = ai.receiveLLMResponseChunk;
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
    useLocalStorage.persist.setOptions({
      storage: {
        getItem: memoryStorage.getItem.bind(memoryStorage),
        setItem: memoryStorage.setItem.bind(memoryStorage),
        removeItem: memoryStorage.removeItem.bind(memoryStorage),
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("rolls back project chat waiting state when stop llm chat fails", async () => {
    const chatId = "chat-stop-rollback";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
        },
      },
    });
    mockedRouteStopLlmChat.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "stop failed" },
    });
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: true,
        llmConfig: null,
      },
    });

    const stopped = await stopProjectChatResponse(chatId, false);

    expect(stopped).toBe(false);
    expect(mockedRouteStopLlmChat).toHaveBeenCalledWith({ chatId });
    expect(mockedRouteGetLLMChat).toHaveBeenCalledTimes(1);
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop project chat.",
      SettaNotificationTypeEnum.warning,
    );
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.waitingForResponse).toBe(true);
  });

  it("does not mark prior assistant messages as interrupted before message_start", async () => {
    const chatId = "chat-stop-no-message-start";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [
            createAssistantChatMessage({
              id: "assistant-prior",
              content: [
                createMessageTextContent({
                  text: "Earlier completed response",
                }),
              ],
            }),
          ],
          waitingForResponse: true,
        },
      },
    });
    mockedRouteStopLlmChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    const stopped = await stopProjectChatResponse(chatId, false);

    expect(stopped).toBe(true);
    expect(
      useAIStore.getState().interruptedAssistantMessageIdsByChatId[chatId],
    ).toBeUndefined();
  });

  it("restores optimistic interruption markers when stop reports already stopped", async () => {
    const chatId = "chat-stop-already-stopped";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [
            createAssistantChatMessage({
              id: "assistant-prior",
              content: [createMessageTextContent({ text: "Prior response" })],
            }),
          ],
          waitingForResponse: true,
        },
      },
    });
    receiveLLMResponseChunk({
      chatId,
      projectConfigId: "project-a",
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: createAssistantChatMessage({
          id: "assistant-current",
          content: [createMessageTextContent({ text: "Streaming now" })],
        }),
      },
    });
    mockedRouteStopLlmChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        alreadyStopped: true,
        stoppedRunId: null,
        stoppedMessageId: null,
      },
    });

    const stopped = await stopProjectChatResponse(chatId, false);

    expect(stopped).toBe(true);
    expect(mockedRouteGetLLMChat).not.toHaveBeenCalled();
    expect(
      useAIStore.getState().interruptedAssistantMessageIdsByChatId[chatId],
    ).toBeUndefined();
  });

  it("reconciles interruption marker to backend stopped message id", async () => {
    const chatId = "chat-stop-backend-message-id";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [
            createAssistantChatMessage({
              id: "assistant-prior",
              content: [createMessageTextContent({ text: "Prior response" })],
            }),
          ],
          waitingForResponse: true,
        },
      },
      interruptedAssistantMessageIdsByChatId: {
        [chatId]: {
          "assistant-prior": true,
        },
      },
    });
    receiveLLMResponseChunk({
      chatId,
      projectConfigId: "project-a",
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: createAssistantChatMessage({
          id: "assistant-local",
          content: [createMessageTextContent({ text: "Local optimistic" })],
        }),
      },
    });
    mockedRouteStopLlmChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        alreadyStopped: false,
        stoppedRunId: "run-1",
        stoppedMessageId: "assistant-backend",
      },
    });

    const stopped = await stopProjectChatResponse(chatId, false);

    expect(stopped).toBe(true);
    expect(
      useAIStore.getState().interruptedAssistantMessageIdsByChatId[chatId],
    ).toEqual({
      "assistant-prior": true,
      "assistant-backend": true,
    });
  });

  it("restores local project chat waiting/tool-call state when stop and llm hydrate both fail", async () => {
    const chatId = "chat-stop-rollback-hydrate-fail";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
          toolCallArguments: {
            "tool-call-1": '{"path":"/tmp/file.py"}',
          },
        },
      },
    });
    mockedRouteStopLlmChat.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "stop failed" },
    });
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "hydrate failed" },
    });

    const stopped = await stopProjectChatResponse(chatId, false);

    expect(stopped).toBe(false);
    expect(mockedRouteStopLlmChat).toHaveBeenCalledWith({ chatId });
    expect(mockedRouteGetLLMChat).toHaveBeenCalledTimes(1);
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop project chat.",
      SettaNotificationTypeEnum.warning,
    );
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.waitingForResponse).toBe(true);
    expect(details?.toolCallArguments).toEqual({
      "tool-call-1": '{"path":"/tmp/file.py"}',
    });
  });

  it("restores interruption map snapshot when stop and hydrate both fail", async () => {
    const chatId = "chat-stop-interruption-snapshot";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
          messages: [
            createAssistantChatMessage({
              id: "assistant-prior",
              content: [createMessageTextContent({ text: "Prior response" })],
            }),
          ],
        },
      },
      interruptedAssistantMessageIdsByChatId: {
        [chatId]: {
          "assistant-prior": true,
        },
      },
    });
    receiveLLMResponseChunk({
      chatId,
      projectConfigId: "project-a",
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: createAssistantChatMessage({
          id: "assistant-current",
          content: [createMessageTextContent({ text: "Streaming now" })],
        }),
      },
    });
    mockedRouteStopLlmChat.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "stop failed" },
    });
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "hydrate failed" },
    });

    const stopped = await stopProjectChatResponse(chatId, false);

    expect(stopped).toBe(false);
    expect(
      useAIStore.getState().interruptedAssistantMessageIdsByChatId[chatId],
    ).toEqual({
      "assistant-prior": true,
    });
  });

  it("keeps project chat stopped when llm stop succeeds", async () => {
    const chatId = "chat-stop-success";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
        },
      },
    });
    mockedRouteStopLlmChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    const stopped = await stopProjectChatResponse(chatId, false);

    expect(stopped).toBe(true);
    expect(mockedRouteGetLLMChat).not.toHaveBeenCalled();
    expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.waitingForResponse).toBe(false);
  });

  it("rehydrates external project chat state when stop endpoint fails", async () => {
    const chatId = "chat-stop-external";
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
          id: "run-1",
          status: AgentRunStatusEnum.running,
          inputs: {
            runType: "external_agent",
            chatId,
            projectConfigId: "project-a",
          },
        }),
      ],
    });
    mockedRouteStopExternalAgentRun.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "stop failed" },
    });
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: true,
        toolCallArguments: {},
      },
    });

    const stopped = await stopProjectChatResponse(chatId, true);

    expect(stopped).toBe(false);
    expect(mockedRouteStopExternalAgentRun).toHaveBeenCalledWith({
      runId: "run-1",
    });
    expect(mockedRouteGetExternalAgentChat).toHaveBeenCalledWith({
      chatId,
      projectConfigId: null,
    });
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop project chat.",
      SettaNotificationTypeEnum.warning,
    );
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.waitingForResponse).toBe(true);
  });

  it("restores local external project chat state when stop and hydrate both fail", async () => {
    const chatId = "chat-stop-external-hydrate-fail";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
          toolCallArguments: {
            "tool-call-2": '{"action":"continue"}',
          },
        },
      },
      agentRunsInitialLoadComplete: true,
      agentRuns: [
        createAgentRun({
          id: "run-external-hydrate-fail",
          status: AgentRunStatusEnum.running,
          inputs: {
            runType: "external_agent",
            chatId,
            projectConfigId: null,
          },
        }),
      ],
    });
    mockedRouteStopExternalAgentRun.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "stop failed" },
    });
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "hydrate failed" },
    });

    const stopped = await stopProjectChatResponse(chatId, true);

    expect(stopped).toBe(false);
    expect(mockedRouteStopExternalAgentRun).toHaveBeenCalledWith({
      runId: "run-external-hydrate-fail",
    });
    expect(mockedRouteGetExternalAgentChat).toHaveBeenCalledWith({
      chatId,
      projectConfigId: null,
    });
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop project chat.",
      SettaNotificationTypeEnum.warning,
    );
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.waitingForResponse).toBe(true);
    expect(details?.toolCallArguments).toEqual({
      "tool-call-2": '{"action":"continue"}',
    });
  });

  it("refreshes runs and retries external stop when local run cache is stale", async () => {
    const chatId = "chat-stop-external-stale-refresh";
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
    mockedRouteGetAgentRuns.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [
        createAgentRun({
          id: "run-refresh",
          status: AgentRunStatusEnum.running,
          inputs: {
            runType: "external_agent",
            chatId,
            projectConfigId: null,
          },
        }),
      ],
    });
    mockedRouteStopExternalAgentRun.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    const stopped = await stopProjectChatResponse(chatId, true);

    expect(stopped).toBe(true);
    expect(mockedRouteGetAgentRuns.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mockedRouteStopExternalAgentRun).toHaveBeenCalledWith({
      runId: "run-refresh",
    });
    expect(mockedRouteGetExternalAgentChat).not.toHaveBeenCalled();
    expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
  });

  it("rehydrates and warns when external stop cannot find a running run after refresh", async () => {
    const chatId = "chat-stop-external-stale-miss";
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
    mockedRouteGetAgentRuns.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [],
    });
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: true,
        toolCallArguments: {},
      },
    });

    const stopped = await stopProjectChatResponse(chatId, true);

    expect(stopped).toBe(false);
    expect(mockedRouteGetAgentRuns).toHaveBeenCalledTimes(1);
    expect(mockedRouteStopExternalAgentRun).not.toHaveBeenCalled();
    expect(mockedRouteGetExternalAgentChat).toHaveBeenCalledWith({
      chatId,
      projectConfigId: null,
    });
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop project chat.",
      SettaNotificationTypeEnum.warning,
    );
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.waitingForResponse).toBe(true);
  });

  it("treats stale external stop as success when hydrated chat is already complete", async () => {
    // If no running run is found but hydration shows no pending response, stop should succeed silently.
    const chatId = "chat-stop-external-stale-complete";
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
    mockedRouteGetAgentRuns.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [],
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

    const stopped = await stopProjectChatResponse(chatId, true);

    expect(stopped).toBe(true);
    expect(mockedRouteGetAgentRuns).toHaveBeenCalledTimes(1);
    expect(mockedRouteStopExternalAgentRun).not.toHaveBeenCalled();
    expect(mockedRouteGetExternalAgentChat).toHaveBeenCalledWith({
      chatId,
      projectConfigId: null,
    });
    expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.waitingForResponse).toBe(false);
  });

  it("uses section-specific warning copy for managed section stop failures", async () => {
    const chatId = "chat-stop-section-stale-miss";
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
    mockedRouteGetAgentRuns.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [],
    });
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: true,
        toolCallArguments: {},
      },
    });

    const stopped = await stopManagedSectionChatResponse(
      chatId,
      true,
      "project-a",
      "section-a",
    );

    expect(stopped).toBe(false);
    expect(mockedRouteGetExternalAgentChat).toHaveBeenCalledWith({
      chatId,
      projectConfigId: "project-a",
    });
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop section chat.",
      SettaNotificationTypeEnum.warning,
    );
  });

  it("restores local managed section chat state when llm stop and hydrate both fail", async () => {
    const chatId = "chat-stop-section-llm-hydrate-fail";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
          toolCallArguments: {
            "tool-call-3": '{"question":"proceed"}',
          },
        },
      },
    });
    mockedRouteStopLlmChat.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "stop failed" },
    });
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "hydrate failed" },
    });

    const stopped = await stopManagedSectionChatResponse(
      chatId,
      false,
      "project-a",
      "section-a",
    );

    expect(stopped).toBe(false);
    expect(mockedRouteStopLlmChat).toHaveBeenCalledWith({ chatId });
    expect(mockedRouteGetLLMChat).toHaveBeenCalledTimes(1);
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop section chat.",
      SettaNotificationTypeEnum.warning,
    );
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.waitingForResponse).toBe(true);
    expect(details?.toolCallArguments).toEqual({
      "tool-call-3": '{"question":"proceed"}',
    });
  });
});
