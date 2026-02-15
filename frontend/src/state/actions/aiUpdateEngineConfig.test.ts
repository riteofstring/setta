import { resetProjectStores } from "state/utils";
import { route_update_engine_config } from "utils/generatedEndpoints";
import { createEngineConfig, EngineTypeEnum } from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAIStore } from "../definitions";
import { updateEngineConfig } from "./ai";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_update_engine_config: vi.fn(),
  };
});

const mockedRouteUpdateEngineConfig = vi.mocked(route_update_engine_config);

describe("updateEngineConfig", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetProjectStores();
  });

  it("persists transcriptionLlmConfigId updates in AI store state", async () => {
    const updatedConfig = createEngineConfig({
      id: "engine-1",
      name: "Primary Engine",
      engineType: EngineTypeEnum.setta_llm,
      settaLlmConfigId: "claude-chat",
      transcriptionLlmConfigId: "openai-transcribe",
    });
    mockedRouteUpdateEngineConfig.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: updatedConfig,
    });

    const result = await updateEngineConfig({ config: updatedConfig });

    expect(result?.transcriptionLlmConfigId).toBe("openai-transcribe");
    const stored = useAIStore
      .getState()
      .engineConfigs.find((config) => config.id === "engine-1");
    expect(stored?.transcriptionLlmConfigId).toBe("openai-transcribe");
  });
});
