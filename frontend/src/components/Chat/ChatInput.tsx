import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  type CSSProperties,
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { BiSolidBrain } from "react-icons/bi";
import { FiCpu, FiTerminal } from "react-icons/fi";
import { IoMdKey } from "react-icons/io";
import {
  IoAdd,
  IoAttach,
  IoClose,
  IoFolderOpen,
  IoMic,
  IoSend,
  IoStop,
} from "react-icons/io5";
import { addTemporaryNotification } from "state/actions/notifications";
import { formatBytes } from "utils/attachments";
import { ChatFileAttachment } from "utils/generatedTypes";
import {
  CHAT_SLASH_COMMANDS,
  type ChatPermissionModeValue,
  type ChatSlashCommandDefinition,
  getSlashCommandSuggestions,
} from "./chatComposerControls";
import {
  type ChatExecutionControlVisibility,
  type ChatExecutionControls,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
  type ChatSubmitResult,
  type ChatSubmitDispatchResult,
  type ChatSubmitOptions,
  type QueuedChatDraft,
  type SlashCommandExecutionOutcome,
  areSlashSuggestionsPortalStylesEqual,
  buildQueuedDraftReplayInputsSignature,
  buildQueuedDraftReplaySnapshot,
  buildUnavailableSlashCommandFeedback,
  cloneAttachments,
  cycleQueuedDraftSelection,
  cycleSubmittedMessageHistorySelection,
  enqueueQueuedDraft,
  getSlashCommandImageAttachmentError,
  isRestoreClearedDraftKey,
  isStopEscapeKey,
  resolveChatSubmitDispatchResult,
  resolveCustomPromptSlashCommandSubmission,
  resolveEscapeComposerAction,
  resolveSlashCommandRequest,
  resolveSlashCommandSubmitOptions,
  shouldAutoReplayQueuedDraft,
  shouldRemoveQueuedDraft,
} from "./chatInputHelpers";
import {
  type DictationState,
  type SpeechRecognitionLike,
  getSpeechRecognitionConstructor,
  insertTextAtSelection,
  isDictationAvailable,
  isNoSpeechDictationError,
  mapDictationError,
  pickProviderRecorderMimeType,
} from "./dictation";
import {
  type DictationProviderFailureClass,
  type DictationProviderFailurePhase,
  classifyProviderDictationFailureClass,
  shouldFallbackToBrowserAfterProviderFailure,
} from "./dictationPolicy";
import { useChatAttachmentManager } from "./useChatAttachmentManager";

const SLASH_SUGGESTIONS_MAX_HEIGHT_PX = 208;
const SLASH_SUGGESTIONS_EDGE_PADDING_PX = 8;
const SLASH_SUGGESTIONS_BASE_HEIGHT_PX = 12;
const SLASH_SUGGESTIONS_ROW_HEIGHT_PX = 36;
const SLASH_SUGGESTIONS_INPUT_INSET_PX = 4;
const UNKNOWN_SLASH_COMMAND_FEEDBACK =
  "Unknown or unavailable command. Use /help.";
const CHAT_PERMISSION_MODE_OPTIONS: Array<{
  value: ChatPermissionModeValue;
  label: string;
}> = [
  { value: "minimal", label: "minimal" },
  { value: "yolo", label: "yolo" },
  {
    value: "config_toml_custom",
    label: "config.toml custom",
  },
];
const DEFAULT_RUNTIME_ACTIVITY_COUNTS: ChatRuntimeActivityCounts = {
  activeBackgroundTerminals: 0,
  activeSubagents: 0,
};
const DEFAULT_RUNTIME_ACTIVITY_DETAILS: ChatRuntimeActivityDetails = {
  activeBackgroundTerminals: [],
  activeSubagents: [],
};
const DEFAULT_EXECUTION_CONTROL_VISIBILITY: ChatExecutionControlVisibility = {
  permissionMode: true,
  search: true,
};
const DEFAULT_SUBMITTED_MESSAGE_HISTORY: string[] = [];

function normalizeNonNegativeCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

type ChatRuntimeActivityCounts = {
  activeBackgroundTerminals: number;
  activeSubagents: number;
};

type ChatRuntimeActivityEntry = {
  id: string;
  label: string;
  toolName: string;
};

export type ChatRuntimeActivityDetails = {
  activeBackgroundTerminals: ChatRuntimeActivityEntry[];
  activeSubagents: ChatRuntimeActivityEntry[];
};

function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const digits = millions >= 10 ? 0 : 1;
    return `${millions.toFixed(digits).replace(/\.0$/u, "")}m`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    const digits = thousands >= 10 ? 0 : 1;
    return `${thousands.toFixed(digits).replace(/\.0$/u, "")}k`;
  }
  return `${value}`;
}

type ProviderDictationTranscriptionResult =
  | {
      kind: "ok";
      transcript: string;
    }
  | {
      kind: "no_speech";
    };

export type {
  ChatSlashCommand,
  ChatSlashCommandResult,
  ChatSubmitResult,
  ChatSubmitDispatchResult,
  ChatSubmitOptions,
} from "./chatInputHelpers";

type ChatInputProps = {
  placeholderText: string | undefined;
  waitingForResponse: boolean;
  disabled?: boolean;
  submitDisabled?: boolean;
  hasRetainedImageAttachmentForImageMode?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit: (
    message: string,
    attachments: ChatFileAttachment[],
    options?: ChatSubmitOptions,
  ) => Promise<ChatSubmitResult> | ChatSubmitResult;
  submitReadinessKey?: string | null;
  onUnknownSlashCommand?: (
    message: string,
    attachments: ChatFileAttachment[],
  ) => Promise<ChatSlashCommandResult> | ChatSlashCommandResult;
  onStop?: () => Promise<void> | void;
  executionControls?: ChatExecutionControls;
  executionControlVisibility?: ChatExecutionControlVisibility;
  slashCommands?: ChatSlashCommandDefinition[];
  recognizedSlashCommands?: ChatSlashCommandDefinition[];
  onSlashCommand?: (
    command: ChatSlashCommand,
  ) => Promise<ChatSlashCommandResult | void> | ChatSlashCommandResult | void;
  slashSuggestionsPlacement?: "auto" | "above" | "below";
  dictationMode?: "auto" | "browser" | "provider";
  onProviderDictationTranscribe?: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  dictationEnabledByProvider?: boolean;
  providerDictationLikelySupported?: boolean;
  contextWindowTokens?: number | null;
  contextUsedTokens?: number | null;
  contextUsageIsEstimated?: boolean;
  submittedMessageHistory?: string[];
  runtimeActivityCounts?: ChatRuntimeActivityCounts;
  runtimeActivityDetails?: ChatRuntimeActivityDetails;
};

type EscClearedComposerDraft = {
  message: string;
  attachments: ChatFileAttachment[];
};

type SubmitRemotelyHandler = (args: {
  draftToRestore?: EscClearedComposerDraft;
  message: string;
  submittedAttachments: ChatFileAttachment[];
  options?: ChatSubmitOptions;
  fallbackFailureResult: Exclude<ChatSubmitDispatchResult, "submitted">;
}) => Promise<ChatSubmitDispatchResult>;

type NormalizedSlashCommandResult = Exclude<ChatSlashCommandResult, boolean>;
type FloatingBoxHandlers = ReturnType<typeof getFloatingBoxHandlers>;

function focusComposerTextareaAtEnd(
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>,
  value: string,
): void {
  requestAnimationFrame(() => {
    const node = textareaRef.current;
    if (!node) {
      return;
    }
    const end = value.length;
    node.focus();
    node.setSelectionRange(end, end);
  });
}

function dispatchComposerSubmitFromTextarea(
  textarea: HTMLTextAreaElement,
): void {
  const formEvent = new Event("submit", {
    bubbles: true,
    cancelable: true,
  });
  textarea.form?.dispatchEvent(formEvent);
}

function handleSlashSuggestionsKeyDown(args: {
  activeSlashIndex: number;
  applySlashSuggestion: (index: number) => void;
  event: KeyboardEvent<HTMLTextAreaElement>;
  inputValue: string;
  setActiveSlashIndex: (
    value: number | ((current: number) => number),
  ) => void;
  shouldShowSlashSuggestions: boolean;
  slashSuggestions: ChatSlashCommandDefinition[];
}): boolean {
  const {
    activeSlashIndex,
    applySlashSuggestion,
    event,
    inputValue,
    setActiveSlashIndex,
    shouldShowSlashSuggestions,
    slashSuggestions,
  } = args;
  if (!shouldShowSlashSuggestions) {
    return false;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setActiveSlashIndex((current) =>
      Math.min(current + 1, slashSuggestions.length - 1),
    );
    return true;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    setActiveSlashIndex((current) => Math.max(current - 1, 0));
    return true;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    applySlashSuggestion(activeSlashIndex);
    return true;
  }
  if (event.key !== "Enter" || event.shiftKey) {
    return false;
  }
  event.preventDefault();
  const suggestion = slashSuggestions[activeSlashIndex];
  const normalizedInput = inputValue.trim().toLowerCase();
  if (
    suggestion &&
    normalizedInput === suggestion.command.toLowerCase()
  ) {
    dispatchComposerSubmitFromTextarea(event.currentTarget);
    return true;
  }
  applySlashSuggestion(activeSlashIndex);
  return true;
}

function handleEscapeComposerKeyDown(args: {
  attachments: ChatFileAttachment[];
  clearComposerByEscape: () => boolean;
  event: KeyboardEvent<HTMLTextAreaElement>;
  inputValue: string;
  onStop?: () => Promise<void> | void;
  restoreDraftFromSubmittedHistorySelection: () => void;
  selectedSubmittedMessageIndex: number | null;
  stopRequestedForCurrentResponseRef: MutableRefObject<boolean>;
  waitingForResponse: boolean;
}): boolean {
  const {
    attachments,
    clearComposerByEscape,
    event,
    inputValue,
    onStop,
    restoreDraftFromSubmittedHistorySelection,
    selectedSubmittedMessageIndex,
    stopRequestedForCurrentResponseRef,
    waitingForResponse,
  } = args;
  if (!isStopEscapeKey(event)) {
    return false;
  }
  const hasComposerDraft =
    inputValue.trim().length > 0 || attachments.length > 0;
  const escapeAction = resolveEscapeComposerAction({
    waitingForResponse,
    onStopAvailable: typeof onStop === "function",
    stopRequestedForCurrentResponse:
      stopRequestedForCurrentResponseRef.current,
    selectedSubmittedMessageIndex,
    hasComposerDraft,
  });
  if (escapeAction === "stop" && onStop) {
    event.preventDefault();
    event.stopPropagation();
    stopRequestedForCurrentResponseRef.current = true;
    void onStop();
    return true;
  }
  if (escapeAction === "clear") {
    event.preventDefault();
    event.stopPropagation();
    clearComposerByEscape();
    return true;
  }
  if (escapeAction !== "restore_history_draft") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  restoreDraftFromSubmittedHistorySelection();
  return true;
}

function handleRestoreClearedDraftShortcut(args: {
  attachments: ChatFileAttachment[];
  event: KeyboardEvent<HTMLTextAreaElement>;
  inputValue: string;
  restoreEscClearedComposerDraft: () => boolean;
  shouldShowSlashSuggestions: boolean;
}): boolean {
  const {
    attachments,
    event,
    inputValue,
    restoreEscClearedComposerDraft,
    shouldShowSlashSuggestions,
  } = args;
  if (
    !isRestoreClearedDraftKey(event) ||
    shouldShowSlashSuggestions ||
    inputValue.trim().length > 0 ||
    attachments.length > 0
  ) {
    return false;
  }
  if (!restoreEscClearedComposerDraft()) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function handleQueueDraftShortcut(args: {
  attachments: ChatFileAttachment[];
  enqueueDraft: (args: {
    message: string;
    draftAttachments: ChatFileAttachment[];
    prioritize: boolean;
    interruptCurrentRun: boolean;
    feedback: string;
  }) => boolean;
  event: KeyboardEvent<HTMLTextAreaElement>;
  inputValue: string;
  shouldShowSlashSuggestions: boolean;
}): boolean {
  const {
    attachments,
    enqueueDraft,
    event,
    inputValue,
    shouldShowSlashSuggestions,
  } = args;
  const hasComposerDraft =
    inputValue.trim().length > 0 || attachments.length > 0;
  if (
    event.key !== "Tab" ||
    event.shiftKey ||
    shouldShowSlashSuggestions ||
    !hasComposerDraft
  ) {
    return false;
  }
  event.preventDefault();
  enqueueDraft({
    message: inputValue,
    draftAttachments: attachments,
    prioritize: false,
    interruptCurrentRun: false,
    feedback: "",
  });
  return true;
}

function handleQueuedDraftSelectionKeyDown(args: {
  event: KeyboardEvent<HTMLTextAreaElement>;
  hasComposerDraft: boolean;
  queuedDrafts: QueuedChatDraft[];
  restoreQueuedDraftToComposer: (draftId: string) => void;
  selectedQueuedDraftId: string | null;
  setSelectedQueuedDraftId: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  shouldShowSlashSuggestions: boolean;
}): boolean {
  const {
    event,
    hasComposerDraft,
    queuedDrafts,
    restoreQueuedDraftToComposer,
    selectedQueuedDraftId,
    setSelectedQueuedDraftId,
    shouldShowSlashSuggestions,
  } = args;
  if (
    hasComposerDraft ||
    queuedDrafts.length === 0 ||
    shouldShowSlashSuggestions
  ) {
    return false;
  }
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    setSelectedQueuedDraftId((current) =>
      cycleQueuedDraftSelection(
        queuedDrafts,
        current,
        event.key === "ArrowUp" ? "prev" : "next",
      ),
    );
    return true;
  }
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    !selectedQueuedDraftId
  ) {
    return false;
  }
  event.preventDefault();
  restoreQueuedDraftToComposer(selectedQueuedDraftId);
  return true;
}

function canCycleSubmittedHistorySelection(args: {
  hasComposerDraft: boolean;
  queuedDrafts: QueuedChatDraft[];
  shouldShowSlashSuggestions: boolean;
  submittedMessageHistoryEntries: string[];
  selectedSubmittedMessageIndex: number | null;
}): boolean {
  const {
    hasComposerDraft,
    queuedDrafts,
    shouldShowSlashSuggestions,
    submittedMessageHistoryEntries,
    selectedSubmittedMessageIndex,
  } = args;
  return (
    !shouldShowSlashSuggestions &&
    queuedDrafts.length === 0 &&
    submittedMessageHistoryEntries.length > 0 &&
    (selectedSubmittedMessageIndex !== null || !hasComposerDraft)
  );
}

