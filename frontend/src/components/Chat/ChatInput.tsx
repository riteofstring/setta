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
import type { AppGenerationMode } from "state/types/appGenerationMode";
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
const SLASH_SUGGESTIONS_PORTAL_STYLE_KEYS = [
  "left",
  "width",
  "maxHeight",
  "top",
  "bottom",
] as const;
const DEFAULT_RUNTIME_ACTIVITY_COUNTS: ChatRuntimeActivityCounts = {
  activeBackgroundTerminals: 0,
  activeSubagents: 0,
};
const DEFAULT_RUNTIME_ACTIVITY_DETAILS: ChatRuntimeActivityDetails = {
  activeBackgroundTerminals: [],
  activeSubagents: [],
};

function normalizeNonNegativeCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

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
  thinkingEnabled?: boolean;
  onThinkingEnabledChange?: (next: boolean) => void;
  permissionMode: ChatPermissionModeValue;
  searchEnabled?: boolean;
  onPermissionModeChange: (next: ChatPermissionModeValue) => void;
  onSearchEnabledChange?: (next: boolean) => void;
};

type ChatExecutionControlVisibility = {
  thinking?: boolean;
  permissionMode?: boolean;
  search?: boolean;
};

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

export type ChatSlashCommand = {
  command: string;
  action: ChatSlashCommandAction;
  args: string[];
  rawSuffix?: string;
  promptTemplate?: string;
  unavailableFeedback?: string;
};

export type ChatSlashCommandResult =
  | boolean
  | {
      appGenerationMode?: AppGenerationMode | null;
      handled?: boolean;
      feedback?: string;
      keepInput?: boolean;
      refreshedSlashCommands?: ChatSlashCommandDefinition[];
      refreshedRecognizedSlashCommands?: ChatSlashCommandDefinition[];
      submitPromptTemplate?: boolean;
    };

