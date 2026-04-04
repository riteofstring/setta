import type { CSSProperties } from "react";
import type { AppGenerationMode } from "state/types/appGenerationMode";
import type { ChatAppGenerationContext } from "state/utils/chatAppGeneration";
import { isImageAttachment } from "utils/attachmentPreview";
import {
  ChatFileAttachment,
  GeneratedAppGenerationModeEnum,
} from "utils/generatedTypes";
import {
  type ChatPermissionModeValue,
  type ChatSlashCommandAction,
  type ChatSlashCommandDefinition,
  parseSlashCommand,
} from "./chatComposerControls";

const SLASH_SUGGESTIONS_PORTAL_STYLE_KEYS = [
  "left",
  "width",
  "maxHeight",
  "top",
  "bottom",
] as const;

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

type StopEscapeKeyEventLike = {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
};

type RestoreClearedDraftKeyEventLike = {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
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

type QueuedDraftReplaySnapshot =
  | {
      kind: "plain_message";
    }
  | {
      kind: "slash_command";
      availabilityPolicy: "fixed" | "current_registry";
      command: ChatSlashCommand;
    };

export function areSlashSuggestionsPortalStylesEqual(
  current: CSSProperties | null,
  next: CSSProperties | null,
): boolean {
  if (current === next) {
    return true;
  }
  if (!current || !next) {
    return false;
  }
  for (const key of SLASH_SUGGESTIONS_PORTAL_STYLE_KEYS) {
    if (current[key] !== next[key]) {
      return false;
    }
  }
  return true;
}

export function isStopEscapeKey(event: StopEscapeKeyEventLike): boolean {
  return (
    event.key === "Escape" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.ctrlKey
  );
}

export function isRestoreClearedDraftKey(
  event: RestoreClearedDraftKeyEventLike,
): boolean {
  const normalizedKey = event.key.toLowerCase();
  if (normalizedKey !== "z") {
    return false;
  }
  if (event.shiftKey || event.altKey) {
    return false;
  }
  return (event.metaKey || event.ctrlKey) && !(event.metaKey && event.ctrlKey);
}

export function resolveEscapeComposerAction({
  waitingForResponse,
  onStopAvailable,
  stopRequestedForCurrentResponse,
  selectedSubmittedMessageIndex,
  hasComposerDraft,
}: {
  waitingForResponse: boolean;
  onStopAvailable: boolean;
  stopRequestedForCurrentResponse: boolean;
  selectedSubmittedMessageIndex: number | null;
  hasComposerDraft: boolean;
}): "stop" | "restore_history_draft" | "clear" | "none" {
  if (
    waitingForResponse &&
    onStopAvailable &&
    !stopRequestedForCurrentResponse
  ) {
    return "stop";
  }
  if (selectedSubmittedMessageIndex !== null) {
    return "restore_history_draft";
  }
  if (hasComposerDraft) {
    return "clear";
  }
  return "none";
}

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
    attachments: attachments.map((attachment) => ({ ...attachment })),
  };
}

export function buildUnavailableSlashCommandFeedback(
  command: ChatSlashCommand,
): string {
  return (
    command.unavailableFeedback ??
    `${command.command} is unavailable in the current context. Use /help.`
  );
}

export function resolveSlashCommandSubmitOptions(
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
  return (
    appGenerationMode === GeneratedAppGenerationModeEnum.JSONRenderWithImage
  );
}

function hasImageAttachment(attachments: ChatFileAttachment[]): boolean {
  return attachments.some((attachment) => isImageAttachment(attachment));
}

export function getSlashCommandImageAttachmentError({
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

export function shouldRemoveQueuedDraft(
  outcome: SlashCommandExecutionOutcome,
): boolean {
  return outcome === "submitted" || outcome === "handled_local";
}

function serializeSlashCommandsForReplaySignature(
  commands: ChatSlashCommandDefinition[],
): Array<{
  action: ChatSlashCommandAction;
  appGenerationMode: AppGenerationMode | null;
  command: string;
  promptTemplate: string | null;
  summary: string;
  unavailableFeedback: string | null;
}> {
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

export function resolveChatSubmitDispatchResult(
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

export function cloneAttachments(
  attachments: ChatFileAttachment[],
): ChatFileAttachment[] {
  return attachments.map((attachment) => ({ ...attachment }));
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
    const nextIndex = (selectedIndex + 1) % history.length;
    return nextIndex;
  }
  const prevIndex = (selectedIndex - 1 + history.length) % history.length;
  return prevIndex;
}

export type ChatExecutionControls = {
  thinkingEnabled?: boolean;
  onThinkingEnabledChange?: (next: boolean) => void;
  permissionMode: ChatPermissionModeValue;
  searchEnabled?: boolean;
  onPermissionModeChange: (next: ChatPermissionModeValue) => void;
  onSearchEnabledChange?: (next: boolean) => void;
};

export type ChatExecutionControlVisibility = {
  thinking?: boolean;
  permissionMode?: boolean;
  search?: boolean;
};