function applySubmittedHistorySelectionFromKey(args: {
  event: KeyboardEvent<HTMLTextAreaElement>;
  inputValue: string;
  restoreDraftFromSubmittedHistorySelection: () => void;
  selectedSubmittedMessageIndex: number | null;
  setInputValue: (nextValue: string) => void;
  setSelectedSubmittedMessageIndex: (
    value: number | null | ((current: number | null) => number | null),
  ) => void;
  setSlashFeedback: (value: string | null) => void;
  submittedHistoryDraftBeforeSelectionRef: MutableRefObject<string | null>;
  submittedMessageHistoryEntries: string[];
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
}): boolean {
  const {
    event,
    inputValue,
    restoreDraftFromSubmittedHistorySelection,
    selectedSubmittedMessageIndex,
    setInputValue,
    setSelectedSubmittedMessageIndex,
    setSlashFeedback,
    submittedHistoryDraftBeforeSelectionRef,
    submittedMessageHistoryEntries,
    textareaRef,
  } = args;
  if (event.key === "ArrowDown" && selectedSubmittedMessageIndex === 0) {
    restoreDraftFromSubmittedHistorySelection();
    return true;
  }
  if (selectedSubmittedMessageIndex === null) {
    submittedHistoryDraftBeforeSelectionRef.current = inputValue;
  }
  const nextSelectedIndex = cycleSubmittedMessageHistorySelection(
    submittedMessageHistoryEntries,
    selectedSubmittedMessageIndex,
    event.key === "ArrowUp" ? "next" : "prev",
  );
  if (nextSelectedIndex === null) {
    return true;
  }
  const nextMessage = submittedMessageHistoryEntries[nextSelectedIndex];
  if (typeof nextMessage !== "string") {
    return true;
  }
  setSelectedSubmittedMessageIndex(nextSelectedIndex);
  setInputValue(nextMessage);
  setSlashFeedback(null);
  focusComposerTextareaAtEnd(textareaRef, nextMessage);
  return true;
}

function handleSubmittedHistoryKeyDown(args: {
  event: KeyboardEvent<HTMLTextAreaElement>;
  hasComposerDraft: boolean;
  inputValue: string;
  queuedDrafts: QueuedChatDraft[];
  restoreDraftFromSubmittedHistorySelection: () => void;
  selectedSubmittedMessageIndex: number | null;
  setInputValue: (nextValue: string) => void;
  setSelectedSubmittedMessageIndex: (
    value: number | null | ((current: number | null) => number | null),
  ) => void;
  setSlashFeedback: (value: string | null) => void;
  shouldShowSlashSuggestions: boolean;
  submittedHistoryDraftBeforeSelectionRef: MutableRefObject<string | null>;
  submittedMessageHistoryEntries: string[];
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
}): boolean {
  const {
    event,
    hasComposerDraft,
    inputValue,
    queuedDrafts,
    restoreDraftFromSubmittedHistorySelection,
    selectedSubmittedMessageIndex,
    setInputValue,
    setSelectedSubmittedMessageIndex,
    setSlashFeedback,
    shouldShowSlashSuggestions,
    submittedHistoryDraftBeforeSelectionRef,
    submittedMessageHistoryEntries,
    textareaRef,
  } = args;
  if (
    !canCycleSubmittedHistorySelection({
      hasComposerDraft,
      queuedDrafts,
      shouldShowSlashSuggestions,
      submittedMessageHistoryEntries,
      selectedSubmittedMessageIndex,
    }) ||
    (event.key !== "ArrowUp" && event.key !== "ArrowDown")
  ) {
    return false;
  }
  event.preventDefault();
  return applySubmittedHistorySelectionFromKey({
    event,
    inputValue,
    restoreDraftFromSubmittedHistorySelection,
    selectedSubmittedMessageIndex,
    setInputValue,
    setSelectedSubmittedMessageIndex,
    setSlashFeedback,
    submittedHistoryDraftBeforeSelectionRef,
    submittedMessageHistoryEntries,
    textareaRef,
  });
}

function handleSubmitEnterKeyDown(args: {
  event: KeyboardEvent<HTMLTextAreaElement>;
  isSubmitDisabled: boolean;
}): boolean {
  const { event, isSubmitDisabled } = args;
  if (event.key !== "Enter" || event.shiftKey || isSubmitDisabled) {
    return false;
  }
  event.preventDefault();
  dispatchComposerSubmitFromTextarea(event.currentTarget);
  return true;
}

function handleChatInputKeyDown(args: {
  activeSlashIndex: number;
  applySlashSuggestion: (index: number) => void;
  attachments: ChatFileAttachment[];
  clearComposerByEscape: () => boolean;
  enqueueDraft: (args: {
    message: string;
    draftAttachments: ChatFileAttachment[];
    prioritize: boolean;
    interruptCurrentRun: boolean;
    feedback: string;
  }) => boolean;
  event: KeyboardEvent<HTMLTextAreaElement>;
  inputValue: string;
  isSubmitDisabled: boolean;
  onStop?: () => Promise<void> | void;
  queuedDrafts: QueuedChatDraft[];
  restoreDraftFromSubmittedHistorySelection: () => void;
  restoreEscClearedComposerDraft: () => boolean;
  restoreQueuedDraftToComposer: (draftId: string) => void;
  selectedQueuedDraftId: string | null;
  selectedSubmittedMessageIndex: number | null;
  setActiveSlashIndex: (
    value: number | ((current: number) => number),
  ) => void;
  setInputValue: (nextValue: string) => void;
  setSelectedQueuedDraftId: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  setSelectedSubmittedMessageIndex: (
    value: number | null | ((current: number | null) => number | null),
  ) => void;
  setSlashFeedback: (value: string | null) => void;
  shouldShowSlashSuggestions: boolean;
  slashSuggestions: ChatSlashCommandDefinition[];
  stopRequestedForCurrentResponseRef: MutableRefObject<boolean>;
  submittedHistoryDraftBeforeSelectionRef: MutableRefObject<string | null>;
  submittedMessageHistoryEntries: string[];
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  waitingForResponse: boolean;
}): void {
  const {
    activeSlashIndex,
    applySlashSuggestion,
    attachments,
    clearComposerByEscape,
    enqueueDraft,
    event,
    inputValue,
    isSubmitDisabled,
    onStop,
    queuedDrafts,
    restoreDraftFromSubmittedHistorySelection,
    restoreEscClearedComposerDraft,
    restoreQueuedDraftToComposer,
    selectedQueuedDraftId,
    selectedSubmittedMessageIndex,
    setActiveSlashIndex,
    setInputValue,
    setSelectedQueuedDraftId,
    setSelectedSubmittedMessageIndex,
    setSlashFeedback,
    shouldShowSlashSuggestions,
    slashSuggestions,
    stopRequestedForCurrentResponseRef,
    submittedHistoryDraftBeforeSelectionRef,
    submittedMessageHistoryEntries,
    textareaRef,
    waitingForResponse,
  } = args;
  const hasComposerDraft =
    inputValue.trim().length > 0 || attachments.length > 0;
  if (
    handleSlashSuggestionsKeyDown({
      activeSlashIndex,
      applySlashSuggestion,
      event,
      inputValue,
      setActiveSlashIndex,
      shouldShowSlashSuggestions,
      slashSuggestions,
    }) ||
    handleEscapeComposerKeyDown({
      attachments,
      clearComposerByEscape,
      event,
      inputValue,
      onStop,
      restoreDraftFromSubmittedHistorySelection,
      selectedSubmittedMessageIndex,
      stopRequestedForCurrentResponseRef,
      waitingForResponse,
    }) ||
    handleRestoreClearedDraftShortcut({
      attachments,
      event,
      inputValue,
      restoreEscClearedComposerDraft,
      shouldShowSlashSuggestions,
    }) ||
    handleQueueDraftShortcut({
      attachments,
      enqueueDraft,
      event,
      inputValue,
      shouldShowSlashSuggestions,
    }) ||
    handleQueuedDraftSelectionKeyDown({
      event,
      hasComposerDraft,
      queuedDrafts,
      restoreQueuedDraftToComposer,
      selectedQueuedDraftId,
      setSelectedQueuedDraftId,
      shouldShowSlashSuggestions,
    }) ||
    handleSubmittedHistoryKeyDown({
      event,
      hasComposerDraft,
      inputValue,
      queuedDrafts,
      restoreDraftFromSubmittedHistorySelection,
      selectedSubmittedMessageIndex,
      setInputValue,
      setSelectedSubmittedMessageIndex,
      setSlashFeedback,
      shouldShowSlashSuggestions,
      submittedHistoryDraftBeforeSelectionRef,
      submittedMessageHistoryEntries,
      textareaRef,
    })
  ) {
    return;
  }
  handleSubmitEnterKeyDown({
    event,
    isSubmitDisabled,
  });
}

function handleChatInputFormKeyDown(args: {
  event: KeyboardEvent<HTMLFormElement>;
  onStop?: () => Promise<void> | void;
  stopRequestedForCurrentResponseRef: MutableRefObject<boolean>;
  waitingForResponse: boolean;
}): void {
  const {
    event,
    onStop,
    stopRequestedForCurrentResponseRef,
    waitingForResponse,
  } = args;
  if (!isStopEscapeKey(event) || event.defaultPrevented) {
    return;
  }
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("textarea")) {
    return;
  }
  const escapeAction = resolveEscapeComposerAction({
    waitingForResponse,
    onStopAvailable: Boolean(onStop),
    stopRequestedForCurrentResponse:
      stopRequestedForCurrentResponseRef.current,
    selectedSubmittedMessageIndex: null,
    hasComposerDraft: false,
  });
  if (escapeAction !== "stop" || !onStop) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  stopRequestedForCurrentResponseRef.current = true;
  void onStop();
}

function resolveSelectedQueuedDraftId(
  queuedDrafts: QueuedChatDraft[],
  selectedQueuedDraftId: string | null,
): string | null {
  if (queuedDrafts.length === 0) {
    return null;
  }
  if (!selectedQueuedDraftId) {
    return queuedDrafts[0]?.id ?? null;
  }
  const hasSelection = queuedDrafts.some(
    (item) => item.id === selectedQueuedDraftId,
  );
  if (hasSelection) {
    return selectedQueuedDraftId;
  }
  return queuedDrafts[0]?.id ?? null;
}

async function submitChatInputMessage(args: {
  enqueueDraft: (args: {
    message: string;
    draftAttachments: ChatFileAttachment[];
    prioritize: boolean;
    interruptCurrentRun: boolean;
    feedback: string;
  }) => boolean;
  isSubmitDisabled: boolean;
  onStop?: () => Promise<void> | void;
  runSlashCommand: (
    message: string,
    submittedAttachments: ChatFileAttachment[],
  ) => Promise<SlashCommandExecutionOutcome>;
  submitRemotely: SubmitRemotelyHandler;
  submittedAttachments: ChatFileAttachment[];
  submittedValue: string;
  waitingForResponse: boolean;
}): Promise<SlashCommandExecutionOutcome> {
  const {
    enqueueDraft,
    isSubmitDisabled,
    onStop,
    runSlashCommand,
    submitRemotely,
    submittedAttachments,
    submittedValue,
    waitingForResponse,
  } = args;
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
  const submitOutcome = await submitRemotely({
    message: submittedValue,
    submittedAttachments,
    fallbackFailureResult: "failed",
  });
  if (submitOutcome === "submitted") {
    return "submitted";
  }
  return submitOutcome;
}

function resolveParsedSlashCommandSubmission(args: {
  parsed: ChatSlashCommand;
  submittedAttachments: ChatFileAttachment[];
}): { message: string; attachments: ChatFileAttachment[] } | null {
  const { parsed, submittedAttachments } = args;
  return resolveCustomPromptSlashCommandSubmission({
    promptTemplate: parsed.promptTemplate,
    args: parsed.args,
    ...(parsed.rawSuffix === undefined
      ? {}
      : { rawSuffix: parsed.rawSuffix }),
    attachments: submittedAttachments,
  });
}

function normalizeSlashCommandResult(
  result: ChatSlashCommandResult | void,
): NormalizedSlashCommandResult | undefined {
  return result && typeof result === "object" ? result : undefined;
}

function shouldRetryRegisteredSlashCommand(args: {
  result: ChatSlashCommandResult | void;
  slashResult: NormalizedSlashCommandResult | undefined;
}): boolean {
  const { result, slashResult } = args;
  return result === false || slashResult?.handled === false;
}

