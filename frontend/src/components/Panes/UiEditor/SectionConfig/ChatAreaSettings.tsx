import { DICTATION_MODE_ITEMS } from "components/Chat/dictationMode";
import { buildEngineGroups } from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
  resolveSelectableLLMConfigId,
} from "components/Chat/llmConfigUtils";
import { canUseManagedChatLLM } from "components/Chat/sharePolicyChatAccess";
import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import {
  getAgenticSummaryCacheStatus,
  setChatSectionChatId,
  setChatSectionSettings,
  type AgenticsummarycacheAgenticSummaryCacheStatus as AgenticSummaryCacheStatus,
  type SetChatSectionSettingsData,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createAgenticEdgeFromSections,
  deleteAgenticEdgesById,
  updateAgenticEdgeContextMode,
} from "state/actions/agenticEdges";
import { updateEngineConfig } from "state/actions/ai";
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
import { resolveAgenticScopeFromEdges } from "state/agenticScopeUtils";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  ChatWindowModeEnum,
  EngineTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
type ChatAreaSettingsProps = {
  sectionId: string;
};
type ChatSectionSettingsPayload = Pick<
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
type SectionOption = {
  id: string;
  name: string;
  type: SectionTypeEnum;
};
type AgenticSummaryCacheStatusRouteResponse =
  ResponseDataAndStatus<AgenticSummaryCacheStatus>;
type LinkedChatTargetFilterArgs = {
  sectionOptions: Array<SectionOption>;
  sectionVariantMap: Record<string, string>;
  sectionVariants: Record<
    string,
    {
      impl: string;
    }
  >;
  sectionImpls: Record<
    string,
    {
      type: SectionTypeEnum;
      managed?: boolean;
      engineConfigId?: string | null;
      agentProfileId?: string | null;
    }
  >;
  agentProfiles: Array<{
    id: string;
    engineConfigId: string | null;
  }>;
  engineConfigs: Array<{
    id: string;
    engineType: EngineTypeEnum;
    settaLlmConfigId?: string | null;
    externalAgentConfigId?: string | null;
  }>;
  externalAgentConfigs: Array<{
    id: string;
  }>;
  allLLMConfigs: {
    configs: Record<string, unknown>;
    default_config_id?: string | null;
  };
};
type LinkedChatTargetLookup = Omit<
  LinkedChatTargetFilterArgs,
  "sectionOptions"
