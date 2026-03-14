import { resetProjectStores } from "state/utils";
import {
  route_create_agent_profile,
  route_create_external_agent_config,
  route_create_prompt_template,
  route_delete_agent_profile,
  route_delete_external_agent_config,
  route_delete_prompt_template,
  route_get_agent_profiles,
  route_get_engine_configs,
  route_get_external_agent_configs,
  route_get_external_agent_health,
  route_get_prompt_templates,
  route_update_agent_profile,
  route_update_external_agent_config,
  route_update_prompt_template,
} from "utils/generatedEndpoints";
import {
  createEngineConfig,
  createExternalAgentPreflightStatus,
  EngineTypeEnum,
  ExternalAgentRunModeEnum,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  ExternalAgentWorkingDirStrategyEnum,
  PromptFormatEnum,
} from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAIStore } from "../definitions";
import {
  createAgentProfile,
  createExternalAgentConfig,
  createPromptTemplate,
  deleteAgentProfile,
  deleteExternalAgentConfig,
  deletePromptTemplate,
  loadAgentProfiles,
  loadEngineConfigs,
  loadExternalAgentConfigs,
  loadPromptTemplates,
  updateAgentProfile,
  updateExternalAgentConfig,
  updatePromptTemplate,
} from "./aiConfigurationCatalogs";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_agent_profiles: vi.fn(),
    route_get_engine_configs: vi.fn(),
    route_get_external_agent_configs: vi.fn(),
    route_get_external_agent_health: vi.fn(),
    route_get_prompt_templates: vi.fn(),
    route_create_agent_profile: vi.fn(),
    route_update_agent_profile: vi.fn(),
    route_delete_agent_profile: vi.fn(),
    route_create_prompt_template: vi.fn(),
    route_update_prompt_template: vi.fn(),
    route_delete_prompt_template: vi.fn(),
    route_create_external_agent_config: vi.fn(),
    route_update_external_agent_config: vi.fn(),
    route_delete_external_agent_config: vi.fn(),
  };
});

const mockedRouteGetAgentProfiles = vi.mocked(route_get_agent_profiles);
const mockedRouteGetEngineConfigs = vi.mocked(route_get_engine_configs);
const mockedRouteGetExternalAgentConfigs = vi.mocked(
  route_get_external_agent_configs,
);
const mockedRouteGetExternalAgentHealth = vi.mocked(
  route_get_external_agent_health,
);
const mockedRouteGetPromptTemplates = vi.mocked(route_get_prompt_templates);
const mockedRouteCreateAgentProfile = vi.mocked(route_create_agent_profile);
const mockedRouteUpdateAgentProfile = vi.mocked(route_update_agent_profile);
const mockedRouteDeleteAgentProfile = vi.mocked(route_delete_agent_profile);
const mockedRouteCreatePromptTemplate = vi.mocked(route_create_prompt_template);
const mockedRouteUpdatePromptTemplate = vi.mocked(route_update_prompt_template);
const mockedRouteDeletePromptTemplate = vi.mocked(route_delete_prompt_template);
const mockedRouteCreateExternalAgentConfig = vi.mocked(
  route_create_external_agent_config,
);
const mockedRouteUpdateExternalAgentConfig = vi.mocked(
  route_update_external_agent_config,
);
const mockedRouteDeleteExternalAgentConfig = vi.mocked(
  route_delete_external_agent_config,
);

function buildAgentProfile(id: string, name: string) {
  return {
    id,
    name,
    description: "",
    systemPrompt: "",
    enableBackgroundSummaryFill: false,
    enableLlmChatTitles: false,
    engineConfigId: null,
    toolAllowlist: [],
    memoryScope: null,
  };
}

function buildPromptTemplate(id: string, name: string) {
  return {
    id,
    name,
    description: "",
    template: "Hello {{ name }}",
    format: PromptFormatEnum.Jinja,
    inputSchema: {},
    metadata: {},
  };
}

