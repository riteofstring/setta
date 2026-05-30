import type { ConversationListItem, WorkspaceSummary } from "@generated/backend";
import { MessageSquarePlus, Plus, Send, Square } from "lucide-react";
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
  const composerBusy = isComposerBusy(chat);
  const running = isRunRunning(chat);

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
          selectedConversationId={chat.selectedConversation?.id ?? ""}
          selectConversation={chat.selectConversation}
        />
      </aside>
      <div className="grid min-h-0 min-w-0 grid-rows-[56px_minmax(0,1fr)_auto_auto] overflow-hidden">
        <header className="flex min-w-0 items-center justify-between border-b border-zinc-200 bg-white px-5">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {chat.selectedConversation?.title ?? workspace.displayName}
            </div>
            <div className="truncate text-xs text-zinc-500">{workspace.rootPath}</div>
          </div>
          <RunBadge active={running} status={chat.activeRun?.status ?? null} />
        </header>
        <ConversationBody busy={busy} chat={chat} />
        <CriticalDiagnostics diagnostics={chat.diagnostics} />
        <ChatError message={chat.error} />
        <Composer busy={composerBusy} chat={chat} running={running} />
      </div>
    </section>
  );
}

type ChatView = ReturnType<typeof useChatViewState>;

const composerBlockingOperations = new Set(["creating", "loading", "loadingOlder", "refreshing"]);

function isChatBusy(chat: ChatView) {
  return chat.operation !== null || chat.status === "loading";
}

function isComposerBusy(chat: ChatView) {
  return chat.status === "loading" || composerBlockingOperations.has(chat.operation ?? "");
}

function isRunRunning(chat: ChatView) {
  return chat.activeRun?.status === "running";
}

function ConversationBody({ busy, chat }: { busy: boolean; chat: ChatView }) {
  if (!chat.selectedConversation) {
    return <EmptyConversation busy={busy} createConversation={chat.createConversation} />;
  }
  return (
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
      runItemOutputs={chat.runItemOutputs}
      runItemOutputsById={chat.runItemOutputsById}
      runItems={chat.runItems}
      runItemsById={chat.runItemsById}
      submitApproval={chat.submitApproval}
    />
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
    <div className="grid min-h-0 place-items-center px-6">
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

function CriticalDiagnostics({ diagnostics }: { diagnostics: ChatView["diagnostics"] }) {
  const critical = diagnostics.filter((diagnostic) => diagnostic.severity === "critical").at(-1);
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
  const submittingRef = useRef(false);
  const disabled = !chat.selectedConversation || busy;

  async function sendDraft() {
    const prompt = draft.trim();
    if (!prompt || !chat.selectedConversation || disabled || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      setDraft("");
      if (running) {
        await chat.steerMessage(prompt);
      } else {
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
      className="border-t border-zinc-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void sendDraft();
      }}
    >
      <div className="mx-auto flex max-w-4xl min-w-0 items-end gap-3">
        <textarea
          className="min-h-11 min-w-0 flex-1 resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 outline-none focus:border-zinc-500"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) =>
            handleComposerKeyDown(event, {
              queueDraft,
              running,
              sendDraft,
              stopRun: chat.stopActiveRun,
            })
          }
          placeholder={chat.selectedConversation ? "Ask Codex" : "Create a chat first"}
          rows={2}
          value={draft}
        />
        <ComposerButton canSend={!disabled && draft.trim() !== ""} chat={chat} running={running} />
      </div>
    </form>
  );
}

interface ComposerKeyActions {
  queueDraft: () => Promise<void>;
  running: boolean;
  sendDraft: () => Promise<void>;
  stopRun: () => Promise<void>;
}

function handleComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  actions: ComposerKeyActions,
) {
  if (isQueueShortcut(event)) {
    event.preventDefault();
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

function ComposerButton({
  canSend,
  chat,
  running,
}: {
  canSend: boolean;
  chat: ChatView;
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
  const conversations = useChatStore((state) => state.conversations);
  const createConversation = useChatStore((state) => state.createConversation);
  const error = useChatStore((state) => state.error);
  const diagnostics = useChatStore((state) => state.diagnostics);
  const hasMoreOlder = useChatStore((state) => state.hasMoreOlder);
  const loadOlder = useChatStore((state) => state.loadOlder);
  const loadRunItemOutput = useChatStore((state) => state.loadRunItemOutput);
  const loadWorkspace = useChatStore((state) => state.loadWorkspace);
  const messageIds = useChatStore((state) => state.messageIds);
  const messages = useChatStore((state) => state.messages);
  const messagesById = useChatStore((state) => state.messagesById);
  const operation = useChatStore((state) => state.operation);
  const queueMessage = useChatStore((state) => state.queueMessage);
  const runItemIdsByRunId = useChatStore((state) => state.runItemIdsByRunId);
  const runItemOutputIdsByRunItemId = useChatStore((state) => state.runItemOutputIdsByRunItemId);
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

  useEffect(() => {
    if (!workspaceId || workspaceId === storeWorkspaceId) {
      return;
    }
    void loadWorkspace(workspaceId);
  }, [loadWorkspace, storeWorkspaceId, workspaceId]);

  return {
    activeRun,
    conversations,
    createConversation,
    diagnostics,
    error,
    hasMoreOlder,
    loadOlder,
    loadRunItemOutput,
    messageIds,
    messages,
    messagesById,
    operation,
    queueMessage,
    runItemIdsByRunId,
    runItemOutputIdsByRunItemId,
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

function RunBadge({ active, status }: { active: boolean; status: string | null }) {
  if (active) {
    return <Badge variant="neutral">Running</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="danger">Failed</Badge>;
  }
  if (status === "cancelled") {
    return <Badge variant="neutral">Cancelled</Badge>;
  }
  return <Badge variant="success">Ready</Badge>;
}
