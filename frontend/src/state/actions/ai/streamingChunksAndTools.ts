import {
  SCOPE_VIOLATION_TIMEOUT_MS,
  receiveAgenticScopeViolationEdges,
} from "state/actions/aiFollow";

import { addTemporaryNotification } from "state/actions/notifications";

import {
  getCurrProjectConfigId,
  isManagedChatSection,
} from "state/actions/sectionInfos";

import {
  clearChatStreamActive,
  markChatStreamActive,
} from "state/aiStreamingTracker";

import { useAIStore, useProjectState } from "state/definitions";

import {
  AgentRun,
  ChatRoleEnum,
  LLMStreamingResponseContent,
  MessageDeltaEvent,
  MessageStartEvent,
  NotificationTypeEnum,
  StreamingEventTypeEnum,
  ToolCallDeltaEvent,
  ToolResultEvent,
} from "utils/generatedTypes";

import { getRunInputString, getRunLastUpdatedMs } from "../agentRunUtils";

import { extractAgenticScopeViolation } from "../agenticScopeViolation";

import { resolveSectionIdForChatId } from "../chatSectionStreaming";

import { shouldIgnoreResponsePlaceholderChunk } from "../chatStreamState";

import { scopeViolationToastTimeouts } from "./apiKeysAndHealth";

import { loadAgentRuns } from "./llmConfigAndAgentRuns";

import {
  clearInterruptedAssistantMessages,
  setStopEligibleAssistantMessageId,
} from "./chatHydration";

import { applyStreamingChunkToSection } from "./externalChatHydration";

import {
  applyStreamingChunkToChatDetails,
  handleMessageFinalized,
  handleMessageStop,
  handleSectionAwareChatDetailsChunk,
} from "./appDefinitionsAndRollback";

export function resolveResponseChunkSectionId(
  chatId: string,
  sectionId: string | undefined,
): string | undefined {
  if (sectionId) {
    return sectionId;
  }
  return resolveSectionIdForChatId(chatId);
}

export function shouldUpdateChatDetailsForChunk(
  sectionId: string | undefined,
): boolean {
  if (!sectionId) {
    return true;
  }
  return isManagedChatSection(useProjectState.getState(), sectionId);
}

export function isActiveStreamingChunk(
  chunk: LLMStreamingResponseContent["chunk"],
): boolean {
  return (
    chunk.type === StreamingEventTypeEnum.message_start ||
    chunk.type === StreamingEventTypeEnum.delta ||
    chunk.type === StreamingEventTypeEnum.tool_call_delta ||
    chunk.type === StreamingEventTypeEnum.tool_argument_preview_delta
  );
}

export function isTerminalStreamingChunk(
  chunk: LLMStreamingResponseContent["chunk"],
): boolean {
  return (
    chunk.type === StreamingEventTypeEnum.message_stop ||
    chunk.type === StreamingEventTypeEnum.message_finalized
  );
}

export function handleLLMResponseChatDetailsChunk(
  chatId: string,
  chunk: LLMStreamingResponseContent["chunk"],
  sectionId: string | undefined,
  projectConfigId: string,
): void {
  switch (chunk.type) {
    case StreamingEventTypeEnum.message_start:
      handleMessageStart(chatId, chunk);
      return;
    case StreamingEventTypeEnum.delta:
      handleMessageDelta(chatId, chunk);
      return;
    case StreamingEventTypeEnum.tool_call_delta:
      handleToolCallDelta(chatId, chunk);
      return;
    case StreamingEventTypeEnum.tool_argument_preview_delta:
    case StreamingEventTypeEnum.tool_result:
      handleSectionAwareChatDetailsChunk({
        chatId,
        chunk,
        sectionId,
        projectConfigId,
      });
      return;
    case StreamingEventTypeEnum.message_stop:
      handleMessageStop(chatId, projectConfigId);
      return;
    case StreamingEventTypeEnum.message_finalized:
      handleMessageFinalized(chatId, chunk, projectConfigId);
      return;
    default:
      return chunk satisfies never;
  }
}

