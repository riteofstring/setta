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
import {
  IoAdd,
  IoAttach,
  IoChevronDown,
  IoClose,
  IoFolderOpen,
  IoMic,
  IoSend,
  IoStop,
} from "react-icons/io5";
import { formatBytes } from "utils/attachments";
import { ChatDictationMode, ChatFileAttachment } from "utils/generatedTypes";
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
  mapDictationError,
} from "./dictation";
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
const PROVIDER_DEFAULT_CHUNK_MS = 1200;
const PROVIDER_TARGET_SAMPLE_RATE_HZ = 24_000;
const PROVIDER_CHANNELS = 1;
const PROVIDER_FILE_BATCH_MS = 1000;
const PROVIDER_FILE_BATCH_SAMPLES = Math.max(
  1,
  Math.floor((PROVIDER_FILE_BATCH_MS * PROVIDER_TARGET_SAMPLE_RATE_HZ) / 1000),
);

type ProviderTranscriptionSessionStart = {
  sessionId: string;
  resolvedTransportMode: "file" | "realtime";
  chunkMs: number;
};

function concatInt16(a: Int16Array, b: Int16Array): Int16Array {
  const merged = new Int16Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

function resampleFloat32ToMonoPcm16(
  input: Float32Array,
  inputSampleRateHz: number,
  targetSampleRateHz: number,
): Int16Array {
  if (input.length === 0) {
    return new Int16Array(0);
  }
  if (inputSampleRateHz === targetSampleRateHz) {
    const pcm = new Int16Array(input.length);
    for (let index = 0; index < input.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, input[index]));
      pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm;
  }
  const ratio = inputSampleRateHz / targetSampleRateHz;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const pcm = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = Math.min(input.length - 1, Math.floor(index * ratio));
    const sample = Math.max(-1, Math.min(1, input[sourceIndex]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

function int16ToArrayBuffer(samples: Int16Array): ArrayBuffer {
  const view = new Uint8Array(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength,
  );
  return view.slice().buffer;
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
  permissionMode: ChatPermissionModeValue;
  searchEnabled?: boolean;
  onPermissionModeChange: (next: ChatPermissionModeValue) => void;
  onSearchEnabledChange?: (next: boolean) => void;
};

type ChatExecutionControlVisibility = {
  permissionMode?: boolean;
  search?: boolean;
};

type DictationStartPath = "provider" | "browser" | "unavailable";

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

export function resolveDictationStartPath({
  dictationMode,
  canProviderDictate,
  canBrowserDictate,
}: {
  dictationMode: ChatDictationMode;
  canProviderDictate: boolean;
  canBrowserDictate: boolean;
}): DictationStartPath {
  if (dictationMode === "provider") {
    return canProviderDictate ? "provider" : "unavailable";
  }
  if (dictationMode === "browser") {
    return canBrowserDictate ? "browser" : "unavailable";
  }
  if (canProviderDictate) {
    return "provider";
  }
  if (canBrowserDictate) {
    return "browser";
  }
  return "unavailable";
}

export function resolveDictationUnavailableFeedback({
  dictationMode,
  providerUnavailableMessage,
}: {
  dictationMode: ChatDictationMode;
  providerUnavailableMessage: string;
}): string {
  if (dictationMode === "provider") {
    return providerUnavailableMessage;
  }
  return "Dictation is not available.";
}

function isMicrophonePermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const normalizedName = error.name.toLowerCase();
  const normalizedMessage = error.message.toLowerCase();
  if (
    normalizedName.includes("notallowed") ||
    normalizedName.includes("permissiondenied")
  ) {
    return true;
  }
  return (
    normalizedMessage.includes("permission denied") ||
    normalizedMessage.includes("permission") ||
    normalizedMessage.includes("microphone access was denied")
  );
}

function resolveProviderStartFailureFeedback(error: unknown): string {
  if (isMicrophonePermissionError(error)) {
    return "Microphone access was denied.";
  }
  if (error instanceof Error && error.message.trim()) {
    return `Provider dictation failed to start: ${error.message.trim()}`;
  }
  return "Provider dictation failed to start.";
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
  dictationMode?: ChatDictationMode;
  onProviderTranscriptionSessionStart?: () => Promise<ProviderTranscriptionSessionStart | null>;
  onProviderTranscriptionSessionAppend?: (
    sessionId: string,
    audioPcm16: ArrayBuffer,
    sampleRateHz: number,
    channels: number,
  ) => Promise<string | null>;
  onProviderTranscriptionSessionStop?: (
    sessionId: string,
  ) => Promise<string | null>;
  onProviderTranscriptionSessionCancel?: (sessionId: string) => Promise<void>;
  dictationEnabledByProvider?: boolean;
  providerDictationUnavailableMessage?: string;
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
  onProviderTranscriptionSessionStart,
  onProviderTranscriptionSessionAppend,
  onProviderTranscriptionSessionStop,
  onProviderTranscriptionSessionCancel,
  dictationEnabledByProvider = true,
  providerDictationUnavailableMessage,
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
  const isControlled = typeof value === "string" && Boolean(onChange);
  const inputValue = isControlled ? value : internalValue;
  const inputValueRef = useRef(inputValue);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const providerAudioContextRef = useRef<AudioContext | null>(null);
  const providerSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const providerProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const providerStreamRef = useRef<MediaStream | null>(null);
  const providerPcmPendingRef = useRef<Int16Array>(new Int16Array(0));
  const providerPcmQueueRef = useRef<ArrayBuffer[]>([]);
  const providerTranscriptionInFlightRef = useRef(false);
  const providerStartInFlightRef = useRef(false);
  const providerStartAttemptRef = useRef(0);
  const providerStopRequestedRef = useRef(false);
  const providerHasTranscriptRef = useRef(false);
  const providerBackendSessionIdRef = useRef<string | null>(null);
  const providerResolvedTransportModeRef = useRef<"file" | "realtime">("file");
  const providerChunkMsRef = useRef(PROVIDER_DEFAULT_CHUNK_MS);
  const providerSessionRef = useRef(0);
  const dictationSourceRef = useRef<"browser" | "provider" | null>(null);
  const isDisabled = disabled;

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  const {
    attachments,
    attachmentActionsDisabled,
    attachmentCountLabel,
    attachmentInputDisabled,
    attachmentWarning,
    clearAttachments,
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

      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        waitingForResponse ||
        isSubmitDisabled
      ) {
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
      inputValue,
      isSubmitDisabled,
      shouldShowSlashSuggestions,
      slashSuggestions,
      slashSuggestions.length,
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
  const canBrowserDictate = dictationSupported;
  const providerCaptureSupported =
    typeof window !== "undefined" &&
    typeof window.AudioContext !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const canProviderDictate = Boolean(
    dictationEnabledByProvider &&
      onProviderTranscriptionSessionStart &&
      onProviderTranscriptionSessionAppend &&
      onProviderTranscriptionSessionStop &&
      onProviderTranscriptionSessionCancel &&
      providerCaptureSupported,
  );
  const resolvedProviderUnavailableMessage =
    providerDictationUnavailableMessage?.trim() ||
    "Provider dictation is not available.";
  const dictationStartPath = resolveDictationStartPath({
    dictationMode,
    canProviderDictate,
    canBrowserDictate,
  });
  const canDictate = !isDisabled && dictationStartPath !== "unavailable";
  const showDictationButton =
    !isDisabled &&
    (dictationStartPath !== "unavailable" || dictationMode === "provider");
  const showPermissionControl = Boolean(
    executionControls && executionControlVisibility.permissionMode !== false,
  );
  const showSearchControl = Boolean(
    executionControls &&
      executionControlVisibility.search !== false &&
      typeof executionControls.onSearchEnabledChange === "function",
  );
  const showExecutionControls = showPermissionControl || showSearchControl;
  const slashSuggestionsPositionClass =
    resolvedSlashPlacement === "below"
      ? "top-[calc(100%+4px)]"
      : "bottom-[calc(100%+4px)]";
  const canRenderSlashSuggestionsInPortal =
    shouldShowSlashSuggestions &&
    slashSuggestionsPortalStyle !== null &&
    typeof document !== "undefined" &&
    Boolean(document.body);

  const teardownProviderAudioCapture = useCallback(() => {
    const processor = providerProcessorNodeRef.current;
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
    }
    providerProcessorNodeRef.current = null;
    const sourceNode = providerSourceNodeRef.current;
    if (sourceNode) {
      sourceNode.disconnect();
    }
    providerSourceNodeRef.current = null;
    const stream = providerStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    providerStreamRef.current = null;
    const audioContext = providerAudioContextRef.current;
    if (audioContext) {
      void audioContext.close();
    }
    providerAudioContextRef.current = null;
  }, []);

  const resetProviderCaptureSession = useCallback(() => {
    providerStartAttemptRef.current += 1;
    providerPcmPendingRef.current = new Int16Array(0);
    providerPcmQueueRef.current = [];
    providerTranscriptionInFlightRef.current = false;
    providerStopRequestedRef.current = false;
    providerHasTranscriptRef.current = false;
    providerBackendSessionIdRef.current = null;
    providerResolvedTransportModeRef.current = "file";
    providerChunkMsRef.current = PROVIDER_DEFAULT_CHUNK_MS;
    providerSessionRef.current += 1;
    dictationSourceRef.current = null;
  }, []);

  const cleanupProviderCapture = useCallback(
    (cancelBackendSession: boolean) => {
      const backendSessionId = providerBackendSessionIdRef.current;
      teardownProviderAudioCapture();
      resetProviderCaptureSession();
      if (
        cancelBackendSession &&
        backendSessionId &&
        onProviderTranscriptionSessionCancel
      ) {
        void onProviderTranscriptionSessionCancel(backendSessionId);
      }
    },
    [
      onProviderTranscriptionSessionCancel,
      resetProviderCaptureSession,
      teardownProviderAudioCapture,
    ],
  );

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

  const maybeFinalizeProviderSession = useCallback(
    (sessionId: number) => {
      if (providerSessionRef.current !== sessionId) {
        return;
      }
      if (!providerStopRequestedRef.current) {
        return;
      }
      if (providerTranscriptionInFlightRef.current) {
        return;
      }
      if (providerPcmQueueRef.current.length > 0) {
        return;
      }
      void (async () => {
        let stopTranscript: string | null = null;
        const backendSessionId = providerBackendSessionIdRef.current;
        try {
          if (backendSessionId && onProviderTranscriptionSessionStop) {
            stopTranscript =
              await onProviderTranscriptionSessionStop(backendSessionId);
          }
        } catch (error) {
          if (providerSessionRef.current !== sessionId) {
            return;
          }
          cleanupProviderCapture(true);
          setDictationState("error");
          setDictationFeedback(
            error instanceof Error && error.message
              ? error.message
              : "Provider transcription failed.",
          );
          return;
        }
        if (providerSessionRef.current !== sessionId) {
          return;
        }
        const normalizedStopTranscript = (stopTranscript ?? "").trim();
        if (normalizedStopTranscript) {
          providerHasTranscriptRef.current = true;
          insertTranscript(stopTranscript ?? "");
        }
        const hasTranscript = providerHasTranscriptRef.current;
        cleanupProviderCapture(false);
        if (hasTranscript) {
          setDictationState("idle");
          setDictationFeedback(null);
          return;
        }
        setDictationState("error");
        setDictationFeedback("No speech was detected.");
      })();
    },
    [
      cleanupProviderCapture,
      insertTranscript,
      onProviderTranscriptionSessionStop,
    ],
  );

  const flushProviderPcmQueue = useCallback(
    (sessionId: number) => {
      if (providerSessionRef.current !== sessionId) {
        return;
      }
      if (providerTranscriptionInFlightRef.current) {
        return;
      }
      const backendSessionId = providerBackendSessionIdRef.current;
      if (!backendSessionId || !onProviderTranscriptionSessionAppend) {
        maybeFinalizeProviderSession(sessionId);
        return;
      }
      const nextChunk = providerPcmQueueRef.current.shift();
      if (!nextChunk) {
        maybeFinalizeProviderSession(sessionId);
        return;
      }
      providerTranscriptionInFlightRef.current = true;
      void (async () => {
        try {
          const transcript = await onProviderTranscriptionSessionAppend(
            backendSessionId,
            nextChunk,
            PROVIDER_TARGET_SAMPLE_RATE_HZ,
            PROVIDER_CHANNELS,
          );
          if (providerSessionRef.current !== sessionId) {
            return;
          }
          const normalized = (transcript ?? "").trim();
          if (normalized) {
            providerHasTranscriptRef.current = true;
            insertTranscript(transcript ?? "");
          }
          if (!providerStopRequestedRef.current) {
            setDictationFeedback("Listening...");
          }
        } catch (error) {
          if (providerSessionRef.current !== sessionId) {
            return;
          }
          cleanupProviderCapture(true);
          setDictationState("error");
          setDictationFeedback(
            error instanceof Error && error.message
              ? error.message
              : "Provider transcription failed.",
          );
          return;
        } finally {
          if (providerSessionRef.current !== sessionId) {
            return;
          }
          providerTranscriptionInFlightRef.current = false;
          flushProviderPcmQueue(sessionId);
        }
      })();
    },
    [
      cleanupProviderCapture,
      insertTranscript,
      maybeFinalizeProviderSession,
      onProviderTranscriptionSessionAppend,
      onProviderTranscriptionSessionStop,
      onProviderTranscriptionSessionCancel,
    ],
  );

  const stopProviderCapture = useCallback(() => {
    const sessionId = providerSessionRef.current;
    if (sessionId <= 0) {
      return;
    }
    providerStopRequestedRef.current = true;
    dictationSourceRef.current = null;
    const pending = providerPcmPendingRef.current;
    if (pending.length > 0) {
      providerPcmQueueRef.current.push(int16ToArrayBuffer(pending));
      providerPcmPendingRef.current = new Int16Array(0);
    }
    teardownProviderAudioCapture();
    setDictationState("transcribing");
    setDictationFeedback("Transcribing...");
    flushProviderPcmQueue(sessionId);
  }, [flushProviderPcmQueue, teardownProviderAudioCapture]);

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
    if (
      dictationSourceRef.current === "provider" ||
      providerStartInFlightRef.current
    ) {
      cleanupProviderCapture(true);
    } else {
      stopBrowserDictation();
    }
    setDictationState("idle");
    setDictationFeedback(null);
  }, [cleanupProviderCapture, stopBrowserDictation]);

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

  const maybeFallbackToBrowserDictation = useCallback((): boolean => {
    if (dictationMode !== "auto" || !canBrowserDictate) {
      return false;
    }
    startBrowserDictation();
    return true;
  }, [canBrowserDictate, dictationMode, startBrowserDictation]);

  const startProviderDictation = useCallback(async () => {
    if (providerStartInFlightRef.current) {
      return;
    }
    if (
      !canProviderDictate ||
      !onProviderTranscriptionSessionStart ||
      !onProviderTranscriptionSessionAppend ||
      !onProviderTranscriptionSessionStop ||
      !onProviderTranscriptionSessionCancel
    ) {
      if (maybeFallbackToBrowserDictation()) {
        return;
      }
      setDictationState("error");
      setDictationFeedback(resolvedProviderUnavailableMessage);
      return;
    }
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window === "undefined" ||
      typeof window.AudioContext === "undefined"
    ) {
      if (maybeFallbackToBrowserDictation()) {
        return;
      }
      setDictationState("error");
      setDictationFeedback(resolvedProviderUnavailableMessage);
      return;
    }
    providerStartInFlightRef.current = true;
    setDictationState("starting");
    setDictationFeedback("Starting...");
    cleanupProviderCapture(false);
    const startAttemptId = providerStartAttemptRef.current + 1;
    providerStartAttemptRef.current = startAttemptId;
    let backendSessionId: string | null = null;
    try {
      const startedSession = await onProviderTranscriptionSessionStart();
      if (!startedSession || !startedSession.sessionId) {
        if (maybeFallbackToBrowserDictation()) {
          return;
        }
        setDictationState("error");
        setDictationFeedback(resolvedProviderUnavailableMessage);
        return;
      }
      backendSessionId = startedSession.sessionId;
      if (providerStartAttemptRef.current !== startAttemptId) {
        await onProviderTranscriptionSessionCancel(backendSessionId);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (providerStartAttemptRef.current !== startAttemptId) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        await onProviderTranscriptionSessionCancel(backendSessionId);
        return;
      }
      providerStreamRef.current = stream;
      const sessionId = providerSessionRef.current + 1;
      providerSessionRef.current = sessionId;
      providerBackendSessionIdRef.current = backendSessionId;
      providerResolvedTransportModeRef.current =
        startedSession.resolvedTransportMode;
      providerChunkMsRef.current =
        startedSession.resolvedTransportMode === "realtime"
          ? Math.max(200, startedSession.chunkMs || PROVIDER_DEFAULT_CHUNK_MS)
          : PROVIDER_DEFAULT_CHUNK_MS;
      providerPcmPendingRef.current = new Int16Array(0);
      providerPcmQueueRef.current = [];
      providerTranscriptionInFlightRef.current = false;
      providerStopRequestedRef.current = false;
      providerHasTranscriptRef.current = false;
      dictationSourceRef.current = "provider";
      const audioContext = new window.AudioContext();
      providerAudioContextRef.current = audioContext;
      await audioContext.resume();
      if (providerStartAttemptRef.current !== startAttemptId) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        await audioContext.close();
        providerStreamRef.current = null;
        providerAudioContextRef.current = null;
        await onProviderTranscriptionSessionCancel(backendSessionId);
        return;
      }
      const sourceNode = audioContext.createMediaStreamSource(stream);
      providerSourceNodeRef.current = sourceNode;
      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      providerProcessorNodeRef.current = processorNode;
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      sourceNode.connect(processorNode);
      processorNode.connect(silentGain);
      silentGain.connect(audioContext.destination);
      processorNode.onaudioprocess = (event) => {
        if (providerSessionRef.current !== sessionId) {
          return;
        }
        if (providerStopRequestedRef.current) {
          return;
        }
        const channelData = event.inputBuffer.getChannelData(0);
        if (!channelData || channelData.length === 0) {
          return;
        }
        const pcmChunk = resampleFloat32ToMonoPcm16(
          channelData,
          audioContext.sampleRate,
          PROVIDER_TARGET_SAMPLE_RATE_HZ,
        );
        if (pcmChunk.length === 0) {
          return;
        }
        providerPcmPendingRef.current = concatInt16(
          providerPcmPendingRef.current,
          pcmChunk,
        );
        const chunkSamples =
          providerResolvedTransportModeRef.current === "realtime"
            ? Math.max(
                1,
                Math.floor(
                  (providerChunkMsRef.current *
                    PROVIDER_TARGET_SAMPLE_RATE_HZ) /
                    1000,
                ),
              )
            : PROVIDER_FILE_BATCH_SAMPLES;
        let enqueued = false;
        while (providerPcmPendingRef.current.length >= chunkSamples) {
          const nextSamples = providerPcmPendingRef.current.slice(
            0,
            chunkSamples,
          );
          providerPcmQueueRef.current.push(int16ToArrayBuffer(nextSamples));
          providerPcmPendingRef.current =
            providerPcmPendingRef.current.slice(chunkSamples);
          enqueued = true;
        }
        if (enqueued) {
          flushProviderPcmQueue(sessionId);
        }
      };
      setDictationState("listening");
      setDictationFeedback("Listening...");
    } catch (error) {
      if (backendSessionId) {
        await onProviderTranscriptionSessionCancel(backendSessionId);
      }
      cleanupProviderCapture(false);
      if (maybeFallbackToBrowserDictation()) {
        return;
      }
      setDictationState("error");
      setDictationFeedback(resolveProviderStartFailureFeedback(error));
    } finally {
      providerStartInFlightRef.current = false;
    }
  }, [
    canProviderDictate,
    cleanupProviderCapture,
    flushProviderPcmQueue,
    maybeFallbackToBrowserDictation,
    onProviderTranscriptionSessionAppend,
    onProviderTranscriptionSessionCancel,
    onProviderTranscriptionSessionStart,
    onProviderTranscriptionSessionStop,
    resolvedProviderUnavailableMessage,
  ]);

  const startDictation = useCallback(() => {
    if (!canDictate) {
      setDictationState("error");
      setDictationFeedback(
        resolveDictationUnavailableFeedback({
          dictationMode,
          providerUnavailableMessage: resolvedProviderUnavailableMessage,
        }),
      );
      return;
    }
    if (dictationStartPath === "provider") {
      void startProviderDictation();
      return;
    }
    startBrowserDictation();
  }, [
    canDictate,
    dictationMode,
    dictationStartPath,
    resolvedProviderUnavailableMessage,
    startBrowserDictation,
    startProviderDictation,
  ]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      cleanupProviderCapture(true);
    };
  }, [cleanupProviderCapture]);

  useEffect(() => {
    if (
      !isDisabled ||
      (dictationState !== "listening" && dictationState !== "starting")
    ) {
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
    if (dictationState === "transcribing" || dictationState === "starting") {
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
    <form onSubmit={handleSubmit} className="flex justify-center">
      <div className="flex w-full gap-1">
        <div
          className="flex min-w-0 flex-1 flex-col"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="relative my-1 w-full">
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
          {showExecutionControls || canDictate ? (
            <div className="mb-0.5 flex flex-wrap items-center gap-1">
              {executionControls &&
              executionControlVisibility.permissionMode !== false ? (
                <DropdownMenu.Root modal={false}>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      disabled={isDisabled}
                      className="inline-flex items-center gap-1 rounded-md border border-setta-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-setta-600 transition-colors hover:border-setta-400 hover:text-setta-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
                    >
                      {executionControls.permissionMode.replaceAll("_", " ")}
                      <IoChevronDown />
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
              {executionControls &&
              executionControlVisibility.search !== false &&
              typeof executionControls.onSearchEnabledChange === "function" ? (
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
              {showDictationButton ? (
                <button
                  type="button"
                  disabled={
                    isDisabled ||
                    dictationState === "transcribing" ||
                    dictationState === "starting"
                  }
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                    dictationState === "listening"
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-setta-200 text-setta-600 hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  onClick={handleDictationToggle}
                >
                  <IoMic size={12} />
                  {dictationState === "listening"
                    ? "Stop Mic"
                    : dictationState === "transcribing"
                      ? "Transcribing"
                      : dictationState === "starting"
                        ? "Starting"
                        : "Mic"}
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
