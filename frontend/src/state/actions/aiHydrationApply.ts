import { clearAIFollowToolArgumentsForChat } from "state/actions/aiFollow";
import { getCurrProjectConfigId } from "state/actions/sectionEffectiveImplSelectors";
import {
  applyExternalHydratedChatDetails,
  applyLLMHydratedChatDetails,
} from "./aiHydrationChatState";
import {
  type ExternalAgentChatHydrationPayload,
  type LLMChatHydrationPayload,
} from "./aiHydrationOutcome";
import {
  syncExternalHydratedChatToSectionState,
  syncLLMHydratedChatToSectionState,
} from "./aiHydrationSectionState";
import { clearStopEligibleAssistantMessageId } from "./aiStopEligibleAssistantMessages";

function clearHydrationCompletionSideEffects({
  chatId,
  projectConfigId,
}: {
  chatId: string;
  projectConfigId: string | null;
}): void {
  clearStopEligibleAssistantMessageId(chatId);
  clearAIFollowToolArgumentsForChat(
    projectConfigId ?? getCurrProjectConfigId(),
    chatId,
  );
}

export function applyLLMChatHydrationSuccess({
  chatId,
  sectionId,
  projectConfigId,
  payload,
}: {
  chatId: string;
  sectionId?: string;
  projectConfigId: string;
  payload: LLMChatHydrationPayload;
}): void {
  const nextWaitingForResponse = applyLLMHydratedChatDetails({
    chatId,
    payload,
  });
  if (sectionId) {
    syncLLMHydratedChatToSectionState({
      projectConfigId,
      sectionId,
      payload,
    });
  }
  if (!nextWaitingForResponse) {
    clearHydrationCompletionSideEffects({ chatId, projectConfigId });
  }
}

export function applyExternalChatHydrationSuccess({
  chatId,
  projectConfigId,
  sectionId,
  payload,
}: {
  chatId: string;
  projectConfigId: string | null;
  sectionId?: string;
  payload: ExternalAgentChatHydrationPayload;
}): void {
  const nextWaitingForResponse = applyExternalHydratedChatDetails({
    chatId,
    payload,
  });
  if (sectionId) {
    syncExternalHydratedChatToSectionState({
      projectConfigId,
      sectionId,
      payload,
    });
  }
  if (!nextWaitingForResponse) {
    clearHydrationCompletionSideEffects({ chatId, projectConfigId });
  }
}
