import type { WorkspaceSummary } from "@generated/backend";
import { AlertTriangle, Check, Maximize2, Minimize2 } from "lucide-react";
import { Square } from "lucide-react";
import { useEffect } from "react";

import { useChatStore } from "../stores/chat-store";
import { cn } from "../lib/utils";
import { Composer } from "./chat-composer";
import {
  chatReadableColumnAttributes,
  chatReadableColumnClass,
  chatReadableColumnPaddedClass,
} from "./chat-layout";
import { ChatTranscript } from "./chat-transcript";

export {
  CommandSuggestions,
  commandSuggestions,
  commandTextToExecute,
  goalEditorDraft,
  goalReplacementExecutionOptions,
  modelPickerOptionSelected,
  reasoningEffortOptionSelected,
} from "./chat-composer";
export { ComposerButton, handleComposerKeyDown, ModelPickerButton } from "./chat-composer-controls";

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
          "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background text-foreground",
          chromeInsetTop && "pt-8",
        )}
      >
        <div className="grid min-h-0 flex-1 place-items-center px-3 text-center text-xs text-muted-foreground">
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
      workspaceId={workspace.id}
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
  workspaceId,
}: {
  chat: ChatView;
  chromeInsetTop: boolean;
  maximized: boolean;
  onToggleMaximize?: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  workspaceId: string;
}) {
  const switchingWorkspace = chat.workspaceId !== workspaceId;
  const blocked = !switchingWorkspace && isChatBlocked(chat);
  const composerBusy = switchingWorkspace || isComposerBusy(chat);
  const running = !switchingWorkspace && isRunRunning(chat);
  const selectedConversationId = switchingWorkspace ? "" : selectedChatConversationId(chat);
  const runStatus = switchingWorkspace ? null : activeRunStatus(chat);
  const detailWorkspaceId = chatDetailWorkspaceId(switchingWorkspace, workspaceId);

  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-visible bg-background text-foreground",
        chromeInsetTop && "pt-8",
      )}
    >
      {onToggleMaximize ? (
        <ChatMaximizeButton maximized={maximized} onToggleMaximize={onToggleMaximize} />
      ) : null}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible"
        data-conversation-id={selectedConversationId}
        data-run-status={runStatus ?? ""}
        data-workspace-id={detailWorkspaceId}
        data-testid="chat-detail-pane"
      >
        <ConversationBody
          chat={chat}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
          switchingWorkspace={switchingWorkspace}
        />
        <ChatError message={selectedConversationChatError(chat)} />
        <ComposerSlot blocked={blocked} busy={composerBusy} chat={chat} running={running} />
      </div>
    </section>
  );
}

function chatDetailWorkspaceId(switchingWorkspace: boolean, workspaceId: string) {
  return switchingWorkspace ? "" : workspaceId;
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
      className="app-no-drag absolute top-0 right-1 z-50 grid h-8 w-7 cursor-pointer place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground"
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
  const emptyWorkspace = chat.selectedConversation === null;
  const disabled = emptyWorkspace ? busy || chat.status !== "ready" : undefined;
  return (
    <Composer
      busy={busy}
      chat={chat}
      disabled={disabled}
      onSendPrompt={emptyWorkspace ? createAndSendFirstMessage : undefined}
      placeholder={emptyWorkspace ? "Ask setta" : ""}
      running={running}
    />
  );

  async function createAndSendFirstMessage(prompt: string) {
    await chat.createConversation();
    await chat.sendMessage(prompt);
  }
}

export function ConversationBody({
  chat,
  searchOpen,
  setSearchOpen,
  switchingWorkspace = false,
}: {
  chat: ChatView;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  switchingWorkspace?: boolean;
}) {
  if (chat.error && !chat.selectedConversation) {
    return <ChatLoadError message={chat.error} />;
  }
  if (switchingWorkspace && !chat.selectedConversation) {
    return <EmptyConversation label="Loading workspace chats." />;
  }
  if (chat.status === "loading" && !chat.selectedConversation) {
    return <EmptyConversation label="Loading workspace chats." />;
  }
  if (!chat.selectedConversation) {
    return <EmptyConversation label="Start a conversation for this workspace." />;
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
    <div className="shrink-0 border-b border-border bg-background" title={title}>
      <div
        {...chatReadableColumnAttributes}
        className={cn(
          chatReadableColumnPaddedClass,
          "flex h-8 items-center gap-2 text-xs text-muted-foreground",
        )}
        data-goal-status={goal.status}
        data-testid="chat-goal-status"
      >
        <GoalStatusIcon status={goal.status} />
        <span className="shrink-0 font-medium text-foreground">{status}</span>
        <span className="min-w-0 truncate text-muted-foreground">{goal.objective}</span>
      </div>
    </div>
  );
}

