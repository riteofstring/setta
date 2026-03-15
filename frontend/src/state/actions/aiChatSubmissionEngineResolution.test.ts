import { useAIStore } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  EngineTypeEnum,
  createAgentRun,
  createEngineConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultChatDetails } from "./aiChatDetails";
import { resolveEngineConfigIdForChat } from "./aiChatSubmissionEngineResolution";

vi.mock("state/actions/aiAgentRuns", async () => {
  const actual =
    await vi.importActual<typeof import("./aiAgentRuns")>("./aiAgentRuns");
  return {
    ...actual,
    loadAgentRuns: vi.fn(async () => {}),
  };
});

describe("aiChatSubmissionEngineResolution", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("prefers the newest matching agent-run engine id for edited chats", async () => {
    // When an edit forks an existing chat, reuse the engine from the latest matching run.
    useAIStore.setState({
      agentRunsInitialLoadComplete: true,
      agentRuns: [
        createAgentRun({
          id: "run-old",
          inputs: {
            chatId: "chat-1",
            engineConfigId: "engine-old",
          },
          finishedAt: "2024-01-01T00:00:10Z",
        }),
        createAgentRun({
          id: "run-new",
          inputs: {
            chatId: "chat-1",
            engineConfigId: "engine-new",
          },
          finishedAt: "2024-01-01T00:01:10Z",
        }),
        createAgentRun({
          id: "run-foreign",
          inputs: {
            chatId: "chat-2",
            engineConfigId: "engine-foreign",
          },
          finishedAt: "2024-01-01T00:02:10Z",
        }),
      ],
    });

    await expect(resolveEngineConfigIdForChat("chat-1", null)).resolves.toBe(
      "engine-new",
    );
  });

  it("falls back to the chat llm-config engine when runs do not provide an engine id", async () => {
    // If no matching run carries an engine id, derive the engine from the chat's llm config.
    useAIStore.setState({
      agentRunsInitialLoadComplete: true,
      agentRuns: [],
      chatDetails: {
        "chat-1": {
          ...getDefaultChatDetails(),
          llmConfig: {
            id: "llm-config-1",
            model: "gpt-4o-mini",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
        },
      },
      engineConfigs: [
        createEngineConfig({
          id: "engine-fallback",
          name: "Fallback engine",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "llm-config-1",
        }),
      ],
    });

    await expect(resolveEngineConfigIdForChat("chat-1", null)).resolves.toBe(
      "engine-fallback",
    );
  });
});
