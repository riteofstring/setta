import type {
  ChatCommandCapability,
  ChatCommandExecuteResult,
  ChatModelOption,
  ConversationListItem,
  RunStatus,
  WorkspaceSummary,
} from "@generated/backend";
import {
  AlertTriangle,
  Archive,
  Check,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Send,
  Square,
  Trash2,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { useChatStore } from "../stores/chat-store";
import { ChatTranscript } from "./chat-transcript";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function ChatPanel({ workspace }: { workspace: WorkspaceSummary | null }) {
  if (!workspace) {
    return (
      <section className="grid min-h-0 place-items-center border-l border-zinc-200 bg-zinc-50">
        <div className="text-sm text-zinc-500">Open a workspace to start chat.</div>
      </section>
    );
  }
  return <ChatWorkspace workspace={workspace} />;
}

function ChatWorkspace({ workspace }: { workspace: WorkspaceSummary }) {
  const chat = useChatViewState(workspace.id);
  const busy = isChatBusy(chat);
  const blocked = isChatBlocked(chat);
  const composerBusy = isComposerBusy(chat);
  const running = isRunRunning(chat);
  const selectedConversationId = selectedChatConversationId(chat);

  return (
    <section className="grid min-h-0 min-w-0 grid-cols-[280px_1fr] overflow-hidden border-l border-zinc-200 bg-zinc-50">
      <aside className="flex min-h-0 min-w-0 flex-col border-r border-zinc-200 bg-white">
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
          <h2 className="text-sm font-semibold">Chats</h2>
          <Button
            aria-label="New chat"
            disabled={busy}
            onClick={() => void chat.createConversation()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ConversationList
          conversations={chat.conversations}
          selectedConversationId={selectedConversationId}
          selectConversation={chat.selectConversation}
        />
      </aside>
      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
        data-conversation-id={selectedConversationId}
        data-run-status={activeRunStatus(chat) ?? ""}
        data-testid="chat-detail-pane"
      >
        <header className="flex h-14 flex-none min-w-0 items-center justify-between border-b border-zinc-200 bg-white px-5">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{chatTitle(chat, workspace)}</div>
            <div className="truncate text-xs text-zinc-500">{workspace.rootPath}</div>
          </div>
          <RunBadge active={running} status={activeRunStatus(chat)} />
        </header>
        <WorkspaceCorruptionPanel busy={busy} chat={chat} workspace={workspace} />
        <ConversationBody busy={busy} chat={chat} />
        <CriticalDiagnostics chat={chat} />
        <ChatError message={selectedConversationChatError(chat)} />
        <ComposerSlot blocked={blocked} busy={composerBusy} chat={chat} running={running} />
      </div>
    </section>
  );
}

type ChatView = ReturnType<typeof useChatViewState>;

const composerBlockingOperations = new Set([
  "commanding",
  "creating",
  "loading",
  "loadingOlder",
  "refreshing",
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

function chatTitle(chat: ChatView, workspace: WorkspaceSummary) {
  return chat.selectedConversation?.title ?? workspace.displayName;
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

export function ConversationBody({ busy, chat }: { busy: boolean; chat: ChatView }) {
  if (chat.error && !chat.selectedConversation) {
    return <ChatLoadError message={chat.error} />;
  }
  if (!chat.selectedConversation) {
    return <EmptyConversation busy={busy} createConversation={chat.createConversation} />;
  }
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden" data-testid="chat-transcript-region">
      <ChatTranscript
        activeRun={chat.activeRun}
        hasMoreOlder={chat.hasMoreOlder}
        loadOlder={chat.loadOlder}
        loadRunItemOutput={chat.loadRunItemOutput}
        messageIds={chat.messageIds}
        messages={chat.messages}
        messagesById={chat.messagesById}
        runItemIdsByRunId={chat.runItemIdsByRunId}
        runItemOutputIdsByRunItemId={chat.runItemOutputIdsByRunItemId}
        runItemOutputPagesByRunItemId={chat.runItemOutputPagesByRunItemId}
        runItemOutputs={chat.runItemOutputs}
        runItemOutputsById={chat.runItemOutputsById}
        runItems={chat.runItems}
        runItemsById={chat.runItemsById}
        submitApproval={chat.submitApproval}
        transcript={chat.transcript}
      />
    </div>
  );
}

function ChatLoadError({ message }: { message: string }) {
  return (
    <div className="grid min-h-0 min-w-0 flex-1 place-items-center px-6">
      <div
        className="max-w-2xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm break-words text-red-800"
        data-testid="chat-load-error"
      >
        <div className="font-medium">Chat state is corrupt</div>
        <div className="mt-2">{message}</div>
      </div>
    </div>
  );
}

function EmptyConversation({
  busy,
  createConversation,
}: {
  busy: boolean;
  createConversation: (title?: string) => Promise<void>;
}) {
  return (
    <div className="grid min-h-0 min-w-0 flex-1 place-items-center px-6">
      <div className="text-center">
        <MessageSquarePlus className="mx-auto h-8 w-8 text-zinc-400" />
        <Button
          className="mt-4"
          disabled={busy}
          onClick={() => void createConversation()}
          variant="primary"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>
    </div>
  );
}

function ChatError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div className="border-t border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

function WorkspaceCorruptionPanel({
  busy,
  chat,
  workspace,
}: {
  busy: boolean;
  chat: ChatView;
  workspace: WorkspaceSummary;
}) {
  if (!chat.corruption.hasCorruption && !chat.maintenanceNotice) {
    return null;
  }
  const latestDiagnostic = chat.diagnostics
    .filter((diagnostic) => diagnostic.severity === "critical")
    .at(-1);
  const affectedPath = latestDiagnostic?.context.path ?? "";
  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950"
      data-testid="workspace-corruption-warning"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <AlertTriangle className="h-4 w-4 flex-none" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Chat state needs attention</div>
          <div className="truncate text-xs text-amber-900">
            {chat.maintenanceNotice ??
              `${chat.corruption.total} corrupt records detected${affectedPath ? `: ${affectedPath}` : ""}`}
          </div>
        </div>
        <Button
          aria-label="Quarantine corrupt chat records"
          disabled={busy || !chat.corruption.hasCorruption}
          onClick={() =>
            confirmMaintenance(workspace.id, "Quarantine corrupt chat records") &&
            void chat.quarantineCorruptState()
          }
          type="button"
          variant="secondary"
        >
          <Archive className="h-4 w-4" />
          Quarantine
        </Button>
        <Button
          aria-label="Reset workspace chat state"
          disabled={busy}
          onClick={() =>
            confirmMaintenance(workspace.id, "Reset workspace chat state") &&
            void chat.resetWorkspaceState()
          }
          type="button"
          variant="secondary"
        >
          <Trash2 className="h-4 w-4" />
          Reset
        </Button>
        <Button
          aria-label="Clear chat quarantine"
          disabled={busy}
          onClick={() =>
            confirmMaintenance(workspace.id, "Clear chat quarantine") && void chat.clearQuarantine()
          }
          type="button"
          variant="secondary"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function confirmMaintenance(workspaceId: string, action: string) {
  return window.confirm(`${action} for workspace ${workspaceId}?`);
}

function CriticalDiagnostics({ chat }: { chat: ChatView }) {
  const selectedConversationId = chat.selectedConversation?.id ?? "";
  const activeRunId = chat.activeRun?.id ?? "";
  const critical = chat.diagnostics
    .filter(
      (diagnostic) =>
        diagnostic.severity === "critical" &&
        ((diagnostic.conversationId !== "" &&
          diagnostic.conversationId === selectedConversationId) ||
          (diagnostic.runId !== "" && diagnostic.runId === activeRunId)),
    )
    .at(-1);
  if (!critical) {
    return null;
  }
  return (
    <div className="border-t border-red-200 bg-red-50 px-5 py-2 text-sm text-red-800">
      <span className="font-medium">{critical.code}</span>: {critical.message}
    </div>
  );
}

function Composer({ busy, chat, running }: { busy: boolean; chat: ChatView; running: boolean }) {
  const [draft, setDraft] = useState("");
  const [commands, setCommands] = useState<ChatCommandCapability[]>([]);
  const [commandListKey, setCommandListKey] = useState("");
  const [modelPicker, setModelPicker] = useState<ChatCommandExecuteResult | null>(null);
  const submittingRef = useRef(false);
  const disabled = !chat.selectedConversation || busy;
  const slashDraft = isSlashDraft(draft);
  const suggestions = commandSuggestions(commands, draft);
  const selectedSuggestion = suggestions[0] ?? null;

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

  async function sendDraft() {
    const prompt = draft.trim();
    if (!prompt || !chat.selectedConversation || disabled || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      if (slashDraft) {
        const result = await chat.executeCommand(commandTextToExecute(prompt, selectedSuggestion));
        if (result.result.action === "model_picker") {
          setModelPicker(result);
        } else {
          setModelPicker(null);
        }
        setDraft("");
      } else if (running) {
        setDraft("");
        await chat.steerMessage(prompt);
      } else {
        setDraft("");
        await chat.sendMessage(prompt);
      }
    } finally {
      submittingRef.current = false;
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
      await chat.queueMessage(prompt);
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <form
      className="flex-none border-t border-zinc-200 bg-white p-4"
      data-testid="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void sendDraft();
      }}
    >
      <div className="mx-auto flex max-w-4xl min-w-0 items-end gap-3">
        <div className="relative min-w-0 flex-1">
          <CommandSuggestions
            draft={draft}
            modelPicker={modelPicker}
            onPickCommand={(command) => setDraft(command.name + " ")}
            onPickModel={(model) => {
              void executeModelSelection(model);
            }}
            selectedSuggestion={selectedSuggestion}
            suggestions={suggestions}
          />
          <textarea
            className="min-h-11 w-full min-w-0 resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 outline-none focus:border-zinc-500"
            disabled={disabled}
            onChange={(event) => {
              setDraft(event.target.value);
              if (!isSlashDraft(event.target.value)) {
                setModelPicker(null);
              }
            }}
            onKeyDown={(event) =>
              handleComposerKeyDown(event, {
                completeCommand: () => {
                  if (selectedSuggestion && draft.trim() !== selectedSuggestion.name) {
                    setDraft(selectedSuggestion.name + " ");
                  }
                },
                queueDraft,
                running,
                sendDraft,
                slashDraft,
                stopRun: chat.stopActiveRun,
              })
            }
            placeholder={chat.selectedConversation ? "Ask Codex" : "Create a chat first"}
            rows={2}
            value={draft}
          />
        </div>
        <ComposerButton
          canSend={!disabled && draft.trim() !== ""}
          chat={chat}
          queueDraft={queueDraft}
          running={running}
        />
      </div>
    </form>
  );

  async function executeModelSelection(model: ChatModelOption) {
    if (!chat.selectedConversation || disabled || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      await chat.executeCommand(modelSelectionCommand(model));
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
  onPickCommand,
  onPickModel,
  selectedSuggestion,
  suggestions,
}: {
  draft: string;
  modelPicker: ChatCommandExecuteResult | null;
  onPickCommand: (command: ChatCommandCapability) => void;
  onPickModel: (model: ChatModelOption) => void;
  selectedSuggestion: ChatCommandCapability | null;
  suggestions: ChatCommandCapability[];
}) {
  if (modelPicker?.result.action === "model_picker") {
    return (
      <div
        className="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 shadow-lg"
        data-testid="model-picker"
      >
        {modelPicker.result.models.map((model) => (
          <button
            className="flex w-full min-w-0 items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-zinc-50"
            key={model.id}
            onClick={() => onPickModel(model)}
            type="button"
          >
            {model.isDefault ? <Check className="h-4 w-4 shrink-0 text-zinc-500" /> : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-zinc-900">{model.displayName}</span>
              <span className="block truncate text-xs text-zinc-500">{model.model}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }
  if (!isSlashDraft(draft) || suggestions.length === 0) {
    return null;
  }
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-md border border-zinc-200 bg-white p-1 shadow-lg"
      data-testid="command-suggestions"
    >
      {suggestions.map((command) => (
        <button
          className={
            command === selectedSuggestion
              ? "flex w-full min-w-0 items-center justify-between gap-3 rounded bg-zinc-100 px-2 py-2 text-left text-sm"
              : "flex w-full min-w-0 items-center justify-between gap-3 rounded px-2 py-2 text-left text-sm hover:bg-zinc-50"
          }
          disabled={!command.available}
          key={command.name}
          onClick={() => onPickCommand(command)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block font-medium text-zinc-900">{command.name}</span>
            <span className="block truncate text-xs text-zinc-500">
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

export function modelSelectionCommand(model: ChatModelOption) {
  return `/model ${model.model}`;
}

interface ComposerKeyActions {
  completeCommand: () => void;
  queueDraft: () => Promise<void>;
  running: boolean;
  sendDraft: () => Promise<void>;
  slashDraft: boolean;
  stopRun: () => Promise<void>;
}

export function handleComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  actions: ComposerKeyActions,
) {
  if (isQueueShortcut(event)) {
    event.preventDefault();
    if (actions.slashDraft) {
      actions.completeCommand();
      return;
    }
    void actions.queueDraft();
    return;
  }
  if (isStopShortcut(event, actions.running)) {
    event.preventDefault();
    void actions.stopRun();
    return;
  }
  if (!isSubmitShortcut(event)) {
    return;
  }
  event.preventDefault();
  void actions.sendDraft();
}

function isQueueShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
  return event.key === "Tab" && !event.nativeEvent.isComposing;
}

function isStopShortcut(event: KeyboardEvent<HTMLTextAreaElement>, running: boolean) {
  return running && event.key === "c" && event.ctrlKey && !hasTextSelection(event.currentTarget);
}

function isSubmitShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
  return (
    event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing
  );
}

function hasTextSelection(textarea: HTMLTextAreaElement) {
  return textarea.selectionStart !== textarea.selectionEnd;
}

export function ComposerButton({
  canSend,
  chat,
  queueDraft,
  running,
}: {
  canSend: boolean;
  chat: {
    operation: string | null;
    stopActiveRun: () => Promise<void>;
  };
  queueDraft: () => Promise<void>;
  running: boolean;
}) {
  if (running) {
    return (
      <div className="flex items-center gap-2">
        <Button
          aria-label="Send steering message"
          disabled={!canSend}
          type="submit"
          variant="primary"
        >
          <Send className="h-4 w-4" />
          Send
        </Button>
        <Button
          aria-label="Queue follow-up"
          disabled={!canSend || chat.operation === "queueing"}
          onClick={() => void queueDraft()}
          type="button"
          variant="secondary"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Queue
        </Button>
        <Button
          aria-label="Stop run"
          disabled={chat.operation === "cancelling"}
          onClick={() => void chat.stopActiveRun()}
          type="button"
          variant="secondary"
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <Button aria-label="Send message" disabled={!canSend} type="submit" variant="primary">
      <Send className="h-4 w-4" />
      Send
    </Button>
  );
}

function useChatViewState(workspaceId: string | null) {
  const activeRun = useChatStore((state) => state.activeRun);
  const clearQuarantine = useChatStore((state) => state.clearQuarantine);
  const conversations = useChatStore((state) => state.conversations);
  const corruption = useChatStore((state) => state.corruption);
  const createConversation = useChatStore((state) => state.createConversation);
  const error = useChatStore((state) => state.error);
  const executeCommand = useChatStore((state) => state.executeCommand);
  const diagnostics = useChatStore((state) => state.diagnostics);
  const hasMoreOlder = useChatStore((state) => state.hasMoreOlder);
  const loadOlder = useChatStore((state) => state.loadOlder);
  const loadRunItemOutput = useChatStore((state) => state.loadRunItemOutput);
  const loadWorkspace = useChatStore((state) => state.loadWorkspace);
  const listCommands = useChatStore((state) => state.listCommands);
  const maintenanceNotice = useChatStore((state) => state.maintenanceNotice);
  const messageIds = useChatStore((state) => state.messageIds);
  const messages = useChatStore((state) => state.messages);
  const messagesById = useChatStore((state) => state.messagesById);
  const operation = useChatStore((state) => state.operation);
  const quarantineCorruptState = useChatStore((state) => state.quarantineCorruptState);
  const queueMessage = useChatStore((state) => state.queueMessage);
  const resetWorkspaceState = useChatStore((state) => state.resetWorkspaceState);
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
  const status = useChatStore((state) => state.status);
  const steerMessage = useChatStore((state) => state.steerMessage);
  const stopActiveRun = useChatStore((state) => state.stopActiveRun);
  const submitApproval = useChatStore((state) => state.submitApproval);
  const storeWorkspaceId = useChatStore((state) => state.workspaceId);
  const transcript = useChatStore((state) => state.transcript);

  useEffect(() => {
    if (!workspaceId || workspaceId === storeWorkspaceId) {
      return;
    }
    void loadWorkspace(workspaceId);
  }, [loadWorkspace, storeWorkspaceId, workspaceId]);

  return {
    activeRun,
    clearQuarantine,
    conversations,
    corruption,
    createConversation,
    diagnostics,
    error,
    executeCommand,
    hasMoreOlder,
    loadOlder,
    loadRunItemOutput,
    listCommands,
    maintenanceNotice,
    messageIds,
    messages,
    messagesById,
    operation,
    quarantineCorruptState,
    queueMessage,
    resetWorkspaceState,
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
    status,
    steerMessage,
    stopActiveRun,
    submitApproval,
    transcript,
  };
}

function ConversationList({
  conversations,
  selectedConversationId,
  selectConversation,
}: {
  conversations: ConversationListItem[];
  selectedConversationId: string;
  selectConversation: (conversationId: string) => Promise<void>;
}) {
  const [visibleLimit, setVisibleLimit] = useState(80);
  const selectedIndex = conversations.findIndex(
    (item) => item.conversation.id === selectedConversationId,
  );
  const effectiveLimit =
    selectedIndex >= visibleLimit
      ? Math.min(conversations.length, selectedIndex + 1)
      : visibleLimit;
  const visibleConversations = useMemo(
    () => conversations.slice(0, effectiveLimit),
    [conversations, effectiveLimit],
  );
  if (visibleConversations.length === 0) {
    return <div className="px-4 py-5 text-sm text-zinc-500">No chats yet</div>;
  }
  return (
    <div className="min-h-0 overflow-y-auto p-2" data-testid="conversation-list">
      {visibleConversations.map((item) => (
        <button
          className={
            item.conversation.id === selectedConversationId
              ? "mb-1 block w-full rounded-md bg-zinc-100 px-3 py-2 text-left"
              : "mb-1 block w-full rounded-md px-3 py-2 text-left hover:bg-zinc-50"
          }
          data-testid="conversation-list-item"
          key={item.conversation.id}
          onClick={() => void selectConversation(item.conversation.id)}
          type="button"
        >
          <div className="truncate text-sm font-medium text-zinc-900">
            {item.conversation.title}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{item.messageCount} messages</div>
        </button>
      ))}
      {visibleConversations.length < conversations.length ? (
        <Button
          className="mt-2 w-full"
          onClick={() => setVisibleLimit((current) => current + 80)}
          variant="secondary"
        >
          More Chats
        </Button>
      ) : null}
    </div>
  );
}

const runBadgeByStatus = {
  cancelled: { label: "Cancelled", variant: "neutral" },
  completed: { label: "Ready", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  queued: { label: "Queued", variant: "neutral" },
  running: { label: "Running", variant: "neutral" },
} satisfies Record<RunStatus, { label: string; variant: "danger" | "neutral" | "success" }>;

function RunBadge({ active, status }: { active: boolean; status: RunStatus | null }) {
  if (active) {
    return <Badge variant="neutral">Running</Badge>;
  }
  if (status === null) {
    return <Badge variant="success">Ready</Badge>;
  }
  const badge = runBadgeByStatus[status];
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}
