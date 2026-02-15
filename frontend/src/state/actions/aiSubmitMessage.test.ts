import { resetProjectStores } from "state/utils";
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
    route_get_llm_response: vi.fn(),
  };
});

let useAIStore: typeof import("state/definitions").useAIStore;
let useLocalStorage: typeof import("state/definitions").useLocalStorage;
let submitMessage: typeof import("state/actions/ai").submitMessage;
let getDefaultChatDetails: typeof import("state/actions/ai").getDefaultChatDetails;
let memoryStorage: Storage;

describe("submitMessage", () => {
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
    submitMessage = ai.submitMessage;
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
  });

  afterEach(() => {
    resetProjectStores();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("throws backend error detail and rolls back optimistic user messages", async () => {
    const chatId = "chat-submit-detail";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [],
          waitingForResponse: false,
        },
      },
    });

    const route_get_llm_response = (await import("utils/generatedEndpoints"))
      .route_get_llm_response as unknown as vi.Mock;
    route_get_llm_response.mockResolvedValue({
      status: 400,
      hasResponse: true,
      data: {
        detail: "Reference image notes exceed 5000 characters.",
      },
    });

    await expect(
      submitMessage(
        chatId,
        "Generate a compact dashboard.",
        [],
        true,
        "engine-primary",
        false,
      ),
    ).rejects.toThrow("Reference image notes exceed 5000 characters.");

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.messages).toHaveLength(0);
    expect(details?.waitingForResponse).toBe(false);
  });

  it("falls back to status-derived errors when backend detail is absent", async () => {
    const chatId = "chat-submit-status-fallback";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [],
          waitingForResponse: false,
        },
      },
    });

    const route_get_llm_response = (await import("utils/generatedEndpoints"))
      .route_get_llm_response as unknown as vi.Mock;
    route_get_llm_response.mockResolvedValue({
      status: 503,
      hasResponse: true,
      data: null,
    });

    await expect(
      submitMessage(
        chatId,
        "Generate a compact dashboard.",
        [],
        true,
        "engine-primary",
        false,
      ),
    ).rejects.toThrow("Chat request failed (status 503).");
  });

  it("passes app-generation mode context through to the backend request", async () => {
    const route_get_llm_response = (await import("utils/generatedEndpoints"))
      .route_get_llm_response as unknown as vi.Mock;
    route_get_llm_response.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    await expect(
      submitMessage(
        null,
        "Generate from MCP context.",
        [],
        true,
        "engine-primary",
        false,
        {
          appGeneration: {
            mode: "mcp_server",
            referenceImageUrl: "https://example.com/reference.png",
            referenceImageNotes: "Preserve hierarchy first.",
          },
        },
      ),
    ).resolves.toBeNull();

    expect(route_get_llm_response).toHaveBeenCalledTimes(1);
    const [payload] = route_get_llm_response.mock.calls[0] as [
      {
        appGenerationMode: string | null;
        appGenerationReferenceImageUrl: string | null;
        appGenerationReferenceImageNotes: string | null;
      },
    ];
    expect(payload.appGenerationMode).toBe("mcp_server");
    expect(payload.appGenerationReferenceImageUrl).toBe(
      "https://example.com/reference.png",
    );
    expect(payload.appGenerationReferenceImageNotes).toBe(
      "Preserve hierarchy first.",
    );
  });

  it("does not send app-spec streaming guidance for normal chat submits", async () => {
    useLocalStorage.setState({
      appSpecStreamingEnabled: true,
    });
    const route_get_llm_response = (await import("utils/generatedEndpoints"))
      .route_get_llm_response as unknown as vi.Mock;
    route_get_llm_response.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    await expect(
      submitMessage(
        null,
        "Just answer this question.",
        [],
        true,
        "engine-primary",
        false,
      ),
    ).resolves.toBeNull();

    expect(route_get_llm_response).toHaveBeenCalledTimes(1);
    const [payload] = route_get_llm_response.mock.calls[0] as [
      {
        appSpecStreamingEnabled: boolean;
        appGenerationMode: string | null;
      },
    ];
    expect(payload.appSpecStreamingEnabled).toBe(false);
    expect(payload.appGenerationMode).toBeNull();
  });

  it("uses explicit execution settings and app-generation options together", async () => {
    useLocalStorage.setState({
      appSpecStreamingEnabled: true,
    });
    const route_get_llm_response = (await import("utils/generatedEndpoints"))
      .route_get_llm_response as unknown as vi.Mock;
    route_get_llm_response.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    await expect(
      submitMessage(
        null,
        "Generate from MCP context.",
        [],
        true,
        "engine-primary",
        false,
        {
          executionSettings: {
            permissionMode: "yolo",
            searchEnabled: false,
          },
          appGeneration: {
            mode: "mcp_server",
            referenceImageUrl: null,
            referenceImageNotes: null,
          },
        },
      ),
    ).resolves.toBeNull();

    expect(route_get_llm_response).toHaveBeenCalledTimes(1);
    const [payload] = route_get_llm_response.mock.calls[0] as [
      {
        permissionMode: string;
        searchEnabled: boolean;
        appSpecStreamingEnabled: boolean;
      },
    ];
    expect(payload.permissionMode).toBe("yolo");
    expect(payload.searchEnabled).toBe(false);
    expect(payload.appSpecStreamingEnabled).toBe(true);
  });
});
