import { setLlmConfig } from "openapi/http";
import { resetProjectStores } from "state/utils";
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
import { createJSONStorage } from "zustand/middleware";

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    setLlmConfig: vi.fn(),
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

const mockedSetLLMConfig = vi.mocked(setLlmConfig);

let useAIStore: typeof import("state/definitions").useAIStore;
let saveLLMConfig: typeof import("state/actions/ai").saveLLMConfig;
let memoryStorage: Storage;

function mockOpenAPISuccess<T>(
  data: T,
  status: number = 200,
): Awaited<ReturnType<typeof setLlmConfig>> {
  return {
    data,
    error: undefined,
    request: new Request("http://localhost/llm/config"),
    response: new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  } as Awaited<ReturnType<typeof setLlmConfig>>;
}

function mockOpenAPIError(
  error: unknown,
  status: number,
): Awaited<ReturnType<typeof setLlmConfig>> {
  return {
    data: undefined,
    error,
    request: new Request("http://localhost/llm/config"),
    response: new Response(JSON.stringify(error), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  } as Awaited<ReturnType<typeof setLlmConfig>>;
}

function createAllLLMConfigs(defaultConfigId: string | null): AllConfigs {
  return {
    configs: {
      "openai-main": {
        id: "openai-main",
        model: "gpt-4o",
        provider: "openai",
        api_key_env: "OPENAI_API_KEY",
        other_params: {},
        mcpServerIds: [],
        temporary: false,
      },
      "anthropic-main": {
        id: "anthropic-main",
        model: "claude-sonnet",
        provider: "anthropic",
        api_key_env: "ANTHROPIC_API_KEY",
        other_params: {},
        mcpServerIds: [],
        temporary: false,
      },
    },
    mcpServers: {},
    defaultMcpServerIds: [],
    ...(defaultConfigId === null ? {} : { default_config_id: defaultConfigId }),
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

  it("persists and hydrates llm config after a successful save", async () => {
    const nextConfig = createAllLLMConfigs("anthropic-main");
    mockedSetLLMConfig.mockResolvedValue(mockOpenAPISuccess(nextConfig));

    const result = await saveLLMConfig(nextConfig);

    expect(mockedSetLLMConfig).toHaveBeenCalledWith({ body: nextConfig });
    expect(result).toEqual(nextConfig);
    const state = useAIStore.getState();
    expect(state.allLLMConfigs).toEqual(nextConfig);
    expect(state.allLLMConfigsInitialLoadComplete).toBe(true);
    expect(state.allLLMConfigsLoadError).toBeNull();
  });

  it("returns null and records an error when the save request fails", async () => {
    const existingConfig = createAllLLMConfigs("openai-main");
    useAIStore.setState({
      allLLMConfigs: existingConfig,
      allLLMConfigsInitialLoadComplete: true,
      allLLMConfigsLoadError: null,
    });
    mockedSetLLMConfig.mockResolvedValue(
      mockOpenAPIError({ detail: "write failed" }, 500),
    );

    const result = await saveLLMConfig(createAllLLMConfigs("anthropic-main"));

    expect(result).toBeNull();
    const state = useAIStore.getState();
    expect(state.allLLMConfigs).toEqual(existingConfig);
    expect(state.allLLMConfigsLoadError).toBe("Failed to save LLM config");
  });
});
