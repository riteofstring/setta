import { buildCustomPromptSlashCommandDefinitions } from "components/Chat/chatComposerControls";

import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";

import { type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import { FiPlus, FiRefreshCw } from "react-icons/fi";

import { type AppGenerationMode } from "state/types/appGenerationMode";

import { type AgentNativeSlashCommandsEntry } from "../projectChatSkillsMcpViewerUtils";

import {
  CodeMirrorExtensions,
  CodeMirrorTheme,
  CustomSlashCommandModeItem,
  SkillContentLoadStatus,
  SkillGroup,
  SkillMarkdownViewMode,
  SkillStatusBySkillId,
  SlashCommandsByEngineEntry,
  getCustomSlashCommandModeLabel,
  isActionablePath,
  resolveAgentNativeSlashCommandsMessage,
  resolveCustomSkillsRootDescription,
} from "./skillState";

import {
  SkillGroupsPanel,
  SkillMarkdownViewerPanel,
} from "./skillMarkdownAndMcpPanels";

type SkillsSectionProps = {
  beginSkillsListResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  canCreateCustomSkillButton: boolean;
  canSaveSelectedSkill: boolean;
  codeMirrorTheme: CodeMirrorTheme;
  customSkillCreateRootActionable: boolean;
  customSkillCreateRootPath: string | null;
  editableMarkdownViewerExtensions: CodeMirrorExtensions;
  groupedSkills: SkillGroup[];
  isRawMarkdownView: boolean;
  isSkillMarkdownViewerOpen: boolean;
  newCustomSkillRelativePath: string;
  onCopyPath: (path: string | null) => void;
  onCreateCustomSkill: () => void;
  onRefreshSkills: () => void;
  onRevealPath: (path: string | null) => void;
  onRevealCustomSkillRoot: () => void;
  onSelectSkill: (skillId: string) => void;
  onSetSkillMarkdownViewerOpen: (isOpen: boolean) => void;
  onSelectSkillMarkdownViewMode: (mode: SkillMarkdownViewMode) => void;
  onSetNewCustomSkillRelativePath: (value: string) => void;
  onSkillFilterChange: (value: string) => void;
  onSkillMarkdownDraftChange: (value: string) => void;
  onResetSkillsListHeight: () => void;
  onSaveSelectedCustomSkill: () => void;
  rawMarkdownModeHint: string;
  readonlyMarkdownViewerExtensions: CodeMirrorExtensions;
  renderedSkillPreviewContent: string;
  saveSelectedSkillButtonTitle: string;
  selectedSkillId: string | null;
  showSkillsLoadingState: boolean;
  skillContentLoadError: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
  skillFilter: string;
  skillMarkdownEditable: boolean;
  skillMarkdownRawDraft: string | null;
  skillPreviewContent: string;
  skillPreviewTruncationNotice: string | null;
  skillStatusBySkillId: SkillStatusBySkillId;
  skillsError: string | null;
  skillsListHeightPct: number;
  skillsLoading: boolean;
  skillsSectionRef: RefObject<HTMLDivElement | null>;
};

export function SkillsSection({
  beginSkillsListResize,
  canCreateCustomSkillButton,
  canSaveSelectedSkill,
  codeMirrorTheme,
  customSkillCreateRootActionable,
  customSkillCreateRootPath,
  editableMarkdownViewerExtensions,
  groupedSkills,
  isRawMarkdownView,
  isSkillMarkdownViewerOpen,
  newCustomSkillRelativePath,
  onCopyPath,
  onCreateCustomSkill,
  onRefreshSkills,
  onRevealPath,
  onRevealCustomSkillRoot,
  onSelectSkill,
  onSetSkillMarkdownViewerOpen,
  onSelectSkillMarkdownViewMode,
  onSetNewCustomSkillRelativePath,
  onSkillFilterChange,
  onSkillMarkdownDraftChange,
  onResetSkillsListHeight,
  onSaveSelectedCustomSkill,
  rawMarkdownModeHint,
  readonlyMarkdownViewerExtensions,
  renderedSkillPreviewContent,
  saveSelectedSkillButtonTitle,
  selectedSkillId,
  showSkillsLoadingState,
  skillContentLoadError,
  skillContentLoadStatus,
  skillFilter,
  skillMarkdownEditable,
  skillMarkdownRawDraft,
  skillPreviewContent,
  skillPreviewTruncationNotice,
  skillStatusBySkillId,
  skillsError,
  skillsListHeightPct,
  skillsLoading,
  skillsSectionRef,
}: SkillsSectionProps) {
  const customSkillsRootDescription = resolveCustomSkillsRootDescription({
    customSkillCreateRootActionable,
    customSkillCreateRootPath,
    skillsLoading,
  });
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      data-testid="project-chat-skills-content"
    >
      <div className="grid gap-2">
        <search className="relative flex min-w-0 items-center gap-1">
          <div className="absolute left-0 grid select-none place-items-center pl-1">
            <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
          </div>
          <input
            aria-label="Filter skills"
            className="min-w-0 flex-grow cursor-text truncate rounded bg-setta-100/70 py-1 pl-5 text-sm text-setta-700 placeholder-setta-400 outline-0 focus-visible:ring-1 focus-visible:ring-blue-300 dark:bg-setta-900/80 dark:text-setta-200 dark:placeholder-setta-700 dark:focus-visible:ring-blue-500"
            onChange={(event) => onSkillFilterChange(event.target.value)}
            placeholder="Filter"
            value={skillFilter}
          />
          <button
            aria-label="Refresh"
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
            data-testid="project-chat-skills-refresh"
            disabled={skillsLoading}
            onClick={onRefreshSkills}
            title="Refresh skills"
            type="button"
          >
            <FiRefreshCw
              className={`h-3.5 w-3.5 ${skillsLoading ? "animate-spin" : ""}`}
            />
          </button>
        </search>
        <div className="flex min-w-0 items-center gap-1">
          <input
            aria-label="New custom skill name"
            className="min-w-0 flex-1 cursor-text truncate rounded bg-setta-100/70 px-2 py-1 text-xs text-setta-700 placeholder-setta-400 outline-0 focus-visible:ring-1 focus-visible:ring-blue-300 dark:bg-setta-900/80 dark:text-setta-200 dark:placeholder-setta-700 dark:focus-visible:ring-blue-500"
            data-testid="project-chat-custom-skill-relative-path-input"
            onChange={(event) =>
              onSetNewCustomSkillRelativePath(event.target.value)
            }
            placeholder="new-custom-skill"
            value={newCustomSkillRelativePath}
          />
          <button
            aria-label="Create custom skill"
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
            data-testid="project-chat-custom-skill-create"
            disabled={!canCreateCustomSkillButton}
            onClick={onCreateCustomSkill}
            title="Create custom skill"
            type="button"
          >
            <FiPlus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2 px-1 text-[10px] text-setta-500 dark:text-setta-400">
          <span
            className="truncate"
            data-testid="project-chat-custom-skill-root-path"
            title={
              customSkillCreateRootPath ??
              "Custom skill create root unavailable."
            }
          >
            {customSkillsRootDescription}
          </span>
          <button
            className="shrink-0 rounded px-1 py-0.5 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-setta-800 dark:hover:text-setta-200"
            data-testid="project-chat-custom-skill-root-reveal"
            disabled={
              !customSkillCreateRootActionable ||
              !isActionablePath(customSkillCreateRootPath)
            }
            onClick={onRevealCustomSkillRoot}
            type="button"
          >
            Open
          </button>
        </div>
      </div>
      <SkillGroupsPanel
        beginSkillsListResize={beginSkillsListResize}
        groupedSkills={groupedSkills}
        isSkillMarkdownViewerOpen={isSkillMarkdownViewerOpen}
        onCopyPath={onCopyPath}
        onRevealPath={onRevealPath}
        onResetSkillsListHeight={onResetSkillsListHeight}
        onSelectSkill={onSelectSkill}
        selectedSkillId={selectedSkillId}
        showSkillsLoadingState={showSkillsLoadingState}
        skillStatusBySkillId={skillStatusBySkillId}
        skillsError={skillsError}
        skillsListHeightPct={skillsListHeightPct}
        skillsSectionRef={skillsSectionRef}
      />
      <SkillMarkdownViewerPanel
        canSaveSelectedSkill={canSaveSelectedSkill}
        codeMirrorTheme={codeMirrorTheme}
        editableMarkdownViewerExtensions={editableMarkdownViewerExtensions}
        isOpen={isSkillMarkdownViewerOpen}
        isRawMarkdownView={isRawMarkdownView}
        onSaveSelectedCustomSkill={onSaveSelectedCustomSkill}
        onSetSkillMarkdownViewerOpen={onSetSkillMarkdownViewerOpen}
        onSelectSkillMarkdownViewMode={onSelectSkillMarkdownViewMode}
        onSkillMarkdownDraftChange={onSkillMarkdownDraftChange}
        rawMarkdownModeHint={rawMarkdownModeHint}
        readonlyMarkdownViewerExtensions={readonlyMarkdownViewerExtensions}
        renderedSkillPreviewContent={renderedSkillPreviewContent}
        saveSelectedSkillButtonTitle={saveSelectedSkillButtonTitle}
        skillContentLoadError={skillContentLoadError}
        skillContentLoadStatus={skillContentLoadStatus}
        skillMarkdownEditable={skillMarkdownEditable}
        skillMarkdownRawDraft={skillMarkdownRawDraft}
        skillPreviewContent={skillPreviewContent}
        skillPreviewTruncationNotice={skillPreviewTruncationNotice}
      />
    </section>
  );
}

