import { ChatFileAttachment } from "utils/generatedTypes";
import {
  type ChatSlashCommand,
  type ChatSlashCommandResult,
  type ChatSubmitDispatchResult,
  type ChatSubmitOptions,
  type SlashCommandExecutionOutcome,
  cloneAttachments,
  getSlashCommandImageAttachmentError,
  resolveCustomPromptSlashCommandSubmission,
  resolveSlashCommandRequest,
  resolveSlashCommandSubmitOptions,
} from "../chatInputHelpers";

import {
  type NormalizedSlashCommandResult,
  type SubmitRemotelyHandler,
  UNKNOWN_SLASH_COMMAND_FEEDBACK,
} from "./shared";

export function resolveParsedSlashCommandSubmission(args: {
  parsed: ChatSlashCommand;
  submittedAttachments: ChatFileAttachment[];
}): { message: string; attachments: ChatFileAttachment[] } | null {
  const { parsed, submittedAttachments } = args;
  return resolveCustomPromptSlashCommandSubmission({
    promptTemplate: parsed.promptTemplate,
    args: parsed.args,
    ...(parsed.rawSuffix === undefined ? {} : { rawSuffix: parsed.rawSuffix }),
    attachments: submittedAttachments,
  });
}

export function normalizeSlashCommandResult(
  result: ChatSlashCommandResult | void,
): NormalizedSlashCommandResult | undefined {
  return result && typeof result === "object" ? result : undefined;
}

export function shouldRetryRegisteredSlashCommand(args: {
  result: ChatSlashCommandResult | void;
  slashResult: NormalizedSlashCommandResult | undefined;
}): boolean {
  const { result, slashResult } = args;
  return result === false || slashResult?.handled === false;
}

export function finalizeLocalSlashCommandResult(args: {
  clearAttachments: () => void;
  clearInput: () => void;
  resetEscClearedDraft: () => void;
  setSlashFeedback: (value: string) => void;
  parsed: ChatSlashCommand;
  slashResult: NormalizedSlashCommandResult | undefined;
}): SlashCommandExecutionOutcome {
  const {
    clearAttachments,
    clearInput,
    resetEscClearedDraft,
    setSlashFeedback,
    parsed,
    slashResult,
  } = args;
  setSlashFeedback(slashResult?.feedback ?? `Ran ${parsed.command}`);
  if (!slashResult?.keepInput) {
    resetEscClearedDraft();
    clearInput();
    clearAttachments();
  }
  return slashResult?.retryLater === true ? "retry_later" : "handled_local";
}

export function shouldIgnoreUnknownSlashCommandResult(args: {
  result: ChatSlashCommandResult;
  slashResult: NormalizedSlashCommandResult | undefined;
}): boolean {
  const { result, slashResult } = args;
  return result === false || slashResult?.handled === false;
}

export function finalizeUnknownSlashCommandResult(args: {
  clearAttachments: () => void;
  clearInput: () => void;
  resetEscClearedDraft: () => void;
  setSlashFeedback: (value: string) => void;
  slashResult: NormalizedSlashCommandResult | undefined;
}): SlashCommandExecutionOutcome {
  const {
    clearAttachments,
    clearInput,
    resetEscClearedDraft,
    setSlashFeedback,
    slashResult,
  } = args;
  setSlashFeedback(slashResult?.feedback ?? UNKNOWN_SLASH_COMMAND_FEEDBACK);
  if (slashResult?.keepInput === false) {
    resetEscClearedDraft();
    clearInput();
    clearAttachments();
  }
  return slashResult?.retryLater === true ? "retry_later" : "handled_local";
}

