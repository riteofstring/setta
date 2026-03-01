import { markChatStreamActive } from "state/aiStreamingTracker";
import type {
  useAIStore as useAIStoreType,
  useProjectState as useProjectStateType,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
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

    const route_get_llm_chat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    route_get_llm_chat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { messages: [], waitingForResponse: false, llmConfig: null },
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
      data: { messages: [], waitingForResponse: false, llmConfig: null },
    });

    await getLLMChat(chatId);

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details.waitingForResponse).toBe(true);
  });

  it("preserves backend message order when local assistant arrives before hydration", async () => {
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

  it("drops non-activity local-only messages after hydrate when no stream is active", async () => {
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
      },
    });

    await getLLMChat(chatId);

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details.messages.map((message) => message.id)).toEqual([
      "assistant-remote",
    ]);
  });

  it("keeps local-only assistant and activity rows while stream is active during hydrate", async () => {
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
            {
              id: "tool-local-activity",
              role: ChatRoleEnum.tool,
              tool_call_id: "call-local",
              tool_name: "setta__tool",
              arguments: {},
              result: null,
              content: [],
              is_error: false,
              started_at: "2026-03-01T00:00:00Z",
              completed_at: null,
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
      },
    });

    await getLLMChat(chatId);

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details.messages.map((message) => message.id)).toEqual([
      "assistant-remote",
      "assistant-local-only",
      "tool-local-activity",
    ]);
  });
});
