import { useAIStore } from "state/stores/aiStores";
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

export type ChatExecutionSettings = {
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
};

export const DEFAULT_CHAT_EXECUTION_SETTINGS: ChatExecutionSettings = {
  permissionMode: ChatPermissionModeEnum.minimal,
  searchEnabled: true,
};

export type ChatUserMessageRequestPayload = {
  id: string;
  role: ChatRoleEnum.user;
  content: ReturnType<typeof createMessageTextContent>[];
  attachments: ChatFileAttachment[];
  createdAt: number;
};

export type SubmitMessageRequestPayload = {
  message: ChatUserMessageRequestPayload;
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

export type EditedMessageRequestPayload = Omit<
  SubmitMessageRequestPayload,
  "chatId" | "continueFromChatId"
> & {
  chatId: null;
  branchParentChatId: string;
  branchFromMessageId: string;
};

export function resolveChatExecutionSettings(
  executionSettings: ChatExecutionSettings | null | undefined,
): ChatExecutionSettings {
  return executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;
}

export function buildChatUserMessage({
  messageId,
  message,
  attachments,
}: {
  messageId?: string;
  message: string;
  attachments: ChatFileAttachment[];
}): ChatUserMessageRequestPayload {
  const content: ReturnType<typeof createMessageTextContent>[] = [];
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

export function getNextMessagesForSubmit({
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

export function resolvePendingSurfaceIdForSubmit({
  chatId,
  pendingSurfaceId,
}: {
  chatId: string | null;
  pendingSurfaceId: string | null | undefined;
}): string | null {
  return chatId === null
    ? requirePendingChatSurfaceId(pendingSurfaceId ?? null)
    : pendingSurfaceId ?? null;
}

export function buildSubmitMessageRequestPayload({
  userMessage,
  thinking,
  chatId,
  continueFromChatId,
  engineConfigId,
  agentProfileId,
  sectionId,
  executionSettings,
  appGenerationMode,
  appGenerationByMessageId,
}: {
  userMessage: ChatUserMessageRequestPayload;
  thinking: boolean;
  chatId: string | null;
  continueFromChatId: string | null;
  engineConfigId: string;
  agentProfileId: string | null;
  sectionId: string | null;
  executionSettings: ChatExecutionSettings;
  appGenerationMode: string | null;
  appGenerationByMessageId: Record<string, string>;
}): SubmitMessageRequestPayload {
  return {
    message: userMessage,
    thinking,
    chatId,
    continueFromChatId,
    engineConfigId,
    agentProfileId,
    appGenerationMode,
    appGenerationByMessageId,
    sectionId,
    allowUnscoped: sectionId == null,
    permissionMode: executionSettings.permissionMode,
    searchEnabled: executionSettings.searchEnabled,
  };
}

export function buildEditedMessageRequestPayload({
  editedMessage,
  thinking,
  engineConfigId,
  agentProfileId,
  sectionId,
  executionSettings,
  appGenerationMode,
  appGenerationByMessageId,
  parentChatId,
  messageId,
}: {
  editedMessage: ChatUserMessageRequestPayload;
  thinking: boolean;
  engineConfigId: string;
  agentProfileId: string | null;
  sectionId: string | null;
  executionSettings: ChatExecutionSettings;
  appGenerationMode: string | null;
  appGenerationByMessageId: Record<string, string>;
  parentChatId: string;
  messageId: string;
}): EditedMessageRequestPayload {
  return {
    message: editedMessage,
    thinking,
    chatId: null,
    engineConfigId,
    agentProfileId,
    appGenerationMode,
    appGenerationByMessageId,
    sectionId,
    allowUnscoped: sectionId == null,
    permissionMode: executionSettings.permissionMode,
    searchEnabled: executionSettings.searchEnabled,
    branchParentChatId: parentChatId,
    branchFromMessageId: messageId,
  };
}
