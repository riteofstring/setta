import { addTemporaryNotification } from "state/actions/notifications";
import { dispatchOptimisticProjectStateUpdate } from "state/actions/projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import type { ChatAppGenerationContext } from "state/utils/chatAppGenerationDetails";
import { res200 } from "utils/endpointUtils";
import { route_set_chat_section_chat_id } from "utils/generatedEndpoints";
import {
  BaseChatMessageUnion,
  ChatFileAttachment,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { prepareEditedMessageRequest } from "./aiChatSubmissionPayload";
import { type ChatExecutionSettings } from "./aiChatSubmissionRequestPayload";
import {
  buildChatSubmissionFailureDetail,
  hydrateSubmittedChat,
  sendChatSubmissionRequest,
} from "./aiChatSubmissionResponse";
import {
  clearPendingChatDetails,
  commitPendingChatDetails,
  initializePendingChatDetailsWithMessages,
} from "./aiPendingChatMessageLifecycle";
import { setCurrEffectiveSectionImplValue } from "./sectionEffectiveImplMutations";

async function setEditedSectionChatId({
  sectionId,
  projectConfigId,
  chatId,
}: {
  sectionId: string | null | undefined;
  projectConfigId: string;
  chatId: string | null;
}): Promise<void> {
  if (!sectionId) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
        chatId,
      });
    },
    send: () =>
      route_set_chat_section_chat_id({
        projectConfigId,
        sectionId,
        chatId,
      }),
  });
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
  } = preparedRequest;
  initializePendingChatDetailsWithMessages(
    nextMessages,
    true,
    resolvedPendingSurfaceId,
    nextAppGenerationDetails,
  );
  const projectConfigId = getCurrProjectConfigId();
  await setEditedSectionChatId({
    sectionId,
    projectConfigId,
    chatId: null,
  });

  try {
    const response = await sendChatSubmissionRequest({
      requestPayload,
      projectConfigId,
    });
    if (!res200(response)) {
      addTemporaryNotification(
        buildChatSubmissionFailureDetail({
          response,
          failureLabel: "AI request failed",
        }),
        SettaNotificationTypeEnum.warning,
      );
      clearPendingChatDetails(resolvedPendingSurfaceId);
      await setEditedSectionChatId({
        sectionId,
        projectConfigId,
        chatId: parentChatId,
      });
      return null;
    }
    const returnedChatId = response.data.chatId;
    await hydrateSubmittedChat({
      returnedChatId,
      projectConfigId,
      isExternalEngine,
      sectionId: requestPayload.sectionId ?? undefined,
    });
    if (returnedChatId) {
      await setEditedSectionChatId({
        sectionId,
        projectConfigId,
        chatId: returnedChatId,
      });
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
    await setEditedSectionChatId({
      sectionId,
      projectConfigId,
      chatId: parentChatId,
    });
    throw err;
  }
}
