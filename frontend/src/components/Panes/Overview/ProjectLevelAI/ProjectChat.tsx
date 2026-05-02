import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import { buildOverviewProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import {
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getRunInputString,
  getRunLastUpdatedMs,
} from "state/actions/agentRunUtils";
import { seedPendingChatDetails } from "state/actions/ai";
import {
  buildChatHistoryEntries,
  buildChatProvenanceByChatId,
  resolveScopedChatProvenanceForChatId,
} from "state/actions/chatHistory";
import { setProjectChatThreadGroupAssignment } from "state/actions/projectChatThreads";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
  type ProjectChatAuxView,
} from "state/definitions";
import { ProjectAISettings } from "./ProjectAISettings";
import { INLINE_THREADS_BREAKPOINT_PX } from "./ProjectChat/constants";
import { type ProjectAISettingsPopoverProps } from "./ProjectChat/ProjectAISettingsPopover";
import {
  resolveDraftThreadStateAfterChatContextChange,
  type DraftProjectThreadState,
} from "./ProjectChat/projectChatDraftThreadState";
import { buildProjectChatHydrationMetadataRevision } from "./ProjectChat/projectChatHydrationMetadata";
import {
  ProjectChatSurfaceLayout,
  type ProjectChatHistoryBaseProps,
} from "./ProjectChat/ProjectChatSurfaceLayout";
import { useProjectChatConversationSearch } from "./ProjectChat/useProjectChatConversationSearch";
import { useProjectChatEngineSelection } from "./ProjectChat/useProjectChatEngineSelection";
import { useProjectChatInlineThreads } from "./ProjectChat/useProjectChatInlineThreads";
import {
  resolveProjectChatDraftMessageByProjectConfigIdUpdate,
  setProjectChatAuxViewForActiveProject,
} from "./projectChatAuxViewState";
import {
  resolveProjectChatAppGenerationDetailsForSurface,
  resolveProjectChatConversationDataSource,
  resolveProjectChatMessagesForSurface,
  resolveProjectChatWaitingForResponseForSurface,
  type ProjectChatEngineSwitchContinuation,
} from "./projectChatConversationState";
import { type ProjectChatCoreProps } from "./ProjectChatCore/types";
import { type ProjectChatBlockedErrorCode } from "./projectChatCoreUtils";
import { resolveProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";
import { ProjectChatSkillsMcpViewer } from "./ProjectChatSkillsMcpViewer";
import { useHydrateAgenticState } from "./useHydrateAgenticState";
import { useHydrateLLMState } from "./useHydrateLLMState";

type ProjectChatAuxTabId = Exclude<ProjectChatAuxView, "none">;
type ProjectChatProps = {
  surfaceId?: string;
  chatId?: string | null | undefined;
  setChatId?: (next: SetStateAction<string | null | undefined>) => void;
  onBlockedErrorCodeChange?: (
    errorCode: ProjectChatBlockedErrorCode | null,
  ) => void;
};

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

// eslint-disable-next-line complexity
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
  const {
    conversationFilterText,
    setConversationFilterText,
    conversationSearchMatchCount,
    conversationSearchMatchIndex,
    hasConversationSearchTerms,
    conversationSearchCounterText,
    handleStepConversationSearch,
    handleConversationSearchMatchCountChange,
  } = useProjectChatConversationSearch({ chatId });
  const [draftThreadState, setDraftThreadState] =
    useState<DraftProjectThreadState>({
      phase: "none",
    });
  const [draftThreadTargetGroupId, setDraftThreadTargetGroupId] = useState<
    string | null
  >(null);
  const [thinking, setThinking] = useState(true);
  useHydrateLLMState();
  useHydrateAgenticState();
  const activeConversationMessages = useAIStore((state) => {
    const pendingDetails =
      state.pendingChatDetailsBySurfaceId[resolvedSurfaceId] ?? null;
    const source = resolveProjectChatConversationDataSource({
      chatId,
      hasPendingDetails: pendingDetails !== null,
    });
    return resolveProjectChatMessagesForSurface({
      source,
      pendingDetails,
      chatDetails: state.chatDetails,
    });
  });
  const activeConversationAppGenerationDetails = useAIStore((state) => {
    const pendingDetails =
      state.pendingChatDetailsBySurfaceId[resolvedSurfaceId] ?? null;
    const source = resolveProjectChatConversationDataSource({
      chatId,
      hasPendingDetails: pendingDetails !== null,
    });
    return resolveProjectChatAppGenerationDetailsForSurface({
      source,
      pendingAppGenerationDetails:
        state.pendingChatAppGenerationDetailsBySurfaceId[resolvedSurfaceId] ??
        null,
      chatAppGenerationDetailsByChatId: state.chatAppGenerationDetailsByChatId,
    });
  });
  const selectedChatWaitingForResponse = useAIStore((state) => {
    const pendingDetails =
      state.pendingChatDetailsBySurfaceId[resolvedSurfaceId] ?? null;
    const source = resolveProjectChatConversationDataSource({
      chatId,
      hasPendingDetails: pendingDetails !== null,
    });
    return resolveProjectChatWaitingForResponseForSurface({
      source,
      pendingDetails,
      chatDetails: state.chatDetails,
    });
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
  const overviewPaneWidth = useLocalStorage((state) => state.overviewWidth);
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
  const {
    effectiveInlineThreadsViewportWidth,
    showInlineThreads,
    inlineThreadsMaxWidth,
    resolvedInlineThreadsWidth,
    canResizeInlineThreads,
    inlineThreadsHeaderPortalTarget,
    handleChatContainerRef,
    handleInlineThreadsHeaderHostRef,
    handleInlineThreadsHeaderShellRef,
    handleInlineThreadsResizableColumnRef,
    syncInlineThreadsHeaderWidth,
    updateInlineThreadsWidth,
  } = useProjectChatInlineThreads({
    overviewPaneWidth,
    viewThreads,
    projectChatThreadsExplicitlyClosedAtLargeWidth,
    setViewThreads,
  });
  const draftMessage = draftMessageByProjectConfigId[projectConfigId] ?? "";
  const setDraftMessage = useCallback(
    (next: SetStateAction<string>) => {
      setProjectChatDraftMessageForProjectConfig(projectConfigId, next);
    },
    [projectConfigId],
  );
  const [runtimePermissionMode, setRuntimePermissionMode] =
    useState<ChatPermissionModeValue>("minimal");
  const [selectedThreadGroupId, setSelectedThreadGroupId] = useState<
    string | null
  >(null);
  const [engineSwitchContinuation, setEngineSwitchContinuation] =
    useState<ProjectChatEngineSwitchContinuation | null>(null);
  const [
    draftThreadContinuationSourceChatId,
    setDraftThreadContinuationSourceChatId,
  ] = useState<string | null>(null);

  const chatProvenanceByChatIdMap = useMemo(
    () =>
      buildChatProvenanceByChatId(agentRuns, {
        projectConfigId,
        unscopedOnly: true,
      }),
    [agentRuns, projectConfigId],
  );
  const chatEngineConfigByChatId = useMemo(() => {
    const nextByChatId = new Map<string, string | null>();
    for (const [runChatId, provenance] of chatProvenanceByChatIdMap.entries()) {
      nextByChatId.set(runChatId, provenance.engineConfigId);
    }
    return nextByChatId;
  }, [chatProvenanceByChatIdMap]);
  const setDraftThreadStateToNone = useCallback(() => {
    setDraftThreadState({ phase: "none" });
  }, []);
  const {
    availableConfigGroups,
    engineGroups,
    engineConfigById,
    transcriptionProfileGroups,
    noConfigsAvailable,
    selectedEngineConfig,
    effectiveEngineId,
    engineType,
    defaultLLMConfigId,
    providerDictationAvailable,
    providerDictationUnavailableReason,
    providerDictationLikelySupported,
    hasLLMConfig,
    selectableLLMConfigId,
    llmSelectionUnavailableReason,
    externalEngineAvailable,
    externalAgentConfig,
    showPlanModeBadge,
    engineSwitchContinuationBannerText,
    requiresNewThreadForEngineSwitch,
    newThreadContinuationRequiredReason,
    placeholderText,
    projectHistoryRunType,
    historyCompatibility,
    handleEngineChange,
    handleLLMConfigChange,
    handlePinDefaultModel,
    handleTranscriptionProfileChange,
    handleDictationModeChange,
    handleActivityAccordionOpenByDefaultChange,
    handleActivityChildrenOpenByDefaultChange,
  } = useProjectChatEngineSelection({
    apiKeys,
    apiKeysAuthoritative,
    allLLMConfigs,
    externalAgentConfigs,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
    engineConfigs,
    engineConfigsInitialLoadComplete,
    transcriptionProfiles,
    transcriptionProfilesInitialLoadComplete,
    projectChatDictationMode,
    projectChatTranscriptionProfileId,
    defaultSelectedEngineId,
    runtimePermissionMode,
    setRuntimePermissionMode,
    chatId,
    setChatId,
    chatEngineConfigByChatId,
    engineSwitchContinuation,
    setEngineSwitchContinuation,
    setProjectChatAuxView,
    setDraftThreadStateToNone,
    setDraftThreadTargetGroupId,
    setSelectedThreadGroupId,
  });

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
    return buildProjectChatHydrationMetadataRevision({
      chatId,
      chatProvenanceByChatIdMap,
      engineConfigById,
      selectedChatHydrationAuthorityStatus:
        selectedChatHydrationAuthority.status,
      selectedChatHydrationRunType:
        selectedChatHydrationAuthority.hydrationRunType,
      selectedChatBlockedErrorCode:
        selectedChatHydrationAuthority.blockedErrorCode,
      selectedChatRunWatermark,
      agentRunsAuthorityState,
      agentRunsLoadError,
      engineConfigsInitialLoadComplete,
      engineConfigsLoadError,
    });
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
  const draftThreadHint = useMemo(() => {
    if (draftThreadState.phase === "none") {
      return null;
    }
    if (draftThreadState.phase === "awaiting_title") {
      return {
        chatId: draftThreadState.chatId,
        groupId: draftThreadTargetGroupId,
      };
    }
    return { chatId: null, groupId: draftThreadTargetGroupId };
  }, [draftThreadState, draftThreadTargetGroupId]);

  useEffect(() => {
    setDraftThreadState((current) =>
      resolveDraftThreadStateAfterChatContextChange({
        current,
        chatId,
        chatHistoryEntriesById,
      }),
    );
  }, [chatHistoryEntriesById, chatId]);
  useEffect(() => {
    if (draftThreadState.phase !== "none") {
      return;
    }
    if (draftThreadTargetGroupId === null) {
      return;
    }
    setDraftThreadTargetGroupId(null);
  }, [draftThreadState.phase, draftThreadTargetGroupId]);

  useEffect(() => {
    if (typeof chatId !== "string" || chatId.trim() === "") {
      return;
    }
    setSelectedThreadGroupId(threadAssignments[chatId] ?? null);
  }, [chatId, threadAssignments]);
  useEffect(() => {
    if (selectedThreadGroupId === null) {
      return;
    }
    const exists = threadGroups.some(
      (group) => group.id === selectedThreadGroupId,
    );
    if (!exists) {
      setSelectedThreadGroupId(null);
    }
  }, [selectedThreadGroupId, threadGroups]);

  const showThreadsOnlyView =
    viewThreads && !showInlineThreads && projectChatAuxView === "none";
  const isAuxView = projectChatAuxView !== "none" || showThreadsOnlyView;
  const showConversationFilter = !isAuxView;
  const showReturnOnlyNav =
    projectChatAuxView !== "none" || showThreadsOnlyView;
  const handleReturnToChat = useCallback(() => {
    if (projectChatAuxView !== "none") {
      setProjectChatAuxView("none");
      return;
    }
    setViewThreads(false);
  }, [projectChatAuxView]);
  const handleToggleThreads = useCallback(() => {
    setProjectChatAuxView("none");
    const isLargeEnoughForInlineThreads =
      effectiveInlineThreadsViewportWidth >= INLINE_THREADS_BREAKPOINT_PX;
    setViewThreads((current) => {
      const nextViewThreads = !current;
      if (isLargeEnoughForInlineThreads) {
        setProjectChatThreadsExplicitlyClosedAtLargeWidth(!nextViewThreads);
      }
      return nextViewThreads;
    });
  }, [effectiveInlineThreadsViewportWidth]);
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
  const startNewChatDraft = useCallback(
    ({
      targetGroupId,
      clearContinuationSource,
    }: {
      targetGroupId: string | null;
      clearContinuationSource: boolean;
    }) => {
      setChatId(undefined);
      setDraftThreadState({ phase: "idle" });
      setDraftThreadTargetGroupId(targetGroupId);
      if (clearContinuationSource) {
        setDraftThreadContinuationSourceChatId(null);
      }
      setEngineSwitchContinuation(null);
      if (!showInlineThreads) {
        setViewThreads(false);
      }
      setProjectChatAuxView("none");
    },
    [setChatId, showInlineThreads],
  );
  const handleNewChatClick = useCallback(() => {
    startNewChatDraft({
      targetGroupId: selectedThreadGroupId,
      clearContinuationSource: true,
    });
  }, [selectedThreadGroupId, startNewChatDraft]);
  const handleNewChatStartForSubmit = useCallback(() => {
    startNewChatDraft({
      targetGroupId: selectedThreadGroupId,
      clearContinuationSource: false,
    });
  }, [selectedThreadGroupId, startNewChatDraft]);
  const handleNewChatInThreadGroup = useCallback(
    (groupId: string) => {
      startNewChatDraft({
        targetGroupId: groupId,
        clearContinuationSource: true,
      });
      setSelectedThreadGroupId(groupId);
    },
    [startNewChatDraft],
  );
  const handleContinueInNewThread = useCallback(() => {
    if (!engineSwitchContinuation) {
      return;
    }
    seedPendingChatDetails(
      activeConversationMessages,
      resolvedSurfaceId,
      activeConversationAppGenerationDetails,
    );
    setChatId(null);
    setDraftThreadState({ phase: "idle" });
    setDraftThreadTargetGroupId(selectedThreadGroupId);
    setDraftThreadContinuationSourceChatId(
      engineSwitchContinuation.sourceChatId,
    );
    setEngineSwitchContinuation(null);
    if (!showInlineThreads) {
      setViewThreads(false);
    }
    setProjectChatAuxView("none");
  }, [
    activeConversationAppGenerationDetails,
    activeConversationMessages,
    engineSwitchContinuation,
    resolvedSurfaceId,
    selectedThreadGroupId,
    setChatId,
    showInlineThreads,
  ]);
  const returnToChatTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Return to chat",
        content:
          projectChatAuxView === "skills"
            ? "Leave Skills and reopen chat."
            : projectChatAuxView === "mcp"
              ? "Leave MCP and reopen chat."
              : projectChatAuxView === "slash_commands"
                ? "Leave Slash Commands and reopen chat."
                : projectChatAuxView === "ai_settings"
                  ? "Leave AI Settings and reopen chat."
                  : "Close threads-only view and reopen chat.",
      }),
    [projectChatAuxView],
  );
  const showAuxTabs = projectChatAuxView !== "none";
  const auxTabs = useMemo<
    Array<{
      id: ProjectChatAuxTabId;
      label: string;
      testId: string;
      active: boolean;
      onClick: () => void;
    }>
  >(
    () => [
      {
        id: "skills",
        label: "Skills",
        testId: "project-chat-aux-tab-skills",
        active: projectChatAuxView === "skills",
        onClick: handleOpenSkillsAuxView,
      },
      {
        id: "mcp",
        label: "MCP",
        testId: "project-chat-aux-tab-mcp",
        active: projectChatAuxView === "mcp",
        onClick: handleOpenMcpAuxView,
      },
      {
        id: "slash_commands",
        label: "Slash Commands",
        testId: "project-chat-aux-tab-slash-commands",
        active: projectChatAuxView === "slash_commands",
        onClick: handleOpenSlashCommandsAuxView,
      },
      {
        id: "ai_settings",
        label: "AI Settings",
        testId: "project-chat-aux-tab-ai-settings",
        active: projectChatAuxView === "ai_settings",
        onClick: handleOpenProjectSettingsAuxView,
      },
    ],
    [
      handleOpenMcpAuxView,
      handleOpenProjectSettingsAuxView,
      handleOpenSkillsAuxView,
      handleOpenSlashCommandsAuxView,
      projectChatAuxView,
    ],
  );
  const newChatTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "New chat",
        content: "Start a new conversation in the selected group.",
      }),
    [],
  );
  const threadsTooltipHandlers = useMemo(() => {
    const showingInlineThreads = viewThreads && showInlineThreads;
    return getFloatingBoxHandlers({
      title: showingInlineThreads ? "Hide threads" : "Threads",
      content: showingInlineThreads
        ? "Collapse the threads list."
        : "Open the threads list.",
    });
  }, [showInlineThreads, viewThreads]);
  const handleDraftThreadStart = useCallback(() => {
    setDraftThreadState((current) => {
      if (current.phase === "none") {
        return current;
      }
      return { phase: "pending_chat_id" };
    });
  }, []);
  const handleDraftThreadSettled = useCallback(
    (nextChatId: string | null, succeeded: boolean) => {
      if (succeeded && nextChatId && draftThreadTargetGroupId) {
        setProjectChatThreadGroupAssignment(
          projectConfigId,
          nextChatId,
          draftThreadTargetGroupId,
        );
      }
      if (succeeded && nextChatId) {
        setDraftThreadContinuationSourceChatId(null);
      }
      setDraftThreadState((current) => {
        if (current.phase === "none") {
          return current;
        }
        if (!succeeded || !nextChatId) {
          return { phase: "idle" };
        }
        return { phase: "awaiting_title", chatId: nextChatId };
      });
    },
    [draftThreadTargetGroupId, projectConfigId],
  );
  useEffect(() => {
    if (
      draftThreadState.phase === "none" &&
      draftThreadContinuationSourceChatId !== null
    ) {
      setDraftThreadContinuationSourceChatId(null);
    }
  }, [draftThreadContinuationSourceChatId, draftThreadState.phase]);
  const handleCloseThreadsView = useCallback(() => {
    setViewThreads(false);
  }, [setViewThreads]);
  const auxViewContent =
    projectChatAuxView === "skills" ||
    projectChatAuxView === "mcp" ||
    projectChatAuxView === "slash_commands" ? (
      <ProjectChatSkillsMcpViewer
        projectConfigId={projectConfigId}
        chatId={chatId}
        engineConfigId={effectiveEngineId}
        engineType={engineType}
        externalAgentToolType={externalAgentConfig?.toolType ?? null}
        viewMode={projectChatAuxView}
      />
    ) : projectChatAuxView === "ai_settings" ? (
      <ProjectAISettings />
    ) : null;
  const ready =
    apiKeysInitialLoadComplete &&
    llmConfigInitialLoadComplete &&
    engineConfigsInitialLoadComplete;
  const settingsPopoverProps = {
    engineGroups,
    transcriptionProfileGroups,
    availableConfigGroups,
    selectedEngineId: effectiveEngineId,
    selectedLLMConfigId: selectableLLMConfigId,
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
  } satisfies ProjectAISettingsPopoverProps;
  const chatHistoryProps = {
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
    onCloseThreadsView: handleCloseThreadsView,
  } satisfies ProjectChatHistoryBaseProps;
  const chatCoreProps = {
    surfaceId: resolvedSurfaceId,
    chatId,
    draftMessage,
    setDraftMessage,
    placeholderText,
    conversationFilterText,
    requiresNewThreadContinuation: requiresNewThreadForEngineSwitch,
    newThreadContinuationRequiredReason,
    newThreadSeedChatId:
      draftThreadState.phase === "none"
        ? null
        : draftThreadContinuationSourceChatId,
    hydrationAuthority: selectedChatHydrationAuthority,
    hydrationMetadataRevision: selectedChatHydrationMetadataRevision,
    thinking,
    engineConfigId: effectiveEngineId,
    engineConfig: selectedEngineConfig,
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
  } satisfies ProjectChatCoreProps;

  return (
    <ProjectChatSurfaceLayout
      ready={ready}
      showInlineThreads={showInlineThreads}
      resolvedInlineThreadsWidth={resolvedInlineThreadsWidth}
      inlineThreadsMaxWidth={inlineThreadsMaxWidth}
      canResizeInlineThreads={canResizeInlineThreads}
      inlineThreadsHeaderPortalTarget={inlineThreadsHeaderPortalTarget}
      handleChatContainerRef={handleChatContainerRef}
      handleInlineThreadsHeaderShellRef={handleInlineThreadsHeaderShellRef}
      handleInlineThreadsHeaderHostRef={handleInlineThreadsHeaderHostRef}
      handleInlineThreadsResizableColumnRef={
        handleInlineThreadsResizableColumnRef
      }
      syncInlineThreadsHeaderWidth={syncInlineThreadsHeaderWidth}
      updateInlineThreadsWidth={updateInlineThreadsWidth}
      showReturnOnlyNav={showReturnOnlyNav}
      returnToChatTooltipHandlers={returnToChatTooltipHandlers}
      handleReturnToChat={handleReturnToChat}
      handleNewChatClick={handleNewChatClick}
      newChatTooltipHandlers={newChatTooltipHandlers}
      handleToggleThreads={handleToggleThreads}
      threadsTooltipHandlers={threadsTooltipHandlers}
      viewThreads={viewThreads}
      showAuxTabs={showAuxTabs}
      auxTabs={auxTabs}
      isAuxView={isAuxView}
      showPlanModeBadge={showPlanModeBadge}
      settingsPopoverProps={settingsPopoverProps}
      showConversationFilter={showConversationFilter}
      conversationFilterText={conversationFilterText}
      setConversationFilterText={setConversationFilterText}
      hasConversationSearchTerms={hasConversationSearchTerms}
      conversationSearchCounterText={conversationSearchCounterText}
      conversationSearchMatchCount={conversationSearchMatchCount}
      handleStepConversationSearch={handleStepConversationSearch}
      engineSwitchContinuationBannerText={engineSwitchContinuationBannerText}
      handleContinueInNewThread={handleContinueInNewThread}
      auxViewContent={auxViewContent}
      chatHistoryProps={chatHistoryProps}
      chatCoreProps={chatCoreProps}
    />
  );
}
