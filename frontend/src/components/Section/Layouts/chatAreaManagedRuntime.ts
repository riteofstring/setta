import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import {
  submitEditedMessage,
  submitMessage,
} from "state/actions/ai/chatCommands";
import { stopManagedSectionChatResponse } from "state/actions/ai/chatRuntime";
import { transcribeChatAudioWithProfile } from "state/actions/ai/transcription";
import {
  type BaseChatMessageUnion,
  type ChatFileAttachment,
  ChatRoleEnum,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  emitChatSendAction,
  emitChatStopAction,
} from "./chatAreaRealtimeActions";

type ManagedRuntimeDependencies = {
  createMessageId?: () => string;
  getTimestampMs?: () => number;
  emitSendAction?: typeof emitChatSendAction;
  emitStopAction?: typeof emitChatStopAction;
  submitMessage?: typeof submitMessage;
  submitEditedMessage?: typeof submitEditedMessage;
  stopManagedSectionChatResponse?: typeof stopManagedSectionChatResponse;
  transcribeChatAudioWithProfile?: typeof transcribeChatAudioWithProfile;
};

type ManagedExecutionSettings = {
  permissionMode: ChatPermissionModeValue;
  searchEnabled: boolean;
};

export async function submitManagedSectionChatMessage({
  message,
  attachments,
  chatId,
  canUseManagedChat,
  hasEngineConfig,
  hasLLMConfig,
  isExternalEngine,
  externalEngineAvailable,
  thinking,
  effectiveEngineConfigId,
  agentProfileId,
  sectionId,
  surfaceId,
  executionSettings,
  onStartNewChat,
  onSettleNewChat,
  dependencies = {},
}: {
  message: string;
  attachments: ChatFileAttachment[];
  chatId: string | null;
  canUseManagedChat: boolean;
  hasEngineConfig: boolean;
  hasLLMConfig: boolean;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  thinking: boolean;
  effectiveEngineConfigId: string | null;
  agentProfileId: string | null;
  sectionId: string;
  surfaceId?: string;
  executionSettings: ManagedExecutionSettings;
  onStartNewChat: () => void;
  onSettleNewChat: (newChatId: string | null, succeeded: boolean) => void;
  dependencies?: ManagedRuntimeDependencies;
}) {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) {
    return false;
  }
  if (!canUseManagedChat) {
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
  const createMessageId = dependencies.createMessageId ?? createNewId;
  const getTimestampMs = dependencies.getTimestampMs ?? Date.now;
  const emitSendAction = dependencies.emitSendAction ?? emitChatSendAction;
  const submitMessageCommand = dependencies.submitMessage ?? submitMessage;
  const messageId = createMessageId();
  const timestampMs = getTimestampMs();
  emitSendAction({
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
    onStartNewChat();
  }

  let submittedChatId: string | null = null;
  let succeeded = false;
  try {
    if (!effectiveEngineConfigId) {
      return false;
    }
    submittedChatId = await submitMessageCommand(
      chatId,
      message,
      attachments,
      thinking,
      effectiveEngineConfigId,
      isExternalEngine,
      {
        messageId,
        agentProfileId,
        sectionId,
        pendingSurfaceId: surfaceId,
        executionSettings,
      },
    );
    succeeded = Boolean(submittedChatId);
  } catch (err) {
    console.error("Failed to submit LLM chat message", err);
  } finally {
    if (isFirstMessage) {
      onSettleNewChat(submittedChatId, succeeded);
    }
  }
  return succeeded;
}

export async function stopManagedSectionChatWithAction({
  chatId,
  isExternalEngine,
  projectConfigId,
  sectionId,
  surfaceId,
  dependencies = {},
}: {
  chatId: string | null;
  isExternalEngine: boolean;
  projectConfigId: string;
  sectionId: string;
  surfaceId?: string;
  dependencies?: ManagedRuntimeDependencies;
}) {
  const getTimestampMs = dependencies.getTimestampMs ?? Date.now;
  const emitStopAction = dependencies.emitStopAction ?? emitChatStopAction;
  const stopManagedChat =
    dependencies.stopManagedSectionChatResponse ??
    stopManagedSectionChatResponse;
  emitStopAction({
    sectionId,
    managed: true,
    timestampMs: getTimestampMs(),
  });
  await stopManagedChat(
    chatId,
    isExternalEngine,
    projectConfigId,
    sectionId,
    surfaceId,
  );
}

export async function editManagedSectionChatMessage({
  resolvedChatId,
  messageId,
  text,
  attachments,
  canUseManagedChat,
  isExternalEngine,
  externalEngineAvailable,
  messages,
  thinking,
  effectiveEngineConfigId,
  agentProfileId,
  sectionId,
  surfaceId,
  executionSettings,
  dependencies = {},
}: {
  resolvedChatId: string | null;
  messageId: string;
  text: string;
  attachments: ChatFileAttachment[];
  canUseManagedChat: boolean;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  messages: Array<BaseChatMessageUnion>;
  thinking: boolean;
  effectiveEngineConfigId: string | null;
  agentProfileId: string | null;
  sectionId: string;
  surfaceId?: string;
  executionSettings: ManagedExecutionSettings;
  dependencies?: ManagedRuntimeDependencies;
}) {
  if (!resolvedChatId) {
    return false;
  }
  if (!canUseManagedChat) {
    return false;
  }
  if (isExternalEngine && !externalEngineAvailable) {
    return false;
  }
  const submitEditedMessageCommand =
    dependencies.submitEditedMessage ?? submitEditedMessage;
  const nextChatId = await submitEditedMessageCommand({
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
    pendingSurfaceId: surfaceId,
    executionSettings,
  });
  return Boolean(nextChatId);
}

export async function transcribeManagedSectionChatAudio({
  isExternalEngine,
  transcriptionProfileId,
  audioBlob,
  dependencies = {},
}: {
  isExternalEngine: boolean;
  transcriptionProfileId: string | null;
  audioBlob: Blob;
  dependencies?: ManagedRuntimeDependencies;
}) {
  if (isExternalEngine || !transcriptionProfileId) {
    throw new Error("Provider dictation is not configured.");
  }
  const transcribeAudio =
    dependencies.transcribeChatAudioWithProfile ??
    transcribeChatAudioWithProfile;
  return transcribeAudio(transcriptionProfileId, audioBlob);
}
