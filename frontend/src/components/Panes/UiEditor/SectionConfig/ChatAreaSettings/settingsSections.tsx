import { type ResponseDataAndStatus } from "@setta/app-subsystem-frontend-sdk";

import { DICTATION_MODE_ITEMS } from "components/Chat/dictationMode";

import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";

import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";

import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";

import _ from "lodash";

import {
  type AgenticsummarycacheAgenticSummaryCacheStatus as AgenticSummaryCacheStatus,
  type SetChatSectionSettingsData,
} from "openapi/http";

import {
  AgenticEdgeContextModeEnum,
  EngineTypeEnum,
  ProjectChatUIConfig,
  SectionTypeEnum,
} from "utils/generatedTypes";

import { type SectionOption } from "../chatAreaLinkedChatTargets";

export type ChatAreaSettingsProps = {
  sectionId: string;
};

export type ChatSectionSettingsPayload = Pick<
  SetChatSectionSettingsData["body"],
  | "managed"
  | "engineConfigId"
  | "transcriptionProfileId"
  | "agentProfileId"
  | "thinking"
  | "permissionMode"
  | "searchEnabled"
  | "dictationMode"
>;

export type AgenticSummaryCacheStatusRouteResponse =
  ResponseDataAndStatus<AgenticSummaryCacheStatus>;

export type ContextModeOption = {
  id: AgenticEdgeContextModeEnum;
  label: string;
};

export type ContextLinkRow = {
  id: string;
  label: string;
  contextMode: AgenticEdgeContextModeEnum;
};

export type SimpleLinkRow = {
  id: string;
  label: string;
};

export type AgenticScopeEntry = {
  id: string;
  label: string;
};

export type AgenticScopeBlock = {
  label: string;
  entries: AgenticScopeEntry[];
  labelClassName: string;
  emptyText: string;
};

export const CHAT_MODE_ITEMS: AllItemsType<string> = [
  {
    group: "Chat Modes",
    items: ProjectChatUIConfig.sectionChatWindowModeOptions.map((option) => ({
      id: option.value,
      name: option.label,
    })),
  },
];

export const CONTEXT_MODE_OPTIONS: ContextModeOption[] =
  ProjectChatUIConfig.agenticEdgeContextModeOptions.map((option) => ({
    id: option.value as AgenticEdgeContextModeEnum,
    label: option.label,
  }));

export type ChatModeFieldProps = {
  modeItems: AllItemsType<string>;
  value: string | null | undefined;
  isDisabled: boolean;
  onChange: (value: string | null) => void;
};

export type ManagedModeToggleProps = {
  isDisabled: boolean;
  managed: boolean;
  onChange: (value: boolean) => void;
};

export type ManagedChatSettingsProps = {
  managed: boolean;
  isDisabled: boolean;
  canManageManagedChatThreads: boolean;
  engineGroups: AllItemsType<string>;
  selectedEngineConfig: {
    id: string;
    engineType: EngineTypeEnum;
  } | null;
  onEngineChange: (value: string | null) => void;
  agentProfileGroups: AllItemsType<string>;
  agentProfileId: string | null | undefined;
  onAgentProfileChange: (value: string | null) => void;
  thinking: boolean | undefined;
  onThinkingChange: (value: boolean) => void;
  availableConfigGroups: AllItemsType<string>;
  selectableLLMConfigId: string | null;
  onLLMConfigChange: (value: string | null) => void;
  noConfigsAvailable: boolean;
  transcriptionProfileGroups: AllItemsType<string>;
  transcriptionProfileId: string | null | undefined;
  onTranscriptionProfileChange: (value: string | null) => void;
  dictationMode: string | undefined;
  onDictationModeChange: (value: string | null) => void;
  onNewChat: () => void;
};

export type SummaryCacheStatusPanelProps = {
  loading: boolean;
  error: string | null;
  status: AgenticSummaryCacheStatus | null;
  onRefresh: () => void;
};

export type ManagedChatLLMSettingsProps = {
  engineType: EngineTypeEnum | null;
  isDisabled: boolean;
  thinking: boolean | undefined;
  onThinkingChange: (value: boolean) => void;
  availableConfigGroups: AllItemsType<string>;
  selectableLLMConfigId: string | null;
  onLLMConfigChange: (value: string | null) => void;
  noConfigsAvailable: boolean;
};

