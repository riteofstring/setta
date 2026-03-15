import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  type CSSProperties,
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
import { createPortal } from "react-dom";
import {
  IoAdd,
  IoAttach,
  IoClose,
  IoFolderOpen,
  IoMic,
  IoSend,
  IoStop,
} from "react-icons/io5";
import { formatBytes } from "utils/attachments";
import { ChatFileAttachment } from "utils/generatedTypes";
import {
  CHAT_SLASH_COMMANDS,
  type ChatSlashCommandDefinition,
  getSlashCommandSuggestions,
} from "./chatComposerControls";
import {
  isRestoreClearedDraftKey,
  isStopEscapeKey,
  resolveEscapeComposerAction,
  useChatInputDraftSession,
} from "./chatInputDraftSession";
import {
  type ChatExecutionControlVisibility,
  type ChatExecutionControls,
  ChatInputMetaControls,
  type ChatRuntimeActivityCounts,
  type ChatRuntimeActivityDetails,
  DEFAULT_RUNTIME_ACTIVITY_COUNTS,
  DEFAULT_RUNTIME_ACTIVITY_DETAILS,
} from "./ChatInputMetaControls";
import { ChatInputQueuedDraftStack } from "./ChatInputQueuedDraftStack";
import {
  type ChatSlashCommand,
  type ChatSlashCommandResult,
  type ChatSubmitOptions,
  type ChatSubmitResult,
} from "./chatInputSubmission";
import { useChatAttachmentManager } from "./useChatAttachmentManager";
import {
  type ProviderDictationTranscriptionResult,
  useChatInputDictation,
} from "./useChatInputDictation";

export type { ChatRuntimeActivityDetails } from "./ChatInputMetaControls";

