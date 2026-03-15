import { waitForFrontendAffinityToken } from "state/actions/frontendWebsocketAffinity";
import { addTemporaryNotification } from "state/actions/notifications";
import { dispatchOptimisticProjectStateUpdate } from "state/actions/projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import type { ChatAppGenerationContext } from "state/utils/chatAppGeneration";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_llm_response,
  route_set_chat_section_chat_id,
} from "utils/generatedEndpoints";
import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { refreshAgentRunsAfterSubmit } from "./aiAgentRuns";
import {
  prepareEditedMessageRequest,
  prepareSubmitMessageRequest,
  type ChatExecutionSettings,
  type PreparedEditedMessageRequest,
} from "./aiChatSubmissionPayload";
import { getExternalAgentChat, getLLMChat } from "./aiHydration";
import {
  applyOptimisticUserMessage,
  clearPendingChatDetails,
  commitPendingChatDetails,
  finalizePendingChatDetails,
  initializePendingChatDetails,
  initializePendingChatDetailsWithMessages,
  rollbackOptimisticUserMessage,
  seedPendingChatDetails,
} from "./aiPendingChatMessageState";
import { setCurrEffectiveSectionImplValue } from "./sectionEffectiveImplMutations";

export {
  clearPendingChatDetails,
  finalizePendingChatDetails,
  initializePendingChatDetails,
  seedPendingChatDetails,
};

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
  const preparedRequest = prepareSubmitMessageRequest({
    chatId,
    message,
    attachments,
    thinking,
    engineConfigId,
    options,
  });
  if (!preparedRequest) {
    return null;
  }
  const {
    requestPayload,
    resolvedPendingSurfaceId,
    userMessageId,
    appGeneration,
  } = preparedRequest;

  applyOptimisticUserMessage(
    chatId,
    requestPayload.message,
    resolvedPendingSurfaceId,
    appGeneration,
  );

  try {
    const projectConfigId = getCurrProjectConfigId();
    const frontendAffinityToken = await waitForFrontendAffinityToken();
    const res = await route_get_llm_response({
      ...requestPayload,
      projectConfigId,
      frontendAffinityToken,
    });
    if (res200(res)) {
      const returnedChatId = res.data.chatId;
      if (returnedChatId) {
        refreshAgentRunsAfterSubmit();
        if (isExternalEngine) {
          await getExternalAgentChat(
            returnedChatId,
            projectConfigId,
            requestPayload.sectionId ?? undefined,
          );
        } else {
          await getLLMChat(
            returnedChatId,
            requestPayload.sectionId ?? undefined,
          );
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
  appGeneration,
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
  appGeneration?: ChatAppGenerationContext | null;
}): Promise<string | null> {
  const preparedRequest = await prepareEditedMessageRequest({
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
  });
  if (!preparedRequest) {
    return null;
  }
  const {
    requestPayload,
    resolvedPendingSurfaceId,
    nextMessages,
    nextAppGenerationDetails,
  }: PreparedEditedMessageRequest = preparedRequest;
  initializePendingChatDetailsWithMessages(
    nextMessages,
    true,
    resolvedPendingSurfaceId,
    nextAppGenerationDetails,
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
      ...requestPayload,
      projectConfigId,
      frontendAffinityToken,
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
    const returnedChatId = res.data.chatId;
    if (returnedChatId) {
      refreshAgentRunsAfterSubmit();
      if (isExternalEngine) {
        await getExternalAgentChat(
          returnedChatId,
          projectConfigId,
          requestPayload.sectionId ?? undefined,
        );
      } else {
        await getLLMChat(returnedChatId, requestPayload.sectionId ?? undefined);
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
