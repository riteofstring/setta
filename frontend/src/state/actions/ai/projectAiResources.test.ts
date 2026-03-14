import { resetProjectStores } from "state/utils";
import {
  route_delete_transcription_profile,
  route_get_agent_profiles,
  route_get_external_agent_health,
} from "utils/generatedEndpoints";
import {
  ExternalAgentRunModeEnum,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  ExternalAgentWorkingDirStrategyEnum,
  TranscriptionTransportModeEnum,
} from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAIStore } from "../../definitions";
import {
  deleteTranscriptionProfile,
  loadAgentProfiles,
  receiveExternalAgentConfigsUpdate,
} from "./projectAiResources";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_delete_transcription_profile: vi.fn(),
    route_get_agent_profiles: vi.fn(),
    route_get_external_agent_health: vi.fn(),
  };
});

const mockedRouteDeleteTranscriptionProfile = vi.mocked(
  route_delete_transcription_profile,
);
const mockedRouteGetAgentProfiles = vi.mocked(route_get_agent_profiles);
const mockedRouteGetExternalAgentHealth = vi.mocked(
  route_get_external_agent_health,
);

describe("projectAiResources", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetProjectStores();
  });

  it("loads agent profiles once and reuses the loaded store snapshot", async () => {
    // The extracted loader should still own the initial resource hydration guard.
    mockedRouteGetAgentProfiles.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [
        {
          id: "profile-1",
          name: "Primary agent",
          description: "",
          systemPrompt: "",
          enableBackgroundSummaryFill: false,
          enableLlmChatTitles: false,
          engineConfigId: null,
          toolAllowlist: [],
          memoryScope: null,
        },
      ],
    });

    await loadAgentProfiles();
    await loadAgentProfiles();

    expect(mockedRouteGetAgentProfiles).toHaveBeenCalledTimes(1);
    expect(useAIStore.getState().agentProfiles).toEqual([
      {
        id: "profile-1",
        name: "Primary agent",
        description: "",
        systemPrompt: "",
        enableBackgroundSummaryFill: false,
        enableLlmChatTitles: false,
        engineConfigId: null,
        toolAllowlist: [],
        memoryScope: null,
      },
    ]);
    expect(useAIStore.getState().agentProfilesInitialLoadComplete).toBe(true);
  });

  it("refreshes external agent health after websocket config updates", async () => {
    // Config updates must continue to trigger a forced health refresh for the settings UI.
    mockedRouteGetExternalAgentHealth.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [
        {
          configId: "config-1",
          name: "Codex",
          toolType: ExternalAgentToolTypeEnum.codex,
          runMode: ExternalAgentRunModeEnum.sdk,
          supported: true,
          available: true,
          issues: [],
          nodePath: "/usr/bin/node",
          nodeVersion: "22.0.0",
          sdkVersion: "1.0.0",
          cliVersion: "0.1.0",
          baseUrl: null,
          workingDir: "/tmp/worktree",
          envVars: {
            present: [],
            missing: [],
          },
        },
      ],
    });

    receiveExternalAgentConfigsUpdate([
      {
        id: "config-1",
        name: "Codex",
        description: "",
        toolType: ExternalAgentToolTypeEnum.codex,
        pluginAdapterId: null,
        runMode: ExternalAgentRunModeEnum.sdk,
        commandPath: null,
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
      },
    ]);

    await vi.waitFor(() =>
      expect(mockedRouteGetExternalAgentHealth).toHaveBeenCalledTimes(1),
    );
    await vi.waitFor(() =>
      expect(useAIStore.getState().externalAgentHealthInitialLoadComplete).toBe(
        true,
      ),
    );

    expect(useAIStore.getState().externalAgentConfigs).toHaveLength(1);
    expect(useAIStore.getState().externalAgentHealth).toEqual([
      {
        configId: "config-1",
        name: "Codex",
        toolType: ExternalAgentToolTypeEnum.codex,
        runMode: ExternalAgentRunModeEnum.sdk,
        supported: true,
        available: true,
        issues: [],
        nodePath: "/usr/bin/node",
        nodeVersion: "22.0.0",
        sdkVersion: "1.0.0",
        cliVersion: "0.1.0",
        baseUrl: null,
        workingDir: "/tmp/worktree",
        envVars: {
          present: [],
          missing: [],
        },
      },
    ]);
  });

  it("clears the selected transcription profile when that profile is deleted", async () => {
    // The extracted delete flow still needs to keep project-chat settings consistent.
    mockedRouteDeleteTranscriptionProfile.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    useAIStore.setState({
      transcriptionProfiles: [
        {
          id: "transcription-1",
          name: "Realtime",
          transcriptionLlmConfigId: "llm-1",
          transportMode: TranscriptionTransportModeEnum.realtime,
          chunkMs: 250,
          supportsRealtimeTranscription: true,
          language: "en",
        },
      ],
      projectChatTranscriptionProfileId: "transcription-1",
    });

    const deleted = await deleteTranscriptionProfile({
      profileId: "transcription-1",
    });

    expect(deleted).toBe(true);
    expect(useAIStore.getState().transcriptionProfiles).toEqual([]);
    expect(useAIStore.getState().projectChatTranscriptionProfileId).toBeNull();
  });
});
