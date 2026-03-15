import { getErrorCode, res200 } from "utils/endpointUtils";
import {
  route_get_external_agent_chat,
  route_get_llm_chat,
} from "utils/generatedEndpoints";

export type ChatHydrationOutcomeType =
  | "success"
  | "transient_failure"
  | "terminal_failure";

export type ChatHydrationErrorCode =
  | "llm_disallowed"
  | "chat_not_found"
  | "chat_runtime_ambiguous"
  | "terminal_hydration_failure";

export type ChatHydrationOutcome = {
  outcome: ChatHydrationOutcomeType;
  status: number | undefined;
  errorCode: ChatHydrationErrorCode | null;
};

export type LLMChatHydrationPayload = NonNullable<
  Awaited<ReturnType<typeof route_get_llm_chat>>["data"]
>;

export type ExternalAgentChatHydrationPayload = NonNullable<
  Awaited<ReturnType<typeof route_get_external_agent_chat>>["data"]
>;

export type ChatHydrationProbeResult<TPayload> =
  | {
      outcome: "success";
      status: number | undefined;
      errorCode: null;
      payload: TPayload;
    }
  | {
      outcome: ChatHydrationOutcomeType;
      status: number | undefined;
      errorCode: ChatHydrationErrorCode | null;
      payload: null;
    };

function parseChatHydrationErrorCode(
  value: string | null,
): ChatHydrationErrorCode | null {
  if (value === "llm_disallowed") {
    return "llm_disallowed";
  }
  if (value === "chat_not_found") {
    return "chat_not_found";
  }
  if (value === "chat_runtime_ambiguous") {
    return "chat_runtime_ambiguous";
  }
  return null;
}

function classifyChatHydrationOutcomeType(
  status: number | undefined,
): ChatHydrationOutcomeType {
  if (status === 403 || status === 404 || status === 409) {
    return "terminal_failure";
  }
  return "transient_failure";
}

export function buildChatHydrationFailureOutcome(response: {
  status: number | undefined;
  data: unknown;
}): ChatHydrationOutcome {
  const outcome = classifyChatHydrationOutcomeType(response.status);
  const parsedErrorCode = parseChatHydrationErrorCode(
    getErrorCode(response.data),
  );
  return {
    outcome,
    status: response.status,
    errorCode:
      outcome === "terminal_failure"
        ? parsedErrorCode ??
          (response.status === 403
            ? "llm_disallowed"
            : "terminal_hydration_failure")
        : parsedErrorCode,
  };
}

export async function probeLLMChatHydration(
  chatId: string,
  projectConfigId: string,
): Promise<ChatHydrationProbeResult<LLMChatHydrationPayload>> {
  const response = await route_get_llm_chat({ chatId, projectConfigId });
  if (!res200(response)) {
    return {
      ...buildChatHydrationFailureOutcome(response),
      payload: null,
    };
  }
  return {
    outcome: "success",
    status: response.status,
    errorCode: null,
    payload: response.data,
  };
}

export async function probeExternalAgentChatHydration(
  chatId: string,
  projectConfigId: string | null,
): Promise<ChatHydrationProbeResult<ExternalAgentChatHydrationPayload>> {
  const response = await route_get_external_agent_chat({
    chatId,
    projectConfigId,
  });
  if (!res200(response)) {
    return {
      ...buildChatHydrationFailureOutcome(response),
      payload: null,
    };
  }
  return {
    outcome: "success",
    status: response.status,
    errorCode: null,
    payload: response.data,
  };
}
