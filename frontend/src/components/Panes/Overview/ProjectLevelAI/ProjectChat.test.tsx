import { renderToStaticMarkup } from "react-dom/server";
import {
  createAllLLMConfigs,
  createEngineConfig,
  createLLMConfig,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AIStoreState = {
  activeChatId: string | null;
  apiKeys: Record<string, string>;
  apiKeysInitialLoadComplete: boolean;
  viewHistory: boolean;
  viewCapabilities: boolean;
  allLLMConfigs: ReturnType<typeof createAllLLMConfigs>;
  allLLMConfigsInitialLoadComplete: boolean;
  externalAgentHealth: [];
  externalAgentHealthInitialLoadComplete: boolean;
  externalAgentConfigs: [];
  engineConfigs: ReturnType<typeof createEngineConfig>[];
  engineConfigsInitialLoadComplete: boolean;
};

const store = vi.hoisted(() => {
  let aiState: AIStoreState;

  const useAIStore = Object.assign(
    (selector: (state: AIStoreState) => unknown) => selector(aiState),
    {
      setState: (
        next:
          | Partial<AIStoreState>
          | ((state: AIStoreState) => Partial<AIStoreState>),
      ) => {
        const patch = typeof next === "function" ? next(aiState) : next;
        aiState = { ...aiState, ...patch };
      },
    },
  );

  return {
    useAIStore,
    setInitialState: (state: AIStoreState) => {
      aiState = state;
    },
  };
});

vi.mock("state/definitions", () => ({
  useAIStore: store.useAIStore,
}));

vi.mock("./useHydrateLLMState", () => ({
  useHydrateLLMState: () => null,
}));

vi.mock("./useHydrateAgenticState", () => ({
  useHydrateAgenticState: () => null,
}));

vi.mock("./ProjectChatCore", () => ({
  ProjectChatCore: () => <div data-testid="project-chat-core">chat-core</div>,
}));

vi.mock("./ProjectChatHistory", () => ({
  ProjectChatHistory: () => (
    <div data-testid="project-chat-history">chat-history</div>
  ),
}));

vi.mock("./ProjectChatCapabilities", () => ({
  ProjectChatCapabilities: () => (
    <div data-testid="project-chat-capabilities">chat-capabilities</div>
  ),
}));

vi.mock("components/AppHeader/FollowAIToggleButton", () => ({
  FollowAIToggleButton: () => (
    <div data-testid="follow-ai-toggle">follow-ai</div>
  ),
}));

import { ProjectChat } from "./ProjectChat";

describe("ProjectChat", () => {
  beforeEach(() => {
    const llmConfig = createLLMConfig({
      id: "primary",
      model: "gpt-4o-mini",
      provider: "openai",
    });
    const allConfigs = createAllLLMConfigs({
      configs: { primary: llmConfig },
      default_config_id: "primary",
      mcpServers: {},
    });
    const engine = createEngineConfig({
      id: "engine-primary",
      name: "Primary engine",
      engineType: EngineTypeEnum.setta_llm,
      settaLlmConfigId: "primary",
    });

    store.setInitialState({
      activeChatId: null,
      apiKeys: {},
      apiKeysInitialLoadComplete: true,
      viewHistory: false,
      viewCapabilities: false,
      allLLMConfigs: allConfigs,
      allLLMConfigsInitialLoadComplete: true,
      externalAgentHealth: [],
      externalAgentHealthInitialLoadComplete: true,
      externalAgentConfigs: [],
      engineConfigs: [engine],
      engineConfigsInitialLoadComplete: true,
    });
  });

  it("renders the chat view by default", () => {
    // Default project chat should render the main chat panel.
    const markup = renderToStaticMarkup(<ProjectChat />);
    expect(markup).toContain("chat-core");
    expect(markup).not.toContain("chat-history");
    expect(markup).not.toContain("chat-capabilities");
  });

  it("renders history when history view is enabled", () => {
    // History and capabilities are mutually exclusive; history takes precedence.
    store.useAIStore.setState({ viewHistory: true, viewCapabilities: false });
    const markup = renderToStaticMarkup(<ProjectChat />);
    expect(markup).toContain("chat-history");
    expect(markup).not.toContain("chat-core");
    expect(markup).not.toContain("chat-capabilities");
  });

  it("renders capabilities when capabilities view is enabled", () => {
    // Capabilities view should replace chat core while keeping nav controls visible.
    store.useAIStore.setState({ viewHistory: false, viewCapabilities: true });
    const markup = renderToStaticMarkup(<ProjectChat />);
    expect(markup).toContain("chat-capabilities");
    expect(markup).not.toContain("chat-core");
    expect(markup).not.toContain("chat-history");
  });
});
