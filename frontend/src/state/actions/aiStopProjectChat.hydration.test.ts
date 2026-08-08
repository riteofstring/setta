import { getExternalAgentChat, getLlmChat } from "openapi/http";
import { resetProjectStores } from "state/utils";
import {
  StreamingEventTypeEnum,
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

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getExternalAgentChat: vi.fn(),
    getLlmChat: vi.fn(),
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

const mockedRouteGetExternalAgentChat = vi.mocked(getExternalAgentChat);
const mockedRouteGetLLMChat = vi.mocked(getLlmChat);

let useAIStore: typeof import("state/definitions").useAIStore;
let useAIFollow: typeof import("state/definitions").useAIFollow;
let useLocalStorage: typeof import("state/definitions").useLocalStorage;
let useProjectState: typeof import("state/definitions").useProjectState;
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

describe("project chat hydration outcomes", () => {
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
  });

  afterEach(() => {
    resetProjectStores();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("classifies 404 hydration failures as terminal outcomes", async () => {
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 404,
      hasResponse: true,
      data: {
        detail: {
          errorCode: "chat_not_found",
          message: "Chat not found",
        },
      },
    });

    const outcome = await getLLMChatHydrationOutcome("chat-missing");

    expect(outcome).toEqual({
      outcome: "terminal_failure",
      status: 404,
      errorCode: "chat_not_found",
    });
  });

  it("clears follow tool-argument highlights when a message stop chunk arrives", async () => {
    const chatId = "chat-message-stop-follow-highlight";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
        },
      },
    });
    seedFollowToolArguments("project-a", chatId);

    receiveLLMResponseChunk({
      chatId,
      projectConfigId: "project-a",
      chunk: {
        type: StreamingEventTypeEnum.message_stop,
        message_id: "assistant-streaming",
      },
    });

    // Stream stop events should tear down Follow AI work highlights even when
    // no explicit stop button flow ran locally first.
    expect(getFollowToolArguments("project-a", chatId)).toBeNull();
  });

  it("clears follow tool-argument highlights when llm hydration resolves to a completed chat", async () => {
    const chatId = "chat-hydration-follow-highlight";
    seedFollowToolArguments("project-a", chatId);
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: false,
        llmConfig: null,
      },
    });

    const outcome = await getLLMChatHydrationOutcome(chatId);

    expect(outcome).toEqual({
      outcome: "success",
      status: 200,
      errorCode: null,
    });
    // Rehydration after a dropped stream should clear stale Follow AI activity
    // if the backend now says the chat is no longer running.
    expect(getFollowToolArguments("project-a", chatId)).toBeNull();
  });

  it("classifies 403 hydration failures as llm_disallowed terminal outcomes", async () => {
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 403,
      hasResponse: true,
      data: { detail: "Deployment policy disallows LLM access." },
    });

    const outcome = await getLLMChatHydrationOutcome("chat-llm-blocked");

    expect(outcome).toEqual({
      outcome: "terminal_failure",
      status: 403,
      errorCode: "llm_disallowed",
    });
  });

  it("maps unknown terminal hydration codes to the generic terminal code", async () => {
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 409,
      hasResponse: true,
      data: {
        detail: {
          errorCode: "engine_config_missing",
          message: "Chat engine config is no longer available.",
        },
      },
    });

    const outcome = await getLLMChatHydrationOutcome("chat-missing-engine");

    expect(outcome).toEqual({
      outcome: "terminal_failure",
      status: 409,
      errorCode: "terminal_hydration_failure",
    });
  });

  it("classifies 5xx hydration failures as transient outcomes", async () => {
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "Server error" },
    });

    const outcome = await getLLMChatHydrationOutcome("chat-transient-error");

    expect(outcome).toEqual({
      outcome: "transient_failure",
      status: 500,
      errorCode: null,
    });
  });

  it("maps terminal hydration failures without typed codes to a generic blocked code", async () => {
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 409,
      hasResponse: true,
      data: { detail: "Terminal failure without typed code" },
    });

    const outcome = await getLLMChatHydrationOutcome("chat-terminal-unknown");

    expect(outcome).toEqual({
      outcome: "terminal_failure",
      status: 409,
      errorCode: "terminal_hydration_failure",
    });
  });

  it("classifies typed external 404 hydration failures as chat_not_found", async () => {
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 404,
      hasResponse: true,
      data: {
        detail: {
          errorCode: "chat_not_found",
          message: "Chat not found.",
        },
      },
    });

    const outcome = await getExternalAgentChatHydrationOutcome(
      "external-chat-missing",
      "project-external",
    );

    expect(outcome).toEqual({
      outcome: "terminal_failure",
      status: 404,
      errorCode: "chat_not_found",
    });
  });

  it("classifies external 403 hydration failures as llm_disallowed terminal outcomes", async () => {
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 403,
      hasResponse: true,
      data: { detail: "Deployment policy disallows LLM access." },
    });

    const outcome = await getExternalAgentChatHydrationOutcome(
      "external-chat-blocked",
      "project-external",
    );

    expect(outcome).toEqual({
      outcome: "terminal_failure",
      status: 403,
      errorCode: "llm_disallowed",
    });
  });
});
