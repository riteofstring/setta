import { ChatInput } from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import {
  Dispatch,
  SetStateAction,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { TbLayoutDashboard } from "react-icons/tb";
import {
  clearPendingChatDetails,
  finalizePendingChatDetails,
  findLatestRunningExternalRunId,
  getDefaultChatDetails,
  getExternalAgentChat,
  getLLMChat,
  initializePendingChatDetails,
  submitEditedMessage,
  submitMessage,
} from "state/actions/ai";
import { buildMessageBranchInfo } from "state/actions/aiBranches";
import { useAIStore } from "state/definitions";
import { useChatBranchIndex } from "state/hooks/useChatBranchIndex";
import { hasPendingToolInteraction } from "utils/claudeTools";
import {
  route_stop_external_agent_run,
  route_stop_llm_chat,
} from "utils/generatedEndpoints";
import { ChatFileAttachment, EngineTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";

function EmptyChatState() {
  return (
    <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-4 overflow-y-auto">
      <button className="flex cursor-pointer items-center gap-1 rounded-md border border-solid border-setta-200/50 px-3 py-2 text-xs font-semibold text-setta-600 transition-colors hover:bg-white hover:text-setta-800 dark:border-setta-700 dark:text-setta-500 dark:hover:bg-setta-850 hover:dark:text-setta-50">
        <TbLayoutDashboard /> Create Project UI
      </button>
    </div>
  );
}

export const ProjectChatCore = memo(function ProjectChatCore({
  chatId,
  placeholderText,
  thinking,
  engineConfigId,
  engineType,
  hasLLMConfig,
  externalEngineAvailable,
  setChatId,
}: {
  chatId: string | null | undefined;
  placeholderText: string;
  thinking: boolean;
  engineConfigId: string | null;
  engineType: EngineTypeEnum | null;
  hasLLMConfig: boolean;
  externalEngineAvailable: boolean;
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
}) {
  const { messages, toolCallArguments, waitingForResponse } = useAIStore(
    (state) => {
      if (chatId === null) {
        return state.pendingChatDetails ?? getDefaultChatDetails();
      }
      if (typeof chatId !== "string") {
        return getDefaultChatDetails();
      }
      return state.chatDetails[chatId] ?? getDefaultChatDetails();
    },
    shallow,
  );
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
  const isExternalEngine = engineType === EngineTypeEnum.external_agent;
  const lastFetchedChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof chatId !== "string") {
      return;
    }
    if (waitingForResponse) {
      return;
    }
    if (lastFetchedChatIdRef.current === chatId) {
      return;
    }
    lastFetchedChatIdRef.current = chatId;
    if (isExternalEngine) {
      getExternalAgentChat(chatId, null);
      return;
    }
    getLLMChat(chatId);
  }, [chatId, isExternalEngine, waitingForResponse]);

  const handleNewChatStart = useCallback(() => {
    initializePendingChatDetails();
    setChatId(null);
  }, [setChatId]);

  const handleNewChatSettled = useCallback(
    (newChatId: string | null, succeeded: boolean) => {
      if (!succeeded || !newChatId) {
        clearPendingChatDetails();
        setChatId((currentChatId) => {
          if (currentChatId !== null) {
            return currentChatId;
          }
          return undefined;
        });
        return;
      }
      finalizePendingChatDetails(newChatId);
    },
    [setChatId],
  );

  const handleSubmit = useCallback(
    async (message: string, attachments: ChatFileAttachment[]) => {
      const trimmed = message.trim();
      if (!trimmed && attachments.length === 0) {
        return false;
      }
      if (!engineConfigId) {
        return false;
      }
      if (!isExternalEngine && !hasLLMConfig) {
        return false;
      }
      if (isExternalEngine && !externalEngineAvailable) {
        return false;
      }
      const isFirstMessage = chatId === undefined;
      if (isFirstMessage) {
        handleNewChatStart();
      }

      let submittedChatId: string | null = null;
      let succeeded = false;
      try {
        submittedChatId = await submitMessage(
          chatId ?? null,
          message,
          attachments,
          thinking,
          engineConfigId,
          isExternalEngine,
          undefined,
          null,
          null,
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
      thinking,
      engineConfigId,
      handleNewChatSettled,
      handleNewChatStart,
      isExternalEngine,
      externalEngineAvailable,
      hasLLMConfig,
    ],
  );

  const handleStop = useCallback(async () => {
    if (isExternalEngine) {
      if (typeof chatId !== "string") {
        return;
      }
      const runId = await findLatestRunningExternalRunId(chatId, null);
      if (!runId) {
        return;
      }
      await route_stop_external_agent_run({ runId });
      return;
    }
    if (typeof chatId !== "string") {
      return;
    }
    await route_stop_llm_chat({ chatId });
  }, [chatId, isExternalEngine]);

  const handleEditMessage = useCallback(
    async (messageId: string, text: string, attachments: ChatFileAttachment[]) => {
      if (waitingForResponse) {
        return false;
      }
      if (!engineConfigId || typeof chatId !== "string") {
        return false;
      }
      if (!isExternalEngine && !hasLLMConfig) {
        return false;
      }
      if (isExternalEngine && !externalEngineAvailable) {
        return false;
      }
      const nextChatId = await submitEditedMessage({
        parentChatId: chatId,
        messages,
        messageId,
        message: text,
        attachments,
        thinking,
        engineConfigId,
        isExternalEngine,
        agentProfileId: null,
        sectionId: null,
      });
      return Boolean(nextChatId);
    },
    [
      chatId,
      engineConfigId,
      externalEngineAvailable,
      hasLLMConfig,
      isExternalEngine,
      messages,
      thinking,
      waitingForResponse,
    ],
  );

  const handleBranchSwitch = useCallback(
    (nextChatId: string) => {
      if (!nextChatId || nextChatId === chatId) {
        return;
      }
      setChatId(nextChatId);
    },
    [chatId, setChatId],
  );

  const isDisabled =
    !engineConfigId ||
    (!isExternalEngine && !hasLLMConfig) ||
    (isExternalEngine && !externalEngineAvailable);
  const showEmptyState = typeof chatId === "undefined";
  const submitDisabled = useMemo(
    () => !waitingForResponse && hasPendingToolInteraction(messages),
    [messages, waitingForResponse],
  );

  return (
    <>
      {showEmptyState ? (
        <EmptyChatState />
      ) : (
        <ChatMessageList
          chatId={typeof chatId === "string" ? chatId : undefined}
          messages={messages}
          waitingForResponse={waitingForResponse}
          toolCallArguments={toolCallArguments}
          onEditMessage={handleEditMessage}
          onBranchSwitch={handleBranchSwitch}
          branchInfoByMessage={branchInfoByMessage}
        />
      )}
      <ChatInput
        placeholderText={placeholderText}
        waitingForResponse={waitingForResponse}
        submitDisabled={submitDisabled}
        disabled={isDisabled}
        onSubmit={handleSubmit}
        onStop={handleStop}
      />
    </>
  );
});
