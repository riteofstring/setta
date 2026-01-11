import { ChatInput } from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
} from "components/Chat/llmConfigUtils";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearPendingChatDetails,
  getDefaultChatDetails,
  getLLMChat,
  initializePendingChatDetails,
  submitMessage,
} from "state/actions/ai";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useAIStore, useProjectState } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_get_chat_section_chat_id,
  route_set_chat_section_chat_id,
  route_set_chat_section_state,
  route_stop_llm_chat,
} from "utils/generatedEndpoints";
import {
  ChatRoleEnum,
  ChatSectionState,
  SectionTypeEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

export function ChatArea({ sectionId }: { sectionId: string }) {
  const {
    managed,
    llmConfigId,
    deepThink,
    messages,
    inputText,
    waitingForResponse,
    toolCallArguments,
    isFrozen,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
    return {
      managed: impl.managed,
      llmConfigId: impl.llmConfigId,
      deepThink: impl.deepThink,
      messages: impl.messages,
      inputText: impl.inputText,
      waitingForResponse: impl.waitingForResponse,
      toolCallArguments: impl.toolCallArguments,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);

  if (managed) {
    return (
      <ManagedChatArea
        sectionId={sectionId}
        llmConfigId={llmConfigId}
        deepThink={deepThink}
      />
    );
  }

  return (
    <ScriptableChatArea
      sectionId={sectionId}
      messages={messages}
      inputText={inputText}
      waitingForResponse={waitingForResponse}
      toolCallArguments={toolCallArguments}
      isFrozen={isFrozen}
    />
  );
}

type ScriptableChatAreaProps = {
  sectionId: string;
  messages: Array<ChatSectionState["messages"][number]>;
  inputText: string;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  isFrozen: boolean;
};

function ScriptableChatArea({
  sectionId,
  messages,
  inputText,
  waitingForResponse,
  toolCallArguments,
  isFrozen,
}: ScriptableChatAreaProps) {
  const { ref, isScrollable } = useIsScrollable();
  const projectConfigId = getCurrProjectConfigId();

  const applyChatState = useCallback(
    (nextState: ChatSectionState) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
            messages: nextState.messages,
            inputText: nextState.inputText,
            waitingForResponse: nextState.waitingForResponse,
            toolCallArguments: nextState.toolCallArguments,
          });
        },
        send: (frontendOpId) =>
          route_set_chat_section_state({
            projectConfigId,
            sectionId,
            state: nextState,
            frontendOpId,
          }),
      });
    },
    [projectConfigId, sectionId],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      applyChatState({
        messages,
        inputText: value,
        waitingForResponse,
        toolCallArguments,
      });
    },
    [applyChatState, messages, toolCallArguments, waitingForResponse],
  );

  const handleSubmit = useCallback(
    (message: string) => {
      const newMessage = {
        id: createNewId(),
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: message })],
      };
      const nextMessages = [...messages, newMessage];
      applyChatState({
        messages: nextMessages,
        inputText: "",
        waitingForResponse: true,
        toolCallArguments,
      });
    },
    [applyChatState, messages, toolCallArguments],
  );

  const handleStop = useCallback(() => {
    applyChatState({
      messages,
      inputText,
      waitingForResponse: false,
      toolCallArguments,
    });
  }, [applyChatState, inputText, messages, toolCallArguments]);

  const scrollClassName = `${isScrollable ? NO_WHEEL_CLASS_NAME : ""} px-4`;

  return (
    <div className={`${NO_PAN_CLASS_NAME} section-main-full-w flex flex-col`}>
      <ChatMessageList
        messages={messages}
        waitingForResponse={waitingForResponse}
        toolCallArguments={toolCallArguments}
        className={scrollClassName}
        scrollRef={ref}
      />
      <ChatInput
        placeholderText="Type a message..."
        waitingForResponse={waitingForResponse}
        disabled={isFrozen}
        value={inputText}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        onStop={handleStop}
      />
    </div>
  );
}