const SLASH_SUGGESTIONS_MAX_HEIGHT_PX = 208;
const SLASH_SUGGESTIONS_EDGE_PADDING_PX = 8;
const SLASH_SUGGESTIONS_BASE_HEIGHT_PX = 12;
const SLASH_SUGGESTIONS_ROW_HEIGHT_PX = 36;
const SLASH_SUGGESTIONS_INPUT_INSET_PX = 4;
const SLASH_SUGGESTIONS_PORTAL_STYLE_KEYS = [
  "left",
  "width",
  "maxHeight",
  "top",
  "bottom",
] as const;
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
  contextUsageUnavailable?: boolean;
  submittedMessageHistory?: string[];
  runtimeActivityCounts?: ChatRuntimeActivityCounts;
  runtimeActivityDetails?: ChatRuntimeActivityDetails;
};

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
  executionControlVisibility = {
    permissionMode: true,
    search: true,
  },
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
  contextUsageUnavailable = false,
  submittedMessageHistory = [],
  runtimeActivityCounts = DEFAULT_RUNTIME_ACTIVITY_COUNTS,
  runtimeActivityDetails = DEFAULT_RUNTIME_ACTIVITY_DETAILS,
}: ChatInputProps) {
  const [slashFeedback, setSlashFeedback] = useState<string | null>(null);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [resolvedSlashPlacement, setResolvedSlashPlacement] = useState<
    "above" | "below"
  >(slashSuggestionsPlacement === "above" ? "above" : "below");
  const [slashSuggestionsPortalStyle, setSlashSuggestionsPortalStyle] =
    useState<CSSProperties | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isDisabled = disabled;
  const slashCommandRecognitionSet = recognizedSlashCommands ?? slashCommands;

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
  } = useChatAttachmentManager({ disabled: isDisabled });
  const isSubmitDisabled = submitDisabled || isDisabled || isUploading;

  const {
    clearComposerByEscape,
    enqueueDraft,
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
    stepQueuedDraftSelection,
    stepSubmittedMessageHistorySelection,
    stopRequestedForCurrentResponseRef,
    submittedMessageHistoryEntries,
    submitMessage,
  } = useChatInputDraftSession({
    attachments,
    clearAttachments,
    hasRetainedImageAttachmentForImageMode,
    isSubmitDisabled,
    onChange,
    onSubmit,
    onSlashCommand,
    onStop,
    onUnknownSlashCommand,
    recognizedSlashCommands: slashCommandRecognitionSet,
    replaceAttachments,
    setSlashFeedback,
    slashCommands,
    submitReadinessKey,
    submittedMessageHistory,
    textareaRef,
    value,
    waitingForResponse,
  });

  const {
    canDictate,
    dictationAriaLabel,
    dictationFeedback,
    dictationState,
    handleDictationToggle,
  } = useChatInputDictation({
    disabled: isDisabled,
    dictationMode,
    onProviderDictationTranscribe,
    dictationEnabledByProvider,
    providerDictationLikelySupported,
    textareaRef,
    inputValueRef,
    setInputValue,
  });

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      handleComposerValueChange(event.target.value);
    },
    [handleComposerValueChange],
  );
  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await submitMessage(inputValue, attachments);
    },
    [attachments, inputValue, submitMessage],
  );

  const handleFormKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
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
    },
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
    let nextPlacement: "above" | "below" = "below";
    if (slashSuggestionsPlacement === "above") {
      nextPlacement = "above";
    } else if (slashSuggestionsPlacement === "below") {
      nextPlacement = "below";
    } else if (spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove) {
      nextPlacement = "below";
    } else {
      nextPlacement = "above";
    }
    const availableVerticalSpace = Math.max(
      0,
      nextPlacement === "below" ? spaceBelow : spaceAbove,
    );
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
    setResolvedSlashPlacement((current) =>
      current === nextPlacement ? current : nextPlacement,
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
    const nextStyle: CSSProperties = {
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${maxHeight}px`,
      top: clampedTop !== undefined ? `${clampedTop}px` : undefined,
      bottom: clampedBottom !== undefined ? `${clampedBottom}px` : undefined,
    };
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
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) {
          return;
        }
        const nextPos = `${suggestion.command} `.length;
        node.setSelectionRange(nextPos, nextPos);
      });
    },
    [setInputValue, slashSuggestions],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (shouldShowSlashSuggestions) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveSlashIndex((current) =>
            Math.min(current + 1, slashSuggestions.length - 1),
          );
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveSlashIndex((current) => Math.max(current - 1, 0));
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          applySlashSuggestion(activeSlashIndex);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const suggestion = slashSuggestions[activeSlashIndex];
          const normalizedInput = inputValue.trim().toLowerCase();
          if (
            suggestion &&
            normalizedInput === suggestion.command.toLowerCase()
          ) {
            const formEvent = new Event("submit", {
              bubbles: true,
              cancelable: true,
            });
            event.currentTarget.form?.dispatchEvent(formEvent);
            return;
          }
          applySlashSuggestion(activeSlashIndex);
          return;
        }
      }

      if (isStopEscapeKey(event)) {
        const hasComposerDraft =
          inputValue.trim().length > 0 || attachments.length > 0;
        const escapeAction = resolveEscapeComposerAction({
          waitingForResponse,
          onStopAvailable: Boolean(onStop),
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
          return;
        }
        if (escapeAction === "clear") {
          event.preventDefault();
          event.stopPropagation();
          clearComposerByEscape();
          return;
        }
        if (escapeAction === "restore_history_draft") {
          event.preventDefault();
          event.stopPropagation();
          restoreDraftFromSubmittedHistorySelection();
          return;
        }
      }

      if (
        isRestoreClearedDraftKey(event) &&
        !shouldShowSlashSuggestions &&
        inputValue.trim().length === 0 &&
        attachments.length === 0
      ) {
        if (!restoreEscClearedComposerDraft()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const hasComposerDraft =
        inputValue.trim().length > 0 || attachments.length > 0;

      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        !shouldShowSlashSuggestions &&
        hasComposerDraft
      ) {
        event.preventDefault();
        enqueueDraft({
          message: inputValue,
          draftAttachments: attachments,
          prioritize: false,
          interruptCurrentRun: false,
          feedback: "",
        });
        return;
      }

      if (
        !hasComposerDraft &&
        queuedDrafts.length > 0 &&
        !shouldShowSlashSuggestions
      ) {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          stepQueuedDraftSelection(event.key === "ArrowUp" ? "up" : "down");
          return;
        }
        if (event.key === "Enter" && !event.shiftKey && selectedQueuedDraftId) {
          event.preventDefault();
          restoreQueuedDraftToComposer(selectedQueuedDraftId);
          return;
        }
      }

      const canCycleSubmittedMessageHistory =
        !shouldShowSlashSuggestions &&
        queuedDrafts.length === 0 &&
        attachments.length === 0 &&
        submittedMessageHistoryEntries.length > 0 &&
        (selectedSubmittedMessageIndex !== null || !hasComposerDraft);

      if (
        canCycleSubmittedMessageHistory &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        event.preventDefault();
        stepSubmittedMessageHistorySelection(
          event.key === "ArrowUp" ? "older" : "newer",
        );
        return;
      }

      if (event.key !== "Enter" || event.shiftKey || isSubmitDisabled) {
        return;
      }
      event.preventDefault();
      const formEvent = new Event("submit", {
        bubbles: true,
        cancelable: true,
      });
      event.currentTarget.form?.dispatchEvent(formEvent);
    },
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
      stepQueuedDraftSelection,
      stepSubmittedMessageHistorySelection,
      shouldShowSlashSuggestions,
      slashSuggestions,
      slashSuggestions.length,
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
  const dictationTooltipHandlers = useMemo(() => {
    if (!canDictate) {
      return null;
    }
    return getFloatingBoxHandlers({
      title: "Dictation",
      content: dictationAriaLabel,
    });
  }, [canDictate, dictationAriaLabel]);
  const slashSuggestionsPositionClass =
    resolvedSlashPlacement === "below"
      ? "top-[calc(100%+4px)]"
      : "bottom-[calc(100%+4px)]";
  const canRenderSlashSuggestionsInPortal =
    shouldShowSlashSuggestions &&
    slashSuggestionsPortalStyle !== null &&
    typeof document !== "undefined" &&
    Boolean(document.body);

  const slashSuggestionsList = (
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
  );

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
          <ChatInputQueuedDraftStack
            queuedDrafts={queuedDrafts}
            selectedQueuedDraftId={selectedQueuedDraftId}
            onRestoreQueuedDraft={restoreQueuedDraftToComposer}
            onSelectedQueuedDraftIdChange={setSelectedQueuedDraftId}
          />
          <div className="group relative my-1 w-full">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
              disabled={attachmentInputDisabled}
            />
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
            {canDictate ? (
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
                  className={
                    dictationState === "listening" ? "animate-pulse" : undefined
                  }
                />
              </button>
            ) : null}
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
            {shouldShowSlashSuggestions &&
            !canRenderSlashSuggestionsInPortal ? (
              <div
                className={`absolute left-1 right-1 z-20 max-h-52 overflow-y-auto overflow-x-hidden rounded-md border border-setta-200 bg-white p-1 shadow-lg dark:border-setta-700 dark:bg-setta-900 ${slashSuggestionsPositionClass}`}
              >
                {slashSuggestionsList}
              </div>
            ) : null}
          </div>
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
          <ChatInputMetaControls
            disabled={isDisabled}
            executionControls={executionControls}
            executionControlVisibility={executionControlVisibility}
            contextWindowTokens={contextWindowTokens}
            contextUsedTokens={contextUsedTokens}
            contextUsageIsEstimated={contextUsageIsEstimated}
            contextUsageUnavailable={contextUsageUnavailable}
            runtimeActivityCounts={runtimeActivityCounts}
            runtimeActivityDetails={runtimeActivityDetails}
          />
          {attachments.length > 0 ? (
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
                    <span className="max-w-[200px] truncate">
                      {attachment.name}
                    </span>
                    {attachment.size !== null &&
                    attachment.size !== undefined ? (
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
          ) : null}
          {attachmentWarning ? (
            <div
              className="mb-0.5 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200"
              role="alert"
            >
              {attachmentWarning}
            </div>
          ) : null}
        </div>
      </div>
      {canRenderSlashSuggestionsInPortal && document.body
        ? createPortal(
            <div
              className="fixed z-40 overflow-y-auto overflow-x-hidden rounded-md border border-setta-200 bg-white p-1 shadow-lg dark:border-setta-700 dark:bg-setta-900"
              style={slashSuggestionsPortalStyle}
            >
              {slashSuggestionsList}
            </div>,
            document.body,
          )
        : null}
    </form>
  );
});
