import { canUseManagedChatLLM } from "components/Chat/sharePolicyChatAccess";
import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import _ from "lodash";
import { useCallback, useMemo } from "react";
import { updateEngineConfig } from "state/actions/ai/projectAiResources";
import {
  getProjectChatWindowModeForSectionInState,
  setProjectChatWindowModeForSection,
} from "state/actions/projectChatWindowing";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  route_set_chat_section_chat_id,
  route_set_chat_section_settings,
} from "utils/generatedEndpoints";
import {
  ChatWindowModeEnum,
  EngineTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { ChatAreaAgenticLinksPanel } from "./ChatAreaAgenticLinksPanel";
import { ChatAreaManagedSettingsPanel } from "./ChatAreaManagedSettingsPanel";
import { resolveChatAreaManagedSettingsViewModel } from "./chatAreaManagedSettingsState";

type ChatAreaSettingsProps = {
  sectionId: string;
};

type ChatSectionSettingsPayload = {
  managed: boolean;
  engineConfigId: string | null;
  transcriptionProfileId: string | null;
  agentProfileId: string | null;
  thinking: boolean;
  permissionMode: "minimal" | "yolo" | "config_toml_custom";
  searchEnabled: boolean;
  dictationMode: "auto" | "browser" | "provider";
};

export function ChatAreaSettings({ sectionId }: ChatAreaSettingsProps) {
  useHydrateLLMState();
  useHydrateAgenticState();
  const projectConfigId = getCurrProjectConfigId();
  const { canEditLayout, canEditParams } = useShareCapabilities();
  const { isDeploymentMode, allowLLM } = useShareSession((x) => ({
    isDeploymentMode: x.isDeploymentMode,
    allowLLM: x.sharePolicy?.allowLLM ?? false,
  }));
  const canManageManagedChatThreads = canUseManagedChatLLM({
    isDeploymentMode,
    allowLLM,
  });

  const {
    managed,
    engineConfigId,
    transcriptionProfileId,
    agentProfileId,
    thinking,
    permissionMode,
    searchEnabled,
    dictationMode,
    isFrozen,
    sectionChatWindowMode,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
    return {
      managed: impl.managed,
      engineConfigId: impl.engineConfigId,
      transcriptionProfileId: impl.transcriptionProfileId,
      agentProfileId: impl.agentProfileId,
      thinking: impl.thinking,
      permissionMode: impl.permissionMode,
      searchEnabled: impl.searchEnabled,
      dictationMode: impl.dictationMode,
      isFrozen: impl.isFrozen,
      sectionChatWindowMode: getProjectChatWindowModeForSectionInState(
        state.projectChatWindowing,
        sectionId,
      ),
    };
  }, _.isEqual);

  const {
    apiKeys,
    allLLMConfigs,
    agentProfiles,
    engineConfigs,
    transcriptionProfiles,
  } = useAIStore(
    (state) => ({
      apiKeys: state.apiKeys,
      allLLMConfigs: state.allLLMConfigs,
      agentProfiles: state.agentProfiles,
      engineConfigs: state.engineConfigs,
      transcriptionProfiles: state.transcriptionProfiles,
    }),
    _.isEqual,
  );

  const managedSettingsViewModel = useMemo(
    () =>
      resolveChatAreaManagedSettingsViewModel({
        apiKeys,
        allLLMConfigs,
        agentProfiles,
        agentProfileId,
        canEditLayout,
        canEditParams,
        engineConfigId,
        engineConfigs,
        isDeploymentMode,
        isFrozen,
        transcriptionProfiles,
      }),
    [
      agentProfileId,
      agentProfiles,
      allLLMConfigs,
      apiKeys,
      canEditLayout,
      canEditParams,
      engineConfigId,
      engineConfigs,
      isDeploymentMode,
      isFrozen,
      transcriptionProfiles,
    ],
  );

  const updateSettings = useCallback(
    (nextSettings: ChatSectionSettingsPayload) => {
      if (managedSettingsViewModel.isDisabled) {
        return;
      }
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
            managed: nextSettings.managed,
            engineConfigId: nextSettings.engineConfigId,
            transcriptionProfileId: nextSettings.transcriptionProfileId,
            agentProfileId: nextSettings.agentProfileId,
            thinking: nextSettings.thinking,
            permissionMode: nextSettings.permissionMode,
            searchEnabled: nextSettings.searchEnabled,
            dictationMode: nextSettings.dictationMode,
          });
        },
        send: (frontendOpId) =>
          route_set_chat_section_settings({
            projectConfigId,
            sectionId,
            managed: nextSettings.managed,
            engineConfigId: nextSettings.engineConfigId,
            transcriptionProfileId: nextSettings.transcriptionProfileId,
            agentProfileId: nextSettings.agentProfileId,
            thinking: nextSettings.thinking,
            permissionMode: nextSettings.permissionMode,
            searchEnabled: nextSettings.searchEnabled,
            dictationMode: nextSettings.dictationMode,
            frontendOpId,
          }),
      });
    },
    [managedSettingsViewModel.isDisabled, projectConfigId, sectionId],
  );

  const handleManagedChange = useCallback(
    (value: boolean) => {
      updateSettings({
        managed: value,
        engineConfigId,
        transcriptionProfileId,
        agentProfileId,
        thinking,
        permissionMode,
        searchEnabled,
        dictationMode,
      });
    },
    [
      agentProfileId,
      dictationMode,
      engineConfigId,
      permissionMode,
      searchEnabled,
      thinking,
      transcriptionProfileId,
      updateSettings,
    ],
  );

  const handleChatModeChange = useCallback(
    (value: string | null) => {
      if (managedSettingsViewModel.isChatModeControlDisabled || !value) {
        return;
      }
      if (
        value !== ChatWindowModeEnum.section_mode &&
        value !== ChatWindowModeEnum.project_ai_mode
      ) {
        return;
      }
      setProjectChatWindowModeForSection(sectionId, value);
    },
    [managedSettingsViewModel.isChatModeControlDisabled, sectionId],
  );

  const handleThinkingChange = useCallback(
    (value: boolean) => {
      updateSettings({
        managed,
        engineConfigId,
        transcriptionProfileId,
        agentProfileId,
        thinking: value,
        permissionMode,
        searchEnabled,
        dictationMode,
      });
    },
    [
      agentProfileId,
      dictationMode,
      engineConfigId,
      managed,
      permissionMode,
      searchEnabled,
      transcriptionProfileId,
      updateSettings,
    ],
  );

  const handleLLMConfigChange = useCallback(
    (value: string | null) => {
      if (
        managedSettingsViewModel.isDisabled ||
        !managedSettingsViewModel.selectedEngineConfig
      ) {
        return;
      }
      if (
        managedSettingsViewModel.selectedEngineConfig.engineType !==
        EngineTypeEnum.setta_llm
      ) {
        return;
      }
      void updateEngineConfig({
        config: {
          ...managedSettingsViewModel.selectedEngineConfig,
          settaLlmConfigId: value,
        },
      });
    },
    [managedSettingsViewModel],
  );

  const handleAgentProfileChange = useCallback(
    (value: string | null) => {
      updateSettings({
        managed,
        engineConfigId,
        transcriptionProfileId,
        agentProfileId: value,
        thinking,
        permissionMode,
        searchEnabled,
        dictationMode,
      });
    },
    [
      dictationMode,
      engineConfigId,
      managed,
      permissionMode,
      searchEnabled,
      thinking,
      transcriptionProfileId,
      updateSettings,
    ],
  );

  const handleTranscriptionProfileChange = useCallback(
    (value: string | null) => {
      updateSettings({
        managed,
        engineConfigId,
        transcriptionProfileId: value,
        agentProfileId,
        thinking,
        permissionMode,
        searchEnabled,
        dictationMode,
      });
    },
    [
      agentProfileId,
      dictationMode,
      engineConfigId,
      managed,
      permissionMode,
      searchEnabled,
      thinking,
      updateSettings,
    ],
  );

  const handleDictationModeChange = useCallback(
    (value: string | null) => {
      const nextMode =
        value === "browser" || value === "provider" ? value : "auto";
      updateSettings({
        managed,
        engineConfigId,
        transcriptionProfileId,
        agentProfileId,
        thinking,
        permissionMode,
        searchEnabled,
        dictationMode: nextMode,
      });
    },
    [
      agentProfileId,
      engineConfigId,
      managed,
      permissionMode,
      searchEnabled,
      thinking,
      transcriptionProfileId,
      updateSettings,
    ],
  );

  const handleNewChat = useCallback(() => {
    if (
      managedSettingsViewModel.isDisabled ||
      !managed ||
      !canManageManagedChatThreads
    ) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
          chatId: null,
        });
      },
      send: () =>
        route_set_chat_section_chat_id({
          projectConfigId,
          sectionId,
          chatId: null,
        }),
    });
  }, [
    canManageManagedChatThreads,
    managed,
    managedSettingsViewModel.isDisabled,
    projectConfigId,
    sectionId,
  ]);

  const handleEngineChange = useCallback(
    (value: string | null) => {
      const nextEngineId = value ?? null;
      updateSettings({
        managed,
        engineConfigId: nextEngineId,
        transcriptionProfileId,
        agentProfileId,
        thinking,
        permissionMode,
        searchEnabled,
        dictationMode,
      });
      if (nextEngineId !== managedSettingsViewModel.selectedEngineId) {
        handleNewChat();
      }
    },
    [
      agentProfileId,
      dictationMode,
      handleNewChat,
      managed,
      permissionMode,
      searchEnabled,
      managedSettingsViewModel.selectedEngineId,
      thinking,
      transcriptionProfileId,
      updateSettings,
    ],
  );

  return (
    <div className="flex w-full flex-col gap-2">
      <ChatAreaManagedSettingsPanel
        agentProfileId={agentProfileId}
        canManageManagedChatThreads={canManageManagedChatThreads}
        dictationMode={dictationMode}
        managed={managed}
        sectionChatWindowMode={sectionChatWindowMode}
        thinking={thinking}
        transcriptionProfileId={transcriptionProfileId}
        viewModel={managedSettingsViewModel}
        onAgentProfileChange={handleAgentProfileChange}
        onChatModeChange={handleChatModeChange}
        onDictationModeChange={handleDictationModeChange}
        onEngineChange={handleEngineChange}
        onLLMConfigChange={handleLLMConfigChange}
        onManagedChange={handleManagedChange}
        onNewChat={handleNewChat}
        onThinkingChange={handleThinkingChange}
        onTranscriptionProfileChange={handleTranscriptionProfileChange}
      />

      <ChatAreaAgenticLinksPanel sectionId={sectionId} />
    </div>
  );
}
