import type {
  ChatCommandCapability,
  ChatCommandExecuteResult,
  ChatGoalState,
  ChatModelOption,
  ChatReasoningEffortOption,
  ReasoningEffort,
  WorkspaceSummary,
} from "@generated/backend";
import type { ChatCommandExecutionOptions } from "@shared/types";
import { AlertTriangle, Check, Maximize2, Minimize2, X } from "lucide-react";
import { Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import settaLogo from "../../../../img/logo/logo.svg";
import { useChatStore } from "../stores/chat-store";
import { cn } from "../lib/utils";
import { ComposerButton, handleComposerKeyDown } from "./chat-composer-controls";
import { ChatTranscript } from "./chat-transcript";
import { Textarea } from "./ui/textarea";

export { ComposerButton, handleComposerKeyDown } from "./chat-composer-controls";

export function ChatPanel({
  chat,
  chromeInsetTop = false,
  maximized = false,
  onToggleMaximize,
  searchOpen,
  setSearchOpen,
  workspace,
}: {
  chat: ChatView;
  chromeInsetTop?: boolean;
  maximized?: boolean;
  onToggleMaximize?: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  workspace: WorkspaceSummary | null;
}) {
  if (!workspace) {
    return (
      <section
        className={cn(
          "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-zinc-900 text-zinc-100",
          chromeInsetTop && "pt-8",
        )}
      >
        <div className="grid min-h-0 flex-1 place-items-center px-3 text-center text-xs text-zinc-500">
          Open a workspace to start chat.
        </div>
      </section>
    );
  }
  return (
    <ChatWorkspace
      chat={chat}
      chromeInsetTop={chromeInsetTop}
      maximized={maximized}
      onToggleMaximize={onToggleMaximize}
      searchOpen={searchOpen}
      setSearchOpen={setSearchOpen}
    />
  );
}

function ChatWorkspace({
  chat,
  chromeInsetTop,
  maximized,
  onToggleMaximize,
  searchOpen,
  setSearchOpen,
}: {
  chat: ChatView;
  chromeInsetTop: boolean;
  maximized: boolean;
  onToggleMaximize?: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}) {
  const busy = isChatBusy(chat);
  const blocked = isChatBlocked(chat);
  const composerBusy = isComposerBusy(chat);
  const running = isRunRunning(chat);
  const selectedConversationId = selectedChatConversationId(chat);

  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-visible bg-zinc-900 text-zinc-100",
        chromeInsetTop && "pt-8",
      )}
    >
      {onToggleMaximize ? (
        <ChatMaximizeButton maximized={maximized} onToggleMaximize={onToggleMaximize} />
      ) : null}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible"
        data-conversation-id={selectedConversationId}
        data-run-status={activeRunStatus(chat) ?? ""}
        data-testid="chat-detail-pane"
      >
        <ConversationBody
          busy={busy}
          chat={chat}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
        />
        <ChatError message={selectedConversationChatError(chat)} />
        <ComposerSlot blocked={blocked} busy={composerBusy} chat={chat} running={running} />
      </div>
    </section>
  );
}

