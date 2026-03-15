import {
  receiveAgenticScopeViolationEdges,
  SCOPE_VIOLATION_TIMEOUT_MS,
} from "state/actions/aiFollowHighlights";
import { clearAIFollowToolArgumentsForChat } from "state/actions/aiFollowToolArguments";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  clearChatStreamActive,
  markChatStreamActive,
  recordFinalizedMessage,
  shouldPersistOnMessageStop,
} from "state/aiStreamingTracker";
import {
  ChatRoleEnum,
  SettaNotificationTypeEnum,
  StreamingEventTypeEnum,
  ToolResultEvent,
} from "utils/generatedTypes";

import { extractAgenticScopeViolation } from "./agenticScopeViolation";
import { persistChatSectionState } from "./aiChatSectionState";
import { maybeApplyAppDefinitionToolResult } from "./aiChatStreamingAppDefinition";
import type { ResolvedStreamingChunkContext } from "./aiChatStreamingChunkContext";
import { applyChatSectionStreamDelta } from "./aiChatStreamingSectionState";
import {
  applyToolArgumentPreviewDeltaToPreviewStore,
  clearToolArgumentPreviewByToolCallId,
  clearToolArgumentPreviewByToolCallIds,
} from "./aiChatStreamingToolPreviews";

const scopeViolationToastTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

export function applyStreamingChunkRoutingSideEffects(
  context: Pick<
    ResolvedStreamingChunkContext,
    "chatId" | "chunk" | "projectConfigId" | "sectionId"
  >,
): void {
  const { chatId, chunk, projectConfigId, sectionId } = context;
  trackStreamingChunkActivity(chatId, sectionId, chunk);
  if (!sectionId) {
    return;
  }
  applyStreamingChunkToSection(sectionId, chunk, projectConfigId);
}

export function clearStreamingFollowToolArguments(
  chatId: string,
  projectConfigId: string,
): void {
  clearAIFollowToolArgumentsForChat(projectConfigId, chatId);
}

export function handleAgenticScopeViolation(
  toolResult: ToolResultEvent["result"],
  projectConfigId: string,
): void {
  const violation = extractAgenticScopeViolation(toolResult);
  if (!violation) {
    return;
  }
  receiveAgenticScopeViolationEdges({
    projectConfigId,
    edges: violation.edges,
  });
  const existingTimeout = scopeViolationToastTimeouts.get(projectConfigId);
  if (existingTimeout !== undefined) {
    globalThis.clearTimeout(existingTimeout);
    const timeoutId = globalThis.setTimeout(() => {
      scopeViolationToastTimeouts.delete(projectConfigId);
    }, SCOPE_VIOLATION_TIMEOUT_MS);
    scopeViolationToastTimeouts.set(projectConfigId, timeoutId);
    return;
  }
  const notice = `${violation.message} Add the missing agentic edge(s) shown on the canvas. Use Project Chat for full access.`;
  addTemporaryNotification(notice, SettaNotificationTypeEnum.warning);
  const timeoutId = globalThis.setTimeout(() => {
    scopeViolationToastTimeouts.delete(projectConfigId);
  }, SCOPE_VIOLATION_TIMEOUT_MS);
  scopeViolationToastTimeouts.set(projectConfigId, timeoutId);
}

function trackStreamingChunkActivity(
  chatId: string,
  sectionId: string | null,
  chunk: ResolvedStreamingChunkContext["chunk"],
): void {
  const shouldMarkActive =
    chunk.type === StreamingEventTypeEnum.MESSAGE_START ||
    chunk.type === StreamingEventTypeEnum.DELTA ||
    chunk.type === StreamingEventTypeEnum.TOOL_CALL_DELTA ||
    chunk.type === StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA;
  if (shouldMarkActive) {
    markChatStreamActive(chatId, sectionId);
  }
  if (
    chunk.type === StreamingEventTypeEnum.MESSAGE_STOP ||
    chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED
  ) {
    clearChatStreamActive(chatId, sectionId);
  }
}

function applyStreamingChunkToSection(
  sectionId: string,
  chunk: ResolvedStreamingChunkContext["chunk"],
  projectConfigId: string,
): void {
  const nextState = applyChatSectionStreamDelta(sectionId, chunk);
  if (chunk.type === StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA) {
    applyToolArgumentPreviewDeltaToPreviewStore(chunk, projectConfigId);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.TOOL_RESULT) {
    maybeApplyAppDefinitionToolResult(chunk.result);
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
    clearToolArgumentPreviewByToolCallId(
      projectConfigId,
      chunk.result.tool_call_id,
    );
    handleAgenticScopeViolation(chunk.result, projectConfigId);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_FINALIZED) {
    recordFinalizedMessage(sectionId, chunk.message.id);
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
    const toolCallIds =
      chunk.message.role === ChatRoleEnum.assistant
        ? chunk.message.tool_calls?.map((toolCall) => toolCall.id) ?? []
        : [];
    clearToolArgumentPreviewByToolCallIds(projectConfigId, toolCallIds);
    return;
  }
  if (chunk.type === StreamingEventTypeEnum.MESSAGE_STOP) {
    if (!shouldPersistOnMessageStop(sectionId, chunk.message_id)) {
      return;
    }
    persistChatSectionState({
      projectConfigId,
      sectionId,
      nextState,
      reason: chunk.type,
    });
  }
}
