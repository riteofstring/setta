import {
  getAgentRuns,
  getLlmApiKeys,
  getLlmConfig,
  type HttpapiLlmapiKeysSnapshot,
} from "openapi/http";
import { resetProjectStores } from "state/utils";
import { createAgentRun } from "utils/generatedTypes";
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

const LEGACY_AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.agentNativeSlashCommandsByProjectConfigId";

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getAgentRuns: vi.fn(),
    getLlmApiKeys: vi.fn(),
    getLlmConfig: vi.fn(),
  };
});

vi.mock("openapi/http/result", () => ({
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
}));

const mockedRouteGetAgentRuns = vi.mocked(getAgentRuns);
const mockedGetLlmApiKeys = vi.mocked(getLlmApiKeys);
const mockedGetLlmConfig = vi.mocked(getLlmConfig);

let useAIStore: typeof import("state/definitions").useAIStore;
let loadAgentRuns: typeof import("state/actions/ai").loadAgentRuns;
let loadLLMApiKeys: typeof import("state/actions/ai").loadLLMApiKeys;
let loadLLMConfig: typeof import("state/actions/ai").loadLLMConfig;
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

function mockOpenAPISuccess<T>(
  url: string,
  data: T,
  status: number = 200,
): { data: T; error: undefined; request: Request; response: Response } {
  return {
    data,
    error: undefined,
    request: new Request(url),
    response: new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  };
}

