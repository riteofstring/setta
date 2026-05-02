import type { ResponseDataAndStatus } from "@setta/app-subsystem-frontend-sdk";

import { callOpenAPI, createNewId } from "@setta/app-subsystem-frontend-sdk";

import {
  ChatInput,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
} from "components/Chat/ChatInput";

import { ChatMessageList } from "components/Chat/ChatMessages";

import {
  CHAT_SLASH_COMMANDS,
  buildChatSlashCommands,
  formatSlashCommandHelp,
} from "components/Chat/chatComposerControls";

import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";

import { resolveAuthoritativeContextTelemetry } from "components/Chat/contextTelemetry";

import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";

import { setChatSectionState } from "openapi/http";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  loadAgentRuns,
  transcribeChatAudioWithProfile,
} from "state/actions/ai";

import { buildMessageBranchInfo } from "state/actions/aiBranches";

import {
  buildBranchFromEdit,
  buildBranchIndexFromBranches,
  ensureChatBranchState,
} from "state/actions/chatBranches";

import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";

import { sendRealtimeDependencyEvent } from "state/actions/websocketReceive";

import { useAIStore, useProjectState } from "state/definitions";

import { useIsScrollable } from "state/hooks/sectionSizes";

import { hasPendingToolInteraction } from "utils/claudeTools";

import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";

import {
  ChatDictationMode,
  ChatFileAttachment,
  ChatRoleEnum,
  ChatSectionState,
  ChatSendEvent,
  ChatStopEvent,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  LiteralDependencyValue,
  SectionTypeEnum,
  createMessageTextContent,
} from "utils/generatedTypes";

import { shallow } from "zustand/shallow";

import {
  formatHistoryTimestamp,
  getHistoryPlaceholderText,
  shouldPersistInitializedChatState,
  toSortedHistoryEntries,
  type ChatSectionHistoryEntry,
} from "../chatAreaUtils";

import { ManagedChatArea } from "./managedChatArea";

export type ChatActionPayload = ChatSendEvent | ChatStopEvent;

export type ChatSectionChatId = string | null;

export type ChatSectionStateRouteResponse = ResponseDataAndStatus<null>;

export type ChatSectionChatIdUpdate =
  | ChatSectionChatId
  | ((current: ChatSectionChatId) => ChatSectionChatId);

export type EmitChatSendActionArgs = {
  sectionId: string;
  messageId: string;
  text: string;
  attachments: ChatFileAttachment[];
  role: ChatRoleEnum;
  managed: boolean;
  timestampMs: number;
};

export type EmitChatStopActionArgs = {
  sectionId: string;
  managed: boolean;
  timestampMs: number;
};

export type ManagedChatSubmitGuardInput = {
  message: string;
  attachments: ChatFileAttachment[];
  canUseManagedChat: boolean;
  hasEngineConfig: boolean;
  isExternalEngine: boolean;
  hasLLMConfig: boolean;
  externalEngineAvailable: boolean;
};

export function canSubmitManagedChatMessage({
  message,
  attachments,
  canUseManagedChat,
  hasEngineConfig,
  isExternalEngine,
  hasLLMConfig,
  externalEngineAvailable,
}: ManagedChatSubmitGuardInput): boolean {
  if (!message.trim() && attachments.length === 0) {
    return false;
  }
  if (!canUseManagedChat || !hasEngineConfig) {
    return false;
  }
  if (!isExternalEngine && !hasLLMConfig) {
    return false;
  }
  if (isExternalEngine && !externalEngineAvailable) {
    return false;
  }
  return true;
}

export function emitChatAction(payload: ChatActionPayload) {
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

export function emitChatSendAction({
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

export function emitChatStopAction({
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

export type ScriptableChatAreaProps = {
  sectionId: string;
  transcriptionProfileId: string | null;
  messages: Array<ChatSectionState["messages"][number]>;
  inputText: string;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  activeBranchId: string | null;
  branches: ChatSectionState["branches"];
  isFrozen: boolean;
  dictationMode: ChatDictationMode;
};

export function ScriptableChatArea({
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
  const { contextWindowTokens, contextUsedTokens, contextUsageIsEstimated } =
    resolveAuthoritativeContextTelemetry(null);
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
      let sendPromise: Promise<ChatSectionStateRouteResponse> | null = null;
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
          const result = callOpenAPI(
            setChatSectionState({
              body: {
                projectConfigId,
                sectionId,
                state: nextState,
                frontendOpId,
              },
            } as Parameters<typeof setChatSectionState>[0]),
          );
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
      return callOpenAPI(
        setChatSectionState({
          body: {
            projectConfigId,
            sectionId,
            state: nextState,
            frontendOpId: null,
          },
        } as Parameters<typeof setChatSectionState>[0]),
      );
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
    const current = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    if (
      !shouldPersistInitializedChatState({
        currentState: {
          messages: current.messages,
          inputText: current.inputText,
          waitingForResponse: current.waitingForResponse,
          toolCallArguments: current.toolCallArguments,
          activeBranchId: current.activeBranchId ?? null,
          branches: current.branches ?? {},
        },
        initializedState: effectiveState,
      })
    ) {
      return;
    }
    const sendPromise = applyChatStateWithoutAck(effectiveState);
    if (sendPromise) {
      void sendPromise;
    }
  }, [
    applyChatStateWithoutAck,
    branchState.didInitialize,
    effectiveState,
    sectionId,
  ]);
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

export function ChatSectionHistoryList({
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

export function ManagedChatHistoryPanel({
  projectConfigId,
  sectionId,
  activeChatId,
  onSelect,
}: {
  projectConfigId: string;
  sectionId: string;
  activeChatId: string | null;
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
    () => toSortedHistoryEntries(agentRuns, projectConfigId, sectionId),
    [agentRuns, projectConfigId, sectionId],
  );
  useEffect(() => {
    if (!agentRunsInitialLoadComplete) {
      void loadAgentRuns();
    }
  }, [agentRunsInitialLoadComplete]);
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
