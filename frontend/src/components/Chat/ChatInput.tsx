import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
import { formatBytes } from "utils/attachments";
import { ChatFileAttachment } from "utils/generatedTypes";
import {
  CHAT_SLASH_COMMANDS,
  type ChatPermissionModeValue,
  type ChatSlashCommandAction,
  type ChatSlashCommandDefinition,
  getSlashCommandSuggestions,
  parseSlashCommand,
} from "./chatComposerControls";
import {
  type DictationState,
  type SpeechRecognitionLike,
  getSpeechRecognitionConstructor,
  insertTextAtSelection,
  isDictationAvailable,
  mapDictationError,
  pickProviderRecorderMimeType,
} from "./dictation";
import { isProviderDictationUnsupportedError } from "./providerDictationSupport";
import { useChatAttachmentManager } from "./useChatAttachmentManager";

const SLASH_SUGGESTIONS_MAX_HEIGHT_PX = 208;
const SLASH_SUGGESTIONS_EDGE_PADDING_PX = 8;
const SLASH_SUGGESTIONS_BASE_HEIGHT_PX = 12;
const SLASH_SUGGESTIONS_ROW_HEIGHT_PX = 36;
const SLASH_SUGGESTIONS_INPUT_INSET_PX = 4;
const UNKNOWN_SLASH_COMMAND_FEEDBACK =
  "Unknown or unavailable command. Use /help.";
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

type ChatExecutionControls = {
  permissionMode: ChatPermissionModeValue;
  searchEnabled?: boolean;
  onPermissionModeChange: (next: ChatPermissionModeValue) => void;
  onSearchEnabledChange?: (next: boolean) => void;
};

type ChatExecutionControlVisibility = {
  permissionMode?: boolean;
  search?: boolean;
};

export type ChatSlashCommand = {
  command: string;
  action: ChatSlashCommandAction;
  args: string[];
};