function mockOpenAPIError(
  url: string,
  error: unknown,
  status: number,
): { data: undefined; error: unknown; request: Request; response: Response } {
  return {
    data: undefined,
    error,
    request: new Request(url),
    response: new Response(JSON.stringify(error), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  };
}

function mockAgentRunsSuccess(
  data: unknown,
  status: number = 200,
): Awaited<ReturnType<typeof getAgentRuns>> {
  return mockOpenAPISuccess(
    "http://localhost/agentRuns",
    data,
    status,
  ) as Awaited<ReturnType<typeof getAgentRuns>>;
}

function mockAgentRunsError(
  error: unknown,
  status: number,
): Awaited<ReturnType<typeof getAgentRuns>> {
  return mockOpenAPIError(
    "http://localhost/agentRuns",
    error,
    status,
  ) as Awaited<ReturnType<typeof getAgentRuns>>;
}

describe("AI resource load guards", () => {
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
    loadAgentRuns = ai.loadAgentRuns;
    loadLLMConfig = ai.loadLLMConfig;
    loadLLMApiKeys = ai.loadLLMApiKeys;
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

  it("deduplicates in-flight llm config loads", async () => {
    let resolveRequest: (() => void) | null = null;
    const requestGate = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
    mockedGetLlmConfig.mockImplementation(async () => {
      await requestGate;
      return mockOpenAPISuccess("http://localhost/llm/config", {
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
      }) as Awaited<ReturnType<typeof getLlmConfig>>;
    });

    const firstLoad = loadLLMConfig();
    const secondLoad = loadLLMConfig();
    expect(mockedGetLlmConfig).toHaveBeenCalledTimes(1);

    resolveRequest?.();
    await Promise.all([firstLoad, secondLoad]);

    const state = useAIStore.getState();
    expect(state.allLLMConfigsInitialLoadComplete).toBe(true);
    expect(state.allLLMConfigsLoadError).toBeNull();
  });

  it("deduplicates in-flight llm api key loads", async () => {
    let resolveRequest: (() => void) | null = null;
    const requestGate = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
    mockedGetLlmApiKeys.mockImplementation(async () => {
      await requestGate;
      return mockOpenAPISuccess(
        "http://localhost/llm/apiKeys",
        createAPIKeysSnapshot({
          apiKeys: {
            OPENAI_API_KEY: "pw-key",
          },
          revision: 2,
        }),
      ) as Awaited<ReturnType<typeof getLlmApiKeys>>;
    });

    const firstLoad = loadLLMApiKeys();
    const secondLoad = loadLLMApiKeys();
    expect(mockedGetLlmApiKeys).toHaveBeenCalledTimes(1);

    resolveRequest?.();
    await Promise.all([firstLoad, secondLoad]);

    const state = useAIStore.getState();
    expect(state.apiKeysInitialLoadComplete).toBe(true);
    expect(state.apiKeysLoadError).toBeNull();
    expect(state.apiKeysRevision).toBe(2);
    expect(state.apiKeysAuthoritative).toBe(true);
  });

  it("marks api keys non-authoritative on unavailable-store errors", async () => {
    useAIStore.setState({
      apiKeys: { OPENAI_API_KEY: "stale-local-key" },
      apiKeysRevision: 7,
      apiKeysAuthoritative: true,
    });
    mockedGetLlmApiKeys.mockResolvedValue(
      mockOpenAPIError(
        "http://localhost/llm/apiKeys",
        {
          detail: {
            errorCode: "managed_api_keys_store_unavailable",
            message: "Managed API key store is unavailable.",
            revision: 7,
          },
        },
        503,
      ) as Awaited<ReturnType<typeof getLlmApiKeys>>,
    );

    await loadLLMApiKeys();

    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({});
    expect(state.apiKeysAuthoritative).toBe(false);
    expect(state.apiKeysLoadError).toBe(
      "Managed API key store is unavailable.",
    );
  });

  it("deduplicates in-flight agent run loads", async () => {
    let resolveRequest: (() => void) | null = null;
    const requestGate = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
    mockedRouteGetAgentRuns.mockReset();
    mockedRouteGetAgentRuns.mockImplementation(async () => {
      await requestGate;
      return mockAgentRunsSuccess([]);
    });

    const firstLoad = loadAgentRuns();
    const secondLoad = loadAgentRuns();
    expect(mockedRouteGetAgentRuns).toHaveBeenCalledTimes(1);

    resolveRequest?.();
    await Promise.all([firstLoad, secondLoad]);

    const state = useAIStore.getState();
    expect(state.agentRunsInitialLoadComplete).toBe(true);
    expect(state.agentRunsLoadError).toBeNull();
    expect(state.agentRunsAuthorityState).toBe("ready");
  });

  it("does not persist native slash metadata from authoritative agent-run loads", async () => {
    mockedRouteGetAgentRuns.mockReset();
    mockedRouteGetAgentRuns.mockResolvedValue(
      mockAgentRunsSuccess([
        createAgentRun({
          id: "run-live",
          inputs: {
            projectConfigId: "project-a",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: ["/deploy"],
            },
          },
        }),
      ]),
    );

    await loadAgentRuns();

    expect(
      memoryStorage.getItem(LEGACY_AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY),
    ).toBeNull();
  });

  it("keeps the legacy native slash storage key absent when agent-run payloads are empty", async () => {
    mockedRouteGetAgentRuns.mockReset();
    mockedRouteGetAgentRuns.mockResolvedValue(mockAgentRunsSuccess([]));

    await loadAgentRuns();

    expect(
      memoryStorage.getItem(LEGACY_AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY),
    ).toBeNull();
  });

  it("retries transient agent-runs load failures and recovers to ready", async () => {
    vi.useFakeTimers();
    try {
      mockedRouteGetAgentRuns.mockReset();
      let callCount = 0;
      mockedRouteGetAgentRuns.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return mockAgentRunsError({ detail: "failed once" }, 500);
        }
        return mockAgentRunsSuccess([]);
      });

      useAIStore.setState({
        agentRunsAuthorityState: "loading",
        agentRunsInitialLoadComplete: false,
        agentRunsLoadError: null,
      });
      await loadAgentRuns();
      expect(callCount).toBe(1);
      let state = useAIStore.getState();
      expect(state.agentRunsAuthorityState).toBe("transient_error");
      expect(state.agentRunsInitialLoadComplete).toBe(false);
      expect(state.agentRunsLoadError).toBe("Failed to load agent runs");

      await vi.advanceTimersByTimeAsync(350);

      state = useAIStore.getState();
      expect(state.agentRunsAuthorityState).toBe("ready");
      expect(state.agentRunsInitialLoadComplete).toBe(true);
      expect(state.agentRunsLoadError).toBeNull();
      expect(callCount).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("downgrades ready authority after transient agent-runs refresh failures", async () => {
    vi.useFakeTimers();
    try {
      mockedRouteGetAgentRuns.mockReset();
      let callCount = 0;
      mockedRouteGetAgentRuns.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return mockAgentRunsError({ detail: "failed after ready" }, 500);
        }
        return mockAgentRunsSuccess([]);
      });

      useAIStore.setState({
        agentRunsAuthorityState: "ready",
        agentRunsInitialLoadComplete: true,
        agentRunsLoadError: null,
      });

      await loadAgentRuns();

      let state = useAIStore.getState();
      expect(callCount).toBe(1);
      expect(state.agentRunsAuthorityState).toBe("transient_error");
      expect(state.agentRunsInitialLoadComplete).toBe(false);
      expect(state.agentRunsLoadError).toBe("Failed to load agent runs");

      await vi.advanceTimersByTimeAsync(350);

      state = useAIStore.getState();
      expect(callCount).toBe(2);
      expect(state.agentRunsAuthorityState).toBe("ready");
      expect(state.agentRunsInitialLoadComplete).toBe(true);
      expect(state.agentRunsLoadError).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks agent-runs authority as terminal after bounded retry exhaustion", async () => {
    vi.useFakeTimers();
    try {
      mockedRouteGetAgentRuns.mockReset();
      mockedRouteGetAgentRuns.mockResolvedValue(
        mockAgentRunsError({ detail: "persistent failure" }, 500),
      );

      useAIStore.setState({
        agentRunsAuthorityState: "loading",
        agentRunsInitialLoadComplete: false,
        agentRunsLoadError: null,
      });
      await loadAgentRuns();
      expect(mockedRouteGetAgentRuns).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(4000);

      const state = useAIStore.getState();
      expect(state.agentRunsAuthorityState).toBe("terminal_error");
      expect(state.agentRunsInitialLoadComplete).toBe(true);
      expect(state.agentRunsLoadError).toBe("Failed to load agent runs");
      expect(mockedRouteGetAgentRuns).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not rewrite the legacy native slash storage key after terminal agent-run failures", async () => {
    vi.useFakeTimers();
    try {
      memoryStorage.setItem(
        LEGACY_AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY,
        JSON.stringify({
          "project-a": {
            "engine-live": {
              commands: ["/deploy"],
              status: "available",
              statusDetail: null,
            },
          },
        }),
      );
      mockedRouteGetAgentRuns.mockReset();
      mockedRouteGetAgentRuns.mockResolvedValue(
        mockAgentRunsError({ detail: "persistent failure" }, 500),
      );

      await loadAgentRuns();
      await vi.advanceTimersByTimeAsync(4000);

      expect(
        JSON.parse(
          memoryStorage.getItem(
            LEGACY_AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY,
          ) ?? "{}",
        ),
      ).toEqual({
        "project-a": {
          "engine-live": {
            commands: ["/deploy"],
            status: "available",
            statusDetail: null,
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
