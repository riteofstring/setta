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
    route_get_agent_runs: vi.fn(),
    route_get_llm_api_keys: vi.fn(),
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
    const route_get_llm_api_keys = (await import("utils/generatedEndpoints"))
      .route_get_llm_api_keys as unknown as vi.Mock;
    route_get_llm_api_keys.mockImplementation(async () => {
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
    expect(route_get_llm_api_keys).toHaveBeenCalledTimes(1);

    resolveRequest?.(undefined);
    await Promise.all([firstLoad, secondLoad]);

    const state = useAIStore.getState();
    expect(state.apiKeysInitialLoadComplete).toBe(true);
    expect(state.apiKeysLoadError).toBeNull();
    expect(state.apiKeysRevision).toBe(2);
  });

  it("deduplicates in-flight agent run loads", async () => {
    let resolveRequest: ((value: unknown) => void) | null = null;
    const requestGate = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const route_get_agent_runs = (await import("utils/generatedEndpoints"))
      .route_get_agent_runs as unknown as vi.Mock;
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
  });
});