export async function submitPromptTemplateSlashCommand(args: {
  fallbackFailureResult: Exclude<ChatSubmitDispatchResult, "submitted">;
  failureFeedback: string;
  hasRetainedImageAttachmentForImageMode: boolean;
  message: string;
  missingPromptFeedback: string;
  options?: ChatSubmitOptions;
  parsed: ChatSlashCommand;
  requireOptions?: boolean;
  setSlashFeedback: (value: string) => void;
  submitRemotely: SubmitRemotelyHandler;
  submittedAttachments: ChatFileAttachment[];
  successFeedback: string;
}): Promise<SlashCommandExecutionOutcome> {
  const {
    fallbackFailureResult,
    failureFeedback,
    hasRetainedImageAttachmentForImageMode,
    message,
    missingPromptFeedback,
    options,
    parsed,
    requireOptions = false,
    setSlashFeedback,
    submitRemotely,
    submittedAttachments,
    successFeedback,
  } = args;
  const submission = resolveParsedSlashCommandSubmission({
    parsed,
    submittedAttachments,
  });
  if (!submission || (requireOptions && options === undefined)) {
    setSlashFeedback(missingPromptFeedback);
    return "retry_later";
  }
  const imageAttachmentError = getSlashCommandImageAttachmentError({
    command: parsed,
    appGenerationMode: options?.appGeneration?.mode,
    attachments: submission.attachments,
    hasRetainedImageAttachmentForImageMode,
  });
  if (imageAttachmentError) {
    setSlashFeedback(imageAttachmentError);
    return "failed";
  }
  const submitted = await submitRemotely({
    draftToRestore: {
      message,
      attachments: cloneAttachments(submittedAttachments),
    },
    message: submission.message,
    submittedAttachments: submission.attachments,
    options,
    fallbackFailureResult,
  });
  if (submitted !== "submitted") {
    setSlashFeedback(failureFeedback);
    return submitted;
  }
  setSlashFeedback(successFeedback);
  return "submitted";
}

export async function submitNativeSlashCommand(args: {
  failureFeedback: string;
  message: string;
  parsed: ChatSlashCommand;
  setSlashFeedback: (value: string) => void;
  submitRemotely: SubmitRemotelyHandler;
  submittedAttachments: ChatFileAttachment[];
  successFeedback: string;
}): Promise<SlashCommandExecutionOutcome> {
  const {
    failureFeedback,
    message,
    parsed,
    setSlashFeedback,
    submitRemotely,
    submittedAttachments,
    successFeedback,
  } = args;
  const submitted = await submitRemotely({
    message,
    submittedAttachments,
    options: resolveSlashCommandSubmitOptions(parsed),
    fallbackFailureResult: "retry_later",
  });
  if (submitted !== "submitted") {
    setSlashFeedback(failureFeedback);
    return submitted;
  }
  setSlashFeedback(successFeedback);
  return "submitted";
}

export async function executeRegisteredSlashCommand(args: {
  clearAttachments: () => void;
  clearInput: () => void;
  hasRetainedImageAttachmentForImageMode: boolean;
  message: string;
  onSlashCommand?: (
    command: ChatSlashCommand,
  ) => Promise<ChatSlashCommandResult | void> | ChatSlashCommandResult | void;
  parsed: ChatSlashCommand;
  resetEscClearedDraft: () => void;
  setSlashFeedback: (value: string) => void;
  submitRemotely: SubmitRemotelyHandler;
  submittedAttachments: ChatFileAttachment[];
}): Promise<SlashCommandExecutionOutcome> {
  const {
    clearAttachments,
    clearInput,
    hasRetainedImageAttachmentForImageMode,
    message,
    onSlashCommand,
    parsed,
    resetEscClearedDraft,
    setSlashFeedback,
    submitRemotely,
    submittedAttachments,
  } = args;
  if (!onSlashCommand) {
    setSlashFeedback(UNKNOWN_SLASH_COMMAND_FEEDBACK);
    return "handled_local";
  }
  const result = await onSlashCommand(parsed);
  const slashResult = normalizeSlashCommandResult(result);
  if (
    shouldRetryRegisteredSlashCommand({
      result,
      slashResult,
    })
  ) {
    setSlashFeedback(UNKNOWN_SLASH_COMMAND_FEEDBACK);
    return "retry_later";
  }
  if (slashResult?.submitPromptTemplate) {
    return submitPromptTemplateSlashCommand({
      fallbackFailureResult: "retry_later",
      failureFeedback: `Failed to submit ${parsed.command}.`,
      hasRetainedImageAttachmentForImageMode,
      message,
      missingPromptFeedback: "Built-in slash command has no prompt content.",
      options: slashResult.appGenerationMode
        ? {
            appGeneration: {
              mode: slashResult.appGenerationMode,
            },
          }
        : undefined,
      parsed,
      requireOptions: true,
      setSlashFeedback,
      submitRemotely,
      submittedAttachments,
      successFeedback: slashResult.feedback ?? `Submitted ${parsed.command}.`,
    });
  }
  return finalizeLocalSlashCommandResult({
    clearAttachments,
    clearInput,
    resetEscClearedDraft,
    setSlashFeedback,
    parsed,
    slashResult,
  });
}