type ManagedChatAreaProps = {
  sectionId: string;
  llmConfigId: string | null;
  deepThink: boolean;
};

function ManagedChatArea({
  sectionId,
  llmConfigId,
  deepThink,
}: ManagedChatAreaProps) {
  useHydrateLLMState();
  const { ref, isScrollable } = useIsScrollable();
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const [chatId, setChatIdState] = useState<string | null | undefined>(
    undefined,
  );

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
    _.isEqual,
  );

  const { apiKeys, allLLMConfigs } = useAIStore(
    (state) => ({
      apiKeys: state.apiKeys,
      allLLMConfigs: state.allLLMConfigs,
    }),
    _.isEqual,
  );

  const availableConfigGroups = useMemo(
    () => buildLLMConfigGroups(allLLMConfigs, apiKeys),
    [allLLMConfigs, apiKeys],
  );
  const noConfigsAvailable = countLLMConfigs(availableConfigGroups) === 0;

  let placeholderText = "Type a message...";
  if (noConfigsAvailable) {
    placeholderText = "Add API key!";
  } else if (!llmConfigId) {
    placeholderText = "Select an LLM";
  }

  useEffect(() => {
    let cancelled = false;
    const loadChatId = async () => {
      const res = await route_get_chat_section_chat_id({
        projectConfigId,
        sectionId,
      });
      if (!res200(res)) {
        return;
      }
      if (cancelled) {
        return;
      }
      const resolvedChatId = res.data ?? undefined;
      setChatIdState(resolvedChatId);
    };
    void loadChatId();
    return () => {
      cancelled = true;
    };
  }, [projectConfigId, sectionId]);

  useEffect(() => {
    if (typeof chatId !== "string") {
      return;
    }
    getLLMChat(chatId);
  }, [chatId]);

  const persistChatId = useCallback(
    async (nextChatId: string | null | undefined) => {
      if (nextChatId === null) {
        return;
      }
      const storedChatId = typeof nextChatId === "string" ? nextChatId : null;
      await route_set_chat_section_chat_id({
        projectConfigId,
        sectionId,
        chatId: storedChatId,
      });
    },
    [projectConfigId, sectionId],
  );

  const setChatId = useCallback(
    (
      next:
        | string
        | null
        | undefined
        | ((value: string | null | undefined) => string | null | undefined),
    ) => {
      setChatIdState((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        void persistChatId(resolved);
        return resolved;
      });
    },
    [persistChatId],
  );

  const handleNewChatStart = useCallback(() => {
    initializePendingChatDetails();
    setChatId(null);
  }, [setChatId]);

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
      if (!llmConfigId) {
        return;
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
          deepThink,
          llmConfigId,
        );
        succeeded = Boolean(submittedChatId);
      } catch (err) {
        console.error("Failed to submit LLM chat message", err);
      } finally {
        if (isFirstMessage) {
          handleNewChatSettled(submittedChatId, succeeded);
        }
      }
    },
    [chatId, deepThink, handleNewChatSettled, handleNewChatStart, llmConfigId],
  );

  const handleStop = useCallback(async () => {
    if (typeof chatId !== "string") {
      return;
    }
    await route_stop_llm_chat({ chatId });
  }, [chatId]);

  const scrollClassName = `${isScrollable ? NO_WHEEL_CLASS_NAME : ""} px-4`;
  const isDisabled = !llmConfigId || noConfigsAvailable;

  return (
    <div className={`${NO_PAN_CLASS_NAME} section-main-full-w flex flex-col`}>
      <ChatMessageList
        messages={messages}
        waitingForResponse={waitingForResponse}
        toolCallArguments={toolCallArguments}
        className={scrollClassName}
        scrollRef={ref}
      />
      <ChatInput
        placeholderText={placeholderText}
        waitingForResponse={waitingForResponse}
        disabled={isDisabled}
        onSubmit={handleSubmit}
        onStop={handleStop}
      />
    </div>
  );
}
