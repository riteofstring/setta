import { pickDefaultConfigId } from "components/Chat/llmConfigUtils";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createAgenticEdgeFromSections,
  deleteAgenticEdgesById,
  updateAgenticEdgeContextMode,
} from "state/actions/agenticEdges";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { resolveAgenticScopeFromEdges } from "state/agenticScopeUtils";
import { useAIStore, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_agentic_summary_cache_status } from "utils/generatedEndpoints";
import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  AgenticSummaryCacheStatus,
  EngineTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

type ChatAreaAgenticLinksPanelProps = {
  sectionId: string;
};

type SectionOption = {
  id: string;
  name: string;
  type: SectionTypeEnum;
};

type LinkedChatTargetFilterArgs = {
  sectionOptions: Array<SectionOption>;
  sectionVariantMap: Record<string, string>;
  sectionVariants: Record<string, { impl: string }>;
  sectionImpls: Record<
    string,
    {
      type: SectionTypeEnum;
      managed?: boolean;
      engineConfigId?: string | null;
      agentProfileId?: string | null;
    }
  >;
  agentProfiles: Array<{ id: string; engineConfigId: string | null }>;
  engineConfigs: Array<{
    id: string;
    engineType: EngineTypeEnum;
    settaLlmConfigId?: string | null;
    externalAgentConfigId?: string | null;
  }>;
  externalAgentConfigs: Array<{ id: string }>;
  allLLMConfigs: {
    configs: Record<string, unknown>;
    default_config_id?: string | null;
  };
};

type ScopeBlockConfig = {
  label: string;
  entries: Array<{ id: string; label: string }>;
  labelClassName: string;
  emptyText: string;
};

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
  return sectionOptions.filter((entry) => {
    if (entry.type !== SectionTypeEnum.Chat) {
      return false;
    }
    const variantId = sectionVariantMap[entry.id];
    if (!variantId) {
      return false;
    }
    const variant = sectionVariants[variantId];
    if (!variant) {
      return false;
    }
    const impl = sectionImpls[variant.impl];
    if (!impl || impl.type !== SectionTypeEnum.Chat || impl.managed !== true) {
      return false;
    }
    const selectedProfile =
      impl.agentProfileId == null
        ? null
        : agentProfiles.find((profile) => profile.id === impl.agentProfileId) ??
          null;
    const effectiveEngineConfigId =
      impl.engineConfigId ?? selectedProfile?.engineConfigId ?? null;
    if (!effectiveEngineConfigId) {
      return false;
    }
    const engineConfig =
      engineConfigs.find((config) => config.id === effectiveEngineConfigId) ??
      null;
    if (!engineConfig) {
      return false;
    }
    if (engineConfig.engineType === EngineTypeEnum.external_agent) {
      return Boolean(
        engineConfig.externalAgentConfigId &&
          externalAgentConfigIds.has(engineConfig.externalAgentConfigId),
      );
    }
    if (engineConfig.engineType === EngineTypeEnum.setta_llm) {
      return Boolean(
        engineConfig.settaLlmConfigId ?? pickDefaultConfigId(allLLMConfigs),
      );
    }
    return true;
  });
}

