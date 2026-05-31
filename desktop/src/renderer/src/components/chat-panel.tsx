import type { WorkspaceSummary } from "@generated/backend";
import { ArrowUp, Maximize2, Mic, Minimize2, Square } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import settaLogo from "../../../../img/logo/logo.svg";
import { useChatStore } from "../stores/chat-store";
import { cn } from "../lib/utils";
import { ChatModelMenu } from "./chat-model-menu";
import { ChatPermissionsMenu } from "./chat-permissions-menu";
import { ChatPlusMenu } from "./chat-plus-menu";
import { ChatTranscript } from "./chat-transcript";
import { SlashCommandPalette } from "./slash-command-palette";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

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
  const busy = chat.operation !== null || chat.status === "loading";
  const running = chat.activeRun?.status === "running";

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
      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] overflow-visible">
        <ConversationBody
          busy={busy}
          chat={chat}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
        />
        <ChatError message={chat.error} />
        {chat.selectedConversation ? <Composer busy={busy} chat={chat} running={running} /> : null}
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
    return <EmptyConversation busy={busy} chat={chat} />;
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
  const [slashPaletteDismissed, setSlashPaletteDismissed] = useState(false);
  const composerFrameRef = useRef<HTMLDivElement | null>(null);
  const submittingRef = useRef(false);
  const selected = chat.selectedConversation !== null;
  const disabled = composerIsDisabled({
    busy,
    disabledOverride,
    running,
    selected,
  });
  const slashQuery = slashCommandQuery(draft);
  const slashPaletteOpen = composerSlashPaletteIsOpen(slashQuery, slashPaletteDismissed);

  async function sendDraft() {
    const prompt = draft.trim();
    if (!prompt || disabled || running || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      setDraft("");
      await (onSendPrompt ?? chat.sendMessage)(prompt);
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
      className={cn("bg-zinc-900 px-2 pt-1 pb-1.5", formClassName)}
      onSubmit={(event) => {
        event.preventDefault();
        void sendDraft();
      }}
    >
      <div className="relative mx-auto w-full max-w-3xl min-w-0">
        <SlashCommandPalette
          anchorRef={composerFrameRef}
          onSelect={(insertText) => {
            setDraft(insertText);
            setSlashPaletteDismissed(true);
          }}
          open={slashPaletteOpen}
          query={slashQuery ?? ""}
        />
        <div
          className={cn(
            "min-w-0 rounded-sm border border-zinc-700 bg-zinc-800/90 px-2 py-1.5 shadow-lg shadow-black/15",
            frameClassName,
          )}
          ref={composerFrameRef}
        >
          <div className="relative min-w-0">
            <ComposerPlaceholder selected={selected} visible={draft === ""} />
            <Textarea
              aria-label={composerTextareaLabel(selected)}
              className="max-h-28 min-h-8 min-w-0 resize-none border-0 bg-transparent px-0 py-0 text-xs leading-4 text-zinc-100 shadow-none outline-none placeholder:text-zinc-500 focus-visible:border-0 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onChange={(event) => updateDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && slashPaletteOpen) {
                  event.preventDefault();
                  setSlashPaletteDismissed(true);
                  return;
                }
                if (!shouldSubmitComposer(event)) {
                  return;
                }
                event.preventDefault();
                void sendDraft();
              }}
              placeholder={placeholder}
              rows={2}
              value={draft}
            />
          </div>
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

function waitForComposerExit() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 130);
  });
}

function composerIsDisabled({
  busy,
  disabledOverride,
  running,
  selected,
}: {
  busy: boolean;
  disabledOverride: boolean | undefined;
  running: boolean;
  selected: boolean;
}) {
  if (disabledOverride !== undefined) {
    return disabledOverride;
  }
  return !selected || busy || running;
}

function composerSlashPaletteIsOpen(slashQuery: string | null, dismissed: boolean) {
  return slashQuery !== null && !dismissed;
}

function composerTextareaLabel(selected: boolean) {
  return selected ? "Ask Setta" : "Start new chat";
}

function shouldSubmitComposer(event: KeyboardEvent<HTMLTextAreaElement>) {
  return (
    event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing
  );
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
  const createWorkspaceConversation = useChatStore((state) => state.createWorkspaceConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
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
  const unreadConversationIds = useChatStore((state) => state.unreadConversationIds);
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
    createWorkspaceConversation,
    deleteConversation,
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
    unreadConversationIds,
    updateUserMessage,
  };
}
