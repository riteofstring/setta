import { useAIStore } from "state/stores/aiStores";
import {
  normalizeChatAppGenerationContext,
  retainChatAppGenerationDetailsForMessages,
  serializeChatAppGenerationByMessageId,
  setChatAppGenerationForMessage,
  type ChatAppGenerationContext,
  type ChatAppGenerationDetails,
} from "state/utils/chatAppGeneration";
import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatPermissionMode,
  ChatPermissionModeEnum,
  ChatRoleEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { requirePendingChatSurfaceId } from "./aiChatState";
import { resolveEngineConfigIdForChat } from "./aiChatSubmissionEngineResolution";
import { getChatAppGenerationDetailsForTarget } from "./aiPendingChatAppGenerationState";
import { buildEditedMessageHistory } from "./chatBranches";

export type ChatExecutionSettings = {
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
};

export const DEFAULT_CHAT_EXECUTION_SETTINGS: ChatExecutionSettings = {
  permissionMode: ChatPermissionModeEnum.minimal,
  searchEnabled: true,
};

type SubmitMessageRequestPayload = {
  message: {
    id: string;
    role: ChatRoleEnum.user;
    content: ReturnType<typeof createMessageTextContent>[];
    attachments: ChatFileAttachment[];
    createdAt: number;
  };
  thinking: boolean;
  chatId: string | null;
  continueFromChatId: string | null;
  engineConfigId: string;
  agentProfileId: string | null;
  appGenerationMode: string | null;
  appGenerationByMessageId: Record<string, string>;
  sectionId: string | null;
  allowUnscoped: boolean;
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
};

export type PreparedSubmitMessageRequest = {
  requestPayload: SubmitMessageRequestPayload;
  resolvedPendingSurfaceId: string | null;
  userMessageId: string;
  appGeneration: ChatAppGenerationContext | null;
};

export type PreparedEditedMessageRequest = {
  requestPayload: Omit<
    SubmitMessageRequestPayload,
    "chatId" | "continueFromChatId"
  > & {
    chatId: null;
    branchParentChatId: string;
    branchFromMessageId: string;
  };
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
  const resolvedPendingSurfaceId =
    chatId === null
      ? requirePendingChatSurfaceId(options.pendingSurfaceId ?? null)
      : options.pendingSurfaceId ?? null;
  const resolvedExecutionSettings =
    options.executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;
  const appGeneration = normalizeChatAppGenerationContext(
    options.appGeneration ?? null,
  );
  const existingAppGenerationDetails = getChatAppGenerationDetailsForTarget(
    useAIStore.getState(),
    chatId,
    resolvedPendingSurfaceId,
  );
  const userMessage = buildUserMessage({
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
    requestPayload: {
      message: userMessage,
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
      allowUnscoped: options.sectionId == null,
      permissionMode: resolvedExecutionSettings.permissionMode,
      searchEnabled: resolvedExecutionSettings.searchEnabled,
    },
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
    executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;
  const resolvedAppGeneration = normalizeChatAppGenerationContext(
    appGeneration ?? null,
  );
  const editedMessage = buildUserMessage({
    messageId,
    message: trimmed,
    attachments,
  });
  const nextMessages = buildEditedMessageHistory(messages, editedMessage);
  if (!nextMessages) {
    return null;
  }
  const resolvedPendingSurfaceId = requirePendingChatSurfaceId(
    pendingSurfaceId ?? null,
  );
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
    requestPayload: {
      message: editedMessage,
      thinking,
      chatId: null,
      engineConfigId: resolvedEngineConfigId,
      agentProfileId: agentProfileId ?? null,
      appGenerationMode: resolvedAppGeneration?.mode ?? null,
      appGenerationByMessageId: serializeChatAppGenerationByMessageId(
        nextAppGenerationDetails,
      ),
      sectionId: sectionId ?? null,
      allowUnscoped: sectionId == null,
      permissionMode: resolvedExecutionSettings.permissionMode,
      searchEnabled: resolvedExecutionSettings.searchEnabled,
      branchParentChatId: parentChatId,
      branchFromMessageId: messageId,
    },
    resolvedPendingSurfaceId,
    nextMessages,
    nextAppGenerationDetails,
  };
}

function buildUserMessage({
  messageId,
  message,
  attachments,
}: {
  messageId?: string;
  message: string;
  attachments: ChatFileAttachment[];
}) {
  const content = [];
  if (message) {
    content.push(createMessageTextContent({ text: message }));
  }
  return {
    id: messageId ?? createNewId(),
    role: ChatRoleEnum.user,
    content,
    attachments,
    createdAt: Date.now(),
  };
}

function getNextMessagesForSubmit({
  chatId,
  userMessage,
  resolvedPendingSurfaceId,
}: {
  chatId: string | null;
  userMessage: BaseChatMessageUnion;
  resolvedPendingSurfaceId: string | null;
}): Array<BaseChatMessageUnion> {
  if (chatId === null) {
    if (resolvedPendingSurfaceId === null) {
      return [userMessage];
    }
    return [
      ...(useAIStore.getState().pendingChatDetailsBySurfaceId[
        resolvedPendingSurfaceId
      ]?.messages ?? []),
      userMessage,
    ];
  }
  return [
    ...(useAIStore.getState().chatDetails[chatId]?.messages ?? []),
    userMessage,
  ];
}
