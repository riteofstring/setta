import type {
  ChatCommandDescriptor,
  ChatCommandExecuteResult,
  ChatModelOption,
  ChatReasoningEffortOption,
} from "@generated/backend";
import { Check, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "../lib/utils";
import { commandDescriptorContextKey } from "../stores/chat-store-command-cache";
import { commandDescriptorsNeedLoad, slashCommandExecutionPlan } from "./chat-command-execution";
import {
  commandComposerState,
  commandListErrorForDraft,
  commandListPendingForDraft,
  completionForCommandState,
  firstAvailableSuggestionIndex,
  type CommandCompletionEdit,
  type CommandComposerState,
  type CommandSuggestionRow,
} from "./chat-command-composer-controller";
import {
  ComposerButton,
  handleComposerKeyDown,
  ModelPickerButton,
  modelPickerOptionSelected,
  PermissionModeUnavailableButton,
  reasoningEffortOptionSelected,
  VoiceInputUnavailableButton,
} from "./chat-composer-controls";
import type { ChatView } from "./chat-panel";
import { chatReadableColumnAttributes, chatReadableColumnClass } from "./chat-layout";
import { SettaLogoMark } from "./setta-logo-mark";
import { Textarea } from "./ui/textarea";

export { modelPickerOptionSelected, reasoningEffortOptionSelected } from "./chat-composer-controls";

const emptyCommandDescriptors: ChatCommandDescriptor[] = [];

function composerDisabled(disabledOverride: boolean | undefined, selected: boolean, busy: boolean) {
  if (disabledOverride !== undefined) {
    return disabledOverride;
  }
  return !selected || busy;
}

function isModelPickerOpen(modelPicker: ChatCommandExecuteResult | null) {
  return modelPicker?.result.action === "model_picker";
}

function canSendComposerDraft(disabled: boolean, draftText: string) {
  return !disabled && draftText !== "";
}

function canSendImmediateSteeringDraft({
  disabled,
  draftText,
  hasPendingSteering,
  running,
  slashDraft,
}: {
  disabled: boolean;
  draftText: string;
  hasPendingSteering: boolean;
  running: boolean;
  slashDraft: boolean;
}) {
  return running && !disabled && !slashDraft && (draftText !== "" || hasPendingSteering);
}

function modelPickerControlDisabled(
  selectedConversation: ChatView["selectedConversation"],
  disabled: boolean,
  running: boolean,
) {
  return selectedConversation === null || disabled || running;
}

interface ComposerProps {
  busy: boolean;
  chat: ChatView;
  disabled?: boolean;
  formClassName?: string;
  frameClassName?: string;
  onSendPrompt?: (prompt: string) => Promise<void>;
  placeholder?: string;
  running: boolean;
}

const composerChatPropSelectors = [
  (chat: ChatView) => chat.activeRun?.id,
  (chat: ChatView) => chat.commandListError,
  (chat: ChatView) => chat.commandListStatus,
  (chat: ChatView) => chat.executeCommand,
  (chat: ChatView) => chat.goal,
  (chat: ChatView) => chat.listCommands,
  (chat: ChatView) => chat.openCodexModelPicker,
  (chat: ChatView) => chat.operation,
  (chat: ChatView) => chat.pendingSteeringMessageIds,
  (chat: ChatView) => chat.queueMessage,
  (chat: ChatView) => chat.selectedConversation,
  (chat: ChatView) => chat.sendMessage,
  (chat: ChatView) => chat.sendSteeringImmediately,
  (chat: ChatView) => chat.setCodexModel,
  (chat: ChatView) => chat.setCodexReasoningEffort,
  (chat: ChatView) => chat.status,
  (chat: ChatView) => chat.steerMessage,
  (chat: ChatView) => chat.stopActiveRun,
] as const;

function ComposerComponent({
  busy,
  chat,
  disabled: disabledOverride,
  formClassName,
  frameClassName,
  onSendPrompt,
  placeholder = "",
  running,
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [commands, setCommands] = useState<ChatCommandDescriptor[]>(emptyCommandDescriptors);
  const [commandListKey, setCommandListKey] = useState("");
  const [commandListRequestKey, setCommandListRequestKey] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);
  const [modelPicker, setModelPicker] = useState<ChatCommandExecuteResult | null>(null);
  const [paletteDismissed, setPaletteDismissed] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const restoreComposerFocusRef = useRef(false);
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selected = chat.selectedConversation !== null;
  const commandListContextKey = commandDescriptorContextKey({
    active: running,
    selectedConversation: chat.selectedConversation,
    workspaceId: chat.selectedConversation?.workspaceId ?? null,
  });
  const listCommands = chat.listCommands;
  const acceptsPrompt = composerAcceptsPrompt(selected, onSendPrompt);
  const disabled = composerDisabled(disabledOverride, acceptsPrompt, busy);
  const slashDraft = isSlashDraft(draft);
  const draftText = draft.trim();
  const commandState = useMemo(() => commandComposerState(draft, commands), [commands, draft]);
  const commandListPending = commandListPendingForDraft({
    commandListContextKey,
    commandListKey,
    commandListRequestKey,
    commandListStatus: chat.commandListStatus,
    slashDraft,
  });
  const commandPaletteVisible = commandPaletteShouldOpen(slashDraft, paletteDismissed, modelPicker);
  const commandListError = commandListErrorForDraft(
    slashDraft,
    chat.commandListStatus,
    chat.commandListError,
  );
  const hasPendingSteering = chat.pendingSteeringMessageIds.length > 0;
  const modelPickerOpen = isModelPickerOpen(modelPicker);
  const canSend = canSendComposerDraft(disabled, draftText);
  const canSendImmediately = canSendImmediateSteeringDraft({
    disabled,
    draftText,
    hasPendingSteering,
    running,
    slashDraft,
  });
  const modelPickerDisabled = modelPickerControlDisabled(
    chat.selectedConversation,
    disabled,
    running,
  );

  useEffect(() => {
    setSelectedSuggestionIndex((current) => {
      if (commandState.suggestions.length === 0) {
        return 0;
      }
      if (current < commandState.suggestions.length) {
        return current;
      }
      return firstAvailableSuggestionIndex(commandState.suggestions);
    });
  }, [commandState.suggestions]);

  useEffect(() => {
    if (commandListContextKey === "") {
      setCommands(emptyCommandDescriptors);
      setCommandListKey("");
      setCommandListRequestKey("");
      setModelPicker(null);
      return;
    }
    if (!slashDraft) {
      setCommands(emptyCommandDescriptors);
      setCommandListKey("");
      setCommandListRequestKey("");
      return;
    }
    if (
      commandListKey === commandListContextKey ||
      commandListRequestKey === commandListContextKey
    ) {
      return;
    }
    let cancelled = false;
    setCommandListRequestKey(commandListContextKey);
    void listCommands()
      .then((result) => {
        if (!cancelled) {
          setCommands(result?.commands ?? emptyCommandDescriptors);
          setCommandListKey(commandListContextKey);
          setCommandListRequestKey("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCommands(emptyCommandDescriptors);
          setCommandListKey(commandListContextKey);
          setCommandListRequestKey("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [commandListContextKey, commandListKey, listCommands, slashDraft]);

  useEffect(() => {
    if (focusRequest === 0) {
      return;
    }
    textareaRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (!restoreComposerFocusRef.current) {
      return;
    }
    focusComposer();
  }, [chat.activeRun?.id, disabled, running]);

  useEffect(() => {
    if (modelPicker?.result.action !== "model_picker") {
      return;
    }
    textareaRef.current?.focus();

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      dismissModelPicker();
    }

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [modelPicker]);

  async function sendDraft() {
    const submittedDraft = draft;
    const prompt = submittedDraft.trim();
    if (!canSubmitDraft(prompt)) {
      return;
    }
    submittingRef.current = true;
    restoreComposerFocusRef.current = true;
    try {
      focusComposerSoon();
      await submitDraftPrompt(prompt, submittedDraft);
      focusComposerSoon();
    } catch {
      focusComposerSoon();
    } finally {
      submittingRef.current = false;
    }
  }

  function canSubmitDraft(prompt: string) {
    return (
      prompt !== "" &&
      (chat.selectedConversation !== null || onSendPrompt !== undefined) &&
      !disabled &&
      !submittingRef.current
    );
  }

  async function submitDraftPrompt(prompt: string, submittedDraft: string) {
    if (onSendPrompt) {
      await onSendPrompt(prompt);
      clearDraftIfUnchanged(submittedDraft);
      return;
    }
    if (slashDraft) {
      await executeSlashDraft(submittedDraft);
      return;
    }
    if (running) {
      await chat.steerMessage(prompt);
      clearDraftIfUnchanged(submittedDraft);
      return;
    }
    await chat.sendMessage(prompt);
    clearDraftIfUnchanged(submittedDraft);
  }

  async function executeSlashDraft(submittedDraft: string) {
    const execution = await slashCommandExecutionPlan({
      commands,
      confirmReplacement: (message) => window.confirm(message),
      currentGoal: chat.goal,
      draft: submittedDraft,
      loadCommands: loadCommandDescriptorsForExecution,
      selectedIndex: selectedSuggestionIndex,
      shouldReloadCommands: commandDescriptorsNeedLoad({
        commandListContextKey,
        commandListKey,
        commands,
      }),
    });
    if (!execution) {
      return;
    }
    setCommands(execution.commands);
    const result = await chat.executeCommand(execution.commandText, execution.options);
    if (result.result.action === "model_picker") {
      setModelPicker(result);
      clearDraftIfUnchanged(submittedDraft);
    } else if (result.result.action === "goal_editor") {
      setModelPicker(null);
      replaceDraftIfUnchanged(submittedDraft, result.result.composerDraft);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      setModelPicker(null);
      clearDraftIfUnchanged(submittedDraft);
    }
  }

  async function loadCommandDescriptorsForExecution() {
    if (commandListContextKey === "") {
      return emptyCommandDescriptors;
    }
    const result = await listCommands();
    const loadedCommands = result?.commands ?? emptyCommandDescriptors;
    setCommands(loadedCommands);
    setCommandListKey(commandListContextKey);
    return loadedCommands;
  }

  function completeCommand() {
    const completion = completionForCommandState(commandState, selectedSuggestionIndex);
    applyCommandCompletion(completion);
  }

  function handleCommandPaletteKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const action = commandPaletteKeyAction(event, {
      paletteVisible: commandPaletteVisible,
      slashDraft,
      suggestionCount: commandState.suggestions.length,
    });
    switch (action) {
      case "dismiss":
        event.preventDefault();
        setPaletteDismissed(true);
        return true;
      case "next":
        event.preventDefault();
        setSelectedSuggestionIndex((index) => (index + 1) % commandState.suggestions.length);
        return true;
      case "previous":
        event.preventDefault();
        setSelectedSuggestionIndex(
          (index) =>
            (index + commandState.suggestions.length - 1) % commandState.suggestions.length,
        );
        return true;
      case "complete":
        event.preventDefault();
        completeCommand();
        return true;
      case "none":
        return false;
    }
  }

  function applyCommandCompletion(completion: CommandCompletionEdit | null) {
    if (!completion) {
      return;
    }
    updateDraft(completion.value);
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(completion.selectionStart, completion.selectionEnd);
    });
  }

  async function pickCommandSuggestion(suggestion: CommandSuggestionRow) {
    if (!suggestion.available || !suggestion.completion) {
      return;
    }
    applyCommandCompletion(suggestion.completion);
  }

  async function queueDraft() {
    const submittedDraft = draft;
    const prompt = submittedDraft.trim();
    if (!prompt || !chat.selectedConversation || disabled || submittingRef.current) {
      return;
    }
    if (slashDraft) {
      return;
    }
    submittingRef.current = true;
    try {
      focusComposerSoon();
      await chat.queueMessage(prompt);
      clearDraftIfUnchanged(submittedDraft);
      focusComposerSoon();
    } catch {
      focusComposerSoon();
    } finally {
      submittingRef.current = false;
    }
  }

  async function sendImmediateSteering() {
    const submittedDraft = draft;
    const prompt = submittedDraft.trim();
    if (!canSubmitImmediateSteering(prompt)) {
      return;
    }
    submittingRef.current = true;
    try {
      await chat.sendSteeringImmediately(prompt === "" ? undefined : prompt);
      clearDraftIfUnchanged(submittedDraft);
    } catch {
      focusComposerSoon();
    } finally {
      submittingRef.current = false;
    }
  }

  function canSubmitImmediateSteering(prompt: string) {
    return (
      chat.selectedConversation !== null &&
      !submittingRef.current &&
      canSendImmediateSteeringDraft({
        disabled,
        draftText: prompt,
        hasPendingSteering,
        running,
        slashDraft,
      })
    );
  }

  async function openModelPicker() {
    if (!chat.selectedConversation || disabled || running || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      const result = await chat.openCodexModelPicker();
      if (result.result.action === "model_picker") {
        setModelPicker(result);
        setDraft("");
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <form
      className={cn("workspace-chat-pane-surface px-3 pt-1 pb-1.5", formClassName)}
      data-testid="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void sendDraft();
      }}
    >
      <div {...chatReadableColumnAttributes} className={cn("relative", chatReadableColumnClass)}>
        <div
          className={cn(
            "min-w-0 rounded-sm border border-border bg-card/90 px-2 py-1.5 shadow-lg shadow-black/15",
            frameClassName,
          )}
        >
          <div className="relative min-w-0">
            <ComposerPlaceholder selected={selected} visible={draft === "" && placeholder === ""} />
            <CommandPalette
              commandListStatus={chat.commandListStatus}
              commandListError={commandListError}
              commandListPending={commandListPending}
              commandState={commandState}
              draft={draft}
              modelPicker={modelPicker}
              onPickSuggestion={(suggestion) => {
                void pickCommandSuggestion(suggestion);
              }}
              onDismissModelPicker={dismissModelPicker}
              onPickModel={(model) => {
                void executeModelSelection(model);
              }}
              onPickReasoningEffort={(effort) => {
                void executeReasoningEffortSelection(effort);
              }}
              paletteVisible={commandPaletteVisible}
              selectedSuggestionIndex={selectedSuggestionIndex}
            />
            <Textarea
              aria-label={composerTextareaLabel(acceptsPrompt)}
              className="relative z-10 max-h-28 min-h-8 min-w-0 resize-none border-0 bg-transparent px-0 py-0 text-xs leading-4 text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-0 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onChange={(event) => updateDraft(event.target.value)}
              onKeyDown={(event) => {
                if (handleCommandPaletteKeyDown(event)) {
                  return;
                }
                handleComposerKeyDown(event, {
                  completeCommand,
                  draftEmpty: draftText === "",
                  dismissModelPicker,
                  hasPendingSteering,
                  modelPickerOpen,
                  queueDraft,
                  running,
                  sendDraft,
                  sendImmediateSteering,
                  slashDraft,
                  stopRun: chat.stopActiveRun,
                });
              }}
              placeholder={placeholder}
              ref={textareaRef}
              rows={2}
              value={draft}
            />
          </div>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-1.5">
            <div className="flex min-w-0 items-center gap-1">
              <PermissionModeUnavailableButton />
            </div>
            <div className="flex min-w-0 items-center gap-1">
              <ModelPickerButton
                disabled={modelPickerDisabled}
                modelPicker={modelPicker}
                onOpen={() => void openModelPicker()}
                running={running}
                selectedConversation={chat.selectedConversation}
              />
              <VoiceInputUnavailableButton />
              <ComposerButton
                canSend={canSend}
                chat={chat}
                canSendImmediately={canSendImmediately}
                queueDraft={queueDraft}
                running={running}
                sendImmediateSteering={sendImmediateSteering}
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );

  function updateDraft(nextDraft: string) {
    if (!submittingRef.current) {
      restoreComposerFocusRef.current = false;
    }
    setDraft(nextDraft);
    setPaletteDismissed(false);
    if (isSlashDraft(nextDraft) && chat.commandListStatus === "failed") {
      setCommandListKey("");
      setCommandListRequestKey("");
    }
    if (!isSlashDraft(nextDraft)) {
      setModelPicker(null);
    }
  }

  function clearDraftIfUnchanged(submittedDraft: string) {
    replaceDraftIfUnchanged(submittedDraft, "");
  }

  function replaceDraftIfUnchanged(submittedDraft: string, replacement: string) {
    setDraft((current) => (current === submittedDraft ? replacement : current));
  }

  function dismissModelPicker() {
    setModelPicker(null);
    textareaRef.current?.focus();
  }

  function focusComposerSoon() {
    setFocusRequest((request) => request + 1);
    focusComposer();
    for (const delayMs of [0, 25, 100, 250, 500, 1000, 2000]) {
      window.setTimeout(focusComposer, delayMs);
    }
  }

  function focusComposer() {
    const textarea = textareaRef.current;
    if (!textarea || textarea.disabled) {
      return;
    }
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      active !== textarea
    ) {
      restoreComposerFocusRef.current = false;
      return;
    }
    textarea.focus();
  }

  async function executeModelSelection(model: ChatModelOption) {
    if (!chat.selectedConversation || disabled || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      await chat.setCodexModel(model.model);
      setDraft("");
      setModelPicker(null);
    } finally {
      submittingRef.current = false;
    }
  }

  async function executeReasoningEffortSelection(effort: ChatReasoningEffortOption) {
    if (!chat.selectedConversation || disabled || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      await chat.setCodexReasoningEffort(effort.effort);
      setDraft("");
      setModelPicker(null);
    } finally {
      submittingRef.current = false;
    }
  }
}

export const Composer = memo(ComposerComponent, composerPropsEqual);

function composerPropsEqual(previous: ComposerProps, next: ComposerProps) {
  return (
    previous.busy === next.busy &&
    previous.disabled === next.disabled &&
    previous.formClassName === next.formClassName &&
    previous.frameClassName === next.frameClassName &&
    previous.onSendPrompt === next.onSendPrompt &&
    previous.placeholder === next.placeholder &&
    previous.running === next.running &&
    composerChatPropsEqual(previous.chat, next.chat)
  );
}

function composerChatPropsEqual(previous: ChatView, next: ChatView) {
  return composerChatPropSelectors.every((selector) => selector(previous) === selector(next));
}

function composerAcceptsPrompt(selected: boolean, onSendPrompt: ComposerProps["onSendPrompt"]) {
  return selected || onSendPrompt !== undefined;
}

function commandPaletteShouldOpen(
  slashDraft: boolean,
  paletteDismissed: boolean,
  modelPicker: ChatCommandExecuteResult | null,
) {
  return slashDraft && !paletteDismissed && modelPicker?.result.action !== "model_picker";
}

type CommandPaletteKeyAction = "complete" | "dismiss" | "next" | "none" | "previous";

function commandPaletteKeyAction(
  event: KeyboardEvent<HTMLTextAreaElement>,
  context: {
    paletteVisible: boolean;
    slashDraft: boolean;
    suggestionCount: number;
  },
): CommandPaletteKeyAction {
  if (!context.slashDraft) {
    return "none";
  }
  if (event.key === "Tab" && !event.nativeEvent.isComposing) {
    return "complete";
  }
  if (!context.paletteVisible) {
    return "none";
  }
  if (event.key === "Escape") {
    return "dismiss";
  }
  if (context.suggestionCount === 0) {
    return "none";
  }
  return commandPaletteNavigationKeyAction(event.key);
}

function commandPaletteNavigationKeyAction(key: string): CommandPaletteKeyAction {
  if (key === "ArrowDown") {
    return "next";
  }
  if (key === "ArrowUp") {
    return "previous";
  }
  return "none";
}

interface CommandPaletteProps {
  commandListStatus: ChatView["commandListStatus"];
  commandListError?: string | null;
  commandListPending?: boolean;
  commandState: CommandComposerState;
  draft: string;
  modelPicker: ChatCommandExecuteResult | null;
  onDismissModelPicker: () => void;
  onPickSuggestion: (suggestion: CommandSuggestionRow) => void;
  onPickModel: (model: ChatModelOption) => void;
  onPickReasoningEffort: (effort: ChatReasoningEffortOption) => void;
  paletteVisible: boolean;
  selectedSuggestionIndex: number;
}

export function CommandPalette(props: CommandPaletteProps) {
  if (props.modelPicker?.result.action === "model_picker") {
    return (
      <ModelPickerPalette
        modelPicker={props.modelPicker}
        onDismissModelPicker={props.onDismissModelPicker}
        onPickModel={props.onPickModel}
        onPickReasoningEffort={props.onPickReasoningEffort}
      />
    );
  }
  if (!isSlashDraft(props.draft) || !props.paletteVisible) {
    return null;
  }
  return <SlashCommandPalette {...props} />;
}

function ModelPickerPalette({
  modelPicker,
  onDismissModelPicker,
  onPickModel,
  onPickReasoningEffort,
}: {
  modelPicker: ChatCommandExecuteResult;
  onDismissModelPicker: () => void;
  onPickModel: (model: ChatModelOption) => void;
  onPickReasoningEffort: (effort: ChatReasoningEffortOption) => void;
}) {
  if (modelPicker?.result.action === "model_picker") {
    const selectedModel = modelPicker.result.selectedModel;
    const selectedReasoningEffort = modelPicker.result.selectedReasoningEffort;
    return (
      <div
        className="absolute bottom-full left-0 z-20 mb-2 max-h-80 w-full overflow-y-auto rounded-sm border border-border bg-popover/95 p-1 text-popover-foreground shadow-xl shadow-black/45 backdrop-blur"
        data-testid="model-picker"
      >
        <div className="mb-1 flex justify-end border-b border-border pb-1">
          <button
            aria-label="Close model picker"
            className="grid h-6 w-6 place-items-center rounded-sm text-muted-foreground hover:bg-accent/75 hover:text-foreground"
            onClick={onDismissModelPicker}
            title="Close model picker"
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="px-2 pt-1 pb-1 text-[11px] font-medium text-muted-foreground">Model</div>
        {modelPicker.result.models.map((model) => {
          const selected = modelPickerOptionSelected(model, selectedModel);
          return (
            <button
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-2 text-left text-xs hover:bg-accent/75",
                selected && "bg-accent/70",
              )}
              data-selected={selected ? "true" : undefined}
              key={model.id}
              onClick={() => onPickModel(model)}
              type="button"
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center">
                {selected ? <Check className="h-4 w-4 text-status-success" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">
                  {model.displayName}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {model.model}
                </span>
              </span>
            </button>
          );
        })}
        {modelPicker.result.reasoningEfforts.length > 0 ? (
          <>
            <div className="mt-1 border-t border-border px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
              Reasoning
            </div>
            {modelPicker.result.reasoningEfforts.map((effort) => {
              const selected = reasoningEffortOptionSelected(effort, selectedReasoningEffort);
              return (
                <button
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-2 text-left text-xs hover:bg-accent/75",
                    selected && "bg-accent/70",
                  )}
                  data-reasoning-effort={effort.effort}
                  data-reasoning-selected={selected ? "true" : undefined}
                  key={effort.effort}
                  onClick={() => onPickReasoningEffort(effort)}
                  type="button"
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center">
                    {selected ? <Check className="h-4 w-4 text-status-success" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {effort.displayName}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {effort.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </>
        ) : null}
      </div>
    );
  }
  return null;
}

function SlashCommandPalette({
  commandListStatus,
  commandListError,
  commandListPending,
  commandState,
  onPickSuggestion,
  selectedSuggestionIndex,
}: CommandPaletteProps) {
  if (commandListError) {
    return <SlashCommandErrorPalette commandListError={commandListError} />;
  }
  if (slashCommandPaletteLoading(commandListStatus, commandListPending, commandState)) {
    return <SlashCommandLoadingPalette />;
  }
  if (commandState.invalidReason && commandState.suggestions.length === 0) {
    return <SlashCommandInvalidPalette invalidReason={commandState.invalidReason} />;
  }
  if (commandState.suggestions.length === 0 && commandState.showEmptyState) {
    return (
      <div
        className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-border bg-popover/95 p-2 text-xs text-muted-foreground shadow-xl shadow-black/45 backdrop-blur"
        data-testid="command-palette"
        role="listbox"
      >
        No matching slash commands
      </div>
    );
  }
  if (commandState.suggestions.length === 0) {
    return null;
  }
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-border bg-popover/95 p-1 text-popover-foreground shadow-xl shadow-black/45 backdrop-blur"
      data-testid="command-palette"
      role="listbox"
    >
      {commandState.suggestions.map((suggestion, index) => (
        <button
          aria-disabled={!suggestion.available}
          aria-selected={index === selectedSuggestionIndex}
          className={cn(
            "flex w-full min-w-0 items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-xs hover:bg-accent/75 disabled:cursor-not-allowed disabled:opacity-65",
            index === selectedSuggestionIndex && "bg-accent/80",
          )}
          disabled={!suggestion.available}
          key={suggestion.id}
          onClick={() => onPickSuggestion(suggestion)}
          role="option"
          type="button"
        >
          <span className="min-w-0">
            <span className="block font-medium text-foreground">{suggestion.label}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {suggestion.description}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground/85">
              {suggestion.available ? suggestion.detail : suggestion.disabledReason}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function slashCommandPaletteLoading(
  commandListStatus: ChatView["commandListStatus"],
  commandListPending: boolean | undefined,
  commandState: CommandComposerState,
) {
  return (
    (commandListPending || commandListStatus === "loading") && commandState.suggestions.length === 0
  );
}

function SlashCommandErrorPalette({ commandListError }: { commandListError: string }) {
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-status-critical/80 bg-popover/95 p-2 text-xs text-popover-foreground shadow-xl shadow-black/45 backdrop-blur"
      data-testid="command-palette"
      role="alert"
    >
      <div className="font-medium text-status-critical">Slash commands unavailable</div>
      <div className="mt-1 break-words text-muted-foreground">{commandListError}</div>
    </div>
  );
}

function SlashCommandLoadingPalette() {
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-border bg-popover/95 p-2 text-xs text-muted-foreground shadow-xl shadow-black/45 backdrop-blur"
      data-testid="command-palette"
      role="status"
    >
      Loading slash commands...
    </div>
  );
}

function SlashCommandInvalidPalette({ invalidReason }: { invalidReason: string }) {
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-status-critical/80 bg-popover/95 p-2 text-xs text-popover-foreground shadow-xl shadow-black/45 backdrop-blur"
      data-testid="command-palette"
      role="alert"
    >
      <div className="font-medium text-status-critical">Invalid slash command</div>
      <div className="mt-1 break-words text-muted-foreground">{invalidReason}</div>
    </div>
  );
}

function isSlashDraft(draft: string) {
  return draft.startsWith("/");
}

export function commandSuggestions(commands: ChatCommandDescriptor[], draft: string) {
  return commandComposerState(draft, commands).suggestions;
}

function composerTextareaLabel(selected: boolean) {
  return selected ? "Ask Setta" : "Start new chat";
}

function ComposerPlaceholder({ selected, visible }: { selected: boolean; visible: boolean }) {
  if (!selected || !visible) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 flex h-4 items-center gap-1 text-xs leading-4 text-muted-foreground"
    >
      <span>Ask</span>
      <SettaLogoMark className="translate-y-[3px] opacity-60" height={11} />
    </div>
  );
}
