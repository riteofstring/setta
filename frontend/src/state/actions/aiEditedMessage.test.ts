import { resetProjectStores } from "state/utils";
import { PLAIN_CHAT_APP_GENERATION_MESSAGE_MODE } from "state/utils/chatAppGeneration";
import {
  route_get_agent_runs,
  route_get_llm_chat,
  route_get_llm_response,
} from "utils/generatedEndpoints";
import {
  ChatRoleEnum,
  EngineTypeEnum,
  createEngineConfig,
  createMessageTextContent,
  createUserChatMessage,
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

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_agent_runs: vi.fn(),
    route_get_llm_chat: vi.fn(),
    route_get_llm_response: vi.fn(),
  };
});

vi.mock("state/actions/frontendWebsocketAffinity", () => ({
  waitForFrontendAffinityToken: vi.fn(async () => "frontend-test-id"),
}));

const mockedRouteGetAgentRuns = vi.mocked(route_get_agent_runs);
const mockedRouteGetLLMChat = vi.mocked(route_get_llm_chat);
const mockedRouteGetLLMResponse = vi.mocked(route_get_llm_response);

let useAIStore: typeof import("state/definitions").useAIStore;
let submitEditedMessage: typeof import("state/actions/aiChatSubmission").submitEditedMessage;
let getDefaultChatDetails: typeof import("state/actions/ai").getDefaultChatDetails;
let memoryStorage: Storage;

const chatId = "chat-1";
const OTHER_SURFACE_ID = "surface-other";
const TARGET_SURFACE_ID = "surface-target";

function buildGetLLMResponseResponse(chatId: string) {
  return {
    chatId,
    runId: `${chatId}-run`,
    engineType: "setta_llm" as const,
    sectionId: null,
  };
}

