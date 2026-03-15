import type { AppGenerationMode } from "state/types/appGenerationMode";
import type { ChatAppGenerationContext } from "state/utils/chatAppGenerationDetails";
import { isImageAttachment } from "utils/attachmentPreview";
import { ChatFileAttachment } from "utils/generatedTypes";
import {
  type ChatSlashCommandAction,
  type ChatSlashCommandDefinition,
  parseSlashCommand,
} from "./chatComposerControls";

const UNKNOWN_SLASH_COMMAND_FEEDBACK =
  "Unknown or unavailable command. Use /help.";

export type ChatSlashCommand = {
  command: string;
  action: ChatSlashCommandAction;
  args: string[];
  rawSuffix?: string;
  promptTemplate?: string;
  appGenerationMode?: AppGenerationMode | null;
  unavailableFeedback?: string;
};

export type ChatSlashCommandResult =
  | boolean
  | {
      appGenerationMode?: AppGenerationMode | null;
      handled?: boolean;
      feedback?: string;
      keepInput?: boolean;
      retryLater?: boolean;
      refreshedSlashCommands?: ChatSlashCommandDefinition[];
      refreshedRecognizedSlashCommands?: ChatSlashCommandDefinition[];
      submitPromptTemplate?: boolean;
    };

export type ChatSubmitOptions = {
  appGeneration?: ChatAppGenerationContext | null;
};

export type ChatSubmitDispatchResult = "submitted" | "retry_later" | "failed";

export type ChatSubmitResult = boolean | ChatSubmitDispatchResult;

export type SlashCommandExecutionOutcome =
  | "submitted"
  | "handled_local"
  | "retry_later"
  | "failed"
  | "not_handled";

export type QueuedDraftReplaySnapshot =
  | {
      kind: "plain_message";
    }
  | {
      kind: "slash_command";
      availabilityPolicy: "fixed" | "current_registry";
      command: ChatSlashCommand;
    };

export type QueuedChatDraft = {
  id: string;
  message: string;
  attachments: ChatFileAttachment[];
  replaySnapshot: QueuedDraftReplaySnapshot;
  queuedAtMs: number;
  replayState: "ready" | "retry_later" | "failed";
  lastAutoReplayVersion: number | null;
};

type ChatInputSubmitHandler = (
  message: string,
  attachments: ChatFileAttachment[],
  options?: ChatSubmitOptions,
) => Promise<ChatSubmitResult> | ChatSubmitResult;

type ChatInputSlashCommandHandler = (
  command: ChatSlashCommand,
) => Promise<ChatSlashCommandResult | void> | ChatSlashCommandResult | void;

type ChatInputUnknownSlashCommandHandler = (
  message: string,
  attachments: ChatFileAttachment[],
) => Promise<ChatSlashCommandResult> | ChatSlashCommandResult;

type ReplaySignatureSlashCommand = {
  action: ChatSlashCommandAction;
  appGenerationMode: AppGenerationMode | null;
  command: string;
  promptTemplate: string | null;
  summary: string;
  unavailableFeedback: string | null;
};

export function resolveSlashCommandRequest({
  message,
  slashCommands,
  recognizedSlashCommands,
}: {
  message: string;
  slashCommands: ChatSlashCommandDefinition[];
  recognizedSlashCommands: ChatSlashCommandDefinition[];
}): {
  parsed: ChatSlashCommand | null;
  commandAvailable: boolean;
} {
  const parsed = parseSlashCommand(message, recognizedSlashCommands);
  if (!parsed) {
    return {
      parsed: null,
      commandAvailable: false,
    };
  }
  return {
    parsed,
    commandAvailable: slashCommands.some(
      (entry) => entry.command === parsed.command,
    ),
  };
}

export function cloneChatAttachments(
  attachments: ChatFileAttachment[],
): ChatFileAttachment[] {
  return attachments.map((attachment) => ({ ...attachment }));
}

export function resolveCustomPromptSlashCommandSubmission({
  promptTemplate,
  args,
  rawSuffix,
  attachments,
}: {
  promptTemplate: string | null | undefined;
  args: string[];
  rawSuffix?: string | null;
  attachments: ChatFileAttachment[];
}): { message: string; attachments: ChatFileAttachment[] } | null {
  const trimmedPromptTemplate = promptTemplate?.trim() ?? "";
  if (!trimmedPromptTemplate) {
    return null;
  }
  const promptArgs = rawSuffix ?? args.join(" ").trim();
  return {
    message: promptArgs
      ? `${trimmedPromptTemplate}\n\n${promptArgs}`
      : trimmedPromptTemplate,
    attachments: cloneChatAttachments(attachments),
  };
}

