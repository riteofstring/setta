import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChatFileAttachment } from "utils/generatedTypes";
import { ChatInputFormLayout } from "./ChatInput/ChatInputFormLayout";
import {
  ChatComposerFieldSection,
  ChatComposerMetaSection,
} from "./ChatInput/composerSections";
import { resolveChatInputControlState } from "./ChatInput/controlState";
import {
  focusComposerTextareaAtEnd,
  handleChatInputFormKeyDown,
  handleChatInputKeyDown,
  resolveSelectedQueuedDraftId,
  submitChatInputMessage,
} from "./ChatInput/keyboardHandlers";
import {
  type ChatInputProps,
  type EscClearedComposerDraft,
  resolveChatInputProps,
} from "./ChatInput/shared";
import {
  executeRegisteredSlashCommand,
  handleUnknownSlashCommand,
  submitNativeSlashCommand,
  submitPromptTemplateSlashCommand,
} from "./ChatInput/slashCommands";
import { useChatInputSlashSuggestions } from "./ChatInput/slashSuggestions";
import { useChatComposerMetaState } from "./ChatInput/useChatComposerMetaState";
import { useChatInputDictationControls } from "./ChatInput/useChatInputDictationControls";
import { useChatInputVisualState } from "./ChatInput/useChatInputVisualState";
import {
  type ChatSlashCommand,
  type ChatSubmitDispatchResult,
  type ChatSubmitOptions,
  type QueuedChatDraft,
  type SlashCommandExecutionOutcome,
  buildQueuedDraftReplayInputsSignature,
  buildQueuedDraftReplaySnapshot,
  buildUnavailableSlashCommandFeedback,
  cloneAttachments,
  enqueueQueuedDraft,
  resolveChatSubmitDispatchResult,
  resolveQueuedDraftReplaySlashCommand,
  resolveSlashCommandRequest,
  resolveSlashCommandSubmitOptions,
  shouldAutoReplayQueuedDraft,
  shouldRemoveQueuedDraft,
} from "./chatInputHelpers";
import { type DictationState } from "./dictation";
import { useChatAttachmentManager } from "./useChatAttachmentManager";

export const ChatInput = memo(function ChatInput(props: ChatInputProps) {
  const {
    placeholderText,
    waitingForResponse,
    disabled,
    submitDisabled,
    hasRetainedImageAttachmentForImageMode,
    value,
    onChange,
    onSubmit,
    submitReadinessKey,
    onUnknownSlashCommand,
    onStop,
    executionControls,
    executionControlVisibility,
    slashCommands,
    recognizedSlashCommands,
    onSlashCommand,
    slashSuggestionsPlacement,
    dictationMode,
    onProviderDictationTranscribe,
    dictationEnabledByProvider,
    providerDictationLikelySupported,
    contextWindowTokens,
    contextUsedTokens,
    contextUsageIsEstimated,
    submittedMessageHistory,
    runtimeActivityCounts,
    runtimeActivityDetails,
  } = resolveChatInputProps(props);
  const [internalValue, setInternalValue] = useState("");
  const [slashFeedback, setSlashFeedback] = useState<string | null>(null);
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

  const {
    activeSlashIndex,
    applySlashSuggestion,
    canRenderSlashSuggestionsInPortal,
    setActiveSlashIndex,
    shouldShowSlashSuggestions,
    slashSuggestions,
    slashSuggestionsList,
    slashSuggestionsPortalStyle,
    slashSuggestionsPositionClass,
  } = useChatInputSlashSuggestions({
    inputValue,
    setInputValue,
    setSlashFeedback,
    slashCommands,
    slashSuggestionsPlacement,
    textareaRef,
  });

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
      draftToRestore?: EscClearedComposerDraft | undefined;
      message: string;
      submittedAttachments: ChatFileAttachment[];
      options?: ChatSubmitOptions | undefined;
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
      const replaySnapshot = draft.replaySnapshot;
      if (replaySnapshot.kind === "plain_message") {
        return submitMessage(draft.message, draft.attachments);
      }
      const resolvedReplayCommand = resolveQueuedDraftReplaySlashCommand({
        message: draft.message,
        replaySnapshot,
        slashCommands,
        recognizedSlashCommands: slashCommandRecognitionSet,
      });
      return executeResolvedSlashCommand({
        message: draft.message,
        submittedAttachments: draft.attachments,
        parsed: resolvedReplayCommand.parsed,
        commandAvailable: resolvedReplayCommand.commandAvailable,
      });
    },
    [
      executeResolvedSlashCommand,
      slashCommandRecognitionSet,
      slashCommands,
      submitMessage,
    ],
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
        setSlashFeedback(
          (current) => current ?? "Queued message failed. Edit it and retry.",
        );
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

  const { buttonClassName, buttonIcon, textAreaClassName } =
    useChatInputVisualState({
      isDisabled,
      isDragActive,
      isSubmitDisabled,
      waitingForResponse,
    });

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

  const { handleDictationToggle } = useChatInputDictationControls({
    canAutoUseProviderDictation,
    canBrowserDictate,
    canDictate,
    canProviderDictate,
    dictationMode,
    dictationState,
    inputValueRef,
    isDisabled,
    onProviderDictationTranscribe,
    setDictationFeedback,
    setDictationState,
    setInputValue,
    textareaRef,
  });

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

  return (
    <ChatInputFormLayout
      attachmentActionsDisabled={attachmentActionsDisabled}
      attachmentWarning={attachmentWarning}
      attachments={attachments}
      canRenderSlashSuggestionsInPortal={canRenderSlashSuggestionsInPortal}
      composerFieldSection={composerFieldSection}
      composerMetaSection={composerMetaSection}
      dictationFeedback={dictationFeedback}
      dictationState={dictationState}
      handleClearAttachments={handleClearAttachments}
      handleDragEnter={handleDragEnter}
      handleDragLeave={handleDragLeave}
      handleDragOver={handleDragOver}
      handleDrop={handleDrop}
      handleFormKeyDown={handleFormKeyDown}
      handleRemoveAttachment={handleRemoveAttachment}
      handleSubmit={handleSubmit}
      isUploading={isUploading}
      queuedDrafts={queuedDrafts}
      restoreQueuedDraftToComposer={restoreQueuedDraftToComposer}
      selectedQueuedDraftId={selectedQueuedDraftId}
      setSelectedQueuedDraftId={setSelectedQueuedDraftId}
      showAttachmentDisabledMessage={showAttachmentDisabledMessage}
      showSharePolicyMessage={showSharePolicyMessage}
      slashFeedback={slashFeedback}
      slashSuggestionsList={slashSuggestionsList}
      slashSuggestionsPortalStyle={slashSuggestionsPortalStyle}
    />
  );
});
