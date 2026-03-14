import { canUseManagedChatLLM } from "components/Chat/sharePolicyChatAccess";
import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import _ from "lodash";
import { useMemo } from "react";
import {
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ChatAreaAgenticLinksPanel } from "./ChatAreaAgenticLinksPanel";
import { ChatAreaManagedSettingsPanel } from "./ChatAreaManagedSettingsPanel";
import { resolveChatAreaManagedSettingsViewModel } from "./chatAreaManagedSettingsState";
import {
  createChatAreaSettingsController,
  getChatAreaWindowModeForSection,
  type ChatSectionSettingsPayload,
} from "./chatAreaSettingsController";

type ChatAreaSettingsProps = {
  sectionId: string;
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
      sectionChatWindowMode: getChatAreaWindowModeForSection({
        projectChatWindowing: state.projectChatWindowing,
        sectionId,
      }),
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

  const currentSettings = useMemo<ChatSectionSettingsPayload>(
    () => ({
      managed,
      engineConfigId,
      transcriptionProfileId,
      agentProfileId,
      thinking,
      permissionMode,
      searchEnabled,
      dictationMode,
    }),
    [
      agentProfileId,
      dictationMode,
      engineConfigId,
      managed,
      permissionMode,
      searchEnabled,
      thinking,
      transcriptionProfileId,
    ],
  );
  const controller = useMemo(
    () =>
      createChatAreaSettingsController({
        canManageManagedChatThreads,
        currentSettings,
        isChatModeControlDisabled:
          managedSettingsViewModel.isChatModeControlDisabled,
        isDisabled: managedSettingsViewModel.isDisabled,
        projectConfigId,
        sectionId,
        selectedEngineConfig: managedSettingsViewModel.selectedEngineConfig,
        selectedEngineId: managedSettingsViewModel.selectedEngineId,
      }),
    [
      canManageManagedChatThreads,
      currentSettings,
      managedSettingsViewModel.isChatModeControlDisabled,
      managedSettingsViewModel.isDisabled,
      managedSettingsViewModel.selectedEngineConfig,
      managedSettingsViewModel.selectedEngineId,
      projectConfigId,
      sectionId,
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
        onAgentProfileChange={controller.handleAgentProfileChange}
        onChatModeChange={controller.handleChatModeChange}
        onDictationModeChange={controller.handleDictationModeChange}
        onEngineChange={controller.handleEngineChange}
        onLLMConfigChange={controller.handleLLMConfigChange}
        onManagedChange={controller.handleManagedChange}
        onNewChat={controller.handleNewChat}
        onThinkingChange={controller.handleThinkingChange}
        onTranscriptionProfileChange={
          controller.handleTranscriptionProfileChange
        }
      />

      <ChatAreaAgenticLinksPanel sectionId={sectionId} />
    </div>
  );
}
