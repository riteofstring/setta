import { useProjectState } from "state/definitions";
import {
  ChatSectionState,
  LLMStreamingResponse,
  StreamingEventTypeEnum,
} from "utils/generatedTypes";

import { getChatSectionStateFromStore } from "./aiChatSectionState";
import { applyMessageDeltaToChatMessages } from "./aiChatStreamingMessageDeltas";
import {
  applyFinalizedMessageToChatMessages,
  upsertMessage,
} from "./aiChatStreamingMessageUpserts";
import { applyToolCallDeltaToChatMessages } from "./aiChatStreamingToolCalls";
import { setCurrEffectiveSectionImplValue } from "./sectionEffectiveImplMutations";

type ChatSectionStreamChunk = LLMStreamingResponse["chunk"];

export function applyChatSectionStreamDelta(
  sectionId: string,
  chunk: ChatSectionStreamChunk,
): ChatSectionState | null {
  let nextState: ChatSectionState | null = null;
  useProjectState.setState((state) => {
    const currentState = getChatSectionStateFromStore(state, sectionId);
    if (!currentState) {
      return;
    }
    nextState = applyStreamDeltaToChatSectionState(currentState, chunk);
    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      messages: nextState.messages,
      inputText: nextState.inputText,
      waitingForResponse: nextState.waitingForResponse,
      toolCallArguments: nextState.toolCallArguments,
      activeBranchId: nextState.activeBranchId,
      branches: nextState.branches,
    });
  });
  return nextState;
}

export function applyStreamDeltaToChatSectionState(
  state: ChatSectionState,
  chunk: ChatSectionStreamChunk,
): ChatSectionState {
  let messages = [...state.messages];
  let toolCallArguments = { ...state.toolCallArguments };
  let waitingForResponse = state.waitingForResponse;
  const inputText = state.inputText;
  const activeBranchId = state.activeBranchId ?? null;
  const branches = { ...(state.branches ?? {}) };

  const syncActiveBranchMessages = () => {
    if (!activeBranchId) {
      return branches;
    }
    const activeBranch = branches[activeBranchId];
    if (!activeBranch) {
      return branches;
    }
    return {
      ...branches,
      [activeBranchId]: {
        ...activeBranch,
        messages,
      },
    };
  };

  switch (chunk.type) {
    case StreamingEventTypeEnum.MESSAGE_START: {
      messages = upsertMessage(messages, chunk.message);
      waitingForResponse = true;
      break;
    }
    case StreamingEventTypeEnum.DELTA: {
      messages = applyMessageDeltaToChatMessages(messages, chunk);
      break;
    }
    case StreamingEventTypeEnum.TOOL_CALL_DELTA:
    case StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA: {
      const result = applyToolCallDeltaToChatMessages(
        messages,
        toolCallArguments,
        chunk,
      );
      messages = result.messages;
      toolCallArguments = result.toolCallArguments;
      break;
    }
    case StreamingEventTypeEnum.TOOL_RESULT: {
      messages = upsertMessage(messages, chunk.result);
      break;
    }
    case StreamingEventTypeEnum.MESSAGE_STOP: {
      waitingForResponse = false;
      break;
    }
    case StreamingEventTypeEnum.MESSAGE_FINALIZED: {
      const result = applyFinalizedMessageToChatMessages(
        messages,
        chunk.message,
      );
      messages = result.messages;
      waitingForResponse = false;
      toolCallArguments = {};
      break;
    }
    default: {
      chunk satisfies never;
      break;
    }
  }

  return {
    messages,
    inputText,
    waitingForResponse,
    toolCallArguments,
    activeBranchId,
    branches: syncActiveBranchMessages(),
  };
}