export type ContextLinksSectionProps = {
  items: AllItemsType<string>;
  canEditLinks: boolean;
  rows: ContextLinkRow[];
  onAdd: (value: string | null) => void;
  contextModeOptions: ContextModeOption[];
  onContextModeChange: (
    edgeId: string,
    value: AgenticEdgeContextModeEnum,
  ) => void;
  onRemove: (edgeId: string) => void;
  showSummaryCacheStatus: boolean;
  summaryCacheStatusLoading: boolean;
  summaryCacheStatusError: string | null;
  summaryCacheStatus: AgenticSummaryCacheStatus | null;
  onRefreshSummaryCacheStatus: () => void;
};

export type SimpleLinkSectionProps = {
  title: string;
  items: AllItemsType<string>;
  canEditLinks: boolean;
  rows: SimpleLinkRow[];
  onAdd: (value: string | null) => void;
  onRemove: (edgeId: string) => void;
  addPlaceholder: string;
  emptyPlaceholder: string;
  emptyText: string;
};

export type ContextAndLinksCardProps = {
  contextItems: AllItemsType<string>;
  scopeItems: AllItemsType<string>;
  agentItems: AllItemsType<string>;
  canEditLinks: boolean;
  contextRows: ContextLinkRow[];
  scopeRows: SimpleLinkRow[];
  linkedAgentRows: SimpleLinkRow[];
  onAddContextSection: (value: string | null) => void;
  onAddScopeSection: (value: string | null) => void;
  onAddAgentLink: (value: string | null) => void;
  contextModeOptions: ContextModeOption[];
  onContextModeChange: (
    edgeId: string,
    value: AgenticEdgeContextModeEnum,
  ) => void;
  onRemoveEdge: (edgeId: string) => void;
  showSummaryCacheStatus: boolean;
  summaryCacheStatusLoading: boolean;
  summaryCacheStatusError: string | null;
  summaryCacheStatus: AgenticSummaryCacheStatus | null;
  onRefreshSummaryCacheStatus: () => void;
};

export type AgenticScopeCardProps = {
  blocks: AgenticScopeBlock[];
};

export type SectionCoreSummary = {
  displayName?: string | null;
  name?: string | null;
};

export type SectionVariantSummary = {
  impl: string;
};

export type SectionImplSummary = {
  type: SectionTypeEnum;
};

export type SectionOptionsLookup = {
  sectionId: string;
  sections: Record<string, SectionCoreSummary>;
  sectionVariants: Record<string, SectionVariantSummary>;
  sectionImpls: Record<string, SectionImplSummary>;
  sectionVariantMap: Record<string, string>;
};

export function resolveSectionLabel(
  labelsById: Record<string, string>,
  sectionId: string,
): string {
  return labelsById[sectionId] ?? sectionId;
}

export function resolveSectionDisplayName(
  core: SectionCoreSummary,
  sectionId: string,
): string {
  const displayName = core.displayName?.trim();
  return displayName && displayName.length > 0
    ? displayName
    : core.name || sectionId;
}

export function buildSectionLabelsById(
  sections: Record<string, SectionCoreSummary>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(sections).map(([id, core]) => [
      id,
      resolveSectionDisplayName(core, id),
    ]),
  );
}

export function buildSectionOptions({
  sectionId,
  sections,
  sectionVariants,
  sectionImpls,
  sectionVariantMap,
}: SectionOptionsLookup): SectionOption[] {
  const options: SectionOption[] = [];
  for (const [id, core] of Object.entries(sections)) {
    if (id === sectionId) {
      continue;
    }
    const variantId = sectionVariantMap[id];
    if (!variantId) {
      continue;
    }
    const variant = sectionVariants[variantId];
    if (!variant) {
      continue;
    }
    const impl = sectionImpls[variant.impl];
    if (!impl) {
      continue;
    }
    options.push({
      id,
      name: resolveSectionDisplayName(core, id),
      type: impl.type,
    });
  }
  return _.sortBy(options, (entry) => entry.name.toLowerCase());
}