function buildUnavailableSlashCommandFeedback(
  command: ChatSlashCommand,
): string {
  return (
    command.unavailableFeedback ??
    `${command.command} is unavailable in the current context. Use /help.`
  );
}

function resolveSlashCommandSubmitOptions(
  command: ChatSlashCommand,
): ChatSubmitOptions | undefined {
  if (command.appGenerationMode === undefined) {
    return undefined;
  }
  if (command.appGenerationMode === null) {
    return {
      appGeneration: null,
    };
  }
  return {
    appGeneration: {
      mode: command.appGenerationMode,
    },
  };
}

function requiresImageAttachmentForAppGenerationMode(
  appGenerationMode: AppGenerationMode | null | undefined,
): boolean {
  return appGenerationMode === "json_render_with_image";
}

function hasImageAttachment(attachments: ChatFileAttachment[]): boolean {
  return attachments.some((attachment) => isImageAttachment(attachment));
}

function getSlashCommandImageAttachmentError({
  command,
  appGenerationMode,
  attachments,
  hasRetainedImageAttachmentForImageMode,
}: {
  command: ChatSlashCommand;
  appGenerationMode: AppGenerationMode | null | undefined;
  attachments: ChatFileAttachment[];
  hasRetainedImageAttachmentForImageMode: boolean;
}): string | null {
  if (!requiresImageAttachmentForAppGenerationMode(appGenerationMode)) {
    return null;
  }
  if (
    hasImageAttachment(attachments) ||
    hasRetainedImageAttachmentForImageMode
  ) {
    return null;
  }
  return `Attach at least one image before using ${command.command}.`;
}

function serializeSlashCommandsForReplaySignature(
  commands: ChatSlashCommandDefinition[],
): ReplaySignatureSlashCommand[] {
  return commands.map((command) => ({
    action: command.action,
    appGenerationMode: command.appGenerationMode ?? null,
    command: command.command,
    promptTemplate: command.promptTemplate ?? null,
    summary: command.summary,
    unavailableFeedback: command.unavailableFeedback ?? null,
  }));
}

export function buildQueuedDraftReplayInputsSignature({
  isSubmitDisabled,
  recognizedSlashCommands,
  slashCommands,
  submitReadinessKey,
  waitingForResponse,
}: {
  isSubmitDisabled: boolean;
  recognizedSlashCommands: ChatSlashCommandDefinition[];
  slashCommands: ChatSlashCommandDefinition[];
  submitReadinessKey: string | null;
  waitingForResponse: boolean;
}): string {
  return JSON.stringify({
    isSubmitDisabled,
    recognizedSlashCommands: serializeSlashCommandsForReplaySignature(
      recognizedSlashCommands,
    ),
    slashCommands: serializeSlashCommandsForReplaySignature(slashCommands),
    submitReadinessKey,
    waitingForResponse,
  });
}

function resolveChatSubmitDispatchResult(
  result: ChatSubmitResult,
  fallbackFailureResult: Exclude<ChatSubmitDispatchResult, "submitted">,
): ChatSubmitDispatchResult {
  if (result === true || result === "submitted") {
    return "submitted";
  }
  if (result === "retry_later" || result === "failed") {
    return result;
  }
  return fallbackFailureResult;
}

function cloneSlashCommand(command: ChatSlashCommand): ChatSlashCommand {
  return {
    ...command,
    args: [...command.args],
  };
}

function shouldUseCurrentRegistryForQueuedSlashCommand(
  action: ChatSlashCommandAction,
): boolean {
  return action === "custom_prompt" || action === "native_prompt";
}

export function buildQueuedDraftReplaySnapshot({
  message,
  recognizedSlashCommands,
  slashCommands,
}: {
  message: string;
  recognizedSlashCommands: ChatSlashCommandDefinition[];
  slashCommands: ChatSlashCommandDefinition[];
}): QueuedDraftReplaySnapshot {
  const resolvedRequest = resolveSlashCommandRequest({
    message,
    slashCommands,
    recognizedSlashCommands,
  });
  if (!resolvedRequest.parsed) {
    return { kind: "plain_message" };
  }
  return {
    kind: "slash_command",
    availabilityPolicy: shouldUseCurrentRegistryForQueuedSlashCommand(
      resolvedRequest.parsed.action,
    )
      ? "current_registry"
      : "fixed",
    command: cloneSlashCommand(resolvedRequest.parsed),
  };
}

