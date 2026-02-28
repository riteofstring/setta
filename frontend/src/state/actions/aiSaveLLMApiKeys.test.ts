import { resetProjectStores } from "state/utils";
import {
  route_get_llm_api_keys,
  route_set_llm_api_keys,
} from "utils/generatedEndpoints";
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
    route_get_llm_api_keys: vi.fn(),
    route_set_llm_api_keys: vi.fn(),
  };
});

const mockedRouteGetLLMApiKeys = vi.mocked(route_get_llm_api_keys);
const mockedRouteSetLLMApiKeys = vi.mocked(route_set_llm_api_keys);

let useAIStore: typeof import("state/definitions").useAIStore;
let mutateAndSaveLLMApiKeys: typeof import("state/actions/ai").mutateAndSaveLLMApiKeys;
let memoryStorage: Storage;

describe("mutateAndSaveLLMApiKeys", () => {
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

    const ai = await import("state/actions/ai");
    mutateAndSaveLLMApiKeys = ai.mutateAndSaveLLMApiKeys;
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

  it("saves an api-key mutation and updates revision state", async () => {
    useAIStore.setState({
      apiKeys: { OPENAI_API_KEY: "old-secret" },
      apiKeysRevision: 3,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: null,
    });
    mockedRouteSetLLMApiKeys.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        apiKeys: {
          OPENAI_API_KEY: "old-secret",
          ANTHROPIC_API_KEY: "new-secret",
        },
        revision: 4,
      },
    });

    const didPersist = await mutateAndSaveLLMApiKeys((currentApiKeys) => ({
      ...currentApiKeys,
      ANTHROPIC_API_KEY: "new-secret",
    }));

    expect(didPersist).toBe(true);
    expect(mockedRouteSetLLMApiKeys).toHaveBeenCalledWith({
      apiKeys: {
        OPENAI_API_KEY: "old-secret",
        ANTHROPIC_API_KEY: "new-secret",
      },
      expectedRevision: 3,
    });
    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({
      OPENAI_API_KEY: "old-secret",
      ANTHROPIC_API_KEY: "new-secret",
    });
    expect(state.apiKeysRevision).toBe(4);
    expect(state.apiKeysLoadError).toBeNull();
  });

  it("reloads and retries on revision conflicts", async () => {
    useAIStore.setState({
      apiKeys: { OPENAI_API_KEY: "local-secret" },
      apiKeysRevision: 1,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: null,
    });
    mockedRouteSetLLMApiKeys
      .mockResolvedValueOnce({
        status: 409,
        hasResponse: true,
        data: {
          errorCode: "managed_api_keys_revision_conflict",
          message: "revision mismatch",
          revision: 2,
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        hasResponse: true,
        data: {
          apiKeys: {
            OPENAI_API_KEY: "server-secret",
            GEMINI_API_KEY: "keep-this",
            ANTHROPIC_API_KEY: "new-secret",
          },
          revision: 3,
        },
      });
    mockedRouteGetLLMApiKeys.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        apiKeys: {
          OPENAI_API_KEY: "server-secret",
          GEMINI_API_KEY: "keep-this",
        },
        revision: 2,
      },
    });

    const didPersist = await mutateAndSaveLLMApiKeys((currentApiKeys) => ({
      ...currentApiKeys,
      ANTHROPIC_API_KEY: "new-secret",
    }));

    expect(didPersist).toBe(true);
    expect(mockedRouteSetLLMApiKeys).toHaveBeenNthCalledWith(1, {
      apiKeys: {
        OPENAI_API_KEY: "local-secret",
        ANTHROPIC_API_KEY: "new-secret",
      },
      expectedRevision: 1,
    });
    expect(mockedRouteSetLLMApiKeys).toHaveBeenNthCalledWith(2, {
      apiKeys: {
        OPENAI_API_KEY: "server-secret",
        GEMINI_API_KEY: "keep-this",
        ANTHROPIC_API_KEY: "new-secret",
      },
      expectedRevision: 2,
    });
    expect(mockedRouteGetLLMApiKeys).toHaveBeenCalledTimes(1);
    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({
      OPENAI_API_KEY: "server-secret",
      GEMINI_API_KEY: "keep-this",
      ANTHROPIC_API_KEY: "new-secret",
    });
    expect(state.apiKeysRevision).toBe(3);
    expect(state.apiKeysLoadError).toBeNull();
  });

  it("serializes queued mutations so later writes build on earlier revisions", async () => {
    useAIStore.setState({
      apiKeys: {},
      apiKeysRevision: 0,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: null,
    });
    let resolveFirstSave:
      | ((value: {
          status: number;
          hasResponse: boolean;
          data: { apiKeys: Record<string, string>; revision: number };
        }) => void)
      | null = null;
    const firstSaveResponse = new Promise<{
      status: number;
      hasResponse: boolean;
      data: { apiKeys: Record<string, string>; revision: number };
    }>((resolve) => {
      resolveFirstSave = resolve;
    });
    mockedRouteSetLLMApiKeys
      .mockImplementationOnce(async () => await firstSaveResponse)
      .mockResolvedValueOnce({
        status: 200,
        hasResponse: true,
        data: {
          apiKeys: {
            OPENAI_API_KEY: "one",
            ANTHROPIC_API_KEY: "two",
          },
          revision: 2,
        },
      });

    const firstMutation = mutateAndSaveLLMApiKeys((currentApiKeys) => ({
      ...currentApiKeys,
      OPENAI_API_KEY: "one",
    }));
    const secondMutation = mutateAndSaveLLMApiKeys((currentApiKeys) => ({
      ...currentApiKeys,
      ANTHROPIC_API_KEY: "two",
    }));

    await expect
      .poll(() => mockedRouteSetLLMApiKeys.mock.calls.length)
      .toBeGreaterThanOrEqual(1);
    expect(mockedRouteSetLLMApiKeys).toHaveBeenNthCalledWith(1, {
      apiKeys: { OPENAI_API_KEY: "one" },
      expectedRevision: 0,
    });

    resolveFirstSave?.({
      status: 200,
      hasResponse: true,
      data: {
        apiKeys: { OPENAI_API_KEY: "one" },
        revision: 1,
      },
    });
    await Promise.all([firstMutation, secondMutation]);

    expect(mockedRouteSetLLMApiKeys).toHaveBeenCalledTimes(2);
    expect(mockedRouteSetLLMApiKeys).toHaveBeenNthCalledWith(2, {
      apiKeys: {
        OPENAI_API_KEY: "one",
        ANTHROPIC_API_KEY: "two",
      },
      expectedRevision: 1,
    });
    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({
      OPENAI_API_KEY: "one",
      ANTHROPIC_API_KEY: "two",
    });
    expect(state.apiKeysRevision).toBe(2);
  });
});
