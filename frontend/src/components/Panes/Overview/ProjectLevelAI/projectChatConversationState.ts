import { getDefaultChatAppGenerationDetails } from "state/utils/chatAppGeneration";
import {
  type AllConfigs,
  type BaseChatMessageUnion,
  type EngineConfig,
  EngineTypeEnum,
} from "utils/generatedTypes";

type ResolveProjectChatThreadVisibilityFromResizeInput = {
  isInitialRun: boolean;
  wasLargeEnoughForInlineThreads: boolean;
  isLargeEnoughForInlineThreads: boolean;
  viewThreads: boolean;
  explicitlyClosedAtLargeWidth: boolean;
};

type ResolveProjectChatConversationDataSourceInput = {
  chatId: string | null | undefined;
  hasPendingDetails: boolean;
};

type ProjectChatConversationDataSource =
  | { kind: "active"; chatId: string }
  | { kind: "pending" }
  | { kind: "empty" };

type ResolveProjectChatEngineConfigIdForSelectedChatInput = {
  chatId: string | null | undefined;
  selectedEngineId: string | null;
  availableEngineConfigIds: Set<string>;
  chatEngineConfigByChatId: Map<string, string | null>;
};

type ResolveProjectChatSelectedEngineIdAfterEngineConfigsLoadInput = {
  engineConfigsInitialLoadComplete: boolean;
  engineConfigs: EngineConfig[];
  selectedEngineId: string | null;
  preferredEngineId: string | null;
};

type ResolveProjectChatSelectedLLMUnavailableReasonInput = {
  engineType: EngineTypeEnum | null;
  selectedLLMConfigId: string | null;
  allLLMConfigs: AllConfigs | null;
  availableConfigIds: Set<string>;
};

export type ProjectChatEngineSwitchContinuation = {
  sourceChatId: string;
  sourceEngineConfigId: string;
  targetEngineConfigId: string | null;
};

type ResolveProjectChatEngineSwitchContinuationOnEngineChangeInput = {
  chatId: string | null | undefined;
  nextEngineId: string | null;
  chatEngineConfigByChatId: Map<string, string | null>;
};

type ResolveProjectChatEngineSwitchContinuationAfterContextChangeInput = {
  continuation: ProjectChatEngineSwitchContinuation | null;
  chatId: string | null | undefined;
  selectedEngineId: string | null;
};

type ShouldProjectChatSkipEngineSyncForContinuationInput = {
  continuation: ProjectChatEngineSwitchContinuation | null;
  chatId: string | null | undefined;
};

export function resolveProjectChatThreadVisibilityFromResize({
  isInitialRun,
  wasLargeEnoughForInlineThreads,
  isLargeEnoughForInlineThreads,
  viewThreads,
  explicitlyClosedAtLargeWidth,
}: ResolveProjectChatThreadVisibilityFromResizeInput): boolean | null {
  const preserveWideLayoutPreference =
    viewThreads || explicitlyClosedAtLargeWidth;
  const shouldReactToResize =
    isInitialRun ||
    wasLargeEnoughForInlineThreads !== isLargeEnoughForInlineThreads;
  if (!shouldReactToResize) {
    return null;
  }
  if (isLargeEnoughForInlineThreads && !preserveWideLayoutPreference) {
    return true;
  }
  if (!isLargeEnoughForInlineThreads && viewThreads) {
    return false;
  }
  return null;
}

export function resolveProjectChatConversationDataSource({
  chatId,
  hasPendingDetails,
}: ResolveProjectChatConversationDataSourceInput): ProjectChatConversationDataSource {
  if (chatId === null) {
    return { kind: "pending" };
  }
  if (typeof chatId === "string") {
    return { kind: "active", chatId };
  }
  if (hasPendingDetails) {
    return { kind: "pending" };
  }
  return { kind: "empty" };
}

const EMPTY_CHAT_MESSAGES: Array<BaseChatMessageUnion> = [];

export function resolveProjectChatMessagesForSurface({
  source,
  pendingDetails,
  chatDetails,
}: {
  source: ProjectChatConversationDataSource;
  pendingDetails: { messages: Array<BaseChatMessageUnion> } | null;
  chatDetails: Record<string, { messages: Array<BaseChatMessageUnion> }>;
}): Array<BaseChatMessageUnion> {
  if (source.kind === "pending") {
    return pendingDetails?.messages ?? EMPTY_CHAT_MESSAGES;
  }
  if (source.kind === "active") {
    return chatDetails[source.chatId]?.messages ?? EMPTY_CHAT_MESSAGES;
  }
  return EMPTY_CHAT_MESSAGES;
}

