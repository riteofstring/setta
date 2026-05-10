import {
  getAgentRuns,
  getExternalAgentChat,
  getLlmChat,
  stopExternalAgentRun,
  stopLlmChat,
} from "openapi/http";
import { resetProjectStores } from "state/utils";
import {
  NotificationTypeEnum,
  RunStatusEnum,
  StreamingEventTypeEnum,
  createAgentRun,
  createAssistantChatMessage,
  createMessageTextContent,
  createProjectConfig,
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

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getAgentRuns: vi.fn(),
    getExternalAgentChat: vi.fn(),
    getLlmChat: vi.fn(),
    stopExternalAgentRun: vi.fn(),
    stopLlmChat: vi.fn(),
  };
});

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

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

const mockedRouteGetAgentRuns = vi.mocked(getAgentRuns);
const mockedRouteGetExternalAgentChat = vi.mocked(getExternalAgentChat);
const mockedRouteGetLLMChat = vi.mocked(getLlmChat);
const mockedRouteStopExternalAgentRun = vi.mocked(stopExternalAgentRun);
const mockedRouteStopLlmChat = vi.mocked(stopLlmChat);
const mockedAddTemporaryNotification = vi.mocked(addTemporaryNotification);

let useAIStore: typeof import("state/definitions").useAIStore;
let useAIFollow: typeof import("state/definitions").useAIFollow;
let useLocalStorage: typeof import("state/definitions").useLocalStorage;
let useProjectState: typeof import("state/definitions").useProjectState;
let stopProjectChatResponse: typeof import("state/actions/ai").stopProjectChatResponse;
let stopManagedSectionChatResponse: typeof import("state/actions/ai").stopManagedSectionChatResponse;
let getLLMChatHydrationOutcome: typeof import("state/actions/ai").getLLMChatHydrationOutcome;
let getExternalAgentChatHydrationOutcome: typeof import("state/actions/ai").getExternalAgentChatHydrationOutcome;
let getDefaultChatDetails: typeof import("state/actions/ai").getDefaultChatDetails;
let receiveLLMResponseChunk: typeof import("state/actions/ai").receiveLLMResponseChunk;
let memoryStorage: Storage;

function seedFollowToolArguments(
  projectConfigId: string,
  chatId: string,
  idsByType: Record<string, string[]> = {
    section: ["section-follow-highlight"],
  },
): void {
  useAIFollow.setState((state) => {
    const projectEntries =
      state.toolArgumentsIdsByProjectConfigId[projectConfigId] ??
      (state.toolArgumentsIdsByProjectConfigId[projectConfigId] = {});
    projectEntries[chatId] = idsByType;
  });
}

