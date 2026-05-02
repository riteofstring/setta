import { callOpenAPI, createNewId } from "@setta/app-subsystem-frontend-sdk";

import {
  ChatInput,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
} from "components/Chat/ChatInput";

import { ChatMessageList } from "components/Chat/ChatMessages";

import { PlanModeBadge } from "components/Chat/PlanModeBadge";

import {
  CHAT_SLASH_COMMANDS,
  buildChatSlashCommands,
  formatSlashCommandHelp,
  type ChatPermissionModeValue,
} from "components/Chat/chatComposerControls";

import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";

import { resolveAuthoritativeContextTelemetry } from "components/Chat/contextTelemetry";

import { resolveProviderDictationAvailability } from "components/Chat/dictationMode";

import {
  getChatPlaceholderText,
  getExternalEngineIssueMessage,
  getExternalEngineStatus,
  resolveEffectiveThinking,
} from "components/Chat/engineUtils";

import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";

import { shouldShowPlanModeBadge } from "components/Chat/planModeBadgeUtils";

import {
  canUseManagedChatLLM,
  filterManagedChatThreadSlashCommands,
} from "components/Chat/sharePolicyChatAccess";

import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";

import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";

import { setChatSectionChatId } from "openapi/http";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  clearPendingChatDetails,
  getDefaultChatDetails,
  getExternalAgentChat,
  getLLMChat,
  initializePendingChatDetails,
  loadAgentRuns,
  stopManagedSectionChatResponse,
  submitEditedMessage,
  submitMessage,
  transcribeChatAudioWithProfile,
} from "state/actions/ai";

import { buildMessageBranchInfo } from "state/actions/aiBranches";

import { type ChatHistoryCompatibility } from "state/actions/chatHistory";

import { addPersistentNotification } from "state/actions/notifications";

import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";

import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";

import { useIsScrollable } from "state/hooks/sectionSizes";

import { useChatBranchIndex } from "state/hooks/useChatBranchIndex";

import { hasPendingToolInteraction } from "utils/claudeTools";

import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";

