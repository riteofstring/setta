import { resetProjectStores } from "state/utils";
import { route_update_engine_config } from "utils/generatedEndpoints";
import { createEngineConfig, EngineTypeEnum } from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAIStore } from "../definitions";
import { updateEngineConfig } from "./aiConfiguration";

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

  it("persists engine config updates in AI store state", async () => {
    const updatedConfig = createEngineConfig({
      id: "engine-1",
      name: "Primary Engine",
      engineType: EngineTypeEnum.setta_llm,
      settaLlmConfigId: "claude-3-7",
    });
    mockedRouteUpdateEngineConfig.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: updatedConfig,
    });

    const result = await updateEngineConfig({ config: updatedConfig });

    expect(result?.settaLlmConfigId).toBe("claude-3-7");
    const stored = useAIStore
      .getState()
      .engineConfigs.find((config) => config.id === "engine-1");
    expect(stored?.settaLlmConfigId).toBe("claude-3-7");
  });
});
