import { addTemporaryNotification } from "state/actions/notifications";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import type { ChatAppGenerationContext } from "state/utils/chatAppGenerationDetails";
import { res200 } from "utils/endpointUtils";
import {
  ChatFileAttachment,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { prepareSubmitMessageRequest } from "./aiChatSubmissionPayload";
import { type ChatExecutionSettings } from "./aiChatSubmissionRequestPayload";
import {
  buildChatSubmissionFailureDetail,
  hydrateSubmittedChat,
  sendChatSubmissionRequest,
} from "./aiChatSubmissionResponse";
import {
  applyOptimisticUserMessage,
  rollbackOptimisticUserMessage,
} from "./aiPendingChatMessageState";

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
    const response = await sendChatSubmissionRequest({
      requestPayload,
      projectConfigId,
    });
    if (!res200(response)) {
      throw new Error(
        buildChatSubmissionFailureDetail({
          response,
          failureLabel: "Chat request failed",
        }),
      );
    }
    const returnedChatId = response.data.chatId;
    await hydrateSubmittedChat({
      returnedChatId,
      projectConfigId,
      isExternalEngine,
      sectionId: requestPayload.sectionId ?? undefined,
    });
    return returnedChatId;
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
