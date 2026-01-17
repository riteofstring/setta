import { ChatInput } from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import { useCallback, useEffect, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { sendRealtimeDependencyEvent } from "state/actions/websocketReceive";
import { useProjectState } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_set_chat_section_settings,
  route_set_chat_section_state,
  route_start_agent_run,
  route_stop_agent_run,
} from "utils/generatedEndpoints";
import {
  ChatRoleEnum,
  ChatSectionState,
  DependencyKeyTypeEnum,
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

type EmitChatSendActionArgs = {
  sectionId: string;
  messageId: string;
  text: string;
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
  sendRealtimeDependencyEvent({
    dependencyKey: {
      type: DependencyKeyTypeEnum.Section,
      sectionId: payload.sectionId,
    },
    payload: JSON.stringify(payload),
    timestampMs: payload.timestampMs,
  });
}

function emitChatSendAction({
  sectionId,
  messageId,
  text,
  role,
  managed,
  timestampMs,
}: EmitChatSendActionArgs) {
  emitChatAction({
    action: "send",
    sectionId,
    messageId,
    text,
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
    agentProfileId,
    agentRunId,
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
      agentProfileId: impl.agentProfileId,
      agentRunId: impl.agentRunId,
      messages: impl.messages,
      inputText: impl.inputText,
      waitingForResponse: impl.waitingForResponse,
      toolCallArguments: impl.toolCallArguments,
      isFrozen: impl.isFrozen,
    };
  }, shallow);

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

  const updateAgentRunId = useCallback(
    async (nextRunId: string | null) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
            agentRunId: nextRunId,
          });
        },
        send: (frontendOpId) =>
          route_set_chat_section_settings({
            projectConfigId,
            sectionId,
            agentProfileId,
            agentRunId: nextRunId,
            frontendOpId,
          }),
      });
    },
    [agentProfileId, projectConfigId, sectionId],
  );

  const handleSubmit = useCallback(
    async (message: string) => {
      if (!message.trim()) {
        return;
      }
      if (!agentProfileId) {
        return;
      }
      const messageId = createNewId();
      const timestampMs = Date.now();
      const newMessage = {
        id: messageId,
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: message })],
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
        role: ChatRoleEnum.user,
        managed: true,
        timestampMs,
      });
      const runResult = await route_start_agent_run({
        agentProfileId,
        inputs: message,
        sectionId,
      });
      if (res200(runResult)) {
        await updateAgentRunId(runResult.data.id);
        return;
      }
      await applyChatStateWithAck({
        messages: nextMessages,
        inputText: "",
        waitingForResponse: false,
        toolCallArguments,
      });
    },
    [
      agentProfileId,
      applyChatStateWithAck,
      messages,
      sectionId,
      toolCallArguments,
      updateAgentRunId,
    ],
  );

  const handleStop = useCallback(async () => {
    if (agentRunId) {
      await route_stop_agent_run({ runId: agentRunId });
    }
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
      managed: true,
      timestampMs: Date.now(),
    });
  }, [
    agentRunId,
    applyChatStateWithAck,
    inputText,
    messages,
    sectionId,
    toolCallArguments,
  ]);

  const scrollClassName = `${isScrollable ? NO_WHEEL_CLASS_NAME : ""} px-4`;
  const effectiveInputText =
    waitingForResponse && draftInputText !== null ? draftInputText : inputText;
  const isDisabled = isFrozen || !agentProfileId;
  const placeholderText = agentProfileId
    ? "Type a message..."
    : "Select an agent profile";

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
        value={effectiveInputText}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        onStop={handleStop}
      />
    </div>
  );
}
