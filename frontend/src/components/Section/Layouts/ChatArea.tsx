import {
  ChatInput,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
} from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import {
  CHAT_SLASH_COMMANDS,
  buildChatSlashCommands,
  type ChatPermissionModeValue,
} from "components/Chat/chatComposerControls";
import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";
import { resolveAuthoritativeContextTelemetry } from "components/Chat/contextTelemetry";
import { resolveProviderDictationAvailability } from "components/Chat/dictationMode";
import {
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
import {
  canUseManagedChatLLM,
  filterManagedChatThreadSlashCommands,
} from "components/Chat/sharePolicyChatAccess";
import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDefaultChatDetails,
  getExternalAgentChat,
  getLLMChat,
} from "state/actions/ai/chatRuntime";
import { buildMessageBranchInfo } from "state/actions/aiBranches";
import {
  buildBranchIndexFromBranches,
  ensureChatBranchState,
} from "state/actions/chatBranches";
import { type ChatHistoryCompatibility } from "state/actions/chatHistory";
import { addPersistentNotification } from "state/actions/notifications";
import {
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
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
import { route_set_chat_section_state } from "utils/generatedEndpoints";
import {
  AgenticEdgeKindEnum,
  ChatFileAttachment,
  ChatSectionState,
  EngineTypeEnum,
  SectionTypeEnum,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  ManagedChatHistoryPanel,
  resolveManagedChatRunType,
} from "./ChatAreaHistoryPanel";
import { ManagedChatAreaHeader } from "./ManagedChatAreaHeader";
import {
  editManagedSectionChatMessage,
  stopManagedSectionChatWithAction,
  submitManagedSectionChatMessage,
  transcribeManagedSectionChatAudio,
} from "./chatAreaManagedRuntime";
import {
  persistManagedSectionChatId,
  resumeLatestManagedSectionChat,
  selectManagedSectionChat,
  setManagedSectionChatId,
  settleManagedSectionChatThreadStart,
  startManagedSectionChatThread,
  type ChatSectionChatId,
  type ChatSectionChatIdUpdate,
} from "./chatAreaManagedThreadController";
import {
  editScriptableChatMessage,
  executeScriptableChatSlashCommand,
  resetScriptableConversation,
  resumeLatestScriptableBranch,
  stopScriptableChatResponse,
  submitScriptableChatMessage,
  switchScriptableChatBranch,
} from "./chatAreaScriptableRuntime";
import {
  buildManagedZeroScopeBannerSessionKey,
  executeSectionChatSlashCommand,
} from "./chatAreaThreadControls";

export function ChatArea({
  sectionId,
  surfaceId,
  controlledChatId,
  setControlledChatId,
}: {
  sectionId: string;
  surfaceId?: string;
  controlledChatId?: string | null;
  setControlledChatId?: (next: ChatSectionChatIdUpdate) => void;
}) {
  const {
    managed,
    engineConfigId,
    transcriptionProfileId,
    agentProfileId,
    thinking,
    permissionMode,
    searchEnabled,
    dictationMode,
    messages,
    inputText,
    waitingForResponse,
    toolCallArguments,
    activeBranchId,
    branches,
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
      transcriptionProfileId: impl.transcriptionProfileId,
      agentProfileId: impl.agentProfileId,
      thinking: impl.thinking,
      permissionMode: impl.permissionMode,
      searchEnabled: impl.searchEnabled,
      dictationMode: impl.dictationMode,
      messages: impl.messages,
      inputText: impl.inputText,
      waitingForResponse: impl.waitingForResponse,
      toolCallArguments: impl.toolCallArguments,
      activeBranchId: impl.activeBranchId ?? null,
      branches: impl.branches ?? {},
      isFrozen: impl.isFrozen,
    };
  }, shallow);

  if (managed) {
    return (
      <ManagedChatArea
        sectionId={sectionId}
        surfaceId={surfaceId}
        controlledChatId={controlledChatId}
        setControlledChatId={setControlledChatId}
        engineConfigId={engineConfigId}
        transcriptionProfileId={transcriptionProfileId}
        agentProfileId={agentProfileId}
        thinking={thinking}
        permissionMode={permissionMode}
        searchEnabled={searchEnabled}
        dictationMode={dictationMode}
      />
    );
  }

  return (
    <ScriptableChatArea
      sectionId={sectionId}
      transcriptionProfileId={transcriptionProfileId}
      messages={messages}
      inputText={inputText}
      waitingForResponse={waitingForResponse}
      toolCallArguments={toolCallArguments}
      activeBranchId={activeBranchId}
      branches={branches}
      isFrozen={isFrozen}
      dictationMode={dictationMode}
    />
  );
}

