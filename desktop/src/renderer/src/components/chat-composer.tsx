import type {
  ChatCommandCapability,
  ChatCommandExecuteResult,
  ChatGoalState,
  ChatModelOption,
  ChatReasoningEffortOption,
} from "@generated/backend";
import type { ChatCommandExecutionOptions } from "@shared/types";
import { Check, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
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

const emptyCommandCapabilities: ChatCommandCapability[] = [];

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

function completedCommandDraft(
  selectedSuggestion: ChatCommandCapability | null,
  draftText: string,
) {
  if (!selectedSuggestion || draftText === selectedSuggestion.name) {
    return "";
  }
  return selectedSuggestion.name + " ";
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
  const [commands, setCommands] = useState<ChatCommandCapability[]>(emptyCommandCapabilities);
  const [commandListKey, setCommandListKey] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);
  const [modelPicker, setModelPicker] = useState<ChatCommandExecuteResult | null>(null);
  const restoreComposerFocusRef = useRef(false);
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selected = chat.selectedConversation !== null;
  const selectedConversationId = chat.selectedConversation?.id ?? "";
  const listCommands = chat.listCommands;
  const acceptsPrompt = selected || onSendPrompt !== undefined;
  const disabled = composerDisabled(disabledOverride, acceptsPrompt, busy);
  const slashDraft = isSlashDraft(draft);
  const draftText = draft.trim();
  const suggestions = commandSuggestions(commands, draft);
  const selectedSuggestion = suggestions[0] ?? null;
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
    if (selectedConversationId === "") {
      setCommands(emptyCommandCapabilities);
      setCommandListKey("");
      setModelPicker(null);
      return;
    }
    if (!slashDraft) {
      setCommands(emptyCommandCapabilities);
      setCommandListKey("");
      return;
    }
    const key = selectedConversationId + ":" + (running ? "running" : "idle");
    if (commandListKey === key) {
      return;
    }
    let cancelled = false;
    setCommandListKey(key);
    void listCommands()
      .then((result) => {
        if (!cancelled) {
          setCommands(result?.commands ?? emptyCommandCapabilities);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCommands(emptyCommandCapabilities);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [commandListKey, listCommands, running, selectedConversationId, slashDraft]);

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
      await executeSlashDraft(prompt, submittedDraft);
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

  async function executeSlashDraft(prompt: string, submittedDraft: string) {
    const commandText = commandTextToExecute(prompt, selectedSuggestion);
    const options = goalReplacementExecutionOptions(commandText, chat.goal, (message) =>
      window.confirm(message),
    );
    if (options === null) {
      return;
    }
    const result = await chat.executeCommand(commandText, options);
    if (result.result.action === "model_picker") {
      setModelPicker(result);
      clearDraftIfUnchanged(submittedDraft);
    } else if (result.result.action === "goal_editor") {
      setModelPicker(null);
      replaceDraftIfUnchanged(submittedDraft, goalEditorDraft(result.result.goal));
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      setModelPicker(null);
      clearDraftIfUnchanged(submittedDraft);
    }
  }

  function completeCommand() {
    const completed = completedCommandDraft(selectedSuggestion, draftText);
    if (completed) {
      updateDraft(completed);
    }
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
      const result = await chat.executeCommand("/model");
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
            <CommandSuggestions
              commandListError={commandListError}
              draft={draft}
              modelPicker={modelPicker}
              onPickCommand={(command) => updateDraft(command.name + " ")}
              onDismissModelPicker={dismissModelPicker}
              onPickModel={(model) => {
                void executeModelSelection(model);
              }}
              onPickReasoningEffort={(effort) => {
                void executeReasoningEffortSelection(effort);
              }}
              selectedSuggestion={selectedSuggestion}
              suggestions={suggestions}
            />
            <Textarea
              aria-label={composerTextareaLabel(acceptsPrompt)}
              className="max-h-28 min-h-8 min-w-0 resize-none border-0 bg-transparent px-0 py-0 text-xs leading-4 text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-0 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onChange={(event) => updateDraft(event.target.value)}
              onKeyDown={(event) => {
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

function commandListErrorForDraft(
  slashDraft: boolean,
  commandListStatus: ChatView["commandListStatus"],
  commandListError: ChatView["commandListError"],
) {
  return slashDraft && commandListStatus === "failed" ? commandListError : null;
}

export function CommandSuggestions({
  commandListError,
  draft,
  modelPicker,
  onDismissModelPicker,
  onPickCommand,
  onPickModel,
  onPickReasoningEffort,
  selectedSuggestion,
  suggestions,
}: {
  commandListError?: string | null;
  draft: string;
  modelPicker: ChatCommandExecuteResult | null;
  onDismissModelPicker: () => void;
  onPickCommand: (command: ChatCommandCapability) => void;
  onPickModel: (model: ChatModelOption) => void;
  onPickReasoningEffort: (effort: ChatReasoningEffortOption) => void;
  selectedSuggestion: ChatCommandCapability | null;
  suggestions: ChatCommandCapability[];
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
  if (!isSlashDraft(draft)) {
    return null;
  }
  if (commandListError) {
    return (
      <div
        className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-status-critical/80 bg-popover/95 p-2 text-xs text-popover-foreground shadow-xl shadow-black/45 backdrop-blur"
        data-testid="command-suggestions"
        role="alert"
      >
        <div className="font-medium text-status-critical">Slash commands unavailable</div>
        <div className="mt-1 break-words text-muted-foreground">{commandListError}</div>
      </div>
    );
  }
  if (suggestions.length === 0) {
    return null;
  }
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-border bg-popover/95 p-1 text-popover-foreground shadow-xl shadow-black/45 backdrop-blur"
      data-testid="command-suggestions"
    >
      {suggestions.map((command) => (
        <button
          className={cn(
            "flex w-full min-w-0 items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-xs hover:bg-accent/75 disabled:opacity-50",
            command === selectedSuggestion && "bg-accent/80",
          )}
          disabled={!command.available}
          key={command.name}
          onClick={() => onPickCommand(command)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block font-medium text-foreground">{command.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {command.available ? command.usage : command.unavailableReason}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function isSlashDraft(draft: string) {
  return draft.startsWith("/");
}

export function commandSuggestions(commands: ChatCommandCapability[], draft: string) {
  if (!isSlashDraft(draft)) {
    return [];
  }
  const token = draft.slice(1).split(/\s+/, 1)[0] ?? "";
  const prefix = "/" + token;
  return commands.filter((command) => command.name.startsWith(prefix));
}

export function commandTextToExecute(
  prompt: string,
  selectedSuggestion: ChatCommandCapability | null,
) {
  if (!selectedSuggestion) {
    return prompt;
  }
  const match = /^\/([^\s]*)(\s.*)?$/.exec(prompt);
  if (!match) {
    return prompt;
  }
  const token = "/" + match[1];
  const rest = match[2] ?? "";
  if (selectedSuggestion.name === token) {
    return prompt;
  }
  if (selectedSuggestion.name.startsWith(token)) {
    return selectedSuggestion.name + rest;
  }
  return prompt;
}

export function goalReplacementExecutionOptions(
  raw: string,
  currentGoal: ChatGoalState | null,
  confirmReplacement: (message: string) => boolean,
): ChatCommandExecutionOptions | null {
  const nextObjective = goalSetObjective(raw);
  if (!nextObjective || !currentGoal || currentGoal.status === "complete") {
    return {};
  }
  if (currentGoal.objective.trim() === nextObjective.trim()) {
    return {};
  }
  if (!confirmReplacement("Replace the current goal?")) {
    return null;
  }
  return { confirmGoalReplacement: true };
}

export function goalEditorDraft(goal: ChatGoalState | null) {
  const objective = goal?.objective.trim() ?? "";
  return objective === "" ? "/goal " : `/goal ${objective}`;
}

function goalSetObjective(raw: string) {
  const match = /^\/goal(?:\s+(.+))?$/.exec(raw.trim());
  if (!match) {
    return null;
  }
  const args = match[1]?.trim() ?? "";
  switch (args) {
    case "":
    case "edit":
    case "clear":
    case "pause":
    case "resume":
      return null;
    default:
      return args;
  }
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
