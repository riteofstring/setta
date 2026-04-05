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

const LEGACY_AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.agentNativeSlashCommandsByProjectConfigId";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_agent_runs: vi.fn(),
    route_get_llmapi_keys: vi.fn(),
    route_get_llm_config: vi.fn(),
  };
});

let useAIStore: typeof import("state/definitions").useAIStore;
let loadAgentRuns: typeof import("state/actions/ai").loadAgentRuns;
let loadLLMApiKeys: typeof import("state/actions/ai").loadLLMApiKeys;
let loadLLMConfig: typeof import("state/actions/ai").loadLLMConfig;
let memoryStorage: Storage;

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

  it("deduplicates in-flight llm config loads", async () => {
    let resolveRequest: ((value: unknown) => void) | null = null;
    const requestGate = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const route_get_llm_config = (await import("utils/generatedEndpoints"))
      .route_get_llm_config as unknown as vi.Mock;
    route_get_llm_config.mockImplementation(async () => {
      await requestGate;
      return {
        status: 200,
        hasResponse: true,
        data: {
          configs: {},
          mcpServers: {},
          defaultMcpServerIds: [],
          default_config_id: null,
        },
      };
    });

    const firstLoad = loadLLMConfig();
    const secondLoad = loadLLMConfig();
    expect(route_get_llm_config).toHaveBeenCalledTimes(1);

    resolveRequest?.(undefined);
    await Promise.all([firstLoad, secondLoad]);

    const state = useAIStore.getState();
    expect(state.allLLMConfigsInitialLoadComplete).toBe(true);
    expect(state.allLLMConfigsLoadError).toBeNull();
  });

  it("deduplicates in-flight llm api key loads", async () => {
    let resolveRequest: ((value: unknown) => void) | null = null;
    const requestGate = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const route_get_llmapi_keys = (await import("utils/generatedEndpoints"))
      .route_get_llmapi_keys as unknown as vi.Mock;
    route_get_llmapi_keys.mockImplementation(async () => {
      await requestGate;
      return {
        status: 200,
        hasResponse: true,
        data: {
          apiKeys: {
            OPENAI_API_KEY: "pw-key",
          },
          revision: 2,
        },
      };
    });

    const firstLoad = loadLLMApiKeys();
    const secondLoad = loadLLMApiKeys();
    expect(route_get_llmapi_keys).toHaveBeenCalledTimes(1);

    resolveRequest?.(undefined);
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
    const route_get_llmapi_keys = (await import("utils/generatedEndpoints"))
      .route_get_llmapi_keys as unknown as vi.Mock;
    route_get_llmapi_keys.mockResolvedValue({
      status: 503,
      hasResponse: true,
      data: {
        detail: {
          errorCode: "managed_api_keys_store_unavailable",
          message: "Managed API key store is unavailable.",
          revision: 7,
        },
      },
    });

    await loadLLMApiKeys();

    const state = useAIStore.getState();
    expect(state.apiKeys).toEqual({});
    expect(state.apiKeysAuthoritative).toBe(false);
    expect(state.apiKeysLoadError).toBe(
      "Managed API key store is unavailable.",
    );
  });

  it("deduplicates in-flight agent run loads", async () => {
    let resolveRequest: ((value: unknown) => void) | null = null;
    const requestGate = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const route_get_agent_runs = (await import("utils/generatedEndpoints"))
      .route_get_agent_runs as unknown as vi.Mock;
    route_get_agent_runs.mockReset();
    route_get_agent_runs.mockImplementation(async () => {
      await requestGate;
      return {
        status: 200,
        hasResponse: true,
        data: [],
      };
    });

    const firstLoad = loadAgentRuns();
    const secondLoad = loadAgentRuns();
    expect(route_get_agent_runs).toHaveBeenCalledTimes(1);

    resolveRequest?.(undefined);
    await Promise.all([firstLoad, secondLoad]);

    const state = useAIStore.getState();
    expect(state.agentRunsInitialLoadComplete).toBe(true);
    expect(state.agentRunsLoadError).toBeNull();
    expect(state.agentRunsAuthorityState).toBe("ready");
  });

  it("does not persist native slash metadata from authoritative agent-run loads", async () => {
    const route_get_agent_runs = (await import("utils/generatedEndpoints"))
      .route_get_agent_runs as unknown as vi.Mock;
    route_get_agent_runs.mockReset();
    route_get_agent_runs.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [
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
      ],
    });

    await loadAgentRuns();

    expect(
      memoryStorage.getItem(LEGACY_AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY),
    ).toBeNull();
  });

  it("keeps the legacy native slash storage key absent when agent-run payloads are empty", async () => {
    const route_get_agent_runs = (await import("utils/generatedEndpoints"))
      .route_get_agent_runs as unknown as vi.Mock;
    route_get_agent_runs.mockReset();
    route_get_agent_runs.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [],
    });

    await loadAgentRuns();

    expect(
      memoryStorage.getItem(LEGACY_AGENT_NATIVE_SLASH_COMMANDS_STORAGE_KEY),
    ).toBeNull();
  });

  it("retries transient agent-runs load failures and recovers to ready", async () => {
    vi.useFakeTimers();
    try {
      const route_get_agent_runs = (await import("utils/generatedEndpoints"))
        .route_get_agent_runs as unknown as vi.Mock;
      route_get_agent_runs.mockReset();
      let callCount = 0;
      route_get_agent_runs.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            status: 500,
            hasResponse: true,
            data: { detail: "failed once" },
          };
        }
        return {
          status: 200,
          hasResponse: true,
          data: [],
        };
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
      const route_get_agent_runs = (await import("utils/generatedEndpoints"))
        .route_get_agent_runs as unknown as vi.Mock;
      route_get_agent_runs.mockReset();
      let callCount = 0;
      route_get_agent_runs.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            status: 500,
            hasResponse: true,
            data: { detail: "failed after ready" },
          };
        }
        return {
          status: 200,
          hasResponse: true,
          data: [],
        };
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
      const route_get_agent_runs = (await import("utils/generatedEndpoints"))
        .route_get_agent_runs as unknown as vi.Mock;
      route_get_agent_runs.mockReset();
      route_get_agent_runs.mockResolvedValue({
        status: 500,
        hasResponse: true,
        data: { detail: "persistent failure" },
      });

      useAIStore.setState({
        agentRunsAuthorityState: "loading",
        agentRunsInitialLoadComplete: false,
        agentRunsLoadError: null,
      });
      await loadAgentRuns();
      expect(route_get_agent_runs).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(4000);

      const state = useAIStore.getState();
      expect(state.agentRunsAuthorityState).toBe("terminal_error");
      expect(state.agentRunsInitialLoadComplete).toBe(true);
      expect(state.agentRunsLoadError).toBe("Failed to load agent runs");
      expect(route_get_agent_runs).toHaveBeenCalledTimes(4);
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
      const route_get_agent_runs = (await import("utils/generatedEndpoints"))
        .route_get_agent_runs as unknown as vi.Mock;
      route_get_agent_runs.mockReset();
      route_get_agent_runs.mockResolvedValue({
        status: 500,
        hasResponse: true,
        data: { detail: "persistent failure" },
      });

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