export function receiveLLMResponseChunk(msg: LLMStreamingResponseContent) {
  const { chatId, chunk } = msg;
  const projectConfigId = msg.projectConfigId ?? getCurrProjectConfigId();
  if (shouldIgnoreResponsePlaceholderChunk(chunk)) {
    return;
  }
  const sectionId = resolveResponseChunkSectionId(chatId, msg.sectionId);
  if (isActiveStreamingChunk(chunk)) {
    markChatStreamActive(chatId, sectionId);
  }
  if (isTerminalStreamingChunk(chunk)) {
    clearChatStreamActive(chatId, sectionId);
  }
  if (sectionId) {
    applyStreamingChunkToSection(sectionId, chunk, projectConfigId);
  }
  if (!shouldUpdateChatDetailsForChunk(sectionId)) {
    return;
  }
  handleLLMResponseChatDetailsChunk(chatId, chunk, sectionId, projectConfigId);
}

export function resolveEngineConfigIdFromRuns(
  runs: AgentRun[],
  chatId: string,
): string | null {
  const runsWithEngine = runs.filter(
    (run) =>
      getRunInputString(run, "chatId") === chatId &&
      Boolean(getRunInputString(run, "engineConfigId")),
  );
  if (runsWithEngine.length === 0) {
    return null;
  }
  const [latestRun] = [...runsWithEngine].sort(
    (a, b) => getRunLastUpdatedMs(b) - getRunLastUpdatedMs(a),
  );
  return latestRun ? getRunInputString(latestRun, "engineConfigId") : null;
}

export async function ensureAgentRunsLoadedForChatResolution(): Promise<boolean> {
  const { agentRunsInitialLoadComplete } = useAIStore.getState();
  if (agentRunsInitialLoadComplete) {
    return true;
  }
  await loadAgentRuns();
  return useAIStore.getState().agentRunsInitialLoadComplete;
}

export function resolveEngineConfigIdFromStoredChat(
  chatId: string,
): string | null {
  const { chatDetails, engineConfigs } = useAIStore.getState();
  const llmConfigId = chatDetails[chatId]?.llmConfig?.id ?? null;
  if (!llmConfigId) {
    return null;
  }
  return (
    engineConfigs.find((config) => config.settaLlmConfigId === llmConfigId)
      ?.id ?? null
  );
}

export async function resolveEngineConfigIdForChat(
  chatId: string,
  engineConfigId: string | null,
): Promise<string | null> {
  if (engineConfigId) {
    return engineConfigId;
  }
  if (!(await ensureAgentRunsLoadedForChatResolution())) {
    return null;
  }
  let { agentRuns } = useAIStore.getState();
  let resolved = resolveEngineConfigIdFromRuns(agentRuns, chatId);
  if (!resolved) {
    await loadAgentRuns();
    ({ agentRuns } = useAIStore.getState());
    resolved = resolveEngineConfigIdFromRuns(agentRuns, chatId);
  }
  if (resolved) {
    return resolved;
  }
  return resolveEngineConfigIdFromStoredChat(chatId);
}

export function handleMessageStart(chatId: string, chunk: MessageStartEvent) {
  if (chunk.message.role === ChatRoleEnum.assistant) {
    setStopEligibleAssistantMessageId(chatId, chunk.message.id);
    clearInterruptedAssistantMessages(chatId, [chunk.message.id]);
  }
  applyStreamingChunkToChatDetails(chatId, chunk);
}

export function handleMessageDelta(chatId: string, chunk: MessageDeltaEvent) {
  applyStreamingChunkToChatDetails(chatId, chunk);
}

export function handleToolCallDelta(chatId: string, chunk: ToolCallDeltaEvent) {
  applyStreamingChunkToChatDetails(chatId, chunk);
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
  addTemporaryNotification(notice, NotificationTypeEnum.warning);
  const timeoutId = globalThis.setTimeout(() => {
    scopeViolationToastTimeouts.delete(projectConfigId);
  }, SCOPE_VIOLATION_TIMEOUT_MS);
  scopeViolationToastTimeouts.set(projectConfigId, timeoutId);
}

export const APP_DEFINITION_TOOL_NAMES = new Set([
  "setta__set_app_definition",
  "setta__update_app_definition",
  "setta__stream_app_definition",
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractToolStructuredContent(
  toolResult: unknown,
): Record<string, unknown> | null {
  if (!isRecord(toolResult)) {
    return null;
  }
  const structured = toolResult.structuredContent;
  if (!structured) {
    return null;
  }
  if (!isRecord(structured)) {
    return null;
  }
  return structured;
}
