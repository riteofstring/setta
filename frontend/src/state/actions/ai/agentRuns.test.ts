import { resetProjectStores } from "state/utils";
import { route_get_agent_runs } from "utils/generatedEndpoints";
import {
  createAgentRun,
  createEngineConfig,
  createLLMConfig,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAIStore } from "../../definitions";
import { resolveEngineConfigIdForChat } from "./agentRuns";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_agent_runs: vi.fn(),
  };
});

const mockedRouteGetAgentRuns = vi.mocked(route_get_agent_runs);

describe("agentRuns", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetProjectStores();
  });

  it("resolves the latest engine config from matching agent runs", async () => {
    // Engine resolution should follow the latest run metadata for a chat thread.
    useAIStore.setState({
      agentRunsInitialLoadComplete: true,
      agentRuns: [
        createAgentRun({
          id: "run-old",
          startedAt: "2026-03-12T12:00:00Z",
          inputs: {
            chatId: "chat-1",
            engineConfigId: "engine-old",
          },
        }),
        createAgentRun({
          id: "run-new",
          startedAt: "2026-03-12T12:05:00Z",
          inputs: {
            chatId: "chat-1",
            engineConfigId: "engine-new",
          },
        }),
      ],
    });

    const resolved = await resolveEngineConfigIdForChat("chat-1", null);

    expect(resolved).toBe("engine-new");
  });

  it("falls back to the hydrated llm config when run metadata has no engine id", async () => {
    // The App config surface still needs a deterministic fallback after hydration.
    mockedRouteGetAgentRuns.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [],
    });
    useAIStore.setState({
      agentRunsInitialLoadComplete: true,
      agentRuns: [],
      chatDetails: {
        "chat-1": {
          messages: [],
          toolCallArguments: {},
          waitingForResponse: false,
          llmConfig: createLLMConfig({
            id: "llm-1",
            model: "model-1",
            provider: "provider-1",
          }),
          contextUsage: null,
        },
      },
      engineConfigs: [
        createEngineConfig({
          id: "engine-llm",
          name: "LLM engine",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "llm-1",
        }),
      ],
    });

    const resolved = await resolveEngineConfigIdForChat("chat-1", null);

    expect(resolved).toBe("engine-llm");
    expect(mockedRouteGetAgentRuns).toHaveBeenCalledTimes(1);
  });
});
