import type { ConversationListItem, WorkspaceSummary } from "@generated/backend";
import { MessageSquarePlus, Plus, Send, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
  const busy = chat.operation !== null || chat.status === "loading";
  const running = chat.activeRun?.status === "running";

  return (
    <section className="grid min-h-0 grid-cols-[280px_1fr] border-l border-zinc-200 bg-zinc-50">
      <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
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
      <div className="grid min-h-0 grid-rows-[56px_1fr_auto]">
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
        <ChatError message={chat.error} />
        <Composer busy={busy} chat={chat} running={running} />
      </div>
    </section>
  );
}

type ChatView = ReturnType<typeof useChatViewState>;

function ConversationBody({ busy, chat }: { busy: boolean; chat: ChatView }) {
  if (!chat.selectedConversation) {
    return <EmptyConversation busy={busy} createConversation={chat.createConversation} />;
  }
  return (
    <ChatTranscript
      activeRun={chat.activeRun}
      hasMoreOlder={chat.hasMoreOlder}
      loadOlder={chat.loadOlder}
      messages={chat.messages}
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

function Composer({ busy, chat, running }: { busy: boolean; chat: ChatView; running: boolean }) {
  const [draft, setDraft] = useState("");
  const disabled = !chat.selectedConversation || busy || running;

  async function sendDraft() {
    const prompt = draft.trim();
    if (!prompt || !chat.selectedConversation || running) {
      return;
    }
    setDraft("");
    await chat.sendMessage(prompt);
  }

  return (
    <form
      className="border-t border-zinc-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void sendDraft();
      }}
    >
      <div className="mx-auto flex max-w-4xl items-end gap-3">
        <textarea
          className="min-h-11 flex-1 resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 outline-none focus:border-zinc-500"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={chat.selectedConversation ? "Ask Codex" : "Create a chat first"}
          rows={2}
          value={draft}
        />
        <ComposerButton canSend={!disabled && draft.trim() !== ""} chat={chat} running={running} />
      </div>
    </form>
  );
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
      <Button
        aria-label="Stop run"
        disabled={chat.operation === "cancelling"}
        onClick={() => void chat.stopActiveRun()}
        type="button"
        variant="secondary"
      >
        <Square className="h-4 w-4" />
        Stop
      </Button>
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
  const hasMoreOlder = useChatStore((state) => state.hasMoreOlder);
  const loadOlder = useChatStore((state) => state.loadOlder);
  const loadWorkspace = useChatStore((state) => state.loadWorkspace);
  const messages = useChatStore((state) => state.messages);
  const operation = useChatStore((state) => state.operation);
  const refreshActiveConversation = useChatStore((state) => state.refreshActiveConversation);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const selectedConversation = useChatStore((state) => state.selectedConversation);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const status = useChatStore((state) => state.status);
  const stopActiveRun = useChatStore((state) => state.stopActiveRun);
  const submitApproval = useChatStore((state) => state.submitApproval);
  const storeWorkspaceId = useChatStore((state) => state.workspaceId);

  useEffect(() => {
    if (!workspaceId || workspaceId === storeWorkspaceId) {
      return;
    }
    void loadWorkspace(workspaceId);
  }, [loadWorkspace, storeWorkspaceId, workspaceId]);

  useEffect(() => {
    if (!activeRun || activeRun.status !== "running") {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshActiveConversation();
    }, 400);
    return () => window.clearInterval(timer);
  }, [activeRun, refreshActiveConversation]);

  return {
    activeRun,
    conversations,
    createConversation,
    error,
    hasMoreOlder,
    loadOlder,
    messages,
    operation,
    selectConversation,
    selectedConversation,
    sendMessage,
    status,
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
  const visibleConversations = useMemo(() => conversations.slice(0, 80), [conversations]);
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
