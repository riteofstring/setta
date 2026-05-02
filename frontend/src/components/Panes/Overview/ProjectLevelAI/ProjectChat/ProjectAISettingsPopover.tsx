import * as Menubar from "@radix-ui/react-menubar";
import { FollowAIToggleButton } from "components/AppHeader/FollowAIToggleButton";
import { getProjectDictationModeOptionLabel } from "components/Chat/dictationPolicy";
import { buildEngineGroups } from "components/Chat/engineUtils";
import { buildLLMConfigGroups } from "components/Chat/llmConfigUtils";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useCallback, useMemo } from "react";
import { IoSettingsOutline } from "react-icons/io5";
import { MdOutlineSmartToy } from "react-icons/md";
import {
  ChatDictationModeEnum,
  EngineTypeEnum,
  ProjectChatUIConfig,
  type ChatDictationMode,
} from "utils/generatedTypes";
import {
  focusInputWithoutSelectionById,
  PROJECT_AI_ENGINE_COMBOBOX_INPUT_ID,
} from "../projectChatFocusUtils";

export type ProjectAISettingsPopoverProps = {
  engineGroups: ReturnType<typeof buildEngineGroups>;
  transcriptionProfileGroups: AllItemsType<string>;
  availableConfigGroups: ReturnType<typeof buildLLMConfigGroups>;
  selectedEngineId: string | null;
  selectedLLMConfigId: string | null;
  llmSelectionUnavailableReason: string | null;
  selectedTranscriptionProfileId: string | null;
  defaultLLMConfigId: string | null;
  engineType: EngineTypeEnum | null;
  noConfigsAvailable: boolean;
  dictationMode: ChatDictationMode;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  providerDictationLikelySupported: boolean;
  providerDictationUnavailableReason: string;
  onOpenSkillsView: () => void;
  onOpenMcpView: () => void;
  onOpenSlashCommandsView: () => void;
  onOpenProjectSettingsView: () => void;
  onEngineChange: (value: string | null) => void;
  onLLMConfigChange: (value: string | null) => void;
  onTranscriptionProfileChange: (value: string | null) => void;
  onPinDefaultModel: () => void;
  onDictationModeChange: (value: ChatDictationMode) => void;
  onActivityAccordionOpenByDefaultChange: (value: boolean) => void;
  onActivityChildrenOpenByDefaultChange: (value: boolean) => void;
};

function buildProjectDictationModeOptions(
  providerModeAvailable: boolean,
): AllItemsType<ChatDictationMode> {
  return [
    {
      group: "Microphone Source",
      items: ProjectChatUIConfig.projectDictationModeOptions.map((option) => ({
        id: option.value,
        name: getProjectDictationModeOptionLabel({
          mode: option.value,
          providerModeAvailable,
        }),
      })),
    },
  ];
}