function AgenticScopeBlock({
  label,
  entries,
  labelClassName,
  emptyText,
}: ScopeBlockConfig) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold ${labelClassName}`}>
          {label}
        </span>
        <span className="text-[10px] text-setta-500 dark:text-setta-400">
          {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-setta-500 dark:text-setta-500">
          {emptyText}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {entries.map((entry) => (
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
  );
}

export function ChatAreaAgenticLinksPanel({
  sectionId,
}: ChatAreaAgenticLinksPanelProps) {
  const projectConfigId = getCurrProjectConfigId();
  const { canEditStructure: canEditLinks } = useShareCapabilities();
  const {
    sections,
    sectionVariants,
    sectionImpls,
    sectionVariantMap,
    agenticEdges,
  } = useProjectState(
    (state) => ({
      sections: state.sections,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      agenticEdges: state.projectConfig.agenticEdges,
    }),
    _.isEqual,
  );
  const { agentProfiles, engineConfigs, externalAgentConfigs, allLLMConfigs } =
    useAIStore(
      (state) => ({
        agentProfiles: state.agentProfiles,
        engineConfigs: state.engineConfigs,
        externalAgentConfigs: state.externalAgentConfigs,
        allLLMConfigs: state.allLLMConfigs,
      }),
      _.isEqual,
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
    const options: Array<SectionOption> = [];
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

  const contextModeOptions = useMemo(
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
  const scopeEdges = useMemo(
    () =>
      agenticEdges.filter(
        (edge) =>
          edge.kind === AgenticEdgeKindEnum.chat_section &&
          edge.sourceSectionId === sectionId,
      ),
    [agenticEdges, sectionId],
  );
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

  const scopeReadEntries = useMemo(
    () => buildScopeEntries(agenticScope.readSectionIds),
    [agenticScope, buildScopeEntries],
  );
  const scopeWriteEntries = useMemo(
    () => buildScopeEntries(agenticScope.writeSectionIds),
    [agenticScope, buildScopeEntries],
  );
  const scopeContextEntries = useMemo(
    () => buildScopeEntries(agenticScope.contextSectionIds),
    [agenticScope, buildScopeEntries],
  );
  const scopeBlocks = useMemo<Array<ScopeBlockConfig>>(
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
    useState(false);
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
      const response = await route_get_agentic_summary_cache_status({
        projectConfigId,
        chatSectionId: sectionId,
      });
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

  const hasAgenticScope =
    agenticScope.readSectionIds.size > 0 ||
    agenticScope.writeSectionIds.size > 0 ||
    agenticScope.contextSectionIds.size > 0 ||
    agenticScope.peerChatSectionIds.size > 0;
  const contextOptionCount = nonChatSectionItems[0]?.items.length ?? 0;
  const scopeOptionCount = nonChatSectionItems[0]?.items.length ?? 0;
  const agentOptionCount = agentItems[0]?.items.length ?? 0;

  return (
    <>
      <div className="mt-3 rounded-md border border-setta-200/70 bg-white/70 p-3 shadow-sm dark:border-setta-800 dark:bg-setta-900/40">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
            Context & Links
          </p>
          <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
            Add context sources, scope boundaries, or linked agents for this
            chat.
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-setta-600 dark:text-setta-300">
              Context sources
            </p>
            <IdNameCombobox
              allItems={nonChatSectionItems}
              value={null}
              small={true}
              onSelectedItemChange={handleAddContextSection}
              placeholder={
                contextOptionCount > 0
                  ? "Add a section"
                  : "No sections available"
              }
              outerDivClasses="justify-center"
              inputOuterClasses="!h-7"
              isDisabled={!canEditLinks || contextOptionCount === 0}
              selectedItemCanBeNull
              clearInputAfterSelection
            />
            {contextEdges.length === 0 ? (
              <p className="text-[11px] text-setta-500 dark:text-setta-500">
                No context links yet.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {contextEdges.map((edge) => (
                  <div
                    key={edge.id}
                    className="flex items-center gap-2 rounded-md border border-setta-200/80 bg-white/80 px-2 py-1 text-[11px] text-setta-700 dark:border-setta-700/60 dark:bg-setta-900/70 dark:text-setta-200"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {sectionLabelsById[edge.targetSectionId] ??
                        edge.targetSectionId}
                    </span>
                    <select
                      value={
                        edge.contextMode ??
                        AgenticEdgeContextModeEnum.reference_only
                      }
                      onChange={(event) =>
                        updateAgenticEdgeContextMode(
                          edge.id,
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
                      onClick={() => deleteAgenticEdgesById([edge.id])}
                      disabled={!canEditLinks}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {summaryContextEdgeCount > 0 ? (
              <div className="mt-2 rounded-md border border-setta-200/80 bg-white/80 p-2 text-[11px] text-setta-700 shadow-sm dark:border-setta-700/60 dark:bg-setta-900/70 dark:text-setta-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-setta-600 dark:text-setta-300">
                    Summary cache
                  </span>
                  <button
                    type="button"
                    className="text-[10px] font-semibold text-setta-500 hover:text-setta-800 disabled:cursor-not-allowed disabled:opacity-70 dark:text-setta-400 dark:hover:text-setta-200"
                    onClick={fetchSummaryCacheStatus}
                    disabled={summaryCacheStatusLoading}
                  >
                    Refresh
                  </button>
                </div>
                {summaryCacheStatusLoading ? (
                  <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
                    Loading summary cache status...
                  </p>
                ) : summaryCacheStatusError ? (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                    Failed to load summary cache status:{" "}
                    {summaryCacheStatusError}
                  </p>
                ) : summaryCacheStatus ? (
                  <div className="mt-1 flex flex-col gap-1 text-[11px] text-setta-500 dark:text-setta-400">
                    <p>
                      Cached: {summaryCacheStatus.cachedSectionIds.length}/
                      {summaryCacheStatus.summarySectionIds.length}. Missing:{" "}
                      {summaryCacheStatus.missingSectionIds.length}. Deferred
                      due to cap ({summaryCacheStatus.maxSummariesPerRun}):{" "}
                      {Math.max(
                        summaryCacheStatus.missingSectionIds.length -
                          summaryCacheStatus.consideredSectionIds.length,
                        0,
                      )}
                      .
                    </p>
                    {summaryCacheStatus.emptySourceSectionIds.length > 0 ? (
                      <p>
                        Empty deterministic sources:{" "}
                        {summaryCacheStatus.emptySourceSectionIds.length}.
                      </p>
                    ) : null}
                    <p>
                      Missing summaries fall back to a deterministic excerpt in
                      the Agentic Context message until cached.
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
                    Summary cache status unavailable.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-setta-600 dark:text-setta-300">
              Scope sections
            </p>
            <IdNameCombobox
              allItems={nonChatSectionItems}
              value={null}
              small={true}
              onSelectedItemChange={handleAddScopeSection}
              placeholder={
                scopeOptionCount > 0 ? "Add a section" : "No sections available"
              }
              outerDivClasses="justify-center"
              inputOuterClasses="!h-7"
              isDisabled={!canEditLinks || scopeOptionCount === 0}
              selectedItemCanBeNull
              clearInputAfterSelection
            />
            {scopeEdges.length === 0 ? (
              <p className="text-[11px] text-setta-500 dark:text-setta-500">
                No scope links yet.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {scopeEdges.map((edge) => (
                  <div
                    key={edge.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-setta-200/80 bg-white/80 px-2 py-1 text-[11px] text-setta-700 dark:border-setta-700/60 dark:bg-setta-900/70 dark:text-setta-200"
                  >
                    <span className="truncate">
                      {sectionLabelsById[edge.targetSectionId] ??
                        edge.targetSectionId}
                    </span>
                    <button
                      type="button"
                      className="text-[10px] font-semibold text-setta-500 hover:text-setta-800 dark:text-setta-400 dark:hover:text-setta-200"
                      onClick={() => deleteAgenticEdgesById([edge.id])}
                      disabled={!canEditLinks}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-setta-600 dark:text-setta-300">
              Linked agents
            </p>
            <IdNameCombobox
              allItems={agentItems}
              value={null}
              small={true}
              onSelectedItemChange={handleAddAgentLink}
              placeholder={
                agentOptionCount > 0 ? "Link a chat" : "No other chats"
              }
              outerDivClasses="justify-center"
              inputOuterClasses="!h-7"
              isDisabled={!canEditLinks || agentOptionCount === 0}
              selectedItemCanBeNull
              clearInputAfterSelection
            />
            {linkedAgentEdges.length === 0 ? (
              <p className="text-[11px] text-setta-500 dark:text-setta-500">
                No linked agents yet.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {linkedAgentEdges.map((edge) => {
                  const otherId =
                    edge.sourceSectionId === sectionId
                      ? edge.targetSectionId
                      : edge.sourceSectionId;
                  return (
                    <div
                      key={edge.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-setta-200/80 bg-white/80 px-2 py-1 text-[11px] text-setta-700 dark:border-setta-700/60 dark:bg-setta-900/70 dark:text-setta-200"
                    >
                      <span className="truncate">
                        {sectionLabelsById[otherId] ?? otherId}
                      </span>
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-setta-500 hover:text-setta-800 dark:text-setta-400 dark:hover:text-setta-200"
                        onClick={() => deleteAgenticEdgesById([edge.id])}
                        disabled={!canEditLinks}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

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
          {!hasAgenticScope ? (
            <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              No outgoing scope links = no access.
            </p>
          ) : null}
          <p className="text-[11px] text-setta-500 dark:text-setta-400">
            Use Project Chat for full access.
          </p>
        </div>

        <div className="mt-3 grid gap-3">
          {scopeBlocks.map((block) => (
            <AgenticScopeBlock key={block.label} {...block} />
          ))}
        </div>
      </div>
    </>
  );
}
