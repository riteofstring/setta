import { useAIStore } from "state/stores/aiStores";
import {
  normalizeChatAppGenerationContext,
  retainChatAppGenerationDetailsForMessages,
  serializeChatAppGenerationByMessageId,
  setChatAppGenerationForMessage,
  type ChatAppGenerationContext,
  type ChatAppGenerationDetails,
} from "state/utils/chatAppGenerationDetails";
import { BaseChatMessageUnion, ChatFileAttachment } from "utils/generatedTypes";
import { resolveEngineConfigIdForChat } from "./aiChatSubmissionEngineResolution";
import {
  buildChatUserMessage,
  buildEditedMessageRequestPayload,
  buildSubmitMessageRequestPayload,
  getNextMessagesForSubmit,
  resolveChatExecutionSettings,
  resolvePendingSurfaceIdForSubmit,
  type ChatExecutionSettings,
  type EditedMessageRequestPayload,
  type SubmitMessageRequestPayload,
} from "./aiChatSubmissionRequestPayload";
import { getChatAppGenerationDetailsForTarget } from "./aiPendingChatAppGenerationState";
import { buildEditedMessageHistory } from "./chatBranchEditing";

export type PreparedSubmitMessageRequest = {
  requestPayload: SubmitMessageRequestPayload;
  resolvedPendingSurfaceId: string | null;
  userMessageId: string;
  appGeneration: ChatAppGenerationContext | null;
};

export type PreparedEditedMessageRequest = {
  requestPayload: EditedMessageRequestPayload;
  resolvedPendingSurfaceId: string;
  nextMessages: Array<BaseChatMessageUnion>;
  nextAppGenerationDetails: ChatAppGenerationDetails | null;
};

export function prepareSubmitMessageRequest({
  chatId,
  message,
  attachments,
  thinking,
  engineConfigId,
  options = {},
}: {
  chatId: string | null;
  message: string;
  attachments: ChatFileAttachment[];
  thinking: boolean;
  engineConfigId: string;
  options?: {
    messageId?: string;
    agentProfileId?: string | null;
    sectionId?: string | null;
    continueFromChatId?: string | null;
    pendingSurfaceId?: string | null;
    executionSettings?: ChatExecutionSettings | null;
    appGeneration?: ChatAppGenerationContext | null;
  };
}): PreparedSubmitMessageRequest | null {
  const trimmed = message.trim();
  if ((!trimmed && attachments.length === 0) || !engineConfigId) {
    return null;
  }
  const resolvedPendingSurfaceId = resolvePendingSurfaceIdForSubmit({
    chatId,
    pendingSurfaceId: options.pendingSurfaceId,
  });
  const resolvedExecutionSettings = resolveChatExecutionSettings(
    options.executionSettings,
  );
  const appGeneration = normalizeChatAppGenerationContext(
    options.appGeneration ?? null,
  );
  const existingAppGenerationDetails = getChatAppGenerationDetailsForTarget(
    useAIStore.getState(),
    chatId,
    resolvedPendingSurfaceId,
  );
  const userMessage = buildChatUserMessage({
    messageId: options.messageId,
    message: trimmed,
    attachments,
  });
  const nextMessages = getNextMessagesForSubmit({
    chatId,
    userMessage,
    resolvedPendingSurfaceId,
  });
  const nextAppGenerationDetails = setChatAppGenerationForMessage(
    existingAppGenerationDetails,
    nextMessages,
    userMessage.id,
    appGeneration,
  );

  return {
    requestPayload: buildSubmitMessageRequestPayload({
      userMessage,
      thinking,
      chatId,
      continueFromChatId: options.continueFromChatId ?? null,
      engineConfigId,
      agentProfileId: options.agentProfileId ?? null,
      appGenerationMode: appGeneration?.mode ?? null,
      appGenerationByMessageId: serializeChatAppGenerationByMessageId(
        nextAppGenerationDetails,
      ),
      sectionId: options.sectionId ?? null,
      executionSettings: resolvedExecutionSettings,
    }),
    resolvedPendingSurfaceId,
    userMessageId: userMessage.id,
    appGeneration,
  };
}

export async function prepareEditedMessageRequest({
  parentChatId,
  messages,
  messageId,
  message,
  attachments,
  thinking,
  engineConfigId,
  agentProfileId,
  sectionId,
  pendingSurfaceId,
  executionSettings,
  appGeneration,
}: {
  parentChatId: string;
  messages: Array<BaseChatMessageUnion>;
  messageId: string;
  message: string;
  attachments: ChatFileAttachment[];
  thinking: boolean;
  engineConfigId: string | null;
  agentProfileId?: string | null;
  sectionId?: string | null;
  pendingSurfaceId?: string | null;
  executionSettings?: ChatExecutionSettings | null;
  appGeneration?: ChatAppGenerationContext | null;
}): Promise<PreparedEditedMessageRequest | null> {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) {
    return null;
  }
  const resolvedExecutionSettings =
    resolveChatExecutionSettings(executionSettings);
  const resolvedAppGeneration = normalizeChatAppGenerationContext(
    appGeneration ?? null,
  );
  const editedMessage = buildChatUserMessage({
    messageId,
    message: trimmed,
    attachments,
  });
  const nextMessages = buildEditedMessageHistory(messages, editedMessage);
  if (!nextMessages) {
    return null;
  }
  const resolvedPendingSurfaceId = resolvePendingSurfaceIdForSubmit({
    chatId: null,
    pendingSurfaceId,
  });
  const parentAppGenerationDetails = getChatAppGenerationDetailsForTarget(
    useAIStore.getState(),
    parentChatId,
    null,
  );
  const nextAppGenerationDetails = setChatAppGenerationForMessage(
    retainChatAppGenerationDetailsForMessages(
      parentAppGenerationDetails,
      nextMessages,
    ),
    nextMessages,
    messageId,
    resolvedAppGeneration,
  );
  const resolvedEngineConfigId = await resolveEngineConfigIdForChat(
    parentChatId,
    engineConfigId,
  );
  if (!resolvedEngineConfigId) {
    return null;
  }

  return {
    requestPayload: buildEditedMessageRequestPayload({
      editedMessage,
      thinking,
      engineConfigId: resolvedEngineConfigId,
      agentProfileId: agentProfileId ?? null,
      appGenerationMode: resolvedAppGeneration?.mode ?? null,
      appGenerationByMessageId: serializeChatAppGenerationByMessageId(
        nextAppGenerationDetails,
      ),
      sectionId: sectionId ?? null,
      executionSettings: resolvedExecutionSettings,
      parentChatId,
      messageId,
    }),
    resolvedPendingSurfaceId,
    nextMessages,
    nextAppGenerationDetails,
  };
}
