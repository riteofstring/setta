import { resetProjectStores } from "state/utils";
import { route_set_llm_config } from "utils/generatedEndpoints";
import { type AllConfigs } from "utils/generatedTypes";
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
    route_set_llm_config: vi.fn(),
  };
});

const mockedRouteSetLLMConfig = vi.mocked(route_set_llm_config);

let useAIStore: typeof import("state/definitions").useAIStore;
let saveLLMConfig: typeof import("state/actions/ai").saveLLMConfig;
let memoryStorage: Storage;

function createAllLLMConfigs(defaultConfigId: string | null): AllConfigs {
  return {
    configs: {
      "openai-main": {
        id: "openai-main",
        model: "gpt-4o",
        provider: "openai",
        base_url: null,
        api_key_env: "OPENAI_API_KEY",
        other_params: null,
        mcpServerIds: null,
        temporary: false,
      },
      "anthropic-main": {
        id: "anthropic-main",
        model: "claude-sonnet",
        provider: "anthropic",
        base_url: null,
        api_key_env: "ANTHROPIC_API_KEY",
        other_params: null,
        mcpServerIds: null,
        temporary: false,
      },
    },
    mcpServers: {},
    defaultMcpServerIds: [],
    default_config_id: defaultConfigId,
  };
}

describe("saveLLMConfig", () => {
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
    saveLLMConfig = ai.saveLLMConfig;
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

  it("persists and hydrates llm config after a successful save", async () => {
    // A successful save should update the in-memory store with the server payload.
    const nextConfig = createAllLLMConfigs("anthropic-main");
    mockedRouteSetLLMConfig.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: nextConfig,
    });

    const result = await saveLLMConfig(nextConfig);

    expect(mockedRouteSetLLMConfig).toHaveBeenCalledWith(nextConfig);
    expect(result).toEqual(nextConfig);
    const state = useAIStore.getState();
    expect(state.allLLMConfigs).toEqual(nextConfig);
    expect(state.allLLMConfigsInitialLoadComplete).toBe(true);
    expect(state.allLLMConfigsLoadError).toBeNull();
  });

  it("returns null and records an error when the save request fails", async () => {
    // Failed saves should not clobber the existing config state.
    const existingConfig = createAllLLMConfigs("openai-main");
    useAIStore.setState({
      allLLMConfigs: existingConfig,
      allLLMConfigsInitialLoadComplete: true,
      allLLMConfigsLoadError: null,
    });
    mockedRouteSetLLMConfig.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "write failed" },
    });

    const result = await saveLLMConfig(createAllLLMConfigs("anthropic-main"));

    expect(result).toBeNull();
    const state = useAIStore.getState();
    expect(state.allLLMConfigs).toEqual(existingConfig);
    expect(state.allLLMConfigsLoadError).toBe("Failed to save LLM config");
  });
});
