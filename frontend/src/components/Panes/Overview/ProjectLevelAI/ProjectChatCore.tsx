import { ChatInput } from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import {
  Dispatch,
  SetStateAction,
  memo,
  useCallback,
  useEffect,
  useState,
} from "react";
import { TbLayoutDashboard, TbLayoutDashboardFilled } from "react-icons/tb";
import {
  clearPendingChatDetails,
  getDefaultChatDetails,
  getExternalAgentChat,
  getLLMChat,
  initializePendingChatDetails,
  submitExternalAgentMessage,
  submitMessage,
} from "state/actions/ai";
import { useAIStore } from "state/definitions";
import {
  route_stop_external_agent_run,
  route_stop_llm_chat,
} from "utils/generatedEndpoints";
import { shallow } from "zustand/shallow";

function EmptyChatState() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-4 overflow-y-auto">
      <button className="flex cursor-pointer items-center gap-1 rounded-md border border-solid border-setta-200/50 px-3 py-2 text-xs font-semibold text-setta-600 transition-colors hover:bg-white hover:text-setta-800 dark:border-setta-700 dark:text-setta-500 dark:hover:bg-setta-850 hover:dark:text-setta-50">
        <TbLayoutDashboard /> Create Project UI
      </button>
      <button className="flex cursor-pointer items-center gap-1 rounded-md border border-solid border-setta-200/50 px-3 py-2 text-xs font-semibold text-setta-600 transition-colors hover:bg-white hover:text-setta-800 dark:border-setta-700 dark:text-setta-500 dark:hover:bg-setta-850 hover:dark:text-setta-50">
        <TbLayoutDashboardFilled />
        Create Project UI & Values
      </button>
    </div>
  );
}

export const ProjectChatCore = memo(function ProjectChatCore({
  chatId,
  placeholderText,
  deepThink,
  llmConfigId,
  externalAgentConfigId,
  setChatId,
}: {
  chatId: string | null | undefined;
  placeholderText: string;
  deepThink: boolean;
  llmConfigId: string | null;
  externalAgentConfigId: string | null;
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
  const [activeExternalRunId, setActiveExternalRunId] = useState<string | null>(
    null,
  );
  const isExternalEngine = externalAgentConfigId !== null;

  useEffect(() => {
    if (typeof chatId !== "string") {
      return;
    }
    if (isExternalEngine) {
      getExternalAgentChat(chatId, null);
      return;
    }
    getLLMChat(chatId);
  }, [chatId, isExternalEngine]);

  const handleNewChatStart = useCallback(() => {
    initializePendingChatDetails();
    setChatId(null);
    setActiveExternalRunId(null);
  }, [setActiveExternalRunId, setChatId]);

  const handleNewChatSettled = useCallback(
    (newChatId: string | null, succeeded: boolean) => {
      clearPendingChatDetails();
      setChatId((currentChatId) => {
        if (currentChatId !== null) {
          return currentChatId;
        }
        if (!succeeded || !newChatId) {
          return undefined;
        }
        return newChatId;
      });
    },
    [setChatId],
  );

  const handleSubmit = useCallback(
    async (message: string) => {
      if (!message.trim()) {
        return;
      }
      if (isExternalEngine) {
        if (!externalAgentConfigId) {
          return;
        }
      } else if (!llmConfigId) {
        return;
      }
      const isFirstMessage = chatId === undefined;
      if (isFirstMessage) {
        handleNewChatStart();
      }

      let submittedChatId: string | null = null;
      let succeeded = false;
      try {
        if (isExternalEngine && externalAgentConfigId) {
          const run = await submitExternalAgentMessage(
            chatId ?? null,
            message,
            externalAgentConfigId,
            {
              agentProfileId: null,
              deepThink,
              priorMessages: messages,
            },
          );
          if (run) {
            const runChatId =
              typeof run.inputs?.chatId === "string"
                ? run.inputs.chatId
                : run.id;
            submittedChatId = runChatId;
            setActiveExternalRunId(run.id);
          }
        } else {
          submittedChatId = await submitMessage(
            chatId ?? null,
            message,
            deepThink,
            llmConfigId,
          );
        }
        succeeded = Boolean(submittedChatId);
      } catch (err) {
        console.error("Failed to submit LLM chat message", err);
      } finally {
        if (isFirstMessage) {
          handleNewChatSettled(submittedChatId, succeeded);
        }
      }
    },
    [
      chatId,
      deepThink,
      externalAgentConfigId,
      handleNewChatSettled,
      handleNewChatStart,
      isExternalEngine,
      llmConfigId,
      messages,
    ],
  );

  const handleStop = useCallback(async () => {
    if (isExternalEngine) {
      if (!activeExternalRunId) {
        return;
      }
      await route_stop_external_agent_run({ runId: activeExternalRunId });
      return;
    }
    if (typeof chatId !== "string") {
      return;
    }
    await route_stop_llm_chat({ chatId });
  }, [activeExternalRunId, chatId, isExternalEngine]);

  const isDisabled = isExternalEngine ? !externalAgentConfigId : !llmConfigId;
  const showEmptyState = typeof chatId === "undefined";

  return (
    <>
      {showEmptyState ? (
        <EmptyChatState />
      ) : (
        <ChatMessageList
          messages={messages}
          waitingForResponse={waitingForResponse}
          toolCallArguments={toolCallArguments}
        />
      )}
      <ChatInput
        placeholderText={placeholderText}
        waitingForResponse={waitingForResponse}
        disabled={isDisabled}
        onSubmit={handleSubmit}
        onStop={handleStop}
      />
    </>
  );
});