import {
  AgenticEdgeKindEnum,
  ChatDictationMode,
  ChatFileAttachment,
  ChatRoleEnum,
  EngineTypeEnum,
  NotificationTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

import { shallow } from "zustand/shallow";

import {
  buildManagedZeroScopeBannerSessionKey,
  getManagedChatRunRefreshKey,
  resolveManagedChatRunType,
  shouldExitManagedChatHistory,
  toSortedHistoryEntries,
} from "../chatAreaUtils";

import {
  ChatSectionChatId,
  ChatSectionChatIdUpdate,
  ManagedChatHistoryPanel,
  canSubmitManagedChatMessage,
  emitChatSendAction,
  emitChatStopAction,
} from "./scriptableChatArea";

export type ManagedChatAreaProps = {
  sectionId: string;
  surfaceId?: string;
  controlledChatId?: ChatSectionChatId;
  setControlledChatId?: (next: ChatSectionChatIdUpdate) => void;
  engineConfigId: string | null;
  transcriptionProfileId: string | null;
  agentProfileId: string | null;
  thinking: boolean;
  permissionMode: ChatPermissionModeValue;
  searchEnabled: boolean;
  dictationMode: ChatDictationMode;
};

// eslint-disable-next-line complexity
export function ManagedChatArea({
  sectionId,
  surfaceId,
  controlledChatId,
  setControlledChatId,
  engineConfigId,
  transcriptionProfileId,
  agentProfileId,
  thinking,
  permissionMode,
  searchEnabled,
  dictationMode,
}: ManagedChatAreaProps) {
  useHydrateLLMState();
  useHydrateAgenticState();
  const { ref, isScrollable } = useIsScrollable();
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const { isDeploymentMode, allowLLM } = useShareSession(
    (state) => ({
      isDeploymentMode: state.isDeploymentMode,
      allowLLM: state.sharePolicy?.allowLLM ?? false,
    }),
    shallow,
  );
  const canUseManagedChat = canUseManagedChatLLM({
    isDeploymentMode,
    allowLLM,
  });
  const agenticEdges = useProjectState(
    (state) => state.projectConfig.agenticEdges,
  );
  const { hasAnyAgenticEdge, hasWriteScope } = useMemo(() => {
    let hasAny = false;
    let hasWrite = false;
    for (const edge of agenticEdges) {
      if (edge.sourceSectionId !== sectionId) {
        continue;
      }
      if (edge.kind === AgenticEdgeKindEnum.chat_section) {
        hasWrite = true;
      }
      if (
        edge.kind === AgenticEdgeKindEnum.chat_section ||
        edge.kind === AgenticEdgeKindEnum.chat_chat
      ) {
        hasAny = true;
      }
      if (hasAny && hasWrite) {
        break;
      }
    }
    return { hasAnyAgenticEdge: hasAny, hasWriteScope: hasWrite };
  }, [agenticEdges, sectionId]);
  const zeroScopeBannerSessionKey = useMemo(
    () => buildManagedZeroScopeBannerSessionKey(projectConfigId, sectionId),
    [projectConfigId, sectionId],
  );
  const [zeroScopeBannerDismissed, setZeroScopeBannerDismissed] =
    useState<boolean>(false);
  useEffect(() => {
    setZeroScopeBannerDismissed(
      window.sessionStorage.getItem(zeroScopeBannerSessionKey) === "1",
    );
  }, [zeroScopeBannerSessionKey]);
  const dismissZeroScopeBanner = useCallback(() => {
    window.sessionStorage.setItem(zeroScopeBannerSessionKey, "1");
    setZeroScopeBannerDismissed(true);
  }, [zeroScopeBannerSessionKey]);
  const showZeroScopeBanner = !hasAnyAgenticEdge && !zeroScopeBannerDismissed;
  const sectionChatId = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
    return impl.chatId;
  });
  const chatId =
    controlledChatId !== undefined ? controlledChatId : sectionChatId;
  const [showHistory, setShowHistory] = useState(false);
  const { messages, toolCallArguments, waitingForResponse, contextUsage } =
    useAIStore((state) => {
      if (chatId === null) {
        if (!surfaceId) {
          return getDefaultChatDetails();
        }
        return (
          state.pendingChatDetailsBySurfaceId[surfaceId] ??
          getDefaultChatDetails()
        );
      }
      if (typeof chatId !== "string") {
        return getDefaultChatDetails();
      }
      return state.chatDetails[chatId] ?? getDefaultChatDetails();
    }, shallow);
  const lastChatIdRef = useRef<string | null>(null);
  const previousManagedChatIdRef = useRef<ChatSectionChatId | undefined>(
    undefined,
  );
  const previousWaitingForResponseRef = useRef(waitingForResponse);
  const notifiedExternalEngineIssueRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canUseManagedChat) {
      setShowHistory(false);
    }
  }, [canUseManagedChat]);
  useEffect(() => {
    if (typeof chatId === "string") {
      lastChatIdRef.current = chatId;
    }
  }, [chatId]);
  useEffect(() => {
    // Workflow dispatch can retarget the section chat or resume the current
    // thread without any local click in this section. Show the live thread when
    // that external activity starts.
    if (
      showHistory &&
      shouldExitManagedChatHistory({
        previousChatId: previousManagedChatIdRef.current,
        nextChatId: chatId,
        previousWaitingForResponse: previousWaitingForResponseRef.current,
        nextWaitingForResponse: waitingForResponse,
      })
    ) {
      setShowHistory(false);
    }
    previousManagedChatIdRef.current = chatId;
    previousWaitingForResponseRef.current = waitingForResponse;
  }, [chatId, showHistory, waitingForResponse]);
  const branchIndex = useChatBranchIndex(typeof chatId === "string");
  const branchInfoByMessage = useMemo(() => {
    if (typeof chatId !== "string") {
      return {};
    }
    return buildMessageBranchInfo({
      chatId,
      messages,
      branchIndex,
    });
  }, [branchIndex, chatId, messages]);
  const interruptedAssistantMessageIds = useAIStore((state) => {
    if (typeof chatId !== "string") {
      return {};
    }
    return state.interruptedAssistantMessageIdsByChatId[chatId] ?? {};
  }, shallow);
  const {
    apiKeys,
    apiKeysAuthoritative,
    allLLMConfigs,
    agentProfiles,
    engineConfigs,
    transcriptionProfiles,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
    externalAgentConfigs,
  } = useAIStore(
    (state) => ({
      apiKeys: state.apiKeys,
      apiKeysAuthoritative: state.apiKeysAuthoritative,
      allLLMConfigs: state.allLLMConfigs,
      agentProfiles: state.agentProfiles,
      engineConfigs: state.engineConfigs,
      transcriptionProfiles: state.transcriptionProfiles,
      externalAgentHealth: state.externalAgentHealth,
      externalAgentHealthInitialLoadComplete:
        state.externalAgentHealthInitialLoadComplete,
      externalAgentConfigs: state.externalAgentConfigs,
    }),
    _.isEqual,
  );
  const availableConfigGroups = useMemo(
    () => buildLLMConfigGroups(allLLMConfigs, apiKeys),
    [allLLMConfigs, apiKeys],
  );
  const noConfigsAvailable = countLLMConfigs(availableConfigGroups) === 0;
  const selectedProfile = useMemo(() => {
    if (!agentProfileId) {
      return null;
    }
    return (
      agentProfiles.find((profile) => profile.id === agentProfileId) ?? null
    );
  }, [agentProfileId, agentProfiles]);
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
  const engineType = selectedEngineConfig?.engineType ?? null;
  const isExternalEngine = engineType === EngineTypeEnum.external_agent;
  const effectiveThinking = resolveEffectiveThinking({
    engineConfig: selectedEngineConfig,
    requestedThinking: thinking,
  });
  const historyCompatibility = useMemo<ChatHistoryCompatibility | null>(() => {
    const runType = resolveManagedChatRunType(engineType);
    if (!runType) {
      return null;
    }
    return {
      runType,
      engineConfigId: effectiveEngineConfigId ?? null,
    };
  }, [effectiveEngineConfigId, engineType]);
  const managedChatRunRefreshKey = useAIStore((state) =>
    getManagedChatRunRefreshKey({
      agentRuns: state.agentRuns,
      sectionId,
      chatId,
      runType: historyCompatibility?.runType ?? null,
    }),
  );
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
  const selectedTranscriptionProfile = useMemo(() => {
    if (!transcriptionProfileId) {
      return null;
    }
    return (
      transcriptionProfiles.find(
        (profile) => profile.id === transcriptionProfileId,
      ) ?? null
    );
  }, [transcriptionProfileId, transcriptionProfiles]);
  const { providerDictationAvailable } = useMemo(
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
  const providerDictationLikelySupported = providerDictationAvailable;
  const hasEngineConfig = Boolean(selectedEngineConfig);
  const hasLLMConfig = Boolean(selectedLLMConfigId);
  const externalEngineStatus = useMemo(
    () =>
      getExternalEngineStatus(
        selectedEngineConfig,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      ),
    [
      selectedEngineConfig,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    ],
  );
  const externalEngineAvailable = externalEngineStatus
    ? externalEngineStatus.status === "available"
    : true;
  const externalAgentConfig = useMemo(() => {
    if (!selectedEngineConfig?.externalAgentConfigId) {
      return null;
    }
    return (
      externalAgentConfigs.find(
        (config) => config.id === selectedEngineConfig.externalAgentConfigId,
      ) ?? null
    );
  }, [externalAgentConfigs, selectedEngineConfig]);
  const { contextWindowTokens, contextUsedTokens, contextUsageIsEstimated } =
    useMemo(
      () => resolveAuthoritativeContextTelemetry(contextUsage),
      [contextUsage],
    );
  const showPlanModeBadge = shouldShowPlanModeBadge({
    engineType,
    externalAgentToolType: externalAgentConfig?.toolType ?? null,
    approvalPolicy: externalAgentConfig?.approvalPolicy ?? null,
    permissionMode,
  });
  const placeholderText = getChatPlaceholderText({
    engineType,
    hasEngineConfig,
    hasLLMConfig,
    noLLMConfigsAvailable: noConfigsAvailable,
  });
  const externalEngineIssueMessage = useMemo(
    () => getExternalEngineIssueMessage(externalEngineStatus),
    [externalEngineStatus],
  );
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
      NotificationTypeEnum.warning,
    );
  }, [externalEngineIssueMessage]);
  useEffect(() => {
    if (typeof chatId !== "string") {
      return;
    }
    if (isExternalEngine) {
      void getExternalAgentChat(chatId, projectConfigId, sectionId);
      return;
    }
    void getLLMChat(chatId, sectionId);
  }, [
    chatId,
    isExternalEngine,
    managedChatRunRefreshKey,
    projectConfigId,
    sectionId,
  ]);
  const setChatId = useCallback(
    (next: ChatSectionChatIdUpdate) => {
      if (!canUseManagedChat) {
        return;
      }
      if (setControlledChatId) {
        const resolved = typeof next === "function" ? next(chatId) : next;
        if (resolved === chatId) {
          return;
        }
        setControlledChatId(resolved);
        return;
      }
      const currentState = useProjectState.getState();
      const currentChatId = getCurrEffectiveSectionImplOfType(
        currentState,
        sectionId,
        SectionTypeEnum.Chat,
      ).chatId;
      const resolved = typeof next === "function" ? next(currentChatId) : next;
      if (resolved === currentChatId) {
        return;
      }
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
            chatId: resolved,
          });
        },
        send: () =>
          callOpenAPI(
            setChatSectionChatId({
              body: {
                projectConfigId,
                sectionId,
                chatId: resolved,
              },
            } as Parameters<typeof setChatSectionChatId>[0]),
          ),
      });
    },
    [
      canUseManagedChat,
      chatId,
      projectConfigId,
      sectionId,
      setControlledChatId,
    ],
  );
  const handleNewChatStart = useCallback(() => {
    if (!canUseManagedChat) {
      return;
    }
    if (surfaceId) {
      initializePendingChatDetails(surfaceId);
    }
    setChatId(null);
    setShowHistory(false);
  }, [canUseManagedChat, setChatId, surfaceId]);
  const handleNewChatSettled = useCallback(
    (newChatId: string | null, succeeded: boolean) => {
      if (surfaceId) {
        clearPendingChatDetails(surfaceId);
      }
      setChatId((currentChatId) => {
        if (currentChatId !== null) {
          return currentChatId;
        }
        if (!succeeded || !newChatId) {
          return null;
        }
        return newChatId;
      });
    },
    [setChatId, surfaceId],
  );
  const slashCommands = useMemo(
    () =>
      filterManagedChatThreadSlashCommands(
        buildChatSlashCommands({
          model: false,
          permissions: false,
          search: false,
        }),
        canUseManagedChat,
      ),
    [canUseManagedChat],
  );
  const handleSubmit = useCallback(
    async (message: string, attachments: ChatFileAttachment[]) => {
      if (
        !canSubmitManagedChatMessage({
          message,
          attachments,
          canUseManagedChat,
          hasEngineConfig,
          isExternalEngine,
          hasLLMConfig,
          externalEngineAvailable,
        })
      ) {
        return false;
      }
      const messageId = createNewId();
      const timestampMs = Date.now();
      emitChatSendAction({
        sectionId,
        messageId,
        text: message,
        attachments,
        role: ChatRoleEnum.user,
        managed: true,
        timestampMs,
      });
      const isFirstMessage = chatId === null;
      if (isFirstMessage) {
        handleNewChatStart();
      }
      let submittedChatId: string | null = null;
      let succeeded = false;
      try {
        if (!effectiveEngineConfigId) {
          return false;
        }
        submittedChatId = await submitMessage(
          chatId,
          message,
          attachments,
          effectiveThinking,
          effectiveEngineConfigId,
          isExternalEngine,
          {
            messageId,
            agentProfileId,
            sectionId,
            pendingSurfaceId: surfaceId,
            executionSettings: {
              permissionMode,
              searchEnabled,
            },
          },
        );
        succeeded = Boolean(submittedChatId);
      } catch (err) {
        console.error("Failed to submit LLM chat message", err);
      } finally {
        if (isFirstMessage) {
          handleNewChatSettled(submittedChatId, succeeded);
        }
      }
      return succeeded;
    },
    [
      chatId,
      effectiveEngineConfigId,
      handleNewChatSettled,
      handleNewChatStart,
      hasEngineConfig,
      isExternalEngine,
      externalEngineAvailable,
      hasLLMConfig,
      agentProfileId,
      permissionMode,
      searchEnabled,
      sectionId,
      effectiveThinking,
      surfaceId,
      canUseManagedChat,
    ],
  );
  const handleStop = useCallback(async () => {
    emitChatStopAction({
      sectionId,
      managed: true,
      timestampMs: Date.now(),
    });
    await stopManagedSectionChatResponse(
      chatId,
      isExternalEngine,
      projectConfigId,
      sectionId,
      surfaceId,
    );
  }, [chatId, isExternalEngine, projectConfigId, sectionId, surfaceId]);
  const handleEditMessage = useCallback(
    async (
      messageId: string,
      text: string,
      attachments: ChatFileAttachment[],
    ) => {
      const resolvedChatId =
        typeof chatId === "string" ? chatId : lastChatIdRef.current;
      if (!resolvedChatId) {
        return false;
      }
      if (!canUseManagedChat) {
        return false;
      }
      if (isExternalEngine && !externalEngineAvailable) {
        return false;
      }
      const nextChatId = await submitEditedMessage({
        parentChatId: resolvedChatId,
        messages,
        messageId,
        message: text,
        attachments,
        thinking: effectiveThinking,
        engineConfigId: effectiveEngineConfigId,
        isExternalEngine,
        agentProfileId,
        sectionId,
        pendingSurfaceId: surfaceId,
        executionSettings: {
          permissionMode,
          searchEnabled,
        },
      });
      return Boolean(nextChatId);
    },
    [
      agentProfileId,
      chatId,
      effectiveEngineConfigId,
      externalEngineAvailable,
      isExternalEngine,
      messages,
      permissionMode,
      searchEnabled,
      sectionId,
      effectiveThinking,
      surfaceId,
      canUseManagedChat,
    ],
  );
  const handleBranchSwitch = useCallback(
    (nextChatId: string) => {
      if (!nextChatId || nextChatId === chatId) {
        return;
      }
      setChatId(nextChatId);
      setShowHistory(false);
    },
    [chatId, setChatId],
  );
  const handleSelectHistoryChat = useCallback(
    (nextChatId: string) => {
      if (!nextChatId) {
        return;
      }
      setChatId(nextChatId);
      setShowHistory(false);
    },
    [setChatId],
  );
  const handleResumeLatestChat = useCallback(async (): Promise<boolean> => {
    if (!canUseManagedChat) {
      return false;
    }
    await loadAgentRuns();
    const latestEntry = toSortedHistoryEntries(
      useAIStore.getState().agentRuns,
      projectConfigId,
      sectionId,
      historyCompatibility,
    ).find((entry) => entry.chatId !== chatId);
    if (!latestEntry) {
      return false;
    }
    setChatId(latestEntry.chatId);
    setShowHistory(false);
    return true;
  }, [
    chatId,
    historyCompatibility,
    projectConfigId,
    sectionId,
    setChatId,
    canUseManagedChat,
  ]);
  const handleSlashCommand = useCallback(
    async (command: ChatSlashCommand): Promise<ChatSlashCommandResult> => {
      if (
        !canUseManagedChat &&
        (command.action === "new" || command.action === "resume")
      ) {
        return {
          feedback: "Chat thread changes are disabled by share policy.",
          keepInput: true,
        };
      }
      if (command.action === "new") {
        handleNewChatStart();
        return { feedback: "Started a new chat thread." };
      }
      if (command.action === "resume") {
        const resumed = await handleResumeLatestChat();
        return resumed
          ? { feedback: "Resumed the latest section chat." }
          : {
              feedback: "No previous section chat found to resume.",
              keepInput: true,
            };
      }
      if (command.action === "help") {
        return {
          feedback: formatSlashCommandHelp(slashCommands),
        };
      }
      return false;
    },
    [
      canUseManagedChat,
      handleNewChatStart,
      handleResumeLatestChat,
      slashCommands,
    ],
  );
  const scrollClassName = isScrollable ? NO_WHEEL_CLASS_NAME : "";
  const chatWidthShellClassName = "mx-auto w-full max-w-[72rem] px-2";
  const isDisabled =
    !canUseManagedChat ||
    !hasEngineConfig ||
    (!isExternalEngine && (!hasLLMConfig || noConfigsAvailable)) ||
    (isExternalEngine && !externalEngineAvailable);
  const editDisabledReason = useMemo(() => {
    if (!canUseManagedChat) {
      return "Editing disabled by share policy.";
    }
    return getChatEditDisabledReason({
      hasEngineConfig,
      hasLLMConfig,
      isExternalEngine,
      externalEngineAvailable,
      noLLMConfigsAvailable: noConfigsAvailable,
    });
  }, [
    canUseManagedChat,
    externalEngineAvailable,
    hasEngineConfig,
    hasLLMConfig,
    isExternalEngine,
    noConfigsAvailable,
  ]);
  const submitDisabled = useMemo(
    () => !waitingForResponse && hasPendingToolInteraction(messages),
    [messages, waitingForResponse],
  );
  const handleProviderDictationTranscribe = useCallback(
    async (audioBlob: Blob) => {
      if (isExternalEngine || !transcriptionProfileId) {
        throw new Error("Provider dictation is not configured.");
      }
      return transcribeChatAudioWithProfile(transcriptionProfileId, audioBlob);
    },
    [isExternalEngine, transcriptionProfileId],
  );
  return (
    <div
      className={`${NO_PAN_CLASS_NAME} section-main-full-w flex min-h-0 flex-1 flex-col`}
    >
      {showPlanModeBadge ? (
        <div
          className={`${chatWidthShellClassName} flex items-center justify-end gap-2 pt-2`}
        >
          <PlanModeBadge />
        </div>
      ) : null}
      {showZeroScopeBanner ? (
        <div className={`${chatWidthShellClassName} pt-2`}>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-start justify-between gap-3">
              <p>
                No outgoing scope links. This chat has no project access. Add
                Chat → Section or Chat → Chat links, or use Project Chat for
                full access.
              </p>
              <button
                type="button"
                className="shrink-0 rounded-md border border-amber-300/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 transition-colors hover:border-amber-500 hover:text-amber-900 dark:border-amber-500/50 dark:text-amber-200 dark:hover:border-amber-300 dark:hover:text-amber-100"
                onClick={dismissZeroScopeBanner}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : hasAnyAgenticEdge && !hasWriteScope ? (
        <div className={`${chatWidthShellClassName} pt-2`}>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            No writable sections in scope. This chat cannot modify sections. Add
            a Chat → Section edge (Scope sections) or use Project Chat for full
            access.
          </div>
        </div>
      ) : null}
      <div
        className={`${chatWidthShellClassName} flex items-center justify-between gap-2 pt-2`}
      >
        <div className="flex min-h-6 items-center">
          {!hasAnyAgenticEdge ? (
            <span
              data-testid="managed-chat-zero-scope-indicator"
              className="inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <span aria-hidden="true" className="text-[11px] leading-none">
                !
              </span>
              Scope limited
            </span>
          ) : null}
        </div>
        {canUseManagedChat ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-setta-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-setta-600 transition-colors hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
              onClick={() => setShowHistory((current) => !current)}
            >
              {showHistory ? "Back" : "History"}
            </button>
            <button
              type="button"
              className="rounded-md border border-setta-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-setta-600 transition-colors hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
              onClick={handleNewChatStart}
            >
              New Chat
            </button>
          </div>
        ) : null}
      </div>
      {showHistory && canUseManagedChat ? (
        <div
          className={`${chatWidthShellClassName} min-h-0 flex-1`}
          data-chat-width-shell="true"
        >
          <ManagedChatHistoryPanel
            projectConfigId={projectConfigId}
            sectionId={sectionId}
            activeChatId={chatId}
            historyCompatibility={historyCompatibility}
            onSelect={handleSelectHistoryChat}
          />
        </div>
      ) : (
        <ChatMessageList
          messages={messages}
          waitingForResponse={waitingForResponse}
          toolCallArguments={toolCallArguments}
          interruptedAssistantMessageIds={interruptedAssistantMessageIds}
          className={scrollClassName}
          contentClassName={chatWidthShellClassName}
          scrollRef={ref}
          editDisabledReason={editDisabledReason}
          onEditMessage={handleEditMessage}
          onBranchSwitch={handleBranchSwitch}
          branchInfoByMessage={branchInfoByMessage}
        />
      )}
      <div
        className={`${chatWidthShellClassName} pb-1`}
        data-chat-width-shell="true"
      >
        <ChatInput
          placeholderText={placeholderText}
          waitingForResponse={waitingForResponse}
          submitDisabled={submitDisabled}
          disabled={isDisabled}
          onSubmit={handleSubmit}
          onStop={handleStop}
          slashCommands={slashCommands}
          recognizedSlashCommands={CHAT_SLASH_COMMANDS}
          onSlashCommand={handleSlashCommand}
          dictationMode={dictationMode}
          dictationEnabledByProvider={providerDictationAvailable}
          providerDictationLikelySupported={providerDictationLikelySupported}
          contextWindowTokens={contextWindowTokens}
          contextUsedTokens={contextUsedTokens}
          contextUsageIsEstimated={contextUsageIsEstimated}
          onProviderDictationTranscribe={
            isExternalEngine || !providerDictationAvailable
              ? undefined
              : handleProviderDictationTranscribe
          }
        />
      </div>
    </div>
  );
}