function ChatMaximizeButton({
  maximized,
  onToggleMaximize,
}: {
  maximized: boolean;
  onToggleMaximize: () => void;
}) {
  const label = maximized ? "Restore chat pane" : "Maximize chat pane";
  return (
    <button
      aria-label={label}
      className="app-no-drag absolute top-0 right-1 z-50 grid h-8 w-7 cursor-pointer place-items-center rounded-sm text-zinc-500 outline-none hover:bg-zinc-800 hover:text-zinc-100 focus-visible:bg-zinc-800 focus-visible:text-zinc-100"
      onClick={onToggleMaximize}
      title={label}
      type="button"
    >
      {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
}

export type ChatView = ReturnType<typeof useChatViewState>;

const composerBlockingOperations = new Set([
  "commanding",
  "creating",
  "loading",
  "loadingOlder",
  "refreshing",
  "sendingSteeringImmediately",
]);

function isChatBusy(chat: ChatView) {
  return chat.operation !== null || chat.status === "loading";
}

function isComposerBusy(chat: ChatView) {
  return chat.status === "loading" || composerBlockingOperations.has(chat.operation ?? "");
}

function isRunRunning(chat: ChatView) {
  return chat.activeRun?.status === "running";
}

function isChatBlocked(chat: ChatView) {
  return chat.error !== null && !chat.selectedConversation;
}

function selectedChatConversationId(chat: ChatView) {
  return chat.selectedConversation?.id ?? "";
}

function activeRunStatus(chat: ChatView) {
  return chat.activeRun?.status ?? null;
}

function selectedConversationChatError(chat: ChatView) {
  return chat.selectedConversation ? chat.error : null;
}

function ComposerSlot({
  blocked,
  busy,
  chat,
  running,
}: {
  blocked: boolean;
  busy: boolean;
  chat: ChatView;
  running: boolean;
}) {
  if (blocked) {
    return null;
  }
  return <Composer busy={busy} chat={chat} running={running} />;
}

export function ConversationBody({
  busy,
  chat,
  searchOpen,
  setSearchOpen,
}: {
  busy: boolean;
  chat: ChatView;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}) {
  if (chat.error && !chat.selectedConversation) {
    return <ChatLoadError message={chat.error} />;
  }
  if (!chat.selectedConversation) {
    return <EmptyConversation busy={busy} chat={chat} />;
  }
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-testid="chat-transcript-region"
    >
      <GoalStatus goal={chat.goal} />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ChatTranscript
          activeRun={chat.activeRun}
          editQueuedMessage={chat.editQueuedMessage}
          editingQueuedMessageId={chat.editingQueuedMessageId}
          hasMoreOlder={chat.hasMoreOlder}
          loadOlder={chat.loadOlder}
          loadRunItemOutput={chat.loadRunItemOutput}
          messageIds={chat.messageIds}
          messagesById={chat.messagesById}
          operation={chat.operation}
          removeQueuedMessage={chat.removeQueuedMessage}
          removingQueuedMessageId={chat.removingQueuedMessageId}
          runItemIdsByRunId={chat.runItemIdsByRunId}
          runItemOutputIdsByRunItemId={chat.runItemOutputIdsByRunItemId}
          runItemOutputPagesByRunItemId={chat.runItemOutputPagesByRunItemId}
          runItemOutputsById={chat.runItemOutputsById}
          runItemsById={chat.runItemsById}
          searchOpen={searchOpen}
          sendSteeringImmediately={chat.sendSteeringImmediately}
          setSearchOpen={setSearchOpen}
          submitApproval={chat.submitApproval}
          transcript={chat.transcript}
        />
      </div>
    </div>
  );
}

function GoalStatus({ goal }: { goal: ChatView["goal"] }) {
  if (!goal) {
    return null;
  }
  const status = goalStatusLabel(goal.status);
  const title = `${status}: ${goal.objective}`;
  return (
    <div
      className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-300"
      data-goal-status={goal.status}
      data-testid="chat-goal-status"
      title={title}
    >
      <GoalStatusIcon status={goal.status} />
      <span className="shrink-0 font-medium text-zinc-100">{status}</span>
      <span className="min-w-0 truncate text-zinc-400">{goal.objective}</span>
    </div>
  );
}

function GoalStatusIcon({ status }: { status: string }) {
  if (status === "complete") {
    return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />;
  }
  if (status === "blocked" || status === "budgetLimited" || status === "usageLimited") {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />;
  }
  return <Square className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden="true" />;
}

function goalStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "Goal active";
    case "blocked":
      return "Goal blocked";
    case "budgetLimited":
      return "Goal budget-limited";
    case "complete":
      return "Goal complete";
    case "paused":
      return "Goal paused";
    case "usageLimited":
      return "Goal usage-limited";
    default:
      return "Goal";
  }
}

function ChatLoadError({ message }: { message: string }) {
  return (
    <div className="grid min-h-0 min-w-0 flex-1 place-items-center px-6">
      <div
        className="max-w-2xl rounded-sm border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm break-words text-zinc-100"
        data-testid="chat-load-error"
      >
        <div className="font-medium">Chat state is corrupt</div>
        <div className="mt-2 text-zinc-300">{message}</div>
      </div>
    </div>
  );
}

function EmptyConversation({ busy, chat }: { busy: boolean; chat: ChatView }) {
  const [departing, setDeparting] = useState(false);
  const mountedRef = useRef(true);
  const running = chat.activeRun?.status === "running";
  const disabled = busy || running || departing;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function createAndSend(prompt: string) {
    if (disabled) {
      return;
    }
    setDeparting(true);
    try {
      await waitForComposerExit();
      await chat.createConversation();
      await chat.sendMessage(prompt);
    } finally {
      if (mountedRef.current) {
        setDeparting(false);
      }
    }
  }

  return (
    <div className="grid min-h-0 place-items-center px-3 pb-[12vh]">
      <div
        className={cn(
          "w-full max-w-3xl transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          departing && "translate-y-16 opacity-0",
        )}
      >
        <h1 className="mb-8 text-center text-2xl font-normal tracking-normal text-zinc-100">
          What should we build in setta?
        </h1>
        <Composer
          busy={busy}
          chat={chat}
          disabled={disabled}
          formClassName="bg-transparent px-0 pt-0 pb-0"
          frameClassName="border-zinc-700 bg-zinc-800/90 shadow-xl shadow-black/20"
          onSendPrompt={createAndSend}
          placeholder="Do anything"
          running={running}
        />
      </div>
    </div>
  );
}

