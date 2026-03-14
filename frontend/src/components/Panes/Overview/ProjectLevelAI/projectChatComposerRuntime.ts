import { type ManagedChatExecutionSettings } from "components/Chat/chatComposerControls";
import {
  submitEditedMessage,
  submitMessage,
} from "state/actions/ai/chatCommands";
import { stopProjectChatResponse } from "state/actions/ai/chatRuntime";
import { transcribeChatAudioWithProfile } from "state/actions/ai/transcription";
import {
  type BaseChatMessageUnion,
  type ChatFileAttachment,
} from "utils/generatedTypes";
import {
  extractUserPromptText,
  findBranchSourceUserMessage,
  getMessageAttachments,
} from "./projectChatHistoryUtils";

type ProjectChatComposerRuntimeDependencies = {
  submitMessage?: typeof submitMessage;
  submitEditedMessage?: typeof submitEditedMessage;
  stopProjectChatResponse?: typeof stopProjectChatResponse;
  transcribeChatAudioWithProfile?: typeof transcribeChatAudioWithProfile;
};

export async function submitProjectChatComposerMessage({
  message,
  attachments,
  chatId,
  thinking,
  engineConfigId,
  isExternalEngine,
  externalEngineAvailable,
  hasLLMConfig,
  requiresNewThreadContinuation,
  newThreadSeedChatId,
  surfaceId,
  executionSettings,
  onStartNewChat,
  onSettleNewChat,
  dependencies = {},
}: {
  message: string;
  attachments: ChatFileAttachment[];
  chatId: string | null | undefined;
  thinking: boolean;
  engineConfigId: string | null;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
  requiresNewThreadContinuation: boolean;
  newThreadSeedChatId: string | null;
  surfaceId: string;
  executionSettings: ManagedChatExecutionSettings;
  onStartNewChat: () => void;
  onSettleNewChat: (newChatId: string | null, succeeded: boolean) => void;
  dependencies?: ProjectChatComposerRuntimeDependencies;
}) {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) {
    return false;
  }
  if (requiresNewThreadContinuation) {
    return false;
  }
  if (!engineConfigId) {
    return false;
  }
  if (!isExternalEngine && !hasLLMConfig) {
    return false;
  }
  if (isExternalEngine && !externalEngineAvailable) {
    return false;
  }
  const submitMessageCommand = dependencies.submitMessage ?? submitMessage;
  const isFirstDraftSubmit = chatId === undefined || chatId === null;
  if (isFirstDraftSubmit) {
    onStartNewChat();
  }

  let submittedChatId: string | null = null;
  let succeeded = false;
  try {
    submittedChatId = await submitMessageCommand(
      chatId ?? null,
      message,
      attachments,
      thinking,
      engineConfigId,
      isExternalEngine,
      {
        continueFromChatId: isFirstDraftSubmit ? newThreadSeedChatId : null,
        pendingSurfaceId: surfaceId,
        executionSettings: {
          permissionMode: executionSettings.permissionMode,
          searchEnabled: executionSettings.searchEnabled,
        },
      },
    );
    succeeded = Boolean(submittedChatId);
  } catch (err) {
    console.error("Failed to submit LLM chat message", err);
  } finally {
    if (isFirstDraftSubmit) {
      onSettleNewChat(submittedChatId, succeeded);
    }
  }
  return succeeded;
}

export async function stopProjectChatComposerResponse({
  chatId,
  isExternalEngine,
  surfaceId,
  dependencies = {},
}: {
  chatId: string | null | undefined;
  isExternalEngine: boolean;
  surfaceId: string;
  dependencies?: ProjectChatComposerRuntimeDependencies;
}) {
  const stopChat =
    dependencies.stopProjectChatResponse ?? stopProjectChatResponse;
  await stopChat(chatId, isExternalEngine, surfaceId);
}