type CustomSlashCommandsPanelProps = {
  addCustomProjectChatSlashCommand: () => void;
  canAddCustomSlashCommand: boolean;
  conflictingCustomSlashCommandTokens: Set<string>;
  customSlashCommandModeItems: CustomSlashCommandModeItem[];
  customSlashCommandDefinitions: ReturnType<
    typeof buildCustomPromptSlashCommandDefinitions
  >;
  customSlashNamespaceAuthorityReady: boolean;
  defaultCustomSlashCommandMode: string;
  newCustomSlashAppGenerationMode: AppGenerationMode | null;
  newCustomSlashCommand: string;
  newCustomSlashPrompt: string;
  onRemoveCustomProjectChatSlashCommand: (commandToken: string) => void;
  onSetNewCustomSlashAppGenerationMode: (mode: string | null) => void;
  onSetNewCustomSlashCommand: (value: string) => void;
  onSetNewCustomSlashPrompt: (value: string) => void;
};

function CustomSlashCommandsPanel({
  addCustomProjectChatSlashCommand,
  canAddCustomSlashCommand,
  conflictingCustomSlashCommandTokens,
  customSlashCommandModeItems,
  customSlashCommandDefinitions,
  customSlashNamespaceAuthorityReady,
  defaultCustomSlashCommandMode,
  newCustomSlashAppGenerationMode,
  newCustomSlashCommand,
  newCustomSlashPrompt,
  onRemoveCustomProjectChatSlashCommand,
  onSetNewCustomSlashAppGenerationMode,
  onSetNewCustomSlashCommand,
  onSetNewCustomSlashPrompt,
}: CustomSlashCommandsPanelProps) {
  return (
    <div className="grid min-w-0 gap-2 rounded bg-setta-50/60 p-2 dark:bg-setta-950/40">
      <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        Custom Commands
      </div>
      <div className="grid min-w-0 gap-2 px-1">
        <input
          type="text"
          value={newCustomSlashCommand}
          onChange={(event) => onSetNewCustomSlashCommand(event.target.value)}
          placeholder="/my-command"
          className="w-full rounded border border-setta-300 bg-transparent px-2 py-1 text-[11px] text-setta-700 outline-none transition-colors focus:border-blue-500 dark:border-setta-700 dark:text-setta-100 dark:focus:border-blue-400"
          data-testid="project-chat-custom-slash-command-input"
        />
        <IdNameCombobox
          allItems={[
            {
              groupName: "Submission mode",
              items: customSlashCommandModeItems.map((item) => ({
                id: item.id,
                name: item.name,
              })),
            },
          ]}
          value={
            newCustomSlashAppGenerationMode ?? defaultCustomSlashCommandMode
          }
          small={false}
          onSelectedItemChange={onSetNewCustomSlashAppGenerationMode}
          placeholder="Select a submission mode"
          outerDivClasses="w-full"
          inputDivId="project-chat-custom-slash-mode-input"
        />
        <textarea
          value={newCustomSlashPrompt}
          onChange={(event) => onSetNewCustomSlashPrompt(event.target.value)}
          placeholder="Prompt text to send when this command runs."
          className="min-h-20 w-full resize-y rounded border border-setta-300 bg-transparent px-2 py-1 text-[11px] text-setta-700 outline-none transition-colors focus:border-blue-500 dark:border-setta-700 dark:text-setta-100 dark:focus:border-blue-400"
          data-testid="project-chat-custom-slash-prompt-input"
        />
        <button
          type="button"
          className="inline-flex w-fit cursor-pointer items-center rounded border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:border-setta-500 hover:text-setta-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
          data-testid="project-chat-custom-slash-add"
          onClick={addCustomProjectChatSlashCommand}
          disabled={!canAddCustomSlashCommand}
        >
          Add slash command
        </button>
        <div className="text-[10px] text-setta-500 dark:text-setta-400">
          {customSlashNamespaceAuthorityReady
            ? "Command names must be unique and cannot collide with built-in or discovered agent-native commands."
            : "Command names stay disabled until native command authority is loaded for this project."}
        </div>
      </div>
      {customSlashCommandDefinitions.length > 0 ? (
        <div className="grid min-w-0 gap-1">
          {customSlashCommandDefinitions.map((command) => {
            const hasCollision = conflictingCustomSlashCommandTokens.has(
              command.command,
            );
            const modeLabel = getCustomSlashCommandModeLabel(
              command.appGenerationMode ?? null,
              customSlashCommandModeItems,
              defaultCustomSlashCommandMode,
            );
            return (
              <div
                key={command.command}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded px-1 py-1 hover:bg-setta-100 dark:hover:bg-setta-800"
              >
                <div className="min-w-0">
                  <div
                    className="truncate font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300"
                    data-testid="project-chat-custom-slash-command"
                  >
                    {command.command}
                  </div>
                  <div className="min-w-0 break-words text-[10px] text-setta-600 dark:text-setta-300">
                    {command.promptTemplate}
                  </div>
                  {modeLabel ? (
                    <div className="mt-0.5 text-[10px] text-setta-500 dark:text-setta-400">
                      Submits as {modeLabel}.
                    </div>
                  ) : null}
                  {hasCollision ? (
                    <div
                      className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300"
                      data-testid="project-chat-custom-slash-command-conflict"
                    >
                      Disabled due to command collision.
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="inline-flex h-6 cursor-pointer items-center rounded border border-setta-300 px-2 text-[10px] font-semibold text-setta-600 transition-colors hover:border-setta-500 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
                  data-testid="project-chat-custom-slash-remove"
                  onClick={() =>
                    onRemoveCustomProjectChatSlashCommand(command.command)
                  }
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-1 text-[10px] text-setta-500 dark:text-setta-400">
          No custom slash commands yet.
        </div>
      )}
    </div>
  );
}

type SlashEngineCommandsPanelProps = {
  engineConfigsInitialLoadComplete: boolean;
  onSelectSlashEngine: (engineId: string) => void;
  selectedAgentNativeSlashCommands: string[];
  selectedAgentNativeSlashStatus: AgentNativeSlashCommandsEntry;
  selectedSlashEngine: SlashCommandsByEngineEntry | null;
  slashCommandsByEngine: SlashCommandsByEngineEntry[];
};

function SlashEngineCommandsPanel({
  engineConfigsInitialLoadComplete,
  onSelectSlashEngine,
  selectedAgentNativeSlashCommands,
  selectedAgentNativeSlashStatus,
  selectedSlashEngine,
  slashCommandsByEngine,
}: SlashEngineCommandsPanelProps) {
  if (!engineConfigsInitialLoadComplete) {
    return (
      <div className="p-1 text-[11px] text-setta-500 dark:text-setta-400">
        Loading engine commands...
      </div>
    );
  }
  if (slashCommandsByEngine.length === 0) {
    return (
      <div className="rounded bg-setta-100/70 px-2 py-1 text-[10px] text-setta-600 dark:bg-setta-900/80 dark:text-setta-300">
        No engines configured.
      </div>
    );
  }
  return (
    <>
      <div className="flex min-w-0 gap-1 overflow-x-auto">
        {slashCommandsByEngine.map((engine) => {
          const selected = selectedSlashEngine?.engineId === engine.engineId;
          return (
            <button
              key={engine.engineId}
              type="button"
              data-testid="skills-mcp-slash-tab"
              className={`box-border min-w-0 cursor-pointer rounded px-2 py-1 text-left transition-colors ${
                selected
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/35 dark:text-blue-300"
                  : "text-setta-600 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800"
              }`}
              title={engine.engineName}
              onClick={() => onSelectSlashEngine(engine.engineId)}
            >
              <span className="block truncate font-semibold">
                {engine.engineName}
              </span>
              <span className="block truncate text-[10px] uppercase tracking-wide opacity-80">
                {engine.engineType === "external_agent"
                  ? "External Agent"
                  : "Setta LLM"}
              </span>
            </button>
          );
        })}
      </div>
      <div
        className="min-h-0 min-w-0 flex-1 overflow-auto p-1 text-[11px]"
        data-testid="skills-mcp-slash-list-pane"
      >
        <div className="grid min-w-0 gap-3">
          <div className="grid min-w-0 gap-1">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Setta Chat Commands
            </div>
            {selectedSlashEngine?.commands.map((command) => (
              <div
                key={`${selectedSlashEngine.engineId}:${command.command}`}
                className="min-w-0 rounded px-1 py-1 hover:bg-setta-100 dark:hover:bg-setta-800"
              >
                <div
                  className="font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300"
                  data-testid="skills-mcp-slash-command"
                >
                  {command.command}
                </div>
                <div className="min-w-0 text-setta-600 dark:text-setta-300">
                  {command.summary}
                </div>
              </div>
            ))}
          </div>
          {selectedSlashEngine?.engineType === "external_agent" ? (
            <div className="grid min-w-0 gap-2">
              <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
                Agent-Native Commands
              </div>
              {selectedAgentNativeSlashCommands.length > 0 ? (
                <div className="grid min-w-0 gap-1">
                  {selectedAgentNativeSlashCommands.map((command) => (
                    <div
                      key={`${selectedSlashEngine.engineId}:agent:${command}`}
                      className="min-w-0 rounded px-1 py-1 hover:bg-setta-100 dark:hover:bg-setta-800"
                      data-testid="skills-mcp-agent-slash-command"
                    >
                      <div className="truncate font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                        {command}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded bg-setta-100/70 px-2 py-1 text-[10px] text-setta-600 dark:bg-setta-900/80 dark:text-setta-300">
                  {resolveAgentNativeSlashCommandsMessage(
                    selectedAgentNativeSlashStatus,
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded bg-setta-100/70 px-2 py-1 text-[10px] text-setta-600 dark:bg-setta-900/80 dark:text-setta-300">
              Agent-native slash commands apply to external agents. Select an
              external engine tab to view discovered metadata.
            </div>
          )}
        </div>
      </div>
      <div className="text-[10px] text-setta-500 dark:text-setta-400">
        Setta command availability is defined by this app. Native agent command
        lists are sourced from current external-agent run metadata.
      </div>
    </>
  );
}

type SlashCommandsSectionProps = {
  addCustomProjectChatSlashCommand: () => void;
  canAddCustomSlashCommand: boolean;
  conflictingCustomSlashCommandTokens: Set<string>;
  customSlashCommandModeItems: CustomSlashCommandModeItem[];
  customSlashCommandDefinitions: ReturnType<
    typeof buildCustomPromptSlashCommandDefinitions
  >;
  customSlashNamespaceAuthorityReady: boolean;
  defaultCustomSlashCommandMode: string;
  engineConfigsInitialLoadComplete: boolean;
  newCustomSlashAppGenerationMode: AppGenerationMode | null;
  newCustomSlashCommand: string;
  newCustomSlashPrompt: string;
  onRemoveCustomProjectChatSlashCommand: (commandToken: string) => void;
  onSelectSlashEngine: (engineId: string) => void;
  onSetNewCustomSlashAppGenerationMode: (mode: string | null) => void;
  onSetNewCustomSlashCommand: (value: string) => void;
  onSetNewCustomSlashPrompt: (value: string) => void;
  selectedAgentNativeSlashCommands: string[];
  selectedAgentNativeSlashStatus: AgentNativeSlashCommandsEntry;
  selectedSlashEngine: SlashCommandsByEngineEntry | null;
  slashCommandsByEngine: SlashCommandsByEngineEntry[];
};

export function SlashCommandsSection({
  addCustomProjectChatSlashCommand,
  canAddCustomSlashCommand,
  conflictingCustomSlashCommandTokens,
  customSlashCommandModeItems,
  customSlashCommandDefinitions,
  customSlashNamespaceAuthorityReady,
  defaultCustomSlashCommandMode,
  engineConfigsInitialLoadComplete,
  newCustomSlashAppGenerationMode,
  newCustomSlashCommand,
  newCustomSlashPrompt,
  onRemoveCustomProjectChatSlashCommand,
  onSelectSlashEngine,
  onSetNewCustomSlashAppGenerationMode,
  onSetNewCustomSlashCommand,
  onSetNewCustomSlashPrompt,
  selectedAgentNativeSlashCommands,
  selectedAgentNativeSlashStatus,
  selectedSlashEngine,
  slashCommandsByEngine,
}: SlashCommandsSectionProps) {
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      data-testid="skills-mcp-slash-commands-content"
    >
      <CustomSlashCommandsPanel
        addCustomProjectChatSlashCommand={addCustomProjectChatSlashCommand}
        canAddCustomSlashCommand={canAddCustomSlashCommand}
        conflictingCustomSlashCommandTokens={
          conflictingCustomSlashCommandTokens
        }
        customSlashCommandModeItems={customSlashCommandModeItems}
        customSlashCommandDefinitions={customSlashCommandDefinitions}
        customSlashNamespaceAuthorityReady={customSlashNamespaceAuthorityReady}
        defaultCustomSlashCommandMode={defaultCustomSlashCommandMode}
        newCustomSlashAppGenerationMode={newCustomSlashAppGenerationMode}
        newCustomSlashCommand={newCustomSlashCommand}
        newCustomSlashPrompt={newCustomSlashPrompt}
        onRemoveCustomProjectChatSlashCommand={
          onRemoveCustomProjectChatSlashCommand
        }
        onSetNewCustomSlashAppGenerationMode={
          onSetNewCustomSlashAppGenerationMode
        }
        onSetNewCustomSlashCommand={onSetNewCustomSlashCommand}
        onSetNewCustomSlashPrompt={onSetNewCustomSlashPrompt}
      />
      <SlashEngineCommandsPanel
        engineConfigsInitialLoadComplete={engineConfigsInitialLoadComplete}
        onSelectSlashEngine={onSelectSlashEngine}
        selectedAgentNativeSlashCommands={selectedAgentNativeSlashCommands}
        selectedAgentNativeSlashStatus={selectedAgentNativeSlashStatus}
        selectedSlashEngine={selectedSlashEngine}
        slashCommandsByEngine={slashCommandsByEngine}
      />
    </section>
  );
}