export function resolveProjectChatAppGenerationDetailsForSurface({
  source,
  pendingAppGenerationDetails,
  chatAppGenerationDetailsByChatId,
}: {
  source: ProjectChatConversationDataSource;
  pendingAppGenerationDetails: ReturnType<
    typeof getDefaultChatAppGenerationDetails
  > | null;
  chatAppGenerationDetailsByChatId: Record<
    string,
    ReturnType<typeof getDefaultChatAppGenerationDetails>
  >;
}): ReturnType<typeof getDefaultChatAppGenerationDetails> {
  if (source.kind === "pending") {
    return pendingAppGenerationDetails ?? getDefaultChatAppGenerationDetails();
  }
  if (source.kind === "active") {
    return (
      chatAppGenerationDetailsByChatId[source.chatId] ??
      getDefaultChatAppGenerationDetails()
    );
  }
  return getDefaultChatAppGenerationDetails();
}

export function resolveProjectChatWaitingForResponseForSurface({
  source,
  pendingDetails,
  chatDetails,
}: {
  source: ProjectChatConversationDataSource;
  pendingDetails: { waitingForResponse: boolean } | null;
  chatDetails: Record<string, { waitingForResponse: boolean }>;
}): boolean {
  if (source.kind === "pending") {
    return Boolean(pendingDetails?.waitingForResponse);
  }
  if (source.kind === "active") {
    return Boolean(chatDetails[source.chatId]?.waitingForResponse);
  }
  return false;
}

export function resolveProjectChatEngineConfigIdForSelectedChat({
  chatId,
  selectedEngineId,
  availableEngineConfigIds,
  chatEngineConfigByChatId,
}: ResolveProjectChatEngineConfigIdForSelectedChatInput): string | null {
  const resolvedChatId = chatId?.trim() ?? "";
  if (!resolvedChatId) {
    return null;
  }
  const resolvedEngineConfigId = chatEngineConfigByChatId.get(resolvedChatId);
  if (!resolvedEngineConfigId) {
    return null;
  }
  if (!availableEngineConfigIds.has(resolvedEngineConfigId)) {
    return null;
  }
  if (resolvedEngineConfigId === selectedEngineId) {
    return null;
  }
  return resolvedEngineConfigId;
}

export function resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad({
  engineConfigsInitialLoadComplete,
  engineConfigs,
  selectedEngineId,
  preferredEngineId,
}: ResolveProjectChatSelectedEngineIdAfterEngineConfigsLoadInput):
  | string
  | null {
  if (!engineConfigsInitialLoadComplete) {
    return selectedEngineId;
  }
  if (engineConfigs.length === 0) {
    return null;
  }
  if (
    selectedEngineId &&
    engineConfigs.some((config) => config.id === selectedEngineId)
  ) {
    return selectedEngineId;
  }
  return preferredEngineId ?? engineConfigs[0].id;
}

export function resolveProjectChatSelectedLLMUnavailableReason({
  engineType,
  selectedLLMConfigId,
  allLLMConfigs,
  availableConfigIds,
}: ResolveProjectChatSelectedLLMUnavailableReasonInput): string | null {
  if (engineType !== EngineTypeEnum.setta_llm) {
    return null;
  }
  if (!selectedLLMConfigId) {
    return null;
  }
  if (availableConfigIds.has(selectedLLMConfigId)) {
    return null;
  }
  const selectedConfig = allLLMConfigs?.configs[selectedLLMConfigId];
  if (!selectedConfig) {
    return "Selected model is unavailable.";
  }
  const requiredApiKeyEnv = selectedConfig.api_key_env?.trim() ?? "";
  if (requiredApiKeyEnv) {
    return `Selected model is unavailable. Missing API key: ${requiredApiKeyEnv}.`;
  }
  return "Selected model is unavailable.";
}

export function resolveProjectChatEngineSwitchContinuationOnEngineChange({
  chatId,
  nextEngineId,
  chatEngineConfigByChatId,
}: ResolveProjectChatEngineSwitchContinuationOnEngineChangeInput): ProjectChatEngineSwitchContinuation | null {
  const resolvedChatId = chatId?.trim() ?? "";
  if (!resolvedChatId) {
    return null;
  }
  const sourceEngineConfigId = chatEngineConfigByChatId.get(resolvedChatId);
  if (!sourceEngineConfigId) {
    return null;
  }
  if (sourceEngineConfigId === nextEngineId) {
    return null;
  }
  return {
    sourceChatId: resolvedChatId,
    sourceEngineConfigId,
    targetEngineConfigId: nextEngineId,
  };
}

export function resolveProjectChatEngineSwitchContinuationAfterContextChange({
  continuation,
  chatId,
  selectedEngineId,
}: ResolveProjectChatEngineSwitchContinuationAfterContextChangeInput): ProjectChatEngineSwitchContinuation | null {
  if (!continuation) {
    return null;
  }
  const resolvedChatId = chatId?.trim() ?? "";
  if (resolvedChatId !== continuation.sourceChatId) {
    return null;
  }
  if (selectedEngineId === continuation.sourceEngineConfigId) {
    return null;
  }
  return continuation;
}

export function shouldProjectChatSkipEngineSyncForContinuation({
  continuation,
  chatId,
}: ShouldProjectChatSkipEngineSyncForContinuationInput): boolean {
  if (!continuation) {
    return false;
  }
  const resolvedChatId = chatId?.trim() ?? "";
  return resolvedChatId !== "" && resolvedChatId === continuation.sourceChatId;
}