export function shouldAutoReplayQueuedDraft(
  draft: QueuedChatDraft,
  queuedAutoReplayVersion: number,
): boolean {
  return (
    draft.replayState !== "failed" &&
    draft.lastAutoReplayVersion !== queuedAutoReplayVersion
  );
}

export function shouldRemoveQueuedDraft(
  outcome: SlashCommandExecutionOutcome,
): boolean {
  return outcome === "submitted" || outcome === "handled_local";
}

export function enqueueQueuedDraft(
  queue: QueuedChatDraft[],
  draft: QueuedChatDraft,
  prioritize: boolean,
): QueuedChatDraft[] {
  return prioritize ? [draft, ...queue] : [...queue, draft];
}

export function cycleQueuedDraftSelection(
  queue: QueuedChatDraft[],
  selectedId: string | null,
  direction: "next" | "prev",
): string | null {
  if (queue.length === 0) {
    return null;
  }
  const currentIndex = queue.findIndex((item) => item.id === selectedId);
  if (currentIndex < 0) {
    return queue[0]?.id ?? null;
  }
  if (direction === "next") {
    const nextIndex = (currentIndex + 1) % queue.length;
    return queue[nextIndex]?.id ?? null;
  }
  const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
  return queue[prevIndex]?.id ?? null;
}

export function cycleSubmittedMessageHistorySelection(
  history: string[],
  selectedIndex: number | null,
  direction: "next" | "prev",
): number | null {
  if (history.length === 0) {
    return null;
  }
  if (
    selectedIndex === null ||
    selectedIndex < 0 ||
    selectedIndex >= history.length
  ) {
    return 0;
  }
  if (direction === "next") {
    return (selectedIndex + 1) % history.length;
  }
  return (selectedIndex - 1 + history.length) % history.length;
}

type ExecuteResolvedChatSlashCommandArgs = {
  message: string;
  submittedAttachments: ChatFileAttachment[];
  parsed: ChatSlashCommand;
  commandAvailable: boolean;
  hasRetainedImageAttachmentForImageMode: boolean;
  onSubmit: ChatInputSubmitHandler;
  onSlashCommand?: ChatInputSlashCommandHandler;
  setSlashFeedback: (feedback: string) => void;
  resetComposer: () => void;
};