function GoalStatusIcon({ status }: { status: string }) {
  if (status === "complete") {
    return <Check className="h-3.5 w-3.5 shrink-0 text-status-success" aria-hidden="true" />;
  }
  if (status === "blocked" || status === "budgetLimited" || status === "usageLimited") {
    return (
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-status-warning" aria-hidden="true" />
    );
  }
  return <Square className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />;
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
    <div className="grid min-h-0 min-w-0 flex-1 place-items-center px-3">
      <div
        {...chatReadableColumnAttributes}
        className={cn(
          chatReadableColumnPaddedClass,
          "rounded-sm border border-border bg-popover py-3 text-sm break-words text-popover-foreground",
        )}
        data-testid="chat-load-error"
      >
        <div className="font-medium">Chat state is corrupt</div>
        <div className="mt-2 text-muted-foreground">{message}</div>
      </div>
    </div>
  );
}

function EmptyConversation({ label }: { label: string }) {
  return (
    <div className="grid min-h-0 min-w-0 flex-1 place-items-center px-3 text-center text-xs text-muted-foreground">
      <div
        {...chatReadableColumnAttributes}
        className={cn(chatReadableColumnClass, "py-16")}
        data-testid="empty-chat"
      >
        {label}
      </div>
    </div>
  );
}

function ChatError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div className="border-t border-border bg-background">
      <div
        {...chatReadableColumnAttributes}
        className={cn(chatReadableColumnPaddedClass, "py-1.5 text-xs text-foreground")}
      >
        {message}
      </div>
    </div>
  );
}

export function useChatViewState() {
  const activeRun = useChatStore((state) => state.activeRun);
  const conversations = useChatStore((state) => state.conversations);
  const corruption = useChatStore((state) => state.corruption);
  const commandListError = useChatStore((state) => state.commandListError);
  const commandListStatus = useChatStore((state) => state.commandListStatus);
  const createConversation = useChatStore((state) => state.createConversation);
  const createWorkspaceConversation = useChatStore((state) => state.createWorkspaceConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const editQueuedMessage = useChatStore((state) => state.editQueuedMessage);
  const editingQueuedMessageId = useChatStore((state) => state.editingQueuedMessageId);
  const error = useChatStore((state) => state.error);
  const executeCommand = useChatStore((state) => state.executeCommand);
  const diagnostics = useChatStore((state) => state.diagnostics);
  const goal = useChatStore((state) => state.goal);
  const hasMoreOlder = useChatStore((state) => state.hasMoreOlder);
  const loadOlder = useChatStore((state) => state.loadOlder);
  const loadRunItemOutput = useChatStore((state) => state.loadRunItemOutput);
  const listCommands = useChatStore((state) => state.listCommands);
  const markConversationRead = useChatStore((state) => state.markConversationRead);
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
  const setConversationPinned = useChatStore((state) => state.setConversationPinned);
  const status = useChatStore((state) => state.status);
  const steerMessage = useChatStore((state) => state.steerMessage);
  const stopActiveRun = useChatStore((state) => state.stopActiveRun);
  const submitApproval = useChatStore((state) => state.submitApproval);
  const storeWorkspaceId = useChatStore((state) => state.workspaceId);
  const transcript = useChatStore((state) => state.transcript);
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

  const selectedConversationSummary =
    selectedConversation?.workspaceId === storeWorkspaceId
      ? conversations.find(
          (item) =>
            item.conversation.id === selectedConversation.id &&
            item.conversation.workspaceId === storeWorkspaceId,
        )
      : null;
  useEffect(() => {
    if (
      !selectedConversationSummary ||
      selectedConversationSummary.latestReadRelevantMarker <= selectedConversationSummary.readMarker
    ) {
      return;
    }
    void markConversationRead(selectedConversationSummary.conversation.id);
  }, [markConversationRead, selectedConversationSummary]);

  return {
    activeRun,
    commandListError,
    commandListStatus,
    conversations,
    corruption,
    createConversation,
    createWorkspaceConversation,
    deleteConversation,
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
    setConversationPinned,
    status,
    steerMessage,
    stopActiveRun,
    submitApproval,
    transcript,
    workspaceId: storeWorkspaceId,
  };
}
