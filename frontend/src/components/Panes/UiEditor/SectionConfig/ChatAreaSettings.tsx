import { buildEngineGroups } from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";
import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createAgenticEdgeFromSections,
  deleteAgenticEdgesById,
  updateAgenticEdgeContextMode,
} from "state/actions/agenticEdges";
import { updateEngineConfig } from "state/actions/ai";
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
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_agentic_summary_cache_status,
  route_set_chat_section_chat_id,
  route_set_chat_section_settings,
} from "utils/generatedEndpoints";
import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  AgenticSummaryCacheStatus,
  EngineTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

type ChatAreaSettingsProps = {
  sectionId: string;
};

type ChatSectionSettingsPayload = {
  managed: boolean;
  engineConfigId: string | null;
  agentProfileId: string | null;
  thinking: boolean;
  permissionMode: "minimal" | "yolo" | "config_toml_custom";
  searchEnabled: boolean;
};

export function ChatAreaSettings({ sectionId }: ChatAreaSettingsProps) {
  useHydrateLLMState();
  useHydrateAgenticState();
  const projectConfigId = getCurrProjectConfigId();
  const { canEditParams, canEditStructure } = useShareCapabilities();
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);

  const {
    managed,
    engineConfigId,
    agentProfileId,
    thinking,
    permissionMode,
    searchEnabled,
    isFrozen,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
    return {
      managed: impl.managed,
      engineConfigId: impl.engineConfigId,
      agentProfileId: impl.agentProfileId,
      thinking: impl.thinking,
      permissionMode: impl.permissionMode,
      searchEnabled: impl.searchEnabled,
      isFrozen: impl.isFrozen,
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

  const { apiKeys, allLLMConfigs, agentProfiles, engineConfigs } = useAIStore(
    (state) => ({
      apiKeys: state.apiKeys,
      allLLMConfigs: state.allLLMConfigs,
      agentProfiles: state.agentProfiles,
      engineConfigs: state.engineConfigs,
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
  const canEditSettings = !isDeploymentMode || canEditParams;
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
    const items = sectionOptions
      .filter((entry) => entry.type === SectionTypeEnum.Chat)
      .map((entry) => ({ id: entry.id, name: entry.name }));
    return [{ group: "Chat Sections", items }];
  }, [sectionOptions]);

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
          edge.kind === AgenticEdgeKindEnum.section_chat &&
          edge.targetSectionId === sectionId,
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
          (edge.sourceSectionId === sectionId ||
            edge.targetSectionId === sectionId),
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
    const ids = new Set<string>(agenticScope.readSectionIds);
    agenticScope.peerChatSectionIds.forEach((id) => ids.add(id));
    return buildScopeEntries(ids);
  }, [agenticScope, buildScopeEntries]);

  const scopeWriteEntries = useMemo(
    () => buildScopeEntries(agenticScope.writeSectionIds),
    [agenticScope, buildScopeEntries],
  );

  const scopeContextEntries = useMemo(
    () => buildScopeEntries(agenticScope.contextSectionIds),
    [agenticScope, buildScopeEntries],
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
            thinking: nextSettings.thinking,
            permissionMode: nextSettings.permissionMode,
            searchEnabled: nextSettings.searchEnabled,
          });
        },
        send: (frontendOpId) =>
          route_set_chat_section_settings({
            projectConfigId,
            sectionId,
            managed: nextSettings.managed,
            engineConfigId: nextSettings.engineConfigId,
            agentProfileId: nextSettings.agentProfileId,
            thinking: nextSettings.thinking,
            permissionMode: nextSettings.permissionMode,
            searchEnabled: nextSettings.searchEnabled,
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
        thinking,
        permissionMode,
        searchEnabled,
      });
    },
    [
      agentProfileId,
      engineConfigId,
      permissionMode,
      searchEnabled,
      thinking,
      updateSettings,
    ],
  );

  const handleThinkingChange = useCallback(
    (value: boolean) => {
      updateSettings({
        managed,
        engineConfigId,
        agentProfileId,
        thinking: value,
        permissionMode,
        searchEnabled,
      });
    },
    [
      agentProfileId,
      engineConfigId,
      managed,
      permissionMode,
      searchEnabled,
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
        agentProfileId: value,
        thinking,
        permissionMode,
        searchEnabled,
      });
    },
    [
      engineConfigId,
      managed,
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
        sourceSectionId: value,
        targetSectionId: sectionId,
        kind: AgenticEdgeKindEnum.section_chat,
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
        thinking,
        permissionMode,
        searchEnabled,
      });
      if (nextEngineId !== selectedEngineId) {
        handleNewChat();
      }
    },
    [
      agentProfileId,
      handleNewChat,
      managed,
      permissionMode,
      searchEnabled,
      selectedEngineId,
      thinking,
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
  const contextOptionCount = contextItems[0]?.items.length ?? 0;
  const scopeOptionCount = scopeItems[0]?.items.length ?? 0;
  const agentOptionCount = agentItems[0]?.items.length ?? 0;
  const hasAgenticEdges =
    contextEdges.length + scopeEdges.length + linkedAgentEdges.length > 0;

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
              allItems={contextItems}
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
                      {sectionLabelsById[edge.sourceSectionId] ??
                        edge.sourceSectionId}
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
              allItems={scopeItems}
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
          {!hasAgenticEdges ? (
            <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              No edges = no access.
            </p>
          ) : null}
          <p className="text-[11px] text-setta-500 dark:text-setta-400">
            Use Project Chat for full access.
          </p>
        </div>

        <div className="mt-3 grid gap-3">
          {[
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
          ].map((block) => (
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
    </div>
  );
}
