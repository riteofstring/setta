import type { ConversationListItem, WorkspaceSummary } from "@generated/backend";
import { FolderOpen, MessageSquarePlus, Plus, Trash2, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { AccordionSection } from "./ui/accordion";
import { Button } from "./ui/button";

const activeWorkspaceRowHeight = 34;
const recentWorkspaceRowHeight = 36;
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
  renderItem: (workspace: WorkspaceSummary) => ReactNode;
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
  const otherWorkspaces = useMemo(
    () => activeWorkspaces.filter((workspace) => workspace.id !== selectedWorkspaceId),
    [activeWorkspaces, selectedWorkspaceId],
  );

  return (
    <aside className="flex min-h-0 w-full min-w-0 flex-col border-r border-zinc-800 bg-zinc-900 text-zinc-100">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 px-2">
        <h2 className="text-[11px] font-semibold tracking-normal text-zinc-500 uppercase">
          Projects
        </h2>
        <Button
          aria-label="Open workspace folder"
          className="h-6 border-transparent bg-transparent px-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          disabled={busy}
          onClick={() => void openLocalFolder()}
          title="Open workspace folder"
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-1.5 pb-2">
        <CurrentWorkspaceAccordion
          busy={busy}
          chatBusy={chatBusy}
          conversations={conversations}
          createConversation={createConversation}
          openLocalFolder={openLocalFolder}
          selectConversation={selectConversation}
          selectedConversationId={selectedConversationId}
          selectedWorkspace={selectedWorkspace}
        />
        <WorkspaceList
          busy={busy}
          closeWorkspace={closeWorkspace}
          selectWorkspace={selectWorkspace}
          visibleWorkspaces={otherWorkspaces}
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

function CurrentWorkspaceAccordion({
  busy,
  chatBusy,
  conversations,
  createConversation,
  openLocalFolder,
  selectConversation,
  selectedConversationId,
  selectedWorkspace,
}: {
  busy: boolean;
  chatBusy: boolean;
  conversations: ConversationListItem[];
  createConversation: (title?: string) => Promise<void>;
  openLocalFolder: () => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspace: WorkspaceSummary | null;
}) {
  if (!selectedWorkspace) {
    return (
      <AccordionSection defaultOpen title="Current project">
        <div className="py-1.5">
          <p className="text-xs text-zinc-500">No active workspaces</p>
          <Button
            className="mt-2 h-7 border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-100 hover:bg-zinc-700"
            disabled={busy}
            onClick={() => void openLocalFolder()}
            variant="primary"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Open
          </Button>
        </div>
      </AccordionSection>
    );
  }

  return (
    <AccordionSection
      className="shrink-0"
      defaultOpen
      key={selectedWorkspace.id}
      subtitle={selectedWorkspace.rootPath}
      title={selectedWorkspace.displayName}
    >
      <ProjectChatHistory
        busy={chatBusy}
        conversations={conversations}
        createConversation={createConversation}
        selectConversation={selectConversation}
        selectedConversationId={selectedConversationId}
      />
    </AccordionSection>
  );
}

function WorkspaceList({
  busy,
  closeWorkspace,
  selectWorkspace,
  visibleWorkspaces,
}: {
  busy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  visibleWorkspaces: WorkspaceSummary[];
}) {
  if (visibleWorkspaces.length === 0) {
    return null;
  }

  return (
    <AccordionSection
      className="min-h-0 shrink-0"
      contentClassName="min-h-0"
      defaultOpen
      title={`Other projects (${visibleWorkspaces.length})`}
    >
      <div
        className="overflow-hidden"
        aria-label="Projects"
        style={{ height: Math.min(128, visibleWorkspaces.length * activeWorkspaceRowHeight) }}
      >
        <VirtualWorkspaceList
          itemTestId="active-workspace-item"
          items={visibleWorkspaces}
          renderItem={(workspace) => (
            <ActiveWorkspaceRow
              busy={busy}
              closeWorkspace={closeWorkspace}
              selectWorkspace={selectWorkspace}
              workspace={workspace}
            />
          )}
          rowHeight={activeWorkspaceRowHeight}
          testId="active-workspace-list"
        />
      </div>
    </AccordionSection>
  );
}

function ActiveWorkspaceRow({
  busy,
  closeWorkspace,
  selectWorkspace,
  workspace,
}: {
  busy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  workspace: WorkspaceSummary;
}) {
  return (
    <div className="group grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded px-1 hover:bg-zinc-800/70">
      <button
        className="min-w-0 text-left"
        data-testid="active-workspace-select"
        disabled={busy}
        onClick={() => void selectWorkspace(workspace.id)}
        type="button"
      >
        <span className="block truncate text-xs font-medium text-zinc-300">
          {workspace.displayName}
        </span>
        <span className="block truncate text-[11px] leading-none text-zinc-600">
          {workspace.rootPath}
        </span>
      </button>
      <IconButton
        disabled={busy}
        label="Close workspace"
        onClick={() => void closeWorkspace(workspace.id)}
      >
        <X className="h-3.5 w-3.5" />
      </IconButton>
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
    <div className="min-w-0 pb-1">
      <div className="flex h-6 items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-600 uppercase">Chats</span>
        <IconButton disabled={busy} label="New chat" onClick={() => void createConversation()}>
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      {visibleConversations.length === 0 ? (
        <div className="flex min-h-12 items-center gap-2 text-xs text-zinc-500">
          <MessageSquarePlus className="h-4 w-4 shrink-0" />
          <span>No chats yet</span>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto" data-testid="conversation-list">
          {visibleConversations.map((item) => (
            <button
              className={cn(
                "mb-0.5 block w-full rounded px-1.5 py-1 text-left",
                item.conversation.id === selectedConversationId
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200",
              )}
              data-testid="conversation-list-item"
              disabled={busy}
              key={item.conversation.id}
              onClick={() => void selectConversation(item.conversation.id)}
              type="button"
            >
              <span className="block truncate text-xs font-medium">{item.conversation.title}</span>
              <span className="block text-[11px] leading-none opacity-60">
                {item.messageCount} messages
              </span>
            </button>
          ))}
          {visibleConversations.length < conversations.length ? (
            <Button
              className="mt-1 h-7 w-full border-transparent bg-transparent text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={() => setVisibleLimit((current) => current + chatHistoryLimit)}
              variant="secondary"
            >
              More chats
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
      <AccordionSection defaultOpen title="Recent">
        <p className="py-1.5 text-xs text-zinc-500">No recent workspaces</p>
      </AccordionSection>
    );
  }

  return (
    <AccordionSection
      className="flex min-h-0 flex-1 flex-col"
      contentClassName="min-h-0 flex-1"
      defaultOpen
      title="Recent"
    >
      <div className="h-full min-h-0 overflow-hidden" aria-label="Recent workspaces">
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
      </div>
    </AccordionSection>
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
    <div className="group grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded px-1 hover:bg-zinc-800/70">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-zinc-400">{workspace.displayName}</div>
        <div className="truncate text-[11px] leading-none text-zinc-600">{workspace.rootPath}</div>
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
      className="h-full min-h-0 overflow-y-auto"
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
              {renderItem(workspace)}
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
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 opacity-70 hover:bg-zinc-800 hover:text-zinc-100 hover:opacity-100 disabled:pointer-events-none disabled:opacity-20"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