type ScriptableChatAreaProps = {
  sectionId: string;
  transcriptionProfileId: string | null;
  messages: Array<ChatSectionState["messages"][number]>;
  inputText: string;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  activeBranchId: string | null;
  branches: ChatSectionState["branches"];
  isFrozen: boolean;
  dictationMode: "auto" | "browser" | "provider";
};

function ScriptableChatArea({
  sectionId,
  transcriptionProfileId,
  messages,
  inputText,
  waitingForResponse,
  toolCallArguments,
  activeBranchId,
  branches,
  isFrozen,
  dictationMode,
}: ScriptableChatAreaProps) {
  const { ref, isScrollable } = useIsScrollable();
  const projectConfigId = getCurrProjectConfigId();
  const [draftInputText, setDraftInputText] = useState<string | null>(null);
  const {
    contextWindowTokens,
    contextUsedTokens,
    contextUsageIsEstimated,
    contextUsageUnavailable,
  } = resolveAuthoritativeContextTelemetry(null);

  const handleInputChange = useCallback(
    (value: string) => {
      if (waitingForResponse) {
        setDraftInputText(value);
        return;
      }
      useProjectState.setState((state) => {
        const current = getCurrEffectiveSectionImplOfType(
          state,
          sectionId,
          SectionTypeEnum.Chat,
        );
        if (value === current.inputText) {
          return;
        }
        setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
          inputText: value,
        });
      });
    },
    [sectionId, waitingForResponse],
  );

  useEffect(() => {
    if (waitingForResponse) {
      return;
    }
    if (draftInputText === null) {
      return;
    }
    useProjectState.setState((state) => {
      const current = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Chat,
      );
      if (draftInputText === current.inputText) {
        return;
      }
      setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
        inputText: draftInputText,
      });
    });
    setDraftInputText(null);
  }, [draftInputText, sectionId, waitingForResponse]);

  const applyChatStateWithAck = useCallback(
    (nextState: ChatSectionState) => {
      let sendPromise: ReturnType<typeof route_set_chat_section_state> | null =
        null;
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
            messages: nextState.messages,
            inputText: nextState.inputText,
            waitingForResponse: nextState.waitingForResponse,
            toolCallArguments: nextState.toolCallArguments,
            activeBranchId: nextState.activeBranchId,
            branches: nextState.branches,
          });
        },
        send: (frontendOpId) => {
          const result = route_set_chat_section_state({
            projectConfigId,
            sectionId,
            state: nextState,
            frontendOpId,
          });
          sendPromise = result;
          return result;
        },
      });
      return sendPromise;
    },
    [projectConfigId, sectionId],
  );

  const applyChatStateWithoutAck = useCallback(
    (nextState: ChatSectionState) => {
      useProjectState.setState((state) => {
        setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
          messages: nextState.messages,
          inputText: nextState.inputText,
          waitingForResponse: nextState.waitingForResponse,
          toolCallArguments: nextState.toolCallArguments,
          activeBranchId: nextState.activeBranchId,
          branches: nextState.branches,
        });
      });
      return route_set_chat_section_state({
        projectConfigId,
        sectionId,
        state: nextState,
        frontendOpId: null,
      });
    },
    [projectConfigId, sectionId],
  );

  const branchState = useMemo(
    () =>
      ensureChatBranchState({
        messages,
        inputText,
        waitingForResponse,
        toolCallArguments,
        activeBranchId,
        branches,
      }),
    [
      activeBranchId,
      branches,
      inputText,
      messages,
      toolCallArguments,
      waitingForResponse,
    ],
  );
  const effectiveState = branchState.nextState;
  const effectiveMessages = effectiveState.messages ?? [];
  const effectiveBranches = effectiveState.branches ?? {};
  const effectiveBranchId = effectiveState.activeBranchId ?? null;

  useEffect(() => {
    if (!branchState.didInitialize) {
      return;
    }
    const sendPromise = applyChatStateWithoutAck(effectiveState);
    if (sendPromise) {
      void sendPromise;
    }
  }, [applyChatStateWithoutAck, branchState.didInitialize, effectiveState]);

  const handleSubmit = useCallback(
    (message: string, attachments: ChatFileAttachment[]) =>
      submitScriptableChatMessage({
        message,
        attachments,
        effectiveBranchId,
        effectiveBranches,
        effectiveMessages,
        effectiveState,
        toolCallArguments,
        applyChatStateWithAck,
        sectionId,
      }),
    [
      applyChatStateWithAck,
      effectiveBranchId,
      effectiveBranches,
      effectiveMessages,
      effectiveState,
      sectionId,
      toolCallArguments,
    ],
  );

  const handleStop = useCallback(
    () =>
      stopScriptableChatResponse({
        effectiveMessages,
        effectiveState,
        toolCallArguments,
        applyChatStateWithAck,
        sectionId,
      }),
    [
      applyChatStateWithAck,
      effectiveMessages,
      effectiveState,
      sectionId,
      toolCallArguments,
    ],
  );

  const slashCommands = useMemo(
    () =>
      buildChatSlashCommands({
        model: false,
        permissions: false,
        search: false,
      }),
    [],
  );

  const resetConversation = useCallback(
    () => resetScriptableConversation({ applyChatStateWithAck }),
    [applyChatStateWithAck],
  );

  const resumeLatestBranch = useCallback(
    () =>
      resumeLatestScriptableBranch({
        effectiveBranches,
        effectiveState,
        applyChatStateWithAck,
      }),
    [applyChatStateWithAck, effectiveBranches, effectiveState],
  );

  const handleSlashCommand = useCallback(
    (command: ChatSlashCommand) =>
      executeScriptableChatSlashCommand({
        command,
        slashCommands,
        onStartNewChat: resetConversation,
        onResumeLatestChat: resumeLatestBranch,
      }),
    [resetConversation, resumeLatestBranch, slashCommands],
  );

  const branchIndex = useMemo(
    () => buildBranchIndexFromBranches(effectiveBranches),
    [effectiveBranches],
  );
  const branchInfoByMessage = useMemo(() => {
    if (!effectiveBranchId) {
      return {};
    }
    return buildMessageBranchInfo({
      chatId: effectiveBranchId,
      messages: effectiveMessages,
      branchIndex,
    });
  }, [branchIndex, effectiveBranchId, effectiveMessages]);
  const editDisabledReason = useMemo(
    () =>
      getChatEditDisabledReason({
        hasEngineConfig: true,
        hasLLMConfig: true,
        isExternalEngine: false,
        externalEngineAvailable: true,
        isFrozen,
      }),
    [isFrozen],
  );

  const handleBranchSwitch = useCallback(
    (nextBranchId: string) =>
      switchScriptableChatBranch({
        nextBranchId,
        effectiveBranchId,
        effectiveBranches,
        effectiveState,
        applyChatStateWithAck,
      }),
    [
      applyChatStateWithAck,
      effectiveBranchId,
      effectiveBranches,
      effectiveState,
    ],
  );

  const handleEditMessage = useCallback(
    (messageId: string, text: string, attachments: ChatFileAttachment[]) =>
      editScriptableChatMessage({
        messageId,
        text,
        attachments,
        waitingForResponse,
        effectiveState,
        toolCallArguments,
        applyChatStateWithAck,
        sectionId,
      }),
    [
      applyChatStateWithAck,
      effectiveState,
      sectionId,
      toolCallArguments,
      waitingForResponse,
    ],
  );

  const scrollClassName = isScrollable ? NO_WHEEL_CLASS_NAME : "";
  const chatWidthShellClassName = "mx-auto w-full max-w-[72rem] px-2";
  const effectiveInputText =
    effectiveState.waitingForResponse && draftInputText !== null
      ? draftInputText
      : effectiveState.inputText ?? "";
  const submitDisabled = useMemo(
    () =>
      !effectiveState.waitingForResponse &&
      hasPendingToolInteraction(effectiveMessages),
    [effectiveMessages, effectiveState.waitingForResponse],
  );
  const providerDictationAvailable = Boolean(transcriptionProfileId);
  const handleProviderDictationTranscribe = useCallback(
    async (audioBlob: Blob) => {
      if (!transcriptionProfileId) {
        throw new Error("Provider dictation is not configured.");
      }
      return transcribeChatAudioWithProfile(transcriptionProfileId, audioBlob);
    },
    [transcriptionProfileId],
  );

  return (
    <div
      className={`${NO_PAN_CLASS_NAME} section-main-full-w flex min-h-0 flex-1 flex-col`}
    >
      <ChatMessageList
        messages={effectiveMessages}
        waitingForResponse={effectiveState.waitingForResponse}
        toolCallArguments={toolCallArguments}
        className={scrollClassName}
        contentClassName={chatWidthShellClassName}
        scrollRef={ref}
        editDisabledReason={editDisabledReason}
        onEditMessage={handleEditMessage}
        onBranchSwitch={handleBranchSwitch}
        branchInfoByMessage={branchInfoByMessage}
      />
      <div
        className={`${chatWidthShellClassName} pb-1`}
        data-chat-width-shell="true"
      >
        <ChatInput
          placeholderText="Type a message..."
          waitingForResponse={effectiveState.waitingForResponse}
          submitDisabled={submitDisabled}
          disabled={isFrozen}
          value={effectiveInputText}
          onChange={handleInputChange}
          onSubmit={handleSubmit}
          onStop={handleStop}
          slashCommands={slashCommands}
          recognizedSlashCommands={CHAT_SLASH_COMMANDS}
          onSlashCommand={handleSlashCommand}
          dictationMode={dictationMode}
          dictationEnabledByProvider={providerDictationAvailable}
          providerDictationLikelySupported={providerDictationAvailable}
          contextWindowTokens={contextWindowTokens}
          contextUsedTokens={contextUsedTokens}
          contextUsageIsEstimated={contextUsageIsEstimated}
          contextUsageUnavailable={contextUsageUnavailable}
          onProviderDictationTranscribe={
            providerDictationAvailable
              ? handleProviderDictationTranscribe
              : undefined
          }
        />
      </div>
    </div>
  );
}