function finalizeLocalSlashCommandResult(args: {
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

function shouldIgnoreUnknownSlashCommandResult(args: {
  result: ChatSlashCommandResult;
  slashResult: NormalizedSlashCommandResult | undefined;
}): boolean {
  const { result, slashResult } = args;
  return result === false || slashResult?.handled === false;
}

function finalizeUnknownSlashCommandResult(args: {
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

async function submitPromptTemplateSlashCommand(args: {
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

async function submitNativeSlashCommand(args: {
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

async function executeRegisteredSlashCommand(args: {
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
      successFeedback:
        slashResult.feedback ?? `Submitted ${parsed.command}.`,
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

function resolveRefreshedSlashCommandRequest(args: {
  message: string;
  slashResult: NormalizedSlashCommandResult | undefined;
}): { parsed: ChatSlashCommand; commandAvailable: boolean } | null {
  const { message, slashResult } = args;
  const refreshedSlashCommands =
    slashResult?.refreshedSlashCommands ?? null;
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

async function handleUnknownSlashCommand(args: {
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

function resolveSlashSuggestionsPlacement(args: {
  estimatedMenuHeight: number;
  slashSuggestionsPlacement: "auto" | "above" | "below";
  spaceAbove: number;
  spaceBelow: number;
}): "above" | "below" {
  const {
    estimatedMenuHeight,
    slashSuggestionsPlacement,
    spaceAbove,
    spaceBelow,
  } = args;
  if (slashSuggestionsPlacement === "above") {
    return "above";
  }
  if (slashSuggestionsPlacement === "below") {
    return "below";
  }
  return spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove
    ? "below"
    : "above";
}

function resolveSlashSuggestionsPortalStyle(args: {
  inputRect: DOMRect;
  nextPlacement: "above" | "below";
}): CSSProperties {
  const { inputRect, nextPlacement } = args;
  const spaceAbove = inputRect.top - SLASH_SUGGESTIONS_EDGE_PADDING_PX;
  const spaceBelow =
    window.innerHeight - inputRect.bottom - SLASH_SUGGESTIONS_EDGE_PADDING_PX;
  const availableVerticalSpace =
    nextPlacement === "below" ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(
    0,
    Math.min(SLASH_SUGGESTIONS_MAX_HEIGHT_PX, availableVerticalSpace),
  );
  const maxWidth = Math.max(
    0,
    window.innerWidth - SLASH_SUGGESTIONS_EDGE_PADDING_PX * 2,
  );
  const preferredWidth = Math.max(
    0,
    inputRect.width - SLASH_SUGGESTIONS_INPUT_INSET_PX * 2,
  );
  const width = Math.min(preferredWidth, maxWidth);
  const left = Math.max(
    SLASH_SUGGESTIONS_EDGE_PADDING_PX,
    Math.min(
      inputRect.left + SLASH_SUGGESTIONS_INPUT_INSET_PX,
      window.innerWidth - SLASH_SUGGESTIONS_EDGE_PADDING_PX - width,
    ),
  );
  const clampedTop =
    nextPlacement === "below"
      ? Math.max(
          SLASH_SUGGESTIONS_EDGE_PADDING_PX,
          Math.min(
            inputRect.bottom + SLASH_SUGGESTIONS_INPUT_INSET_PX,
            window.innerHeight -
              SLASH_SUGGESTIONS_EDGE_PADDING_PX -
              maxHeight,
          ),
        )
      : undefined;
  const clampedBottom =
    nextPlacement === "above"
      ? Math.max(
          SLASH_SUGGESTIONS_EDGE_PADDING_PX,
          Math.min(
            window.innerHeight -
              inputRect.top +
              SLASH_SUGGESTIONS_INPUT_INSET_PX,
            window.innerHeight - SLASH_SUGGESTIONS_EDGE_PADDING_PX,
          ),
        )
      : undefined;
  return {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
    top: clampedTop !== undefined ? `${clampedTop}px` : undefined,
    bottom: clampedBottom !== undefined ? `${clampedBottom}px` : undefined,
  };
}

function handleProviderDictationUnavailable(args: {
  allowBrowserFallback: boolean;
  failureClass: DictationProviderFailureClass;
  message: string;
  maybeFallbackForProviderFailure: (args: {
    phase: DictationProviderFailurePhase;
    failureClass: DictationProviderFailureClass;
    allowBrowserFallback: boolean;
  }) => boolean;
  phase: DictationProviderFailurePhase;
  setDictationFeedback: (value: string | null) => void;
  setDictationState: (value: DictationState) => void;
}): boolean {
  const {
    allowBrowserFallback,
    failureClass,
    maybeFallbackForProviderFailure,
    message,
    phase,
    setDictationFeedback,
    setDictationState,
  } = args;
  if (
    maybeFallbackForProviderFailure({
      phase,
      failureClass,
      allowBrowserFallback,
    })
  ) {
    return true;
  }
  setDictationState("error");
  setDictationFeedback(message);
  return true;
}

function canStartProviderDictation(args: {
  allowBrowserFallback: boolean;
  canProviderDictate: boolean;
  maybeFallbackForProviderFailure: (args: {
    phase: DictationProviderFailurePhase;
    failureClass: DictationProviderFailureClass;
    allowBrowserFallback: boolean;
  }) => boolean;
  onProviderDictationTranscribe?: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  setDictationFeedback: (value: string | null) => void;
  setDictationState: (value: DictationState) => void;
}): boolean {
  const {
    allowBrowserFallback,
    canProviderDictate,
    maybeFallbackForProviderFailure,
    onProviderDictationTranscribe,
    setDictationFeedback,
    setDictationState,
  } = args;
  if (!canProviderDictate || !onProviderDictationTranscribe) {
    handleProviderDictationUnavailable({
      allowBrowserFallback,
      failureClass: "unknown",
      maybeFallbackForProviderFailure,
      message: "Provider dictation is not available.",
      phase: "capture_start",
      setDictationFeedback,
      setDictationState,
    });
    return false;
  }
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  ) {
    handleProviderDictationUnavailable({
      allowBrowserFallback,
      failureClass: "unknown",
      maybeFallbackForProviderFailure,
      message: "Provider dictation is not available.",
      phase: "capture_start",
      setDictationFeedback,
      setDictationState,
    });
    return false;
  }
  return true;
}

function stopProviderStreamTracks(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function resolveProviderRecordingBlob(args: {
  chunks: BlobPart[];
  fallbackMimeType: string;
  recorder: MediaRecorder;
}): Blob {
  const { chunks, fallbackMimeType, recorder } = args;
  let blobType = recorder.mimeType || fallbackMimeType || "audio/webm";
  for (const chunk of chunks) {
    if (chunk instanceof Blob && chunk.type) {
      blobType = chunk.type;
      break;
    }
  }
  return new Blob(chunks, { type: blobType });
}

async function transcribeProviderRecording(args: {
  allowBrowserFallback: boolean;
  blob: Blob;
  insertTranscript: (transcript: string) => void;
  maybeFallbackForProviderFailure: (args: {
    phase: DictationProviderFailurePhase;
    failureClass: DictationProviderFailureClass;
    allowBrowserFallback: boolean;
  }) => boolean;
  onProviderDictationTranscribe: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  setDictationFeedback: (value: string | null) => void;
  setDictationState: (value: DictationState) => void;
}): Promise<void> {
  const {
    allowBrowserFallback,
    blob,
    insertTranscript,
    maybeFallbackForProviderFailure,
    onProviderDictationTranscribe,
    setDictationFeedback,
    setDictationState,
  } = args;
  try {
    const result = await onProviderDictationTranscribe(blob);
    if (result.kind === "no_speech") {
      setDictationState("idle");
      setDictationFeedback(null);
      addTemporaryNotification("No speech was detected.");
      return;
    }
    const normalized = result.transcript.trim();
    if (!normalized) {
      throw new Error("Provider transcription returned an empty result.");
    }
    insertTranscript(`${normalized} `);
    setDictationState("idle");
    setDictationFeedback(null);
  } catch (error) {
    const failureClass = classifyProviderDictationFailureClass(error);
    if (
      maybeFallbackForProviderFailure({
        phase: "transcription",
        failureClass,
        allowBrowserFallback,
      })
    ) {
      return;
    }
    setDictationState("error");
    setDictationFeedback(
      error instanceof Error && error.message
        ? error.message
        : "Provider transcription failed.",
    );
  }
}

function handleProviderRecorderError(args: {
  allowBrowserFallback: boolean;
  cleanupProviderCapture: () => void;
  maybeFallbackForProviderFailure: (args: {
    phase: DictationProviderFailurePhase;
    failureClass: DictationProviderFailureClass;
    allowBrowserFallback: boolean;
  }) => boolean;
  setDictationFeedback: (value: string | null) => void;
  setDictationState: (value: DictationState) => void;
}): void {
  const {
    allowBrowserFallback,
    cleanupProviderCapture,
    maybeFallbackForProviderFailure,
    setDictationFeedback,
    setDictationState,
  } = args;
  cleanupProviderCapture();
  handleProviderDictationUnavailable({
    allowBrowserFallback,
    failureClass: "unknown",
    maybeFallbackForProviderFailure,
    message: "Microphone input failed.",
    phase: "capture_runtime",
    setDictationFeedback,
    setDictationState,
  });
}

function handleProviderRecorderStop(args: {
  allowBrowserFallback: boolean;
  fallbackMimeType: string;
  dictationSourceRef: MutableRefObject<"browser" | "provider" | null>;
  insertTranscript: (transcript: string) => void;
  maybeFallbackForProviderFailure: (args: {
    phase: DictationProviderFailurePhase;
    failureClass: DictationProviderFailureClass;
    allowBrowserFallback: boolean;
  }) => boolean;
  onProviderDictationTranscribe: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  providerChunksRef: MutableRefObject<Array<BlobPart>>;
  providerRecorderRef: MutableRefObject<MediaRecorder | null>;
  providerStreamRef: MutableRefObject<MediaStream | null>;
  recorder: MediaRecorder;
  setDictationFeedback: (value: string | null) => void;
  setDictationState: (value: DictationState) => void;
}): void {
  const {
    allowBrowserFallback,
    fallbackMimeType,
    dictationSourceRef,
    insertTranscript,
    maybeFallbackForProviderFailure,
    onProviderDictationTranscribe,
    providerChunksRef,
    providerRecorderRef,
    providerStreamRef,
    recorder,
    setDictationFeedback,
    setDictationState,
  } = args;
  providerRecorderRef.current = null;
  dictationSourceRef.current = null;
  stopProviderStreamTracks(providerStreamRef.current);
  providerStreamRef.current = null;
  const chunks = providerChunksRef.current;
  providerChunksRef.current = [];
  const blob = resolveProviderRecordingBlob({
    chunks,
    fallbackMimeType,
    recorder,
  });
  if (blob.size === 0) {
    setDictationState("idle");
    setDictationFeedback(null);
    addTemporaryNotification("No speech was detected.");
    return;
  }
  setDictationState("transcribing");
  setDictationFeedback("Transcribing...");
  void transcribeProviderRecording({
    allowBrowserFallback,
    blob,
    insertTranscript,
    maybeFallbackForProviderFailure,
    onProviderDictationTranscribe,
    setDictationFeedback,
    setDictationState,
  });
}

function resolveChatInputControlState(args: {
  disabled: boolean;
  internalValue: string;
  onChange?: (value: string) => void;
  recognizedSlashCommands?: ChatSlashCommandDefinition[];
  slashCommands: ChatSlashCommandDefinition[];
  submitDisabled: boolean;
  value?: string;
  isUploading: boolean;
}): {
  inputValue: string;
  isControlled: boolean;
  isDisabled: boolean;
  isSubmitDisabled: boolean;
  slashCommandRecognitionSet: ChatSlashCommandDefinition[];
} {
  const {
    disabled,
    internalValue,
    isUploading,
    onChange,
    recognizedSlashCommands,
    slashCommands,
    submitDisabled,
    value,
  } = args;
  const isControlled = typeof value === "string" && Boolean(onChange);
  return {
    inputValue: isControlled ? value : internalValue,
    isControlled,
    isDisabled: disabled,
    isSubmitDisabled: submitDisabled || disabled || isUploading,
    slashCommandRecognitionSet: recognizedSlashCommands ?? slashCommands,
  };
}

function resolveDictationCapabilityState(args: {
  dictationEnabledByProvider: boolean;
  dictationMode: "auto" | "browser" | "provider";
  dictationSupported: boolean;
  isDisabled: boolean;
  mediaRecorderSupported: boolean;
  onProviderDictationTranscribe?: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  providerDictationLikelySupported: boolean;
}): {
  canAutoUseProviderDictation: boolean;
  canBrowserDictate: boolean;
  canDictate: boolean;
  canProviderDictate: boolean;
} {
  const {
    dictationEnabledByProvider,
    dictationMode,
    dictationSupported,
    isDisabled,
    mediaRecorderSupported,
    onProviderDictationTranscribe,
    providerDictationLikelySupported,
  } = args;
  const canBrowserDictate = isDictationAvailable(dictationSupported);
  const canProviderDictate = Boolean(
    dictationEnabledByProvider &&
      onProviderDictationTranscribe &&
      mediaRecorderSupported,
  );
  const canAutoUseProviderDictation =
    canProviderDictate && providerDictationLikelySupported;
  if (isDisabled) {
    return {
      canAutoUseProviderDictation,
      canBrowserDictate,
      canDictate: false,
      canProviderDictate,
    };
  }
  if (dictationMode === "provider") {
    return {
      canAutoUseProviderDictation,
      canBrowserDictate,
      canDictate: canProviderDictate,
      canProviderDictate,
    };
  }
  if (dictationMode === "browser") {
    return {
      canAutoUseProviderDictation,
      canBrowserDictate,
      canDictate: canBrowserDictate,
      canProviderDictate,
    };
  }
  return {
    canAutoUseProviderDictation,
    canBrowserDictate,
    canDictate: canAutoUseProviderDictation || canBrowserDictate,
    canProviderDictate,
  };
}

function resolveExecutionControlState(args: {
  executionControlVisibility: ChatExecutionControlVisibility;
  executionControls?: ChatExecutionControls;
}): {
  showExecutionControls: boolean;
  showPermissionControl: boolean;
  showSearchControl: boolean;
  showThinkingControl: boolean;
} {
  const { executionControlVisibility, executionControls } = args;
  const showPermissionControl = Boolean(
    executionControls && executionControlVisibility.permissionMode !== false,
  );
  const showThinkingControl = Boolean(
    executionControls &&
      executionControlVisibility.thinking !== false &&
      typeof executionControls.onThinkingEnabledChange === "function",
  );
  const showSearchControl = Boolean(
    executionControls &&
      executionControlVisibility.search !== false &&
      typeof executionControls.onSearchEnabledChange === "function",
  );
  return {
    showExecutionControls:
      showThinkingControl || showPermissionControl || showSearchControl,
    showPermissionControl,
    showSearchControl,
    showThinkingControl,
  };
}

function resolveContextLabelState(contextUsageIsEstimated: boolean): {
  contextLabelPrefixCompact: string;
  contextLabelPrefixFull: string;
} {
  return {
    contextLabelPrefixCompact: contextUsageIsEstimated
      ? "est. context"
      : "context",
    contextLabelPrefixFull: contextUsageIsEstimated
      ? "est. context left"
      : "context left",
  };
}

function resolveRuntimeActivityVisibilityState(args: {
  activeBackgroundTerminalEntries: ChatRuntimeActivityEntry[];
  activeBackgroundTerminals: number;
  activeSubagentEntries: ChatRuntimeActivityEntry[];
  activeSubagents: number;
  contextRemainingValue: string | null;
  showExecutionControls: boolean;
}): {
  shouldShowComposerMetaRow: boolean;
  showBackgroundTerminalDropdown: boolean;
  showContextBadge: boolean;
  showRuntimeActivityCounters: boolean;
  showSubagentDropdown: boolean;
} {
  const {
    activeBackgroundTerminalEntries,
    activeBackgroundTerminals,
    activeSubagentEntries,
    activeSubagents,
    contextRemainingValue,
    showExecutionControls,
  } = args;
  const showBackgroundTerminalDropdown =
    activeBackgroundTerminalEntries.length > 0;
  const showSubagentDropdown = activeSubagentEntries.length > 0;
  const showRuntimeActivityCounters =
    activeBackgroundTerminals > 0 || activeSubagents > 0;
  const showContextBadge = contextRemainingValue !== null;
  return {
    shouldShowComposerMetaRow:
      showExecutionControls || showContextBadge || showRuntimeActivityCounters,
    showBackgroundTerminalDropdown,
    showContextBadge,
    showRuntimeActivityCounters,
    showSubagentDropdown,
  };
}

function resolveSlashSuggestionsDisplayState(args: {
  resolvedSlashPlacement: "above" | "below";
  shouldShowSlashSuggestions: boolean;
  slashSuggestionsPortalStyle: CSSProperties | null;
}): {
  canRenderSlashSuggestionsInPortal: boolean;
  slashSuggestionsPositionClass: string;
} {
  const {
    resolvedSlashPlacement,
    shouldShowSlashSuggestions,
    slashSuggestionsPortalStyle,
  } = args;
  return {
    canRenderSlashSuggestionsInPortal:
      shouldShowSlashSuggestions &&
      slashSuggestionsPortalStyle !== null &&
      typeof document !== "undefined" &&
      Boolean(document.body),
    slashSuggestionsPositionClass:
      resolvedSlashPlacement === "below"
        ? "top-[calc(100%+4px)]"
        : "bottom-[calc(100%+4px)]",
  };
}

function useChatComposerMetaState(args: {
  attachmentInputDisabled: boolean;
  contextUsageIsEstimated: boolean;
  contextUsedTokens?: number | null;
  contextWindowTokens?: number | null;
  dictationEnabledByProvider: boolean;
  dictationMode: "auto" | "browser" | "provider";
  dictationState: DictationState;
  executionControlVisibility: ChatExecutionControlVisibility;
  executionControls?: ChatExecutionControls;
  isDisabled: boolean;
  isSubmitDisabled: boolean;
  onProviderDictationTranscribe?: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  providerDictationLikelySupported: boolean;
  runtimeActivityCounts: ChatRuntimeActivityCounts;
  runtimeActivityDetails: ChatRuntimeActivityDetails;
  waitingForResponse: boolean;
}): {
  activeBackgroundTerminalEntries: ChatRuntimeActivityEntry[];
  activeBackgroundTerminals: number;
  activeSubagentEntries: ChatRuntimeActivityEntry[];
  activeSubagents: number;
  attachmentTooltipHandlers: FloatingBoxHandlers;
  canAutoUseProviderDictation: boolean;
  canBrowserDictate: boolean;
  canDictate: boolean;
  canProviderDictate: boolean;
  contextLabelPrefixCompact: string;
  contextLabelPrefixFull: string;
  contextRemainingValue: string | null;
  contextTooltipHandlers: FloatingBoxHandlers | null;
  dictationAriaLabel: string;
  dictationTooltipHandlers: FloatingBoxHandlers | null;
  handleContextBadgeToggle: () => void;
  permissionModeIconClassName: string;
  permissionTooltipHandlers: FloatingBoxHandlers | null;
  searchTooltipHandlers: FloatingBoxHandlers | null;
  shouldShowComposerMetaRow: boolean;
  showBackgroundTerminalDropdown: boolean;
  showPermissionControl: boolean;
  showRuntimeActivityCounters: boolean;
  showSearchControl: boolean;
  showSubagentDropdown: boolean;
  showThinkingControl: boolean;
  subagentTooltipHandlers: FloatingBoxHandlers | null;
  submitTooltipHandlers: FloatingBoxHandlers;
  thinkingIconClassName: string;
  thinkingTooltipHandlers: FloatingBoxHandlers | null;
  backgroundTerminalTooltipHandlers: FloatingBoxHandlers | null;
} {
  const {
    attachmentInputDisabled,
    contextUsageIsEstimated,
    contextUsedTokens,
    contextWindowTokens,
    dictationEnabledByProvider,
    dictationMode,
    dictationState,
    executionControlVisibility,
    executionControls,
    isDisabled,
    isSubmitDisabled,
    onProviderDictationTranscribe,
    providerDictationLikelySupported,
    runtimeActivityCounts,
    runtimeActivityDetails,
    waitingForResponse,
  } = args;
  const [contextBadgeMode, setContextBadgeMode] = useState<
    "percentage" | "tokens"
  >("percentage");
  const dictationSupported = Boolean(getSpeechRecognitionConstructor());
  const mediaRecorderSupported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const {
    canAutoUseProviderDictation,
    canBrowserDictate,
    canDictate,
    canProviderDictate,
  } = resolveDictationCapabilityState({
    dictationEnabledByProvider,
    dictationMode,
    dictationSupported,
    isDisabled,
    mediaRecorderSupported,
    onProviderDictationTranscribe,
    providerDictationLikelySupported,
  });
  const {
    showExecutionControls,
    showPermissionControl,
    showSearchControl,
    showThinkingControl,
  } = resolveExecutionControlState({
    executionControlVisibility,
    executionControls,
  });
  const permissionModeIconClassName = useMemo(() => {
    if (!executionControls) {
      return "text-setta-600 dark:text-setta-300";
    }
    if (executionControls.permissionMode === "yolo") {
      return "text-orange-500 dark:text-orange-400";
    }
    if (executionControls.permissionMode === "config_toml_custom") {
      return "text-amber-500 dark:text-amber-300";
    }
    return "text-setta-600 dark:text-setta-300";
  }, [executionControls?.permissionMode]);
  const thinkingIconClassName = useMemo(() => {
    if (!executionControls?.thinkingEnabled) {
      return "text-setta-600 dark:text-setta-300";
    }
    return "text-blue-600 dark:text-blue-400";
  }, [executionControls?.thinkingEnabled]);
  const normalizedContextWindowTokens = useMemo(() => {
    if (
      typeof contextWindowTokens !== "number" ||
      !Number.isFinite(contextWindowTokens)
    ) {
      return null;
    }
    return Math.max(0, Math.floor(contextWindowTokens));
  }, [contextWindowTokens]);
  const normalizedContextUsedTokens = useMemo(() => {
    if (
      typeof contextUsedTokens !== "number" ||
      !Number.isFinite(contextUsedTokens)
    ) {
      return null;
    }
    return Math.max(0, Math.floor(contextUsedTokens));
  }, [contextUsedTokens]);
  const remainingContextTokens = useMemo(() => {
    if (
      normalizedContextWindowTokens === null ||
      normalizedContextUsedTokens === null
    ) {
      return null;
    }
    return Math.max(
      0,
      normalizedContextWindowTokens - normalizedContextUsedTokens,
    );
  }, [normalizedContextUsedTokens, normalizedContextWindowTokens]);
  const remainingContextPercentage = useMemo(() => {
    if (remainingContextTokens === null) {
      return null;
    }
    if (
      normalizedContextWindowTokens === null ||
      normalizedContextWindowTokens <= 0
    ) {
      return 0;
    }
    const rawPercentage = Math.round(
      (remainingContextTokens / normalizedContextWindowTokens) * 100,
    );
    return Math.max(0, Math.min(100, rawPercentage));
  }, [normalizedContextWindowTokens, remainingContextTokens]);
  const contextRemainingValue = useMemo(() => {
    if (remainingContextTokens === null) {
      return null;
    }
    if (contextBadgeMode === "tokens") {
      return `~${formatCompactTokenCount(remainingContextTokens)}`;
    }
    if (remainingContextPercentage === null) {
      return null;
    }
    return `${remainingContextPercentage}%`;
  }, [contextBadgeMode, remainingContextPercentage, remainingContextTokens]);
  const { contextLabelPrefixCompact, contextLabelPrefixFull } =
    resolveContextLabelState(contextUsageIsEstimated);
  const activeBackgroundTerminalEntries =
    runtimeActivityDetails.activeBackgroundTerminals;
  const activeSubagentEntries = runtimeActivityDetails.activeSubagents;
  const activeBackgroundTerminals = useMemo(
    () =>
      Math.max(
        normalizeNonNegativeCount(
          runtimeActivityCounts.activeBackgroundTerminals,
        ),
        activeBackgroundTerminalEntries.length,
      ),
    [
      activeBackgroundTerminalEntries.length,
      runtimeActivityCounts.activeBackgroundTerminals,
    ],
  );
  const activeSubagents = useMemo(
    () =>
      Math.max(
        normalizeNonNegativeCount(runtimeActivityCounts.activeSubagents),
        activeSubagentEntries.length,
      ),
    [activeSubagentEntries.length, runtimeActivityCounts.activeSubagents],
  );
  const {
    shouldShowComposerMetaRow,
    showBackgroundTerminalDropdown,
    showContextBadge,
    showRuntimeActivityCounters,
    showSubagentDropdown,
  } = resolveRuntimeActivityVisibilityState({
    activeBackgroundTerminalEntries,
    activeBackgroundTerminals,
    activeSubagentEntries,
    activeSubagents,
    contextRemainingValue,
    showExecutionControls,
  });
  const attachmentTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Attachments",
        content: attachmentInputDisabled
          ? "Attachments are currently unavailable."
          : "Add files from your device or project.",
      }),
    [attachmentInputDisabled],
  );
  const submitTooltipHandlers = useMemo(() => {
    if (waitingForResponse) {
      return getFloatingBoxHandlers({
        title: "Stop response",
        content: "Interrupt the active response.",
      });
    }
    if (isSubmitDisabled) {
      return getFloatingBoxHandlers({
        title: "Send",
        content: "Enter a message to send.",
      });
    }
    return getFloatingBoxHandlers({
      title: "Send",
      content: "Submit this message.",
    });
  }, [isSubmitDisabled, waitingForResponse]);
  const thinkingTooltipHandlers = useMemo(() => {
    if (!showThinkingControl || !executionControls) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Thinking",
      content: executionControls.thinkingEnabled
        ? "Reasoning is enabled for new messages."
        : "Reasoning is disabled for new messages.",
    });
  }, [executionControls, showThinkingControl]);
  const permissionTooltipHandlers = useMemo(() => {
    if (!executionControls || !showPermissionControl) {
      return null;
    }
    const modeLabel = executionControls.permissionMode.replaceAll("_", " ");
    return getFloatingBoxHandlers({
      title: "Permissions",
      content: `Current mode: ${modeLabel}`,
    });
  }, [executionControls, showPermissionControl]);
  const dictationAriaLabel = useMemo(() => {
    if (dictationState === "listening") {
      return "Stop Mic";
    }
    if (dictationState === "transcribing") {
      return "Transcribing";
    }
    return "Mic";
  }, [dictationState]);
  const dictationTooltipHandlers = useMemo(() => {
    if (!canDictate) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Dictation",
      content: dictationAriaLabel,
    });
  }, [canDictate, dictationAriaLabel]);
  const backgroundTerminalTooltipHandlers = useMemo(() => {
    if (!showRuntimeActivityCounters) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Background terminals",
      content: showBackgroundTerminalDropdown
        ? `${activeBackgroundTerminals} active. Click to view running terminals.`
        : `${activeBackgroundTerminals} active`,
    });
  }, [
    activeBackgroundTerminals,
    showBackgroundTerminalDropdown,
    showRuntimeActivityCounters,
  ]);
  const subagentTooltipHandlers = useMemo(() => {
    if (!showRuntimeActivityCounters) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Subagents",
      content: showSubagentDropdown
        ? `${activeSubagents} active. Click to view running subagents.`
        : `${activeSubagents} active`,
    });
  }, [activeSubagents, showRuntimeActivityCounters, showSubagentDropdown]);
  const contextTooltipHandlers = useMemo(() => {
    if (!showContextBadge) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Context",
      content:
        contextBadgeMode === "tokens"
          ? "Click to show remaining context percentage."
          : "Click to show remaining context tokens.",
    });
  }, [contextBadgeMode, showContextBadge]);
  const searchTooltipHandlers = useMemo(() => {
    if (!showSearchControl || !executionControls) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Search",
      content: executionControls.searchEnabled
        ? "Search is enabled for new messages."
        : "Search is disabled for new messages.",
    });
  }, [executionControls, showSearchControl]);
  const handleContextBadgeToggle = useCallback(() => {
    setContextBadgeMode((current) =>
      current === "percentage" ? "tokens" : "percentage",
    );
  }, []);
  return {
    activeBackgroundTerminalEntries,
    activeBackgroundTerminals,
    activeSubagentEntries,
    activeSubagents,
    attachmentTooltipHandlers,
    backgroundTerminalTooltipHandlers,
    canAutoUseProviderDictation,
    canBrowserDictate,
    canDictate,
    canProviderDictate,
    contextLabelPrefixCompact,
    contextLabelPrefixFull,
    contextRemainingValue,
    contextTooltipHandlers,
    dictationAriaLabel,
    dictationTooltipHandlers,
    handleContextBadgeToggle,
    permissionModeIconClassName,
    permissionTooltipHandlers,
    searchTooltipHandlers,
    shouldShowComposerMetaRow,
    showBackgroundTerminalDropdown,
    showPermissionControl,
    showRuntimeActivityCounters,
    showSearchControl,
    showSubagentDropdown,
    showThinkingControl,
    subagentTooltipHandlers,
    submitTooltipHandlers,
    thinkingIconClassName,
    thinkingTooltipHandlers,
  };
}

