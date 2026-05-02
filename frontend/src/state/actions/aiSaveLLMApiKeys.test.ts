import {
  getLlmApiKeys,
  setLlmApiKeys,
  type HttpapiLlmapiKeysSnapshot,
} from "openapi/http";
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
import { createJSONStorage } from "zustand/middleware";

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getLlmApiKeys: vi.fn(),
    setLlmApiKeys: vi.fn(),
  };
});

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: async function <TData, TError>(
      promise: Promise<{
        data?: TData;
        error?: TError;
        response: Response;
      }>,
    ) {
      const result = await promise;
      return {
        data: (result.data ?? result.error) as TData | undefined,
        status: result.response.status,
        hasResponse: true,
      };
    },
  };
});

const mockedGetLLMApiKeys = vi.mocked(getLlmApiKeys);
const mockedSetLLMApiKeys = vi.mocked(setLlmApiKeys);

let useAIStore: typeof import("state/definitions").useAIStore;
let mutateAndSaveLLMApiKeys: typeof import("state/actions/ai").mutateAndSaveLLMApiKeys;
let receiveLLMApiKeysSnapshotUpdate: typeof import("state/actions/ai").receiveLLMApiKeysSnapshotUpdate;
let memoryStorage: Storage;

function createAPIKeysSnapshot(
  overrides: Partial<HttpapiLlmapiKeysSnapshot> = {},
): HttpapiLlmapiKeysSnapshot {
  return {
    apiKeys: {},
    corrupt: false,
    errorCode: null,
    message: null,
    revision: 0,
    ...overrides,
  };
}

function mockAPIKeysSuccess(
  data: HttpapiLlmapiKeysSnapshot,
  status: number = 200,
): Awaited<ReturnType<typeof setLlmApiKeys>> {
  return {
    data,
    error: undefined,
    request: new Request("http://localhost/llm/apiKeys"),
    response: new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  } as Awaited<ReturnType<typeof setLlmApiKeys>>;
}