// eslint-disable-next-line complexity
function ProjectAISettingsContent({
  engineGroups,
  transcriptionProfileGroups,
  availableConfigGroups,
  selectedEngineId,
  selectedLLMConfigId,
  llmSelectionUnavailableReason,
  selectedTranscriptionProfileId,
  defaultLLMConfigId,
  engineType,
  noConfigsAvailable,
  dictationMode,
  activityAccordionOpenByDefault,
  activityChildrenOpenByDefault,
  providerDictationLikelySupported,
  providerDictationUnavailableReason,
  onOpenSkillsView,
  onOpenMcpView,
  onOpenSlashCommandsView,
  onOpenProjectSettingsView,
  onEngineChange,
  onLLMConfigChange,
  onTranscriptionProfileChange,
  onPinDefaultModel,
  onDictationModeChange,
  onActivityAccordionOpenByDefaultChange,
  onActivityChildrenOpenByDefaultChange,
}: ProjectAISettingsPopoverProps) {
  const showLLMConfig = engineType === EngineTypeEnum.setta_llm;
  const showLlmUnavailableWarning = llmSelectionUnavailableReason !== null;
  const llmPlaceholder = noConfigsAvailable
    ? "Add an LLM config or API key"
    : "Select an LLM";
  const llmBg =
    selectedLLMConfigId && !showLlmUnavailableWarning
      ? ""
      : "bg-red-500 hover:bg-red-800 hover:dark:bg-red-900 dark:bg-red-950 !placeholder-white !border-red-500";
  const providerModeAvailable = providerDictationLikelySupported;
  const autoFallsBackToBrowser =
    dictationMode === ChatDictationModeEnum.auto &&
    !providerDictationLikelySupported;
  const selectedModelPinnedAsDefault =
    selectedLLMConfigId !== null && selectedLLMConfigId === defaultLLMConfigId;
  const dictationModeOptions = useMemo(
    () => buildProjectDictationModeOptions(providerModeAvailable),
    [providerModeAvailable],
  );
  const handleDictationModeOptionChange = useCallback(
    (value: ChatDictationMode | null) => {
      if (!value) {
        return;
      }
      if (value === ChatDictationModeEnum.provider && !providerModeAvailable) {
        return;
      }
      onDictationModeChange(value);
    },
    [onDictationModeChange, providerModeAvailable],
  );
  const pinDefaultModelTooltipHandlers = useMemo(() => {
    if (selectedModelPinnedAsDefault) {
      return getFloatingBoxHandlers({
        title: "Default model",
        content: "This model is already pinned as default.",
      });
    }
    if (!selectedLLMConfigId) {
      return getFloatingBoxHandlers({
        title: "Default model",
        content: "Select a model before pinning a default.",
      });
    }
    return getFloatingBoxHandlers({
      title: "Default model",
      content: "Pin the selected model as the default for new chats.",
    });
  }, [selectedLLMConfigId, selectedModelPinnedAsDefault]);
  const openSkillsTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Skills",
        content: "Open the Skills view.",
      }),
    [],
  );
  const openMcpTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "MCP",
        content: "Open the MCP view.",
      }),
    [],
  );
  const openSlashCommandsTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Slash Commands",
        content: "Open the Slash Commands view.",
      }),
    [],
  );
  const openProjectSettingsViewTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Project AI Settings",
        content: "Open the Project AI Settings pane.",
      }),
    [],
  );

  return (
    <div className="flex flex-col gap-2 [&_button:disabled]:cursor-not-allowed [&_button]:cursor-pointer">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-setta-400 dark:text-setta-500">
        Project AI
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
            Engine
          </span>
          <IdNameCombobox
            allItems={engineGroups}
            value={selectedEngineId}
            small={false}
            onSelectedItemChange={onEngineChange}
            placeholder="Select an engine"
            outerDivClasses="w-full"
            inputDivId={PROJECT_AI_ENGINE_COMBOBOX_INPUT_ID}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
            Transcription Profile
          </span>
          <IdNameCombobox
            allItems={transcriptionProfileGroups}
            value={selectedTranscriptionProfileId}
            small={false}
            onSelectedItemChange={onTranscriptionProfileChange}
            placeholder="Select a transcription profile"
            outerDivClasses="w-full"
            selectedItemCanBeNull
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
            Microphone Source
          </span>
          <IdNameCombobox
            allItems={dictationModeOptions}
            value={dictationMode}
            small={false}
            onSelectedItemChange={handleDictationModeOptionChange}
            placeholder="Microphone source"
            outerDivClasses="w-full"
            inputDivId="project-ai-microphone-source"
          />
          <p className="text-[10px] text-setta-500 dark:text-setta-400">
            Provider mode uses the selected transcription profile.
          </p>
          {!providerModeAvailable ? (
            <p className="text-[10px] text-amber-700 dark:text-amber-300">
              {providerDictationUnavailableReason}
            </p>
          ) : null}
          {autoFallsBackToBrowser ? (
            <p className="text-[10px] text-amber-700 dark:text-amber-300">
              Auto currently prefers browser/OS because provider dictation is
              unavailable.
            </p>
          ) : null}
        </div>
        {showLLMConfig ? (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
              LLM Config
            </span>
            <IdNameCombobox
              allItems={availableConfigGroups}
              value={selectedLLMConfigId}
              small={false}
              onSelectedItemChange={onLLMConfigChange}
              placeholder={llmPlaceholder}
              // TODO: should not use bg for all this. really should restructure IdNameCombobox to be more flexible.
              bg={llmBg}
              outerDivClasses="w-full"
            />
            {showLlmUnavailableWarning ? (
              <p className="text-[10px] text-red-600 dark:text-red-300">
                {llmSelectionUnavailableReason}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onPinDefaultModel}
              disabled={!selectedLLMConfigId || selectedModelPinnedAsDefault}
              className="h-8 w-full rounded-md border border-setta-200 bg-white px-2 text-left text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
              {...pinDefaultModelTooltipHandlers}
            >
              {selectedModelPinnedAsDefault
                ? "Selected model is pinned as default"
                : "Pin selected model as default"}
            </button>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
            Tools
          </span>
          <div className="grid w-full min-w-0 grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenSkillsView}
              data-testid="project-chat-settings-open-skills"
              className="box-border h-8 w-full min-w-0 rounded-md border border-setta-200 bg-white px-2 text-center text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
              {...openSkillsTooltipHandlers}
            >
              Skills
            </button>
            <button
              type="button"
              onClick={onOpenMcpView}
              data-testid="project-chat-settings-open-mcp"
              className="box-border h-8 w-full min-w-0 rounded-md border border-setta-200 bg-white px-2 text-center text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
              {...openMcpTooltipHandlers}
            >
              MCP
            </button>
            <button
              type="button"
              onClick={onOpenSlashCommandsView}
              data-testid="project-chat-settings-open-slash-commands"
              className="box-border h-8 w-full min-w-0 rounded-md border border-setta-200 bg-white px-2 text-center text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
              {...openSlashCommandsTooltipHandlers}
            >
              Slash Commands
            </button>
            <button
              type="button"
              onClick={onOpenProjectSettingsView}
              data-testid="project-chat-settings-open-project-settings"
              className="box-border inline-flex h-8 w-full min-w-0 items-center justify-center gap-1 rounded-md border border-setta-200 bg-white px-2 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
              {...openProjectSettingsViewTooltipHandlers}
            >
              <MdOutlineSmartToy size={14} aria-hidden />
              <span>AI Settings</span>
            </button>
            <Menubar.Root className="w-full min-w-0">
              <FollowAIToggleButton
                labelMode="always"
                triggerClassName="nodrag relative inline-flex box-border h-8 w-full min-w-0 select-none items-center justify-center gap-1 rounded-md border border-setta-200 bg-white px-2 text-[11px] font-semibold transition-colors hover:bg-setta-50 focus-visible:ring-2 dark:border-setta-700 dark:bg-setta-900 dark:hover:bg-setta-800/70"
              />
            </Menubar.Root>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
            Activity
          </span>
          <label
            data-testid="project-chat-settings-activity-accordion-default"
            className="flex w-full items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-[11px] text-setta-600 dark:bg-setta-900 dark:text-setta-200"
          >
            <span>Open activity accordions by default</span>
            <SwitchInput
              value={activityAccordionOpenByDefault}
              onChange={onActivityAccordionOpenByDefaultChange}
            />
          </label>
          <label
            data-testid="project-chat-settings-activity-children-default"
            className="flex w-full items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-[11px] text-setta-600 dark:bg-setta-900 dark:text-setta-200"
          >
            <span>Open child accordions by default</span>
            <SwitchInput
              value={activityChildrenOpenByDefault}
              onChange={onActivityChildrenOpenByDefaultChange}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

export function ProjectAISettingsPopover(props: ProjectAISettingsPopoverProps) {
  const handleSettingsPopoverOpenAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    requestAnimationFrame(() => {
      focusInputWithoutSelectionById(PROJECT_AI_ENGINE_COMBOBOX_INPUT_ID);
    });
  }, []);
  const settingsTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Project AI settings",
        content: "Configure engine, model, microphone source, and tools.",
      }),
    [],
  );

  return (
    <StandardPopover
      trigger={
        <button
          className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
          aria-label="Project AI Settings"
          type="button"
          {...settingsTooltipHandlers}
        >
          <IoSettingsOutline size={15} />
          <span className="hidden @[46rem]:block">Settings</span>
        </button>
      }
      contentClasses="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-setta-200/80 bg-white/95 p-3 shadow-xl backdrop-blur relative overflow-visible dark:border-setta-700/70 dark:bg-setta-900/95 data-[state=open]:animate-fade-in"
      arrowClasses="fill-white/95 stroke-[1px] stroke-setta-200/80 dark:fill-setta-900/95 dark:stroke-setta-700/70"
      contentProps={{ onOpenAutoFocus: handleSettingsPopoverOpenAutoFocus }}
    >
      <ProjectAISettingsContent {...props} />
    </StandardPopover>
  );
}
