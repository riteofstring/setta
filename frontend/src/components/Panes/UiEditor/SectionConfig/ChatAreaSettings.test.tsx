import { renderToStaticMarkup } from "react-dom/server";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  AgenticEdgeKindEnum,
  createAgenticEdge,
  createAllLLMConfigs,
  createChatSectionImpl,
  createCore,
  createEngineConfig,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
  EngineTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatAreaSettings,
  filterExecutableLinkedChatTargets,
} from "./ChatAreaSettings";

vi.mock(
  "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState",
  () => ({
    useHydrateAgenticState: () => {},
  }),
);

vi.mock("components/Panes/Overview/ProjectLevelAI/useHydrateLLMState", () => ({
  useHydrateLLMState: () => {},
}));

vi.mock("components/Params/ParamUIs/SwitchInput", () => ({
  SwitchInput: () => <div data-testid="mock-switch-input" />,
}));

vi.mock("components/Utils/Combobox/IdNameCombobox", () => ({
  IdNameCombobox: () => <div data-testid="mock-id-name-combobox" />,
}));

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  Object.assign(store.getInitialState(), store.getState());
}

function seedChatSections() {
  const sourceSectionId = "chat-source";
  const targetSectionId = "chat-target";
  const sourceVariantId = "variant-source";
  const targetVariantId = "variant-target";
  const sourceImplId = "impl-source";
  const targetImplId = "impl-target";

  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [sourceSectionId]: sourceVariantId,
        [targetSectionId]: targetVariantId,
      },
      topLevelSections: {
        [sourceSectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
        [targetSectionId]: { x: 1, y: 0, zIndex: 1, w: null, h: null },
      },
      agenticEdges: [
        createAgenticEdge({
          id: "edge-peer",
          sourceSectionId,
          targetSectionId,
          kind: AgenticEdgeKindEnum.chat_chat,
        }),
      ],
    });
    state.sections = {
      [sourceSectionId]: createCore({
        id: sourceSectionId,
        name: "Source Chat",
        variants: [sourceVariantId],
        defaultVariant: sourceVariantId,
      }),
      [targetSectionId]: createCore({
        id: targetSectionId,
        name: "Target Chat",
        variants: [targetVariantId],
        defaultVariant: targetVariantId,
      }),
    };
    state.sectionVariants = {
      [sourceVariantId]: createVariant({
        id: sourceVariantId,
        name: "Source Variant",
        impl: sourceImplId,
        nonPresetImpls: [],
      }),
      [targetVariantId]: createVariant({
        id: targetVariantId,
        name: "Target Variant",
        impl: targetImplId,
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = {
      [sourceImplId]: createChatSectionImpl(
        createUserDefaultChatSectionImpl(),
        {
          id: sourceImplId,
          managed: true,
          engineConfigId: "engine-source",
        },
      ),
      [targetImplId]: createChatSectionImpl(
        createUserDefaultChatSectionImpl(),
        {
          id: targetImplId,
          managed: true,
          engineConfigId: "engine-target",
        },
      ),
    };
  });
  syncStoreInitialState(useProjectState);

  useAIStore.setState({
    allLLMConfigs: createAllLLMConfigs({
      configs: {
        primary: {
          id: "primary",
          name: "Primary",
          provider: "anthropic",
          model: "claude-3-7-sonnet-latest",
        },
      },
      default_config_id: "primary",
    }),
    engineConfigs: [
      createEngineConfig({
        id: "engine-source",
        name: "Source Engine",
        engineType: EngineTypeEnum.setta_llm,
        settaLlmConfigId: "primary",
      }),
      createEngineConfig({
        id: "engine-target",
        name: "Target Engine",
        engineType: EngineTypeEnum.setta_llm,
        settaLlmConfigId: "primary",
      }),
    ],
    agentProfiles: [],
    externalAgentConfigs: [],
    transcriptionProfiles: [],
  });
  syncStoreInitialState(useAIStore);

  useShareSession.setState({
    isDeploymentMode: false,
    sharePolicy: null,
    shareSessionId: null,
    sessionRunCount: 0,
    shareDeploymentName: null,
    shareDeploymentVersion: null,
    deploymentMode: null,
  });
  syncStoreInitialState(useShareSession);

  return { sourceSectionId, targetSectionId };
}

describe("ChatAreaSettings", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("filters linked-agent targets down to executable managed chats", () => {
    const targets = filterExecutableLinkedChatTargets({
      sectionOptions: [
        { id: "chat-managed", name: "Managed", type: SectionTypeEnum.Chat },
        {
          id: "chat-scriptable",
          name: "Scriptable",
          type: SectionTypeEnum.Chat,
        },
        {
          id: "chat-missing-engine",
          name: "No Engine",
          type: SectionTypeEnum.Chat,
        },
        { id: "text-1", name: "Notes", type: SectionTypeEnum.TextBlock },
      ],
      sectionVariantMap: {
        "chat-managed": "variant-managed",
        "chat-scriptable": "variant-scriptable",
        "chat-missing-engine": "variant-missing-engine",
        "text-1": "variant-text",
      },
      sectionVariants: {
        "variant-managed": { impl: "impl-managed" },
        "variant-scriptable": { impl: "impl-scriptable" },
        "variant-missing-engine": { impl: "impl-missing-engine" },
        "variant-text": { impl: "impl-text" },
      },
      sectionImpls: {
        "impl-managed": {
          type: SectionTypeEnum.Chat,
          managed: true,
          engineConfigId: "engine-live",
        },
        "impl-scriptable": {
          type: SectionTypeEnum.Chat,
          managed: false,
          engineConfigId: "engine-live",
        },
        "impl-missing-engine": {
          type: SectionTypeEnum.Chat,
          managed: true,
          engineConfigId: null,
          agentProfileId: null,
        },
        "impl-text": {
          type: SectionTypeEnum.TextBlock,
        },
      },
      agentProfiles: [],
      engineConfigs: [
        {
          id: "engine-live",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "primary",
        },
      ],
      externalAgentConfigs: [],
      allLLMConfigs: createAllLLMConfigs({
        configs: {
          primary: {
            id: "primary",
            name: "Primary",
            provider: "anthropic",
            model: "claude-3-7-sonnet-latest",
          },
        },
        default_config_id: "primary",
      }),
    });

    expect(targets.map((entry) => entry.id)).toEqual(["chat-managed"]);
  });

  it("keeps linked chats out of the read scope summary", () => {
    // The linked chat should remain visible in the linked-agents section only.
    const { sourceSectionId } = seedChatSections();

    const markup = renderToStaticMarkup(
      <ChatAreaSettings sectionId={sourceSectionId} />,
    );

    expect(markup).toContain("No readable sections.");
    expect(markup).toContain("Linked agents");
    expect(markup).toContain("Target Chat");
    expect(markup.match(/Target Chat/g)?.length ?? 0).toBe(1);
  });
});
