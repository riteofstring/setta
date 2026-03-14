import { DICTATION_MODE_ITEMS } from "components/Chat/dictationMode";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { EngineTypeEnum } from "utils/generatedTypes";
import type { ChatAreaManagedSettingsViewModel } from "./chatAreaManagedSettingsState";

type ChatAreaManagedSettingsPanelProps = {
  agentProfileId: string | null;
  canManageManagedChatThreads: boolean;
  dictationMode: string | null;
  managed: boolean;
  sectionChatWindowMode: string;
  thinking: boolean;
  transcriptionProfileId: string | null;
  viewModel: ChatAreaManagedSettingsViewModel;
  onAgentProfileChange: (value: string | null) => void;
  onChatModeChange: (value: string | null) => void;
  onDictationModeChange: (value: string | null) => void;
  onEngineChange: (value: string | null) => void;
  onLLMConfigChange: (value: string | null) => void;
  onManagedChange: (value: boolean) => void;
  onNewChat: () => void;
  onThinkingChange: (value: boolean) => void;
  onTranscriptionProfileChange: (value: string | null) => void;
};

export function ChatAreaManagedSettingsPanel({
  agentProfileId,
  canManageManagedChatThreads,
  dictationMode,
  managed,
  sectionChatWindowMode,
  thinking,
  transcriptionProfileId,
  viewModel,
  onAgentProfileChange,
  onChatModeChange,
  onDictationModeChange,
  onEngineChange,
  onLLMConfigChange,
  onManagedChange,
  onNewChat,
  onThinkingChange,
  onTranscriptionProfileChange,
}: ChatAreaManagedSettingsPanelProps) {
  return (
    <>
      <div
        className="flex w-full flex-col gap-2"
        data-testid="chat-area-settings-chat-mode"
      >
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Chat Mode
        </p>
        <IdNameCombobox
          allItems={viewModel.modeItems}
          value={sectionChatWindowMode}
          small={false}
          onSelectedItemChange={onChatModeChange}
          placeholder="Select chat mode"
          outerDivClasses="justify-center"
          isDisabled={viewModel.isChatModeControlDisabled}
        />
      </div>

      <div className="flex w-full items-center justify-between gap-4">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Managed Mode
        </p>
        <SwitchInput
          isDisabled={viewModel.isDisabled}
          value={managed}
          onChange={onManagedChange}
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
              allItems={viewModel.engineGroups}
              value={viewModel.selectedEngineId}
              small={false}
              onSelectedItemChange={onEngineChange}
              placeholder="Select an engine"
              outerDivClasses="justify-center"
              isDisabled={viewModel.isDisabled}
            />
          </div>
          <div className="flex w-full flex-col gap-2">
            <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
              Agent Profile
            </p>
            <IdNameCombobox
              allItems={viewModel.agentProfileGroups}
              value={agentProfileId}
              small={false}
              onSelectedItemChange={onAgentProfileChange}
              placeholder="Select a profile (optional)"
              outerDivClasses="justify-center"
              isDisabled={viewModel.isDisabled}
              selectedItemCanBeNull
            />
            {viewModel.showAgentProfileOverrideHint ? (
              <p className="text-[11px] text-setta-500 dark:text-setta-400">
                Engine config overrides the profile when set.
              </p>
            ) : null}
          </div>
          {viewModel.engineType === EngineTypeEnum.setta_llm ? (
            <>
              <div className="flex w-full items-center justify-between gap-4">
                <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
                  Thinking
                </p>
                <SwitchInput
                  isDisabled={viewModel.isDisabled}
                  value={thinking}
                  onChange={onThinkingChange}
                  outerDivClassName="flex items-center"
                />
              </div>
              <div className="flex w-full flex-col gap-2">
                <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
                  LLM Config
                </p>
                <IdNameCombobox
                  allItems={viewModel.availableConfigGroups}
                  value={viewModel.selectedLLMConfigId}
                  small={false}
                  onSelectedItemChange={onLLMConfigChange}
                  placeholder={viewModel.configPlaceholder}
                  bg={
                    viewModel.highlightMissingConfig
                      ? "bg-red-500 hover:bg-red-800 hover:dark:bg-red-900 dark:bg-red-950 !placeholder-white !border-red-500"
                      : ""
                  }
                  outerDivClasses="justify-center"
                  isDisabled={viewModel.isDisabled}
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
              allItems={viewModel.transcriptionProfileGroups}
              value={transcriptionProfileId}
              small={false}
              onSelectedItemChange={onTranscriptionProfileChange}
              placeholder="Select a transcription profile"
              outerDivClasses="justify-center"
              isDisabled={viewModel.isDisabled}
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
              onSelectedItemChange={onDictationModeChange}
              placeholder="Select dictation mode"
              outerDivClasses="justify-center"
              isDisabled={viewModel.isDisabled}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={viewModel.isDisabled || !canManageManagedChatThreads}
              className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              onClick={onNewChat}
            >
              New Chat
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
