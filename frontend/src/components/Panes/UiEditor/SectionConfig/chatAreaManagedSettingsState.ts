import { buildEngineGroups } from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import {
  type AgentProfile,
  type AllLLMConfigs,
  type APIKeys,
  ChatWindowModeEnum,
  type EngineConfig,
  EngineTypeEnum,
  type TranscriptionProfile,
} from "utils/generatedTypes";

export type ChatAreaManagedSettingsViewModel = {
  availableConfigGroups: AllItemsType<string>;
  agentProfileGroups: AllItemsType<string>;
  engineGroups: AllItemsType<string>;
  transcriptionProfileGroups: AllItemsType<string>;
  modeItems: AllItemsType<string>;
  selectedEngineId: string | null;
  selectedEngineConfig: EngineConfig | null;
  selectedLLMConfigId: string | null;
  engineType: EngineTypeEnum | null;
  isDisabled: boolean;
  isChatModeControlDisabled: boolean;
  configPlaceholder: string;
  highlightMissingConfig: boolean;
  showAgentProfileOverrideHint: boolean;
};

type ResolveChatAreaManagedSettingsViewModelArgs = {
  apiKeys: APIKeys | null | undefined;
  allLLMConfigs: AllLLMConfigs | null;
  agentProfiles: Array<AgentProfile>;
  agentProfileId: string | null;
  canEditLayout: boolean;
  canEditParams: boolean;
  engineConfigId: string | null;
  engineConfigs: Array<EngineConfig>;
  isDeploymentMode: boolean;
  isFrozen: boolean;
  transcriptionProfiles: Array<TranscriptionProfile>;
};

export const CHAT_AREA_MODE_ITEMS: AllItemsType<string> = [
  {
    group: "Chat Modes",
    items: [
      {
        id: ChatWindowModeEnum.section_mode,
        name: "Section mode (edge scoped)",
      },
      {
        id: ChatWindowModeEnum.project_ai_mode,
        name: "Project AI mode (full project)",
      },
    ],
  },
];

export function resolveChatAreaManagedSettingsViewModel({
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
}: ResolveChatAreaManagedSettingsViewModelArgs): ChatAreaManagedSettingsViewModel {
  const availableConfigGroups = buildLLMConfigGroups(allLLMConfigs, apiKeys);
  const agentProfileGroups: AllItemsType<string> = [
    {
      group: "Agent Profiles",
      items: agentProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name || profile.id,
      })),
    },
  ];
  const transcriptionProfileGroups: AllItemsType<string> = [
    {
      group: "Transcription Profiles",
      items: transcriptionProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name || profile.id,
      })),
    },
  ];
  const engineGroups = buildEngineGroups(engineConfigs);
  const selectedProfile =
    agentProfileId == null
      ? null
      : agentProfiles.find((profile) => profile.id === agentProfileId) ?? null;
  const effectiveEngineConfigId =
    engineConfigId ?? selectedProfile?.engineConfigId ?? null;
  const selectedEngineConfig =
    effectiveEngineConfigId == null
      ? null
      : engineConfigs.find((config) => config.id === effectiveEngineConfigId) ??
        null;
  const selectedLLMConfigId =
    selectedEngineConfig?.engineType === EngineTypeEnum.setta_llm
      ? selectedEngineConfig.settaLlmConfigId ??
        pickDefaultConfigId(allLLMConfigs)
      : null;
  const noConfigsAvailable = countLLMConfigs(availableConfigGroups) === 0;
  const canEditSettings = !isDeploymentMode || canEditParams;
  const isDisabled = isFrozen || !canEditSettings;
  const isChatModeControlDisabled = isDisabled || !canEditLayout;

  return {
    availableConfigGroups,
    agentProfileGroups,
    engineGroups,
    transcriptionProfileGroups,
    modeItems: CHAT_AREA_MODE_ITEMS,
    selectedEngineId: selectedEngineConfig?.id ?? null,
    selectedEngineConfig,
    selectedLLMConfigId,
    engineType: selectedEngineConfig?.engineType ?? null,
    isDisabled,
    isChatModeControlDisabled,
    configPlaceholder: noConfigsAvailable
      ? "Add an LLM config or API key"
      : "Select an LLM",
    highlightMissingConfig:
      selectedEngineConfig?.engineType === EngineTypeEnum.setta_llm &&
      !selectedLLMConfigId &&
      !noConfigsAvailable,
    showAgentProfileOverrideHint: agentProfileId != null,
  };
}