export type ChatSubmitOptions = {
  appGeneration?: {
    mode: AppGenerationMode;
    referenceImageUrl: string | null;
    referenceImageNotes: string | null;
  } | null;
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

type RestoreClearedDraftKeyEventLike = {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
};

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

type QueuedChatDraft = {
  id: string;
  message: string;
  attachments: ChatFileAttachment[];
  queuedAtMs: number;
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

function buildUnavailableSlashCommandFeedback(
  command: ChatSlashCommand,
): string {
  return (
    command.unavailableFeedback ??
    `${command.command} is unavailable in the current context. Use /help.`
  );
}

type ProviderDictationTranscriptionResult =
  | {
      kind: "ok";
      transcript: string;
    }
  | {
      kind: "no_speech";
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
    options?: ChatSubmitOptions,
  ) => Promise<boolean> | boolean;
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

type EscClearedComposerDraft = {
  message: string;
  attachments: ChatFileAttachment[];
};

export const ChatInput = memo(function ChatInput({
  placeholderText,
  waitingForResponse,
  disabled = false,
  submitDisabled = false,
  value,
  onChange,
  onSubmit,
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
  const [selectedSubmittedMessageIndex, setSelectedSubmittedMessageIndex] =
    useState<number | null>(null);
  const submittedHistoryDraftBeforeSelectionRef = useRef<string | null>(null);
  const isControlled = typeof value === "string" && Boolean(onChange);
  const inputValue = isControlled ? value : internalValue;
  const slashCommandRecognitionSet = recognizedSlashCommands ?? slashCommands;
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
  const stopRequestedForCurrentResponseRef = useRef(false);
  const escClearedComposerDraftRef = useRef<EscClearedComposerDraft | null>(
    null,
  );
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

  useEffect(() => {
    if (!waitingForResponse) {
      stopRequestedForCurrentResponseRef.current = false;
    }
  }, [waitingForResponse]);

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
    [clearAttachments, clearInput, getNextQueuedDraftId, onStop],
  );

  const restoreQueuedDraftToComposer = useCallback(
    (draftId: string) => {
      const draft = queuedDrafts.find((item) => item.id === draftId);
      if (!draft) {
        return;
      }
      blockedQueuedDraftIdRef.current = null;
      escClearedComposerDraftRef.current = null;
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
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) {
        return;
      }
      const end = draftToRestore.length;
      node.focus();
      node.setSelectionRange(end, end);
    });
  }, [setInputValue]);

  const clearComposerByEscape = useCallback((): boolean => {
    const currentMessage = inputValueRef.current;
    const nextAttachments = attachments.map((attachment) => ({
      ...attachment,
    }));
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
    replaceAttachments(
      draft.attachments.map((attachment) => ({ ...attachment })),
    );
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
  }, [replaceAttachments, setInputValue]);

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
    }): Promise<boolean> => {
      if (!commandAvailable) {
        setSlashFeedback(buildUnavailableSlashCommandFeedback(parsed));
        return true;
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
          return true;
        }
        const submitted =
          (await onSubmit(submission.message, submission.attachments)) === true;
        if (!submitted) {
          setSlashFeedback(`Failed to submit ${parsed.command}.`);
          return true;
        }
        setSlashFeedback(`Submitted ${parsed.command}`);
        escClearedComposerDraftRef.current = null;
        clearInput();
        clearAttachments();
        return true;
      }
      if (parsed.action === "native_prompt") {
        const submitted =
          (await onSubmit(message, submittedAttachments)) === true;
        if (!submitted) {
          setSlashFeedback(`Failed to submit ${parsed.command}.`);
          return true;
        }
        setSlashFeedback(`Submitted ${parsed.command}`);
        escClearedComposerDraftRef.current = null;
        clearInput();
        clearAttachments();
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
          return true;
        }
        const submitted =
          (await onSubmit(submission.message, submission.attachments, {
            appGeneration: {
              mode: slashResult.appGenerationMode,
              referenceImageUrl: null,
              referenceImageNotes: null,
            },
          })) === true;
        if (!submitted) {
          setSlashFeedback(`Failed to submit ${parsed.command}.`);
          return true;
        }
        setSlashFeedback(slashResult.feedback ?? `Submitted ${parsed.command}.`);
        escClearedComposerDraftRef.current = null;
        clearInput();
        clearAttachments();
        return true;
      }
      setSlashFeedback(slashResult?.feedback ?? `Ran ${parsed.command}`);
      if (!slashResult?.keepInput) {
        escClearedComposerDraftRef.current = null;
        clearInput();
        clearAttachments();
      }
      return true;
    },
    [clearAttachments, clearInput, onSlashCommand, onSubmit],
  );

  const runSlashCommand = useCallback(
    async (
      message: string,
      submittedAttachments: ChatFileAttachment[],
    ): Promise<boolean> => {
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
      if (!message.trimStart().startsWith("/") || !onUnknownSlashCommand) {
        return false;
      }
      const result = await onUnknownSlashCommand(message, submittedAttachments);
      if (result === false) {
        return false;
      }
      const slashResult =
        result && typeof result === "object" ? result : undefined;
      if (slashResult?.handled === false) {
        return false;
      }
      const refreshedSlashCommands =
        slashResult?.refreshedSlashCommands ?? null;
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
        escClearedComposerDraftRef.current = null;
        clearInput();
        clearAttachments();
      }
      return true;
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
      if (await runSlashCommand(submittedValue, submittedAttachments)) {
        return;
      }
      const trimmedInput = submittedValue.trim();
      if (trimmedInput.length === 0 && submittedAttachments.length === 0) {
        return;
      }
      const result = await onSubmit(submittedValue, submittedAttachments);
      if (result === true) {
        escClearedComposerDraftRef.current = null;
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
        if (event.key === "ArrowDown" && selectedSubmittedMessageIndex === 0) {
          restoreDraftFromSubmittedHistorySelection();
          return;
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
          return;
        }
        const nextMessage = submittedMessageHistoryEntries[nextSelectedIndex];
        if (typeof nextMessage !== "string") {
          return;
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
  const showExecutionControls =
    showThinkingControl || showPermissionControl || showSearchControl;
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
  const contextLabelPrefixFull = contextUsageIsEstimated
    ? "est. context left"
    : "context left";
  const contextLabelPrefixCompact = contextUsageIsEstimated
    ? "est. context"
    : "context";
  const showContextUnavailableBadge =
    contextRemainingValue === null && contextUsageUnavailable;
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
  const showBackgroundTerminalDropdown =
    activeBackgroundTerminalEntries.length > 0;
  const showSubagentDropdown = activeSubagentEntries.length > 0;
  const showRuntimeActivityCounters =
    activeBackgroundTerminals > 0 || activeSubagents > 0;
  const showContextBadge =
    contextRemainingValue !== null || showContextUnavailableBadge;
  const shouldShowComposerMetaRow =
    showExecutionControls || showContextBadge || showRuntimeActivityCounters;
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
    if (showContextUnavailableBadge) {
      return getFloatingBoxHandlers({
        title: "Context unavailable",
        content: "Context usage telemetry is unavailable for this chat run.",
      });
    }
    return getFloatingBoxHandlers({
      title: "Context",
      content:
        contextBadgeMode === "tokens"
          ? "Click to show remaining context percentage."
          : "Click to show remaining context tokens.",
    });
  }, [contextBadgeMode, showContextBadge, showContextUnavailableBadge]);
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
      if (!canProviderDictate || !onProviderDictationTranscribe) {
        if (
          maybeFallbackForProviderFailure({
            phase: "capture_start",
            failureClass: "unknown",
            allowBrowserFallback,
          })
        ) {
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
        if (
          maybeFallbackForProviderFailure({
            phase: "capture_start",
            failureClass: "unknown",
            allowBrowserFallback,
          })
        ) {
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
          if (
            maybeFallbackForProviderFailure({
              phase: "capture_start",
              failureClass: "unknown",
              allowBrowserFallback,
            })
          ) {
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
          if (
            maybeFallbackForProviderFailure({
              phase: "capture_runtime",
              failureClass: "unknown",
              allowBrowserFallback,
            })
          ) {
            return;
          }
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
            setDictationState("idle");
            setDictationFeedback(null);
            addTemporaryNotification("No speech was detected.");
            return;
          }
          setDictationState("transcribing");
          setDictationFeedback("Transcribing...");
          void (async () => {
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
                throw new Error(
                  "Provider transcription returned an empty result.",
                );
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
          })();
        };
        setDictationState("listening");
        setDictationFeedback("Listening...");
        recorder.start();
      } catch {
        cleanupProviderCapture();
        if (
          maybeFallbackForProviderFailure({
            phase: "capture_start",
            failureClass: "unknown",
            allowBrowserFallback,
          })
        ) {
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
          {shouldShowComposerMetaRow ? (
            <div className="mb-0.5 flex items-center justify-between gap-2 [&_button]:cursor-pointer">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {showThinkingControl && executionControls ? (
                  <button
                    type="button"
                    aria-label="Thinking"
                    aria-pressed={Boolean(executionControls.thinkingEnabled)}
                    disabled={isDisabled}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                    onClick={() =>
                      executionControls.onThinkingEnabledChange?.(
                        !Boolean(executionControls.thinkingEnabled),
                      )
                    }
                    {...(thinkingTooltipHandlers ?? {})}
                  >
                    <BiSolidBrain size={12} className={thinkingIconClassName} />
                  </button>
                ) : null}
                {executionControls &&
                executionControlVisibility.permissionMode !== false ? (
                  <DropdownMenu.Root modal={false}>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        disabled={isDisabled}
                        aria-label={`${executionControls.permissionMode} permissions`}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                        {...(permissionTooltipHandlers ?? {})}
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
                {showRuntimeActivityCounters ? (
                  <div className="inline-flex items-center gap-1">
                    {showBackgroundTerminalDropdown ? (
                      <DropdownMenu.Root modal={false}>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            data-chat-runtime-active-background-terminals="true"
                            className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                            aria-label={`${activeBackgroundTerminals} background terminal${activeBackgroundTerminals === 1 ? "" : "s"} active`}
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
                                  <p
                                    className="truncate text-[11px] font-medium"
                                    title={entry.label}
                                  >
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
                    ) : (
                      <span
                        data-chat-runtime-active-background-terminals="true"
                        className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 dark:border-setta-700 dark:text-setta-300"
                        aria-label={`${activeBackgroundTerminals} background terminal${activeBackgroundTerminals === 1 ? "" : "s"} active`}
                        {...(backgroundTerminalTooltipHandlers ?? {})}
                      >
                        <FiTerminal size={10} />
                        <span className="font-mono leading-none">
                          {activeBackgroundTerminals}
                        </span>
                      </span>
                    )}
                    {showSubagentDropdown ? (
                      <DropdownMenu.Root modal={false}>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            data-chat-runtime-active-subagents="true"
                            className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                            aria-label={`${activeSubagents} subagent${activeSubagents === 1 ? "" : "s"} active`}
                            {...(subagentTooltipHandlers ?? {})}
                          >
                            <FiCpu size={10} />
                            <span className="font-mono leading-none">
                              {activeSubagents}
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
                              Subagents
                            </DropdownMenu.Label>
                            <DropdownMenu.Separator className="my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
                            <div className="max-h-52 overflow-y-auto pb-1">
                              {activeSubagentEntries.map((entry) => (
                                <div
                                  key={entry.id}
                                  className="rounded px-2 py-1.5 text-setta-700 dark:text-setta-200"
                                >
                                  <p
                                    className="truncate text-[11px] font-medium"
                                    title={entry.label}
                                  >
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
                    ) : (
                      <span
                        data-chat-runtime-active-subagents="true"
                        className="inline-flex h-5 select-none items-center gap-1 rounded-md border border-setta-200 px-1.5 text-[10px] font-semibold text-setta-500 dark:border-setta-700 dark:text-setta-300"
                        aria-label={`${activeSubagents} subagent${activeSubagents === 1 ? "" : "s"} active`}
                        {...(subagentTooltipHandlers ?? {})}
                      >
                        <FiCpu size={10} />
                        <span className="font-mono leading-none">
                          {activeSubagents}
                        </span>
                      </span>
                    )}
                  </div>
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
                    {...(searchTooltipHandlers ?? {})}
                  >
                    Search
                  </button>
                ) : null}
              </div>
              {contextRemainingValue ? (
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
              ) : showContextUnavailableBadge ? (
                <span
                  className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-600 dark:text-amber-300"
                  aria-label="context unavailable"
                  {...(contextTooltipHandlers ?? {})}
                >
                  context unavailable
                </span>
              ) : null}
            </div>
          ) : null}
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
