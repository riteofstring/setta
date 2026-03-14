import { waitForFrontendAffinityToken } from "state/actions/frontendWebsocketAffinity";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { ChatDetails, useLocalStorage } from "state/definitions";
import type { AppGenerationMode } from "state/types/appGenerationMode";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_llm_response,
  route_respond_external_agent_approval,
  route_respond_external_agent_question,
  route_set_chat_section_chat_id,
} from "utils/generatedEndpoints";
import {
  type BaseChatMessageUnion,
  type ChatFileAttachment,
  type ChatPermissionMode,
  ChatPermissionModeEnum,
  ChatRoleEnum,
  SettaNotificationTypeEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { buildEditedMessageHistory } from "../chatBranches";
import { loadAgentRuns, resolveEngineConfigIdForChat } from "./agentRuns";
import {
  clearPendingChatDetails,
  clearStopEligibleAssistantMessageId,
  commitPendingChatDetails,
  getExternalAgentChat,
  getLLMChat,
  initializePendingChatDetailsWithMessages,
  requirePendingChatSurfaceId,
  updateChatDetails,
  updatePendingChatDetails,
} from "./chatRuntime";

type ChatExecutionSettings = {
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
};

type ChatAppGenerationContext = {
  mode: AppGenerationMode | null;
  referenceImageUrl?: string | null;
  referenceImageNotes?: string | null;
};

const DEFAULT_CHAT_EXECUTION_SETTINGS: ChatExecutionSettings = {
  permissionMode: ChatPermissionModeEnum.minimal,
  searchEnabled: true,
};

function refreshAgentRunsAfterSubmit(): void {
  void loadAgentRuns();
}

export async function submitMessage(
  chatId: string | null,
  message: string,
  attachments: ChatFileAttachment[],
  thinking: boolean,
  engineConfigId: string,
  isExternalEngine: boolean,
  options: {
    messageId?: string;
    agentProfileId?: string | null;
    sectionId?: string | null;
    continueFromChatId?: string | null;
    pendingSurfaceId?: string | null;
    executionSettings?: ChatExecutionSettings | null;
    appGeneration?: ChatAppGenerationContext | null;
  } = {},
): Promise<string | null> {
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
  const appGeneration = options.appGeneration ?? null;

  const content = [];
  if (trimmed) {
    content.push(createMessageTextContent({ text: message }));
  }
  const userMessage = {
    id: options.messageId ?? createNewId(),
    role: ChatRoleEnum.user,
    content,
    attachments,
  };
  const userMessageId = userMessage.id;

  applyOptimisticUserMessage(chatId, userMessage, resolvedPendingSurfaceId);

  try {
    const projectConfigId = getCurrProjectConfigId();
    const frontendAffinityToken = await waitForFrontendAffinityToken();
    const appGenerationMode = appGeneration?.mode ?? null;
    const appSpecStreamingEnabledForSubmit =
      appGenerationMode === null
        ? false
        : useLocalStorage.getState().appSpecStreamingEnabled;
    const res = await route_get_llm_response({
      message: userMessage,
      thinking,
      chatId,
      continueFromChatId: options.continueFromChatId ?? null,
      engineConfigId,
      agentProfileId: options.agentProfileId ?? null,
      appSpecStreamingEnabled: appSpecStreamingEnabledForSubmit,
      appGenerationMode,
      appGenerationReferenceImageUrl: appGeneration?.referenceImageUrl ?? null,
      appGenerationReferenceImageNotes:
        appGeneration?.referenceImageNotes ?? null,
      projectConfigId,
      sectionId: options.sectionId ?? null,
      frontendAffinityToken,
      allowUnscoped: options.sectionId == null,
      permissionMode: resolvedExecutionSettings.permissionMode,
      searchEnabled: resolvedExecutionSettings.searchEnabled,
    });
    if (res200(res)) {
      const returnedChatId = res.data ?? chatId ?? null;
      if (returnedChatId) {
        refreshAgentRunsAfterSubmit();
        if (isExternalEngine) {
          await getExternalAgentChat(
            returnedChatId,
            projectConfigId,
            options.sectionId ?? undefined,
          );
        } else {
          await getLLMChat(returnedChatId, options.sectionId ?? undefined);
        }
      }
      return returnedChatId;
    }
    const failureDetail =
      getErrorDetail(res.data) ??
      (typeof res.status === "number"
        ? `Chat request failed (status ${res.status}).`
        : "Chat request failed.");
    throw new Error(failureDetail);
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message
        : "AI request failed.";
    addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
    rollbackOptimisticUserMessage(
      chatId,
      userMessageId,
      resolvedPendingSurfaceId,
    );
    throw err;
  }
}

export async function submitEditedMessage({
  parentChatId,
  messages,
  messageId,
  message,
  attachments,
  thinking,
  engineConfigId,
  isExternalEngine,
  agentProfileId,
  sectionId,
  pendingSurfaceId,
  executionSettings,
}: {
  parentChatId: string;
  messages: Array<BaseChatMessageUnion>;
  messageId: string;
  message: string;
  attachments: ChatFileAttachment[];
  thinking: boolean;
  engineConfigId: string | null;
  isExternalEngine: boolean;
  agentProfileId?: string | null;
  sectionId?: string | null;
  pendingSurfaceId?: string | null;
  executionSettings?: ChatExecutionSettings | null;
}): Promise<string | null> {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) {
    return null;
  }
  const resolvedExecutionSettings =
    executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;

  const content = [];
  if (trimmed) {
    content.push(createMessageTextContent({ text: message }));
  }
  const editedMessage = {
    id: messageId,
    role: ChatRoleEnum.user,
    content,
    attachments,
  };
  const nextMessages = buildEditedMessageHistory(messages, editedMessage);
  if (!nextMessages) {
    return null;
  }
  const resolvedPendingSurfaceId = requirePendingChatSurfaceId(
    pendingSurfaceId ?? null,
  );
  const resolvedEngineConfigId = await resolveEngineConfigIdForChat(
    parentChatId,
    engineConfigId,
  );
  if (!resolvedEngineConfigId) {
    return null;
  }
  initializePendingChatDetailsWithMessages(
    nextMessages,
    true,
    resolvedPendingSurfaceId,
  );
  const projectConfigId = getCurrProjectConfigId();

  const setSectionChatId = async (nextChatId: string | null) => {
    if (!sectionId) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
          chatId: nextChatId,
        });
      },
      send: () =>
        route_set_chat_section_chat_id({
          projectConfigId,
          sectionId,
          chatId: nextChatId,
        }),
    });
  };

  if (sectionId) {
    await setSectionChatId(null);
  }

  try {
    const frontendAffinityToken = await waitForFrontendAffinityToken();
    const res = await route_get_llm_response({
      message: editedMessage,
      thinking,
      chatId: null,
      engineConfigId: resolvedEngineConfigId,
      agentProfileId: agentProfileId ?? null,
      projectConfigId,
      sectionId: sectionId ?? null,
      frontendAffinityToken,
      allowUnscoped: sectionId == null,
      branchParentChatId: parentChatId,
      branchFromMessageId: messageId,
      permissionMode: resolvedExecutionSettings.permissionMode,
      searchEnabled: resolvedExecutionSettings.searchEnabled,
    });
    if (!res200(res)) {
      const detail =
        getErrorDetail(res.data) ??
        (res.status
          ? `AI request failed (status ${res.status}).`
          : "AI request failed.");
      addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
      clearPendingChatDetails(resolvedPendingSurfaceId);
      if (sectionId) {
        await setSectionChatId(parentChatId);
      }
      return null;
    }
    const returnedChatId = res.data ?? null;
    if (returnedChatId) {
      refreshAgentRunsAfterSubmit();
      if (isExternalEngine) {
        await getExternalAgentChat(
          returnedChatId,
          projectConfigId,
          sectionId ?? undefined,
        );
      } else {
        await getLLMChat(returnedChatId, sectionId ?? undefined);
      }
      if (sectionId) {
        await setSectionChatId(returnedChatId);
      }
      commitPendingChatDetails(returnedChatId, resolvedPendingSurfaceId);
    } else {
      clearPendingChatDetails(resolvedPendingSurfaceId);
    }
    return returnedChatId;
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message
        : "AI request failed.";
    addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
    clearPendingChatDetails(resolvedPendingSurfaceId);
    if (sectionId) {
      await setSectionChatId(parentChatId);
    }
    throw err;
  }
}

