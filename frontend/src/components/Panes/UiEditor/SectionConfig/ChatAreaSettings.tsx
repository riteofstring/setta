import {
  buildLLMConfigGroups,
  countLLMConfigs,
} from "components/Chat/llmConfigUtils";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { useCallback, useMemo } from "react";
import { setChatSectionChatIdLocal } from "state/actions/ai";
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
  deepThink: boolean;
};

export function ChatAreaSettings({ sectionId }: ChatAreaSettingsProps) {
  useHydrateLLMState();
  const projectConfigId = getCurrProjectConfigId();
  const { canEditParams } = useShareCapabilities();
  const isShareMode = useShareSession((x) => x.isShareMode);

  const { managed, llmConfigId, deepThink, isFrozen } = useProjectState(
    (state) => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Chat,
      );
      return {
        managed: impl.managed,
        llmConfigId: impl.llmConfigId,
        deepThink: impl.deepThink,
        isFrozen: impl.isFrozen,
      };
    },
    _.isEqual,
  );

  const { apiKeys, allLLMConfigs } = useAIStore(
    (state) => ({
      apiKeys: state.apiKeys,
      allLLMConfigs: state.allLLMConfigs,
    }),
    _.isEqual,
  );

  const availableConfigGroups = useMemo(
    () => buildLLMConfigGroups(allLLMConfigs, apiKeys),
    [allLLMConfigs, apiKeys],
  );
  const noConfigsAvailable = countLLMConfigs(availableConfigGroups) === 0;
  const canEditSettings = !isShareMode || canEditParams;
  const isDisabled = isFrozen || !canEditSettings;

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
            deepThink: nextSettings.deepThink,
          });
        },
        send: (frontendOpId) =>
          route_set_chat_section_settings({
            projectConfigId,
            sectionId,
            managed: nextSettings.managed,
            llmConfigId: nextSettings.llmConfigId,
            deepThink: nextSettings.deepThink,
            frontendOpId,
          }),
      });
    },
    [isDisabled, projectConfigId, sectionId],
  );

  const handleManagedChange = useCallback(
    (value: boolean) => {
      updateSettings({ managed: value, llmConfigId, deepThink });
    },
    [deepThink, llmConfigId, updateSettings],
  );

  const handleDeepThinkChange = useCallback(
    (value: boolean) => {
      updateSettings({ managed, llmConfigId, deepThink: value });
    },
    [llmConfigId, managed, updateSettings],
  );

  const handleLLMConfigChange = useCallback(
    (value: string | null) => {
      updateSettings({ managed, llmConfigId: value, deepThink });
    },
    [deepThink, managed, updateSettings],
  );

  const handleNewChat = useCallback(async () => {
    if (isDisabled || !managed) {
      return;
    }
    setChatSectionChatIdLocal(sectionId, undefined);
    await route_set_chat_section_chat_id({
      projectConfigId,
      sectionId,
      chatId: null,
    });
  }, [
    isDisabled,
    managed,
    projectConfigId,
    sectionId,
    setChatSectionChatIdLocal,
  ]);

  const configPlaceholder = noConfigsAvailable
    ? "Add an LLM config or API key"
    : "Select an LLM";

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
              bg={`${!llmConfigId ? "bg-red-500 hover:bg-red-800 hover:dark:bg-red-900 dark:bg-red-950 !placeholder-white !border-red-500" : ""}`}
              outerDivClasses="justify-center"
              isDisabled={isDisabled}
            />
          </div>
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