describe("submitEditedMessage", () => {
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
    const aiChatSubmission = await import("state/actions/aiChatSubmission");
    const ai = await import("state/actions/ai");
    submitEditedMessage = aiChatSubmission.submitEditedMessage;
    getDefaultChatDetails = ai.getDefaultChatDetails;
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
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: false,
        llmConfig: null,
        contextUsage: null,
        appGenerationByMessageId: {},
      },
    });
  });

  afterEach(() => {
    resetProjectStores();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("returns null without mutating surface-scoped pending state when message id is missing", async () => {
    useAIStore.setState({
      activeChatId: chatId,
      pendingChatDetailsBySurfaceId: {
        [OTHER_SURFACE_ID]: {
          ...getDefaultChatDetails(),
          messages: [],
        },
      },
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [],
        },
      },
    });

    const result = await submitEditedMessage({
      parentChatId: chatId,
      messages: [
        {
          id: "msg-1",
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: "Original" })],
          attachments: [],
        },
      ],
      messageId: "missing",
      message: "Edited",
      attachments: [],
      thinking: false,
      engineConfigId: "engine-1",
      isExternalEngine: false,
      agentProfileId: null,
      sectionId: null,
      pendingSurfaceId: TARGET_SURFACE_ID,
    });

    expect(result).toBeNull();
    const state = useAIStore.getState();
    expect(state.activeChatId).toBe(chatId);
    expect(
      state.pendingChatDetailsBySurfaceId[TARGET_SURFACE_ID],
    ).toBeUndefined();
    expect(state.pendingChatDetailsBySurfaceId[OTHER_SURFACE_ID]).toMatchObject(
      {
        messages: [],
      },
    );
  });

  it("preserves app-generation context when editing a branch from an app-generation message", async () => {
    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildGetLLMResponseResponse("branch-chat-1"),
    });

    const result = await submitEditedMessage({
      parentChatId: chatId,
      messages: [
        createUserChatMessage({
          id: "msg-1",
          content: [createMessageTextContent({ text: "Original app prompt" })],
          attachments: [],
        }),
      ],
      messageId: "msg-1",
      message: "Edited app prompt",
      attachments: [],
      thinking: false,
      engineConfigId: "engine-1",
      isExternalEngine: false,
      agentProfileId: null,
      sectionId: null,
      pendingSurfaceId: TARGET_SURFACE_ID,
      appGeneration: {
        mode: "prompt_builder",
      },
    });

    expect(result).toBe("branch-chat-1");
    expect(mockedRouteGetLLMResponse).toHaveBeenCalledTimes(1);
    const [payload] = mockedRouteGetLLMResponse.mock.calls[0] as [
      {
        appGenerationMode: string | null;
        appGenerationByMessageId: Record<string, string>;
        branchParentChatId: string | null;
        branchFromMessageId: string | null;
      },
    ];
    expect(payload.appGenerationMode).toBe("prompt_builder");
    expect(payload.appGenerationByMessageId).toEqual({
      "msg-1": "prompt_builder",
    });
    expect(payload.branchParentChatId).toBe(chatId);
    expect(payload.branchFromMessageId).toBe("msg-1");
  });

  it("keeps historical plain-chat edits plain while preserving inherited app-generation provenance", async () => {
    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildGetLLMResponseResponse("branch-chat-plain"),
    });
    useAIStore.setState({
      chatAppGenerationDetailsByChatId: {
        [chatId]: {
          activeAppGeneration: { mode: "mcp_server" },
          appGenerationByMessageId: {
            "msg-app": { mode: "json_render" },
          },
        },
      },
    });

    const result = await submitEditedMessage({
      parentChatId: chatId,
      messages: [
        createUserChatMessage({
          id: "msg-plain",
          content: [
            createMessageTextContent({ text: "Original plain prompt" }),
          ],
          attachments: [],
        }),
        createUserChatMessage({
          id: "msg-app",
          content: [createMessageTextContent({ text: "Original app prompt" })],
          attachments: [],
        }),
      ],
      messageId: "msg-plain",
      message: "Edited plain prompt",
      attachments: [],
      thinking: false,
      engineConfigId: "engine-1",
      isExternalEngine: false,
      agentProfileId: null,
      sectionId: null,
      pendingSurfaceId: TARGET_SURFACE_ID,
      appGeneration: null,
    });

    expect(result).toBe("branch-chat-plain");
    const [payload] = mockedRouteGetLLMResponse.mock.calls.at(-1) as [
      {
        appGenerationMode: string | null;
        appGenerationByMessageId: Record<string, string>;
      },
    ];
    expect(payload.appGenerationMode).toBeNull();
    expect(payload.appGenerationByMessageId).toEqual({
      "msg-plain": PLAIN_CHAT_APP_GENERATION_MESSAGE_MODE,
    });
  });

  it("falls back to the chat llm-config engine when agent runs do not provide an engine id", async () => {
    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildGetLLMResponseResponse("branch-chat-fallback"),
    });
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          llmConfig: {
            id: "llm-config-1",
            model: "gpt-4o-mini",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
        },
      },
      engineConfigs: [
        createEngineConfig({
          id: "engine-fallback",
          name: "Fallback engine",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "llm-config-1",
        }),
      ],
    });

    const result = await submitEditedMessage({
      parentChatId: chatId,
      messages: [
        createUserChatMessage({
          id: "msg-1",
          content: [createMessageTextContent({ text: "Original prompt" })],
          attachments: [],
        }),
      ],
      messageId: "msg-1",
      message: "Edited prompt",
      attachments: [],
      thinking: false,
      engineConfigId: null,
      isExternalEngine: false,
      agentProfileId: null,
      sectionId: null,
      pendingSurfaceId: TARGET_SURFACE_ID,
    });

    expect(result).toBe("branch-chat-fallback");
    const [payload] = mockedRouteGetLLMResponse.mock.calls.at(-1) as [
      { engineConfigId: string | null },
    ];
    expect(payload.engineConfigId).toBe("engine-fallback");
  });
});
