/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAppConfigGenerationController,
  type UseAppConfigGenerationControllerArgs,
} from "./useAppConfigGenerationController";

const dependencyMocks = vi.hoisted(() => ({
  pickDefaultConfigId: vi.fn(() => "llm-default"),
  resolveEngineConfigIdForChat: vi.fn(),
  submitMessage: vi.fn().mockResolvedValue(undefined),
  clearPendingChatDetails: vi.fn(),
  addTemporaryNotification: vi.fn(),
  previewSetState: vi.fn(),
  ensureAppConfigHiddenGenerationResources: vi
    .fn()
    .mockResolvedValue(undefined),
  prepareAppConfigPromptContext: vi.fn(),
  resolveGenerationFailureMessage: vi.fn(),
  resolveHiddenGenerationEngineSelection: vi.fn(),
  resolveHiddenGenerationErrorMessage: vi.fn(() => "Hidden generation failed."),
}));

const storeState = vi.hoisted(() => ({
  aiState: {
    engineConfigsInitialLoadComplete: true,
    allLLMConfigsInitialLoadComplete: true,
    apiKeysInitialLoadComplete: true,
    externalAgentHealthInitialLoadComplete: true,
    activeChatId: null as string | null,
    engineConfigs: [] as Array<Record<string, unknown>>,
    allLLMConfigs: {
      configs: {},
    },
    apiKeys: {} as Record<string, string>,
    externalAgentHealth: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("components/Chat/llmConfigUtils", () => ({
  pickDefaultConfigId: dependencyMocks.pickDefaultConfigId,
}));

vi.mock("state/actions/ai/agentRuns", () => ({
  resolveEngineConfigIdForChat: dependencyMocks.resolveEngineConfigIdForChat,
}));

vi.mock("state/actions/ai/chatCommands", () => ({
  submitMessage: dependencyMocks.submitMessage,
}));

vi.mock("state/actions/ai/chatRuntime", () => ({
  clearPendingChatDetails: dependencyMocks.clearPendingChatDetails,
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: dependencyMocks.addTemporaryNotification,
}));

vi.mock("state/definitions", () => {
  const useAIStore = Object.assign(
    (selector: (state: typeof storeState.aiState) => unknown) =>
      selector(storeState.aiState),
    {
      getState: () => storeState.aiState,
    },
  );
  return {
    useAIStore,
    useAppPreview: {
      setState: dependencyMocks.previewSetState,
    },
  };
});

vi.mock("./appConfigGenerationSupport", () => ({
  buildAvailableHiddenGenerationLLMConfigIds: () => new Set(["llm-default"]),
  buildExternalAgentHealthByConfigId: () => new Map(),
  ensureAppConfigHiddenGenerationResources:
    dependencyMocks.ensureAppConfigHiddenGenerationResources,
  prepareAppConfigPromptContext: dependencyMocks.prepareAppConfigPromptContext,
}));

vi.mock("./appConfigHiddenGenerationUtils", () => ({
  resolveGenerationFailureMessage:
    dependencyMocks.resolveGenerationFailureMessage,
  resolveHiddenGenerationEngineSelection:
    dependencyMocks.resolveHiddenGenerationEngineSelection,
  resolveHiddenGenerationErrorMessage:
    dependencyMocks.resolveHiddenGenerationErrorMessage,
}));

let latestHook: ReturnType<typeof useAppConfigGenerationController> | null =
  null;

function AppConfigGenerationProbe(props: UseAppConfigGenerationControllerArgs) {
  latestHook = useAppConfigGenerationController(props);
  return null;
}

function buildSpec() {
  return {
    root: {
      key: "app-root",
      type: "Stack",
      props: {},
      children: [],
    },
    elements: {},
  };
}

function createStreamResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("useAppConfigGenerationController", () => {
  let host: HTMLDivElement;
  let root: Root;
  let persistGeneratedSpec: ReturnType<typeof vi.fn>;
  let setCatalogId: ReturnType<typeof vi.fn>;
  let setErrorMessage: ReturnType<typeof vi.fn>;

  function buildProps(
    overrides: Partial<UseAppConfigGenerationControllerArgs> = {},
  ): UseAppConfigGenerationControllerArgs {
    return {
      activeGenerationMode: "json_render",
      appGenerationPrompt: "",
      appGenerationReferenceImageNotes: "",
      appGenerationReferenceImageUrl: "",
      appSpec: null,
      catalogId: "setta.app.default",
      draftSpec: "",
      persistGeneratedSpec,
      projectConfigId: "project-config-1",
      setCatalogId,
      setErrorMessage,
      ...overrides,
    };
  }

  async function renderProbe(
    overrides: Partial<UseAppConfigGenerationControllerArgs> = {},
  ) {
    await act(async () => {
      root.render(<AppConfigGenerationProbe {...buildProps(overrides)} />);
    });
  }

  beforeEach(() => {
    latestHook = null;
    persistGeneratedSpec = vi.fn().mockResolvedValue(true);
    setCatalogId = vi.fn();
    setErrorMessage = vi.fn();
    dependencyMocks.pickDefaultConfigId.mockClear();
    dependencyMocks.resolveEngineConfigIdForChat.mockReset();
    dependencyMocks.submitMessage.mockClear();
    dependencyMocks.clearPendingChatDetails.mockClear();
    dependencyMocks.addTemporaryNotification.mockClear();
    dependencyMocks.previewSetState.mockClear();
    dependencyMocks.ensureAppConfigHiddenGenerationResources.mockClear();
    dependencyMocks.prepareAppConfigPromptContext.mockReset();
    dependencyMocks.resolveGenerationFailureMessage.mockReset();
    dependencyMocks.resolveHiddenGenerationEngineSelection.mockReset();
    dependencyMocks.resolveHiddenGenerationErrorMessage.mockClear();
    storeState.aiState = {
      engineConfigsInitialLoadComplete: true,
      allLLMConfigsInitialLoadComplete: true,
      apiKeysInitialLoadComplete: true,
      externalAgentHealthInitialLoadComplete: true,
      activeChatId: null,
      engineConfigs: [],
      allLLMConfigs: { configs: {} },
      apiKeys: {},
      externalAgentHealth: [],
    };
    globalThis.fetch = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("streams JSON-render patches, updates preview state, and persists the generated spec", async () => {
    dependencyMocks.prepareAppConfigPromptContext.mockResolvedValue({
      catalogSummary: "Catalog summary",
      sectionsSummary: "Sections summary",
    });
    vi.mocked(globalThis.fetch).mockResolvedValue(
      createStreamResponse([
        '{"op":"set","path":"/root","value":"app-root"}\n',
        '{"op":"set","path":"/elements/app-root","value":{"key":"app-root","type":"Card","props":{"title":"Hello"},"children":[]}}\n',
      ]),
    );

    await renderProbe({
      activeGenerationMode: "json_render",
      appSpec: buildSpec(),
      draftSpec: JSON.stringify(buildSpec(), null, 2),
    });
    if (!latestHook) {
      throw new Error("Expected hook state.");
    }

    await act(async () => {
      await latestHook?.handleGenerate();
    });

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(persistGeneratedSpec).toHaveBeenCalledTimes(1);
    expect(persistGeneratedSpec.mock.calls[0]?.[0]).toMatchObject({
      root: "app-root",
      elements: {
        "app-root": {
          type: "Card",
          props: { title: "Hello" },
        },
      },
    });
    expect(dependencyMocks.previewSetState).toHaveBeenCalledWith({
      previewSpecOverride: expect.objectContaining({
        root: "app-root",
      }),
    });
    expect(latestHook.generationPatchCount).toBe(2);
    expect(latestHook.generationHint).toBe(
      "Generation complete. If fidelity is off, add stricter layout/spacing guidance and retry.",
    );
    expect(dependencyMocks.addTemporaryNotification).toHaveBeenCalledWith(
      "App generation completed.",
    );
  });

  it("preloads hidden-generation resources for non-json modes", async () => {
    await renderProbe({ activeGenerationMode: "prompt_builder" });

    await vi.waitFor(() => {
      expect(
        dependencyMocks.ensureAppConfigHiddenGenerationResources,
      ).toHaveBeenCalledWith({
        allLLMConfigsInitialLoadComplete: true,
        apiKeysInitialLoadComplete: true,
        engineConfigsInitialLoadComplete: true,
        externalAgentHealthInitialLoadComplete: true,
      });
    });
  });

  it("submits hidden generation through chat and clears pending surface state when forcing a new chat", async () => {
    dependencyMocks.prepareAppConfigPromptContext.mockResolvedValue({
      catalogSummary: "Catalog summary",
      sectionsSummary: "Sections summary",
    });
    dependencyMocks.resolveHiddenGenerationEngineSelection.mockReturnValue({
      engineConfigId: "engine-1",
      isExternalEngine: false,
      forceNewChat: true,
    });
    storeState.aiState = {
      ...storeState.aiState,
      engineConfigs: [{ id: "engine-1", engineType: "setta_llm" }],
    };

    await renderProbe({
      activeGenerationMode: "prompt_builder",
      appGenerationPrompt: "Build a console",
      projectConfigId: "project-config-9",
    });
    if (!latestHook) {
      throw new Error("Expected hook state.");
    }
    dependencyMocks.ensureAppConfigHiddenGenerationResources.mockClear();

    await act(async () => {
      await latestHook?.handleGenerate();
    });

    expect(
      dependencyMocks.ensureAppConfigHiddenGenerationResources,
    ).toHaveBeenCalledTimes(1);
    expect(dependencyMocks.submitMessage).toHaveBeenCalledWith(
      null,
      expect.stringContaining("Build a console"),
      [],
      true,
      "engine-1",
      false,
      {
        pendingSurfaceId: "app-config-hidden-generation:project-config-9",
        appGeneration: {
          mode: "prompt_builder",
          referenceImageUrl: null,
          referenceImageNotes: null,
        },
      },
    );
    expect(dependencyMocks.clearPendingChatDetails).toHaveBeenCalledWith(
      "app-config-hidden-generation:project-config-9",
    );
    expect(latestHook.generationHint).toBe(
      "Generation request sent to a new chat because the active chat engine is unavailable. Stay on this pane while the app spec updates via tool results.",
    );
    expect(dependencyMocks.addTemporaryNotification).toHaveBeenCalledWith(
      "App generation request sent to chat.",
    );
  });
});
