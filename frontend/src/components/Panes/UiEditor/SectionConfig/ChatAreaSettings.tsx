import { DICTATION_MODE_ITEMS } from "components/Chat/dictationMode";
import { buildEngineGroups } from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";
import { canUseManagedChatLLM } from "components/Chat/sharePolicyChatAccess";
import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
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

  const availableConfigGroups = useMemo(
    () => buildLLMConfigGroups(allLLMConfigs, apiKeys),
    [allLLMConfigs, apiKeys],
  );
  const agentProfileGroups = useMemo<AllItemsType<string>>(
    () => [
      {
        group: "Agent Profiles",
        items: agentProfiles.map((profile) => ({
          id: profile.id,
          name: profile.name || profile.id,
        })),
      },
    ],
    [agentProfiles],
  );
  const engineGroups = useMemo(
    () => buildEngineGroups(engineConfigs),
    [engineConfigs],
  );
  const transcriptionProfileGroups = useMemo<AllItemsType<string>>(
    () => [
      {
        group: "Transcription Profiles",
        items: transcriptionProfiles.map((profile) => ({
          id: profile.id,
          name: profile.name || profile.id,
        })),
      },
    ],
    [transcriptionProfiles],
  );
  const selectedProfile = useMemo(() => {
    if (!agentProfileId) {
      return null;
    }
    return (
      agentProfiles.find((profile) => profile.id === agentProfileId) ?? null
    );
  }, [agentProfileId, agentProfiles]);
  const noConfigsAvailable = countLLMConfigs(availableConfigGroups) === 0;
  const canEditSettings = !isDeploymentMode || canEditParams;
  const isDisabled = isFrozen || !canEditSettings;
  const modeItems = useMemo<AllItemsType<string>>(
    () => [
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
    ],
    [],
  );
  const isChatModeControlDisabled = isDisabled || !canEditLayout;
  const effectiveEngineConfigId =
    engineConfigId ?? selectedProfile?.engineConfigId ?? null;
  const selectedEngineConfig = useMemo(() => {
    if (!effectiveEngineConfigId) {
      return null;
    }
    return (
      engineConfigs.find((config) => config.id === effectiveEngineConfigId) ??
      null
    );
  }, [effectiveEngineConfigId, engineConfigs]);
  const selectedEngineId = selectedEngineConfig?.id ?? null;
  const engineType = selectedEngineConfig?.engineType ?? null;
  const selectedLLMConfigId = useMemo(() => {
    if (!selectedEngineConfig) {
      return null;
    }
    if (selectedEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
      return null;
    }
    return (
      selectedEngineConfig.settaLlmConfigId ??
      pickDefaultConfigId(allLLMConfigs)
    );
  }, [allLLMConfigs, selectedEngineConfig]);

  const updateSettings = useCallback(
    (nextSettings: ChatSectionSettingsPayload) => {
      if (isDisabled) {
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
    [isDisabled, projectConfigId, sectionId],
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
    [isChatModeControlDisabled, sectionId],
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
      if (isDisabled || !selectedEngineConfig) {
        return;
      }
      if (selectedEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
        return;
      }
      void updateEngineConfig({
        config: {
          ...selectedEngineConfig,
          settaLlmConfigId: value,
        },
      });
    },
    [isDisabled, selectedEngineConfig],
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
    if (isDisabled || !managed || !canManageManagedChatThreads) {
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
    isDisabled,
    managed,
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
      if (nextEngineId !== selectedEngineId) {
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
      selectedEngineId,
      thinking,
      transcriptionProfileId,
      updateSettings,
    ],
  );

  const configPlaceholder = noConfigsAvailable
    ? "Add an LLM config or API key"
    : "Select an LLM";
  const highlightMissingConfig =
    engineType === EngineTypeEnum.setta_llm &&
    !selectedLLMConfigId &&
    !noConfigsAvailable;

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        className="flex w-full flex-col gap-2"
        data-testid="chat-area-settings-chat-mode"
      >
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Chat Mode
        </p>
        <IdNameCombobox
          allItems={modeItems}
          value={sectionChatWindowMode}
          small={false}
          onSelectedItemChange={handleChatModeChange}
          placeholder="Select chat mode"
          outerDivClasses="justify-center"
          isDisabled={isChatModeControlDisabled}
        />
      </div>

      <div className="flex w-full items-center justify-between gap-4">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Managed Mode
        </p>
        <SwitchInput
          isDisabled={isDisabled}
          value={managed}
          onChange={handleManagedChange}
          outerDivClassName="flex items-center"
        />
      </div>

      {managed ? (
        <>
          <div className="flex w-full flex-col gap-2">
            <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
              Engine
            </p>
            <IdNameCombobox
              allItems={engineGroups}
              value={selectedEngineId}
              small={false}
              onSelectedItemChange={handleEngineChange}
              placeholder="Select an engine"
              outerDivClasses="justify-center"
              isDisabled={isDisabled}
            />
          </div>
          <div className="flex w-full flex-col gap-2">
            <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
              Agent Profile
            </p>
            <IdNameCombobox
              allItems={agentProfileGroups}
              value={agentProfileId}
              small={false}
              onSelectedItemChange={handleAgentProfileChange}
              placeholder="Select a profile (optional)"
              outerDivClasses="justify-center"
              isDisabled={isDisabled}
              selectedItemCanBeNull
            />
            {agentProfileId ? (
              <p className="text-[11px] text-setta-500 dark:text-setta-400">
                Engine config overrides the profile when set.
              </p>
            ) : null}
          </div>
          {engineType === EngineTypeEnum.setta_llm ? (
            <>
              <div className="flex w-full items-center justify-between gap-4">
                <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
                  Thinking
                </p>
                <SwitchInput
                  isDisabled={isDisabled}
                  value={thinking}
                  onChange={handleThinkingChange}
                  outerDivClassName="flex items-center"
                />
              </div>
              <div className="flex w-full flex-col gap-2">
                <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
                  LLM Config
                </p>
                <IdNameCombobox
                  allItems={availableConfigGroups}
                  value={selectedLLMConfigId}
                  small={false}
                  onSelectedItemChange={handleLLMConfigChange}
                  placeholder={configPlaceholder}
                  bg={
                    highlightMissingConfig
                      ? "bg-red-500 hover:bg-red-800 hover:dark:bg-red-900 dark:bg-red-950 !placeholder-white !border-red-500"
                      : ""
                  }
                  outerDivClasses="justify-center"
                  isDisabled={isDisabled}
                  selectedItemCanBeNull
                />
              </div>
            </>
          ) : null}
          <div className="flex w-full flex-col gap-2">
            <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
              Transcription Profile
            </p>
            <IdNameCombobox
              allItems={transcriptionProfileGroups}
              value={transcriptionProfileId}
              small={false}
              onSelectedItemChange={handleTranscriptionProfileChange}
              placeholder="Select a transcription profile"
              outerDivClasses="justify-center"
              isDisabled={isDisabled}
              selectedItemCanBeNull
            />
          </div>
          <div className="flex w-full flex-col gap-2">
            <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
              Dictation Mode
            </p>
            <IdNameCombobox
              allItems={DICTATION_MODE_ITEMS}
              value={dictationMode}
              small={false}
              onSelectedItemChange={handleDictationModeChange}
              placeholder="Select dictation mode"
              outerDivClasses="justify-center"
              isDisabled={isDisabled}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={isDisabled || !canManageManagedChatThreads}
              className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              onClick={handleNewChat}
            >
              New Chat
            </button>
          </div>
        </>
      ) : null}

      <ChatAreaAgenticLinksPanel sectionId={sectionId} />
    </div>
  );
}
