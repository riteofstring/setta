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
import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRunInputString,
  getRunLastUpdatedMs,
} from "state/actions/agentRunUtils";
import { loadAgentRuns } from "state/actions/aiAgentRuns";
import { buildMessageBranchInfo } from "state/actions/aiBranches";
import { stopManagedSectionChatResponse } from "state/actions/aiChatControls";
import { getDefaultChatDetails } from "state/actions/aiChatDetails";
import {
  clearPendingChatDetails,
  initializePendingChatDetails,
  submitEditedMessage,
  submitMessage,
} from "state/actions/aiChatSubmission";
import { getExternalAgentChat, getLLMChat } from "state/actions/aiHydration";
import { transcribeChatAudioWithProfile } from "state/actions/aiTranscription";
import {
  buildBranchFromEdit,
  buildBranchIndexFromBranches,
  ensureChatBranchState,
} from "state/actions/chatBranches";
import {
  buildChatHistoryEntries,
  type ChatHistoryCompatibility,
  type ChatRunType,
} from "state/actions/chatHistory";
import { addPersistentNotification } from "state/actions/notifications";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { sendRealtimeDependencyEvent } from "state/actions/websocketReceive";
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
  route_set_chat_section_chat_id,
  route_set_chat_section_state,
} from "utils/generatedEndpoints";
import {
  AgentRun,
  AgenticEdgeKindEnum,
  ChatFileAttachment,
  ChatRoleEnum,
  ChatSectionState,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  EngineTypeEnum,
  LiteralDependencyValue,
  SectionTypeEnum,
  SettaNotificationTypeEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { shallow } from "zustand/shallow";

type ChatSendActionPayload = {
  action: "send";
  sectionId: string;
  messageId: string;
  text: string;
  attachments: ChatFileAttachment[];
  role: ChatRoleEnum;
  timestampMs: number;
  managed: boolean;
};

type ChatStopActionPayload = {
  action: "stop";
  sectionId: string;
  timestampMs: number;
  managed: boolean;
};

type ChatActionPayload = ChatSendActionPayload | ChatStopActionPayload;

type ChatSectionChatId = string | null;
type ChatSectionChatIdUpdate =
  | ChatSectionChatId
  | ((current: ChatSectionChatId) => ChatSectionChatId);
const MANAGED_CHAT_HISTORY_RUNNING_POLL_INTERVAL_MS = 5000;
const MANAGED_CHAT_HISTORY_ERROR_POLL_INTERVAL_MS = 10000;

export function shouldExitManagedChatHistory({
  previousChatId,
  nextChatId,
  previousWaitingForResponse,
  nextWaitingForResponse,
}: {
  previousChatId: ChatSectionChatId | undefined;
  nextChatId: ChatSectionChatId;
  previousWaitingForResponse: boolean;
  nextWaitingForResponse: boolean;
}): boolean {
  if (previousChatId !== undefined && previousChatId !== nextChatId) {
    return true;
  }
  return !previousWaitingForResponse && nextWaitingForResponse;
}

export function getManagedChatRunRefreshKey({
  agentRuns,
  sectionId,
  chatId,
  runType,
}: {
  agentRuns: Array<AgentRun>;
  sectionId: string;
  chatId: string | null;
  runType: ChatRunType | null;
}): string | null {
  if (!chatId || !runType) {
    return null;
  }
  let latestMatchingRun: AgentRun | null = null;
  let latestUpdatedMs = -1;
  for (const run of agentRuns) {
    if (getRunInputString(run, "runType") !== runType) {
      continue;
    }
    if (getRunInputString(run, "sectionId") !== sectionId) {
      continue;
    }
    if (getRunInputString(run, "chatId") !== chatId) {
      continue;
    }
    const updatedMs = getRunLastUpdatedMs(run);
    if (updatedMs <= latestUpdatedMs) {
      continue;
    }
    latestMatchingRun = run;
    latestUpdatedMs = updatedMs;
  }
  if (!latestMatchingRun) {
    return null;
  }
  return `${latestMatchingRun.id}:${latestMatchingRun.status}:${latestUpdatedMs}`;
}

function buildManagedZeroScopeBannerSessionKey(
  projectConfigId: string,
  sectionId: string,
): string {
  return `setta:managed-zero-scope-banner-dismissed:${projectConfigId}:${sectionId}`;
}

export function resolveManagedChatHistoryPollIntervalMs({
  hasLoadError,
  hasRunningHistoryEntry,
}: {
  hasLoadError: boolean;
  hasRunningHistoryEntry: boolean;
}): number | null {
  if (hasRunningHistoryEntry) {
    return MANAGED_CHAT_HISTORY_RUNNING_POLL_INTERVAL_MS;
  }
  if (hasLoadError) {
    return MANAGED_CHAT_HISTORY_ERROR_POLL_INTERVAL_MS;
  }
  return null;
}

type EmitChatSendActionArgs = {
  sectionId: string;
  messageId: string;
  text: string;
  attachments: ChatFileAttachment[];
  role: ChatRoleEnum;
  managed: boolean;
  timestampMs: number;
};

type EmitChatStopActionArgs = {
  sectionId: string;
  managed: boolean;
  timestampMs: number;
};

type ChatSectionHistoryEntry = ReturnType<
  typeof buildChatHistoryEntries
>[number];

function emitChatAction(payload: ChatActionPayload) {
  const literalPayload: LiteralDependencyValue = {
    payload: JSON.stringify(payload),
    type: DependencyValueTypeEnum.Literal,
  };
  sendRealtimeDependencyEvent({
    dependencyKey: {
      type: DependencyKeyTypeEnum.Section,
      sectionId: payload.sectionId,
    },
    payload: literalPayload,
    timestampMs: payload.timestampMs,
  });
}

function emitChatSendAction({
  sectionId,
  messageId,
  text,
  attachments,
  role,
  managed,
  timestampMs,
}: EmitChatSendActionArgs) {
  emitChatAction({
    action: "send",
    sectionId,
    messageId,
    text,
    attachments,
    role,
    timestampMs,
    managed,
  });
}

function emitChatStopAction({
  sectionId,
  managed,
  timestampMs,
}: EmitChatStopActionArgs) {
  emitChatAction({
    action: "stop",
    sectionId,
    managed,
    timestampMs,
  });
}

function formatHistoryTimestamp(timestampMs: number): string {
  if (timestampMs <= 0) {
    return "No timestamp";
  }
  return new Date(timestampMs).toLocaleString();
}

function getHistoryPlaceholderText(
  initialLoadComplete: boolean,
  loadError: string | null,
  entryCount: number,
): string {
  if (loadError) {
    return loadError;
  }
  if (!initialLoadComplete) {
    return "Loading chat history...";
  }
  if (entryCount === 0) {
    return "No chat history yet";
  }
  return "";
}

function toSortedHistoryEntries(
  runs: Array<AgentRun>,
  projectConfigId: string,
  sectionId: string,
  compatibility: ChatHistoryCompatibility | null,
): Array<ChatSectionHistoryEntry> {
  return buildChatHistoryEntries(runs, {
    projectConfigId,
    sectionId,
    compatibility,
  }).sort((left, right) => right.lastUpdatedMs - left.lastUpdatedMs);
}

function resolveManagedChatRunType(
  engineType: EngineTypeEnum | null,
): ChatRunType | null {
  if (engineType === EngineTypeEnum.external_agent) {
    return "external_agent";
  }
  if (engineType === EngineTypeEnum.setta_llm) {
    return "llm_chat";
  }
  return null;
}

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
    async (message: string, attachments: ChatFileAttachment[]) => {
      const trimmed = message.trim();
      if (!trimmed && attachments.length === 0) {
        return false;
      }
      if (!effectiveBranchId) {
        return false;
      }
      const messageId = createNewId();
      const timestampMs = Date.now();
      const content = [];
      if (trimmed) {
        content.push(createMessageTextContent({ text: message }));
      }
      const newMessage = {
        id: messageId,
        role: ChatRoleEnum.user,
        content,
        attachments,
        createdAt: timestampMs,
      };
      const currentBranch = effectiveBranches[effectiveBranchId];
      const baseMessages = currentBranch?.messages ?? effectiveMessages;
      const nextMessages = [...baseMessages, newMessage];
      const nextBranches = currentBranch
        ? {
            ...effectiveBranches,
            [effectiveBranchId]: {
              ...currentBranch,
              messages: nextMessages,
            },
          }
        : effectiveBranches;
      const nextState = {
        ...effectiveState,
        messages: nextMessages,
        inputText: "",
        waitingForResponse: true,
        toolCallArguments,
        branches: nextBranches,
      };
      const sendPromise = applyChatStateWithAck(nextState);
      if (sendPromise) {
        await sendPromise;
      }
      emitChatSendAction({
        sectionId,
        messageId,
        text: message,
        attachments,
        role: ChatRoleEnum.user,
        managed: false,
        timestampMs,
      });
      return true;
    },
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

  const handleStop = useCallback(async () => {
    const nextState = {
      ...effectiveState,
      messages: effectiveMessages,
      inputText: effectiveState.inputText ?? "",
      waitingForResponse: false,
      toolCallArguments,
    };
    const sendPromise = applyChatStateWithAck(nextState);
    if (sendPromise) {
      await sendPromise;
    }
    emitChatStopAction({
      sectionId,
      managed: false,
      timestampMs: Date.now(),
    });
  }, [
    applyChatStateWithAck,
    effectiveMessages,
    effectiveState,
    sectionId,
    toolCallArguments,
  ]);

  const slashCommands = useMemo(
    () =>
      buildChatSlashCommands({
        model: false,
        permissions: false,
        search: false,
      }),
    [],
  );

  const resetScriptableConversation = useCallback(async () => {
    const nextState: ChatSectionState = {
      messages: [],
      inputText: "",
      waitingForResponse: false,
      toolCallArguments: {},
      activeBranchId: null,
      branches: {},
    };
    const sendPromise = applyChatStateWithAck(nextState);
    if (sendPromise) {
      await sendPromise;
    }
  }, [applyChatStateWithAck]);

  const resumeLatestScriptableBranch =
    useCallback(async (): Promise<boolean> => {
      const latestBranch = Object.entries(effectiveBranches)
        .sort(
          (left, right) => (right[1].createdAt ?? 0) - (left[1].createdAt ?? 0),
        )
        .at(0);
      const branchId = latestBranch?.[0] ?? null;
      if (!branchId) {
        return false;
      }
      const nextBranch = effectiveBranches[branchId];
      if (!nextBranch) {
        return false;
      }
      const nextState: ChatSectionState = {
        ...effectiveState,
        activeBranchId: branchId,
        messages: [...(nextBranch.messages ?? [])],
        waitingForResponse: false,
        inputText: "",
      };
      const sendPromise = applyChatStateWithAck(nextState);
      if (sendPromise) {
        await sendPromise;
      }
      return true;
    }, [applyChatStateWithAck, effectiveBranches, effectiveState]);

  const handleSlashCommand = useCallback(
    async (command: ChatSlashCommand): Promise<ChatSlashCommandResult> => {
      if (command.action === "new") {
        await resetScriptableConversation();
        return { feedback: "Started a new scriptable chat." };
      }
      if (command.action === "resume") {
        const resumed = await resumeLatestScriptableBranch();
        return resumed
          ? { feedback: "Resumed the latest branch." }
          : {
              feedback: "No previous branch found to resume.",
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
    [resetScriptableConversation, resumeLatestScriptableBranch, slashCommands],
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
    async (nextBranchId: string) => {
      if (!nextBranchId || nextBranchId === effectiveBranchId) {
        return;
      }
      const nextBranch = effectiveBranches[nextBranchId];
      if (!nextBranch) {
        return;
      }
      const nextState: ChatSectionState = {
        ...effectiveState,
        activeBranchId: nextBranchId,
        messages: [...(nextBranch.messages ?? [])],
      };
      const sendPromise = applyChatStateWithAck(nextState);
      if (sendPromise) {
        await sendPromise;
      }
    },
    [
      applyChatStateWithAck,
      effectiveBranchId,
      effectiveBranches,
      effectiveState,
    ],
  );

  const handleEditMessage = useCallback(
    async (
      messageId: string,
      text: string,
      attachments: ChatFileAttachment[],
    ) => {
      if (waitingForResponse) {
        return false;
      }
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) {
        return false;
      }
      const content = [];
      if (trimmed) {
        content.push(createMessageTextContent({ text }));
      }
      const editedMessage = {
        id: messageId,
        role: ChatRoleEnum.user,
        content,
        attachments,
        createdAt: Date.now(),
      };
      const result = buildBranchFromEdit({
        state: effectiveState,
        editedMessage,
        branchFromMessageId: messageId,
      });
      if (!result) {
        return false;
      }
      const nextState: ChatSectionState = {
        ...result.nextState,
        inputText: "",
        waitingForResponse: true,
        toolCallArguments,
      };
      const sendPromise = applyChatStateWithAck(nextState);
      if (sendPromise) {
        await sendPromise;
      }
      emitChatSendAction({
        sectionId,
        messageId,
        text,
        attachments,
        role: ChatRoleEnum.user,
        managed: false,
        timestampMs: Date.now(),
      });
      return true;
    },
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

function ChatSectionHistoryList({
  entries,
  activeChatId,
  initialLoadComplete,
  loadError,
  onSelect,
}: {
  entries: Array<ChatSectionHistoryEntry>;
  activeChatId: string | null;
  initialLoadComplete: boolean;
  loadError: string | null;
  onSelect: (chatId: string) => void;
}) {
  const placeholderText = useMemo(
    () =>
      getHistoryPlaceholderText(initialLoadComplete, loadError, entries.length),
    [entries.length, initialLoadComplete, loadError],
  );

  if (entries.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <p className="text-center text-xs text-setta-400">{placeholderText}</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-1">
      <div className="flex flex-col gap-2">
        {entries.map((entry) => (
          <button
            key={entry.chatId}
            type="button"
            className={`group/historyitem flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-white hover:shadow-sm dark:hover:bg-setta-800 ${
              entry.chatId === activeChatId
                ? "bg-blue-600 dark:bg-blue-700"
                : ""
            }`}
            onClick={() => onSelect(entry.chatId)}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p
                className={`truncate text-xs font-semibold text-setta-600 dark:text-setta-100 ${
                  entry.chatId === activeChatId
                    ? "text-white dark:text-white"
                    : ""
                }`}
              >
                {entry.label}
              </p>
              <p
                className={`truncate text-[11px] text-setta-500 dark:text-setta-300 ${
                  entry.chatId === activeChatId
                    ? "text-white/90 dark:text-white/90"
                    : ""
                }`}
              >
                {formatHistoryTimestamp(entry.lastUpdatedMs)}
              </p>
            </div>
            {entry.waitingForResponse ? (
              <BrailleSpinner
                className={`single-cell-child ${BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME} ${
                  entry.chatId === activeChatId
                    ? "text-white dark:text-white"
                    : "text-setta-500/70"
                }`}
              />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function ManagedChatHistoryPanel({
  projectConfigId,
  sectionId,
  activeChatId,
  historyCompatibility,
  onSelect,
}: {
  projectConfigId: string;
  sectionId: string;
  activeChatId: string | null;
  historyCompatibility: ChatHistoryCompatibility | null;
  onSelect: (chatId: string) => void;
}) {
  const { agentRuns, agentRunsInitialLoadComplete, agentRunsLoadError } =
    useAIStore(
      (state) => ({
        agentRuns: state.agentRuns,
        agentRunsInitialLoadComplete: state.agentRunsInitialLoadComplete,
        agentRunsLoadError: state.agentRunsLoadError,
      }),
      shallow,
    );
  const sectionHistoryEntries = useMemo(
    () =>
      toSortedHistoryEntries(
        agentRuns,
        projectConfigId,
        sectionId,
        historyCompatibility,
      ),
    [agentRuns, historyCompatibility, projectConfigId, sectionId],
  );
  const hasRunningHistoryEntry = useMemo(
    () => sectionHistoryEntries.some((entry) => entry.waitingForResponse),
    [sectionHistoryEntries],
  );
  const pollIntervalMs = resolveManagedChatHistoryPollIntervalMs({
    hasLoadError: Boolean(agentRunsLoadError),
    hasRunningHistoryEntry,
  });

  useEffect(() => {
    let intervalId: number | null = null;

    const clearPollingInterval = () => {
      if (intervalId === null) {
        return;
      }
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const startPollingIfNeeded = () => {
      clearPollingInterval();
      if (pollIntervalMs === null || document.visibilityState !== "visible") {
        return;
      }
      intervalId = window.setInterval(() => {
        void loadAgentRuns();
      }, pollIntervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearPollingInterval();
        return;
      }
      void loadAgentRuns();
      startPollingIfNeeded();
    };

    void loadAgentRuns();
    startPollingIfNeeded();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearPollingInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pollIntervalMs]);

  return (
    <ChatSectionHistoryList
      entries={sectionHistoryEntries}
      activeChatId={activeChatId}
      initialLoadComplete={agentRunsInitialLoadComplete}
      loadError={agentRunsLoadError}
      onSelect={onSelect}
    />
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
          route_set_chat_section_chat_id({
            projectConfigId,
            sectionId,
            chatId: resolved,
          }),
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
      const trimmed = message.trim();
      if (!trimmed && attachments.length === 0) {
        return false;
      }
      if (!canUseManagedChat) {
        return false;
      }
      if (!hasEngineConfig) {
        return false;
      }
      if (!isExternalEngine && !hasLLMConfig) {
        return false;
      }
      if (isExternalEngine && !externalEngineAvailable) {
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
          thinking,
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
      surfaceId,
      thinking,
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
        thinking,
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
      surfaceId,
      thinking,
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
