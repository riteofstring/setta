import { clearAllAppSpecPatchStreams } from "state/appSpecPatchStreaming";
import {
  ChatRoleEnum,
  LLMStreamingResponse,
  MessageDeltaEvent,
  MessageFinalizedEvent,
  MessageStartEvent,
  StreamingEventTypeEnum,
  ToolResultEvent,
} from "utils/generatedTypes";
import { updateChatDetails } from "./aiChatState";
import { maybeApplyAppDefinitionToolResult } from "./aiChatStreamingAppDefinition";
import { applyMessageDeltaToChatMessages } from "./aiChatStreamingMessageDeltas";
import {
  applyFinalizedMessageToChatMessages,
  upsertMessage,
} from "./aiChatStreamingMessageUpserts";
import {
  applyStreamingChunkRoutingSideEffects,
  clearStreamingFollowToolArguments,
  handleAgenticScopeViolation,
  resolveStreamingChunkContext,
} from "./aiChatStreamingRouting";
import {
  applyToolCallDelta,
  handleToolCallDelta,
} from "./aiChatStreamingToolCalls";
import {
  clearToolArgumentPreviewByToolCallId,
  clearToolArgumentPreviewByToolCallIds,
  handleToolArgumentPreviewDelta,
} from "./aiChatStreamingToolPreviews";
import { clearInterruptedAssistantMessages } from "./aiInterruptedAssistantMessages";
import {
  clearStopEligibleAssistantMessageId,
  setStopEligibleAssistantMessageId,
} from "./aiStopEligibleAssistantMessages";

export function receiveLLMResponseChunk(msg: LLMStreamingResponse) {
  const context = resolveStreamingChunkContext(msg);
  if (!context) {
    return;
  }
  const { chatId, chunk, projectConfigId, sectionId, shouldUpdateChatDetails } =
    context;
  applyStreamingChunkRoutingSideEffects(context);
  if (shouldUpdateChatDetails) {
    switch (chunk.type) {
      case StreamingEventTypeEnum.MESSAGE_START:
        handleMessageStart(chatId, chunk);
        return;
      case StreamingEventTypeEnum.DELTA:
        handleMessageDelta(chatId, chunk);
        return;
      case StreamingEventTypeEnum.TOOL_CALL_DELTA:
        handleToolCallDelta(chatId, chunk);
        return;
      case StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA:
        if (sectionId) {
          updateChatDetails(chatId, (details) =>
            applyToolCallDelta(details, chunk),
          );
          return;
        }
        handleToolArgumentPreviewDelta(chatId, chunk, projectConfigId);
        return;
      case StreamingEventTypeEnum.TOOL_RESULT:
        if (sectionId) {
          updateChatDetails(chatId, (details) => {
            return {
              ...details,
              messages: upsertMessage(details.messages, chunk.result),
            };
          });
          clearToolArgumentPreviewByToolCallId(
            projectConfigId,
            chunk.result.tool_call_id,
          );
          return;
        }
        handleToolResult(chatId, chunk, projectConfigId);
        return;
      case StreamingEventTypeEnum.MESSAGE_STOP:
        handleMessageStop(chatId, projectConfigId);
        return;
      case StreamingEventTypeEnum.MESSAGE_FINALIZED:
        handleMessageFinalized(chatId, chunk, projectConfigId);
        return;
      default:
        return chunk satisfies never;
    }
  }
}

function handleMessageStart(chatId: string, chunk: MessageStartEvent) {
  if (chunk.message.role === ChatRoleEnum.assistant) {
    setStopEligibleAssistantMessageId(chatId, chunk.message.id);
    clearInterruptedAssistantMessages(chatId, [chunk.message.id]);
  }
  updateChatDetails(chatId, (details) => ({
    ...details,
    messages: upsertMessage(details.messages, chunk.message),
    waitingForResponse: true,
  }));
}

function handleMessageDelta(chatId: string, chunk: MessageDeltaEvent) {
  if (!chunk.content || chunk.content.length === 0) {
    return;
  }
  updateChatDetails(chatId, (details) => {
    return {
      ...details,
      messages: applyMessageDeltaToChatMessages(details.messages, chunk),
      waitingForResponse: true,
    };
  });
}

function handleToolResult(
  chatId: string,
  chunk: ToolResultEvent,
  projectConfigId: string,
) {
  updateChatDetails(chatId, (details) => {
    return {
      ...details,
      messages: upsertMessage(details.messages, chunk.result),
    };
  });
  clearToolArgumentPreviewByToolCallId(
    projectConfigId,
    chunk.result.tool_call_id,
  );
  handleAgenticScopeViolation(chunk.result, projectConfigId);
  maybeApplyAppDefinitionToolResult(chunk.result);
}

function handleMessageStop(chatId: string, projectConfigId: string) {
  clearStopEligibleAssistantMessageId(chatId);
  updateChatDetails(chatId, (details) => ({
    ...details,
    waitingForResponse: false,
  }));
  clearStreamingFollowToolArguments(chatId, projectConfigId);
  clearAllAppSpecPatchStreams();
}

function handleMessageFinalized(
  chatId: string,
  chunk: MessageFinalizedEvent,
  projectConfigId: string,
) {
  let resolvedTargetId: string | null = chunk.message.id;
  updateChatDetails(chatId, (details) => {
    const { messages, targetId } = applyFinalizedMessageToChatMessages(
      details.messages,
      chunk.message,
    );
    resolvedTargetId = targetId;
    return {
      ...details,
      messages,
      waitingForResponse: false,
      toolCallArguments: {},
    };
  });
  if (chunk.message.role === ChatRoleEnum.assistant) {
    clearStopEligibleAssistantMessageId(chatId);
    clearInterruptedAssistantMessages(chatId, [
      resolvedTargetId,
      chunk.message.id,
    ]);
  }
  clearStreamingFollowToolArguments(chatId, projectConfigId);
  const toolCallIds: string[] =
    chunk.message.role === "assistant"
      ? chunk.message.tool_calls?.map((toolCall) => toolCall.id) ?? []
      : [];
  clearToolArgumentPreviewByToolCallIds(projectConfigId, toolCallIds);
}
