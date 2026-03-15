import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import type {
  ChatSubmitDispatchResult,
  ChatSubmitOptions,
} from "components/Chat/chatInputSubmission";
import type { ChatHydrationErrorCode } from "state/actions/aiHydration";
import type { ChatAppGenerationContext } from "state/utils/chatAppGenerationDetails";
import { ChatFileAttachment, EngineTypeEnum } from "utils/generatedTypes";
import type { ProjectChatThreadBlockedErrorCode } from "./projectChatHydrationAuthority";

export type ProjectChatBlockedErrorCode =
  | ChatHydrationErrorCode
  | ProjectChatThreadBlockedErrorCode;

export function getDefaultProjectChatPermissionMode(
  engineType: EngineTypeEnum | null,
): ChatPermissionModeValue {
  if (engineType === EngineTypeEnum.external_agent) {
    return "config_toml_custom";
  }
  return "minimal";
}

export function getProjectChatBlockedReasonMessage(
  errorCode: ProjectChatBlockedErrorCode,
): string {
  if (errorCode === "llm_disallowed") {
    return "This deployment no longer allows LLM access for managed chat, so this thread cannot hydrate here.";
  }
  if (errorCode === "chat_not_found") {
    return "This thread was not found during hydration. You can still continue chatting from here.";
  }
  if (errorCode === "chat_provenance_missing") {
    return "This thread is missing provenance metadata. You can continue chatting, but prior hydration may be incomplete.";
  }
  if (errorCode === "chat_runtime_ambiguous") {
    return "This thread matches multiple chat runtimes, so hydration stopped before mixing state. Start a new thread or resolve the duplicate runtime data.";
  }
  if (errorCode === "engine_config_missing") {
    return "This thread's saved engine config is no longer available. You can continue chatting with the currently selected engine.";
  }
  if (errorCode === "engine_type_mismatch") {
    return "This thread's saved engine type no longer matches its provenance. You can continue chatting with the currently selected engine.";
  }
  if (errorCode === "llm_config_missing") {
    return "This thread's saved LLM config is unavailable. You can continue chatting after choosing any valid model.";
  }
  return "This thread hit a terminal hydration error. You can still continue chatting from the current state.";
}

export function resolveProjectChatSubmitAppGeneration({
  activeAppGeneration,
  options,
}: {
  activeAppGeneration: ChatAppGenerationContext | null;
  options?: ChatSubmitOptions;
}): ChatAppGenerationContext | null {
  if (
    !options ||
    !Object.prototype.hasOwnProperty.call(options, "appGeneration")
  ) {
    return activeAppGeneration;
  }
  return options.appGeneration ?? null;
}

export function buildProjectChatSubmitReadinessKey({
  engineConfigId,
  externalEngineAvailable,
  hasLLMConfig,
  isExternalEngine,
  requiresNewThreadContinuation,
}: {
  engineConfigId: string | null;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
  isExternalEngine: boolean;
  requiresNewThreadContinuation: boolean;
}): string {
  return JSON.stringify({
    engineConfigId: engineConfigId?.trim() || null,
    externalEngineAvailable,
    hasLLMConfig,
    isExternalEngine,
    requiresNewThreadContinuation,
  });
}

export function resolveProjectChatSubmitPreflightResult({
  attachments,
  engineConfigId,
  externalEngineAvailable,
  hasLLMConfig,
  isExternalEngine,
  message,
  requiresNewThreadContinuation,
}: {
  attachments: ChatFileAttachment[];
  engineConfigId: string | null;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
  isExternalEngine: boolean;
  message: string;
  requiresNewThreadContinuation: boolean;
}): ChatSubmitDispatchResult | null {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) {
    return "failed";
  }
  if (requiresNewThreadContinuation) {
    return "failed";
  }
  if (!engineConfigId) {
    return "retry_later";
  }
  if (!isExternalEngine && !hasLLMConfig) {
    return "retry_later";
  }
  if (isExternalEngine && !externalEngineAvailable) {
    return "retry_later";
  }
  return null;
}

export function resolveProjectChatProviderDictationTranscribeEnabled({
  providerDictationAvailable,
}: {
  providerDictationAvailable: boolean;
}): boolean {
  return providerDictationAvailable;
}