export type ChatSlashCommandResult =
  | boolean
  | {
      handled?: boolean;
      feedback?: string;
      keepInput?: boolean;
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

type StopEscapeKeyEventLike = {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
};

export function isStopEscapeKey(event: StopEscapeKeyEventLike): boolean {
  return (
    event.key === "Escape" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.ctrlKey
  );
}

type QueuedChatDraft = {
  id: string;
  message: string;
  attachments: ChatFileAttachment[];
  queuedAtMs: number;
};

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

type ChatInputProps = {
  placeholderText: string | undefined;
  waitingForResponse: boolean;
  disabled?: boolean;
  submitDisabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit: (
    message: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean | void> | boolean | void;
  onStop?: () => Promise<void> | void;
  executionControls?: ChatExecutionControls;
  executionControlVisibility?: ChatExecutionControlVisibility;
  slashCommands?: ChatSlashCommandDefinition[];
  onSlashCommand?: (
    command: ChatSlashCommand,
  ) => Promise<ChatSlashCommandResult | void> | ChatSlashCommandResult | void;
  slashSuggestionsPlacement?: "auto" | "above" | "below";
  dictationMode?: "auto" | "browser" | "provider";
  onProviderDictationTranscribe?: (audioBlob: Blob) => Promise<string | null>;
  dictationEnabledByProvider?: boolean;
  providerDictationLikelySupported?: boolean;
  contextWindowTokens?: number | null;
  contextUsedTokens?: number | null;
  contextUsageIsEstimated?: boolean;
};

export const ChatInput = memo(function ChatInput({
  placeholderText,
  waitingForResponse,
  disabled = false,
  submitDisabled = false,
  value,
  onChange,
  onSubmit,
  onStop,
  executionControls,
  executionControlVisibility = {
    permissionMode: true,
    search: true,
  },
  slashCommands = CHAT_SLASH_COMMANDS,
  onSlashCommand,
  slashSuggestionsPlacement = "auto",
  dictationMode = "auto",
  onProviderDictationTranscribe,
  dictationEnabledByProvider = true,
  providerDictationLikelySupported = true,
  contextWindowTokens = null,
  contextUsedTokens = null,
  contextUsageIsEstimated = false,
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
  const [contextBadgeMode, setContextBadgeMode] = useState<
    "percentage" | "tokens"
  >("percentage");
  const [queuedDrafts, setQueuedDrafts] = useState<QueuedChatDraft[]>([]);
  const [queuedDispatchEpoch, setQueuedDispatchEpoch] = useState(0);
  const [selectedQueuedDraftId, setSelectedQueuedDraftId] = useState<
    string | null
  >(null);
  const isControlled = typeof value === "string" && Boolean(onChange);
  const inputValue = isControlled ? value : internalValue;
  const inputValueRef = useRef(inputValue);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const providerRecorderRef = useRef<MediaRecorder | null>(null);
  const providerStreamRef = useRef<MediaStream | null>(null);
  const providerChunksRef = useRef<Array<BlobPart>>([]);
  const dictationSourceRef = useRef<"browser" | "provider" | null>(null);
  const queuedDraftIdRef = useRef(0);
  const queuedDispatchInFlightRef = useRef(false);
  const blockedQueuedDraftIdRef = useRef<string | null>(null);
  const componentMountedRef = useRef(true);
  const isDisabled = disabled;

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  useEffect(() => {
    return () => {
      componentMountedRef.current = false;
    };
  }, []);

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

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(event.target.value);
      setSlashFeedback(null);
    },
    [setInputValue],
  );

  const clearInput = useCallback(() => {
    setInputValue("");
  }, [setInputValue]);

  const getNextQueuedDraftId = useCallback(() => {
    queuedDraftIdRef.current += 1;
    return `queued-draft-${queuedDraftIdRef.current}`;
  }, []);

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
        attachments: draftAttachments.map((attachment) => ({ ...attachment })),
        queuedAtMs: Date.now(),
      };
      blockedQueuedDraftIdRef.current = null;
      setQueuedDrafts((current) =>
        enqueueQueuedDraft(current, nextDraft, prioritize),
      );
      setSelectedQueuedDraftId(nextDraft.id);
      setSlashFeedback(feedback);
      clearInput();
      clearAttachments();
      if (interruptCurrentRun && onStop) {
        void onStop();
      }
      return true;
    },
    [clearAttachments, clearInput, getNextQueuedDraftId, onStop],
  );

  const restoreQueuedDraftToComposer = useCallback(
    (draftId: string) => {
      const draft = queuedDrafts.find((item) => item.id === draftId);
      if (!draft) {
        return;
      }
      blockedQueuedDraftIdRef.current = null;
      setQueuedDrafts((current) =>
        current.filter((item) => item.id !== draftId),
      );
      setSelectedQueuedDraftId(null);
      setInputValue(draft.message);
      replaceAttachments(
        draft.attachments.map((attachment) => ({ ...attachment })),
      );
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
    [queuedDrafts, replaceAttachments, setInputValue],
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
    if (blockedQueuedDraftIdRef.current === nextQueuedDraft.id) {
      return;
    }
    const draftToSend = nextQueuedDraft;
    queuedDispatchInFlightRef.current = true;
    blockedQueuedDraftIdRef.current = null;
    setQueuedDrafts((current) =>
      current.filter((item) => item.id !== draftToSend.id),
    );
    setSelectedQueuedDraftId((current) =>
      current === draftToSend.id ? null : current,
    );
    void (async () => {
      let result = false;
      try {
        result =
          (await onSubmit(draftToSend.message, draftToSend.attachments)) ===
          true;
      } catch {
        result = false;
      }
      if (!componentMountedRef.current) {
        queuedDispatchInFlightRef.current = false;
        return;
      }
      queuedDispatchInFlightRef.current = false;
      if (result) {
        setQueuedDispatchEpoch((current) => current + 1);
        return;
      }
      blockedQueuedDraftIdRef.current = draftToSend.id;
      setQueuedDrafts((current) =>
        enqueueQueuedDraft(current, draftToSend, true),
      );
      setSelectedQueuedDraftId(draftToSend.id);
      setSlashFeedback("Queued message failed. Edit it and retry.");
      setQueuedDispatchEpoch((current) => current + 1);
    })();
  }, [
    isSubmitDisabled,
    nextQueuedDraft,
    onSubmit,
    queuedDispatchEpoch,
    waitingForResponse,
  ]);

  const runSlashCommand = useCallback(
    async (message: string): Promise<boolean> => {
      const parsed = parseSlashCommand(message, CHAT_SLASH_COMMANDS);
      if (!parsed) {
        return false;
      }
      const commandAvailable = slashCommands.some(
        (entry) => entry.command === parsed.command,
      );
      if (!commandAvailable) {
        setSlashFeedback(UNKNOWN_SLASH_COMMAND_FEEDBACK);
        return true;
      }
      if (!onSlashCommand) {
        setSlashFeedback(UNKNOWN_SLASH_COMMAND_FEEDBACK);
        return true;
      }
      const result = await onSlashCommand(parsed);
      if (result === false) {
        setSlashFeedback(UNKNOWN_SLASH_COMMAND_FEEDBACK);
        return true;
      }
      const slashResult =
        result && typeof result === "object" ? result : undefined;
      if (slashResult?.handled === false) {
        setSlashFeedback(UNKNOWN_SLASH_COMMAND_FEEDBACK);
        return true;
      }
      setSlashFeedback(slashResult?.feedback ?? `Ran ${parsed.command}`);
      if (!slashResult?.keepInput) {
        clearInput();
        clearAttachments();
      }
      return true;
    },
    [clearAttachments, clearInput, onSlashCommand, slashCommands],
  );

  const submitMessage = useCallback(
    async (
      submittedValue: string,
      submittedAttachments: ChatFileAttachment[],
    ): Promise<void> => {
      if (waitingForResponse) {
        const queued = enqueueDraft({
          message: submittedValue,
          draftAttachments: submittedAttachments,
          prioritize: true,
          interruptCurrentRun: true,
          feedback: "Queued and stopping current response...",
        });
        if (queued) {
          return;
        }
        if (onStop) {
          await onStop();
        }
        return;
      }
      if (isSubmitDisabled) {
        return;
      }
      if (await runSlashCommand(submittedValue)) {
        return;
      }
      const trimmedInput = submittedValue.trim();
      if (trimmedInput.length === 0 && submittedAttachments.length === 0) {
        return;
      }
      const result = await onSubmit(submittedValue, submittedAttachments);
      if (result === true) {
        clearInput();
        clearAttachments();
      }
    },
    [
      clearAttachments,
      clearInput,
      enqueueDraft,
      isSubmitDisabled,
      onStop,
      onSubmit,
      runSlashCommand,
      waitingForResponse,
    ],
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
      if (!isStopEscapeKey(event) || !waitingForResponse || !onStop) {
        return;
      }
      if (event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
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
          feedback: "Queued. Sends after current response finishes.",
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
          setSelectedQueuedDraftId((current) =>
            cycleQueuedDraftSelection(
              queuedDrafts,
              current,
              event.key === "ArrowUp" ? "prev" : "next",
            ),
          );
          return;
        }
        if (event.key === "Enter" && !event.shiftKey && selectedQueuedDraftId) {
          event.preventDefault();
          restoreQueuedDraftToComposer(selectedQueuedDraftId);
          return;
        }
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
      enqueueDraft,
      inputValue,
      isSubmitDisabled,
      queuedDrafts,
      restoreQueuedDraftToComposer,
      selectedQueuedDraftId,
      shouldShowSlashSuggestions,
      slashSuggestions,
      slashSuggestions.length,
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
      "nodrag max-h-40 w-full max-w-none flex-1 resize-none overflow-y-auto rounded-md border border-setta-200 bg-transparent py-1.5 pl-9 pr-9 text-[13px] leading-[1.35] text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:border-blue-500 focus:ring-1 focus:ring-inset focus:ring-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:border-blue-700 dark:focus:ring-blue-700";
    const dragClass = isDragActive
      ? "ring-2 ring-blue-400 bg-blue-50/40 dark:bg-blue-900/20"
      : "";
    if (isDisabled) {
      return `${base} ${dragClass} cursor-not-allowed opacity-30`;
    }
    return `${base} ${dragClass} cursor-auto opacity-100`;
  }, [isDisabled, isDragActive]);

  const dictationSupported = Boolean(getSpeechRecognitionConstructor());
  const canBrowserDictate = isDictationAvailable(dictationSupported);
  const mediaRecorderSupported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const canProviderDictate = Boolean(
    dictationEnabledByProvider &&
      onProviderDictationTranscribe &&
      mediaRecorderSupported,
  );
  const canAutoUseProviderDictation =
    canProviderDictate && providerDictationLikelySupported;
  const canDictate =
    !isDisabled &&
    (() => {
      if (dictationMode === "provider") {
        return canProviderDictate;
      }
      if (dictationMode === "browser") {
        return canBrowserDictate;
      }
      return canAutoUseProviderDictation || canBrowserDictate;
    })();
  const showPermissionControl = Boolean(
    executionControls && executionControlVisibility.permissionMode !== false,
  );
  const showSearchControl = Boolean(
    executionControls &&
      executionControlVisibility.search !== false &&
      typeof executionControls.onSearchEnabledChange === "function",
  );
  const showExecutionControls = showPermissionControl || showSearchControl;
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
  const contextRemainingLabel = useMemo(() => {
    if (remainingContextTokens === null) {
      return null;
    }
    const contextLabelPrefix = contextUsageIsEstimated
      ? "est. context left"
      : "Context left";
    if (contextBadgeMode === "tokens") {
      return `${contextLabelPrefix} ~${formatCompactTokenCount(
        remainingContextTokens,
      )}`;
    }
    if (remainingContextPercentage === null) {
      return null;
    }
    return `${contextLabelPrefix} ${remainingContextPercentage}%`;
  }, [
    contextBadgeMode,
    contextUsageIsEstimated,
    remainingContextPercentage,
    remainingContextTokens,
  ]);
  const showContextBadge = contextRemainingLabel !== null;
  const shouldShowComposerMetaRow = showExecutionControls || showContextBadge;
  const handleContextBadgeToggle = useCallback(() => {
    setContextBadgeMode((current) =>
      current === "percentage" ? "tokens" : "percentage",
    );
  }, []);
  const slashSuggestionsPositionClass =
    resolvedSlashPlacement === "below"
      ? "top-[calc(100%+4px)]"
      : "bottom-[calc(100%+4px)]";
  const canRenderSlashSuggestionsInPortal =
    shouldShowSlashSuggestions &&
    slashSuggestionsPortalStyle !== null &&
    typeof document !== "undefined" &&
    Boolean(document.body);

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
      setDictationState("error");
      setDictationFeedback(mapDictationError(event.error));
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

  const startProviderDictation = useCallback(
    async (allowBrowserFallback: boolean) => {
      if (!canProviderDictate || !onProviderDictationTranscribe) {
        if (maybeFallbackToBrowserDictation(allowBrowserFallback)) {
          return;
        }
        setDictationState("error");
        setDictationFeedback("Provider dictation is not available.");
        return;
      }
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        if (maybeFallbackToBrowserDictation(allowBrowserFallback)) {
          return;
        }
        setDictationState("error");
        setDictationFeedback("Provider dictation is not available.");
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
          if (maybeFallbackToBrowserDictation(allowBrowserFallback)) {
            return;
          }
          setDictationState("error");
          setDictationFeedback("Provider dictation is not available.");
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
          cleanupProviderCapture();
          setDictationState("error");
          setDictationFeedback("Microphone input failed.");
        };
        recorder.onstop = () => {
          providerRecorderRef.current = null;
          dictationSourceRef.current = null;
          const streamRef = providerStreamRef.current;
          if (streamRef) {
            for (const track of streamRef.getTracks()) {
              track.stop();
            }
          }
          providerStreamRef.current = null;
          const chunks = providerChunksRef.current;
          providerChunksRef.current = [];
          let blobType = recorder.mimeType || mimeType || "audio/webm";
          for (const chunk of chunks) {
            if (chunk instanceof Blob && chunk.type) {
              blobType = chunk.type;
              break;
            }
          }
          const blob = new Blob(chunks, { type: blobType });
          if (blob.size === 0) {
            setDictationState("error");
            setDictationFeedback("No speech was detected.");
            return;
          }
          setDictationState("transcribing");
          setDictationFeedback("Transcribing...");
          void (async () => {
            try {
              const transcript = await onProviderDictationTranscribe(blob);
              const normalized = (transcript ?? "").trim();
              if (!normalized) {
                setDictationState("error");
                setDictationFeedback("Provider transcription failed.");
                return;
              }
              insertTranscript(`${normalized} `);
              setDictationState("idle");
              setDictationFeedback(null);
            } catch (error) {
              if (
                isProviderDictationUnsupportedError(error) &&
                maybeFallbackToBrowserDictation(allowBrowserFallback)
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
          })();
        };
        setDictationState("listening");
        setDictationFeedback("Listening...");
        recorder.start();
      } catch {
        cleanupProviderCapture();
        if (maybeFallbackToBrowserDictation(allowBrowserFallback)) {
          return;
        }
        setDictationState("error");
        setDictationFeedback("Microphone access was denied.");
      }
    },
    [
      canProviderDictate,
      cleanupProviderCapture,
      insertTranscript,
      maybeFallbackToBrowserDictation,
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
          className="flex min-w-0 flex-1 flex-col"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {queuedDrafts.length > 0 ? (
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
                return (
                  <button
                    key={draft.id}
                    type="button"
                    className={`w-full rounded-md border px-2 py-1 text-left transition-colors ${
                      isSelected
                        ? "border-blue-500/80 bg-blue-50/80 text-blue-900 dark:border-blue-500/70 dark:bg-blue-900/35 dark:text-blue-100"
                        : "border-setta-200/80 bg-setta-50/80 text-setta-700 hover:border-setta-300 hover:bg-setta-100 dark:border-setta-700/80 dark:bg-setta-900/65 dark:text-setta-200 dark:hover:border-setta-600 dark:hover:bg-setta-800/80"
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
                      if (
                        event.key === "ArrowUp" ||
                        event.key === "ArrowDown"
                      ) {
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
                    title={
                      previewText.length > 0
                        ? previewText
                        : "Queued attachment message"
                    }
                  >
                    <div className="flex min-w-0 items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em]">
                      <span className="border-current/30 inline-flex h-4 min-w-4 items-center justify-center rounded-sm border px-1">
                        {index + 1}
                      </span>
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
                  </button>
                );
              })}
            </div>
          ) : null}
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
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholderText}
              className={textAreaClassName}
              disabled={isDisabled}
            />
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${buttonClassName} disabled:opacity-40`}
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
          {shouldShowComposerMetaRow ? (
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {executionControls &&
                executionControlVisibility.permissionMode !== false ? (
                  <DropdownMenu.Root modal={false}>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        disabled={isDisabled}
                        aria-label={`${executionControls.permissionMode} permissions`}
                        title={`Permissions: ${executionControls.permissionMode.replaceAll(
                          "_",
                          " ",
                        )}`}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                      >
                        <IoMdKey
                          size={12}
                          className={permissionModeIconClassName}
                        />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="start"
                        sideOffset={6}
                        className="z-30 min-w-[220px] rounded-md border border-setta-200 bg-white p-1 text-xs shadow-xl dark:border-setta-700 dark:bg-setta-900"
                      >
                        {[
                          { value: "minimal", label: "minimal" },
                          { value: "yolo", label: "yolo" },
                          {
                            value: "config_toml_custom",
                            label: "config.toml custom",
                          },
                        ].map((mode) => (
                          <DropdownMenu.Item
                            key={mode.value}
                            className={`cursor-pointer rounded px-2 py-1.5 transition-colors ${
                              executionControls.permissionMode === mode.value
                                ? "bg-blue-600 text-white"
                                : "text-setta-700 hover:bg-setta-100 dark:text-setta-200 dark:hover:bg-setta-800"
                            }`}
                            onSelect={() =>
                              executionControls.onPermissionModeChange(
                                mode.value as ChatPermissionModeValue,
                              )
                            }
                          >
                            {mode.label}
                          </DropdownMenu.Item>
                        ))}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                ) : null}
                {canDictate ? (
                  <button
                    type="button"
                    aria-label={
                      dictationState === "listening"
                        ? "Stop Mic"
                        : dictationState === "transcribing"
                          ? "Transcribing"
                          : "Mic"
                    }
                    title={
                      dictationState === "listening"
                        ? "Stop Mic"
                        : dictationState === "transcribing"
                          ? "Transcribing"
                          : "Mic"
                    }
                    aria-pressed={dictationState === "listening"}
                    disabled={isDisabled || dictationState === "transcribing"}
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] transition-colors ${
                      dictationState === "listening"
                        ? "bg-blue-600 text-white"
                        : "text-setta-500 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    onClick={handleDictationToggle}
                  >
                    <IoMic
                      size={11}
                      className={
                        dictationState === "listening"
                          ? "animate-pulse"
                          : undefined
                      }
                    />
                  </button>
                ) : null}
                {executionControls &&
                executionControlVisibility.search !== false &&
                typeof executionControls.onSearchEnabledChange ===
                  "function" ? (
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
                        !Boolean(executionControls.searchEnabled),
                      )
                    }
                  >
                    Search
                  </button>
                ) : null}
              </div>
              {contextRemainingLabel ? (
                <button
                  type="button"
                  className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-setta-400 transition-colors hover:bg-setta-100 hover:text-setta-600 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-300"
                  onClick={handleContextBadgeToggle}
                  title={
                    contextBadgeMode === "tokens"
                      ? "Show remaining context percentage"
                      : "Show remaining context tokens"
                  }
                >
                  {contextRemainingLabel}
                </button>
              ) : null}
            </div>
          ) : null}
          {attachments.length > 0 ? (
            <div className="mb-0.5 flex flex-wrap gap-1.5">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-1.5 rounded-md border border-setta-200 bg-white/80 px-2 py-0.5 text-xs text-setta-700 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-200"
                >
                  <span className="max-w-[200px] truncate">
                    {attachment.name}
                  </span>
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
                  >
                    <IoClose />
                  </button>
                </div>
              ))}
              {attachments.length > 1 ? (
                <button
                  type="button"
                  className="rounded-full border border-setta-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 hover:border-setta-400 hover:text-setta-600 dark:border-setta-800 dark:text-setta-500 dark:hover:text-setta-200"
                  onClick={handleClearAttachments}
                  disabled={attachmentActionsDisabled}
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