export async function executeResolvedChatSlashCommand({
  message,
  submittedAttachments,
  parsed,
  commandAvailable,
  hasRetainedImageAttachmentForImageMode,
  onSubmit,
  onSlashCommand,
  setSlashFeedback,
  resetComposer,
}: ExecuteResolvedChatSlashCommandArgs): Promise<SlashCommandExecutionOutcome> {
  if (!commandAvailable) {
    setSlashFeedback(buildUnavailableSlashCommandFeedback(parsed));
    return "retry_later";
  }
  if (parsed.action === "custom_prompt") {
    const submission = resolveCustomPromptSlashCommandSubmission({
      promptTemplate: parsed.promptTemplate,
      args: parsed.args,
      ...(parsed.rawSuffix === undefined
        ? {}
        : { rawSuffix: parsed.rawSuffix }),
      attachments: submittedAttachments,
    });
    if (!submission) {
      setSlashFeedback("Custom slash command has no prompt content.");
      return "retry_later";
    }
    const imageAttachmentError = getSlashCommandImageAttachmentError({
      command: parsed,
      appGenerationMode: parsed.appGenerationMode,
      attachments: submission.attachments,
      hasRetainedImageAttachmentForImageMode,
    });
    if (imageAttachmentError) {
      setSlashFeedback(imageAttachmentError);
      return "failed";
    }
    const submitted = resolveChatSubmitDispatchResult(
      await onSubmit(
        submission.message,
        submission.attachments,
        resolveSlashCommandSubmitOptions(parsed),
      ),
      "retry_later",
    );
    if (submitted !== "submitted") {
      setSlashFeedback(`Failed to submit ${parsed.command}.`);
      return submitted;
    }
    setSlashFeedback(`Submitted ${parsed.command}`);
    resetComposer();
    return "submitted";
  }
  if (parsed.action === "native_prompt") {
    const submitted = resolveChatSubmitDispatchResult(
      await onSubmit(
        message,
        submittedAttachments,
        resolveSlashCommandSubmitOptions(parsed),
      ),
      "retry_later",
    );
    if (submitted !== "submitted") {
      setSlashFeedback(`Failed to submit ${parsed.command}.`);
      return submitted;
    }
    setSlashFeedback(`Submitted ${parsed.command}`);
    resetComposer();
    return "submitted";
  }
  if (!onSlashCommand) {
    setSlashFeedback(UNKNOWN_SLASH_COMMAND_FEEDBACK);
    return "handled_local";
  }
  const result = await onSlashCommand(parsed);
  if (result === false) {
    setSlashFeedback(UNKNOWN_SLASH_COMMAND_FEEDBACK);
    return "retry_later";
  }
  const slashResult = result && typeof result === "object" ? result : undefined;
  if (slashResult?.handled === false) {
    setSlashFeedback(UNKNOWN_SLASH_COMMAND_FEEDBACK);
    return "retry_later";
  }
  if (slashResult?.submitPromptTemplate) {
    const submission = resolveCustomPromptSlashCommandSubmission({
      promptTemplate: parsed.promptTemplate,
      args: parsed.args,
      ...(parsed.rawSuffix === undefined
        ? {}
        : { rawSuffix: parsed.rawSuffix }),
      attachments: submittedAttachments,
    });
    if (!submission || !slashResult.appGenerationMode) {
      setSlashFeedback("Built-in slash command has no prompt content.");
      return "retry_later";
    }
    const imageAttachmentError = getSlashCommandImageAttachmentError({
      command: parsed,
      appGenerationMode: slashResult.appGenerationMode,
      attachments: submission.attachments,
      hasRetainedImageAttachmentForImageMode,
    });
    if (imageAttachmentError) {
      setSlashFeedback(imageAttachmentError);
      return "failed";
    }
    const submitted = resolveChatSubmitDispatchResult(
      await onSubmit(submission.message, submission.attachments, {
        appGeneration: {
          mode: slashResult.appGenerationMode,
        },
      }),
      "retry_later",
    );
    if (submitted !== "submitted") {
      setSlashFeedback(`Failed to submit ${parsed.command}.`);
      return submitted;
    }
    setSlashFeedback(slashResult.feedback ?? `Submitted ${parsed.command}.`);
    resetComposer();
    return "submitted";
  }
  setSlashFeedback(slashResult?.feedback ?? `Ran ${parsed.command}`);
  if (!slashResult?.keepInput) {
    resetComposer();
  }
  return slashResult?.retryLater === true ? "retry_later" : "handled_local";
}

type RunChatSlashCommandArgs = {
  message: string;
  submittedAttachments: ChatFileAttachment[];
  slashCommands: ChatSlashCommandDefinition[];
  recognizedSlashCommands: ChatSlashCommandDefinition[];
  onUnknownSlashCommand?: ChatInputUnknownSlashCommandHandler;
  executeResolvedSlashCommand: (
    args: Omit<
      ExecuteResolvedChatSlashCommandArgs,
      | "hasRetainedImageAttachmentForImageMode"
      | "onSubmit"
      | "onSlashCommand"
      | "setSlashFeedback"
      | "resetComposer"
    >,
  ) => Promise<SlashCommandExecutionOutcome>;
  setSlashFeedback: (feedback: string) => void;
  resetComposer: () => void;
};

export async function runChatSlashCommand({
  message,
  submittedAttachments,
  slashCommands,
  recognizedSlashCommands,
  onUnknownSlashCommand,
  executeResolvedSlashCommand,
  setSlashFeedback,
  resetComposer,
}: RunChatSlashCommandArgs): Promise<SlashCommandExecutionOutcome> {
  const resolvedRequest = resolveSlashCommandRequest({
    message,
    slashCommands,
    recognizedSlashCommands,
  });
  if (resolvedRequest.parsed) {
    return executeResolvedSlashCommand({
      message,
      submittedAttachments,
      parsed: resolvedRequest.parsed,
      commandAvailable: resolvedRequest.commandAvailable,
    });
  }
  if (!message.trimStart().startsWith("/") || !onUnknownSlashCommand) {
    return "not_handled";
  }
  const result = await onUnknownSlashCommand(message, submittedAttachments);
  if (result === false) {
    return "not_handled";
  }
  const slashResult = result && typeof result === "object" ? result : undefined;
  if (slashResult?.handled === false) {
    return "not_handled";
  }
  const refreshedSlashCommands = slashResult?.refreshedSlashCommands ?? null;
  const refreshedRecognizedSlashCommands =
    slashResult?.refreshedRecognizedSlashCommands ?? null;
  if (refreshedSlashCommands && refreshedRecognizedSlashCommands) {
    const refreshedRequest = resolveSlashCommandRequest({
      message,
      slashCommands: refreshedSlashCommands,
      recognizedSlashCommands: refreshedRecognizedSlashCommands,
    });
    if (refreshedRequest.parsed) {
      return executeResolvedSlashCommand({
        message,
        submittedAttachments,
        parsed: refreshedRequest.parsed,
        commandAvailable: refreshedRequest.commandAvailable,
      });
    }
  }
  setSlashFeedback(slashResult?.feedback ?? UNKNOWN_SLASH_COMMAND_FEEDBACK);
  if (slashResult?.keepInput === false) {
    resetComposer();
  }
  return slashResult?.retryLater === true ? "retry_later" : "handled_local";
}

