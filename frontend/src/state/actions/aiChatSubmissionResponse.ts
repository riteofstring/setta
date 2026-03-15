import { waitForFrontendAffinityToken } from "state/actions/frontendWebsocketAffinity";
import { getErrorDetail } from "utils/endpointUtils";
import { route_get_llm_response } from "utils/generatedEndpoints";
import { refreshAgentRunsAfterSubmit } from "./aiAgentRuns";
import type {
  EditedMessageRequestPayload,
  SubmitMessageRequestPayload,
} from "./aiChatSubmissionRequestPayload";
import { getExternalAgentChat, getLLMChat } from "./aiHydration";

export type ChatSubmissionRequestPayload =
  | SubmitMessageRequestPayload
  | EditedMessageRequestPayload;

export async function sendChatSubmissionRequest({
  requestPayload,
  projectConfigId,
}: {
  requestPayload: ChatSubmissionRequestPayload;
  projectConfigId: string;
}) {
  const frontendAffinityToken = await waitForFrontendAffinityToken();
  return route_get_llm_response({
    ...requestPayload,
    projectConfigId,
    frontendAffinityToken,
  });
}

export function buildChatSubmissionFailureDetail({
  response,
  failureLabel,
}: {
  response: Awaited<ReturnType<typeof route_get_llm_response>>;
  failureLabel: string;
}): string {
  return (
    getErrorDetail(response.data) ??
    (typeof response.status === "number"
      ? `${failureLabel} (status ${response.status}).`
      : `${failureLabel}.`)
  );
}

export async function hydrateSubmittedChat({
  returnedChatId,
  projectConfigId,
  isExternalEngine,
  sectionId,
}: {
  returnedChatId: string | null;
  projectConfigId: string;
  isExternalEngine: boolean;
  sectionId: string | undefined;
}): Promise<void> {
  if (!returnedChatId) {
    return;
  }
  refreshAgentRunsAfterSubmit();
  if (isExternalEngine) {
    await getExternalAgentChat(returnedChatId, projectConfigId, sectionId);
    return;
  }
  await getLLMChat(returnedChatId, sectionId);
}