export function resolveRefreshedSlashCommandRequest(args: {
  message: string;
  slashResult: NormalizedSlashCommandResult | undefined;
}): { parsed: ChatSlashCommand; commandAvailable: boolean } | null {
  const { message, slashResult } = args;
  const refreshedSlashCommands = slashResult?.refreshedSlashCommands ?? null;
  const refreshedRecognizedSlashCommands =
    slashResult?.refreshedRecognizedSlashCommands ?? null;
  if (!refreshedSlashCommands || !refreshedRecognizedSlashCommands) {
    return null;
  }
  const refreshedRequest = resolveSlashCommandRequest({
    message,
    slashCommands: refreshedSlashCommands,
    recognizedSlashCommands: refreshedRecognizedSlashCommands,
  });
  if (!refreshedRequest.parsed) {
    return null;
  }
  return refreshedRequest;
}

export async function handleUnknownSlashCommand(args: {
  clearAttachments: () => void;
  clearInput: () => void;
  executeResolvedSlashCommand: (args: {
    message: string;
    submittedAttachments: ChatFileAttachment[];
    parsed: ChatSlashCommand;
    commandAvailable: boolean;
  }) => Promise<SlashCommandExecutionOutcome>;
  message: string;
  onUnknownSlashCommand?: (
    message: string,
    attachments: ChatFileAttachment[],
  ) => Promise<ChatSlashCommandResult> | ChatSlashCommandResult;
  resetEscClearedDraft: () => void;
  setSlashFeedback: (value: string) => void;
  submittedAttachments: ChatFileAttachment[];
}): Promise<SlashCommandExecutionOutcome> {
  const {
    clearAttachments,
    clearInput,
    executeResolvedSlashCommand,
    message,
    onUnknownSlashCommand,
    resetEscClearedDraft,
    setSlashFeedback,
    submittedAttachments,
  } = args;
  if (!message.trimStart().startsWith("/") || !onUnknownSlashCommand) {
    return "not_handled";
  }
  const result = await onUnknownSlashCommand(message, submittedAttachments);
  const slashResult = normalizeSlashCommandResult(result);
  if (
    shouldIgnoreUnknownSlashCommandResult({
      result,
      slashResult,
    })
  ) {
    return "not_handled";
  }
  const refreshedRequest = resolveRefreshedSlashCommandRequest({
    message,
    slashResult,
  });
  if (refreshedRequest?.parsed) {
    return executeResolvedSlashCommand({
      message,
      submittedAttachments,
      parsed: refreshedRequest.parsed,
      commandAvailable: refreshedRequest.commandAvailable,
    });
  }
  return finalizeUnknownSlashCommandResult({
    clearAttachments,
    clearInput,
    resetEscClearedDraft,
    setSlashFeedback,
    slashResult,
  });
}