export async function respondExternalAgentApproval(
  approvalId: string,
  approved: boolean,
): Promise<boolean> {
  const res = await route_respond_external_agent_approval({
    approvalId,
    approved,
  });
  return res200(res);
}

export async function respondExternalAgentQuestion(
  toolCallId: string,
  answers: Record<string, string>,
): Promise<boolean> {
  const res = await route_respond_external_agent_question({
    toolCallId,
    answers,
  });
  return res200(res);
}

function applyOptimisticUserMessage(
  chatId: string | null,
  userMessage: BaseChatMessageUnion,
  surfaceId: string | null | undefined = null,
) {
  if (typeof chatId === "string") {
    clearStopEligibleAssistantMessageId(chatId);
  }
  const updater = (details: ChatDetails) => ({
    ...details,
    messages: [...details.messages, userMessage],
    waitingForResponse: true,
  });
  if (chatId === null) {
    updatePendingChatDetails(updater, surfaceId);
    return;
  }
  updateChatDetails(chatId, updater);
}

function rollbackOptimisticUserMessage(
  chatId: string | null,
  userMessageId: string,
  surfaceId: string | null | undefined = null,
) {
  const updater = (details: ChatDetails) => ({
    ...details,
    messages: details.messages.filter(
      (message) => message.id !== userMessageId,
    ),
    waitingForResponse: false,
  });
  if (chatId === null) {
    updatePendingChatDetails(updater, surfaceId);
    return;
  }
  updateChatDetails(chatId, updater);
}