export function ChatModeField({
  modeItems,
  value,
  isDisabled,
  onChange,
}: ChatModeFieldProps) {
  return (
    <div
      className="flex w-full flex-col gap-2"
      data-testid="chat-area-settings-chat-mode"
    >
      <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
        Chat Mode
      </p>
      <IdNameCombobox
        allItems={modeItems}
        value={value}
        small={false}
        onSelectedItemChange={onChange}
        placeholder="Select chat mode"
        outerDivClasses="justify-center"
        isDisabled={isDisabled}
      />
    </div>
  );
}

export function ManagedModeToggle({
  isDisabled,
  managed,
  onChange,
}: ManagedModeToggleProps) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
        Managed Mode
      </p>
      <SwitchInput
        isDisabled={isDisabled}
        value={managed}
        onChange={onChange}
        outerDivClassName="flex items-center"
      />
    </div>
  );
}

export function ManagedChatSettings({
  managed,
  isDisabled,
  canManageManagedChatThreads,
  engineGroups,
  selectedEngineConfig,
  onEngineChange,
  agentProfileGroups,
  agentProfileId,
  onAgentProfileChange,
  thinking,
  onThinkingChange,
  availableConfigGroups,
  selectableLLMConfigId,
  onLLMConfigChange,
  noConfigsAvailable,
  transcriptionProfileGroups,
  transcriptionProfileId,
  onTranscriptionProfileChange,
  dictationMode,
  onDictationModeChange,
  onNewChat,
}: ManagedChatSettingsProps) {
  if (!managed) {
    return null;
  }
  const selectedEngineId = selectedEngineConfig?.id ?? null;
  const engineType = selectedEngineConfig?.engineType ?? null;
  return (
    <>
      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Engine
        </p>
        <IdNameCombobox
          allItems={engineGroups}
          value={selectedEngineId}
          small={false}
          onSelectedItemChange={onEngineChange}
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
          onSelectedItemChange={onAgentProfileChange}
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
      <ManagedChatLLMSettings
        engineType={engineType}
        isDisabled={isDisabled}
        thinking={thinking}
        onThinkingChange={onThinkingChange}
        availableConfigGroups={availableConfigGroups}
        selectableLLMConfigId={selectableLLMConfigId}
        onLLMConfigChange={onLLMConfigChange}
        noConfigsAvailable={noConfigsAvailable}
      />
      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Transcription Profile
        </p>
        <IdNameCombobox
          allItems={transcriptionProfileGroups}
          value={transcriptionProfileId}
          small={false}
          onSelectedItemChange={onTranscriptionProfileChange}
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
          onSelectedItemChange={onDictationModeChange}
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
          onClick={onNewChat}
        >
          New Chat
        </button>
      </div>
    </>
  );
}

export function ManagedChatLLMSettings({
  engineType,
  isDisabled,
  thinking,
  onThinkingChange,
  availableConfigGroups,
  selectableLLMConfigId,
  onLLMConfigChange,
  noConfigsAvailable,
}: ManagedChatLLMSettingsProps) {
  if (engineType !== EngineTypeEnum.setta_llm) {
    return null;
  }
  const configPlaceholder = noConfigsAvailable
    ? "Add an LLM config or API key"
    : "Select an LLM";
  const highlightMissingConfig = !selectableLLMConfigId && !noConfigsAvailable;
  return (
    <>
      <div className="flex w-full items-center justify-between gap-4">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Thinking
        </p>
        <SwitchInput
          isDisabled={isDisabled}
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
          allItems={availableConfigGroups}
          value={selectableLLMConfigId}
          small={false}
          onSelectedItemChange={onLLMConfigChange}
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
  );
}