type ManagedChatAreaProps = {
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
  dictationMode: "auto" | "browser" | "provider";
};

function ManagedChatArea({
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
  const lastChatIdRef = useRef<string | null>(null);
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
  const selectedLLMConfig = useMemo(() => {
    if (!selectedLLMConfigId || !allLLMConfigs) {
      return null;
    }
    return allLLMConfigs.configs[selectedLLMConfigId] ?? null;
  }, [allLLMConfigs, selectedLLMConfigId]);
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
  const {
    contextWindowTokens,
    contextUsedTokens,
    contextUsageIsEstimated,
    contextUsageUnavailable,
  } = useMemo(
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
      SettaNotificationTypeEnum.warning,
    );
  }, [externalEngineIssueMessage]);

  useEffect(() => {
    if (typeof chatId !== "string") {
      return;
    }
    if (isExternalEngine) {
      getExternalAgentChat(chatId, projectConfigId);
      return;
    }
    getLLMChat(chatId);
  }, [chatId, isExternalEngine, projectConfigId]);

  const setChatId = useCallback(
    (next: ChatSectionChatIdUpdate) =>
      setManagedSectionChatId({
        next,
        canUseManagedChat,
        chatId,
        setControlledChatId,
        resolvePersistedChatId: () =>
          getCurrEffectiveSectionImplOfType(
            useProjectState.getState(),
            sectionId,
            SectionTypeEnum.Chat,
          ).chatId,
        persistChatId: (nextChatId) => {
          persistManagedSectionChatId({
            projectConfigId,
            sectionId,
            chatId: nextChatId,
          });
        },
      }),
    [
      canUseManagedChat,
      chatId,
      projectConfigId,
      sectionId,
      setControlledChatId,
    ],
  );

  const handleNewChatStart = useCallback(
    () =>
      startManagedSectionChatThread({
        canUseManagedChat,
        surfaceId,
        setChatId,
        setShowHistory,
      }),
    [canUseManagedChat, setChatId, surfaceId],
  );

  const handleNewChatSettled = useCallback(
    (newChatId: string | null, succeeded: boolean) =>
      settleManagedSectionChatThreadStart({
        surfaceId,
        newChatId,
        succeeded,
        setChatId,
      }),
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
    (message: string, attachments: ChatFileAttachment[]) =>
      submitManagedSectionChatMessage({
        message,
        attachments,
        chatId,
        canUseManagedChat,
        hasEngineConfig,
        hasLLMConfig,
        isExternalEngine,
        externalEngineAvailable,
        thinking,
        effectiveEngineConfigId,
        agentProfileId,
        sectionId,
        surfaceId,
        executionSettings: {
          permissionMode,
          searchEnabled,
        },
        onStartNewChat: handleNewChatStart,
        onSettleNewChat: handleNewChatSettled,
      }),
    [
      agentProfileId,
      canUseManagedChat,
      chatId,
      effectiveEngineConfigId,
      handleNewChatSettled,
      handleNewChatStart,
      hasEngineConfig,
      externalEngineAvailable,
      hasLLMConfig,
      isExternalEngine,
      permissionMode,
      searchEnabled,
      sectionId,
      surfaceId,
      thinking,
      canUseManagedChat,
    ],
  );

  const handleStop = useCallback(
    () =>
      stopManagedSectionChatWithAction({
        chatId,
        isExternalEngine,
        projectConfigId,
        sectionId,
        surfaceId,
      }),
    [chatId, isExternalEngine, projectConfigId, sectionId, surfaceId],
  );

  const handleEditMessage = useCallback(
    (messageId: string, text: string, attachments: ChatFileAttachment[]) =>
      editManagedSectionChatMessage({
        resolvedChatId:
          typeof chatId === "string" ? chatId : lastChatIdRef.current,
        messageId,
        text,
        attachments,
        canUseManagedChat,
        isExternalEngine,
        externalEngineAvailable,
        messages,
        thinking,
        effectiveEngineConfigId,
        agentProfileId,
        sectionId,
        surfaceId,
        executionSettings: {
          permissionMode,
          searchEnabled,
        },
      }),
    [
      agentProfileId,
      canUseManagedChat,
      chatId,
      effectiveEngineConfigId,
      externalEngineAvailable,
      isExternalEngine,
      messages,
      permissionMode,
      searchEnabled,
      sectionId,
      surfaceId,
      thinking,
    ],
  );

  const handleBranchSwitch = useCallback(
    (nextChatId: string) =>
      selectManagedSectionChat({
        nextChatId,
        setChatId,
        setShowHistory,
      }),
    [setChatId],
  );

  const handleSelectHistoryChat = useCallback(
    (nextChatId: string) =>
      selectManagedSectionChat({
        nextChatId,
        setChatId,
        setShowHistory,
      }),
    [setChatId],
  );

  const handleResumeLatestChat = useCallback(
    () =>
      resumeLatestManagedSectionChat({
        canUseManagedChat,
        chatId,
        projectConfigId,
        sectionId,
        historyCompatibility,
        agentRuns: useAIStore.getState().agentRuns,
        setChatId,
        setShowHistory,
      }),
    [
      canUseManagedChat,
      chatId,
      historyCompatibility,
      projectConfigId,
      sectionId,
      setChatId,
    ],
  );

  const handleSlashCommand = useCallback(
    async (command: ChatSlashCommand): Promise<ChatSlashCommandResult> => {
      return executeSectionChatSlashCommand({
        command,
        canUseManagedChat,
        slashCommands,
        onStartNewChat: handleNewChatStart,
        onResumeLatestChat: handleResumeLatestChat,
      });
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
    (audioBlob: Blob) =>
      transcribeManagedSectionChatAudio({
        isExternalEngine,
        transcriptionProfileId,
        audioBlob,
      }),
    [isExternalEngine, transcriptionProfileId],
  );

  return (
    <div
      className={`${NO_PAN_CLASS_NAME} section-main-full-w flex min-h-0 flex-1 flex-col`}
    >
      <ManagedChatAreaHeader
        shellClassName={chatWidthShellClassName}
        showPlanModeBadge={showPlanModeBadge}
        showZeroScopeBanner={showZeroScopeBanner}
        hasAnyAgenticEdge={hasAnyAgenticEdge}
        hasWriteScope={hasWriteScope}
        canUseManagedChat={canUseManagedChat}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory((current) => !current)}
        onStartNewChat={handleNewChatStart}
        onDismissZeroScopeBanner={dismissZeroScopeBanner}
      />
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
          contextUsageUnavailable={contextUsageUnavailable}
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