function buildExternalAgentConfig(id: string, name: string) {
  return {
    id,
    name,
    description: "",
    toolType: ExternalAgentToolTypeEnum.codex,
    pluginAdapterId: null,
    runMode: ExternalAgentRunModeEnum.sdk,
    commandPath: "/usr/bin/codex",
    baseUrl: null,
    defaultModel: null,
    sandboxPolicy: null,
    approvalPolicy: null,
    settingsMode: ExternalAgentSettingsModeEnum.managed_local,
    settingsSources: null,
    settingsFilePath: null,
    settingsAllowSettaEdits: true,
    settingsManagedBlock: null,
    envVarWhitelist: [],
    workingDirStrategy: ExternalAgentWorkingDirStrategyEnum.project_root,
    workingDir: null,
    codexSkipGitRepoCheck: null,
  };
}

describe("aiConfiguration catalogs", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetProjectStores();
  });

  it("loads agent profiles into the AI store", async () => {
    useAIStore.setState({
      agentProfiles: [],
      agentProfilesInitialLoadComplete: false,
      agentProfilesLoading: false,
      agentProfilesLoadError: null,
    });
    mockedRouteGetAgentProfiles.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [buildAgentProfile("agent-a", "Analyst")],
    });

    await loadAgentProfiles();

    expect(mockedRouteGetAgentProfiles).toHaveBeenCalledTimes(1);
    expect(useAIStore.getState().agentProfiles).toEqual([
      buildAgentProfile("agent-a", "Analyst"),
    ]);
    expect(useAIStore.getState().agentProfilesInitialLoadComplete).toBe(true);
  });

  it("loads engine configs into the AI store", async () => {
    useAIStore.setState({
      engineConfigs: [],
      engineConfigsInitialLoadComplete: false,
      engineConfigsLoading: false,
      engineConfigsLoadError: null,
    });
    const config = createEngineConfig({
      id: "engine-a",
      name: "Primary",
      engineType: EngineTypeEnum.setta_llm,
      settaLlmConfigId: "claude-sonnet",
    });
    mockedRouteGetEngineConfigs.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [config],
    });

    await loadEngineConfigs();

    expect(mockedRouteGetEngineConfigs).toHaveBeenCalledTimes(1);
    expect(useAIStore.getState().engineConfigs).toEqual([config]);
  });

  it("loads external agent configs and refreshes external health", async () => {
    useAIStore.setState({
      externalAgentConfigs: [],
      externalAgentConfigsInitialLoadComplete: false,
      externalAgentConfigsLoading: false,
      externalAgentConfigsLoadError: null,
      externalAgentHealth: [],
      externalAgentHealthInitialLoadComplete: false,
      externalAgentHealthLoading: false,
      externalAgentHealthLoadError: null,
    });
    const externalConfig = buildExternalAgentConfig("config-a", "Codex");
    const health = createExternalAgentPreflightStatus({
      configId: "config-a",
      name: "Codex",
      toolType: ExternalAgentToolTypeEnum.codex,
      runMode: ExternalAgentRunModeEnum.sdk,
      supported: true,
      available: true,
    });
    mockedRouteGetExternalAgentConfigs.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [externalConfig],
    });
    mockedRouteGetExternalAgentHealth.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [health],
    });

    await loadExternalAgentConfigs();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRouteGetExternalAgentConfigs).toHaveBeenCalledTimes(1);
    expect(mockedRouteGetExternalAgentHealth).toHaveBeenCalledTimes(1);
    expect(useAIStore.getState().externalAgentConfigs).toEqual([
      externalConfig,
    ]);
    expect(useAIStore.getState().externalAgentHealth).toEqual([health]);
  });

  it("creates, updates, and deletes agent profiles", async () => {
    useAIStore.setState({
      agentProfiles: [buildAgentProfile("agent-a", "Old")],
    });
    mockedRouteCreateAgentProfile.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildAgentProfile("agent-b", "New"),
    });
    mockedRouteUpdateAgentProfile.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildAgentProfile("agent-b", "Updated"),
    });
    mockedRouteDeleteAgentProfile.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { ok: true },
    });

    const created = await createAgentProfile({
      name: "New",
      description: "",
      systemPrompt: "",
      enableBackgroundSummaryFill: false,
      enableLlmChatTitles: false,
      engineConfigId: null,
      toolAllowlist: [],
      memoryScope: null,
    });
    const updated = await updateAgentProfile({
      profileId: "agent-b",
      name: "Updated",
      description: "",
      systemPrompt: "",
      enableBackgroundSummaryFill: false,
      enableLlmChatTitles: false,
      engineConfigId: null,
      toolAllowlist: [],
      memoryScope: null,
    });
    const deleted = await deleteAgentProfile({ profileId: "agent-b" });

    expect(created?.id).toBe("agent-b");
    expect(updated?.name).toBe("Updated");
    expect(deleted).toBe(true);
    expect(useAIStore.getState().agentProfiles).toEqual([
      buildAgentProfile("agent-a", "Old"),
    ]);
  });

  it("loads and mutates prompt templates", async () => {
    useAIStore.setState({
      promptTemplates: [],
      promptTemplatesInitialLoadComplete: false,
      promptTemplatesLoading: false,
      promptTemplatesLoadError: null,
    });
    mockedRouteGetPromptTemplates.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [buildPromptTemplate("template-a", "Starter")],
    });
    mockedRouteCreatePromptTemplate.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildPromptTemplate("template-b", "Draft"),
    });
    mockedRouteUpdatePromptTemplate.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildPromptTemplate("template-b", "Published"),
    });
    mockedRouteDeletePromptTemplate.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { ok: true },
    });

    await loadPromptTemplates();
    const created = await createPromptTemplate({
      name: "Draft",
      description: "",
      template: "Hello {{ name }}",
      format: PromptFormatEnum.Jinja,
      inputSchema: {},
      metadata: {},
    });
    const updated = await updatePromptTemplate({
      templateId: "template-b",
      name: "Published",
      description: "",
      template: "Hello {{ name }}",
      format: PromptFormatEnum.Jinja,
      inputSchema: {},
      metadata: {},
    });
    const deleted = await deletePromptTemplate({ templateId: "template-b" });

    expect(created?.id).toBe("template-b");
    expect(updated?.name).toBe("Published");
    expect(deleted).toBe(true);
    expect(useAIStore.getState().promptTemplates).toEqual([
      buildPromptTemplate("template-a", "Starter"),
    ]);
  });

  it("creates, updates, and deletes external agent configs", async () => {
    useAIStore.setState({
      externalAgentConfigs: [buildExternalAgentConfig("config-a", "Codex")],
    });
    mockedRouteCreateExternalAgentConfig.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildExternalAgentConfig("config-b", "Claude"),
    });
    mockedRouteUpdateExternalAgentConfig.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildExternalAgentConfig("config-b", "Claude Updated"),
    });
    mockedRouteDeleteExternalAgentConfig.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { ok: true },
    });

    const created = await createExternalAgentConfig({
      name: "Claude",
      description: "",
      toolType: ExternalAgentToolTypeEnum.codex,
      pluginAdapterId: null,
      runMode: ExternalAgentRunModeEnum.sdk,
      commandPath: "/usr/bin/codex",
      baseUrl: null,
      defaultModel: null,
      sandboxPolicy: null,
      approvalPolicy: null,
      settingsMode: ExternalAgentSettingsModeEnum.managed_local,
      settingsSources: null,
      settingsFilePath: null,
      settingsAllowSettaEdits: true,
      settingsManagedBlock: null,
      envVarWhitelist: [],
      workingDirStrategy: ExternalAgentWorkingDirStrategyEnum.project_root,
      workingDir: null,
      codexSkipGitRepoCheck: null,
    });
    const updated = await updateExternalAgentConfig({
      configId: "config-b",
      name: "Claude Updated",
      description: "",
      toolType: ExternalAgentToolTypeEnum.codex,
      pluginAdapterId: null,
      runMode: ExternalAgentRunModeEnum.sdk,
      commandPath: "/usr/bin/codex",
      baseUrl: null,
      defaultModel: null,
      sandboxPolicy: null,
      approvalPolicy: null,
      settingsMode: ExternalAgentSettingsModeEnum.managed_local,
      settingsSources: null,
      settingsFilePath: null,
      settingsAllowSettaEdits: true,
      settingsManagedBlock: null,
      envVarWhitelist: [],
      workingDirStrategy: ExternalAgentWorkingDirStrategyEnum.project_root,
      workingDir: null,
      codexSkipGitRepoCheck: null,
    });
    const deleted = await deleteExternalAgentConfig({ configId: "config-b" });

    expect(created?.id).toBe("config-b");
    expect(updated?.name).toBe("Claude Updated");
    expect(deleted).toBe(true);
    expect(useAIStore.getState().externalAgentConfigs).toEqual([
      buildExternalAgentConfig("config-a", "Codex"),
    ]);
  });
});
