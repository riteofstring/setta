import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAvailableHiddenGenerationLLMConfigIds,
  buildExternalAgentHealthByConfigId,
  ensureAppConfigHiddenGenerationResources,
  prepareAppConfigPromptContext,
} from "./appConfigGenerationSupport";

const dependencyMocks = vi.hoisted(() => ({
  addTemporaryNotification: vi.fn(),
  loadLLMConfig: vi.fn().mockResolvedValue(undefined),
  loadLLMApiKeys: vi.fn().mockResolvedValue(undefined),
  loadEngineConfigs: vi.fn().mockResolvedValue(undefined),
  loadExternalAgentHealth: vi.fn().mockResolvedValue(undefined),
  waitForHiddenGenerationResourcesLoaded: vi.fn().mockResolvedValue(undefined),
  loadAppCatalogPromptSummary: vi.fn(),
  useProjectStateGetState: vi.fn(),
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: dependencyMocks.addTemporaryNotification,
}));

vi.mock("state/actions/ai/llmSettings", () => ({
  loadLLMApiKeys: dependencyMocks.loadLLMApiKeys,
  loadLLMConfig: dependencyMocks.loadLLMConfig,
}));

vi.mock("state/actions/ai/projectAiResources", () => ({
  loadEngineConfigs: dependencyMocks.loadEngineConfigs,
  loadExternalAgentHealth: dependencyMocks.loadExternalAgentHealth,
}));

vi.mock("state/definitions", () => ({
  useAIStore: {
    getState: () => ({
      allLLMConfigsInitialLoadComplete: true,
      apiKeysInitialLoadComplete: true,
      engineConfigsInitialLoadComplete: true,
      externalAgentHealthInitialLoadComplete: true,
    }),
  },
  useProjectState: {
    getState: dependencyMocks.useProjectStateGetState,
  },
}));

vi.mock("./appConfigHiddenGenerationUtils", () => ({
  waitForHiddenGenerationResourcesLoaded:
    dependencyMocks.waitForHiddenGenerationResourcesLoaded,
}));

vi.mock("./appConfigApi", () => ({
  loadAppCatalogPromptSummary: dependencyMocks.loadAppCatalogPromptSummary,
}));

describe("appConfigGenerationSupport", () => {
  beforeEach(() => {
    dependencyMocks.addTemporaryNotification.mockReset();
    dependencyMocks.loadLLMConfig.mockClear();
    dependencyMocks.loadLLMApiKeys.mockClear();
    dependencyMocks.loadEngineConfigs.mockClear();
    dependencyMocks.loadExternalAgentHealth.mockClear();
    dependencyMocks.waitForHiddenGenerationResourcesLoaded.mockClear();
    dependencyMocks.loadAppCatalogPromptSummary.mockReset();
    dependencyMocks.useProjectStateGetState.mockReset();
    dependencyMocks.useProjectStateGetState.mockReturnValue({
      projectConfig: {
        sectionVariantMap: {},
      },
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      codeObjs: {},
      codeObjVariants: {},
      codeObjImpls: {},
    });
  });

  it("updates catalog id from backend prompt context responses", async () => {
    dependencyMocks.loadAppCatalogPromptSummary.mockResolvedValue({
      ok: true,
      value: {
        catalogSummary: "Catalog: setta.catalog (version 2026.03)",
        catalogId: "setta.catalog",
      },
    });

    const setCatalogId = vi.fn();
    await expect(
      prepareAppConfigPromptContext({
        catalogId: "fallback.catalog",
        setCatalogId,
      }),
    ).resolves.toEqual({
      catalogSummary: "Catalog: setta.catalog (version 2026.03)",
      sectionsSummary: "",
    });
    expect(setCatalogId).toHaveBeenCalledWith("setta.catalog");
    expect(dependencyMocks.addTemporaryNotification).not.toHaveBeenCalled();
  });

  it("keeps fallback prompt context and notifies when the catalog load fails", async () => {
    dependencyMocks.loadAppCatalogPromptSummary.mockResolvedValue({
      ok: false,
      error: "Catalog offline.",
    });

    const setCatalogId = vi.fn();
    await expect(
      prepareAppConfigPromptContext({
        catalogId: "fallback.catalog",
        setCatalogId,
      }),
    ).resolves.toEqual({
      catalogSummary: "Catalog: fallback.catalog",
      sectionsSummary: "",
    });
    expect(setCatalogId).not.toHaveBeenCalled();
    expect(dependencyMocks.addTemporaryNotification).toHaveBeenCalledWith(
      "Catalog offline.",
    );
  });

  it("filters hidden-generation LLM configs to only those with usable keys", () => {
    expect(
      buildAvailableHiddenGenerationLLMConfigIds({
        allLLMConfigs: {
          configs: {
            managed: { api_key_env: "OPENAI_API_KEY" },
            local: { api_key_env: null },
            missing: { api_key_env: "MISSING_KEY" },
          },
        },
        apiKeys: {
          OPENAI_API_KEY: "secret",
        },
        externalAgentHealth: [],
      }),
    ).toEqual(new Set(["managed", "local"]));
  });

  it("maps external-agent health by config id", () => {
    const healthByConfigId = buildExternalAgentHealthByConfigId({
      allLLMConfigs: null,
      apiKeys: {},
      externalAgentHealth: [
        {
          configId: "agent-a",
          available: true,
          supported: true,
        },
        {
          configId: "agent-b",
          available: false,
          supported: true,
        },
      ],
    });

    expect(healthByConfigId.get("agent-a")).toEqual({
      available: true,
      supported: true,
    });
    expect(healthByConfigId.get("agent-b")).toEqual({
      available: false,
      supported: true,
    });
  });

  it("loads missing hidden-generation resources and waits for completion", async () => {
    await ensureAppConfigHiddenGenerationResources({
      allLLMConfigsInitialLoadComplete: false,
      apiKeysInitialLoadComplete: true,
      engineConfigsInitialLoadComplete: false,
      externalAgentHealthInitialLoadComplete: false,
    });

    expect(dependencyMocks.loadLLMConfig).toHaveBeenCalledTimes(1);
    expect(dependencyMocks.loadLLMApiKeys).not.toHaveBeenCalled();
    expect(dependencyMocks.loadEngineConfigs).toHaveBeenCalledTimes(1);
    expect(dependencyMocks.loadExternalAgentHealth).toHaveBeenCalledTimes(1);
    expect(
      dependencyMocks.waitForHiddenGenerationResourcesLoaded,
    ).toHaveBeenCalledTimes(1);
  });

  it("skips hidden-generation loads when resources are already available", async () => {
    await ensureAppConfigHiddenGenerationResources({
      allLLMConfigsInitialLoadComplete: true,
      apiKeysInitialLoadComplete: true,
      engineConfigsInitialLoadComplete: true,
      externalAgentHealthInitialLoadComplete: true,
    });

    expect(dependencyMocks.loadLLMConfig).not.toHaveBeenCalled();
    expect(dependencyMocks.loadLLMApiKeys).not.toHaveBeenCalled();
    expect(dependencyMocks.loadEngineConfigs).not.toHaveBeenCalled();
    expect(dependencyMocks.loadExternalAgentHealth).not.toHaveBeenCalled();
    expect(
      dependencyMocks.waitForHiddenGenerationResourcesLoaded,
    ).not.toHaveBeenCalled();
  });
});
