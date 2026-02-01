import { ChatInput } from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import { PlanModeBadge } from "components/Chat/PlanModeBadge";
import {
  getChatPlaceholderText,
  getExternalEngineStatus,
} from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";
import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearPendingChatDetails,
  findLatestRunningExternalRunId,
  getExternalAgentChat,
  getLLMChat,
  initializePendingChatDetails,
  persistChatSectionState,
  submitMessage,
} from "state/actions/ai";
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
  route_set_chat_section_chat_id,
  route_set_chat_section_state,
  route_stop_external_agent_run,
  route_stop_llm_chat,
} from "utils/generatedEndpoints";
import {
  ChatFileAttachment,
  ChatRoleEnum,
  ChatSectionState,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  EngineTypeEnum,
  LiteralDependencyValue,
  SectionTypeEnum,
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

export function ChatArea({ sectionId }: { sectionId: string }) {
  const {
    managed,
    engineConfigId,
    agentProfileId,
    thinking,
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
      engineConfigId: impl.engineConfigId,
      agentProfileId: impl.agentProfileId,
      thinking: impl.thinking,
      messages: impl.messages,
      inputText: impl.inputText,
      waitingForResponse: impl.waitingForResponse,
      toolCallArguments: impl.toolCallArguments,
      isFrozen: impl.isFrozen,
    };
  }, shallow);

  if (managed) {
    return (
      <ManagedChatArea
        sectionId={sectionId}
        engineConfigId={engineConfigId}
        agentProfileId={agentProfileId}
        thinking={thinking}
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
  const [draftInputText, setDraftInputText] = useState<string | null>(null);

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

  const handleSubmit = useCallback(
    async (message: string, attachments: ChatFileAttachment[]) => {
      const trimmed = message.trim();
      if (!trimmed && attachments.length === 0) {
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
      };
      const nextMessages = [...messages, newMessage];
      const nextState = {
        messages: nextMessages,
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
        text: message,
        attachments,
        role: ChatRoleEnum.user,
        managed: false,
        timestampMs,
      });
      return true;
    },
    [applyChatStateWithAck, messages, sectionId, toolCallArguments],
  );

  const handleStop = useCallback(async () => {
    const nextState = {
      messages,
      inputText,
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
    inputText,
    messages,
    sectionId,
    toolCallArguments,
  ]);

  const scrollClassName = `${isScrollable ? NO_WHEEL_CLASS_NAME : ""} px-4`;
  const effectiveInputText =
    waitingForResponse && draftInputText !== null ? draftInputText : inputText;
  const submitDisabled = useMemo(
    () => !waitingForResponse && hasPendingToolInteraction(messages),
    [messages, waitingForResponse],
  );

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
        submitDisabled={submitDisabled}
        disabled={isFrozen}
        value={effectiveInputText}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        onStop={handleStop}
      />
    </div>
  );
}

type ManagedChatAreaProps = {
  sectionId: string;
  engineConfigId: string | null;
  agentProfileId: string | null;
  thinking: boolean;
};

