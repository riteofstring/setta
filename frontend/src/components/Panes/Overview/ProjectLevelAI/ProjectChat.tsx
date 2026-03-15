import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import { resolveProviderDictationAvailability } from "components/Chat/dictationMode";
import {
  buildEngineGroups,
  getChatPlaceholderText,
  getExternalEngineIssueMessage,
  getExternalEngineStatus,
} from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";
import { shouldShowPlanModeBadge } from "components/Chat/planModeBadgeUtils";
import { buildOverviewProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import _ from "lodash";
import {
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getRunInputString,
  getRunLastUpdatedMs,
} from "state/actions/agentRunUtils";
import { updateEngineConfig } from "state/actions/aiConfigurationCatalogMutations";
import { saveLLMConfig } from "state/actions/aiLLMConfiguration";
import { buildChatHistoryEntries } from "state/actions/chatHistoryEntries";
import {
  buildChatProvenanceByChatId,
  resolveScopedChatProvenanceForChatId,
} from "state/actions/chatHistoryProvenance";
import type { ChatHistoryCompatibility } from "state/actions/chatHistoryTypes";
import { addPersistentNotification } from "state/actions/notifications";
import {
  useAIStore,
  useProjectState,
  type ProjectChatAuxView,
} from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { getDefaultChatAppGenerationDetails } from "state/utils/chatAppGenerationDetails";
import {
  BaseChatMessageUnion,
  EngineConfig,
  EngineTypeEnum,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { ProjectChatAuxViewContent } from "./projectChatAuxViewContent";
import {
  findPreferredProjectChatEngineId,
  resolveProjectChatEngineConfigIdForSelectedChat,
  resolveProjectChatEngineSwitchContinuationOnEngineChange,
  resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad,
  resolveProjectChatSelectedLLMUnavailableReason,
  shouldProjectChatSkipEngineSyncForContinuation,
} from "./projectChatEngineSelection";
import {
  getDefaultProjectChatPermissionMode,
  type ProjectChatBlockedErrorCode,
} from "./projectChatExecutionSettings";
import { resolveProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";
import { type ProjectDictationMode } from "./projectChatSettingsPopover";
import { ProjectChatSurfaceBody } from "./projectChatSurfaceBody";
import { ProjectChatSurfaceChrome } from "./projectChatSurfaceChrome";
import { useProjectChatThreadSession } from "./projectChatThreadSession";
import { useHydrateAgenticState } from "./useHydrateAgenticState";
import { useHydrateLLMState } from "./useHydrateLLMState";
import { useProjectChatConversationSearch } from "./useProjectChatConversationSearch";
import { useProjectChatInlineThreadsLayout } from "./useProjectChatInlineThreadsLayout";

export { resolveProjectChatThreadBlockedErrorCodeForSelectedChat } from "./projectChatHydrationAuthority";

type ResolveProjectChatAuxViewByProjectConfigIdUpdateInput = {
  projectChatAuxViewByProjectConfigId: Record<string, ProjectChatAuxView>;
  projectConfigId: string;
  nextAuxView: ProjectChatAuxView;
};

type ResolveProjectChatDraftMessageByProjectConfigIdUpdateInput = {
  draftMessageByProjectConfigId: Record<string, string>;
  projectConfigId: string;
  nextDraftMessage: string;
};

type ProjectChatProps = {
  surfaceId?: string;
  chatId?: string | null | undefined;
  setChatId?: (next: SetStateAction<string | null | undefined>) => void;
  onBlockedErrorCodeChange?: (
    errorCode: ProjectChatBlockedErrorCode | null,
  ) => void;
};

export function resolveProjectChatAuxViewByProjectConfigIdUpdate({
  projectChatAuxViewByProjectConfigId,
  projectConfigId,
  nextAuxView,
}: ResolveProjectChatAuxViewByProjectConfigIdUpdateInput): Record<
  string,
  ProjectChatAuxView
> | null {
  const currentAuxView =
    projectChatAuxViewByProjectConfigId[projectConfigId] ?? "none";
  if (currentAuxView === nextAuxView) {
    return null;
  }
  const nextByProjectConfigId = {
    ...projectChatAuxViewByProjectConfigId,
  };
  if (nextAuxView === "none") {
    delete nextByProjectConfigId[projectConfigId];
  } else {
    nextByProjectConfigId[projectConfigId] = nextAuxView;
  }
  return nextByProjectConfigId;
}

export function resolveProjectChatDraftMessageByProjectConfigIdUpdate({
  draftMessageByProjectConfigId,
  projectConfigId,
  nextDraftMessage,
}: ResolveProjectChatDraftMessageByProjectConfigIdUpdateInput): Record<
  string,
  string
> | null {
  const currentDraftMessage =
    draftMessageByProjectConfigId[projectConfigId] ?? "";
  if (currentDraftMessage === nextDraftMessage) {
    return null;
  }
  const nextByProjectConfigId = {
    ...draftMessageByProjectConfigId,
  };
  if (nextDraftMessage === "") {
    delete nextByProjectConfigId[projectConfigId];
  } else {
    nextByProjectConfigId[projectConfigId] = nextDraftMessage;
  }
  return nextByProjectConfigId;
}

export function setProjectChatAuxViewForActiveProject(
  nextAuxView: ProjectChatAuxView,
): void {
  useLocalStorage.setState((state) => {
    const activeProjectConfigId = useProjectState.getState().projectConfig.id;
    const nextByProjectConfigId =
      resolveProjectChatAuxViewByProjectConfigIdUpdate({
        projectChatAuxViewByProjectConfigId:
          state.projectChatAuxViewByProjectConfigId,
        projectConfigId: activeProjectConfigId,
        nextAuxView,
      });
    if (!nextByProjectConfigId) {
      return state;
    }
    return {
      projectChatAuxViewByProjectConfigId: nextByProjectConfigId,
    };
  });
}

function setProjectChatDraftMessageForProjectConfig(
  projectConfigId: string,
  nextDraftMessage: SetStateAction<string>,
): void {
  useLocalStorage.setState((state) => {
    const currentDraftMessage =
      state.projectChatDraftMessageByProjectConfigId[projectConfigId] ?? "";
    const resolvedNextDraftMessage =
      typeof nextDraftMessage === "function"
        ? nextDraftMessage(currentDraftMessage)
        : nextDraftMessage;
    const nextByProjectConfigId =
      resolveProjectChatDraftMessageByProjectConfigIdUpdate({
        draftMessageByProjectConfigId:
          state.projectChatDraftMessageByProjectConfigId,
        projectConfigId,
        nextDraftMessage: resolvedNextDraftMessage,
      });
    if (!nextByProjectConfigId) {
      return state;
    }
    return {
      projectChatDraftMessageByProjectConfigId: nextByProjectConfigId,
    };
  });
}

function setProjectChatThreadVisibility(
  nextVisibility: SetStateAction<boolean>,
): void {
  useAIStore.setState((state) => {
    const resolvedNextVisibility =
      typeof nextVisibility === "function"
        ? nextVisibility(state.viewThreads)
        : nextVisibility;
    if (resolvedNextVisibility === state.viewThreads) {
      return state;
    }
    return {
      viewThreads: resolvedNextVisibility,
    };
  });
}

function setProjectChatThreadsClosedAtLargeWidthPreference(
  nextClosed: boolean,
): void {
  useAIStore.setState((state) => {
    if (state.projectChatThreadsExplicitlyClosedAtLargeWidth === nextClosed) {
      return state;
    }
    return {
      projectChatThreadsExplicitlyClosedAtLargeWidth: nextClosed,
    };
  });
}

export function ProjectChat({
  surfaceId,
  chatId: controlledChatId,
  setChatId: controlledSetChatId,
  onBlockedErrorCodeChange,
}: ProjectChatProps = {}) {
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const resolvedSurfaceId =
    surfaceId ?? buildOverviewProjectChatSurfaceId(projectConfigId);
  return (
    <ProjectChatSurface
      key={resolvedSurfaceId}
      resolvedSurfaceId={resolvedSurfaceId}
      controlledChatId={controlledChatId}
      controlledSetChatId={controlledSetChatId}
      onBlockedErrorCodeChange={onBlockedErrorCodeChange}
    />
  );
}

// Owns project-chat store selection, hydration authority, engine sync, and surface wiring.
// Draft-thread lifecycle and pending-chat continuity now live in projectChatThreadSession.ts.
function ProjectChatSurface({
  resolvedSurfaceId,
  controlledChatId,
  controlledSetChatId,
  onBlockedErrorCodeChange,
}: {
  resolvedSurfaceId: string;
  controlledChatId: string | null | undefined;
  controlledSetChatId?: (
    next: SetStateAction<string | null | undefined>,
  ) => void;
  onBlockedErrorCodeChange?: (
    errorCode: ProjectChatBlockedErrorCode | null,
  ) => void;
}) {
  const globalChatId = useAIStore((state) => state.activeChatId);
  const agentRuns = useAIStore((state) => state.agentRuns);
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const setGlobalChatId = useCallback(
    (next: SetStateAction<string | null | undefined>) => {
      useAIStore.setState((state) => {
        const resolved =
          typeof next === "function" ? next(state.activeChatId) : next;
        return { activeChatId: resolved };
      });
    },
    [],
  );
  const chatId =
    controlledSetChatId !== undefined ? controlledChatId : globalChatId;
  const setChatId = controlledSetChatId ?? setGlobalChatId;
  const [thinking, setThinking] = useState(true);
  const {
    conversationFilterText,
    setConversationFilterText,
    conversationSearchCounterText,
    conversationSearchMatchCount,
    conversationSearchMatchIndex,
    hasConversationSearchTerms,
    handleConversationSearchMatchCountChange,
    handleStepConversationSearch,
  } = useProjectChatConversationSearch({
    chatId,
  });
  useHydrateLLMState();
  useHydrateAgenticState();
  const activeConversationMessages = useAIStore((state) => {
    if (chatId === null) {
      const pendingMessages =
        state.pendingChatDetailsBySurfaceId[resolvedSurfaceId]?.messages;
      if (Array.isArray(pendingMessages)) {
        return pendingMessages as Array<BaseChatMessageUnion>;
      }
      return [];
    }
    if (typeof chatId !== "string") {
      return [];
    }
    const activeMessages = state.chatDetails[chatId]?.messages;
    if (Array.isArray(activeMessages)) {
      return activeMessages as Array<BaseChatMessageUnion>;
    }
    return [];
  });
  const activeConversationAppGenerationDetails = useAIStore((state) => {
    if (chatId === null) {
      return (
        state.pendingChatAppGenerationDetailsBySurfaceId[resolvedSurfaceId] ??
        getDefaultChatAppGenerationDetails()
      );
    }
    if (typeof chatId !== "string") {
      return getDefaultChatAppGenerationDetails();
    }
    return (
      state.chatAppGenerationDetailsByChatId[chatId] ??
      getDefaultChatAppGenerationDetails()
    );
  });
  const selectedChatWaitingForResponse = useAIStore((state) => {
    if (chatId === null) {
      return Boolean(
        state.pendingChatDetailsBySurfaceId[resolvedSurfaceId]
          ?.waitingForResponse,
      );
    }
    if (typeof chatId !== "string") {
      return false;
    }
    return Boolean(state.chatDetails[chatId]?.waitingForResponse);
  });

  const {
    apiKeys,
    apiKeysAuthoritative,
    apiKeysInitialLoadComplete,
    allLLMConfigs,
    llmConfigInitialLoadComplete,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
    externalAgentConfigs,
    engineConfigs,
    engineConfigsInitialLoadComplete,
    engineConfigsLoadError,
    transcriptionProfiles,
    transcriptionProfilesInitialLoadComplete,
    projectChatDictationMode,
    projectChatTranscriptionProfileId,
    projectChatActivityAccordionOpenByDefault,
    projectChatActivityChildrenOpenByDefault,
    agentRunsLoadError,
    agentRunsAuthorityState,
  } = useAIStore(
    (x) => ({
      apiKeys: x.apiKeys,
      apiKeysAuthoritative: x.apiKeysAuthoritative,
      apiKeysInitialLoadComplete: x.apiKeysInitialLoadComplete,
      allLLMConfigs: x.allLLMConfigs,
      llmConfigInitialLoadComplete: x.allLLMConfigsInitialLoadComplete,
      externalAgentHealth: x.externalAgentHealth,
      externalAgentHealthInitialLoadComplete:
        x.externalAgentHealthInitialLoadComplete,
      externalAgentConfigs: x.externalAgentConfigs,
      engineConfigs: x.engineConfigs,
      engineConfigsInitialLoadComplete: x.engineConfigsInitialLoadComplete,
      engineConfigsLoadError: x.engineConfigsLoadError,
      transcriptionProfiles: x.transcriptionProfiles,
      transcriptionProfilesInitialLoadComplete:
        x.transcriptionProfilesInitialLoadComplete,
      projectChatDictationMode: x.projectChatDictationMode,
      projectChatTranscriptionProfileId: x.projectChatTranscriptionProfileId,
      projectChatActivityAccordionOpenByDefault:
        x.projectChatActivityAccordionOpenByDefault,
      projectChatActivityChildrenOpenByDefault:
        x.projectChatActivityChildrenOpenByDefault,
      agentRunsLoadError: x.agentRunsLoadError,
      agentRunsAuthorityState: x.agentRunsAuthorityState,
    }),
    _.isEqual,
  );
  const { threadAssignments, threadGroups } = useLocalStorage(
    (state) => ({
      threadAssignments:
        state.projectChatThreadAssignmentsByProjectConfigId[projectConfigId] ??
        {},
      threadGroups:
        state.projectChatThreadGroupsByProjectConfigId[projectConfigId] ?? [],
    }),
    _.isEqual,
  );
  const projectChatAuxView = useLocalStorage((state): ProjectChatAuxView => {
    return state.projectChatAuxViewByProjectConfigId[projectConfigId] ?? "none";
  });
  const draftMessageByProjectConfigId = useLocalStorage(
    (state) => state.projectChatDraftMessageByProjectConfigId,
    _.isEqual,
  );
  const viewThreads = useAIStore((state) => state.viewThreads);
  const projectChatThreadsExplicitlyClosedAtLargeWidth = useAIStore(
    (state) => state.projectChatThreadsExplicitlyClosedAtLargeWidth,
  );
  const defaultSelectedEngineId = useAIStore(
    (state) => state.projectChatSelectedEngineId,
  );
  const [selectedEngineId, setSelectedEngineId] = useState<string | null>(
    defaultSelectedEngineId,
  );
  const setProjectChatAuxView = useCallback(
    (nextAuxView: ProjectChatAuxView) => {
      setProjectChatAuxViewForActiveProject(nextAuxView);
    },
    [],
  );
  const setViewThreads = useCallback(
    (nextVisibility: SetStateAction<boolean>) => {
      setProjectChatThreadVisibility(nextVisibility);
    },
    [],
  );
  const setProjectChatThreadsExplicitlyClosedAtLargeWidth = useCallback(
    (nextClosed: boolean) => {
      setProjectChatThreadsClosedAtLargeWidthPreference(nextClosed);
    },
    [],
  );
  const draftMessage = draftMessageByProjectConfigId[projectConfigId] ?? "";
  const setDraftMessage = useCallback(
    (next: SetStateAction<string>) => {
      setProjectChatDraftMessageForProjectConfig(projectConfigId, next);
    },
    [projectConfigId],
  );
  const [runtimePermissionMode, setRuntimePermissionMode] =
    useState<ChatPermissionModeValue>("minimal");
  const notifiedExternalEngineIssueRef = useRef<string | null>(null);
  const {
    handleChatContainerRef,
    inlineThreadsHeaderPortalTarget,
    handleInlineThreadsHeaderHostRef,
    handleInlineThreadsHeaderShellRef,
    handleInlineThreadsResizableColumnRef,
    showInlineThreads,
    showThreadsOnlyView,
    isLargeEnoughForInlineThreads,
    resolvedInlineThreadsWidth,
    inlineThreadsMaxWidth,
    canResizeInlineThreads,
    handleInlineThreadsResize,
    handleInlineThreadsResizeStop,
  } = useProjectChatInlineThreadsLayout({
    viewThreads,
    hasAuxView: projectChatAuxView !== "none",
    projectChatThreadsExplicitlyClosedAtLargeWidth,
    setViewThreads,
  });

  const availableConfigGroups = useMemo(
    () => buildLLMConfigGroups(allLLMConfigs, apiKeys),
    [apiKeys, allLLMConfigs],
  );
  const availableConfigIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of availableConfigGroups) {
      for (const item of group.items) {
        ids.add(item.id);
      }
    }
    return ids;
  }, [availableConfigGroups]);
  const engineGroups = useMemo(
    () => buildEngineGroups(engineConfigs),
    [engineConfigs],
  );
  const engineConfigById = useMemo(() => {
    const nextById = new Map<string, EngineConfig>();
    for (const config of engineConfigs) {
      nextById.set(config.id, config);
    }
    return nextById;
  }, [engineConfigs]);
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
  const preferredEngineId = useMemo(
    () =>
      findPreferredProjectChatEngineId({
        engineConfigs,
        allLLMConfigs,
        availableConfigIds,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      }),
    [
      allLLMConfigs,
      availableConfigIds,
      engineConfigs,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    ],
  );

  const availableConfigCount = countLLMConfigs(availableConfigGroups);
  const noConfigsAvailable = availableConfigCount === 0;
  const selectedEngineConfig = useMemo(() => {
    if (!selectedEngineId) {
      return null;
    }
    return (
      engineConfigs.find((config) => config.id === selectedEngineId) ?? null
    );
  }, [engineConfigs, selectedEngineId]);
  const effectiveEngineConfig = useMemo(() => {
    if (selectedEngineConfig) {
      return selectedEngineConfig;
    }
    if (preferredEngineId) {
      return (
        engineConfigs.find((config) => config.id === preferredEngineId) ?? null
      );
    }
    return engineConfigs[0] ?? null;
  }, [engineConfigs, preferredEngineId, selectedEngineConfig]);
  const effectiveEngineId = effectiveEngineConfig?.id ?? null;
  const engineType = effectiveEngineConfig?.engineType ?? null;
  const selectedLLMConfigId = useMemo(() => {
    if (!effectiveEngineConfig) {
      return null;
    }
    if (effectiveEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
      return null;
    }
    return (
      effectiveEngineConfig.settaLlmConfigId ??
      pickDefaultConfigId(allLLMConfigs)
    );
  }, [allLLMConfigs, effectiveEngineConfig]);
  const selectedTranscriptionProfile = useMemo(() => {
    if (!projectChatTranscriptionProfileId) {
      return null;
    }
    return (
      transcriptionProfiles.find(
        (profile) => profile.id === projectChatTranscriptionProfileId,
      ) ?? null
    );
  }, [projectChatTranscriptionProfileId, transcriptionProfiles]);
  const { providerDictationAvailable, providerDictationUnavailableReason } =
    useMemo(
      () =>
        resolveProviderDictationAvailability({
          selectedTranscriptionProfile,
          allLLMConfigs,
          apiKeys,
          apiKeysAuthoritative,
        }),
      [
        allLLMConfigs,
        apiKeys,
        apiKeysAuthoritative,
        selectedTranscriptionProfile,
      ],
    );
  const defaultLLMConfigId = allLLMConfigs?.default_config_id ?? null;
  const providerDictationLikelySupported = providerDictationAvailable;
  const hasLLMConfig = Boolean(
    selectedLLMConfigId && availableConfigIds.has(selectedLLMConfigId),
  );
  const llmSelectionUnavailableReason = useMemo(
    () =>
      resolveProjectChatSelectedLLMUnavailableReason({
        engineType,
        selectedLLMConfigId,
        allLLMConfigs,
        availableConfigIds,
      }),
    [allLLMConfigs, availableConfigIds, engineType, selectedLLMConfigId],
  );
  const externalEngineStatus = useMemo(
    () =>
      getExternalEngineStatus(
        effectiveEngineConfig,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      ),
    [
      effectiveEngineConfig,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    ],
  );
  const externalEngineAvailable = externalEngineStatus
    ? externalEngineStatus.status === "available"
    : true;
  const externalAgentConfig = useMemo(() => {
    if (!effectiveEngineConfig?.externalAgentConfigId) {
      return null;
    }
    return (
      externalAgentConfigs.find(
        (config) => config.id === effectiveEngineConfig.externalAgentConfigId,
      ) ?? null
    );
  }, [externalAgentConfigs, effectiveEngineConfig]);
  const showPlanModeBadge = shouldShowPlanModeBadge({
    engineType,
    externalAgentToolType: externalAgentConfig?.toolType ?? null,
    approvalPolicy: externalAgentConfig?.approvalPolicy ?? null,
    permissionMode: runtimePermissionMode,
  });
  const placeholderText = getChatPlaceholderText({
    engineType,
    hasEngineConfig: Boolean(effectiveEngineConfig),
    hasLLMConfig,
    noLLMConfigsAvailable: noConfigsAvailable,
  });
  const projectHistoryRunType = useMemo(() => {
    if (engineType === EngineTypeEnum.external_agent) {
      return "external_agent";
    }
    if (engineType === EngineTypeEnum.setta_llm) {
      return "llm_chat";
    }
    return null;
  }, [engineType]);
  const externalEngineIssueMessage = useMemo(
    () => getExternalEngineIssueMessage(externalEngineStatus),
    [externalEngineStatus],
  );
  const historyCompatibility = useMemo<ChatHistoryCompatibility | null>(() => {
    if (!projectHistoryRunType) {
      return null;
    }
    return {
      runType: projectHistoryRunType,
      engineConfigId: effectiveEngineId,
    };
  }, [effectiveEngineId, projectHistoryRunType]);
  const chatHistoryEntries = useMemo(
    () =>
      buildChatHistoryEntries(agentRuns, {
        projectConfigId,
        unscopedOnly: true,
        compatibility: historyCompatibility,
      }),
    [agentRuns, historyCompatibility, projectConfigId],
  );
  const chatHistoryEntriesById = useMemo(() => {
    const entriesById = new Map<string, (typeof chatHistoryEntries)[number]>();
    for (const entry of chatHistoryEntries) {
      entriesById.set(entry.chatId, entry);
    }
    return entriesById;
  }, [chatHistoryEntries]);
  const chatProvenanceByChatIdMap = useMemo(
    () =>
      buildChatProvenanceByChatId(agentRuns, {
        projectConfigId,
        unscopedOnly: true,
      }),
    [agentRuns, projectConfigId],
  );
  const selectedScopedChatProvenance = useMemo(() => {
    if (typeof chatId !== "string") {
      return { status: "missing" } as const;
    }
    return resolveScopedChatProvenanceForChatId(agentRuns, {
      chatId,
      projectConfigId,
      unscopedOnly: true,
    });
  }, [agentRuns, chatId, projectConfigId]);
  const chatEngineConfigByChatId = useMemo(() => {
    const nextByChatId = new Map<string, string | null>();
    for (const [runChatId, provenance] of chatProvenanceByChatIdMap.entries()) {
      nextByChatId.set(runChatId, provenance.engineConfigId);
    }
    return nextByChatId;
  }, [chatProvenanceByChatIdMap]);
  const selectedChatHydrationAuthority = useMemo(
    () =>
      resolveProjectChatHydrationAuthority({
        chatId,
        selectedScopedChatProvenance,
        chatProvenanceAuthoritative: agentRunsAuthorityState === "ready",
        engineConfigById,
        engineConfigsAuthoritative:
          engineConfigsInitialLoadComplete && engineConfigsLoadError === null,
        engineType,
      }),
    [
      chatId,
      selectedScopedChatProvenance,
      agentRunsAuthorityState,
      engineConfigById,
      engineConfigsInitialLoadComplete,
      engineConfigsLoadError,
      engineType,
    ],
  );
  const selectedChatRunWatermark = useMemo(() => {
    if (typeof chatId !== "string") {
      return 0;
    }
    const normalizedChatId = chatId.trim();
    if (!normalizedChatId) {
      return 0;
    }
    let nextWatermark = 0;
    for (const run of agentRuns) {
      if (getRunInputString(run, "chatId") !== normalizedChatId) {
        continue;
      }
      nextWatermark = Math.max(nextWatermark, getRunLastUpdatedMs(run));
    }
    return nextWatermark;
  }, [agentRuns, chatId]);
  const selectedChatHydrationMetadataRevision = useMemo(() => {
    if (typeof chatId !== "string") {
      return "no-selected-chat";
    }
    const normalizedChatId = chatId.trim();
    if (!normalizedChatId) {
      return "no-selected-chat";
    }
    const selectedProvenance =
      chatProvenanceByChatIdMap.get(normalizedChatId) ?? null;
    const selectedProvenanceEngineConfigId =
      selectedProvenance?.engineConfigId ?? null;
    const selectedProvenanceEngineConfig = selectedProvenanceEngineConfigId
      ? engineConfigById.get(selectedProvenanceEngineConfigId) ?? null
      : null;
    const selectedEngineRevision = selectedProvenanceEngineConfig
      ? [
          selectedProvenanceEngineConfig.id,
          selectedProvenanceEngineConfig.engineType,
          selectedProvenanceEngineConfig.settaLlmConfigId ?? "",
          selectedProvenanceEngineConfig.externalAgentConfigId ?? "",
        ].join(":")
      : "missing_engine_config";
    return [
      selectedChatHydrationAuthority.status,
      selectedChatHydrationAuthority.hydrationRunType ?? "missing_run_type",
      selectedChatHydrationAuthority.blockedErrorCode ?? "not_blocked",
      selectedProvenanceEngineConfigId ?? "missing_engine_config_id",
      selectedEngineRevision,
      selectedChatRunWatermark,
      `runs_${agentRunsAuthorityState}`,
      agentRunsLoadError ?? "runs_ok",
      engineConfigsInitialLoadComplete ? "engines_ready" : "engines_loading",
      engineConfigsLoadError ?? "engines_ok",
    ].join("|");
  }, [
    agentRunsAuthorityState,
    agentRunsLoadError,
    chatId,
    chatProvenanceByChatIdMap,
    engineConfigById,
    engineConfigsInitialLoadComplete,
    engineConfigsLoadError,
    selectedChatHydrationAuthority.blockedErrorCode,
    selectedChatHydrationAuthority.hydrationRunType,
    selectedChatHydrationAuthority.status,
    selectedChatRunWatermark,
  ]);
  const availableEngineConfigIds = useMemo(
    () => new Set(engineConfigs.map((config) => config.id)),
    [engineConfigs],
  );
  const {
    clearThreadSession,
    draftThreadContinuationSourceChatId,
    draftThreadHint,
    engineSwitchContinuation,
    handleContinueInNewThread,
    handleDraftThreadSettled,
    handleDraftThreadStart,
    handleNewChatClick,
    handleNewChatInThreadGroup,
    handleNewChatStartForSubmit,
    selectedThreadGroupId,
    setEngineSwitchContinuation,
    setSelectedThreadGroupId,
  } = useProjectChatThreadSession({
    activeConversationAppGenerationDetails,
    activeConversationMessages,
    chatHistoryEntriesById,
    chatId,
    effectiveEngineId,
    projectConfigId,
    resolvedSurfaceId,
    setChatId,
    setProjectChatAuxView,
    setViewThreads,
    showInlineThreads,
    threadAssignments,
    threadGroups,
  });
  const engineSwitchContinuationBannerText = useMemo(() => {
    if (!engineSwitchContinuation) {
      return null;
    }
    const sourceEngineName =
      engineConfigById.get(engineSwitchContinuation.sourceEngineConfigId)
        ?.name ?? "the previous engine";
    const targetEngineName = engineSwitchContinuation.targetEngineConfigId
      ? engineConfigById.get(engineSwitchContinuation.targetEngineConfigId)
          ?.name ?? "the selected engine"
      : "the selected engine";
    return `Engine changed from ${sourceEngineName} to ${targetEngineName}. Continue in a new thread to keep engine provenance consistent.`;
  }, [engineConfigById, engineSwitchContinuation]);
  const requiresNewThreadForEngineSwitch = engineSwitchContinuation !== null;
  const newThreadContinuationRequiredReason = requiresNewThreadForEngineSwitch
    ? "Switching engines on an existing thread requires continuing in a new thread."
    : null;

  useEffect(() => {
    if (
      shouldProjectChatSkipEngineSyncForContinuation({
        continuation: engineSwitchContinuation,
        chatId,
      })
    ) {
      return;
    }
    const nextEngineConfigId = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId,
      selectedEngineId,
      availableEngineConfigIds,
      chatEngineConfigByChatId,
    });
    if (!nextEngineConfigId) {
      return;
    }
    setSelectedEngineId(nextEngineConfigId);
  }, [
    availableEngineConfigIds,
    engineSwitchContinuation,
    chatEngineConfigByChatId,
    chatId,
    selectedEngineId,
    setSelectedEngineId,
  ]);

  useEffect(() => {
    if (!externalEngineIssueMessage) {
      notifiedExternalEngineIssueRef.current = null;
      return;
    }
    if (notifiedExternalEngineIssueRef.current === externalEngineIssueMessage) {
      return;
    }
    notifiedExternalEngineIssueRef.current = externalEngineIssueMessage;
    addPersistentNotification(
      externalEngineIssueMessage,
      SettaNotificationTypeEnum.warning,
    );
  }, [externalEngineIssueMessage]);

  const handleEngineChange = useCallback(
    (value: string | null) => {
      const nextEngineId = value ?? null;
      if (nextEngineId === selectedEngineId) {
        return;
      }
      const nextContinuation =
        resolveProjectChatEngineSwitchContinuationOnEngineChange({
          chatId,
          nextEngineId,
          chatEngineConfigByChatId,
        });
      setSelectedEngineId(nextEngineId);
      useAIStore.setState({ projectChatSelectedEngineId: nextEngineId });
      setProjectChatAuxView("none");
      setEngineSwitchContinuation(nextContinuation);
      if (nextContinuation) {
        return;
      }
      clearThreadSession();
    },
    [
      clearThreadSession,
      chatEngineConfigByChatId,
      chatId,
      selectedEngineId,
      setProjectChatAuxView,
      setSelectedEngineId,
    ],
  );

  const handleLLMConfigChange = useCallback(
    (value: string | null) => {
      if (!effectiveEngineConfig) {
        return;
      }
      if (effectiveEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
        return;
      }
      const nextConfig = {
        ...effectiveEngineConfig,
        settaLlmConfigId: value,
      };
      void updateEngineConfig({ config: nextConfig });
    },
    [effectiveEngineConfig],
  );
  const handlePinDefaultModel = useCallback(() => {
    if (!allLLMConfigs || !selectedLLMConfigId) {
      return;
    }
    if (allLLMConfigs.default_config_id === selectedLLMConfigId) {
      return;
    }
    void saveLLMConfig({
      ...allLLMConfigs,
      default_config_id: selectedLLMConfigId,
    });
  }, [allLLMConfigs, selectedLLMConfigId]);
  const handleTranscriptionProfileChange = useCallback(
    (value: string | null) => {
      useAIStore.setState({ projectChatTranscriptionProfileId: value });
    },
    [],
  );
  const handleDictationModeChange = useCallback(
    (value: ProjectDictationMode) => {
      useAIStore.setState({ projectChatDictationMode: value });
    },
    [],
  );
  const handleActivityAccordionOpenByDefaultChange = useCallback(
    (value: boolean) => {
      useAIStore.setState({
        projectChatActivityAccordionOpenByDefault: value,
      });
    },
    [],
  );
  const handleActivityChildrenOpenByDefaultChange = useCallback(
    (value: boolean) => {
      useAIStore.setState({
        projectChatActivityChildrenOpenByDefault: value,
      });
    },
    [],
  );

  useEffect(() => {
    const resolvedSelectedEngineId =
      resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad({
        engineConfigsInitialLoadComplete,
        engineConfigs,
        selectedEngineId,
        preferredEngineId,
      });
    if (resolvedSelectedEngineId === selectedEngineId) {
      return;
    }
    setSelectedEngineId(resolvedSelectedEngineId);
  }, [
    engineConfigs,
    engineConfigsInitialLoadComplete,
    preferredEngineId,
    selectedEngineId,
    setSelectedEngineId,
  ]);
  useEffect(() => {
    if (!transcriptionProfilesInitialLoadComplete) {
      return;
    }
    if (!projectChatTranscriptionProfileId) {
      return;
    }
    const selectedProfile = transcriptionProfiles.find(
      (profile) => profile.id === projectChatTranscriptionProfileId,
    );
    if (!selectedProfile) {
      useAIStore.setState({ projectChatTranscriptionProfileId: null });
    }
  }, [
    projectChatTranscriptionProfileId,
    transcriptionProfiles,
    transcriptionProfilesInitialLoadComplete,
  ]);
  useEffect(() => {
    if (projectChatDictationMode !== "provider") {
      return;
    }
    if (providerDictationAvailable) {
      return;
    }
    useAIStore.setState({ projectChatDictationMode: "auto" });
  }, [projectChatDictationMode, providerDictationAvailable]);
  useEffect(() => {
    setRuntimePermissionMode(getDefaultProjectChatPermissionMode(engineType));
  }, [engineType]);
  const isAuxView = projectChatAuxView !== "none" || showThreadsOnlyView;
  const handleReturnToChat = useCallback(() => {
    if (projectChatAuxView !== "none") {
      setProjectChatAuxView("none");
      return;
    }
    setViewThreads(false);
  }, [projectChatAuxView]);
  const handleToggleThreads = useCallback(() => {
    setProjectChatAuxView("none");
    setViewThreads((current) => {
      const nextViewThreads = !current;
      if (isLargeEnoughForInlineThreads) {
        setProjectChatThreadsExplicitlyClosedAtLargeWidth(!nextViewThreads);
      }
      return nextViewThreads;
    });
  }, [isLargeEnoughForInlineThreads]);
  const handleOpenProjectSettingsAuxView = useCallback(() => {
    setProjectChatAuxView("ai_settings");
  }, [setProjectChatAuxView]);
  const handleOpenSkillsAuxView = useCallback(() => {
    setProjectChatAuxView("skills");
  }, [setProjectChatAuxView]);
  const handleOpenMcpAuxView = useCallback(() => {
    setProjectChatAuxView("mcp");
  }, [setProjectChatAuxView]);
  const handleOpenSlashCommandsAuxView = useCallback(() => {
    setProjectChatAuxView("slash_commands");
  }, [setProjectChatAuxView]);
  const auxViewContent =
    projectChatAuxView === "none" ? null : (
      <ProjectChatAuxViewContent
        projectChatAuxView={projectChatAuxView}
        projectConfigId={projectConfigId}
        chatId={chatId}
        engineConfigId={effectiveEngineId}
        engineType={engineType}
        externalAgentToolType={externalAgentConfig?.toolType ?? null}
      />
    );
  const settingsPopoverProps = {
    engineGroups,
    transcriptionProfileGroups,
    availableConfigGroups,
    selectedEngineId: effectiveEngineId,
    selectedLLMConfigId,
    llmSelectionUnavailableReason,
    selectedTranscriptionProfileId: projectChatTranscriptionProfileId,
    defaultLLMConfigId,
    engineType,
    noConfigsAvailable,
    dictationMode: projectChatDictationMode,
    activityAccordionOpenByDefault: projectChatActivityAccordionOpenByDefault,
    activityChildrenOpenByDefault: projectChatActivityChildrenOpenByDefault,
    providerDictationLikelySupported,
    providerDictationUnavailableReason,
    onOpenSkillsView: handleOpenSkillsAuxView,
    onOpenMcpView: handleOpenMcpAuxView,
    onOpenSlashCommandsView: handleOpenSlashCommandsAuxView,
    onOpenProjectSettingsView: handleOpenProjectSettingsAuxView,
    onEngineChange: handleEngineChange,
    onLLMConfigChange: handleLLMConfigChange,
    onTranscriptionProfileChange: handleTranscriptionProfileChange,
    onPinDefaultModel: handlePinDefaultModel,
    onDictationModeChange: handleDictationModeChange,
    onActivityAccordionOpenByDefaultChange:
      handleActivityAccordionOpenByDefaultChange,
    onActivityChildrenOpenByDefaultChange:
      handleActivityChildrenOpenByDefaultChange,
  };
  const historyProps = {
    chatId,
    setChatId,
    runType: projectHistoryRunType,
    engineConfigId: effectiveEngineId,
    draftThread: draftThreadHint,
    draftWaitingForResponse: selectedChatWaitingForResponse,
    selectedGroupId: selectedThreadGroupId,
    onSelectedGroupChange: setSelectedThreadGroupId,
    onStartNewThread: handleNewChatClick,
    onStartNewThreadInGroup: handleNewChatInThreadGroup,
  };
  const chatCoreProps = {
    surfaceId: resolvedSurfaceId,
    chatId,
    draftMessage,
    setDraftMessage,
    placeholderText,
    conversationFilterText,
    requiresNewThreadContinuation: requiresNewThreadForEngineSwitch,
    newThreadContinuationRequiredReason,
    newThreadSeedChatId: draftThreadContinuationSourceChatId,
    hydrationAuthority: selectedChatHydrationAuthority,
    hydrationMetadataRevision: selectedChatHydrationMetadataRevision,
    thinking,
    engineConfigId: effectiveEngineId,
    engineType,
    hasLLMConfig,
    externalEngineAvailable,
    noLLMConfigsAvailable: noConfigsAvailable,
    transcriptionProfileId: projectChatTranscriptionProfileId,
    dictationMode: projectChatDictationMode,
    providerDictationAvailable,
    providerDictationLikelySupported,
    setChatId,
    onConversationSearchMatchCountChange:
      handleConversationSearchMatchCountChange,
    onStartNewChat: handleNewChatStartForSubmit,
    onDraftThreadStart: handleDraftThreadStart,
    onDraftThreadSettled: handleDraftThreadSettled,
    onThinkingChange: setThinking,
    onPermissionModeChange: setRuntimePermissionMode,
    onBlockedErrorCodeChange,
    activeConversationSearchMatchIndex: conversationSearchMatchIndex,
  };

  return (
    apiKeysInitialLoadComplete &&
    llmConfigInitialLoadComplete &&
    engineConfigsInitialLoadComplete && (
      <div
        ref={handleChatContainerRef}
        className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden @container"
      >
        <ProjectChatSurfaceChrome
          showInlineThreads={showInlineThreads}
          handleInlineThreadsHeaderShellRef={handleInlineThreadsHeaderShellRef}
          handleInlineThreadsHeaderHostRef={handleInlineThreadsHeaderHostRef}
          resolvedInlineThreadsWidth={resolvedInlineThreadsWidth}
          projectChatAuxView={projectChatAuxView}
          isAuxView={isAuxView}
          onReturnToChat={handleReturnToChat}
          onNewChatClick={handleNewChatClick}
          onToggleThreads={handleToggleThreads}
          viewThreads={viewThreads}
          showPlanModeBadge={showPlanModeBadge}
          settingsPopoverProps={settingsPopoverProps}
          conversationFilterText={conversationFilterText}
          onConversationFilterTextChange={setConversationFilterText}
          hasConversationSearchTerms={hasConversationSearchTerms}
          conversationSearchCounterText={conversationSearchCounterText}
          conversationSearchMatchCount={conversationSearchMatchCount}
          onStepConversationSearch={handleStepConversationSearch}
          onOpenSkillsAuxView={handleOpenSkillsAuxView}
          onOpenMcpAuxView={handleOpenMcpAuxView}
          onOpenSlashCommandsAuxView={handleOpenSlashCommandsAuxView}
          onOpenProjectSettingsAuxView={handleOpenProjectSettingsAuxView}
        />
        <ProjectChatSurfaceBody
          engineSwitchContinuationBannerText={
            engineSwitchContinuationBannerText
          }
          onContinueInNewThread={handleContinueInNewThread}
          showInlineThreads={showInlineThreads}
          resolvedInlineThreadsWidth={resolvedInlineThreadsWidth}
          inlineThreadsMaxWidth={inlineThreadsMaxWidth}
          canResizeInlineThreads={canResizeInlineThreads}
          handleInlineThreadsResize={handleInlineThreadsResize}
          handleInlineThreadsResizeStop={handleInlineThreadsResizeStop}
          handleInlineThreadsResizableColumnRef={
            handleInlineThreadsResizableColumnRef
          }
          inlineThreadsHeaderPortalTarget={inlineThreadsHeaderPortalTarget}
          historyProps={historyProps}
          viewThreads={viewThreads}
          onCloseThreadsView={() => {
            setViewThreads(false);
          }}
          auxViewContent={auxViewContent}
          chatCoreProps={chatCoreProps}
        />
      </div>
    )
  );
}
