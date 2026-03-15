import { ChatInput } from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import {
  CHAT_SLASH_COMMANDS,
  buildChatSlashCommands,
  formatSlashCommandHelp,
} from "components/Chat/chatComposerControls";
import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";
import {
  type ChatSlashCommand,
  type ChatSlashCommandResult,
} from "components/Chat/chatInputSubmission";
import { resolveAuthoritativeContextTelemetry } from "components/Chat/contextTelemetry";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildMessageBranchInfo } from "state/actions/aiBranches";
import { transcribeChatAudioWithProfile } from "state/actions/aiTranscriptionUpload";
import { buildBranchFromEdit } from "state/actions/chatBranchEditing";
import { buildBranchIndexFromBranches } from "state/actions/chatBranchIndexState";
import { ensureChatBranchState } from "state/actions/chatBranchState";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionScrollability";
import { hasPendingToolInteraction } from "utils/claudeTools";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { route_set_chat_section_state } from "utils/generatedEndpoints";
import {
  ChatFileAttachment,
  ChatRoleEnum,
  ChatSectionState,
  SectionTypeEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { shallow } from "zustand/shallow";
import {
  emitChatSendAction,
  emitChatStopAction,
} from "./chatAreaRealtimeEvents";

export function ScriptableChatAreaSurface({
  sectionId,
}: {
  sectionId: string;
}) {
  const {
    transcriptionProfileId,
    messages,
    inputText,
    waitingForResponse,
    toolCallArguments,
    activeBranchId,
    branches,
    isFrozen,
    dictationMode,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
    return {
      transcriptionProfileId: impl.transcriptionProfileId,
      messages: impl.messages,
      inputText: impl.inputText,
      waitingForResponse: impl.waitingForResponse,
      toolCallArguments: impl.toolCallArguments,
      activeBranchId: impl.activeBranchId ?? null,
      branches: impl.branches ?? {},
      isFrozen: impl.isFrozen,
      dictationMode: impl.dictationMode,
    };
  }, shallow);
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
    if (waitingForResponse || draftInputText === null) {
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