function ManagedChatArea({
  sectionId,
  engineConfigId,
  agentProfileId,
  thinking,
}: ManagedChatAreaProps) {
  useHydrateLLMState();
  useHydrateAgenticState();
  const { ref, isScrollable } = useIsScrollable();
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const chatId = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
    return impl.chatId;
  });
  const { messages, toolCallArguments, waitingForResponse } = useProjectState(
    (state) => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Chat,
      );
      return {
        messages: impl.messages ?? [],
        toolCallArguments: impl.toolCallArguments ?? {},
        waitingForResponse: Boolean(impl.waitingForResponse),
      };
    },
    shallow,
  );

  const {
    apiKeys,
    allLLMConfigs,
    agentProfiles,
    engineConfigs,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
    externalAgentConfigs,
  } = useAIStore(
    (state) => ({
      apiKeys: state.apiKeys,
      allLLMConfigs: state.allLLMConfigs,
      agentProfiles: state.agentProfiles,
      engineConfigs: state.engineConfigs,
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
  const showPlanModeBadge =
    engineType === EngineTypeEnum.external_agent &&
    externalAgentConfig?.toolType === "claude_code" &&
    externalAgentConfig.approvalPolicy === "plan";

  const placeholderText = getChatPlaceholderText({
    engineType,
    hasEngineConfig,
    hasLLMConfig,
    noLLMConfigsAvailable: noConfigsAvailable,
  });
  const externalStatusMessage = useMemo(() => {
    if (!externalEngineStatus) {
      return null;
    }
    if (externalEngineStatus.status === "loading") {
      return "Checking external engine status...";
    }
    if (externalEngineStatus.status === "available") {
      return "External engine available";
    }
    if (externalEngineStatus.issues.length > 0) {
      return `External engine unavailable: ${externalEngineStatus.issues.join(
        "; ",
      )}`;
    }
    return "External engine unavailable";
  }, [externalEngineStatus]);
  const externalStatusClassName = useMemo(() => {
    if (!externalEngineStatus) {
      return "";
    }
    if (externalEngineStatus.status === "available") {
      return "text-emerald-600 dark:text-emerald-400";
    }
    if (externalEngineStatus.status === "loading") {
      return "text-setta-500 dark:text-setta-400";
    }
    return "text-red-600 dark:text-red-400";
  }, [externalEngineStatus]);

  useEffect(() => {
    console.log(
      "[ManagedChatArea] state",
      JSON.stringify({
        sectionId,
        chatId,
        engineConfigId,
        agentProfileId,
        effectiveEngineConfigId,
        engineType,
        isExternalEngine,
        hasEngineConfig,
        hasLLMConfig,
        noConfigsAvailable,
        externalEngineAvailable,
        externalEngineStatus,
        waitingForResponse,
        isDisabled:
          !hasEngineConfig ||
          (!isExternalEngine && (!hasLLMConfig || noConfigsAvailable)) ||
          (isExternalEngine && !externalEngineAvailable),
      }),
    );
  }, [
    agentProfileId,
    chatId,
    effectiveEngineConfigId,
    engineConfigId,
    engineType,
    externalEngineAvailable,
    externalEngineStatus,
    hasEngineConfig,
    hasLLMConfig,
    isExternalEngine,
    noConfigsAvailable,
    sectionId,
    waitingForResponse,
  ]);

  useEffect(() => {
    if (typeof chatId !== "string") {
      return;
    }
    if (isExternalEngine) {
      getExternalAgentChat(chatId, projectConfigId, sectionId);
      return;
    }
    getLLMChat(chatId, sectionId);
  }, [chatId, isExternalEngine, projectConfigId, sectionId]);

  const setChatId = useCallback(
    (next: ChatSectionChatIdUpdate) => {
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
    [projectConfigId, sectionId],
  );

  const handleNewChatStart = useCallback(() => {
    console.log(
      "[ManagedChatArea] new-chat-start",
      JSON.stringify({ sectionId, chatId }),
    );
    initializePendingChatDetails();
    setChatId(null);
  }, [setChatId]);

  const handleNewChatSettled = useCallback(
    (newChatId: string | null, succeeded: boolean) => {
      console.log(
        "[ManagedChatArea] new-chat-settled",
        JSON.stringify({
          sectionId,
          priorChatId: chatId,
          newChatId,
          succeeded,
        }),
      );
      clearPendingChatDetails();
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
    [setChatId],
  );

  const handleSubmit = useCallback(
    async (message: string, attachments: ChatFileAttachment[]) => {
      const trimmed = message.trim();
      console.log(
        "[ManagedChatArea] submit-attempt",
        JSON.stringify({
          sectionId,
          chatId,
          messageLength: message.length,
          hasText: Boolean(trimmed),
          attachmentsCount: attachments.length,
          hasEngineConfig,
          hasLLMConfig,
          isExternalEngine,
          externalEngineAvailable,
          effectiveEngineConfigId,
          agentProfileId,
          thinking,
        }),
      );
      if (!trimmed && attachments.length === 0) {
        console.log(
          "[ManagedChatArea] submit-blocked",
          JSON.stringify({ reason: "empty-input", sectionId, chatId }),
        );
        return false;
      }
      if (!hasEngineConfig) {
        console.log(
          "[ManagedChatArea] submit-blocked",
          JSON.stringify({ reason: "missing-engine-config", sectionId, chatId }),
        );
        return false;
      }
      if (!isExternalEngine && !hasLLMConfig) {
        console.log(
          "[ManagedChatArea] submit-blocked",
          JSON.stringify({
            reason: "missing-llm-config",
            sectionId,
            chatId,
          }),
        );
        return false;
      }
      if (isExternalEngine && !externalEngineAvailable) {
        console.log(
          "[ManagedChatArea] submit-blocked",
          JSON.stringify({
            reason: "external-engine-unavailable",
            sectionId,
            chatId,
          }),
        );
        return false;
      }
      const messageId = createNewId();
      const timestampMs = Date.now();
      const content = [];
      if (trimmed) {
        content.push(createMessageTextContent({ text: message }));
      }
      const optimisticMessage = {
        id: messageId,
        role: ChatRoleEnum.user,
        content,
        attachments,
      };
      const priorMessages = messages;
      const priorToolCallArguments = toolCallArguments;
      const priorWaitingForResponse = waitingForResponse;
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
      const baseMessages = isFirstMessage ? [] : priorMessages;
      const nextMessages = [...baseMessages, optimisticMessage];
      const nextState: ChatSectionState = {
        messages: nextMessages,
        inputText: "",
        waitingForResponse: true,
        toolCallArguments: priorToolCallArguments,
      };
      persistChatSectionState({
        sectionId,
        nextState,
        reason: "optimistic-user-message",
      });

      let submittedChatId: string | null = null;
      let succeeded = false;
      try {
        if (!effectiveEngineConfigId) {
          console.log(
            "[ManagedChatArea] submit-blocked",
            JSON.stringify({
              reason: "missing-effective-engine-config",
              sectionId,
              chatId,
            }),
          );
          return false;
        }
        console.log(
          "[ManagedChatArea] submit-dispatch",
          JSON.stringify({
            sectionId,
            chatId,
            messageId,
            effectiveEngineConfigId,
            agentProfileId,
            isExternalEngine,
          }),
        );
        submittedChatId = await submitMessage(
          chatId,
          message,
          attachments,
          thinking,
          effectiveEngineConfigId,
          isExternalEngine,
          messageId,
          agentProfileId,
          sectionId,
        );
        succeeded = Boolean(submittedChatId);
        console.log(
          "[ManagedChatArea] submit-result",
          JSON.stringify({
            sectionId,
            chatId,
            submittedChatId,
            succeeded,
          }),
        );
      } catch (err) {
        console.error(
          "[ManagedChatArea] submit-error",
          JSON.stringify({
            sectionId,
            chatId,
            error: String(err),
          }),
        );
      } finally {
        if (!succeeded) {
          const currentState = useProjectState.getState();
          let impl: ReturnType<typeof getCurrEffectiveSectionImplOfType> | null =
            null;
          try {
            impl = getCurrEffectiveSectionImplOfType(
              currentState,
              sectionId,
              SectionTypeEnum.Chat,
            );
          } catch {
            impl = null;
          }
          if (impl && impl.messages?.some((entry) => entry.id === messageId)) {
            const rollbackState: ChatSectionState = {
              messages: priorMessages,
              inputText: impl.inputText ?? "",
              waitingForResponse: priorWaitingForResponse,
              toolCallArguments: priorToolCallArguments,
            };
            persistChatSectionState({
              sectionId,
              nextState: rollbackState,
              reason: "submit-rollback",
            });
          }
        }
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
      messages,
      toolCallArguments,
      waitingForResponse,
      sectionId,
      thinking,
    ],
  );

  const handleStop = useCallback(async () => {
    emitChatStopAction({
      sectionId,
      managed: true,
      timestampMs: Date.now(),
    });
    if (isExternalEngine) {
      if (typeof chatId !== "string") {
        return;
      }
      const runId = await findLatestRunningExternalRunId(
        chatId,
        projectConfigId,
      );
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
  }, [chatId, isExternalEngine, projectConfigId, sectionId]);

  const scrollClassName = `${isScrollable ? NO_WHEEL_CLASS_NAME : ""} px-4`;
  const isDisabled =
    !hasEngineConfig ||
    (!isExternalEngine && (!hasLLMConfig || noConfigsAvailable)) ||
    (isExternalEngine && !externalEngineAvailable);
  const submitDisabled = useMemo(
    () => !waitingForResponse && hasPendingToolInteraction(messages),
    [messages, waitingForResponse],
  );

  return (
    <div className={`${NO_PAN_CLASS_NAME} section-main-full-w flex flex-col`}>
      {externalStatusMessage || showPlanModeBadge ? (
        <div className="flex items-center justify-between gap-2 px-4 pt-2">
          {externalStatusMessage ? (
            <p className={`text-xs ${externalStatusClassName}`}>
              {externalStatusMessage}
            </p>
          ) : (
            <span />
          )}
          {showPlanModeBadge ? <PlanModeBadge /> : null}
        </div>
      ) : null}
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
        submitDisabled={submitDisabled}
        disabled={isDisabled}
        onSubmit={handleSubmit}
        onStop={handleStop}
      />
    </div>
  );
}