export async function editProjectChatComposerMessage({
  resolvedChatId,
  messageId,
  text,
  attachments,
  requiresNewThreadContinuation,
  isExternalEngine,
  externalEngineAvailable,
  messages,
  thinking,
  engineConfigId,
  surfaceId,
  executionSettings,
  onSelectChatId,
  dependencies = {},
}: {
  resolvedChatId: string | null;
  messageId: string;
  text: string;
  attachments: ChatFileAttachment[];
  requiresNewThreadContinuation: boolean;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  messages: Array<BaseChatMessageUnion>;
  thinking: boolean;
  engineConfigId: string | null;
  surfaceId: string;
  executionSettings: ManagedChatExecutionSettings;
  onSelectChatId: (chatId: string) => void;
  dependencies?: ProjectChatComposerRuntimeDependencies;
}) {
  if (!resolvedChatId) {
    return false;
  }
  if (requiresNewThreadContinuation) {
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
    engineConfigId,
    isExternalEngine,
    agentProfileId: null,
    sectionId: null,
    pendingSurfaceId: surfaceId,
    executionSettings: {
      permissionMode: executionSettings.permissionMode,
      searchEnabled: executionSettings.searchEnabled,
    },
  });
  if (nextChatId) {
    onSelectChatId(nextChatId);
  }
  return Boolean(nextChatId);
}

export async function redoProjectChatComposerMessage({
  assistantMessageId,
  resolvedChatId,
  waitingForResponse,
  requiresNewThreadContinuation,
  engineConfigId,
  isExternalEngine,
  externalEngineAvailable,
  hasLLMConfig,
  messages,
  thinking,
  surfaceId,
  executionSettings,
  onSelectChatId,
  dependencies = {},
}: {
  assistantMessageId: string;
  resolvedChatId: string | null;
  waitingForResponse: boolean;
  requiresNewThreadContinuation: boolean;
  engineConfigId: string | null;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
  messages: Array<BaseChatMessageUnion>;
  thinking: boolean;
  surfaceId: string;
  executionSettings: ManagedChatExecutionSettings;
  onSelectChatId: (chatId: string) => void;
  dependencies?: ProjectChatComposerRuntimeDependencies;
}) {
  if (!resolvedChatId || waitingForResponse) {
    return false;
  }
  if (requiresNewThreadContinuation) {
    return false;
  }
  if (!engineConfigId) {
    return false;
  }
  if (!isExternalEngine && !hasLLMConfig) {
    return false;
  }
  if (isExternalEngine && !externalEngineAvailable) {
    return false;
  }
  const sourceUserMessage = findBranchSourceUserMessage(
    messages,
    assistantMessageId,
  );
  if (!sourceUserMessage) {
    return false;
  }
  const sourceText = extractUserPromptText(sourceUserMessage) ?? "";
  const sourceAttachments = getMessageAttachments(sourceUserMessage);
  const submitEditedMessageCommand =
    dependencies.submitEditedMessage ?? submitEditedMessage;
  const nextChatId = await submitEditedMessageCommand({
    parentChatId: resolvedChatId,
    messages,
    messageId: sourceUserMessage.id,
    message: sourceText,
    attachments: sourceAttachments,
    thinking,
    engineConfigId,
    isExternalEngine,
    agentProfileId: null,
    sectionId: null,
    pendingSurfaceId: surfaceId,
    executionSettings: {
      permissionMode: executionSettings.permissionMode,
      searchEnabled: executionSettings.searchEnabled,
    },
  });
  if (nextChatId) {
    onSelectChatId(nextChatId);
  }
  return Boolean(nextChatId);
}

export async function transcribeProjectChatComposerAudio({
  transcriptionProfileId,
  audioBlob,
  dependencies = {},
}: {
  transcriptionProfileId: string | null;
  audioBlob: Blob;
  dependencies?: ProjectChatComposerRuntimeDependencies;
}) {
  if (!transcriptionProfileId) {
    throw new Error("Provider dictation is not configured.");
  }
  const transcribeAudio =
    dependencies.transcribeChatAudioWithProfile ??
    transcribeChatAudioWithProfile;
  return transcribeAudio(transcriptionProfileId, audioBlob);
}