type SubmitChatInputMessageArgs = {
  waitingForResponse: boolean;
  isSubmitDisabled: boolean;
  submittedValue: string;
  submittedAttachments: ChatFileAttachment[];
  onStop?: () => Promise<void> | void;
  enqueueDraft: (args: {
    message: string;
    draftAttachments: ChatFileAttachment[];
    prioritize: boolean;
    interruptCurrentRun: boolean;
    feedback: string;
  }) => boolean;
  runSlashCommand: (
    message: string,
    submittedAttachments: ChatFileAttachment[],
  ) => Promise<SlashCommandExecutionOutcome>;
  onSubmit: ChatInputSubmitHandler;
  resetComposer: () => void;
};

export async function submitChatInputMessage({
  waitingForResponse,
  isSubmitDisabled,
  submittedValue,
  submittedAttachments,
  onStop,
  enqueueDraft,
  runSlashCommand,
  onSubmit,
  resetComposer,
}: SubmitChatInputMessageArgs): Promise<SlashCommandExecutionOutcome> {
  if (waitingForResponse) {
    const queued = enqueueDraft({
      message: submittedValue,
      draftAttachments: submittedAttachments,
      prioritize: true,
      interruptCurrentRun: true,
      feedback: "Queued and stopping current response...",
    });
    if (queued) {
      return "handled_local";
    }
    if (onStop) {
      await onStop();
    }
    return "failed";
  }
  if (isSubmitDisabled) {
    return "failed";
  }
  const slashOutcome = await runSlashCommand(
    submittedValue,
    submittedAttachments,
  );
  if (slashOutcome !== "not_handled") {
    return slashOutcome;
  }
  const trimmedInput = submittedValue.trim();
  if (trimmedInput.length === 0 && submittedAttachments.length === 0) {
    return "failed";
  }
  const result = await onSubmit(submittedValue, submittedAttachments);
  const submitOutcome = resolveChatSubmitDispatchResult(result, "failed");
  if (submitOutcome === "submitted") {
    resetComposer();
    return "submitted";
  }
  return submitOutcome;
}

type ReplayQueuedChatDraftArgs = {
  draft: QueuedChatDraft;
  slashCommands: ChatSlashCommandDefinition[];
  submitMessage: (
    submittedValue: string,
    submittedAttachments: ChatFileAttachment[],
  ) => Promise<SlashCommandExecutionOutcome>;
  executeResolvedSlashCommand: (
    args: Omit<
      ExecuteResolvedChatSlashCommandArgs,
      | "hasRetainedImageAttachmentForImageMode"
      | "onSubmit"
      | "onSlashCommand"
      | "setSlashFeedback"
      | "resetComposer"
    >,
  ) => Promise<SlashCommandExecutionOutcome>;
};

export async function replayQueuedChatDraft({
  draft,
  slashCommands,
  submitMessage,
  executeResolvedSlashCommand,
}: ReplayQueuedChatDraftArgs): Promise<SlashCommandExecutionOutcome> {
  if (draft.replaySnapshot.kind === "plain_message") {
    return submitMessage(draft.message, draft.attachments);
  }
  const commandAvailable =
    draft.replaySnapshot.availabilityPolicy === "fixed"
      ? true
      : slashCommands.some(
          (entry) => entry.command === draft.replaySnapshot.command.command,
        );
  return executeResolvedSlashCommand({
    message: draft.message,
    submittedAttachments: draft.attachments,
    parsed: draft.replaySnapshot.command,
    commandAvailable,
  });
}
