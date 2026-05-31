import type { WorkspaceSummary } from "@generated/backend";
import { ArrowUp, MessageSquarePlus, Mic, Plus, Square } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { useChatStore } from "../stores/chat-store";
import { ChatModelMenu } from "./chat-model-menu";
import { ChatPermissionsMenu } from "./chat-permissions-menu";
import { ChatPlusMenu } from "./chat-plus-menu";
import { ChatTranscript } from "./chat-transcript";
import { SlashCommandPalette } from "./slash-command-palette";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export function ChatPanel({
  chat,
  searchOpen,
  setSearchOpen,
  workspace,
}: {
  chat: ChatView;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  workspace: WorkspaceSummary | null;
}) {
  if (!workspace) {
    return (
      <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-zinc-900 text-zinc-100">
        <div className="grid min-h-0 flex-1 place-items-center px-3 text-center text-xs text-zinc-500">
          Open a workspace to start chat.
        </div>
      </section>
    );
  }
  return <ChatWorkspace chat={chat} searchOpen={searchOpen} setSearchOpen={setSearchOpen} />;
}

function ChatWorkspace({
  chat,
  searchOpen,
  setSearchOpen,
}: {
  chat: ChatView;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}) {
  const busy = chat.operation !== null || chat.status === "loading";
  const running = chat.activeRun?.status === "running";

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-visible bg-zinc-900 text-zinc-100">
      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] overflow-visible">
        <ConversationBody
          busy={busy}
          chat={chat}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
        />
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
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
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

function ConversationBody({
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
  if (!chat.selectedConversation) {
    return <EmptyConversation busy={busy} createConversation={chat.createConversation} />;
  }
  return (
    <ChatTranscript
      activeRun={chat.activeRun}
      hasMoreOlder={chat.hasMoreOlder}
      loadOlder={chat.loadOlder}
      messages={chat.messages}
      onSearchOpenChange={setSearchOpen}
      searchOpen={searchOpen}
      submitApproval={chat.submitApproval}
      updateUserMessage={chat.updateUserMessage}
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
    <div className="grid min-h-0 place-items-center px-3">
      <div className="text-center">
        <MessageSquarePlus className="mx-auto h-6 w-6 text-zinc-500" />
        <Button
          className="mt-3 h-7 rounded-sm border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-100 hover:bg-zinc-700"
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
    <div className="border-t border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100">
      {message}
    </div>
  );
}

function Composer({ busy, chat, running }: { busy: boolean; chat: ChatView; running: boolean }) {
  const [draft, setDraft] = useState("");
  const [slashPaletteDismissed, setSlashPaletteDismissed] = useState(false);
  const submittingRef = useRef(false);
  const disabled = !chat.selectedConversation || busy || running;
  const slashQuery = slashCommandQuery(draft);
  const slashPaletteOpen = slashQuery !== null && !slashPaletteDismissed;

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

  function updateDraft(nextDraft: string) {
    setDraft(nextDraft);
    setSlashPaletteDismissed((wasDismissed) => (nextDraft.startsWith("/") ? wasDismissed : false));
  }

  return (
    <form
      className="bg-zinc-900 px-2 pt-1 pb-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        void sendDraft();
      }}
    >
      <div className="relative mx-auto w-full max-w-3xl min-w-0">
        <SlashCommandPalette
          onSelect={(insertText) => {
            setDraft(insertText);
            setSlashPaletteDismissed(true);
          }}
          open={slashPaletteOpen}
          query={slashQuery ?? ""}
        />
        <div className="min-w-0 rounded-sm border border-zinc-700 bg-zinc-800/90 px-2 py-1.5 shadow-lg shadow-black/15">
          <Textarea
            className="max-h-28 min-h-8 min-w-0 resize-none border-0 bg-transparent px-0 py-0 text-xs leading-4 text-zinc-100 shadow-none outline-none placeholder:text-zinc-500 focus-visible:border-0 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            onChange={(event) => updateDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && slashPaletteOpen) {
                event.preventDefault();
                setSlashPaletteDismissed(true);
                return;
              }
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
            rows={2}
            value={draft}
          />
          <div className="mt-1 flex min-w-0 items-center justify-between gap-1.5">
            <div className="flex min-w-0 items-center gap-1">
              <ChatPlusMenu disabled={disabled} />
              <ChatPermissionsMenu disabled={disabled} />
            </div>
            <div className="flex min-w-0 items-center gap-1">
              <ChatModelMenu disabled={disabled} />
              <IconButton disabled={disabled} label="Voice input">
                <Mic className="h-3.5 w-3.5" />
              </IconButton>
              <ComposerButton
                canSend={!disabled && draft.trim() !== ""}
                chat={chat}
                running={running}
              />
            </div>
          </div>
        </div>
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
        className="h-6 w-6 shrink-0 rounded-sm border-zinc-100 bg-zinc-100 px-0 text-zinc-950 hover:bg-white"
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
      className="h-6 w-6 shrink-0 rounded-sm border-zinc-100 bg-zinc-100 px-0 text-zinc-950 hover:bg-white disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-500"
      disabled={!canSend}
      title="Send message"
      type="submit"
      variant="primary"
    >
      <ArrowUp className="h-4 w-4" />
    </Button>
  );
}

function slashCommandQuery(draft: string) {
  if (!draft.startsWith("/") || draft.includes("\n")) {
    return null;
  }
  return draft.slice(1);
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
  const updateUserMessage = useChatStore((state) => state.updateUserMessage);
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
    updateUserMessage,
  };
}
