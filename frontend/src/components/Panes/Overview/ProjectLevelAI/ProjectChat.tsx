import { buildOverviewProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
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
import { buildChatHistoryEntries } from "state/actions/chatHistoryEntries";
import {
  buildChatProvenanceByChatId,
  resolveScopedChatProvenanceForChatId,
} from "state/actions/chatHistoryProvenance";
import type { ChatHistoryCompatibility } from "state/actions/chatHistoryTypes";
import {
  useAIStore,
  useProjectState,
  type ProjectChatAuxView,
} from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { getDefaultChatAppGenerationDetails } from "state/utils/chatAppGenerationDetails";
import { BaseChatMessageUnion } from "utils/generatedTypes";
import { ProjectChatAuxViewContent } from "./projectChatAuxViewContent";
import {
  setProjectChatAuxViewForActiveProject,
  setProjectChatDraftMessageForProjectConfig,
  setProjectChatThreadVisibility,
  setProjectChatThreadsClosedAtLargeWidthPreference,
} from "./projectChatAuxViewState";
import {
  resolveProjectChatEngineConfigIdForSelectedChat,
  resolveProjectChatEngineSwitchContinuationOnEngineChange,
  shouldProjectChatSkipEngineSyncForContinuation,
} from "./projectChatEngineSelection";
import { type ProjectChatBlockedErrorCode } from "./projectChatExecutionSettings";
import { resolveProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";
import {
  buildProjectChatEngineConfigByChatId,
  buildProjectChatHydrationMetadataRevision,
  resolveProjectChatHistoryCompatibility,
} from "./projectChatHydrationSelection";
import { ProjectChatSurfaceBody } from "./projectChatSurfaceBody";
import { ProjectChatSurfaceChrome } from "./projectChatSurfaceChrome";
import { useProjectChatThreadSession } from "./projectChatThreadSession";
import { useHydrateAgenticState } from "./useHydrateAgenticState";
import { useHydrateLLMState } from "./useHydrateLLMState";
import { useProjectChatConversationSearch } from "./useProjectChatConversationSearch";
import { useProjectChatEngineSettings } from "./useProjectChatEngineSettings";
import { useProjectChatInlineThreadsLayout } from "./useProjectChatInlineThreadsLayout";

export { resolveProjectChatThreadBlockedErrorCodeForSelectedChat } from "./projectChatHydrationAuthority";

type ProjectChatProps = {
  surfaceId?: string;
  chatId?: string | null | undefined;
  setChatId?: (next: SetStateAction<string | null | undefined>) => void;
  onBlockedErrorCodeChange?: (
    errorCode: ProjectChatBlockedErrorCode | null,
  ) => void;
};

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
  const agentRunsAuthorityState = useAIStore(
    (state) => state.agentRunsAuthorityState,
  );
  const agentRunsLoadError = useAIStore((state) => state.agentRunsLoadError);
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
  const {
    apiKeysInitialLoadComplete,
    availableEngineConfigIds,
    effectiveEngineId,
    engineConfigById,
    engineConfigsInitialLoadComplete,
    engineConfigsLoadError,
    engineType,
    externalAgentConfig,
    externalEngineAvailable,
    hasLLMConfig,
    llmConfigInitialLoadComplete,
    noConfigsAvailable,
    placeholderText,
    projectChatDictationMode,
    projectChatTranscriptionProfileId,
    projectHistoryRunType,
    providerDictationAvailable,
    providerDictationLikelySupported,
    runtimePermissionMode,
    selectedEngineId,
    setRuntimePermissionMode,
    setSelectedEngineId,
    settingsPopoverProps: baseSettingsPopoverProps,
    showPlanModeBadge,
  } = useProjectChatEngineSettings();
  const chatProvenanceByChatIdMap = useMemo(
    () =>
      buildChatProvenanceByChatId(agentRuns, {
        projectConfigId,
        unscopedOnly: true,
      }),
    [agentRuns, projectConfigId],
  );
  const chatEngineConfigByChatId = useMemo(
    () => buildProjectChatEngineConfigByChatId(chatProvenanceByChatIdMap),
    [chatProvenanceByChatIdMap],
  );
  const historyCompatibility = useMemo<ChatHistoryCompatibility | null>(
    () =>
      resolveProjectChatHistoryCompatibility(
        projectHistoryRunType,
        effectiveEngineId,
      ),
    [effectiveEngineId, projectHistoryRunType],
  );
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
  const selectedChatHydrationMetadataRevision = useMemo(
    () =>
      buildProjectChatHydrationMetadataRevision({
        chatId,
        chatProvenanceByChatIdMap,
        engineConfigById,
        selectedChatHydrationAuthority,
        selectedChatRunWatermark,
        agentRunsAuthorityState,
        agentRunsLoadError,
        engineConfigsInitialLoadComplete,
        engineConfigsLoadError,
      }),
    [
      agentRunsAuthorityState,
      agentRunsLoadError,
      chatId,
      chatProvenanceByChatIdMap,
      engineConfigById,
      engineConfigsInitialLoadComplete,
      engineConfigsLoadError,
      selectedChatHydrationAuthority,
      selectedChatRunWatermark,
    ],
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
      setEngineSwitchContinuation,
      setProjectChatAuxView,
      setSelectedEngineId,
    ],
  );
  const isAuxView = projectChatAuxView !== "none" || showThreadsOnlyView;
  const handleReturnToChat = useCallback(() => {
    if (projectChatAuxView !== "none") {
      setProjectChatAuxView("none");
      return;
    }
    setViewThreads(false);
  }, [projectChatAuxView, setProjectChatAuxView, setViewThreads]);
  const handleToggleThreads = useCallback(() => {
    setProjectChatAuxView("none");
    setViewThreads((current) => {
      const nextViewThreads = !current;
      if (isLargeEnoughForInlineThreads) {
        setProjectChatThreadsExplicitlyClosedAtLargeWidth(!nextViewThreads);
      }
      return nextViewThreads;
    });
  }, [
    isLargeEnoughForInlineThreads,
    setProjectChatAuxView,
    setProjectChatThreadsExplicitlyClosedAtLargeWidth,
    setViewThreads,
  ]);
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
    ...baseSettingsPopoverProps,
    onOpenSkillsView: handleOpenSkillsAuxView,
    onOpenMcpView: handleOpenMcpAuxView,
    onOpenSlashCommandsView: handleOpenSlashCommandsAuxView,
    onOpenProjectSettingsView: handleOpenProjectSettingsAuxView,
    onEngineChange: handleEngineChange,
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
