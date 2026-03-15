import { getCurrProjectConfigId } from "state/actions/sectionEffectiveImplSelectors";
import {
  applyExternalChatHydrationSuccess,
  applyLLMChatHydrationSuccess,
} from "./aiHydrationApply";
import {
  type ChatHydrationOutcome,
  type ChatHydrationProbeResult,
  type ExternalAgentChatHydrationPayload,
  type LLMChatHydrationPayload,
  probeExternalAgentChatHydration,
  probeLLMChatHydration,
} from "./aiHydrationOutcome";

export type {
  ChatHydrationErrorCode,
  ChatHydrationOutcome,
  ChatHydrationOutcomeType,
} from "./aiHydrationOutcome";

function toPublicHydrationOutcome<TPayload>(
  outcome: ChatHydrationProbeResult<TPayload>,
): ChatHydrationOutcome {
  return {
    outcome: outcome.outcome,
    status: outcome.status,
    errorCode: outcome.errorCode,
  };
}

export async function getLLMChatHydrationOutcome(
  chatId: string,
  sectionId?: string,
): Promise<ChatHydrationOutcome> {
  const projectConfigId = getCurrProjectConfigId();
  const outcome = await probeLLMChatHydration(chatId, projectConfigId);
  if (outcome.outcome === "success") {
    applyLLMChatHydrationSuccess({
      chatId,
      sectionId,
      projectConfigId,
      payload: outcome.payload,
    });
    return toPublicHydrationOutcome<LLMChatHydrationPayload>(outcome);
  }
  return toPublicHydrationOutcome<LLMChatHydrationPayload>(outcome);
}

export async function getLLMChat(
  chatId: string,
  sectionId?: string,
): Promise<boolean> {
  const outcome = await getLLMChatHydrationOutcome(chatId, sectionId);
  return outcome.outcome === "success";
}

export async function getExternalAgentChatHydrationOutcome(
  chatId: string,
  projectConfigId: string | null,
  sectionId?: string,
): Promise<ChatHydrationOutcome> {
  const outcome = await probeExternalAgentChatHydration(
    chatId,
    projectConfigId,
  );
  if (outcome.outcome === "success") {
    applyExternalChatHydrationSuccess({
      chatId,
      projectConfigId,
      sectionId,
      payload: outcome.payload,
    });
    return toPublicHydrationOutcome<ExternalAgentChatHydrationPayload>(outcome);
  }
  return toPublicHydrationOutcome<ExternalAgentChatHydrationPayload>(outcome);
}

export async function getExternalAgentChat(
  chatId: string,
  projectConfigId: string | null,
  sectionId?: string,
): Promise<boolean> {
  const outcome = await getExternalAgentChatHydrationOutcome(
    chatId,
    projectConfigId,
    sectionId,
  );
  return outcome.outcome === "success";
}
