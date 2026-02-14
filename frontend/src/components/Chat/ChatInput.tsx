import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
import { ChatFileAttachment } from "utils/generatedTypes";
import {
  CHAT_SLASH_COMMANDS,
  type ChatPermissionModeValue,
  type ChatSlashCommandDefinition,
  type ChatStarterPrompt,
  getSlashCommandSuggestions,
  parseSlashCommand,
} from "./chatComposerControls";
import {
  getSpeechRecognitionConstructor,
  insertTextAtSelection,
  isDictationAvailable,
  mapDictationError,
  type DictationState,
  type SpeechRecognitionLike,
} from "./dictation";
import { useChatAttachmentManager } from "./useChatAttachmentManager";

const MAX_STARTER_PROMPTS_RENDERED = 6;

type ChatExecutionControls = {
  permissionMode: ChatPermissionModeValue;
  searchEnabled: boolean;
  skillsEnabled: boolean;
  onPermissionModeChange: (next: ChatPermissionModeValue) => void;
  onSearchEnabledChange: (next: boolean) => void;
  onSkillsEnabledChange: (next: boolean) => void;
};

export type ChatSlashCommand = {
  command: string;
  action: string;
  args: string[];
};

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
  slashCommands?: ChatSlashCommandDefinition[];
  onSlashCommand?: (
    command: ChatSlashCommand,
  ) => Promise<boolean | void> | boolean | void;
  starterPrompts?: ChatStarterPrompt[];
  showPythonStarterPrompts?: boolean;
  dictationEnabledByProvider?: boolean;
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
  slashCommands = CHAT_SLASH_COMMANDS,
  onSlashCommand,
  starterPrompts = [],
  showPythonStarterPrompts = false,
  dictationEnabledByProvider = true,
}: ChatInputProps) {
  const [internalValue, setInternalValue] = useState("");
  const [slashFeedback, setSlashFeedback] = useState<string | null>(null);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [dictationState, setDictationState] = useState<DictationState>("idle");
  const [dictationFeedback, setDictationFeedback] = useState<string | null>(null);
  const isControlled = typeof value === "string" && Boolean(onChange);
  const inputValue = isControlled ? value : internalValue;
  const inputValueRef = useRef(inputValue);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
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
      const parsed = parseSlashCommand(message, slashCommands);
      if (!parsed || !onSlashCommand) {
        return false;
      }
      const handled = await onSlashCommand(parsed);
      if (handled === false) {
        return false;
      }
      setSlashFeedback(`Ran ${parsed.command}`);
      clearInput();
      clearAttachments();
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
      isSubmitDisabled,
      shouldShowSlashSuggestions,
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
      "nodrag text-sm leading-5 max-h-48 w-full max-w-none flex-1 resize-none overflow-y-auto rounded-lg border border-setta-200 bg-transparent py-2 pl-10 pr-10 text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:outline-none focus:outline focus:outline-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:outline-blue-700";
    const dragClass = isDragActive
      ? "ring-2 ring-blue-400 bg-blue-50/40 dark:bg-blue-900/20"
      : "";
    if (isDisabled) {
      return `${base} ${dragClass} cursor-not-allowed opacity-30`;
    }
    return `${base} ${dragClass} cursor-auto opacity-100`;
  }, [isDisabled, isDragActive]);

  const quickSlashCommands = useMemo(
    () =>
      slashCommands.filter((command) =>
        ["/new", "/resume", "/model"].includes(command.command),
      ),
    [slashCommands],
  );

  const executeQuickCommand = useCallback(
    async (command: string) => {
      if (command === "/model") {
        setInputValue("/model ");
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }
      await submitMessage(command, []);
    },
    [setInputValue, submitMessage],
  );

  const visibleStarterPrompts = useMemo(
    () =>
      starterPrompts
        .filter(
          (starterPrompt) =>
            !starterPrompt.requiresPython || showPythonStarterPrompts,
        )
        .slice(0, MAX_STARTER_PROMPTS_RENDERED),
    [showPythonStarterPrompts, starterPrompts],
  );

  const handleStarterPrompt = useCallback(
    async (prompt: string) => {
      await submitMessage(prompt, []);
    },
    [submitMessage],
  );

  const dictationSupported = Boolean(getSpeechRecognitionConstructor());
  const canDictate = isDictationAvailable(
    dictationEnabledByProvider,
    dictationSupported,
  );

  const stopDictation = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }
    recognition.stop();
    recognitionRef.current = null;
    setDictationState("idle");
    setDictationFeedback(null);
  }, []);

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

  const startDictation = useCallback(() => {
    if (!canDictate) {
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
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
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
    };
    recognition.onend = () => {
      setDictationState((state) => (state === "error" ? "error" : "idle"));
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setDictationState("listening");
    setDictationFeedback("Listening...");
    recognition.start();
  }, [canDictate, insertTranscript]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const handleDictationToggle = useCallback(() => {
    if (dictationState === "listening") {
      stopDictation();
      return;
    }
    startDictation();
  }, [dictationState, startDictation, stopDictation]);

  return (
    <form onSubmit={handleSubmit} className="flex justify-center">
      <div className="flex w-full gap-2">
        <div
          className="flex min-w-0 flex-1 flex-col"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {visibleStarterPrompts.length > 0 ? (
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              {visibleStarterPrompts.map((starterPrompt) => (
                <button
                  key={starterPrompt.id}
                  type="button"
                  className="rounded border border-setta-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-setta-600 transition-colors hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
                  onClick={() => void handleStarterPrompt(starterPrompt.prompt)}
                  disabled={isSubmitDisabled}
                >
                  {starterPrompt.label}
                </button>
              ))}
            </div>
          ) : null}
          {quickSlashCommands.length > 0 ? (
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              {quickSlashCommands.map((command) => (
                <button
                  key={command.command}
                  type="button"
                  className="rounded border border-transparent px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-setta-500 transition-colors hover:border-setta-200 hover:text-setta-800 dark:text-setta-400 dark:hover:border-setta-700 dark:hover:text-setta-100"
                  onClick={() => void executeQuickCommand(command.command)}
                  disabled={isSubmitDisabled}
                >
                  {command.command}
                </button>
              ))}
            </div>
          ) : null}
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
                  className={`absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200 ${
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
              className={`absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-base transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${buttonClassName} disabled:opacity-40`}
            >
              {buttonIcon}
            </button>
            {shouldShowSlashSuggestions ? (
              <div className="absolute left-1 right-1 top-[calc(100%+4px)] z-20 rounded-md border border-setta-200 bg-white p-1 shadow-lg dark:border-setta-700 dark:bg-setta-900">
                {slashSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.command}
                    type="button"
                    className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition-colors ${
                      index === activeSlashIndex
                        ? "bg-setta-100 text-setta-900 dark:bg-setta-800 dark:text-setta-100"
                        : "text-setta-600 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applySlashSuggestion(index)}
                  >
                    <span className="font-semibold">{suggestion.command}</span>
                    <span className="truncate pl-2 text-[10px] text-setta-400 dark:text-setta-500">
                      {suggestion.summary}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-1">
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
          {executionControls || canDictate ? (
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {executionControls ? (
                <DropdownMenu.Root modal={false}>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-setta-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-setta-600 transition-colors hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
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
              {executionControls ? (
                <button
                  type="button"
                  aria-pressed={executionControls.searchEnabled}
                  className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                    executionControls.searchEnabled
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-setta-200 text-setta-600 hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
                  }`}
                  onClick={() =>
                    executionControls.onSearchEnabledChange(
                      !executionControls.searchEnabled,
                    )
                  }
                >
                  Search
                </button>
              ) : null}
              {executionControls ? (
                <button
                  type="button"
                  aria-pressed={executionControls.skillsEnabled}
                  className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                    executionControls.skillsEnabled
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-setta-200 text-setta-600 hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
                  }`}
                  onClick={() =>
                    executionControls.onSkillsEnabledChange(
                      !executionControls.skillsEnabled,
                    )
                  }
                >
                  Skills
                </button>
              ) : null}
              {canDictate ? (
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                    dictationState === "listening"
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-setta-200 text-setta-600 hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
                  }`}
                  onClick={handleDictationToggle}
                >
                  <IoMic size={12} />
                  {dictationState === "listening" ? "Stop Mic" : "Mic"}
                </button>
              ) : null}
            </div>
          ) : null}
          {attachments.length > 0 ? (
            <div className="mb-1 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-2 rounded-md border border-setta-200 bg-white/80 px-2 py-1 text-xs text-setta-700 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-200"
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
              className="mb-1 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200"
              role="alert"
            >
              {attachmentWarning}
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
});