function waitForComposerExit() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 130);
  });
}

function ChatError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div className="border-t border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100">
      {message}
    </div>
  );
}

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

function Composer({
  busy,
  chat,
  disabled: disabledOverride,
  formClassName,
  frameClassName,
  onSendPrompt,
  placeholder = "",
  running,
}: {
  busy: boolean;
  chat: ChatView;
  disabled?: boolean;
  formClassName?: string;
  frameClassName?: string;
  onSendPrompt?: (prompt: string) => Promise<void>;
  placeholder?: string;
  running: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [commands, setCommands] = useState<ChatCommandCapability[]>([]);
  const [commandListKey, setCommandListKey] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);
  const [modelPicker, setModelPicker] = useState<ChatCommandExecuteResult | null>(null);
  const restoreComposerFocusRef = useRef(false);
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selected = chat.selectedConversation !== null;
  const disabled = composerDisabled(disabledOverride, selected, busy);
  const slashDraft = isSlashDraft(draft);
  const draftText = draft.trim();
  const suggestions = commandSuggestions(commands, draft);
  const selectedSuggestion = suggestions[0] ?? null;
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

  useEffect(() => {
    if (!chat.selectedConversation) {
      setCommands([]);
      setCommandListKey("");
      setModelPicker(null);
      return;
    }
    if (!slashDraft) {
      setCommands([]);
      setCommandListKey("");
      return;
    }
    const key = chat.selectedConversation.id + ":" + (running ? "running" : "idle");
    if (commandListKey === key) {
      return;
    }
    let cancelled = false;
    setCommandListKey(key);
    void chat
      .listCommands()
      .then((result) => {
        if (!cancelled) {
          setCommands(result?.commands ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCommands([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chat, commandListKey, running, slashDraft]);

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
  }, [chat.activeRun?.id, chat.messagesById, disabled, running]);

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
    const prompt = draft.trim();
    if (!canSubmitDraft(prompt)) {
      return;
    }
    submittingRef.current = true;
    restoreComposerFocusRef.current = true;
    try {
      focusComposerSoon();
      await submitDraftPrompt(prompt);
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

  async function submitDraftPrompt(prompt: string) {
    if (onSendPrompt) {
      setDraft("");
      await onSendPrompt(prompt);
      return;
    }
    if (slashDraft) {
      await executeSlashDraft(prompt);
      return;
    }
    setDraft("");
    if (running) {
      await chat.steerMessage(prompt);
      return;
    }
    await chat.sendMessage(prompt);
  }

  async function executeSlashDraft(prompt: string) {
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
      setDraft("");
    } else if (result.result.action === "goal_editor") {
      setModelPicker(null);
      setDraft(goalEditorDraft(result.result.goal));
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      setModelPicker(null);
      setDraft("");
    }
  }

  function completeCommand() {
    const completed = completedCommandDraft(selectedSuggestion, draftText);
    if (completed) {
      updateDraft(completed);
    }
  }

  async function queueDraft() {
    const prompt = draft.trim();
    if (!prompt || !chat.selectedConversation || disabled || submittingRef.current) {
      return;
    }
    if (slashDraft) {
      return;
    }
    submittingRef.current = true;
    try {
      setDraft("");
      focusComposerSoon();
      await chat.queueMessage(prompt);
      focusComposerSoon();
    } finally {
      submittingRef.current = false;
    }
  }

  async function sendImmediateSteering() {
    const prompt = draft.trim();
    if (
      slashDraft ||
      !running ||
      !chat.selectedConversation ||
      disabled ||
      submittingRef.current ||
      (prompt === "" && !hasPendingSteering)
    ) {
      return;
    }
    submittingRef.current = true;
    try {
      await chat.sendSteeringImmediately(prompt === "" ? undefined : prompt);
      setDraft("");
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <form
      className={cn("bg-zinc-900 px-2 pt-1 pb-1.5", formClassName)}
      data-testid="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void sendDraft();
      }}
    >
      <div className="relative mx-auto w-full max-w-3xl min-w-0">
        <div
          className={cn(
            "min-w-0 rounded-sm border border-zinc-700 bg-zinc-800/90 px-2 py-1.5 shadow-lg shadow-black/15",
            frameClassName,
          )}
        >
          <div className="relative min-w-0">
            <ComposerPlaceholder selected={selected} visible={draft === "" && placeholder === ""} />
            <CommandSuggestions
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
              aria-label={composerTextareaLabel(selected)}
              className="max-h-28 min-h-8 min-w-0 resize-none border-0 bg-transparent px-0 py-0 text-xs leading-4 text-zinc-100 shadow-none outline-none placeholder:text-zinc-500 focus-visible:border-0 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="mt-1 flex min-w-0 items-center justify-end gap-1.5">
            <div className="flex min-w-0 items-center gap-1">
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

export function CommandSuggestions({
  draft,
  modelPicker,
  onDismissModelPicker,
  onPickCommand,
  onPickModel,
  onPickReasoningEffort,
  selectedSuggestion,
  suggestions,
}: {
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
        className="absolute bottom-full left-0 z-20 mb-2 max-h-80 w-full overflow-y-auto rounded-sm border border-zinc-700/90 bg-zinc-800/95 p-1 text-zinc-100 shadow-xl shadow-black/45 backdrop-blur"
        data-testid="model-picker"
      >
        <div className="mb-1 flex justify-end border-b border-zinc-700/70 pb-1">
          <button
            aria-label="Close model picker"
            className="grid h-6 w-6 place-items-center rounded-sm text-zinc-400 hover:bg-zinc-700/75 hover:text-zinc-100"
            onClick={onDismissModelPicker}
            title="Close model picker"
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="px-2 pt-1 pb-1 text-[11px] font-medium text-zinc-500">Model</div>
        {modelPicker.result.models.map((model) => {
          const selected = modelPickerOptionSelected(model, selectedModel);
          return (
            <button
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-2 text-left text-xs hover:bg-zinc-700/75",
                selected && "bg-zinc-700/70",
              )}
              data-selected={selected ? "true" : undefined}
              key={model.id}
              onClick={() => onPickModel(model)}
              type="button"
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center">
                {selected ? <Check className="h-4 w-4 text-emerald-300" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-zinc-100">
                  {model.displayName}
                </span>
                <span className="block truncate text-[11px] text-zinc-400">{model.model}</span>
              </span>
            </button>
          );
        })}
        {modelPicker.result.reasoningEfforts.length > 0 ? (
          <>
            <div className="mt-1 border-t border-zinc-700/70 px-2 pt-2 pb-1 text-[11px] font-medium text-zinc-500">
              Reasoning
            </div>
            {modelPicker.result.reasoningEfforts.map((effort) => {
              const selected = reasoningEffortOptionSelected(effort, selectedReasoningEffort);
              return (
                <button
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-2 text-left text-xs hover:bg-zinc-700/75",
                    selected && "bg-zinc-700/70",
                  )}
                  data-reasoning-effort={effort.effort}
                  data-reasoning-selected={selected ? "true" : undefined}
                  key={effort.effort}
                  onClick={() => onPickReasoningEffort(effort)}
                  type="button"
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center">
                    {selected ? <Check className="h-4 w-4 text-emerald-300" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-zinc-100">
                      {effort.displayName}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-400">
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
  if (!isSlashDraft(draft) || suggestions.length === 0) {
    return null;
  }
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-zinc-700/90 bg-zinc-800/95 p-1 text-zinc-100 shadow-xl shadow-black/45 backdrop-blur"
      data-testid="command-suggestions"
    >
      {suggestions.map((command) => (
        <button
          className={cn(
            "flex w-full min-w-0 items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-xs hover:bg-zinc-700/75 disabled:opacity-50",
            command === selectedSuggestion && "bg-zinc-700/80",
          )}
          disabled={!command.available}
          key={command.name}
          onClick={() => onPickCommand(command)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block font-medium text-zinc-100">{command.name}</span>
            <span className="block truncate text-[11px] text-zinc-400">
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

export function modelPickerOptionSelected(
  model: Pick<ChatModelOption, "isDefault" | "model">,
  selectedModel: string,
) {
  if (selectedModel === "") {
    return model.isDefault;
  }
  return model.model === selectedModel;
}

export function reasoningEffortOptionSelected(
  effort: Pick<ChatReasoningEffortOption, "effort" | "isDefault">,
  selectedReasoningEffort: ReasoningEffort | null,
) {
  if (selectedReasoningEffort === null) {
    return effort.isDefault;
  }
  return effort.effort === selectedReasoningEffort;
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
      className="pointer-events-none absolute top-0 left-0 flex h-4 items-center gap-1 text-xs leading-4 text-zinc-500"
    >
      <span>Ask</span>
      <img
        alt=""
        className="h-[11px] w-auto translate-y-[3px] opacity-60 grayscale"
        draggable={false}
        src={settaLogo}
      />
    </div>
  );
}

export function useChatViewState(workspaceId: string | null) {
  const activeRun = useChatStore((state) => state.activeRun);
  const conversations = useChatStore((state) => state.conversations);
  const corruption = useChatStore((state) => state.corruption);
  const createConversation = useChatStore((state) => state.createConversation);
  const createWorkspaceConversation = useChatStore((state) => state.createWorkspaceConversation);
  const editQueuedMessage = useChatStore((state) => state.editQueuedMessage);
  const editingQueuedMessageId = useChatStore((state) => state.editingQueuedMessageId);
  const error = useChatStore((state) => state.error);
  const executeCommand = useChatStore((state) => state.executeCommand);
  const diagnostics = useChatStore((state) => state.diagnostics);
  const goal = useChatStore((state) => state.goal);
  const hasMoreOlder = useChatStore((state) => state.hasMoreOlder);
  const loadOlder = useChatStore((state) => state.loadOlder);
  const loadRunItemOutput = useChatStore((state) => state.loadRunItemOutput);
  const loadWorkspace = useChatStore((state) => state.loadWorkspace);
  const listCommands = useChatStore((state) => state.listCommands);
  const messageIds = useChatStore((state) => state.messageIds);
  const messages = useChatStore((state) => state.messages);
  const messagesById = useChatStore((state) => state.messagesById);
  const operation = useChatStore((state) => state.operation);
  const queueMessage = useChatStore((state) => state.queueMessage);
  const removeQueuedMessage = useChatStore((state) => state.removeQueuedMessage);
  const removingQueuedMessageId = useChatStore((state) => state.removingQueuedMessageId);
  const runItemIdsByRunId = useChatStore((state) => state.runItemIdsByRunId);
  const runItemOutputIdsByRunItemId = useChatStore((state) => state.runItemOutputIdsByRunItemId);
  const runItemOutputPagesByRunItemId = useChatStore(
    (state) => state.runItemOutputPagesByRunItemId,
  );
  const runItemOutputs = useChatStore((state) => state.runItemOutputs);
  const runItemOutputsById = useChatStore((state) => state.runItemOutputsById);
  const runItems = useChatStore((state) => state.runItems);
  const runItemsById = useChatStore((state) => state.runItemsById);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const selectedConversation = useChatStore((state) => state.selectedConversation);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const sendSteeringImmediately = useChatStore((state) => state.sendSteeringImmediately);
  const setCodexModel = useChatStore((state) => state.setCodexModel);
  const setCodexReasoningEffort = useChatStore((state) => state.setCodexReasoningEffort);
  const status = useChatStore((state) => state.status);
  const steerMessage = useChatStore((state) => state.steerMessage);
  const stopActiveRun = useChatStore((state) => state.stopActiveRun);
  const submitApproval = useChatStore((state) => state.submitApproval);
  const storeWorkspaceId = useChatStore((state) => state.workspaceId);
  const transcript = useChatStore((state) => state.transcript);
  const unreadConversationIds = useChatStore((state) => state.unreadConversationIds);
  const pendingSteeringMessageIds = activeRun
    ? messages
        .filter(
          (message) =>
            message.delivery === "steering" &&
            message.status === "pending" &&
            message.runId === activeRun.id,
        )
        .map((message) => message.id)
    : [];

  useEffect(() => {
    if (!workspaceId || workspaceId === storeWorkspaceId) {
      return;
    }
    void loadWorkspace(workspaceId);
  }, [loadWorkspace, storeWorkspaceId, workspaceId]);

  return {
    activeRun,
    conversations,
    corruption,
    createConversation,
    createWorkspaceConversation,
    diagnostics,
    editQueuedMessage,
    editingQueuedMessageId,
    error,
    executeCommand,
    goal,
    hasMoreOlder,
    loadOlder,
    loadRunItemOutput,
    listCommands,
    messageIds,
    messages,
    messagesById,
    operation,
    pendingSteeringMessageIds,
    queueMessage,
    removeQueuedMessage,
    removingQueuedMessageId,
    runItemIdsByRunId,
    runItemOutputIdsByRunItemId,
    runItemOutputPagesByRunItemId,
    runItemOutputs,
    runItemOutputsById,
    runItems,
    runItemsById,
    selectConversation,
    selectedConversation,
    sendMessage,
    sendSteeringImmediately,
    setCodexModel,
    setCodexReasoningEffort,
    status,
    steerMessage,
    stopActiveRun,
    submitApproval,
    transcript,
    unreadConversationIds,
  };
}