function ChatThinkingControlButton(props: {
  executionControls: ChatExecutionControls;
  isDisabled: boolean;
  thinkingIconClassName: string;
  thinkingTooltipHandlers: FloatingBoxHandlers | null;
}) {
  const {
    executionControls,
    isDisabled,
    thinkingIconClassName,
    thinkingTooltipHandlers,
  } = props;
  return (
    <button
      type="button"
      aria-label="Thinking"
      aria-pressed={Boolean(executionControls.thinkingEnabled)}
      disabled={isDisabled}
      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
      onClick={() =>
        executionControls.onThinkingEnabledChange?.(
          !executionControls.thinkingEnabled,
        )
      }
      {...(thinkingTooltipHandlers ?? {})}
    >
      <BiSolidBrain size={12} className={thinkingIconClassName} />
    </button>
  );
}

function ChatPermissionModeControl(props: {
  executionControls: ChatExecutionControls;
  isDisabled: boolean;
  permissionModeIconClassName: string;
  permissionTooltipHandlers: FloatingBoxHandlers | null;
}) {
  const {
    executionControls,
    isDisabled,
    permissionModeIconClassName,
    permissionTooltipHandlers,
  } = props;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={isDisabled}
          aria-label={`${executionControls.permissionMode} permissions`}
          className="inline-flex h-5 w-5 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          {...(permissionTooltipHandlers ?? {})}
        >
          <IoMdKey size={12} className={permissionModeIconClassName} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-30 min-w-[220px] rounded-md border border-setta-200 bg-white p-1 text-xs shadow-xl dark:border-setta-700 dark:bg-setta-900"
        >
          {CHAT_PERMISSION_MODE_OPTIONS.map((mode) => (
            <DropdownMenu.Item
              key={mode.value}
              className={`cursor-pointer rounded px-2 py-1.5 transition-colors ${
                executionControls.permissionMode === mode.value
                  ? "bg-blue-600 text-white"
                  : "text-setta-700 hover:bg-setta-100 dark:text-setta-200 dark:hover:bg-setta-800"
              }`}
              onSelect={() =>
                executionControls.onPermissionModeChange(mode.value)
              }
            >
              {mode.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ChatBackgroundTerminalActivityControl(props: {
  activeBackgroundTerminalEntries: ChatRuntimeActivityEntry[];
  activeBackgroundTerminals: number;
  backgroundTerminalTooltipHandlers: FloatingBoxHandlers | null;
  showBackgroundTerminalDropdown: boolean;
}) {
  const {
    activeBackgroundTerminalEntries,
    activeBackgroundTerminals,
    backgroundTerminalTooltipHandlers,
    showBackgroundTerminalDropdown,
  } = props;
  const label = `${activeBackgroundTerminals} background terminal${
    activeBackgroundTerminals === 1 ? "" : "s"
  } active`;
  if (!showBackgroundTerminalDropdown) {
    return (
      <span
        data-chat-runtime-active-background-terminals="true"
        className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 dark:border-setta-700 dark:text-setta-300"
        aria-label={label}
        {...(backgroundTerminalTooltipHandlers ?? {})}
      >
        <FiTerminal size={10} />
        <span className="font-mono leading-none">
          {activeBackgroundTerminals}
        </span>
      </span>
    );
  }
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-chat-runtime-active-background-terminals="true"
          className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          aria-label={label}
          {...(backgroundTerminalTooltipHandlers ?? {})}
        >
          <FiTerminal size={10} />
          <span className="font-mono leading-none">
            {activeBackgroundTerminals}
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-30 min-w-[240px] max-w-[360px] rounded-md border border-setta-200 bg-white p-1 text-xs shadow-xl dark:border-setta-700 dark:bg-setta-900"
        >
          <DropdownMenu.Label className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Background terminals
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
          <div className="max-h-52 overflow-y-auto pb-1">
            {activeBackgroundTerminalEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded px-2 py-1.5 text-setta-700 dark:text-setta-200"
              >
                <p className="truncate text-[11px] font-medium" title={entry.label}>
                  {entry.label}
                </p>
                <p
                  className="mt-0.5 truncate text-[10px] uppercase tracking-[0.1em] text-setta-400 dark:text-setta-500"
                  title={`${entry.toolName} | ${entry.id}`}
                >
                  {entry.toolName} | {entry.id}
                </p>
              </div>
            ))}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ChatSubagentActivityControl(props: {
  activeSubagentEntries: ChatRuntimeActivityEntry[];
  activeSubagents: number;
  showSubagentDropdown: boolean;
  subagentTooltipHandlers: FloatingBoxHandlers | null;
}) {
  const {
    activeSubagentEntries,
    activeSubagents,
    showSubagentDropdown,
    subagentTooltipHandlers,
  } = props;
  const label = `${activeSubagents} subagent${
    activeSubagents === 1 ? "" : "s"
  } active`;
  if (!showSubagentDropdown) {
    return (
      <span
        data-chat-runtime-active-subagents="true"
        className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 dark:border-setta-700 dark:text-setta-300"
        aria-label={label}
        {...(subagentTooltipHandlers ?? {})}
      >
        <FiCpu size={10} />
        <span className="font-mono leading-none">{activeSubagents}</span>
      </span>
    );
  }
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-chat-runtime-active-subagents="true"
          className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          aria-label={label}
          {...(subagentTooltipHandlers ?? {})}
        >
          <FiCpu size={10} />
          <span className="font-mono leading-none">{activeSubagents}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-30 min-w-[240px] max-w-[360px] rounded-md border border-setta-200 bg-white p-1 text-xs shadow-xl dark:border-setta-700 dark:bg-setta-900"
        >
          <DropdownMenu.Label className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Subagents
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
          <div className="max-h-52 overflow-y-auto pb-1">
            {activeSubagentEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded px-2 py-1.5 text-setta-700 dark:text-setta-200"
              >
                <p className="truncate text-[11px] font-medium" title={entry.label}>
                  {entry.label}
                </p>
                <p
                  className="mt-0.5 truncate text-[10px] uppercase tracking-[0.1em] text-setta-400 dark:text-setta-500"
                  title={`${entry.toolName} | ${entry.id}`}
                >
                  {entry.toolName} | {entry.id}
                </p>
              </div>
            ))}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ChatSearchControl(props: {
  executionControls: ChatExecutionControls;
  isDisabled: boolean;
  searchTooltipHandlers: FloatingBoxHandlers | null;
}) {
  const { executionControls, isDisabled, searchTooltipHandlers } = props;
  return (
    <button
      type="button"
      aria-pressed={Boolean(executionControls.searchEnabled)}
      disabled={isDisabled}
      className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] transition-colors ${
        executionControls.searchEnabled
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-setta-200 text-setta-600 hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
      } disabled:cursor-not-allowed disabled:opacity-60`}
      onClick={() =>
        executionControls.onSearchEnabledChange?.(
          !executionControls.searchEnabled,
        )
      }
      {...(searchTooltipHandlers ?? {})}
    >
      Search
    </button>
  );
}

function ChatContextBadge(props: {
  contextLabelPrefixCompact: string;
  contextLabelPrefixFull: string;
  contextRemainingValue: string | null;
  contextTooltipHandlers: FloatingBoxHandlers | null;
  handleContextBadgeToggle: () => void;
}) {
  const {
    contextLabelPrefixCompact,
    contextLabelPrefixFull,
    contextRemainingValue,
    contextTooltipHandlers,
    handleContextBadgeToggle,
  } = props;
  if (!contextRemainingValue) {
    return null;
  }
  return (
    <button
      type="button"
      className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-setta-400 transition-colors hover:bg-setta-100 hover:text-setta-600 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-300"
      aria-label={`${contextLabelPrefixFull} ${contextRemainingValue}`}
      onClick={handleContextBadgeToggle}
      {...(contextTooltipHandlers ?? {})}
    >
      <span className="hidden @[30rem]:inline" aria-hidden="true">
        {contextLabelPrefixFull}
      </span>
      <span className="@[30rem]:hidden" aria-hidden="true">
        {contextLabelPrefixCompact}
      </span>
      <span className="ml-1" aria-hidden="true">
        {contextRemainingValue}
      </span>
    </button>
  );
}

function ChatComposerMetaSection(props: {
  activeBackgroundTerminalEntries: ChatRuntimeActivityEntry[];
  activeBackgroundTerminals: number;
  activeSubagentEntries: ChatRuntimeActivityEntry[];
  activeSubagents: number;
  backgroundTerminalTooltipHandlers: FloatingBoxHandlers | null;
  contextLabelPrefixCompact: string;
  contextLabelPrefixFull: string;
  contextRemainingValue: string | null;
  contextTooltipHandlers: FloatingBoxHandlers | null;
  executionControls?: ChatExecutionControls;
  handleContextBadgeToggle: () => void;
  isDisabled: boolean;
  permissionModeIconClassName: string;
  permissionTooltipHandlers: FloatingBoxHandlers | null;
  searchTooltipHandlers: FloatingBoxHandlers | null;
  shouldShowComposerMetaRow: boolean;
  showBackgroundTerminalDropdown: boolean;
  showPermissionControl: boolean;
  showRuntimeActivityCounters: boolean;
  showSearchControl: boolean;
  showSubagentDropdown: boolean;
  showThinkingControl: boolean;
  subagentTooltipHandlers: FloatingBoxHandlers | null;
  thinkingIconClassName: string;
  thinkingTooltipHandlers: FloatingBoxHandlers | null;
}) {
  const {
    activeBackgroundTerminalEntries,
    activeBackgroundTerminals,
    activeSubagentEntries,
    activeSubagents,
    backgroundTerminalTooltipHandlers,
    contextLabelPrefixCompact,
    contextLabelPrefixFull,
    contextRemainingValue,
    contextTooltipHandlers,
    executionControls,
    handleContextBadgeToggle,
    isDisabled,
    permissionModeIconClassName,
    permissionTooltipHandlers,
    searchTooltipHandlers,
    shouldShowComposerMetaRow,
    showBackgroundTerminalDropdown,
    showPermissionControl,
    showRuntimeActivityCounters,
    showSearchControl,
    showSubagentDropdown,
    showThinkingControl,
    subagentTooltipHandlers,
    thinkingIconClassName,
    thinkingTooltipHandlers,
  } = props;
  if (!shouldShowComposerMetaRow) {
    return null;
  }
  return (
    <div className="mb-0.5 flex items-center justify-between gap-2 [&_button]:cursor-pointer">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {showThinkingControl && executionControls ? (
          <ChatThinkingControlButton
            executionControls={executionControls}
            isDisabled={isDisabled}
            thinkingIconClassName={thinkingIconClassName}
            thinkingTooltipHandlers={thinkingTooltipHandlers}
          />
        ) : null}
        {showPermissionControl && executionControls ? (
          <ChatPermissionModeControl
            executionControls={executionControls}
            isDisabled={isDisabled}
            permissionModeIconClassName={permissionModeIconClassName}
            permissionTooltipHandlers={permissionTooltipHandlers}
          />
        ) : null}
        {showRuntimeActivityCounters ? (
          <div className="inline-flex items-center gap-1">
            <ChatBackgroundTerminalActivityControl
              activeBackgroundTerminalEntries={activeBackgroundTerminalEntries}
              activeBackgroundTerminals={activeBackgroundTerminals}
              backgroundTerminalTooltipHandlers={
                backgroundTerminalTooltipHandlers
              }
              showBackgroundTerminalDropdown={showBackgroundTerminalDropdown}
            />
            <ChatSubagentActivityControl
              activeSubagentEntries={activeSubagentEntries}
              activeSubagents={activeSubagents}
              showSubagentDropdown={showSubagentDropdown}
              subagentTooltipHandlers={subagentTooltipHandlers}
            />
          </div>
        ) : null}
        {showSearchControl && executionControls ? (
          <ChatSearchControl
            executionControls={executionControls}
            isDisabled={isDisabled}
            searchTooltipHandlers={searchTooltipHandlers}
          />
        ) : null}
      </div>
      <ChatContextBadge
        contextLabelPrefixCompact={contextLabelPrefixCompact}
        contextLabelPrefixFull={contextLabelPrefixFull}
        contextRemainingValue={contextRemainingValue}
        contextTooltipHandlers={contextTooltipHandlers}
        handleContextBadgeToggle={handleContextBadgeToggle}
      />
    </div>
  );
}

function ChatAttachmentMenuControl(props: {
  attachmentCountLabel: string;
  attachmentInputDisabled: boolean;
  attachmentTooltipHandlers: FloatingBoxHandlers;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  handlePickFromProject: () => void;
  isDeploymentMode: boolean;
}) {
  const {
    attachmentCountLabel,
    attachmentInputDisabled,
    attachmentTooltipHandlers,
    fileInputRef,
    handlePickFromProject,
    isDeploymentMode,
  } = props;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Attachment options"
          className={`absolute left-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200 ${
            attachmentInputDisabled
              ? "cursor-not-allowed opacity-40 hover:bg-transparent"
              : "cursor-pointer"
          }`}
          disabled={attachmentInputDisabled}
          {...attachmentTooltipHandlers}
        >
          <IoAdd />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-30 flex min-w-[170px] flex-col gap-1 rounded-lg border border-setta-200 bg-white p-2 text-xs font-semibold text-setta-600 shadow-xl dark:border-setta-700/70 dark:bg-setta-900 dark:text-setta-200"
        >
          <DropdownMenu.Label className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            {attachmentCountLabel}
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-setta-100 hover:text-setta-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 dark:hover:bg-setta-800 dark:hover:text-white"
            onSelect={() => fileInputRef.current?.click()}
            disabled={attachmentInputDisabled}
          >
            <IoAttach />
            Attach
          </DropdownMenu.Item>
          {!isDeploymentMode ? (
            <DropdownMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-setta-100 hover:text-setta-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 dark:hover:bg-setta-800 dark:hover:text-white"
              onSelect={handlePickFromProject}
              disabled={attachmentInputDisabled}
            >
              <IoFolderOpen />
              Project
            </DropdownMenu.Item>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ChatDictationControl(props: {
  canDictate: boolean;
  dictationAriaLabel: string;
  dictationState: DictationState;
  dictationTooltipHandlers: FloatingBoxHandlers | null;
  handleDictationToggle: () => void;
  isDisabled: boolean;
}) {
  const {
    canDictate,
    dictationAriaLabel,
    dictationState,
    dictationTooltipHandlers,
    handleDictationToggle,
    isDisabled,
  } = props;
  if (!canDictate) {
    return null;
  }
  return (
    <button
      type="button"
      aria-label={dictationAriaLabel}
      aria-pressed={dictationState === "listening"}
      disabled={isDisabled || dictationState === "transcribing"}
      className={`absolute left-7 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
        dictationState === "listening"
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200"
          : "text-setta-500 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
      } ${
        dictationState === "transcribing"
          ? "cursor-not-allowed opacity-40"
          : "cursor-pointer"
      }`}
      onClick={handleDictationToggle}
      {...(dictationTooltipHandlers ?? {})}
    >
      <IoMic
        size={11}
        className={dictationState === "listening" ? "animate-pulse" : undefined}
      />
    </button>
  );
}

function ChatComposerFieldSection(props: {
  attachmentCountLabel: string;
  attachmentInputDisabled: boolean;
  attachmentTooltipHandlers: FloatingBoxHandlers;
  buttonClassName: string;
  buttonIcon: ReactNode;
  canDictate: boolean;
  canRenderSlashSuggestionsInPortal: boolean;
  dictationAriaLabel: string;
  dictationState: DictationState;
  dictationTooltipHandlers: FloatingBoxHandlers | null;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  handleChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  handleDictationToggle: () => void;
  handleFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePickFromProject: () => void;
  inputValue: string;
  isDeploymentMode: boolean;
  isDisabled: boolean;
  isSubmitDisabled: boolean;
  placeholderText: string | undefined;
  shouldShowSlashSuggestions: boolean;
  slashSuggestionsList: ReactNode;
  slashSuggestionsPositionClass: string;
  submitTooltipHandlers: FloatingBoxHandlers;
  textAreaClassName: string;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  waitingForResponse: boolean;
}) {
  const {
    attachmentCountLabel,
    attachmentInputDisabled,
    attachmentTooltipHandlers,
    buttonClassName,
    buttonIcon,
    canDictate,
    canRenderSlashSuggestionsInPortal,
    dictationAriaLabel,
    dictationState,
    dictationTooltipHandlers,
    fileInputRef,
    handleChange,
    handleDictationToggle,
    handleFileInputChange,
    handleKeyDown,
    handlePickFromProject,
    inputValue,
    isDeploymentMode,
    isDisabled,
    isSubmitDisabled,
    placeholderText,
    shouldShowSlashSuggestions,
    slashSuggestionsList,
    slashSuggestionsPositionClass,
    submitTooltipHandlers,
    textAreaClassName,
    textareaRef,
    waitingForResponse,
  } = props;
  return (
    <div className="group relative my-1 w-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
        disabled={attachmentInputDisabled}
      />
      <ChatAttachmentMenuControl
        attachmentCountLabel={attachmentCountLabel}
        attachmentInputDisabled={attachmentInputDisabled}
        attachmentTooltipHandlers={attachmentTooltipHandlers}
        fileInputRef={fileInputRef}
        handlePickFromProject={handlePickFromProject}
        isDeploymentMode={isDeploymentMode}
      />
      <ChatDictationControl
        canDictate={canDictate}
        dictationAriaLabel={dictationAriaLabel}
        dictationState={dictationState}
        dictationTooltipHandlers={dictationTooltipHandlers}
        handleDictationToggle={handleDictationToggle}
        isDisabled={isDisabled}
      />
      <textarea
        ref={textareaRef}
        data-testid="chat-input-textarea"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholderText}
        className={`${textAreaClassName} ${canDictate ? "pl-14" : "pl-9"}`}
        disabled={isDisabled}
      />
      <button
        type="submit"
        aria-label={waitingForResponse ? "Stop response" : "Send message"}
        disabled={isSubmitDisabled}
        className={`absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${buttonClassName} disabled:opacity-40`}
        {...submitTooltipHandlers}
      >
        {buttonIcon}
      </button>
      {shouldShowSlashSuggestions && !canRenderSlashSuggestionsInPortal ? (
        <div
          className={`absolute left-1 right-1 z-20 max-h-52 overflow-y-auto overflow-x-hidden rounded-md border border-setta-200 bg-white p-1 shadow-lg dark:border-setta-700 dark:bg-setta-900 ${slashSuggestionsPositionClass}`}
        >
          {slashSuggestionsList}
        </div>
      ) : null}
    </div>
  );
}

export const ChatInput = memo(function ChatInput({
  placeholderText,
  waitingForResponse,
  disabled = false,
  submitDisabled = false,
  hasRetainedImageAttachmentForImageMode = false,
  value,
  onChange,
  onSubmit,
  submitReadinessKey = null,
  onUnknownSlashCommand,
  onStop,
  executionControls,
  executionControlVisibility = DEFAULT_EXECUTION_CONTROL_VISIBILITY,
  slashCommands = CHAT_SLASH_COMMANDS,
  recognizedSlashCommands,
  onSlashCommand,
  slashSuggestionsPlacement = "auto",
  dictationMode = "auto",
  onProviderDictationTranscribe,
  dictationEnabledByProvider = true,
  providerDictationLikelySupported = true,
  contextWindowTokens = null,
  contextUsedTokens = null,
  contextUsageIsEstimated = false,
  submittedMessageHistory = DEFAULT_SUBMITTED_MESSAGE_HISTORY,
  runtimeActivityCounts = DEFAULT_RUNTIME_ACTIVITY_COUNTS,
  runtimeActivityDetails = DEFAULT_RUNTIME_ACTIVITY_DETAILS,
}: ChatInputProps) {
  const [internalValue, setInternalValue] = useState("");
  const [slashFeedback, setSlashFeedback] = useState<string | null>(null);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [resolvedSlashPlacement, setResolvedSlashPlacement] = useState<
    "above" | "below"
  >(slashSuggestionsPlacement === "above" ? "above" : "below");
  const [slashSuggestionsPortalStyle, setSlashSuggestionsPortalStyle] =
    useState<CSSProperties | null>(null);
  const [dictationState, setDictationState] = useState<DictationState>("idle");
  const [dictationFeedback, setDictationFeedback] = useState<string | null>(
    null,
  );
  const [queuedDrafts, setQueuedDrafts] = useState<QueuedChatDraft[]>([]);
  const [queuedAutoReplayVersion, setQueuedAutoReplayVersion] = useState(0);
  const [selectedQueuedDraftId, setSelectedQueuedDraftId] = useState<
    string | null
  >(null);
  const [selectedSubmittedMessageIndex, setSelectedSubmittedMessageIndex] =
    useState<number | null>(null);
  const submittedHistoryDraftBeforeSelectionRef = useRef<string | null>(null);
  const {
    attachments,
    attachmentActionsDisabled,
    attachmentCountLabel,
    attachmentInputDisabled,
    attachmentWarning,
    clearAttachments,
    replaceAttachments,
    fileInputRef,
    handleClearAttachments,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
    handlePickFromProject,
    handleRemoveAttachment,
    isDragActive,
    isDeploymentMode,
    isUploading,
    showAttachmentDisabledMessage,
    showSharePolicyMessage,
  } = useChatAttachmentManager({ disabled });
  const {
    inputValue,
    isControlled,
    isDisabled,
    isSubmitDisabled,
    slashCommandRecognitionSet,
  } = resolveChatInputControlState({
    disabled,
    internalValue,
    isUploading,
    onChange,
    recognizedSlashCommands,
    slashCommands,
    submitDisabled,
    value,
  });
  const inputValueRef = useRef(inputValue);
  const attachmentsRef = useRef<ChatFileAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const providerRecorderRef = useRef<MediaRecorder | null>(null);
  const providerStreamRef = useRef<MediaStream | null>(null);
  const providerChunksRef = useRef<Array<BlobPart>>([]);
  const dictationSourceRef = useRef<"browser" | "provider" | null>(null);
  const queuedDraftIdRef = useRef(0);
  const queuedDispatchInFlightRef = useRef(false);
  const stopRequestedForCurrentResponseRef = useRef(false);
  const escClearedComposerDraftRef = useRef<EscClearedComposerDraft | null>(
    null,
  );
  const optimisticSubmitTokenRef = useRef(0);
  const activeOptimisticSubmitTokenRef = useRef<number | null>(null);
  const componentMountedRef = useRef(true);
  const queuedReplayInputsSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  useEffect(() => {
    return () => {
      componentMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!waitingForResponse) {
      stopRequestedForCurrentResponseRef.current = false;
    }
  }, [waitingForResponse]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const setInputValue = useCallback(
    (nextValue: string) => {
      inputValueRef.current = nextValue;
      if (isControlled) {
        onChange?.(nextValue);
        return;
      }
      setInternalValue(nextValue);
      onChange?.(nextValue);
    },
    [isControlled, onChange],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      escClearedComposerDraftRef.current = null;
      if (selectedSubmittedMessageIndex !== null) {
        setSelectedSubmittedMessageIndex(null);
        submittedHistoryDraftBeforeSelectionRef.current = null;
      }
      setInputValue(event.target.value);
      setSlashFeedback(null);
    },
    [selectedSubmittedMessageIndex, setInputValue],
  );

  const clearInput = useCallback(() => {
    setSelectedSubmittedMessageIndex(null);
    submittedHistoryDraftBeforeSelectionRef.current = null;
    setInputValue("");
  }, [setInputValue]);

  const clearComposerForOptimisticSubmit = useCallback((): number => {
    optimisticSubmitTokenRef.current += 1;
    const submitToken = optimisticSubmitTokenRef.current;
    activeOptimisticSubmitTokenRef.current = submitToken;
    escClearedComposerDraftRef.current = null;
    clearInput();
    attachmentsRef.current = [];
    clearAttachments();
    return submitToken;
  }, [clearAttachments, clearInput]);

  const finalizeOptimisticSubmit = useCallback((submitToken: number) => {
    if (activeOptimisticSubmitTokenRef.current === submitToken) {
      activeOptimisticSubmitTokenRef.current = null;
    }
  }, []);

  const restoreOptimisticallyClearedDraft = useCallback(
    ({
      draft,
      submitToken,
    }: {
      draft: EscClearedComposerDraft;
      submitToken: number;
    }): boolean => {
      if (activeOptimisticSubmitTokenRef.current !== submitToken) {
        return false;
      }
      if (
        inputValueRef.current.trim().length > 0 ||
        attachmentsRef.current.length > 0
      ) {
        return false;
      }
      activeOptimisticSubmitTokenRef.current = null;
      setSelectedSubmittedMessageIndex(null);
      submittedHistoryDraftBeforeSelectionRef.current = null;
      const restoredAttachments = cloneAttachments(draft.attachments);
      setInputValue(draft.message);
      attachmentsRef.current = restoredAttachments;
      replaceAttachments(restoredAttachments);
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) {
          return;
        }
        const end = draft.message.length;
        node.focus();
        node.setSelectionRange(end, end);
      });
      return true;
    },
    [replaceAttachments, setInputValue],
  );

  const submitRemotely = useCallback(
    async ({
      draftToRestore,
      message,
      submittedAttachments,
      options,
      fallbackFailureResult,
    }: {
      draftToRestore?: EscClearedComposerDraft;
      message: string;
      submittedAttachments: ChatFileAttachment[];
      options?: ChatSubmitOptions;
      fallbackFailureResult: Exclude<ChatSubmitDispatchResult, "submitted">;
    }): Promise<ChatSubmitDispatchResult> => {
      const submissionDraft: EscClearedComposerDraft = draftToRestore ?? {
        message,
        attachments: cloneAttachments(submittedAttachments),
      };
      const submitToken = clearComposerForOptimisticSubmit();
      try {
        const submitOutcome = resolveChatSubmitDispatchResult(
          await onSubmit(message, submittedAttachments, options),
          fallbackFailureResult,
        );
        if (submitOutcome === "submitted") {
          finalizeOptimisticSubmit(submitToken);
          return "submitted";
        }
        restoreOptimisticallyClearedDraft({
          draft: submissionDraft,
          submitToken,
        });
        return submitOutcome;
      } catch (error) {
        restoreOptimisticallyClearedDraft({
          draft: submissionDraft,
          submitToken,
        });
        throw error;
      }
    },
    [
      clearComposerForOptimisticSubmit,
      finalizeOptimisticSubmit,
      onSubmit,
      restoreOptimisticallyClearedDraft,
    ],
  );

  const submittedMessageHistoryEntries = useMemo(() => {
    const seen = new Set<string>();
    const entries: string[] = [];
    for (const submittedMessage of submittedMessageHistory) {
      const trimmed = submittedMessage.trim();
      if (!trimmed) {
        continue;
      }
      if (seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      entries.push(trimmed);
    }
    return entries;
  }, [submittedMessageHistory]);

  const getNextQueuedDraftId = useCallback(() => {
    queuedDraftIdRef.current += 1;
    return `queued-draft-${queuedDraftIdRef.current}`;
  }, []);

  const queuedDraftReplayInputsSignature = useMemo(
    () =>
      buildQueuedDraftReplayInputsSignature({
        isSubmitDisabled,
        recognizedSlashCommands: slashCommandRecognitionSet,
        slashCommands,
        submitReadinessKey,
        waitingForResponse,
      }),
    [
      isSubmitDisabled,
      slashCommandRecognitionSet,
      slashCommands,
      submitReadinessKey,
      waitingForResponse,
    ],
  );

  useEffect(() => {
    if (queuedReplayInputsSignatureRef.current === null) {
      queuedReplayInputsSignatureRef.current = queuedDraftReplayInputsSignature;
      return;
    }
    if (
      queuedReplayInputsSignatureRef.current ===
      queuedDraftReplayInputsSignature
    ) {
      return;
    }
    queuedReplayInputsSignatureRef.current = queuedDraftReplayInputsSignature;
    setQueuedAutoReplayVersion((current) => current + 1);
  }, [queuedDraftReplayInputsSignature]);

  const enqueueDraft = useCallback(
    ({
      message,
      draftAttachments,
      prioritize,
      interruptCurrentRun,
      feedback,
    }: {
      message: string;
      draftAttachments: ChatFileAttachment[];
      prioritize: boolean;
      interruptCurrentRun: boolean;
      feedback: string;
    }): boolean => {
      const trimmed = message.trim();
      if (trimmed.length === 0 && draftAttachments.length === 0) {
        return false;
      }
      const nextDraft: QueuedChatDraft = {
        id: getNextQueuedDraftId(),
        message,
        attachments: cloneAttachments(draftAttachments),
        replaySnapshot: buildQueuedDraftReplaySnapshot({
          message,
          recognizedSlashCommands: slashCommandRecognitionSet,
          slashCommands,
        }),
        queuedAtMs: Date.now(),
        replayState: "ready",
        lastAutoReplayVersion: null,
      };
      escClearedComposerDraftRef.current = null;
      setQueuedDrafts((current) =>
        enqueueQueuedDraft(current, nextDraft, prioritize),
      );
      setSelectedQueuedDraftId(nextDraft.id);
      setSlashFeedback(feedback);
      clearInput();
      clearAttachments();
      if (interruptCurrentRun && onStop) {
        stopRequestedForCurrentResponseRef.current = true;
        void onStop();
      }
      return true;
    },
    [
      clearAttachments,
      clearInput,
      getNextQueuedDraftId,
      onStop,
      slashCommandRecognitionSet,
      slashCommands,
    ],
  );

  const restoreQueuedDraftToComposer = useCallback(
    (draftId: string) => {
      const draft = queuedDrafts.find((item) => item.id === draftId);
      if (!draft) {
        return;
      }
      escClearedComposerDraftRef.current = null;
      setQueuedDrafts((current) =>
        current.filter((item) => item.id !== draftId),
      );
      setSelectedQueuedDraftId(null);
      setInputValue(draft.message);
      replaceAttachments(cloneAttachments(draft.attachments));
      setSlashFeedback("Editing queued message.");
      focusComposerTextareaAtEnd(textareaRef, draft.message);
    },
    [queuedDrafts, replaceAttachments, setInputValue, textareaRef],
  );

  useEffect(() => {
    const nextSelectedQueuedDraftId = resolveSelectedQueuedDraftId(
      queuedDrafts,
      selectedQueuedDraftId,
    );
    if (nextSelectedQueuedDraftId === selectedQueuedDraftId) {
      return;
    }
    setSelectedQueuedDraftId(nextSelectedQueuedDraftId);
  }, [queuedDrafts, selectedQueuedDraftId]);

  useEffect(() => {
    if (selectedSubmittedMessageIndex === null) {
      return;
    }
    if (
      submittedMessageHistoryEntries.length === 0 ||
      selectedSubmittedMessageIndex >= submittedMessageHistoryEntries.length
    ) {
      setSelectedSubmittedMessageIndex(null);
      submittedHistoryDraftBeforeSelectionRef.current = null;
    }
  }, [selectedSubmittedMessageIndex, submittedMessageHistoryEntries.length]);

  const restoreDraftFromSubmittedHistorySelection = useCallback(() => {
    const draftToRestore =
      submittedHistoryDraftBeforeSelectionRef.current ?? "";
    submittedHistoryDraftBeforeSelectionRef.current = null;
    escClearedComposerDraftRef.current = null;
    setSelectedSubmittedMessageIndex(null);
    setInputValue(draftToRestore);
    setSlashFeedback(null);
    focusComposerTextareaAtEnd(textareaRef, draftToRestore);
  }, [setInputValue, textareaRef]);

  const clearComposerByEscape = useCallback((): boolean => {
    const currentMessage = inputValueRef.current;
    const nextAttachments = cloneAttachments(attachments);
    const hasComposerDraft =
      currentMessage.trim().length > 0 || nextAttachments.length > 0;
    if (!hasComposerDraft) {
      return false;
    }
    escClearedComposerDraftRef.current = {
      message: currentMessage,
      attachments: nextAttachments,
    };
    clearInput();
    clearAttachments();
    setSlashFeedback(null);
    return true;
  }, [attachments, clearAttachments, clearInput]);

  const restoreEscClearedComposerDraft = useCallback((): boolean => {
    const draft = escClearedComposerDraftRef.current;
    if (!draft) {
      return false;
    }
    escClearedComposerDraftRef.current = null;
    setSelectedSubmittedMessageIndex(null);
    submittedHistoryDraftBeforeSelectionRef.current = null;
    setInputValue(draft.message);
    replaceAttachments(cloneAttachments(draft.attachments));
    setSlashFeedback("Restored cleared draft.");
    focusComposerTextareaAtEnd(textareaRef, draft.message);
    return true;
  }, [replaceAttachments, setInputValue, textareaRef]);

  const executeResolvedSlashCommand = useCallback(
    async ({
      message,
      submittedAttachments,
      parsed,
      commandAvailable,
    }: {
      message: string;
      submittedAttachments: ChatFileAttachment[];
      parsed: ChatSlashCommand;
      commandAvailable: boolean;
    }): Promise<SlashCommandExecutionOutcome> => {
      if (!commandAvailable) {
        setSlashFeedback(buildUnavailableSlashCommandFeedback(parsed));
        return "retry_later";
      }
      if (parsed.action === "custom_prompt") {
        return submitPromptTemplateSlashCommand({
          fallbackFailureResult: "retry_later",
          failureFeedback: `Failed to submit ${parsed.command}.`,
          hasRetainedImageAttachmentForImageMode,
          message,
          missingPromptFeedback: "Custom slash command has no prompt content.",
          options: resolveSlashCommandSubmitOptions(parsed),
          parsed,
          setSlashFeedback,
          submitRemotely,
          submittedAttachments,
          successFeedback: `Submitted ${parsed.command}`,
        });
      }
      if (parsed.action === "native_prompt") {
        return submitNativeSlashCommand({
          failureFeedback: `Failed to submit ${parsed.command}.`,
          message,
          parsed,
          setSlashFeedback,
          submitRemotely,
          submittedAttachments,
          successFeedback: `Submitted ${parsed.command}`,
        });
      }
      return executeRegisteredSlashCommand({
        clearAttachments,
        clearInput,
        hasRetainedImageAttachmentForImageMode,
        message,
        onSlashCommand,
        parsed,
        resetEscClearedDraft: () => {
          escClearedComposerDraftRef.current = null;
        },
        setSlashFeedback,
        submitRemotely,
        submittedAttachments,
      });
    },
    [
      clearAttachments,
      clearInput,
      hasRetainedImageAttachmentForImageMode,
      onSlashCommand,
      onSubmit,
    ],
  );

  const runSlashCommand = useCallback(
    async (
      message: string,
      submittedAttachments: ChatFileAttachment[],
    ): Promise<SlashCommandExecutionOutcome> => {
      const resolvedRequest = resolveSlashCommandRequest({
        message,
        slashCommands,
        recognizedSlashCommands: slashCommandRecognitionSet,
      });
      if (resolvedRequest.parsed) {
        return executeResolvedSlashCommand({
          message,
          submittedAttachments,
          parsed: resolvedRequest.parsed,
          commandAvailable: resolvedRequest.commandAvailable,
        });
      }
      return handleUnknownSlashCommand({
        clearAttachments,
        clearInput,
        executeResolvedSlashCommand,
        message,
        onUnknownSlashCommand,
        resetEscClearedDraft: () => {
          escClearedComposerDraftRef.current = null;
        },
        setSlashFeedback,
        submittedAttachments,
      });
    },
    [
      clearAttachments,
      clearInput,
      executeResolvedSlashCommand,
      onUnknownSlashCommand,
      slashCommandRecognitionSet,
      slashCommands,
    ],
  );

  const submitMessage = useCallback(
    async (
      submittedValue: string,
      submittedAttachments: ChatFileAttachment[],
    ): Promise<SlashCommandExecutionOutcome> =>
      submitChatInputMessage({
        enqueueDraft,
        isSubmitDisabled,
        onStop,
        runSlashCommand,
        submitRemotely,
        submittedAttachments,
        submittedValue,
        waitingForResponse,
      }),
    [
      enqueueDraft,
      isSubmitDisabled,
      onStop,
      runSlashCommand,
      submitRemotely,
      waitingForResponse,
    ],
  );

  const replayQueuedDraft = useCallback(
    async (draft: QueuedChatDraft): Promise<SlashCommandExecutionOutcome> => {
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
    },
    [executeResolvedSlashCommand, slashCommands, submitMessage],
  );

  const nextQueuedDraft = queuedDrafts[0] ?? null;

  useEffect(() => {
    if (!nextQueuedDraft) {
      return;
    }
    if (waitingForResponse || isSubmitDisabled) {
      return;
    }
    if (queuedDispatchInFlightRef.current) {
      return;
    }
    if (
      !shouldAutoReplayQueuedDraft(nextQueuedDraft, queuedAutoReplayVersion)
    ) {
      return;
    }
    const draftToSend = nextQueuedDraft;
    queuedDispatchInFlightRef.current = true;
    setQueuedDrafts((current) =>
      current.filter((item) => item.id !== draftToSend.id),
    );
    setSelectedQueuedDraftId((current) =>
      current === draftToSend.id ? null : current,
    );
    void (async () => {
      let outcome: SlashCommandExecutionOutcome = "failed";
      try {
        outcome = await replayQueuedDraft(draftToSend);
      } catch {
        outcome = "failed";
      }
      if (!componentMountedRef.current) {
        queuedDispatchInFlightRef.current = false;
        return;
      }
      queuedDispatchInFlightRef.current = false;
      if (shouldRemoveQueuedDraft(outcome)) {
        return;
      }
      setQueuedDrafts((current) =>
        enqueueQueuedDraft(
          current,
          {
            ...draftToSend,
            replayState: outcome === "retry_later" ? "retry_later" : "failed",
            lastAutoReplayVersion: queuedAutoReplayVersion,
          },
          true,
        ),
      );
      setSelectedQueuedDraftId(draftToSend.id);
      if (outcome === "failed") {
        setSlashFeedback("Queued message failed. Edit it and retry.");
      }
    })();
  }, [
    isSubmitDisabled,
    nextQueuedDraft,
    queuedAutoReplayVersion,
    replayQueuedDraft,
    waitingForResponse,
  ]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await submitMessage(inputValue, attachments);
    },
    [attachments, inputValue, submitMessage],
  );

  const handleFormKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) =>
      handleChatInputFormKeyDown({
        event,
        onStop,
        stopRequestedForCurrentResponseRef,
        waitingForResponse,
      }),
    [onStop, waitingForResponse],
  );

  const slashSuggestions = useMemo(
    () => getSlashCommandSuggestions(inputValue, slashCommands),
    [inputValue, slashCommands],
  );

  const shouldShowSlashSuggestions = useMemo(() => {
    if (slashSuggestions.length === 0) {
      return false;
    }
    return /^\/[^\s]*$/u.test(inputValue.trimStart());
  }, [inputValue, slashSuggestions.length]);

  useEffect(() => {
    if (!shouldShowSlashSuggestions) {
      setActiveSlashIndex(0);
      return;
    }
    setActiveSlashIndex((current) =>
      Math.min(current, Math.max(0, slashSuggestions.length - 1)),
    );
  }, [shouldShowSlashSuggestions, slashSuggestions.length]);

  const updateSlashSuggestionsLayout = useCallback(() => {
    if (!shouldShowSlashSuggestions) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const inputNode = textareaRef.current;
    if (!inputNode) {
      return;
    }
    const inputRect = inputNode.getBoundingClientRect();
    const spaceAbove = inputRect.top - SLASH_SUGGESTIONS_EDGE_PADDING_PX;
    const spaceBelow =
      window.innerHeight - inputRect.bottom - SLASH_SUGGESTIONS_EDGE_PADDING_PX;
    const estimatedMenuHeight = Math.min(
      SLASH_SUGGESTIONS_MAX_HEIGHT_PX,
      SLASH_SUGGESTIONS_BASE_HEIGHT_PX +
        slashSuggestions.length * SLASH_SUGGESTIONS_ROW_HEIGHT_PX,
    );
    const nextPlacement = resolveSlashSuggestionsPlacement({
      estimatedMenuHeight,
      slashSuggestionsPlacement,
      spaceAbove,
      spaceBelow,
    });
    setResolvedSlashPlacement((current) =>
      current === nextPlacement ? current : nextPlacement,
    );
    const nextStyle = resolveSlashSuggestionsPortalStyle({
      inputRect,
      nextPlacement,
    });
    setSlashSuggestionsPortalStyle((current) => {
      if (areSlashSuggestionsPortalStylesEqual(current, nextStyle)) {
        return current;
      }
      return nextStyle;
    });
  }, [
    shouldShowSlashSuggestions,
    slashSuggestions.length,
    slashSuggestionsPlacement,
  ]);

  useEffect(() => {
    if (!shouldShowSlashSuggestions) {
      setSlashSuggestionsPortalStyle((current) =>
        current === null ? current : null,
      );
      setResolvedSlashPlacement(
        slashSuggestionsPlacement === "above" ? "above" : "below",
      );
      return;
    }
    updateSlashSuggestionsLayout();
    if (typeof window === "undefined") {
      return;
    }
    const handleViewportChange = () => {
      requestAnimationFrame(() => {
        updateSlashSuggestionsLayout();
      });
    };
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [
    shouldShowSlashSuggestions,
    slashSuggestionsPlacement,
    updateSlashSuggestionsLayout,
  ]);

  const applySlashSuggestion = useCallback(
    (index: number) => {
      const suggestion = slashSuggestions[index];
      if (!suggestion) {
        return;
      }
      setInputValue(`${suggestion.command} `);
      setActiveSlashIndex(index);
      setSlashFeedback(null);
      focusComposerTextareaAtEnd(textareaRef, `${suggestion.command} `);
    },
    [setInputValue, slashSuggestions, textareaRef],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) =>
      handleChatInputKeyDown({
        activeSlashIndex,
        applySlashSuggestion,
        attachments,
        clearComposerByEscape,
        enqueueDraft,
        event,
        inputValue,
        isSubmitDisabled,
        onStop,
        queuedDrafts,
        restoreDraftFromSubmittedHistorySelection,
        restoreEscClearedComposerDraft,
        restoreQueuedDraftToComposer,
        selectedQueuedDraftId,
        selectedSubmittedMessageIndex,
        setActiveSlashIndex,
        setInputValue,
        setSelectedQueuedDraftId,
        setSelectedSubmittedMessageIndex,
        setSlashFeedback,
        shouldShowSlashSuggestions,
        slashSuggestions,
        stopRequestedForCurrentResponseRef,
        submittedHistoryDraftBeforeSelectionRef,
        submittedMessageHistoryEntries,
        textareaRef,
        waitingForResponse,
      }),
    [
      activeSlashIndex,
      applySlashSuggestion,
      attachments,
      clearComposerByEscape,
      enqueueDraft,
      inputValue,
      isSubmitDisabled,
      onStop,
      queuedDrafts,
      restoreEscClearedComposerDraft,
      restoreQueuedDraftToComposer,
      restoreDraftFromSubmittedHistorySelection,
      selectedSubmittedMessageIndex,
      selectedQueuedDraftId,
      setInputValue,
      shouldShowSlashSuggestions,
      slashSuggestions,
      submittedMessageHistoryEntries,
      waitingForResponse,
    ],
  );

  const buttonIcon = useMemo(() => {
    if (waitingForResponse) {
      return <IoStop />;
    }
    return <IoSend />;
  }, [waitingForResponse]);

  const buttonClassName = useMemo(() => {
    if (waitingForResponse) {
      return "text-setta-300 dark:text-setta-600";
    }
    if (isSubmitDisabled) {
      return "text-setta-300 dark:text-setta-600";
    }
    return "text-setta-500 hover:text-blue-500 focus:text-blue-500";
  }, [isSubmitDisabled, waitingForResponse]);

  const textAreaClassName = useMemo(() => {
    const base =
      "nodrag max-h-40 w-full max-w-none flex-1 resize-none overflow-y-auto rounded-md border border-setta-200 bg-transparent py-1.5 pr-9 text-[13px] leading-[1.35] text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:border-blue-500 focus:ring-1 focus:ring-inset focus:ring-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:border-blue-700 dark:focus:ring-blue-700";
    const dragClass = isDragActive
      ? "ring-2 ring-blue-400 bg-blue-50/40 dark:bg-blue-900/20"
      : "";
    if (isDisabled) {
      return `${base} ${dragClass} cursor-not-allowed opacity-30`;
    }
    return `${base} ${dragClass} cursor-auto opacity-100`;
  }, [isDisabled, isDragActive]);

  const {
    canAutoUseProviderDictation,
    canBrowserDictate,
    canDictate,
    canProviderDictate,
    attachmentTooltipHandlers,
    backgroundTerminalTooltipHandlers,
    contextLabelPrefixCompact,
    contextLabelPrefixFull,
    contextRemainingValue,
    contextTooltipHandlers,
    dictationAriaLabel,
    dictationTooltipHandlers,
    handleContextBadgeToggle,
    permissionModeIconClassName,
    permissionTooltipHandlers,
    searchTooltipHandlers,
    shouldShowComposerMetaRow,
    showBackgroundTerminalDropdown,
    showPermissionControl,
    showRuntimeActivityCounters,
    showSearchControl,
    showSubagentDropdown,
    showThinkingControl,
    subagentTooltipHandlers,
    submitTooltipHandlers,
    thinkingIconClassName,
    thinkingTooltipHandlers,
    activeBackgroundTerminalEntries,
    activeBackgroundTerminals,
    activeSubagentEntries,
    activeSubagents,
  } = useChatComposerMetaState({
    attachmentInputDisabled,
    contextUsageIsEstimated,
    contextUsedTokens,
    contextWindowTokens,
    dictationEnabledByProvider,
    dictationMode,
    dictationState,
    executionControlVisibility,
    executionControls,
    isDisabled,
    isSubmitDisabled,
    onProviderDictationTranscribe,
    providerDictationLikelySupported,
    runtimeActivityCounts,
    runtimeActivityDetails,
    waitingForResponse,
  });
  const { canRenderSlashSuggestionsInPortal, slashSuggestionsPositionClass } =
    resolveSlashSuggestionsDisplayState({
      resolvedSlashPlacement,
      shouldShowSlashSuggestions,
      slashSuggestionsPortalStyle,
    });

  const cleanupProviderCapture = useCallback(() => {
    const recorder = providerRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    providerRecorderRef.current = null;
    const stream = providerStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    providerStreamRef.current = null;
    providerChunksRef.current = [];
    dictationSourceRef.current = null;
  }, []);

  const stopProviderCapture = useCallback(() => {
    const recorder = providerRecorderRef.current;
    if (!recorder) {
      return;
    }
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    providerRecorderRef.current = null;
    dictationSourceRef.current = null;
    setDictationState("transcribing");
    setDictationFeedback("Transcribing...");
  }, []);

  const stopBrowserDictation = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }
    recognition.stop();
    recognitionRef.current = null;
    dictationSourceRef.current = null;
    setDictationState("idle");
    setDictationFeedback(null);
  }, []);

  const stopActiveDictationImmediately = useCallback(() => {
    if (dictationSourceRef.current === "provider") {
      cleanupProviderCapture();
    } else {
      stopBrowserDictation();
    }
    setDictationState("idle");
    setDictationFeedback(null);
  }, [cleanupProviderCapture, stopBrowserDictation]);

  const insertTranscript = useCallback(
    (transcript: string) => {
      const node = textareaRef.current;
      const current = inputValueRef.current;
      const start = node?.selectionStart ?? current.length;
      const end = node?.selectionEnd ?? current.length;
      const result = insertTextAtSelection(current, transcript, start, end);
      setInputValue(result.value);
      requestAnimationFrame(() => {
        if (!node) {
          return;
        }
        node.focus();
        node.setSelectionRange(result.nextCaret, result.nextCaret);
      });
    },
    [setInputValue],
  );

  const startBrowserDictation = useCallback(() => {
    if (!canBrowserDictate) {
      setDictationState("error");
      setDictationFeedback("Dictation is not available.");
      return;
    }
    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) {
      setDictationState("error");
      setDictationFeedback("Dictation is not available.");
      return;
    }
    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        if (!result || !result.isFinal) {
          continue;
        }
        transcript += result[0]?.transcript ?? "";
      }
      const normalized = transcript.trim();
      if (!normalized) {
        return;
      }
      insertTranscript(`${normalized} `);
      setDictationFeedback(null);
    };
    recognition.onerror = (event) => {
      if (isNoSpeechDictationError(event.error)) {
        setDictationState("idle");
        setDictationFeedback(null);
        addTemporaryNotification("No speech was detected.");
      } else {
        setDictationState("error");
        setDictationFeedback(mapDictationError(event.error));
      }
      recognitionRef.current = null;
      dictationSourceRef.current = null;
    };
    recognition.onend = () => {
      const shouldContinueListening =
        recognitionRef.current === recognition &&
        dictationSourceRef.current === "browser";
      if (!shouldContinueListening) {
        return;
      }
      try {
        recognition.start();
        setDictationState("listening");
        setDictationFeedback("Listening...");
      } catch {
        recognitionRef.current = null;
        dictationSourceRef.current = null;
        setDictationState("error");
        setDictationFeedback(mapDictationError(undefined));
      }
    };
    recognitionRef.current = recognition;
    dictationSourceRef.current = "browser";
    setDictationState("listening");
    setDictationFeedback("Listening...");
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      dictationSourceRef.current = null;
      setDictationState("error");
      setDictationFeedback(mapDictationError(undefined));
    }
  }, [canBrowserDictate, insertTranscript]);

  const maybeFallbackToBrowserDictation = useCallback(
    (allowFallback: boolean): boolean => {
      if (!allowFallback || !canBrowserDictate) {
        return false;
      }
      startBrowserDictation();
      return true;
    },
    [canBrowserDictate, startBrowserDictation],
  );

  const maybeFallbackForProviderFailure = useCallback(
    ({
      phase,
      failureClass,
      allowBrowserFallback,
    }: {
      phase: DictationProviderFailurePhase;
      failureClass: DictationProviderFailureClass;
      allowBrowserFallback: boolean;
    }): boolean => {
      if (
        !shouldFallbackToBrowserAfterProviderFailure({
          mode: dictationMode,
          phase,
          failureClass,
        })
      ) {
        return false;
      }
      return maybeFallbackToBrowserDictation(allowBrowserFallback);
    },
    [dictationMode, maybeFallbackToBrowserDictation],
  );

  const startProviderDictation = useCallback(
    async (allowBrowserFallback: boolean) => {
      if (
        !canStartProviderDictation({
          allowBrowserFallback,
          canProviderDictate,
          maybeFallbackForProviderFailure,
          onProviderDictationTranscribe,
          setDictationFeedback,
          setDictationState,
        })
      ) {
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        providerStreamRef.current = stream;
        const mimeType = pickProviderRecorderMimeType(
          MediaRecorder.isTypeSupported?.bind(MediaRecorder),
        );
        let recorder: MediaRecorder;
        try {
          recorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);
        } catch {
          cleanupProviderCapture();
          handleProviderDictationUnavailable({
            allowBrowserFallback,
            failureClass: "unknown",
            maybeFallbackForProviderFailure,
            message: "Provider dictation is not available.",
            phase: "capture_start",
            setDictationFeedback,
            setDictationState,
          });
          return;
        }
        providerRecorderRef.current = recorder;
        providerChunksRef.current = [];
        dictationSourceRef.current = "provider";
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            providerChunksRef.current.push(event.data);
          }
        };
        recorder.onerror = () => {
          handleProviderRecorderError({
            allowBrowserFallback,
            cleanupProviderCapture,
            maybeFallbackForProviderFailure,
            setDictationFeedback,
            setDictationState,
          });
        };
        recorder.onstop = () => {
          handleProviderRecorderStop({
            allowBrowserFallback,
            fallbackMimeType: mimeType || "audio/webm",
            dictationSourceRef,
            insertTranscript,
            maybeFallbackForProviderFailure,
            onProviderDictationTranscribe,
            providerChunksRef,
            providerRecorderRef,
            providerStreamRef,
            recorder,
            setDictationFeedback,
            setDictationState,
          });
        };
        setDictationState("listening");
        setDictationFeedback("Listening...");
        recorder.start();
      } catch {
        cleanupProviderCapture();
        handleProviderDictationUnavailable({
          allowBrowserFallback,
          failureClass: "unknown",
          maybeFallbackForProviderFailure,
          message: "Microphone access was denied.",
          phase: "capture_start",
          setDictationFeedback,
          setDictationState,
        });
      }
    },
    [
      canProviderDictate,
      cleanupProviderCapture,
      insertTranscript,
      maybeFallbackForProviderFailure,
      onProviderDictationTranscribe,
    ],
  );

  const startDictation = useCallback(() => {
    if (!canDictate) {
      setDictationState("error");
      setDictationFeedback("Dictation is not available.");
      return;
    }
    if (dictationMode === "provider") {
      void startProviderDictation(false);
      return;
    }
    if (dictationMode === "browser") {
      startBrowserDictation();
      return;
    }
    if (canAutoUseProviderDictation) {
      void startProviderDictation(true);
      return;
    }
    startBrowserDictation();
  }, [
    canDictate,
    canAutoUseProviderDictation,
    dictationMode,
    startBrowserDictation,
    startProviderDictation,
  ]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      cleanupProviderCapture();
    };
  }, [cleanupProviderCapture]);

  useEffect(() => {
    if (!isDisabled || dictationState !== "listening") {
      return;
    }
    stopActiveDictationImmediately();
  }, [dictationState, isDisabled, stopActiveDictationImmediately]);

  const handleDictationToggle = useCallback(() => {
    if (isDisabled) {
      return;
    }
    if (dictationState === "listening") {
      if (dictationSourceRef.current === "provider") {
        stopProviderCapture();
        return;
      }
      stopBrowserDictation();
      return;
    }
    if (dictationState === "transcribing") {
      return;
    }
    startDictation();
  }, [
    dictationState,
    isDisabled,
    startDictation,
    stopBrowserDictation,
    stopProviderCapture,
  ]);

  const slashSuggestionsList = useMemo(
    () => (
      <>
        {slashSuggestions.map((suggestion, index) => (
          <button
            key={suggestion.command}
            type="button"
            className={`flex w-full min-w-0 flex-col items-start gap-0.5 rounded px-2 py-1 text-left text-xs transition-colors ${
              index === activeSlashIndex
                ? "bg-setta-100 text-setta-900 dark:bg-setta-800 dark:text-setta-100"
                : "text-setta-600 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800"
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applySlashSuggestion(index)}
          >
            <span className="w-full truncate font-semibold">
              {suggestion.command}
            </span>
            <span className="w-full truncate text-[10px] text-setta-400 dark:text-setta-500">
              {suggestion.summary}
            </span>
          </button>
        ))}
      </>
    ),
    [activeSlashIndex, applySlashSuggestion, slashSuggestions],
  );

  const queuedDraftsSection = useMemo(() => {
    if (queuedDrafts.length === 0) {
      return null;
    }
    return (
      <div
        className="mb-1 flex flex-col gap-1"
        data-chat-queued-draft-stack="true"
      >
        {queuedDrafts.map((draft, index) => {
          const isSelected = draft.id === selectedQueuedDraftId;
          const previewText = draft.message.trim();
          const attachmentCount = draft.attachments.length;
          const attachmentLabel =
            attachmentCount === 1
              ? "1 attachment"
              : `${attachmentCount} attachments`;
          const queuedDraftTooltipHandlers = getFloatingBoxHandlers({
            title: "Queued draft",
            content:
              previewText.length > 0
                ? previewText
                : "Queued attachment message",
          });
          return (
            <button
              key={draft.id}
              type="button"
              className={`grid w-full grid-cols-[1.75rem_minmax(0,1fr)] overflow-hidden rounded-md border text-left transition-colors ${
                isSelected
                  ? "border-blue-400/90 bg-blue-200 text-setta-950 dark:border-blue-700/80 dark:bg-blue-950 dark:text-white"
                  : "border-blue-300/75 bg-blue-100/85 text-setta-900 hover:border-blue-400/80 hover:bg-blue-200/80 dark:border-blue-800/70 dark:bg-blue-950/70 dark:text-blue-100 dark:hover:border-blue-700 dark:hover:bg-blue-900/80"
              }`}
              data-chat-queued-draft="true"
              data-selected={isSelected ? "true" : "false"}
              onClick={() => setSelectedQueuedDraftId(draft.id)}
              onDoubleClick={() => restoreQueuedDraftToComposer(draft.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  restoreQueuedDraftToComposer(draft.id);
                  return;
                }
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelectedQueuedDraftId((current) =>
                    cycleQueuedDraftSelection(
                      queuedDrafts,
                      current,
                      event.key === "ArrowUp" ? "prev" : "next",
                    ),
                  );
                }
              }}
              {...queuedDraftTooltipHandlers}
            >
              <div
                className={`flex h-full items-center justify-center text-[10px] font-semibold ${
                  isSelected
                    ? "bg-blue-300/75 text-blue-900 dark:bg-blue-900/80 dark:text-blue-100"
                    : "bg-blue-200/75 text-blue-900 dark:bg-blue-900/65 dark:text-blue-200"
                }`}
                data-chat-queued-draft-rail="true"
              >
                <span className="inline-flex h-4 min-w-4 items-center justify-center">
                  {index + 1}
                </span>
              </div>
              <div className="min-w-0 px-2 py-1">
                <div className="flex min-w-0 items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em]">
                  <span>Queued</span>
                  {attachmentCount > 0 ? (
                    <span className="truncate opacity-80">
                      {attachmentLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-[11px] font-medium">
                  {previewText.length > 0
                    ? previewText
                    : "(Attachment message)"}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }, [
    queuedDrafts,
    restoreQueuedDraftToComposer,
    selectedQueuedDraftId,
    setSelectedQueuedDraftId,
  ]);

  const composerFieldSection = (
    <ChatComposerFieldSection
      attachmentCountLabel={attachmentCountLabel}
      attachmentInputDisabled={attachmentInputDisabled}
      attachmentTooltipHandlers={attachmentTooltipHandlers}
      buttonClassName={buttonClassName}
      buttonIcon={buttonIcon}
      canDictate={canDictate}
      canRenderSlashSuggestionsInPortal={canRenderSlashSuggestionsInPortal}
      dictationAriaLabel={dictationAriaLabel}
      dictationState={dictationState}
      dictationTooltipHandlers={dictationTooltipHandlers}
      fileInputRef={fileInputRef}
      handleChange={handleChange}
      handleDictationToggle={handleDictationToggle}
      handleFileInputChange={handleFileInputChange}
      handleKeyDown={handleKeyDown}
      handlePickFromProject={handlePickFromProject}
      inputValue={inputValue}
      isDeploymentMode={isDeploymentMode}
      isDisabled={isDisabled}
      isSubmitDisabled={isSubmitDisabled}
      placeholderText={placeholderText}
      shouldShowSlashSuggestions={shouldShowSlashSuggestions}
      slashSuggestionsList={slashSuggestionsList}
      slashSuggestionsPositionClass={slashSuggestionsPositionClass}
      submitTooltipHandlers={submitTooltipHandlers}
      textAreaClassName={textAreaClassName}
      textareaRef={textareaRef}
      waitingForResponse={waitingForResponse}
    />
  );

  const feedbackSection = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
        {showSharePolicyMessage ? (
          <span className="text-[10px] uppercase tracking-[0.2em] text-setta-300">
            Attachments blocked by share policy
          </span>
        ) : null}
        {showAttachmentDisabledMessage ? (
          <span className="text-[10px] uppercase tracking-[0.2em] text-setta-300">
            Attachments disabled
          </span>
        ) : null}
        {isUploading ? (
          <span className="text-[10px] uppercase tracking-[0.2em] text-setta-300">
            Uploading...
          </span>
        ) : null}
        {slashFeedback ? (
          <span className="text-[10px] uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
            {slashFeedback}
          </span>
        ) : null}
        {dictationFeedback ? (
          <span
            className={`text-[10px] uppercase tracking-[0.16em] ${
              dictationState === "error"
                ? "text-amber-700 dark:text-amber-300"
                : "text-blue-600 dark:text-blue-400"
            }`}
          >
            {dictationFeedback}
          </span>
        ) : null}
      </div>
    ),
    [
      dictationFeedback,
      dictationState,
      isUploading,
      showAttachmentDisabledMessage,
      showSharePolicyMessage,
      slashFeedback,
    ],
  );

  const composerMetaSection = (
    <ChatComposerMetaSection
      activeBackgroundTerminalEntries={activeBackgroundTerminalEntries}
      activeBackgroundTerminals={activeBackgroundTerminals}
      activeSubagentEntries={activeSubagentEntries}
      activeSubagents={activeSubagents}
      backgroundTerminalTooltipHandlers={backgroundTerminalTooltipHandlers}
      contextLabelPrefixCompact={contextLabelPrefixCompact}
      contextLabelPrefixFull={contextLabelPrefixFull}
      contextRemainingValue={contextRemainingValue}
      contextTooltipHandlers={contextTooltipHandlers}
      executionControls={executionControls}
      handleContextBadgeToggle={handleContextBadgeToggle}
      isDisabled={isDisabled}
      permissionModeIconClassName={permissionModeIconClassName}
      permissionTooltipHandlers={permissionTooltipHandlers}
      searchTooltipHandlers={searchTooltipHandlers}
      shouldShowComposerMetaRow={shouldShowComposerMetaRow}
      showBackgroundTerminalDropdown={showBackgroundTerminalDropdown}
      showPermissionControl={showPermissionControl}
      showRuntimeActivityCounters={showRuntimeActivityCounters}
      showSearchControl={showSearchControl}
      showSubagentDropdown={showSubagentDropdown}
      showThinkingControl={showThinkingControl}
      subagentTooltipHandlers={subagentTooltipHandlers}
      thinkingIconClassName={thinkingIconClassName}
      thinkingTooltipHandlers={thinkingTooltipHandlers}
    />
  );

  const attachmentsSection = useMemo(() => {
    if (attachments.length === 0) {
      return null;
    }
    return (
      <div className="mb-0.5 flex flex-wrap gap-1.5 [&_button]:cursor-pointer">
        {attachments.map((attachment) => {
          const removeAttachmentTooltipHandlers = getFloatingBoxHandlers({
            title: "Remove attachment",
            content: attachment.name,
          });
          return (
            <div
              key={attachment.id}
              className="flex items-center gap-1.5 rounded-md border border-setta-200 bg-white/80 px-2 py-0.5 text-xs text-setta-700 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-200"
            >
              <span className="max-w-[200px] truncate">{attachment.name}</span>
              {attachment.size !== null && attachment.size !== undefined ? (
                <span className="text-[10px] text-setta-400">
                  {formatBytes(attachment.size)}
                </span>
              ) : null}
              <button
                type="button"
                className="rounded-full p-1 text-setta-400 transition-colors hover:text-red-500"
                onClick={() => handleRemoveAttachment(attachment)}
                disabled={attachmentActionsDisabled}
                {...removeAttachmentTooltipHandlers}
              >
                <IoClose />
              </button>
            </div>
          );
        })}
        {attachments.length > 1 ? (
          <button
            type="button"
            className="rounded-full border border-setta-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 hover:border-setta-400 hover:text-setta-600 dark:border-setta-800 dark:text-setta-500 dark:hover:text-setta-200"
            onClick={handleClearAttachments}
            disabled={attachmentActionsDisabled}
            {...getFloatingBoxHandlers({
              title: "Clear attachments",
              content: "Remove all attachments from this draft.",
            })}
          >
            Clear all
          </button>
        ) : null}
      </div>
    );
  }, [
    attachmentActionsDisabled,
    attachments,
    handleClearAttachments,
    handleRemoveAttachment,
  ]);

  const attachmentWarningSection = useMemo(() => {
    if (!attachmentWarning) {
      return null;
    }
    return (
      <div
        className="mb-0.5 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200"
        role="alert"
      >
        {attachmentWarning}
      </div>
    );
  }, [attachmentWarning]);

  const portalSlashSuggestions = useMemo(() => {
    if (
      !canRenderSlashSuggestionsInPortal ||
      typeof document === "undefined" ||
      !document.body
    ) {
      return null;
    }
    return createPortal(
      <div
        className="fixed z-40 overflow-y-auto overflow-x-hidden rounded-md border border-setta-200 bg-white p-1 shadow-lg dark:border-setta-700 dark:bg-setta-900"
        style={slashSuggestionsPortalStyle}
      >
        {slashSuggestionsList}
      </div>,
      document.body,
    );
  }, [
    canRenderSlashSuggestionsInPortal,
    slashSuggestionsList,
    slashSuggestionsPortalStyle,
  ]);

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      className="flex justify-center"
    >
      <div className="flex w-full gap-1">
        <div
          className="flex min-w-0 flex-1 flex-col @container"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {queuedDraftsSection}
          {composerFieldSection}
          {feedbackSection}
          {composerMetaSection}
          {attachmentsSection}
          {attachmentWarningSection}
        </div>
      </div>
      {portalSlashSuggestions}
    </form>
  );
});