export function SummaryCacheStatusPanel({
  loading,
  error,
  status,
  onRefresh,
}: SummaryCacheStatusPanelProps) {
  let content = (
    <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
      Summary cache status unavailable.
    </p>
  );
  if (loading) {
    content = (
      <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
        Loading summary cache status...
      </p>
    );
  } else if (error) {
    content = (
      <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
        Failed to load summary cache status: {error}
      </p>
    );
  } else if (status) {
    content = (
      <div className="mt-1 flex flex-col gap-1 text-[11px] text-setta-500 dark:text-setta-400">
        <p>
          Cached: {status.cachedSectionIds.length}/
          {status.summarySectionIds.length}. Missing:{" "}
          {status.missingSectionIds.length}. Deferred due to cap (
          {status.maxSummariesPerRun}):{" "}
          {Math.max(
            status.missingSectionIds.length -
              status.consideredSectionIds.length,
            0,
          )}
          .
        </p>
        {status.emptySourceSectionIds.length > 0 ? (
          <p>
            Empty deterministic sources: {status.emptySourceSectionIds.length}.
          </p>
        ) : null}
        <p>
          Missing summaries fall back to a deterministic excerpt in the Agentic
          Context message until cached.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-md border border-setta-200/80 bg-white/80 p-2 text-[11px] text-setta-700 shadow-sm dark:border-setta-700/60 dark:bg-setta-900/70 dark:text-setta-200">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-setta-600 dark:text-setta-300">
          Summary cache
        </span>
        <button
          type="button"
          className="text-[10px] font-semibold text-setta-500 hover:text-setta-800 disabled:cursor-not-allowed disabled:opacity-70 dark:text-setta-400 dark:hover:text-setta-200"
          onClick={onRefresh}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      {content}
    </div>
  );
}

export function ContextLinksSection({
  items,
  canEditLinks,
  rows,
  onAdd,
  contextModeOptions,
  onContextModeChange,
  onRemove,
  showSummaryCacheStatus,
  summaryCacheStatusLoading,
  summaryCacheStatusError,
  summaryCacheStatus,
  onRefreshSummaryCacheStatus,
}: ContextLinksSectionProps) {
  const optionCount = items[0]?.items.length ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-setta-600 dark:text-setta-300">
        Context sources
      </p>
      <IdNameCombobox
        allItems={items}
        value={null}
        small={true}
        onSelectedItemChange={onAdd}
        placeholder={
          optionCount > 0 ? "Add a section" : "No sections available"
        }
        outerDivClasses="justify-center"
        inputOuterClasses="!h-7"
        isDisabled={!canEditLinks || optionCount === 0}
        selectedItemCanBeNull
        clearInputAfterSelection
      />
      {rows.length === 0 ? (
        <p className="text-[11px] text-setta-500 dark:text-setta-500">
          No context links yet.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-2 rounded-md border border-setta-200/80 bg-white/80 px-2 py-1 text-[11px] text-setta-700 dark:border-setta-700/60 dark:bg-setta-900/70 dark:text-setta-200"
            >
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              <select
                value={row.contextMode}
                onChange={(event) =>
                  onContextModeChange(
                    row.id,
                    event.target.value as AgenticEdgeContextModeEnum,
                  )
                }
                disabled={!canEditLinks}
                className="h-6 rounded border border-setta-200 bg-white px-1 text-[10px] text-setta-600 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-70 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
              >
                {contextModeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-[10px] font-semibold text-setta-500 hover:text-setta-800 dark:text-setta-400 dark:hover:text-setta-200"
                onClick={() => onRemove(row.id)}
                disabled={!canEditLinks}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {showSummaryCacheStatus ? (
        <SummaryCacheStatusPanel
          loading={summaryCacheStatusLoading}
          error={summaryCacheStatusError}
          status={summaryCacheStatus}
          onRefresh={onRefreshSummaryCacheStatus}
        />
      ) : null}
    </div>
  );
}

export function SimpleLinkSection({
  title,
  items,
  canEditLinks,
  rows,
  onAdd,
  onRemove,
  addPlaceholder,
  emptyPlaceholder,
  emptyText,
}: SimpleLinkSectionProps) {
  const optionCount = items[0]?.items.length ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-setta-600 dark:text-setta-300">
        {title}
      </p>
      <IdNameCombobox
        allItems={items}
        value={null}
        small={true}
        onSelectedItemChange={onAdd}
        placeholder={optionCount > 0 ? addPlaceholder : emptyPlaceholder}
        outerDivClasses="justify-center"
        inputOuterClasses="!h-7"
        isDisabled={!canEditLinks || optionCount === 0}
        selectedItemCanBeNull
        clearInputAfterSelection
      />
      {rows.length === 0 ? (
        <p className="text-[11px] text-setta-500 dark:text-setta-500">
          {emptyText}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-2 rounded-md border border-setta-200/80 bg-white/80 px-2 py-1 text-[11px] text-setta-700 dark:border-setta-700/60 dark:bg-setta-900/70 dark:text-setta-200"
            >
              <span className="truncate">{row.label}</span>
              <button
                type="button"
                className="text-[10px] font-semibold text-setta-500 hover:text-setta-800 dark:text-setta-400 dark:hover:text-setta-200"
                onClick={() => onRemove(row.id)}
                disabled={!canEditLinks}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContextAndLinksCard({
  contextItems,
  scopeItems,
  agentItems,
  canEditLinks,
  contextRows,
  scopeRows,
  linkedAgentRows,
  onAddContextSection,
  onAddScopeSection,
  onAddAgentLink,
  contextModeOptions,
  onContextModeChange,
  onRemoveEdge,
  showSummaryCacheStatus,
  summaryCacheStatusLoading,
  summaryCacheStatusError,
  summaryCacheStatus,
  onRefreshSummaryCacheStatus,
}: ContextAndLinksCardProps) {
  return (
    <div className="mt-3 rounded-md border border-setta-200/70 bg-white/70 p-3 shadow-sm dark:border-setta-800 dark:bg-setta-900/40">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Context & Links
        </p>
        <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
          Add context sources, scope boundaries, or linked agents for this chat.
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-4">
        <ContextLinksSection
          items={contextItems}
          canEditLinks={canEditLinks}
          rows={contextRows}
          onAdd={onAddContextSection}
          contextModeOptions={contextModeOptions}
          onContextModeChange={onContextModeChange}
          onRemove={onRemoveEdge}
          showSummaryCacheStatus={showSummaryCacheStatus}
          summaryCacheStatusLoading={summaryCacheStatusLoading}
          summaryCacheStatusError={summaryCacheStatusError}
          summaryCacheStatus={summaryCacheStatus}
          onRefreshSummaryCacheStatus={onRefreshSummaryCacheStatus}
        />
        <SimpleLinkSection
          title="Scope sections"
          items={scopeItems}
          canEditLinks={canEditLinks}
          rows={scopeRows}
          onAdd={onAddScopeSection}
          onRemove={onRemoveEdge}
          addPlaceholder="Add a section"
          emptyPlaceholder="No sections available"
          emptyText="No scope links yet."
        />
        <SimpleLinkSection
          title="Linked agents"
          items={agentItems}
          canEditLinks={canEditLinks}
          rows={linkedAgentRows}
          onAdd={onAddAgentLink}
          onRemove={onRemoveEdge}
          addPlaceholder="Link a chat"
          emptyPlaceholder="No other chats"
          emptyText="No linked agents yet."
        />
      </div>
    </div>
  );
}

export function AgenticScopeCard({ blocks }: AgenticScopeCardProps) {
  const hasEntries = blocks.some((block) => block.entries.length > 0);
  return (
    <div className="mt-3 rounded-md border border-setta-200/70 bg-white/70 p-3 shadow-sm dark:border-setta-800 dark:bg-setta-900/40">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Agentic Scope
        </p>
        <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
          Edges define what this chat can read, write, and use as context.
        </p>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {!hasEntries ? (
          <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            No outgoing scope links = no access.
          </p>
        ) : null}
        <p className="text-[11px] text-setta-500 dark:text-setta-400">
          Use Project Chat for full access.
        </p>
      </div>
      <div className="mt-3 grid gap-3">
        {blocks.map((block) => (
          <div key={block.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-[11px] font-semibold ${block.labelClassName}`}
              >
                {block.label}
              </span>
              <span className="text-[10px] text-setta-500 dark:text-setta-400">
                {block.entries.length}
              </span>
            </div>
            {block.entries.length === 0 ? (
              <p className="text-[11px] text-setta-500 dark:text-setta-500">
                {block.emptyText}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {block.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-setta-200/80 bg-white/80 px-2 py-1 text-[11px] text-setta-700 dark:border-setta-700/60 dark:bg-setta-900/70 dark:text-setta-200"
                  >
                    <span className="truncate">{entry.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
