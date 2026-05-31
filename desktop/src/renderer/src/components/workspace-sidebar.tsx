import type { ConversationListItem, WorkspaceSummary } from "@generated/backend";
import { ArrowDown, ArrowUp, FolderOpen, MessageSquarePlus, Plus, Trash2, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const activeWorkspaceRowHeight = 46;
const recentWorkspaceRowHeight = 48;
const chatHistoryLimit = 80;
const workspaceListOverscan = 6;

interface WorkspaceSidebarProps {
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  chatBusy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  conversations: ConversationListItem[];
  createConversation: (title?: string) => Promise<void>;
  openLocalFolder: () => Promise<void>;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspaceId: string;
}

interface VirtualRange {
  end: number;
  start: number;
}

interface VirtualWorkspaceListProps {
  itemTestId: string;
  items: WorkspaceSummary[];
  renderItem: (workspace: WorkspaceSummary, index: number) => ReactNode;
  rowHeight: number;
  testId: string;
}

export function WorkspaceSidebar({
  activeWorkspaces,
  busy,
  chatBusy,
  closeWorkspace,
  conversations,
  createConversation,
  openLocalFolder,
  recentWorkspaces,
  removeRecent,
  reorderWorkspaces,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspaceId,
}: WorkspaceSidebarProps) {
  const activeWorkspaceIds = useMemo(
    () => new Set(activeWorkspaces.map((workspace) => workspace.id)),
    [activeWorkspaces],
  );
  const selectedWorkspace = useMemo(
    () => activeWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [activeWorkspaces, selectedWorkspaceId],
  );
  const collapsedWorkspaces = useMemo(
    () => activeWorkspaces.filter((workspace) => workspace.id !== selectedWorkspaceId),
    [activeWorkspaces, selectedWorkspaceId],
  );

  return (
    <aside className="flex min-h-0 w-full min-w-0 flex-col border-r border-zinc-800 bg-zinc-900 text-zinc-100">
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-normal text-zinc-400">
            Projects
          </h2>
          <Button
            aria-label="Open workspace folder"
            className="h-7 border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-100 hover:bg-zinc-700"
            disabled={busy}
            onClick={() => void openLocalFolder()}
            title="Open workspace folder"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
        <SelectedProject
          busy={busy}
          chatBusy={chatBusy}
          closeWorkspace={closeWorkspace}
          conversations={conversations}
          createConversation={createConversation}
          openLocalFolder={openLocalFolder}
          reorderWorkspaces={reorderWorkspaces}
          selectConversation={selectConversation}
          selectWorkspace={selectWorkspace}
          selectedConversationId={selectedConversationId}
          selectedWorkspace={selectedWorkspace}
          workspaces={activeWorkspaces}
        />
        <WorkspaceList
          activeWorkspaces={activeWorkspaces}
          busy={busy}
          closeWorkspace={closeWorkspace}
          reorderWorkspaces={reorderWorkspaces}
          selectWorkspace={selectWorkspace}
          visibleWorkspaces={collapsedWorkspaces}
        />
        <RecentWorkspaceList
          activeWorkspaceIds={activeWorkspaceIds}
          busy={busy}
          recentWorkspaces={recentWorkspaces}
          removeRecent={removeRecent}
        />
      </div>
    </aside>
  );
}

function SelectedProject({
  busy,
  chatBusy,
  closeWorkspace,
  conversations,
  createConversation,
  openLocalFolder,
  reorderWorkspaces,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspace,
  workspaces,
}: {
  busy: boolean;
  chatBusy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  conversations: ConversationListItem[];
  createConversation: (title?: string) => Promise<void>;
  openLocalFolder: () => Promise<void>;
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspace: WorkspaceSummary | null;
  workspaces: WorkspaceSummary[];
}) {
  if (!selectedWorkspace) {
    return (
      <section className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
        <p className="text-sm text-zinc-500">No active workspaces</p>
        <Button
          className="mt-3 border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          disabled={busy}
          onClick={() => void openLocalFolder()}
          variant="primary"
        >
          <FolderOpen className="h-4 w-4" />
          Open
        </Button>
      </section>
    );
  }

  const index = workspaces.findIndex((workspace) => workspace.id === selectedWorkspace.id);

  return (
    <section className="flex min-h-[200px] flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
      <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-zinc-800 px-2 py-2">
        <button
          className="min-w-0 text-left"
          disabled={busy}
          onClick={() => void selectWorkspace(selectedWorkspace.id)}
          type="button"
        >
          <span className="block truncate text-sm font-medium text-zinc-100">
            {selectedWorkspace.displayName}
          </span>
          <span className="mt-0.5 block truncate text-xs text-zinc-500">
            {selectedWorkspace.rootPath}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <IconButton
            disabled={busy || index <= 0}
            label="Move workspace up"
            onClick={() => void moveWorkspace(workspaces, index, -1, reorderWorkspaces)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            disabled={busy || index === workspaces.length - 1}
            label="Move workspace down"
            onClick={() => void moveWorkspace(workspaces, index, 1, reorderWorkspaces)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            disabled={busy}
            label="Close workspace"
            onClick={() => void closeWorkspace(selectedWorkspace.id)}
          >
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
      <ProjectChatHistory
        busy={chatBusy}
        conversations={conversations}
        createConversation={createConversation}
        selectConversation={selectConversation}
        selectedConversationId={selectedConversationId}
      />
    </section>
  );
}

function WorkspaceList({
  activeWorkspaces,
  busy,
  closeWorkspace,
  reorderWorkspaces,
  selectWorkspace,
  visibleWorkspaces,
}: {
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  visibleWorkspaces: WorkspaceSummary[];
}) {
  if (visibleWorkspaces.length === 0) {
    return null;
  }

  return (
    <section className="flex min-h-0 max-h-36 flex-col overflow-hidden" aria-label="Projects">
      <VirtualWorkspaceList
        itemTestId="active-workspace-item"
        items={visibleWorkspaces}
        renderItem={(workspace) => {
          const index = activeWorkspaces.findIndex((item) => item.id === workspace.id);
          return (
            <ActiveWorkspaceRow
              activeWorkspaces={activeWorkspaces}
              busy={busy}
              closeWorkspace={closeWorkspace}
              index={index}
              reorderWorkspaces={reorderWorkspaces}
              selectWorkspace={selectWorkspace}
              workspace={workspace}
            />
          );
        }}
        rowHeight={activeWorkspaceRowHeight}
        testId="active-workspace-list"
      />
    </section>
  );
}

function ActiveWorkspaceRow({
  activeWorkspaces,
  busy,
  closeWorkspace,
  index,
  reorderWorkspaces,
  selectWorkspace,
  workspace,
}: {
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  index: number;
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  workspace: WorkspaceSummary;
}) {
  return (
    <div className="grid h-[40px] grid-cols-[1fr_auto] gap-1 rounded-md border border-transparent bg-zinc-950 px-2 py-1 hover:border-zinc-700">
      <button
        className="min-w-0 text-left"
        data-testid="active-workspace-select"
        disabled={busy}
        onClick={() => void selectWorkspace(workspace.id)}
      >
        <span className="block truncate text-sm font-medium text-zinc-100">
          {workspace.displayName}
        </span>
        <span className="mt-0.5 block truncate text-xs text-zinc-500">{workspace.rootPath}</span>
      </button>
      <div className="flex items-center gap-1">
        <IconButton
          disabled={busy || index <= 0}
          label="Move workspace up"
          onClick={() => void moveWorkspace(activeWorkspaces, index, -1, reorderWorkspaces)}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          disabled={busy || index < 0 || index === activeWorkspaces.length - 1}
          label="Move workspace down"
          onClick={() => void moveWorkspace(activeWorkspaces, index, 1, reorderWorkspaces)}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          disabled={busy}
          label="Close workspace"
          onClick={() => void closeWorkspace(workspace.id)}
        >
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

function ProjectChatHistory({
  busy,
  conversations,
  createConversation,
  selectConversation,
  selectedConversationId,
}: {
  busy: boolean;
  conversations: ConversationListItem[];
  createConversation: (title?: string) => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  selectedConversationId: string;
}) {
  const [visibleLimit, setVisibleLimit] = useState(chatHistoryLimit);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <h3 className="text-xs font-semibold uppercase tracking-normal text-zinc-600">
          Chat history
        </h3>
        <IconButton disabled={busy} label="New chat" onClick={() => void createConversation()}>
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      {visibleConversations.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center px-3 text-center text-sm text-zinc-500">
          <div>
            <MessageSquarePlus className="mx-auto mb-2 h-5 w-5" />
            No chats yet
          </div>
        </div>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5"
          data-testid="conversation-list"
        >
          {visibleConversations.map((item) => (
            <button
              className={cn(
                "mb-1 block w-full rounded-md border px-2 py-1.5 text-left",
                item.conversation.id === selectedConversationId
                  ? "border-zinc-500 bg-zinc-800 text-white"
                  : "border-transparent bg-zinc-950 text-zinc-300 hover:border-zinc-700",
              )}
              data-testid="conversation-list-item"
              disabled={busy}
              key={item.conversation.id}
              onClick={() => void selectConversation(item.conversation.id)}
              type="button"
            >
              <span className="block truncate text-xs font-medium">{item.conversation.title}</span>
              <span className="mt-1 block text-xs opacity-70">{item.messageCount} messages</span>
            </button>
          ))}
          {visibleConversations.length < conversations.length ? (
            <Button
              className="mt-2 w-full"
              onClick={() => setVisibleLimit((current) => current + chatHistoryLimit)}
              variant="secondary"
            >
              More Chats
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RecentWorkspaceList({
  activeWorkspaceIds,
  busy,
  recentWorkspaces,
  removeRecent,
}: {
  activeWorkspaceIds: Set<string>;
  busy: boolean;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
}) {
  if (recentWorkspaces.length === 0) {
    return (
      <section className="min-h-0">
        <h3 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Recent</h3>
        <p className="mt-2 text-xs text-zinc-500">No recent workspaces</p>
      </section>
    );
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Recent workspaces"
    >
      <h3 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Recent</h3>
      <VirtualWorkspaceList
        itemTestId="recent-workspace-item"
        items={recentWorkspaces}
        renderItem={(workspace) => (
          <RecentWorkspaceRow
            active={activeWorkspaceIds.has(workspace.id)}
            busy={busy}
            removeRecent={removeRecent}
            workspace={workspace}
          />
        )}
        rowHeight={recentWorkspaceRowHeight}
        testId="recent-workspace-list"
      />
    </section>
  );
}

function RecentWorkspaceRow({
  active,
  busy,
  removeRecent,
  workspace,
}: {
  active: boolean;
  busy: boolean;
  removeRecent: (id: string) => Promise<void>;
  workspace: WorkspaceSummary;
}) {
  return (
    <div className="grid h-[42px] grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-1">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-zinc-300">{workspace.displayName}</div>
        <div className="truncate text-xs text-zinc-500">{workspace.rootPath}</div>
      </div>
      <IconButton
        disabled={busy || active}
        label="Remove recent workspace"
        onClick={() => void removeRecent(workspace.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}

function VirtualWorkspaceList({
  itemTestId,
  items,
  renderItem,
  rowHeight,
  testId,
}: VirtualWorkspaceListProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const range = virtualRange({
    itemCount: items.length,
    overscan: workspaceListOverscan,
    rowHeight,
    scrollTop,
    viewportHeight,
  });
  const visibleItems = items.slice(range.start, range.end);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const updateHeight = () => {
      setViewportHeight(viewport.clientHeight);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={viewportRef}
      className="mt-2 min-h-0 flex-1 basis-0 overflow-y-auto"
      data-testid={testId}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <ul className="relative" style={virtualListStyle(items.length, rowHeight)}>
        {visibleItems.map((workspace, offset) => {
          const index = range.start + offset;
          return (
            <li
              className="absolute left-0 w-full"
              data-testid={itemTestId}
              key={workspace.id}
              style={virtualRowStyle(index, rowHeight)}
            >
              {renderItem(workspace, index)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function virtualRange({
  itemCount,
  overscan,
  rowHeight,
  scrollTop,
  viewportHeight,
}: {
  itemCount: number;
  overscan: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
}): VirtualRange {
  if (itemCount === 0) {
    return { end: 0, start: 0 };
  }
  const visibleStart = Math.floor(scrollTop / rowHeight);
  const visibleEnd = Math.ceil((scrollTop + viewportHeight) / rowHeight);
  const start = Math.max(0, visibleStart - overscan);
  const end = Math.min(itemCount, Math.max(visibleEnd + overscan, start + 1));
  return { end, start };
}

function virtualListStyle(itemCount: number, rowHeight: number): CSSProperties {
  return { height: itemCount * rowHeight };
}

function virtualRowStyle(index: number, rowHeight: number): CSSProperties {
  return {
    height: rowHeight,
    transform: `translateY(${index * rowHeight}px)`,
  };
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function moveWorkspace(
  activeWorkspaces: WorkspaceSummary[],
  index: number,
  direction: -1 | 1,
  reorderWorkspaces: (ids: string[]) => Promise<void>,
) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= activeWorkspaces.length) {
    return;
  }
  const ids = activeWorkspaces.map((workspace) => workspace.id);
  const currentID = ids[index];
  const targetID = ids[targetIndex];
  if (currentID === undefined || targetID === undefined) {
    return;
  }
  ids[index] = targetID;
  ids[targetIndex] = currentID;
  void reorderWorkspaces(ids);
}