> & {
  externalAgentConfigIds: Set<string>;
};
type ContextModeOption = {
  id: AgenticEdgeContextModeEnum;
  label: string;
};
type ContextLinkRow = {
  id: string;
  label: string;
  contextMode: AgenticEdgeContextModeEnum;
};
type SimpleLinkRow = {
  id: string;
  label: string;
};
type AgenticScopeEntry = {
  id: string;
  label: string;
};
type AgenticScopeBlock = {
  label: string;
  entries: AgenticScopeEntry[];
  labelClassName: string;
  emptyText: string;
};
type ChatModeFieldProps = {
  modeItems: AllItemsType<string>;
  value: string | null | undefined;
  isDisabled: boolean;
  onChange: (value: string | null) => void;
};
type ManagedModeToggleProps = {
  isDisabled: boolean;
  managed: boolean;
  onChange: (value: boolean) => void;
};
type ManagedChatSettingsProps = {
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
type SummaryCacheStatusPanelProps = {
  loading: boolean;
  error: string | null;
  status: AgenticSummaryCacheStatus | null;
  onRefresh: () => void;
};
type ManagedChatLLMSettingsProps = {
  engineType: EngineTypeEnum | null;
  isDisabled: boolean;
  thinking: boolean | undefined;
  onThinkingChange: (value: boolean) => void;
  availableConfigGroups: AllItemsType<string>;
  selectableLLMConfigId: string | null;
  onLLMConfigChange: (value: string | null) => void;
  noConfigsAvailable: boolean;
};
type ContextLinksSectionProps = {
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
type SimpleLinkSectionProps = {
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
type ContextAndLinksCardProps = {
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
type AgenticScopeCardProps = {
  blocks: AgenticScopeBlock[];
};

function resolveSectionLabel(
  labelsById: Record<string, string>,
  sectionId: string,
): string {
  return labelsById[sectionId] ?? sectionId;
}

function resolveExecutableLinkedChatEngineConfig(
  impl: {
    engineConfigId?: string | null;
    agentProfileId?: string | null;
  },
  lookup: LinkedChatTargetLookup,
) {
  let effectiveEngineConfigId = impl.engineConfigId ?? null;
  if (effectiveEngineConfigId == null && impl.agentProfileId != null) {
    const selectedProfile =
      lookup.agentProfiles.find(
        (profile) => profile.id === impl.agentProfileId,
      ) ?? null;
    effectiveEngineConfigId = selectedProfile?.engineConfigId ?? null;
  }
  if (effectiveEngineConfigId == null) {
    return null;
  }
  return (
    lookup.engineConfigs.find(
      (config) => config.id === effectiveEngineConfigId,
    ) ?? null
  );
}

function isExecutableLinkedChatTarget(
  entry: SectionOption,
  lookup: LinkedChatTargetLookup,
): boolean {
  if (entry.type !== SectionTypeEnum.Chat) {
    return false;
  }
  const variantId = lookup.sectionVariantMap[entry.id];
  if (!variantId) {
    return false;
  }
  const variant = lookup.sectionVariants[variantId];
  if (!variant) {
    return false;
  }
  const impl = lookup.sectionImpls[variant.impl];
  if (!impl) {
    return false;
  }
  if (impl.type !== SectionTypeEnum.Chat) {
    return false;
  }
  if (impl.managed !== true) {
    return false;
  }
  const engineConfig = resolveExecutableLinkedChatEngineConfig(impl, lookup);
  if (!engineConfig) {
    return false;
  }
  return isExecutableLinkedChatEngineConfigReady(engineConfig, lookup);
}

function isExecutableLinkedChatEngineConfigReady(
  engineConfig: {
    engineType: EngineTypeEnum;
    settaLlmConfigId?: string | null;
    externalAgentConfigId?: string | null;
  },
  lookup: LinkedChatTargetLookup,
): boolean {
  if (engineConfig.engineType === EngineTypeEnum.external_agent) {
    if (!engineConfig.externalAgentConfigId) {
      return false;
    }
    return lookup.externalAgentConfigIds.has(
      engineConfig.externalAgentConfigId,
    );
  }
  if (engineConfig.engineType === EngineTypeEnum.setta_llm) {
    return Boolean(
      engineConfig.settaLlmConfigId ??
        pickDefaultConfigId(lookup.allLLMConfigs),
    );
  }
  return true;
}

export function filterExecutableLinkedChatTargets({
  sectionOptions,
  sectionVariantMap,
  sectionVariants,
  sectionImpls,
  agentProfiles,
  engineConfigs,
  externalAgentConfigs,
  allLLMConfigs,
}: LinkedChatTargetFilterArgs): Array<SectionOption> {
  const externalAgentConfigIds = new Set(
    externalAgentConfigs.map((config) => config.id),
  );
  return sectionOptions.filter((entry) =>
    isExecutableLinkedChatTarget(entry, {
      sectionVariantMap,
      sectionVariants,
      sectionImpls,
      agentProfiles,
      engineConfigs,
      externalAgentConfigs,
      allLLMConfigs,
      externalAgentConfigIds,
    }),
  );
}

function ChatModeField({
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

function ManagedModeToggle({
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

function ManagedChatSettings({
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

function ManagedChatLLMSettings({
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

function SummaryCacheStatusPanel({
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

function ContextLinksSection({
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

function SimpleLinkSection({
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

function ContextAndLinksCard({
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

function AgenticScopeCard({ blocks }: AgenticScopeCardProps) {
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

export function ChatAreaSettings({ sectionId }: ChatAreaSettingsProps) {
  useHydrateLLMState();
  useHydrateAgenticState();
  const projectConfigId = getCurrProjectConfigId();
  const { canEditLayout, canEditParams, canEditStructure } =
    useShareCapabilities();
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
  const agenticEdges = useProjectState(
    (state) => state.projectConfig.agenticEdges,
    _.isEqual,
  );
  const { sections, sectionVariants, sectionImpls, sectionVariantMap } =
    useProjectState(
      (state) => ({
        sections: state.sections,
        sectionVariants: state.sectionVariants,
        sectionImpls: state.sectionImpls,
        sectionVariantMap: state.projectConfig.sectionVariantMap,
      }),
      _.isEqual,
    );
  const {
    apiKeys,
    allLLMConfigs,
    agentProfiles,
    engineConfigs,
    externalAgentConfigs,
    transcriptionProfiles,
  } = useAIStore(
    (state) => ({
      apiKeys: state.apiKeys,
      allLLMConfigs: state.allLLMConfigs,
      agentProfiles: state.agentProfiles,
      engineConfigs: state.engineConfigs,
      externalAgentConfigs: state.externalAgentConfigs,
      transcriptionProfiles: state.transcriptionProfiles,
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
  const selectableLLMConfigId = useMemo(
    () =>
      resolveSelectableLLMConfigId(availableConfigGroups, selectedLLMConfigId),
    [availableConfigGroups, selectedLLMConfigId],
  );
  const sectionLabelsById = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const [id, core] of Object.entries(sections)) {
      const display = core.displayName?.trim();
      labels[id] = display && display.length > 0 ? display : core.name || id;
    }
    return labels;
  }, [sections]);
  const sectionOptions = useMemo(() => {
    const options: Array<{
      id: string;
      name: string;
      type: SectionTypeEnum;
    }> = [];
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
      const displayName = core.displayName?.trim();
      const name =
        displayName && displayName.length > 0 ? displayName : core.name || id;
      options.push({ id, name, type: impl.type });
    }
    return _.sortBy(options, (entry) => entry.name.toLowerCase());
  }, [sectionId, sectionImpls, sectionVariantMap, sectionVariants, sections]);
  const nonChatSectionItems = useMemo<AllItemsType<string>>(() => {
    const items = sectionOptions
      .filter((entry) => entry.type !== SectionTypeEnum.Chat)
      .map((entry) => ({ id: entry.id, name: entry.name }));
    return [{ group: "Sections", items }];
  }, [sectionOptions]);
  const contextItems = nonChatSectionItems;
  const scopeItems = nonChatSectionItems;
  const agentItems = useMemo<AllItemsType<string>>(() => {
    const items = filterExecutableLinkedChatTargets({
      sectionOptions,
      sectionVariantMap,
      sectionVariants,
      sectionImpls,
      agentProfiles,
      engineConfigs,
      externalAgentConfigs,
      allLLMConfigs,
    }).map((entry) => ({ id: entry.id, name: entry.name }));
    return [{ group: "Chat Sections", items }];
  }, [
    agentProfiles,
    allLLMConfigs,
    engineConfigs,
    externalAgentConfigs,
    sectionImpls,
    sectionOptions,
    sectionVariantMap,
    sectionVariants,
  ]);
  const contextModeOptions = useMemo<ContextModeOption[]>(
    () => [
      {
        id: AgenticEdgeContextModeEnum.reference_only,
        label: "Reference only",
      },
      { id: AgenticEdgeContextModeEnum.inline_text, label: "Inline text" },
      { id: AgenticEdgeContextModeEnum.summary, label: "Summary" },
    ],
    [],
  );
  const contextEdges = useMemo(
    () =>
      agenticEdges.filter(
        (edge) =>
          edge.kind === AgenticEdgeKindEnum.chat_section &&
          edge.sourceSectionId === sectionId,
      ),
    [agenticEdges, sectionId],
  );
  const summaryContextEdgeCount = useMemo(
    () =>
      contextEdges.filter(
        (edge) => edge.contextMode === AgenticEdgeContextModeEnum.summary,
      ).length,
    [contextEdges],
  );
  const scopeEdges = contextEdges;
  const linkedAgentEdges = useMemo(
    () =>
      agenticEdges.filter(
        (edge) =>
          edge.kind === AgenticEdgeKindEnum.chat_chat &&
          edge.sourceSectionId === sectionId,
      ),
    [agenticEdges, sectionId],
  );
  const agenticScope = useMemo(
    () => resolveAgenticScopeFromEdges(agenticEdges, sectionId),
    [agenticEdges, sectionId],
  );
  const buildScopeEntries = useCallback(
    (ids: Iterable<string>) => {
      const entries = Array.from(ids).map((id) => ({
        id,
        label: sectionLabelsById[id] ?? id,
      }));
      return _.sortBy(entries, (entry) => entry.label.toLowerCase());
    },
    [sectionLabelsById],
  );
  const scopeReadEntries = useMemo(() => {
    return buildScopeEntries(agenticScope.readSectionIds);
  }, [agenticScope, buildScopeEntries]);
  const scopeWriteEntries = useMemo(
    () => buildScopeEntries(agenticScope.writeSectionIds),
    [agenticScope, buildScopeEntries],
  );
  const scopeContextEntries = useMemo(
    () => buildScopeEntries(agenticScope.contextSectionIds),
    [agenticScope, buildScopeEntries],
  );
  const contextRows = useMemo<ContextLinkRow[]>(
    () =>
      contextEdges.map((edge) => ({
        id: edge.id,
        label: resolveSectionLabel(sectionLabelsById, edge.targetSectionId),
        contextMode:
          edge.contextMode ?? AgenticEdgeContextModeEnum.reference_only,
      })),
    [contextEdges, sectionLabelsById],
  );
  const scopeRows = useMemo<SimpleLinkRow[]>(
    () =>
      scopeEdges.map((edge) => ({
        id: edge.id,
        label: resolveSectionLabel(sectionLabelsById, edge.targetSectionId),
      })),
    [scopeEdges, sectionLabelsById],
  );
  const linkedAgentRows = useMemo<SimpleLinkRow[]>(
    () =>
      linkedAgentEdges.map((edge) => {
        const otherId =
          edge.sourceSectionId === sectionId
            ? edge.targetSectionId
            : edge.sourceSectionId;
        return {
          id: edge.id,
          label: resolveSectionLabel(sectionLabelsById, otherId),
        };
      }),
    [linkedAgentEdges, sectionId, sectionLabelsById],
  );
  const scopeBlocks = useMemo<AgenticScopeBlock[]>(
    () => [
      {
        label: "Read",
        entries: scopeReadEntries,
        labelClassName: "text-emerald-600 dark:text-emerald-300",
        emptyText: "No readable sections.",
      },
      {
        label: "Write",
        entries: scopeWriteEntries,
        labelClassName: "text-amber-600 dark:text-amber-300",
        emptyText: "No writable sections.",
      },
      {
        label: "Context",
        entries: scopeContextEntries,
        labelClassName: "text-sky-600 dark:text-sky-300",
        emptyText: "No context sections.",
      },
    ],
    [scopeContextEntries, scopeReadEntries, scopeWriteEntries],
  );
  const [summaryCacheStatus, setSummaryCacheStatus] =
    useState<AgenticSummaryCacheStatus | null>(null);
  const [summaryCacheStatusLoading, setSummaryCacheStatusLoading] =
    useState<boolean>(false);
  const [summaryCacheStatusError, setSummaryCacheStatusError] = useState<
    string | null
  >(null);
  const fetchSummaryCacheStatus = useCallback(async () => {
    if (summaryContextEdgeCount === 0) {
      setSummaryCacheStatus(null);
      setSummaryCacheStatusError(null);
      return;
    }
    setSummaryCacheStatusLoading(true);
    try {
      const response = (await callOpenAPI(
        getAgenticSummaryCacheStatus({
          body: {
            projectConfigId,
            chatSectionId: sectionId,
          },
        } as Parameters<typeof getAgenticSummaryCacheStatus>[0]),
      )) as AgenticSummaryCacheStatusRouteResponse;
      if (!res200(response)) {
        const detail = getErrorDetail(response.data as unknown);
        const status =
          typeof response.status === "number" ? response.status : null;
        setSummaryCacheStatus(null);
        setSummaryCacheStatusError(
          detail ??
            `Failed to load summary cache status${status ? ` (status ${status}).` : "."}`,
        );
        return;
      }
      setSummaryCacheStatus(response.data);
      setSummaryCacheStatusError(null);
    } catch (err) {
      console.error("Failed to load agentic summary cache status", err);
      const message = err instanceof Error ? err.message : String(err);
      setSummaryCacheStatus(null);
      setSummaryCacheStatusError(message);
    } finally {
      setSummaryCacheStatusLoading(false);
    }
  }, [projectConfigId, sectionId, summaryContextEdgeCount]);
  useEffect(() => {
    void fetchSummaryCacheStatus();
  }, [fetchSummaryCacheStatus]);
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
          callOpenAPI(
            setChatSectionSettings({
              body: {
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
              },
            } as Parameters<typeof setChatSectionSettings>[0]),
          ),
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
      engineConfigId,
      transcriptionProfileId,
      permissionMode,
      searchEnabled,
      thinking,
      dictationMode,
      updateSettings,
    ],
  );
  const handleChatModeChange = useCallback(
    (value: string | null) => {
      if (isChatModeControlDisabled) {
        return;
      }
      if (!value) {
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
      engineConfigId,
      managed,
      transcriptionProfileId,
      permissionMode,
      searchEnabled,
      dictationMode,
      updateSettings,
    ],
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
        settaLlmConfigId: value,
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
        transcriptionProfileId,
        agentProfileId: value,
        thinking,
        permissionMode,
        searchEnabled,
        dictationMode,
      });
    },
    [
      engineConfigId,
      managed,
      transcriptionProfileId,
      permissionMode,
      searchEnabled,
      dictationMode,
      thinking,
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
      dictationMode,
      engineConfigId,
      managed,
      transcriptionProfileId,
      permissionMode,
      searchEnabled,
      thinking,
      updateSettings,
    ],
  );
  const canEditLinks = canEditStructure;
  const handleAddContextSection = useCallback(
    (value: string | null) => {
      if (!value || !canEditLinks) {
        return;
      }
      createAgenticEdgeFromSections({
        sourceSectionId: sectionId,
        targetSectionId: value,
        kind: AgenticEdgeKindEnum.chat_section,
      });
    },
    [canEditLinks, sectionId],
  );
  const handleAddScopeSection = useCallback(
    (value: string | null) => {
      if (!value || !canEditLinks) {
        return;
      }
      createAgenticEdgeFromSections({
        sourceSectionId: sectionId,
        targetSectionId: value,
        kind: AgenticEdgeKindEnum.chat_section,
      });
    },
    [canEditLinks, sectionId],
  );
  const handleAddAgentLink = useCallback(
    (value: string | null) => {
      if (!value || !canEditLinks) {
        return;
      }
      createAgenticEdgeFromSections({
        sourceSectionId: sectionId,
        targetSectionId: value,
        kind: AgenticEdgeKindEnum.chat_chat,
      });
    },
    [canEditLinks, sectionId],
  );
  const handleRemoveEdge = useCallback(
    (edgeId: string) => {
      if (!canEditLinks) {
        return;
      }
      deleteAgenticEdgesById([edgeId]);
    },
    [canEditLinks],
  );
  const handleContextModeChange = useCallback(
    (edgeId: string, value: AgenticEdgeContextModeEnum) => {
      if (!canEditLinks) {
        return;
      }
      updateAgenticEdgeContextMode(edgeId, value);
    },
    [canEditLinks],
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
        callOpenAPI(
          setChatSectionChatId({
            body: {
              projectConfigId,
              sectionId,
              chatId: null,
            },
          } as Parameters<typeof setChatSectionChatId>[0]),
        ),
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
      if (nextEngineId !== (selectedEngineConfig?.id ?? null)) {
        handleNewChat();
      }
    },
    [
      agentProfileId,
      handleNewChat,
      managed,
      permissionMode,
      searchEnabled,
      selectedEngineConfig,
      transcriptionProfileId,
      dictationMode,
      thinking,
      updateSettings,
    ],
  );
  return (
    <div className="flex w-full flex-col gap-2">
      <ChatModeField
        modeItems={modeItems}
        value={sectionChatWindowMode}
        isDisabled={isChatModeControlDisabled}
        onChange={handleChatModeChange}
      />
      <ManagedModeToggle
        isDisabled={isDisabled}
        managed={managed}
        onChange={handleManagedChange}
      />
      <ManagedChatSettings
        managed={managed}
        isDisabled={isDisabled}
        canManageManagedChatThreads={canManageManagedChatThreads}
        engineGroups={engineGroups}
        selectedEngineConfig={selectedEngineConfig}
        onEngineChange={handleEngineChange}
        agentProfileGroups={agentProfileGroups}
        agentProfileId={agentProfileId}
        onAgentProfileChange={handleAgentProfileChange}
        thinking={thinking}
        onThinkingChange={handleThinkingChange}
        availableConfigGroups={availableConfigGroups}
        selectableLLMConfigId={selectableLLMConfigId}
        onLLMConfigChange={handleLLMConfigChange}
        noConfigsAvailable={noConfigsAvailable}
        transcriptionProfileGroups={transcriptionProfileGroups}
        transcriptionProfileId={transcriptionProfileId}
        onTranscriptionProfileChange={handleTranscriptionProfileChange}
        dictationMode={dictationMode}
        onDictationModeChange={handleDictationModeChange}
        onNewChat={handleNewChat}
      />
      <ContextAndLinksCard
        contextItems={contextItems}
        scopeItems={scopeItems}
        agentItems={agentItems}
        canEditLinks={canEditLinks}
        contextRows={contextRows}
        scopeRows={scopeRows}
        linkedAgentRows={linkedAgentRows}
        onAddContextSection={handleAddContextSection}
        onAddScopeSection={handleAddScopeSection}
        onAddAgentLink={handleAddAgentLink}
        contextModeOptions={contextModeOptions}
        onContextModeChange={handleContextModeChange}
        onRemoveEdge={handleRemoveEdge}
        showSummaryCacheStatus={summaryContextEdgeCount > 0}
        summaryCacheStatusLoading={summaryCacheStatusLoading}
        summaryCacheStatusError={summaryCacheStatusError}
        summaryCacheStatus={summaryCacheStatus}
        onRefreshSummaryCacheStatus={fetchSummaryCacheStatus}
      />
      <AgenticScopeCard blocks={scopeBlocks} />
    </div>
  );
}
