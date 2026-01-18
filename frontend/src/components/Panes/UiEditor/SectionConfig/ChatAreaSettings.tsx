import {
  buildEngineGroups,
  getExternalEngineStatus,
} from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";
import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { useCallback, useMemo } from "react";
import { updateEngineConfig } from "state/actions/ai";
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
import { EngineTypeEnum, SectionTypeEnum } from "utils/generatedTypes";

type ChatAreaSettingsProps = {
  sectionId: string;
};

type ChatSectionSettingsPayload = {
  managed: boolean;
  engineConfigId: string | null;
  agentProfileId: string | null;
  deepThink: boolean;
};

export function ChatAreaSettings({ sectionId }: ChatAreaSettingsProps) {
  useHydrateLLMState();
  useHydrateAgenticState();
  const projectConfigId = getCurrProjectConfigId();
  const { canEditParams } = useShareCapabilities();
  const isShareMode = useShareSession((x) => x.isShareMode);

  const { managed, engineConfigId, agentProfileId, deepThink, isFrozen } =
    useProjectState((state) => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Chat,
      );
      return {
        managed: impl.managed,
        engineConfigId: impl.engineConfigId,
        agentProfileId: impl.agentProfileId,
        deepThink: impl.deepThink,
        isFrozen: impl.isFrozen,
      };
    }, _.isEqual);

  const {
    apiKeys,
    allLLMConfigs,
    agentProfiles,
    engineConfigs,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
  } = useAIStore(
    (state) => ({
      apiKeys: state.apiKeys,
      allLLMConfigs: state.allLLMConfigs,
      agentProfiles: state.agentProfiles,
      engineConfigs: state.engineConfigs,
      externalAgentHealth: state.externalAgentHealth,
      externalAgentHealthInitialLoadComplete:
        state.externalAgentHealthInitialLoadComplete,
    }),
    _.isEqual,
  );

  const availableConfigGroups = useMemo(
    () => buildLLMConfigGroups(allLLMConfigs, apiKeys),
    [allLLMConfigs, apiKeys],
  );
  const agentProfileGroups = useMemo(() => {
    return [
      {
        group: "Agent Profiles",
        items: agentProfiles.map((profile) => ({
          id: profile.id,
          name: profile.name || profile.id,
        })),
      },
    ];
  }, [agentProfiles]);
  const engineGroups = useMemo(
    () => buildEngineGroups(engineConfigs),
    [engineConfigs],
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
  const canEditSettings = !isShareMode || canEditParams;
  const isDisabled = isFrozen || !canEditSettings;
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
  const externalEngineStatus = useMemo(
    () =>
      getExternalEngineStatus(
        selectedEngineConfig,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      ),
    [
      selectedEngineConfig,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    ],
  );
  const externalStatusMessage = useMemo(() => {
    if (!externalEngineStatus) {
      return null;
    }
    if (externalEngineStatus.status === "loading") {
      return "Checking external engine status...";
    }
    if (externalEngineStatus.status === "available") {
      return "External engine available";
    }
    if (externalEngineStatus.issues.length > 0) {
      return `External engine unavailable: ${externalEngineStatus.issues.join(
        "; ",
      )}`;
    }
    return "External engine unavailable";
  }, [externalEngineStatus]);
  const externalStatusClassName = useMemo(() => {
    if (!externalEngineStatus) {
      return "";
    }
    if (externalEngineStatus.status === "available") {
      return "text-emerald-600 dark:text-emerald-400";
    }
    if (externalEngineStatus.status === "loading") {
      return "text-setta-500 dark:text-setta-400";
    }
    return "text-red-600 dark:text-red-400";
  }, [externalEngineStatus]);
  const selectedLLMConfigId = useMemo(() => {
    if (!selectedEngineConfig) {
      return null;
    }
    if (selectedEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
      return null;
    }
    return (
      selectedEngineConfig.settaLlmConfig?.llmConfigId ??
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
            agentProfileId: nextSettings.agentProfileId,
            deepThink: nextSettings.deepThink,
          });
        },
        send: (frontendOpId) =>
          route_set_chat_section_settings({
            projectConfigId,
            sectionId,
            managed: nextSettings.managed,
            engineConfigId: nextSettings.engineConfigId,
            agentProfileId: nextSettings.agentProfileId,
            deepThink: nextSettings.deepThink,
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
        agentProfileId,
        deepThink,
      });
    },
    [agentProfileId, deepThink, engineConfigId, updateSettings],
  );

  const handleDeepThinkChange = useCallback(
    (value: boolean) => {
      updateSettings({
        managed,
        engineConfigId,
        agentProfileId,
        deepThink: value,
      });
    },
    [agentProfileId, engineConfigId, managed, updateSettings],
  );

  const handleLLMConfigChange = useCallback(
    (value: string | null) => {
      if (isDisabled) {
        return;
      }
      if (!selectedEngineConfig) {
        return;
      }
      if (selectedEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
        return;
      }
      const nextConfig = {
        ...selectedEngineConfig,
        settaLlmConfig: {
          ...(selectedEngineConfig.settaLlmConfig ?? {}),
          llmConfigId: value,
        },
      };
      void updateEngineConfig({ config: nextConfig });
    },
    [isDisabled, selectedEngineConfig],
  );

  const handleAgentProfileChange = useCallback(
    (value: string | null) => {
      updateSettings({
        managed,
        engineConfigId,
        agentProfileId: value,
        deepThink,
      });
    },
    [deepThink, engineConfigId, managed, updateSettings],
  );

  const handleNewChat = useCallback(() => {
    if (isDisabled || !managed) {
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
  }, [isDisabled, managed, projectConfigId, sectionId]);

  const handleEngineChange = useCallback(
    (value: string | null) => {
      const nextEngineId = value ?? null;
      updateSettings({
        managed,
        engineConfigId: nextEngineId,
        agentProfileId,
        deepThink,
      });
      if (nextEngineId !== selectedEngineId) {
        handleNewChat();
      }
    },
    [
      agentProfileId,
      deepThink,
      handleNewChat,
      managed,
      selectedEngineId,
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
            {externalStatusMessage ? (
              <p className={`text-[11px] ${externalStatusClassName}`}>
                {externalStatusMessage}
              </p>
            ) : null}
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
                  Deep Think
                </p>
                <SwitchInput
                  isDisabled={isDisabled}
                  value={deepThink}
                  onChange={handleDeepThinkChange}
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
          <div className="flex justify-end">
            <button
              type="button"
              disabled={isDisabled}
              className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              onClick={handleNewChat}
            >
              New Chat
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
