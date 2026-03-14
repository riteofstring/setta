/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  createAgenticSummaryCacheStatus,
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

let mockCanEditLayout = true;
const routeGetAgenticSummaryCacheStatusMock = vi.fn();

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
  IdNameCombobox: ({ isDisabled }: { isDisabled?: boolean }) => (
    <div
      data-testid="mock-id-name-combobox"
      data-disabled={isDisabled ? "true" : "false"}
    />
  ),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: mockCanEditLayout,
    canEditParams: true,
    canEditStructure: true,
  }),
}));

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await import("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_agentic_summary_cache_status: (...args: unknown[]) =>
      routeGetAgenticSummaryCacheStatusMock(...args),
  };
});

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  Object.assign(store.getInitialState(), store.getState());
}

type RenderedChatAreaSettings = {
  host: HTMLDivElement;
  root: Root;
};

async function renderChatAreaSettings(sectionId: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<ChatAreaSettings sectionId={sectionId} />);
  });

  return { host, root } satisfies RenderedChatAreaSettings;
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function seedChatSections(options: { includeSummaryContextEdge?: boolean } = {}) {
  const { includeSummaryContextEdge = false } = options;
  const sourceSectionId = "chat-source";
  const targetSectionId = "chat-target";
  const sourceVariantId = "variant-source";
  const targetVariantId = "variant-target";
  const sourceImplId = "impl-source";
  const targetImplId = "impl-target";
  const contextSectionId = "source-context";
  const contextVariantId = "variant-context";
  const contextImplId = "impl-context";

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
        ...(includeSummaryContextEdge
          ? [
              createAgenticEdge({
                id: "edge-summary",
                sourceSectionId,
                targetSectionId: contextSectionId,
                kind: AgenticEdgeKindEnum.chat_section,
                contextMode: AgenticEdgeContextModeEnum.summary,
              }),
            ]
          : []),
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
      ...(includeSummaryContextEdge
        ? {
            [contextSectionId]: createCore({
              id: contextSectionId,
              name: "Source Context",
              variants: [contextVariantId],
              defaultVariant: contextVariantId,
            }),
          }
        : {}),
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
      ...(includeSummaryContextEdge
        ? {
            [contextVariantId]: createVariant({
              id: contextVariantId,
              name: "Context Variant",
              impl: contextImplId,
              nonPresetImpls: [],
            }),
          }
        : {}),
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
      ...(includeSummaryContextEdge
        ? {
            [contextImplId]: {
              id: contextImplId,
              type: SectionTypeEnum.TextBlock,
            },
          }
        : {}),
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
    mockCanEditLayout = true;
    resetProjectStores();
    routeGetAgenticSummaryCacheStatusMock.mockReset();
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
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

  it("disables the chat mode combobox when layout edits are disallowed", () => {
    mockCanEditLayout = false;
    const { sourceSectionId } = seedChatSections();

    const markup = renderToStaticMarkup(
      <ChatAreaSettings sectionId={sourceSectionId} />,
    );

    expect(markup).toContain('data-testid="chat-area-settings-chat-mode"');
    expect(markup).toContain('data-disabled="true"');
  });

  it("loads summary cache status through the Go route for summary context links", async () => {
    routeGetAgenticSummaryCacheStatusMock.mockResolvedValue({
      data: createAgenticSummaryCacheStatus({
        cachedSectionIds: ["source-context"],
        summarySectionIds: ["source-context", "source-extra"],
        consideredSectionIds: ["source-context"],
        missingSectionIds: ["source-extra"],
        emptySourceSectionIds: [],
        maxSummariesPerRun: 3,
      }),
      status: 200,
      hasResponse: true,
    });
    const { sourceSectionId } = seedChatSections({
      includeSummaryContextEdge: true,
    });

    const { host, root } = await renderChatAreaSettings(sourceSectionId);

    try {
      await flushEffects();

      // Summary links should trigger the Go-owned cache-status read and render
      // the returned cache/missing counts in the settings panel.
      expect(routeGetAgenticSummaryCacheStatusMock).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        chatSectionId: sourceSectionId,
      });
      expect(host.textContent).toContain("Summary cache");
      expect(host.textContent).toContain("Cached: 1/2. Missing: 1.");
      expect(host.textContent).toContain("Deferred due to cap (3): 0.");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("renders the Go route error detail when summary cache status fails to load", async () => {
    routeGetAgenticSummaryCacheStatusMock.mockResolvedValue({
      data: { detail: "cache unavailable" },
      status: 503,
      hasResponse: true,
    });
    const { sourceSectionId } = seedChatSections({
      includeSummaryContextEdge: true,
    });

    const { host, root } = await renderChatAreaSettings(sourceSectionId);

    try {
      await flushEffects();

      // Non-200 responses should surface the backend-provided detail instead of
      // silently hiding the summary-cache status failure.
      expect(routeGetAgenticSummaryCacheStatusMock).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        chatSectionId: sourceSectionId,
      });
      expect(host.textContent).toContain(
        "Failed to load summary cache status: cache unavailable",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
