import { KeyboardEvent, type RefObject } from "react";
import { ChatFileAttachment } from "utils/generatedTypes";
import { type ChatSlashCommandDefinition } from "../chatComposerControls";
import {
  type QueuedChatDraft,
  type SlashCommandExecutionOutcome,
  cycleQueuedDraftSelection,
  cycleSubmittedMessageHistorySelection,
  isRestoreClearedDraftKey,
  isStopEscapeKey,
  resolveEscapeComposerAction,
} from "../chatInputHelpers";
import { type SubmitRemotelyHandler } from "./shared";

export function focusComposerTextareaAtEnd(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
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
  setActiveSlashIndex: (value: number | ((current: number) => number)) => void;
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
  if (suggestion && normalizedInput === suggestion.command.toLowerCase()) {
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
  onStop?: (() => Promise<void> | void) | undefined;
  restoreDraftFromSubmittedHistorySelection: () => void;
  selectedSubmittedMessageIndex: number | null;
  stopRequestedForCurrentResponseRef: RefObject<boolean>;
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
    stopRequestedForCurrentResponse: stopRequestedForCurrentResponseRef.current,
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
  if (event.key !== "Enter" || event.shiftKey || !selectedQueuedDraftId) {
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
  submittedHistoryDraftBeforeSelectionRef: RefObject<string | null>;
  submittedMessageHistoryEntries: string[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
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
  submittedHistoryDraftBeforeSelectionRef: RefObject<string | null>;
  submittedMessageHistoryEntries: string[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
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

export function handleChatInputKeyDown(args: {
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
  onStop?: (() => Promise<void> | void) | undefined;
  queuedDrafts: QueuedChatDraft[];
  restoreDraftFromSubmittedHistorySelection: () => void;
  restoreEscClearedComposerDraft: () => boolean;
  restoreQueuedDraftToComposer: (draftId: string) => void;
  selectedQueuedDraftId: string | null;
  selectedSubmittedMessageIndex: number | null;
  setActiveSlashIndex: (value: number | ((current: number) => number)) => void;
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
  stopRequestedForCurrentResponseRef: RefObject<boolean>;
  submittedHistoryDraftBeforeSelectionRef: RefObject<string | null>;
  submittedMessageHistoryEntries: string[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
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

export function handleChatInputFormKeyDown(args: {
  event: KeyboardEvent<HTMLFormElement>;
  onStop?: (() => Promise<void> | void) | undefined;
  stopRequestedForCurrentResponseRef: RefObject<boolean>;
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
    stopRequestedForCurrentResponse: stopRequestedForCurrentResponseRef.current,
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

export function resolveSelectedQueuedDraftId(
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

export async function submitChatInputMessage(args: {
  enqueueDraft: (args: {
    message: string;
    draftAttachments: ChatFileAttachment[];
    prioritize: boolean;
    interruptCurrentRun: boolean;
    feedback: string;
  }) => boolean;
  isSubmitDisabled: boolean;
  onStop?: (() => Promise<void> | void) | undefined;
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
