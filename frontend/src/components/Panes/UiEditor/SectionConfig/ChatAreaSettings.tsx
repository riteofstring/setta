import {
  CHAT_ENGINE_SETTA_ID,
  buildEngineGroups,
} from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
} from "components/Chat/llmConfigUtils";
import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { useCallback, useMemo } from "react";
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
import { SectionTypeEnum } from "utils/generatedTypes";

type ChatAreaSettingsProps = {
  sectionId: string;
};

type ChatSectionSettingsPayload = {
  managed: boolean;
  llmConfigId: string | null;
  agentProfileId: string | null;
  externalAgentConfigId: string | null;
  deepThink: boolean;
};

export function ChatAreaSettings({ sectionId }: ChatAreaSettingsProps) {
  useHydrateLLMState();
  useHydrateAgenticState();
  const projectConfigId = getCurrProjectConfigId();
  const { canEditParams } = useShareCapabilities();
  const isShareMode = useShareSession((x) => x.isShareMode);

  const {
    managed,
    llmConfigId,
    agentProfileId,
    externalAgentConfigId,
    deepThink,
    isFrozen,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
    return {
      managed: impl.managed,
      llmConfigId: impl.llmConfigId,
      agentProfileId: impl.agentProfileId,
      externalAgentConfigId: impl.externalAgentConfigId,
      deepThink: impl.deepThink,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);

  const { apiKeys, allLLMConfigs, agentProfiles, externalAgentConfigs } =
    useAIStore(
      (state) => ({
        apiKeys: state.apiKeys,
        allLLMConfigs: state.allLLMConfigs,
        agentProfiles: state.agentProfiles,
        externalAgentConfigs: state.externalAgentConfigs,
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
    () => buildEngineGroups(externalAgentConfigs),
    [externalAgentConfigs],
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
  const hasProfileConfig = Boolean(selectedProfile?.llmConfigId);
  const selectedEngineId = externalAgentConfigId ?? CHAT_ENGINE_SETTA_ID;
  const isExternalEngine = externalAgentConfigId !== null;

  const updateSettings = useCallback(
    (nextSettings: ChatSectionSettingsPayload) => {
      if (isDisabled) {
        return;
      }
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
            managed: nextSettings.managed,
            llmConfigId: nextSettings.llmConfigId,
            agentProfileId: nextSettings.agentProfileId,
            externalAgentConfigId: nextSettings.externalAgentConfigId,
            deepThink: nextSettings.deepThink,
          });
        },
        send: (frontendOpId) =>
          route_set_chat_section_settings({
            projectConfigId,
            sectionId,
            managed: nextSettings.managed,
            llmConfigId: nextSettings.llmConfigId,
            agentProfileId: nextSettings.agentProfileId,
            externalAgentConfigId: nextSettings.externalAgentConfigId,
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
        llmConfigId,
        agentProfileId,
        externalAgentConfigId,
        deepThink,
      });
    },
    [
      agentProfileId,
      deepThink,
      externalAgentConfigId,
      llmConfigId,
      updateSettings,
    ],
  );

  const handleDeepThinkChange = useCallback(
    (value: boolean) => {
      updateSettings({
        managed,
        llmConfigId,
        agentProfileId,
        externalAgentConfigId,
        deepThink: value,
      });
    },
    [
      agentProfileId,
      externalAgentConfigId,
      llmConfigId,
      managed,
      updateSettings,
    ],
  );

  const handleLLMConfigChange = useCallback(
    (value: string | null) => {
      updateSettings({
        managed,
        llmConfigId: value,
        agentProfileId,
        externalAgentConfigId,
        deepThink,
      });
    },
    [agentProfileId, deepThink, externalAgentConfigId, managed, updateSettings],
  );

  const handleAgentProfileChange = useCallback(
    (value: string | null) => {
      updateSettings({
        managed,
        llmConfigId,
        agentProfileId: value,
        externalAgentConfigId,
        deepThink,
      });
    },
    [deepThink, externalAgentConfigId, llmConfigId, managed, updateSettings],
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
      const nextExternalId =
        value && value !== CHAT_ENGINE_SETTA_ID ? value : null;
      updateSettings({
        managed,
        llmConfigId,
        agentProfileId,
        externalAgentConfigId: nextExternalId,
        deepThink,
      });
      if (value !== selectedEngineId) {
        handleNewChat();
      }
    },
    [
      agentProfileId,
      deepThink,
      handleNewChat,
      llmConfigId,
      managed,
      selectedEngineId,
      updateSettings,
    ],
  );

  const configPlaceholder = noConfigsAvailable
    ? "Add an LLM config or API key"
    : "Select an LLM";
  const highlightMissingConfig =
    !llmConfigId && !hasProfileConfig && !isExternalEngine;

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
                LLM config overrides the profile when set.
              </p>
            ) : null}
          </div>
          {!isExternalEngine ? (
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
                  value={llmConfigId}
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