function getFollowToolArguments(
  projectConfigId: string,
  chatId: string,
): Record<string, string[]> | null {
  return (
    useAIFollow.getState().toolArgumentsIdsByProjectConfigId[projectConfigId]?.[
      chatId
    ] ?? null
  );
}

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
    useAIFollow = definitions.useAIFollow;
    useLocalStorage = definitions.useLocalStorage;
    useProjectState = definitions.useProjectState;
    const ai = await import("state/actions/ai");
    stopProjectChatResponse = ai.stopProjectChatResponse;
    stopManagedSectionChatResponse = ai.stopManagedSectionChatResponse;
    getLLMChatHydrationOutcome = ai.getLLMChatHydrationOutcome;
    getExternalAgentChatHydrationOutcome =
      ai.getExternalAgentChatHydrationOutcome;
    getDefaultChatDetails = ai.getDefaultChatDetails;
    receiveLLMResponseChunk = ai.receiveLLMResponseChunk;
  });

  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-a",
        name: "demo",
      }),
    });
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
    expect(mockedRouteStopLlmChat).toHaveBeenCalledWith({
      body: { chatId },
    });
    expect(mockedRouteGetLLMChat).toHaveBeenCalledTimes(1);
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop project chat.",
      NotificationTypeEnum.warning,
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

  it("ignores backend stoppedMessageId when no local stop-eligible message exists", async () => {
    const chatId = "chat-stop-no-local-eligible";
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
        type: StreamingEventTypeEnum.message_start,
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

  it("restores optimistic interruption markers when backend omits stoppedMessageId", async () => {
    const chatId = "chat-stop-null-message-id";
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
        type: StreamingEventTypeEnum.message_start,
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
        alreadyStopped: false,
        stoppedRunId: "run-1",
        stoppedMessageId: null,
      },
    });

    const stopped = await stopProjectChatResponse(chatId, false);

    expect(stopped).toBe(true);
    expect(
      useAIStore.getState().interruptedAssistantMessageIdsByChatId[chatId],
    ).toEqual({
      "assistant-prior": true,
    });
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
        type: StreamingEventTypeEnum.message_start,
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
    expect(mockedRouteStopLlmChat).toHaveBeenCalledWith({
      body: { chatId },
    });
    expect(mockedRouteGetLLMChat).toHaveBeenCalledTimes(1);
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop project chat.",
      NotificationTypeEnum.warning,
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
        type: StreamingEventTypeEnum.message_start,
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

  it("clears follow tool-argument highlights on successful project chat stop", async () => {
    const chatId = "chat-stop-follow-highlight";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
        },
      },
    });
    seedFollowToolArguments("project-a", chatId);
    mockedRouteStopLlmChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    const stopped = await stopProjectChatResponse(chatId, false);

    expect(stopped).toBe(true);
    // Successful stops should clear the local Follow AI work map immediately,
    // not wait for a later follow websocket echo.
    expect(getFollowToolArguments("project-a", chatId)).toBeNull();
  });

  it("restores follow tool-argument highlights when stop fails but hydration says the chat is still running", async () => {
    const chatId = "chat-stop-follow-highlight-rollback";
    const idsByType = {
      section: ["section-follow-highlight"],
      file: ["/tmp/example.py"],
    };
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
        },
      },
    });
    seedFollowToolArguments("project-a", chatId, idsByType);
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
    // Failed stop requests must restore the prior Follow AI scope when the
    // runtime is still active after hydration.
    expect(getFollowToolArguments("project-a", chatId)).toEqual(idsByType);
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
          status: RunStatusEnum.running,
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
      body: { runId: "run-1" },
    });
    expect(mockedRouteGetExternalAgentChat).toHaveBeenCalledWith({
      body: {
        chatId,
        projectConfigId: "project-a",
      },
    });
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop project chat.",
      NotificationTypeEnum.warning,
    );
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.waitingForResponse).toBe(true);
  });

  it("keeps external project chat stop scoped to the current project when chat ids overlap", async () => {
    const chatId = "chat-stop-external-shared";
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
          id: "run-project-a",
          status: RunStatusEnum.running,
          startedAt: "2026-03-01T00:00:00Z",
          inputs: {
            runType: "external_agent",
            chatId,
            projectConfigId: "project-a",
          },
        }),
        createAgentRun({
          id: "run-project-b",
          status: RunStatusEnum.running,
          startedAt: "2026-03-02T00:00:00Z",
          inputs: {
            runType: "external_agent",
            chatId,
            projectConfigId: "project-b",
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
      body: { runId: "run-project-a" },
    });
    expect(mockedRouteStopExternalAgentRun).not.toHaveBeenCalledWith({
      body: { runId: "run-project-b" },
    });
    expect(mockedRouteGetExternalAgentChat).toHaveBeenCalledWith({
      body: {
        chatId,
        projectConfigId: "project-a",
      },
    });
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
          status: RunStatusEnum.running,
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
      status: 500,
      hasResponse: true,
      data: { detail: "hydrate failed" },
    });

    const stopped = await stopProjectChatResponse(chatId, true);

    expect(stopped).toBe(false);
    expect(mockedRouteStopExternalAgentRun).toHaveBeenCalledWith({
      body: { runId: "run-external-hydrate-fail" },
    });
    expect(mockedRouteGetExternalAgentChat).toHaveBeenCalledWith({
      body: {
        chatId,
        projectConfigId: "project-a",
      },
    });
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop project chat.",
      NotificationTypeEnum.warning,
    );
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.waitingForResponse).toBe(true);
    expect(details?.toolCallArguments).toEqual({
      "tool-call-2": '{"action":"continue"}',
    });
  });

  it("does not keep interruption markers when external stop returns a non-cancelled run", async () => {
    const chatId = "chat-stop-external-noop";
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
      agentRunsInitialLoadComplete: true,
      agentRuns: [
        createAgentRun({
          id: "run-external-noop",
          status: RunStatusEnum.running,
          inputs: {
            runType: "external_agent",
            chatId,
            projectConfigId: "project-a",
          },
        }),
      ],
    });
    receiveLLMResponseChunk({
      chatId,
      projectConfigId: "project-a",
      chunk: {
        type: StreamingEventTypeEnum.message_start,
        message: createAssistantChatMessage({
          id: "assistant-current",
          content: [createMessageTextContent({ text: "Streaming now" })],
        }),
      },
    });
    mockedRouteStopExternalAgentRun.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createAgentRun({
        id: "run-external-noop",
        status: RunStatusEnum.completed,
      }),
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
    expect(mockedRouteGetExternalAgentChat).toHaveBeenCalledWith({
      body: {
        chatId,
        projectConfigId: "project-a",
      },
    });
    expect(
      useAIStore.getState().interruptedAssistantMessageIdsByChatId[chatId],
    ).toBeUndefined();
    expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
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
          status: RunStatusEnum.running,
          inputs: {
            runType: "external_agent",
            chatId,
            projectConfigId: "project-a",
          },
        }),
      ],
    });
    mockedRouteStopExternalAgentRun.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createAgentRun({
        id: "run-refresh",
        status: RunStatusEnum.cancelled,
      }),
    });

    const stopped = await stopProjectChatResponse(chatId, true);

    expect(stopped).toBe(true);
    expect(mockedRouteGetAgentRuns).toHaveBeenCalledTimes(1);
    expect(mockedRouteStopExternalAgentRun).toHaveBeenCalledWith({
      body: { runId: "run-refresh" },
    });
    expect(mockedRouteGetExternalAgentChat).not.toHaveBeenCalled();
    expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
    expect(useAIStore.getState().agentRuns).toEqual([
      expect.objectContaining({
        id: "run-refresh",
        status: RunStatusEnum.cancelled,
      }),
    ]);
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
      body: {
        chatId,
        projectConfigId: "project-a",
      },
    });
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop project chat.",
      NotificationTypeEnum.warning,
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
      body: {
        chatId,
        projectConfigId: "project-a",
      },
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
      body: {
        chatId,
        projectConfigId: "project-a",
      },
    });
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop section chat.",
      NotificationTypeEnum.warning,
    );
  });

  it("restores managed section interruption markers when backend omits stoppedMessageId", async () => {
    const chatId = "chat-stop-section-null-message-id";
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
        type: StreamingEventTypeEnum.message_start,
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
        alreadyStopped: false,
        stoppedRunId: "run-1",
        stoppedMessageId: null,
      },
    });

    const stopped = await stopManagedSectionChatResponse(
      chatId,
      false,
      "project-a",
      "section-a",
    );

    expect(stopped).toBe(true);
    expect(
      useAIStore.getState().interruptedAssistantMessageIdsByChatId[chatId],
    ).toEqual({
      "assistant-prior": true,
    });
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
    expect(mockedRouteStopLlmChat).toHaveBeenCalledWith({
      body: { chatId },
    });
    expect(mockedRouteGetLLMChat).toHaveBeenCalledTimes(1);
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to stop section chat.",
      NotificationTypeEnum.warning,
    );
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.waitingForResponse).toBe(true);
    expect(details?.toolCallArguments).toEqual({
      "tool-call-3": '{"question":"proceed"}',
    });
  });
});
