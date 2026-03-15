import { markChatStreamActive } from "state/aiStreamingTracker";
import type {
  useAIStore as useAIStoreType,
  useProjectState as useProjectStateType,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { PLAIN_CHAT_APP_GENERATION_MESSAGE_MODE } from "state/utils/chatAppGeneration";
import {
  ChatRoleEnum,
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

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_llm_chat: vi.fn(),
  };
});

const projectConfigId = "project-1";
const chatId = "chat-1";

let useAIStore: typeof useAIStoreType;
let useProjectState: typeof useProjectStateType;
let getDefaultChatDetails: typeof import("state/actions/aiChatDetails").getDefaultChatDetails;
let getLLMChat: typeof import("state/actions/aiHydration").getLLMChat;
let memoryStorage: Storage;

function seedProjectConfig() {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
  });
}

describe("chat hydration waitingForResponse", () => {
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
    useProjectState = definitions.useProjectState;
    const aiChatDetails = await import("state/actions/aiChatDetails");
    const aiHydration = await import("state/actions/aiHydration");
    getDefaultChatDetails = aiChatDetails.getDefaultChatDetails;
    getLLMChat = aiHydration.getLLMChat;
  });

  beforeEach(() => {
    resetProjectStores();
    seedProjectConfig();
    useAIStore.persist.setOptions({
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

  it("clears waiting when no active stream", async () => {
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
        },
      },
    });

    const route_get_llm_chat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    route_get_llm_chat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: false,
        llmConfig: null,
        appGenerationByMessageId: {},
      },
    });

    await getLLMChat(chatId);

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details.waitingForResponse).toBe(false);
  });

  it("preserves waiting when stream is active", async () => {
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
        },
      },
    });
    markChatStreamActive(chatId, null);

    const route_get_llm_chat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    route_get_llm_chat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: false,
        llmConfig: null,
        appGenerationByMessageId: {},
      },
    });

    await getLLMChat(chatId);

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details.waitingForResponse).toBe(true);
  });

  it("preserves backend message order when local assistant arrives before hydration during an active stream", async () => {
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [
            {
              id: "assistant-1",
              role: ChatRoleEnum.assistant,
              content: [
                createMessageTextContent({ text: "Hello there streaming" }),
              ],
              attachments: [],
              tool_calls: null,
            },
          ],
        },
      },
    });
    markChatStreamActive(chatId, null);

    const route_get_llm_chat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    route_get_llm_chat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "user-1",
            role: ChatRoleEnum.user,
            content: [createMessageTextContent({ text: "Hi" })],
            attachments: [],
          },
          {
            id: "assistant-1",
            role: ChatRoleEnum.assistant,
            content: [createMessageTextContent({ text: "Hello" })],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        llmConfig: null,
        appGenerationByMessageId: {},
      },
    });

    await getLLMChat(chatId);

    const details = useAIStore.getState().chatDetails[chatId];
    const ids = details.messages.map((message) => message.id);
    expect(ids).toEqual(["user-1", "assistant-1"]);

    const assistant = details.messages.find(
      (message) => message.id === "assistant-1",
    );
    expect(assistant?.role).toBe(ChatRoleEnum.assistant);
    expect(assistant?.content?.[0]?.type).toBe("text");
    if (assistant?.content?.[0]?.type === "text") {
      expect(assistant.content[0].text).toBe("Hello there streaming");
    }
  });

  it("hydrates app-generation provenance with the chat response", async () => {
    const route_get_llm_chat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    route_get_llm_chat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "user-app-1",
            role: ChatRoleEnum.user,
            content: [createMessageTextContent({ text: "Build from MCP." })],
            attachments: [],
          },
        ],
        waitingForResponse: false,
        llmConfig: null,
        appGenerationByMessageId: {
          "user-app-1": "mcp_server",
        },
      },
    });

    await getLLMChat(chatId);

    expect(
      useAIStore.getState().chatAppGenerationDetailsByChatId[chatId],
    ).toEqual({
      activeAppGeneration: {
        mode: "mcp_server",
      },
      appGenerationByMessageId: {
        "user-app-1": {
          mode: "mcp_server",
        },
      },
    });
  });

  it("hydrates explicit plain-chat provenance without reviving an older app-generation mode", async () => {
    const route_get_llm_chat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    route_get_llm_chat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "user-plain-1",
            role: ChatRoleEnum.user,
            content: [
              createMessageTextContent({ text: "Just answer normally." }),
            ],
            attachments: [],
          },
        ],
        waitingForResponse: false,
        llmConfig: null,
        appGenerationByMessageId: {
          "user-plain-1": PLAIN_CHAT_APP_GENERATION_MESSAGE_MODE,
        },
      },
    });

    await getLLMChat(chatId);

    expect(
      useAIStore.getState().chatAppGenerationDetailsByChatId[chatId],
    ).toEqual({
      activeAppGeneration: null,
      appGenerationByMessageId: {
        "user-plain-1": {
          mode: null,
        },
      },
    });
  });

  it("drops local-only messages after hydrate when no stream is active", async () => {
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [
            {
              id: "assistant-local-only",
              role: ChatRoleEnum.assistant,
              content: [
                createMessageTextContent({ text: "Local only pending" }),
              ],
              attachments: [],
              tool_calls: null,
            },
          ],
        },
      },
    });

    const route_get_llm_chat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    route_get_llm_chat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "assistant-remote",
            role: ChatRoleEnum.assistant,
            content: [createMessageTextContent({ text: "Remote canonical" })],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        llmConfig: null,
        appGenerationByMessageId: {},
      },
    });

    await getLLMChat(chatId);

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details.messages.map((message) => message.id)).toEqual([
      "assistant-remote",
    ]);
  });

  it("keeps local-only messages while stream is active during hydrate", async () => {
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [
            {
              id: "assistant-local-only",
              role: ChatRoleEnum.assistant,
              content: [
                createMessageTextContent({ text: "Local only pending" }),
              ],
              attachments: [],
              tool_calls: null,
            },
          ],
        },
      },
    });
    markChatStreamActive(chatId, null);

    const route_get_llm_chat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    route_get_llm_chat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "assistant-remote",
            role: ChatRoleEnum.assistant,
            content: [createMessageTextContent({ text: "Remote canonical" })],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        llmConfig: null,
        appGenerationByMessageId: {},
      },
    });

    await getLLMChat(chatId);

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details.messages.map((message) => message.id)).toEqual([
      "assistant-remote",
      "assistant-local-only",
    ]);
  });
});