function mockAPIKeysError(
  error: unknown,
  status: number,
): Awaited<ReturnType<typeof setLlmApiKeys>> {
  return {
    data: undefined,
    error,
    request: new Request("http://localhost/llm/apiKeys"),
    response: new Response(JSON.stringify(error), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  } as Awaited<ReturnType<typeof setLlmApiKeys>>;
}

function mockGetAPIKeysSuccess(
  data: HttpapiLlmapiKeysSnapshot,
  status: number = 200,
): Awaited<ReturnType<typeof getLlmApiKeys>> {
  return {
    data,
    error: undefined,
    request: new Request("http://localhost/llm/apiKeys"),
    response: new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  } as Awaited<ReturnType<typeof getLlmApiKeys>>;
}

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
    receiveLLMApiKeysSnapshotUpdate = ai.receiveLLMApiKeysSnapshotUpdate;
  });

  beforeEach(() => {
    resetProjectStores();
    useAIStore.persist.setOptions({
      storage: createJSONStorage(() => memoryStorage),
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
    mockedSetLLMApiKeys.mockResolvedValue(
      mockAPIKeysSuccess(
        createAPIKeysSnapshot({
          apiKeys: {
            OPENAI_API_KEY: "old-secret",
            ANTHROPIC_API_KEY: "new-secret",
          },
          revision: 4,
        }),
      ),
    );

    const didPersist = await mutateAndSaveLLMApiKeys((currentApiKeys) => ({
      ...currentApiKeys,
      ANTHROPIC_API_KEY: "new-secret",
    }));

    expect(didPersist).toBe(true);
    expect(mockedSetLLMApiKeys).toHaveBeenCalledWith({
      body: {
        apiKeys: {
          OPENAI_API_KEY: "old-secret",
          ANTHROPIC_API_KEY: "new-secret",
        },
        expectedRevision: 3,
      },
    });
    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({
      OPENAI_API_KEY: "old-secret",
      ANTHROPIC_API_KEY: "new-secret",
    });
    expect(state.apiKeysRevision).toBe(4);
    expect(state.apiKeysLoadError).toBeNull();
    expect(state.apiKeysAuthoritative).toBe(true);
  });

  it("reloads and retries on revision conflicts", async () => {
    useAIStore.setState({
      apiKeys: { OPENAI_API_KEY: "local-secret" },
      apiKeysRevision: 1,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: null,
    });
    mockedSetLLMApiKeys
      .mockResolvedValueOnce(
        mockAPIKeysError(
          {
            errorCode: "managed_api_keys_revision_conflict",
            message: "revision mismatch",
            revision: 2,
          },
          409,
        ),
      )
      .mockResolvedValueOnce(
        mockAPIKeysSuccess(
          createAPIKeysSnapshot({
            apiKeys: {
              OPENAI_API_KEY: "server-secret",
              GEMINI_API_KEY: "keep-this",
              ANTHROPIC_API_KEY: "new-secret",
            },
            revision: 3,
          }),
        ),
      );
    mockedGetLLMApiKeys.mockResolvedValue(
      mockGetAPIKeysSuccess(
        createAPIKeysSnapshot({
          apiKeys: {
            OPENAI_API_KEY: "server-secret",
            GEMINI_API_KEY: "keep-this",
          },
          revision: 2,
        }),
      ),
    );

    const didPersist = await mutateAndSaveLLMApiKeys((currentApiKeys) => ({
      ...currentApiKeys,
      ANTHROPIC_API_KEY: "new-secret",
    }));

    expect(didPersist).toBe(true);
    expect(mockedSetLLMApiKeys).toHaveBeenNthCalledWith(1, {
      body: {
        apiKeys: {
          OPENAI_API_KEY: "local-secret",
          ANTHROPIC_API_KEY: "new-secret",
        },
        expectedRevision: 1,
      },
    });
    expect(mockedSetLLMApiKeys).toHaveBeenNthCalledWith(2, {
      body: {
        apiKeys: {
          OPENAI_API_KEY: "server-secret",
          GEMINI_API_KEY: "keep-this",
          ANTHROPIC_API_KEY: "new-secret",
        },
        expectedRevision: 2,
      },
    });
    expect(mockedGetLLMApiKeys).toHaveBeenCalledTimes(1);
    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({
      OPENAI_API_KEY: "server-secret",
      GEMINI_API_KEY: "keep-this",
      ANTHROPIC_API_KEY: "new-secret",
    });
    expect(state.apiKeysRevision).toBe(3);
    expect(state.apiKeysLoadError).toBeNull();
    expect(state.apiKeysAuthoritative).toBe(true);
  });

  it("serializes queued mutations so later writes build on earlier revisions", async () => {
    useAIStore.setState({
      apiKeys: {},
      apiKeysRevision: 0,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: null,
    });
    let resolveFirstSave:
      | ((value: Awaited<ReturnType<typeof setLlmApiKeys>>) => void)
      | null = null;
    const firstSaveResponse = new Promise<
      Awaited<ReturnType<typeof setLlmApiKeys>>
    >((resolve) => {
      resolveFirstSave = resolve;
    });
    mockedSetLLMApiKeys
      .mockImplementationOnce(async () => await firstSaveResponse)
      .mockResolvedValueOnce(
        mockAPIKeysSuccess(
          createAPIKeysSnapshot({
            apiKeys: {
              OPENAI_API_KEY: "one",
              ANTHROPIC_API_KEY: "two",
            },
            revision: 2,
          }),
        ),
      );

    const firstMutation = mutateAndSaveLLMApiKeys((currentApiKeys) => ({
      ...currentApiKeys,
      OPENAI_API_KEY: "one",
    }));
    const secondMutation = mutateAndSaveLLMApiKeys((currentApiKeys) => ({
      ...currentApiKeys,
      ANTHROPIC_API_KEY: "two",
    }));

    await expect
      .poll(() => mockedSetLLMApiKeys.mock.calls.length)
      .toBeGreaterThanOrEqual(1);
    expect(mockedSetLLMApiKeys).toHaveBeenNthCalledWith(1, {
      body: {
        apiKeys: { OPENAI_API_KEY: "one" },
        expectedRevision: 0,
      },
    });

    resolveFirstSave?.(
      mockAPIKeysSuccess(
        createAPIKeysSnapshot({
          apiKeys: { OPENAI_API_KEY: "one" },
          revision: 1,
        }),
      ),
    );
    await Promise.all([firstMutation, secondMutation]);

    expect(mockedSetLLMApiKeys).toHaveBeenCalledTimes(2);
    expect(mockedSetLLMApiKeys).toHaveBeenNthCalledWith(2, {
      body: {
        apiKeys: {
          OPENAI_API_KEY: "one",
          ANTHROPIC_API_KEY: "two",
        },
        expectedRevision: 1,
      },
    });
    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({
      OPENAI_API_KEY: "one",
      ANTHROPIC_API_KEY: "two",
    });
    expect(state.apiKeysRevision).toBe(2);
    expect(state.apiKeysAuthoritative).toBe(true);
  });

  it("applies websocket snapshots by updating keys and revision atomically", () => {
    useAIStore.setState({
      apiKeys: { OPENAI_API_KEY: "old" },
      apiKeysRevision: 1,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: "stale error",
    });

    receiveLLMApiKeysSnapshotUpdate(
      createAPIKeysSnapshot({
        apiKeys: { OPENAI_API_KEY: "new", ANTHROPIC_API_KEY: "secret" },
        revision: 7,
      }),
    );

    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({
      OPENAI_API_KEY: "new",
      ANTHROPIC_API_KEY: "secret",
    });
    expect(state.apiKeysRevision).toBe(7);
    expect(state.apiKeysLoadError).toBeNull();
    expect(state.apiKeysAuthoritative).toBe(true);
  });

  it("surfaces websocket corruption snapshots without dropping revision metadata", () => {
    useAIStore.setState({
      apiKeys: { OPENAI_API_KEY: "old" },
      apiKeysRevision: 3,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: null,
    });

    receiveLLMApiKeysSnapshotUpdate(
      createAPIKeysSnapshot({
        apiKeys: {},
        revision: 9,
        corrupt: true,
        errorCode: "managed_api_keys_store_corrupt",
        message: "Managed API key store is corrupt.",
      }),
    );

    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({});
    expect(state.apiKeysRevision).toBe(9);
    expect(state.apiKeysLoadError).toBe("Managed API key store is corrupt.");
    expect(state.apiKeysAuthoritative).toBe(true);
  });

  it("surfaces websocket unavailable-store snapshots as load errors", () => {
    useAIStore.setState({
      apiKeys: { OPENAI_API_KEY: "old" },
      apiKeysRevision: 3,
      apiKeysInitialLoadComplete: true,
      apiKeysLoadError: null,
    });

    receiveLLMApiKeysSnapshotUpdate(
      createAPIKeysSnapshot({
        apiKeys: {},
        revision: 4,
        errorCode: "managed_api_keys_store_unavailable",
        message: "Managed API key store is unavailable.",
      }),
    );

    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({});
    expect(state.apiKeysRevision).toBe(4);
    expect(state.apiKeysLoadError).toBe(
      "Managed API key store is unavailable.",
    );
    expect(state.apiKeysAuthoritative).toBe(false);
  });
});
