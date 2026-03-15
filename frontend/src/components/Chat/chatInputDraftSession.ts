import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { ChatFileAttachment } from "utils/generatedTypes";
import type { ChatSlashCommandDefinition } from "./chatComposerControls";
import {
  buildQueuedDraftReplayInputsSignature,
  buildQueuedDraftReplaySnapshot,
  cloneChatAttachments,
  enqueueQueuedDraft,
  executeResolvedChatSlashCommand,
  replayQueuedChatDraft,
  cycleQueuedDraftSelection as resolveQueuedDraftSelection,
  cycleSubmittedMessageHistorySelection as resolveSubmittedMessageHistorySelection,
  runChatSlashCommand,
  shouldAutoReplayQueuedDraft,
  shouldRemoveQueuedDraft,
  submitChatInputMessage,
  type ChatSlashCommand,
  type ChatSlashCommandResult,
  type ChatSubmitOptions,
  type ChatSubmitResult,
  type QueuedChatDraft,
  type SlashCommandExecutionOutcome,
} from "./chatInputSubmission";

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

type EscClearedComposerDraft = {
  message: string;
  attachments: ChatFileAttachment[];
};

type UseChatInputDraftSessionArgs = {
  attachments: ChatFileAttachment[];
  clearAttachments: () => void;
  hasRetainedImageAttachmentForImageMode: boolean;
  isSubmitDisabled: boolean;
  onChange?: (value: string) => void;
  onSubmit: (
    message: string,
    attachments: ChatFileAttachment[],
    options?: ChatSubmitOptions,
  ) => Promise<ChatSubmitResult> | ChatSubmitResult;
  onSlashCommand?: (
    command: ChatSlashCommand,
  ) => Promise<ChatSlashCommandResult | void> | ChatSlashCommandResult | void;
  onStop?: () => Promise<void> | void;
  onUnknownSlashCommand?: (
    message: string,
    attachments: ChatFileAttachment[],
  ) => Promise<ChatSlashCommandResult> | ChatSlashCommandResult;
  recognizedSlashCommands: ChatSlashCommandDefinition[];
  replaceAttachments: (attachments: ChatFileAttachment[]) => void;
  setSlashFeedback: (feedback: string | null) => void;
  slashCommands: ChatSlashCommandDefinition[];
  submitReadinessKey: string | null;
  submittedMessageHistory: string[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value?: string;
  waitingForResponse: boolean;
};

// Owns composer draft state, queued replay lifecycle, submitted-history selection, and escape restore behavior.
export function buildChatInputSubmittedMessageHistoryEntries(
  submittedMessageHistory: string[],
): string[] {
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

export function useChatInputDraftSession({
  attachments,
  clearAttachments,
  hasRetainedImageAttachmentForImageMode,
  isSubmitDisabled,
  onChange,
  onSubmit,
  onSlashCommand,
  onStop,
  onUnknownSlashCommand,
  recognizedSlashCommands,
  replaceAttachments,
  setSlashFeedback,
  slashCommands,
  submitReadinessKey,
  submittedMessageHistory,
  textareaRef,
  value,
  waitingForResponse,
}: UseChatInputDraftSessionArgs) {
  const [internalValue, setInternalValue] = useState("");
  const [queuedDrafts, setQueuedDrafts] = useState<QueuedChatDraft[]>([]);
  const [queuedAutoReplayVersion, setQueuedAutoReplayVersion] = useState(0);
  const [selectedQueuedDraftId, setSelectedQueuedDraftId] = useState<
    string | null
  >(null);
  const [selectedSubmittedMessageIndex, setSelectedSubmittedMessageIndex] =
    useState<number | null>(null);
  const submittedHistoryDraftBeforeSelectionRef = useRef<string | null>(null);
  const queuedDraftIdRef = useRef(0);
  const queuedDispatchInFlightRef = useRef(false);
  const stopRequestedForCurrentResponseRef = useRef(false);
  const escClearedComposerDraftRef = useRef<EscClearedComposerDraft | null>(
    null,
  );
  const componentMountedRef = useRef(true);
  const queuedReplayInputsSignatureRef = useRef<string | null>(null);
  const isControlled = typeof value === "string" && Boolean(onChange);
  const inputValue = isControlled ? value : internalValue;
  const inputValueRef = useRef(inputValue);

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

  const setInputValue = useCallback(
    (nextValue: string) => {
      if (isControlled) {
        onChange?.(nextValue);
        return;
      }
      setInternalValue(nextValue);
      onChange?.(nextValue);
    },
    [isControlled, onChange],
  );

  const clearSubmittedHistorySelection = useCallback(() => {
    setSelectedSubmittedMessageIndex(null);
    submittedHistoryDraftBeforeSelectionRef.current = null;
  }, []);

  const handleComposerValueChange = useCallback(
    (nextValue: string) => {
      escClearedComposerDraftRef.current = null;
      if (selectedSubmittedMessageIndex !== null) {
        clearSubmittedHistorySelection();
      }
      setInputValue(nextValue);
      setSlashFeedback(null);
    },
    [
      clearSubmittedHistorySelection,
      selectedSubmittedMessageIndex,
      setInputValue,
      setSlashFeedback,
    ],
  );

  const clearInput = useCallback(() => {
    clearSubmittedHistorySelection();
    setInputValue("");
  }, [clearSubmittedHistorySelection, setInputValue]);

  const resetSubmittedComposer = useCallback(() => {
    escClearedComposerDraftRef.current = null;
    clearInput();
    clearAttachments();
  }, [clearAttachments, clearInput]);

  const submittedMessageHistoryEntries = useMemo(
    () => buildChatInputSubmittedMessageHistoryEntries(submittedMessageHistory),
    [submittedMessageHistory],
  );

  const getNextQueuedDraftId = useCallback(() => {
    queuedDraftIdRef.current += 1;
    return `queued-draft-${queuedDraftIdRef.current}`;
  }, []);

  const queuedDraftReplayInputsSignature = useMemo(
    () =>
      buildQueuedDraftReplayInputsSignature({
        isSubmitDisabled,
        recognizedSlashCommands,
        slashCommands,
        submitReadinessKey,
        waitingForResponse,
      }),
    [
      isSubmitDisabled,
      recognizedSlashCommands,
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
        attachments: cloneChatAttachments(draftAttachments),
        replaySnapshot: buildQueuedDraftReplaySnapshot({
          message,
          recognizedSlashCommands,
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
      recognizedSlashCommands,
      setSlashFeedback,
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
      replaceAttachments(cloneChatAttachments(draft.attachments));
      setSlashFeedback("Editing queued message.");
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) {
          return;
        }
        node.focus();
        const end = draft.message.length;
        node.setSelectionRange(end, end);
      });
    },
    [
      queuedDrafts,
      replaceAttachments,
      setInputValue,
      setSlashFeedback,
      textareaRef,
    ],
  );

  useEffect(() => {
    if (queuedDrafts.length === 0) {
      if (selectedQueuedDraftId !== null) {
        setSelectedQueuedDraftId(null);
      }
      return;
    }
    if (!selectedQueuedDraftId) {
      setSelectedQueuedDraftId(queuedDrafts[0]?.id ?? null);
      return;
    }
    const hasSelection = queuedDrafts.some(
      (item) => item.id === selectedQueuedDraftId,
    );
    if (!hasSelection) {
      setSelectedQueuedDraftId(queuedDrafts[0]?.id ?? null);
    }
  }, [queuedDrafts, selectedQueuedDraftId]);

  useEffect(() => {
    if (selectedSubmittedMessageIndex === null) {
      return;
    }
    if (
      submittedMessageHistoryEntries.length === 0 ||
      selectedSubmittedMessageIndex >= submittedMessageHistoryEntries.length
    ) {
      clearSubmittedHistorySelection();
    }
  }, [
    clearSubmittedHistorySelection,
    selectedSubmittedMessageIndex,
    submittedMessageHistoryEntries.length,
  ]);

  const restoreDraftFromSubmittedHistorySelection = useCallback(() => {
    const draftToRestore =
      submittedHistoryDraftBeforeSelectionRef.current ?? "";
    submittedHistoryDraftBeforeSelectionRef.current = null;
    escClearedComposerDraftRef.current = null;
    setSelectedSubmittedMessageIndex(null);
    setInputValue(draftToRestore);
    setSlashFeedback(null);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) {
        return;
      }
      const end = draftToRestore.length;
      node.focus();
      node.setSelectionRange(end, end);
    });
  }, [setInputValue, setSlashFeedback, textareaRef]);

  const stepSubmittedMessageHistorySelection = useCallback(
    (direction: "older" | "newer"): boolean => {
      if (direction === "newer" && selectedSubmittedMessageIndex === 0) {
        restoreDraftFromSubmittedHistorySelection();
        return true;
      }
      if (selectedSubmittedMessageIndex === null) {
        submittedHistoryDraftBeforeSelectionRef.current = inputValueRef.current;
      }
      const nextSelectedIndex = resolveSubmittedMessageHistorySelection(
        submittedMessageHistoryEntries,
        selectedSubmittedMessageIndex,
        direction === "older" ? "next" : "prev",
      );
      if (nextSelectedIndex === null) {
        return false;
      }
      const nextMessage = submittedMessageHistoryEntries[nextSelectedIndex];
      if (typeof nextMessage !== "string") {
        return false;
      }
      setSelectedSubmittedMessageIndex(nextSelectedIndex);
      setInputValue(nextMessage);
      setSlashFeedback(null);
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) {
          return;
        }
        const end = nextMessage.length;
        node.focus();
        node.setSelectionRange(end, end);
      });
      return true;
    },
    [
      restoreDraftFromSubmittedHistorySelection,
      selectedSubmittedMessageIndex,
      setInputValue,
      setSlashFeedback,
      submittedMessageHistoryEntries,
      textareaRef,
    ],
  );

  const clearComposerByEscape = useCallback((): boolean => {
    const currentMessage = inputValueRef.current;
    const nextAttachments = cloneChatAttachments(attachments);
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
  }, [attachments, clearAttachments, clearInput, setSlashFeedback]);

  const restoreEscClearedComposerDraft = useCallback((): boolean => {
    const draft = escClearedComposerDraftRef.current;
    if (!draft) {
      return false;
    }
    escClearedComposerDraftRef.current = null;
    clearSubmittedHistorySelection();
    setInputValue(draft.message);
    replaceAttachments(cloneChatAttachments(draft.attachments));
    setSlashFeedback("Restored cleared draft.");
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
  }, [
    clearSubmittedHistorySelection,
    replaceAttachments,
    setInputValue,
    setSlashFeedback,
    textareaRef,
  ]);

  const stepQueuedDraftSelection = useCallback(
    (direction: "up" | "down") => {
      setSelectedQueuedDraftId((current) =>
        resolveQueuedDraftSelection(
          queuedDrafts,
          current,
          direction === "up" ? "prev" : "next",
        ),
      );
    },
    [queuedDrafts],
  );

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
    }): Promise<SlashCommandExecutionOutcome> =>
      executeResolvedChatSlashCommand({
        message,
        submittedAttachments,
        parsed,
        commandAvailable,
        hasRetainedImageAttachmentForImageMode,
        onSubmit,
        onSlashCommand,
        setSlashFeedback,
        resetComposer: resetSubmittedComposer,
      }),
    [
      hasRetainedImageAttachmentForImageMode,
      onSlashCommand,
      onSubmit,
      resetSubmittedComposer,
      setSlashFeedback,
    ],
  );

  const runSlashCommand = useCallback(
    async (
      message: string,
      submittedAttachments: ChatFileAttachment[],
    ): Promise<SlashCommandExecutionOutcome> =>
      runChatSlashCommand({
        message,
        submittedAttachments,
        slashCommands,
        recognizedSlashCommands,
        onUnknownSlashCommand,
        executeResolvedSlashCommand,
        setSlashFeedback,
        resetComposer: resetSubmittedComposer,
      }),
    [
      executeResolvedSlashCommand,
      onUnknownSlashCommand,
      recognizedSlashCommands,
      resetSubmittedComposer,
      setSlashFeedback,
      slashCommands,
    ],
  );

  const submitMessage = useCallback(
    async (
      submittedValue: string,
      submittedAttachments: ChatFileAttachment[],
    ): Promise<SlashCommandExecutionOutcome> =>
      submitChatInputMessage({
        waitingForResponse,
        isSubmitDisabled,
        submittedValue,
        submittedAttachments,
        onStop,
        enqueueDraft,
        runSlashCommand,
        onSubmit,
        resetComposer: resetSubmittedComposer,
      }),
    [
      enqueueDraft,
      isSubmitDisabled,
      onStop,
      onSubmit,
      resetSubmittedComposer,
      runSlashCommand,
      waitingForResponse,
    ],
  );

  const replayQueuedDraft = useCallback(
    async (draft: QueuedChatDraft): Promise<SlashCommandExecutionOutcome> =>
      replayQueuedChatDraft({
        draft,
        slashCommands,
        submitMessage,
        executeResolvedSlashCommand,
      }),
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
    setSlashFeedback,
    waitingForResponse,
  ]);

  return {
    clearComposerByEscape,
    handleComposerValueChange,
    inputValue,
    inputValueRef,
    queuedDrafts,
    restoreDraftFromSubmittedHistorySelection,
    restoreEscClearedComposerDraft,
    restoreQueuedDraftToComposer,
    selectedQueuedDraftId,
    selectedSubmittedMessageIndex,
    setInputValue,
    setSelectedQueuedDraftId,
    submitMessage,
    stepQueuedDraftSelection,
    stepSubmittedMessageHistorySelection,
    stopRequestedForCurrentResponseRef,
    submittedMessageHistoryEntries,
    enqueueDraft,
  };
}
