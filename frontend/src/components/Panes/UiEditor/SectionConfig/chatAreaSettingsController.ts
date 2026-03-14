import { updateEngineConfig } from "state/actions/ai/projectAiResources";
import {
  getProjectChatWindowModeForSectionInState,
  setProjectChatWindowModeForSection,
} from "state/actions/projectChatWindowing";
import {
  dispatchOptimisticProjectStateUpdate,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  route_set_chat_section_chat_id,
  route_set_chat_section_settings,
} from "utils/generatedEndpoints";
import {
  ChatWindowModeEnum,
  type EngineConfig,
  EngineTypeEnum,
} from "utils/generatedTypes";

export type ChatSectionSettingsPayload = {
  managed: boolean;
  engineConfigId: string | null;
  transcriptionProfileId: string | null;
  agentProfileId: string | null;
  thinking: boolean;
  permissionMode: "minimal" | "yolo" | "config_toml_custom";
  searchEnabled: boolean;
  dictationMode: "auto" | "browser" | "provider";
};

type CreateChatAreaSettingsControllerArgs = {
  canManageManagedChatThreads: boolean;
  currentSettings: ChatSectionSettingsPayload;
  isChatModeControlDisabled: boolean;
  isDisabled: boolean;
  projectConfigId: string;
  sectionId: string;
  selectedEngineConfig: EngineConfig | null;
  selectedEngineId: string | null;
};

function publishChatSectionSettings({
  nextSettings,
  projectConfigId,
  sectionId,
}: {
  nextSettings: ChatSectionSettingsPayload;
  projectConfigId: string;
  sectionId: string;
}) {
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
}

function publishNewChat({
  projectConfigId,
  sectionId,
}: {
  projectConfigId: string;
  sectionId: string;
}) {
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
}

export function createChatAreaSettingsController({
  canManageManagedChatThreads,
  currentSettings,
  isChatModeControlDisabled,
  isDisabled,
  projectConfigId,
  sectionId,
  selectedEngineConfig,
  selectedEngineId,
}: CreateChatAreaSettingsControllerArgs) {
  const updateSettings = (nextSettings: ChatSectionSettingsPayload) => {
    if (isDisabled) {
      return;
    }
    publishChatSectionSettings({
      nextSettings,
      projectConfigId,
      sectionId,
    });
  };

  const handleNewChat = () => {
    if (
      isDisabled ||
      !currentSettings.managed ||
      !canManageManagedChatThreads
    ) {
      return;
    }
    publishNewChat({
      projectConfigId,
      sectionId,
    });
  };

  return {
    handleManagedChange(value: boolean) {
      updateSettings({
        ...currentSettings,
        managed: value,
      });
    },
    handleChatModeChange(value: string | null) {
      if (isChatModeControlDisabled || !value) {
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
    handleThinkingChange(value: boolean) {
      updateSettings({
        ...currentSettings,
        thinking: value,
      });
    },
    async handleLLMConfigChange(value: string | null) {
      if (isDisabled || !selectedEngineConfig) {
        return;
      }
      if (selectedEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
        return;
      }
      await updateEngineConfig({
        config: {
          ...selectedEngineConfig,
          settaLlmConfigId: value,
        },
      });
    },
    handleAgentProfileChange(value: string | null) {
      updateSettings({
        ...currentSettings,
        agentProfileId: value,
      });
    },
    handleTranscriptionProfileChange(value: string | null) {
      updateSettings({
        ...currentSettings,
        transcriptionProfileId: value,
      });
    },
    handleDictationModeChange(value: string | null) {
      updateSettings({
        ...currentSettings,
        dictationMode:
          value === "browser" || value === "provider" ? value : "auto",
      });
    },
    handleNewChat,
    handleEngineChange(value: string | null) {
      const nextEngineId = value ?? null;
      updateSettings({
        ...currentSettings,
        engineConfigId: nextEngineId,
      });
      if (nextEngineId !== selectedEngineId) {
        handleNewChat();
      }
    },
  };
}

export function getChatAreaWindowModeForSection({
  projectChatWindowing,
  sectionId,
}: {
  projectChatWindowing: Parameters<
    typeof getProjectChatWindowModeForSectionInState
  >[0];
  sectionId: string;
}) {
  return getProjectChatWindowModeForSectionInState(
    projectChatWindowing,
    sectionId,
  );
}
