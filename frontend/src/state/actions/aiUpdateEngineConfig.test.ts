import { updateEngineConfig as apiUpdateEngineConfig } from "openapi/http";
import { resetProjectStores } from "state/utils";
import { createEngineConfig, EngineTypeEnum } from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAIStore } from "../definitions";
import { updateEngineConfig } from "./ai";

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    updateEngineConfig: vi.fn(),
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

const mockedUpdateEngineConfig = vi.mocked(apiUpdateEngineConfig);

function mockOpenAPISuccess(
  data: unknown,
): Awaited<ReturnType<typeof apiUpdateEngineConfig>> {
  return {
    data,
    error: undefined,
    request: new Request("http://localhost/updateEngineConfig"),
    response: new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  } as Awaited<ReturnType<typeof apiUpdateEngineConfig>>;
}

describe("updateEngineConfig", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetProjectStores();
  });

  it("persists engine config updates in AI store state", async () => {
    const updatedConfig = createEngineConfig({
      id: "engine-1",
      name: "Primary Engine",
      engineType: EngineTypeEnum.setta_llm,
      settaLlmConfigId: "claude-3-7",
      defaults: { thinking: null },
      runtimeSupport: { thinking: false },
    });
    mockedUpdateEngineConfig.mockResolvedValue(
      mockOpenAPISuccess(updatedConfig),
    );

    const result = await updateEngineConfig({ config: updatedConfig });

    expect(result?.settaLlmConfigId).toBe("claude-3-7");
    const stored = useAIStore
      .getState()
      .engineConfigs.find((config) => config.id === "engine-1");
    expect(stored?.settaLlmConfigId).toBe("claude-3-7");
  });
});
