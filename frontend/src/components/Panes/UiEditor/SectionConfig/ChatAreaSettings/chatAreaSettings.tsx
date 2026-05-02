import {
  callOpenAPI,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

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

import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";

import _ from "lodash";

import {
  getAgenticSummaryCacheStatus,
  setChatSectionChatId,
  setChatSectionSettings,
  type AgenticsummarycacheAgenticSummaryCacheStatus as AgenticSummaryCacheStatus,
} from "openapi/http";

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
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  ChatWindowModeEnum,
  EngineTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

import { filterExecutableLinkedChatTargets } from "../chatAreaLinkedChatTargets";

import {
  AgenticScopeBlock,
  AgenticScopeCard,
  AgenticSummaryCacheStatusRouteResponse,
  CHAT_MODE_ITEMS,
  CONTEXT_MODE_OPTIONS,
  ChatAreaSettingsProps,
  ChatModeField,
  ChatSectionSettingsPayload,
  ContextAndLinksCard,
  ContextLinkRow,
  ManagedChatSettings,
  ManagedModeToggle,
  SimpleLinkRow,
  buildSectionLabelsById,
  buildSectionOptions,
  resolveSectionLabel,
} from "./settingsSections";

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
  const sectionLabelsById = useMemo(
    () => buildSectionLabelsById(sections),
    [sections],
  );
  const sectionOptions = useMemo(
    () =>
      buildSectionOptions({
        sectionId,
        sections,
        sectionVariants,
        sectionImpls,
        sectionVariantMap,
      }),
    [sectionId, sectionImpls, sectionVariantMap, sectionVariants, sections],
  );
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
        modeItems={CHAT_MODE_ITEMS}
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
        contextModeOptions={CONTEXT_MODE_OPTIONS}
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
