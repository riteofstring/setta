import type { WorkspaceSummary } from "@generated/backend";
import { MessageSquarePlus, Mic, Plus, Send, Square } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { useChatStore } from "../stores/chat-store";
import { ChatTranscript } from "./chat-transcript";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export function ChatPanel({
  chat,
  workspace,
}: {
  chat: ChatView;
  workspace: WorkspaceSummary | null;
}) {
  if (!workspace) {
    return (
      <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-zinc-900 pt-8 text-zinc-100">
        <div className="grid min-h-0 flex-1 place-items-center px-6 text-center text-sm text-zinc-500">
          Open a workspace to start chat.
        </div>
      </section>
    );
  }
  return <ChatWorkspace chat={chat} />;
}

function ChatWorkspace({ chat }: { chat: ChatView }) {
  const busy = chat.operation !== null || chat.status === "loading";
  const running = chat.activeRun?.status === "running";

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-zinc-900 pt-8 text-zinc-100">
      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] overflow-hidden">
        <ConversationBody busy={busy} chat={chat} />
        <ChatError message={chat.error} />
        <Composer busy={busy} chat={chat} running={running} />
      </div>
    </section>
  );
}

function IconButton({
  children,
  disabled = false,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export type ChatView = ReturnType<typeof useChatViewState>;

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
        <MessageSquarePlus className="mx-auto h-8 w-8 text-zinc-500" />
        <Button
          className="mt-4 border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
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
    <div className="border-t border-zinc-800 bg-zinc-900 px-5 py-2 text-sm text-zinc-100">
      {message}
    </div>
  );
}

function Composer({ busy, chat, running }: { busy: boolean; chat: ChatView; running: boolean }) {
  const [draft, setDraft] = useState("");
  const submittingRef = useRef(false);
  const disabled = !chat.selectedConversation || busy || running;

  async function sendDraft() {
    const prompt = draft.trim();
    if (!prompt || !chat.selectedConversation || running || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      setDraft("");
      await chat.sendMessage(prompt);
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <form
      className="bg-zinc-900 px-4 pt-2 pb-4"
      onSubmit={(event) => {
        event.preventDefault();
        void sendDraft();
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl min-w-0 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1">
        <IconButton disabled={disabled} label="Add attachment">
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton disabled={disabled} label="Voice input">
          <Mic className="h-3.5 w-3.5" />
        </IconButton>
        <Textarea
          className="max-h-24 min-h-7 min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 text-zinc-100 shadow-none outline-none placeholder:text-zinc-600 focus-visible:border-0"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.altKey ||
              event.nativeEvent.isComposing
            ) {
              return;
            }
            event.preventDefault();
            void sendDraft();
          }}
          placeholder={chat.selectedConversation ? "Ask Setta" : "Create a chat first"}
          rows={1}
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
        className="h-7 w-7 shrink-0 border-zinc-700 bg-zinc-800 px-0 text-zinc-100 hover:bg-zinc-700"
        disabled={chat.operation === "cancelling"}
        onClick={() => void chat.stopActiveRun()}
        title="Stop run"
        type="button"
        variant="secondary"
      >
        <Square className="h-3.5 w-3.5" />
      </Button>
    );
  }
  return (
    <Button
      aria-label="Send message"
      className="h-7 w-7 shrink-0 border-zinc-700 bg-zinc-800 px-0 text-zinc-300 hover:bg-zinc-700 hover:text-white"
      disabled={!canSend}
      title="Send message"
      type="submit"
      variant="primary"
    >
      <Send className="h-3.5 w-3.5" />
    </Button>
  );
}

export function useChatViewState(workspaceId: string | null) {
  const activeRun = useChatStore((state) => state.activeRun);
  const conversations = useChatStore((state) => state.conversations);
  const createConversation = useChatStore((state) => state.createConversation);
  const error = useChatStore((state) => state.error);
  const hasMoreOlder = useChatStore((state) => state.hasMoreOlder);
  const loadOlder = useChatStore((state) => state.loadOlder);
  const loadWorkspace = useChatStore((state) => state.loadWorkspace);
  const messages = useChatStore((state) => state.messages);
  const operation = useChatStore((state) => state.operation);
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
