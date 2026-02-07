import { ChatInput } from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import { PlanModeBadge } from "components/Chat/PlanModeBadge";
import { getChatEditDisabledReason } from "components/Chat/chatEditUtils";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearPendingChatDetails,
  findLatestRunningExternalRunId,
  getDefaultChatDetails,
  getExternalAgentChat,
  getLLMChat,
  initializePendingChatDetails,
  submitEditedMessage,
  submitMessage,
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
import { useChatBranchIndex } from "state/hooks/useChatBranchIndex";
import { hasPendingToolInteraction } from "utils/claudeTools";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import {
  route_set_chat_section_chat_id,
  route_set_chat_section_state,
  route_stop_external_agent_run,
  route_stop_llm_chat,
} from "utils/generatedEndpoints";
import {
  AgenticEdgeKindEnum,
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
      agentProfileId: impl.agentProfileId,
      thinking: impl.thinking,
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
      activeBranchId={activeBranchId}
      branches={branches}
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
  activeBranchId: string | null;
  branches: ChatSectionState["branches"];
  isFrozen: boolean;
};

function ScriptableChatArea({
  sectionId,
  messages,
  inputText,
  waitingForResponse,
  toolCallArguments,
  activeBranchId,
  branches,
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

  const scrollClassName = `${isScrollable ? NO_WHEEL_CLASS_NAME : ""} px-4`;
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

  return (
    <div className={`${NO_PAN_CLASS_NAME} section-main-full-w flex flex-col`}>
      <ChatMessageList
        messages={effectiveMessages}
        waitingForResponse={effectiveState.waitingForResponse}
        toolCallArguments={toolCallArguments}
        className={scrollClassName}
        scrollRef={ref}
        editDisabledReason={editDisabledReason}
        onEditMessage={handleEditMessage}
        onBranchSwitch={handleBranchSwitch}
        branchInfoByMessage={branchInfoByMessage}
      />
      <ChatInput
        placeholderText="Type a message..."
        waitingForResponse={effectiveState.waitingForResponse}
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
  const agenticEdges = useProjectState((state) => state.projectConfig.agenticEdges);
  const { hasAnyAgenticEdge, hasWriteScope } = useMemo(() => {
    let hasAny = false;
    let hasWrite = false;
    for (const edge of agenticEdges) {
      if (
        edge.kind === AgenticEdgeKindEnum.chat_section &&
        edge.sourceSectionId === sectionId
      ) {
        hasAny = true;
        hasWrite = true;
        break;
      }
      if (
        edge.sourceSectionId === sectionId ||
        edge.targetSectionId === sectionId
      ) {
        hasAny = true;
      }
    }
    return { hasAnyAgenticEdge: hasAny, hasWriteScope: hasWrite };
  }, [agenticEdges, sectionId]);
  const chatId = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Chat,
    );
    return impl.chatId;
  });
  const lastChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof chatId === "string") {
      lastChatIdRef.current = chatId;
    }
  }, [chatId]);
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
      if (!trimmed && attachments.length === 0) {
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
          messageId,
          agentProfileId,
          sectionId,
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
      messages,
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
      sectionId,
      thinking,
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

  const scrollClassName = `${isScrollable ? NO_WHEEL_CLASS_NAME : ""} px-4`;
  const isDisabled =
    !hasEngineConfig ||
    (!isExternalEngine && (!hasLLMConfig || noConfigsAvailable)) ||
    (isExternalEngine && !externalEngineAvailable);
  const editDisabledReason = useMemo(
    () =>
      getChatEditDisabledReason({
        hasEngineConfig,
        hasLLMConfig,
        isExternalEngine,
        externalEngineAvailable,
        noLLMConfigsAvailable: noConfigsAvailable,
      }),
    [
      externalEngineAvailable,
      hasEngineConfig,
      hasLLMConfig,
      isExternalEngine,
      noConfigsAvailable,
    ],
  );
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
      {!hasAnyAgenticEdge ? (
        <div className="px-4 pt-2">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            No agentic edges. This chat has no project access. Add context/scope
            links or use Project Chat for full access.
          </div>
        </div>
      ) : !hasWriteScope ? (
        <div className="px-4 pt-2">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            No writable sections in scope. This chat cannot modify sections. Add
            a Chat → Section edge (Scope sections) or use Project Chat for full
            access.
          </div>
        </div>
      ) : null}
      <ChatMessageList
        messages={messages}
        waitingForResponse={waitingForResponse}
        toolCallArguments={toolCallArguments}
        className={scrollClassName}
        scrollRef={ref}
        editDisabledReason={editDisabledReason}
        onEditMessage={handleEditMessage}
        onBranchSwitch={handleBranchSwitch}
        branchInfoByMessage={branchInfoByMessage}
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
