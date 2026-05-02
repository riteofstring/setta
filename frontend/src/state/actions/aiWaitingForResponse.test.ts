import { getLlmChat } from "openapi/http";
import { markChatStreamActive } from "state/aiStreamingTracker";
import type {
  useAIStore as useAIStoreType,
  useProjectState as useProjectStateType,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatAppGenerationMessageModeEnum,
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

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getLlmChat: vi.fn(),
  };
});

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
}));

const mockedRouteGetLLMChat = vi.mocked(getLlmChat);

const projectConfigId = "project-1";
const chatId = "chat-1";

let useAIStore: typeof useAIStoreType;
let useProjectState: typeof useProjectStateType;
let getDefaultChatDetails: typeof import("state/actions/ai").getDefaultChatDetails;
let getLLMChat: typeof import("state/actions/ai").getLLMChat;
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
    const ai = await import("state/actions/ai");
    getDefaultChatDetails = ai.getDefaultChatDetails;
    getLLMChat = ai.getLLMChat;
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

    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        toolCallArguments: {},
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

    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        toolCallArguments: {},
        waitingForResponse: false,
        llmConfig: null,
        appGenerationByMessageId: {},
      },
    });

    await getLLMChat(chatId);

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details.waitingForResponse).toBe(true);
  });

  it("hydrates backend tool call arguments while preserving the active-stream overlay", async () => {
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
          toolCallArguments: {
            local: `{"task":"Local overlay"}`,
          },
        },
      },
    });
    markChatStreamActive(chatId, null);

    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        toolCallArguments: {
          remote: `{"task":"Backend authoritative"}`,
        },
        waitingForResponse: false,
        llmConfig: null,
        appGenerationByMessageId: {},
      },
    });

    await getLLMChat(chatId);

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details.waitingForResponse).toBe(true);
    expect(details.toolCallArguments).toEqual({
      remote: `{"task":"Backend authoritative"}`,
      local: `{"task":"Local overlay"}`,
    });
  });

  it("keeps local-only tool call arguments but lets backend win for overlapping ids during active-stream hydrate", async () => {
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
          toolCallArguments: {
            shared: `{"task":"Local stale overlay"}`,
            localOnly: `{"task":"Still local only"}`,
          },
        },
      },
    });
    markChatStreamActive(chatId, null);

    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        toolCallArguments: {
          shared: `{"task":"Backend canonical"}`,
          remoteOnly: `{"task":"Backend only"}`,
        },
        waitingForResponse: false,
        llmConfig: null,
        appGenerationByMessageId: {},
      },
    });

    await getLLMChat(chatId);

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details.waitingForResponse).toBe(true);
    expect(details.toolCallArguments).toEqual({
      shared: `{"task":"Backend canonical"}`,
      remoteOnly: `{"task":"Backend only"}`,
      localOnly: `{"task":"Still local only"}`,
    });
  });

  it("keeps backend message order and backend-authored content during an active stream hydrate", async () => {
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
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

    mockedRouteGetLLMChat.mockResolvedValue({
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
    expect(details.waitingForResponse).toBe(true);
    const ids = details.messages.map((message) => message.id);
    expect(ids).toEqual(["user-1", "assistant-1"]);

    const assistant = details.messages.find(
      (message) => message.id === "assistant-1",
    );
    expect(assistant?.role).toBe(ChatRoleEnum.assistant);
    expect(assistant?.content?.[0]?.type).toBe("text");
    if (assistant?.content?.[0]?.type === "text") {
      expect(assistant.content[0].text).toBe("Hello");
    }
  });

  it("hydrates app-generation provenance with the chat response", async () => {
    mockedRouteGetLLMChat.mockResolvedValue({
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
    mockedRouteGetLLMChat.mockResolvedValue({
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
          "user-plain-1": ChatAppGenerationMessageModeEnum.plain_chat,
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

    mockedRouteGetLLMChat.mockResolvedValue({
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

  it("drops local-only messages while preserving the active waiting overlay during hydrate", async () => {
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
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

    mockedRouteGetLLMChat.mockResolvedValue({
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
    expect(details.waitingForResponse).toBe(true);
    expect(details.messages.map((message) => message.id)).toEqual([
      "assistant-remote",
    ]);
  });
});
