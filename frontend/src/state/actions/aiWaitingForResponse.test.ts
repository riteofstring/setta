import { markChatStreamActive } from "state/aiStreamingTracker";
import type {
  useAIStore as useAIStoreType,
  useProjectState as useProjectStateType,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
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
});
