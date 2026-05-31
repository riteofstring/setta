import type { ConversationListItem, Run, WorkspaceSummary } from "@generated/backend";
import {
  Circle,
  Clock3,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  PenLine,
  Plug,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/utils";

const activeWorkspaceRowHeight = 28;
const recentWorkspaceRowHeight = 28;
const chatHistoryLimit = 80;
const directProjectRenderLimit = 120;
const workspaceListOverscan = 6;

interface WorkspaceSidebarProps {
  activeRun: Run | null;
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
  activeRun,
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
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState(selectedWorkspaceId);
  const activeWorkspaceIds = useMemo(
    () => new Set(activeWorkspaces.map((workspace) => workspace.id)),
    [activeWorkspaces],
  );
  const inactiveRecentWorkspaces = useMemo(
    () => recentWorkspaces.filter((workspace) => !activeWorkspaceIds.has(workspace.id)),
    [activeWorkspaceIds, recentWorkspaces],
  );

  useEffect(() => {
    if (selectedWorkspaceId) {
      setExpandedWorkspaceId(selectedWorkspaceId);
    }
  }, [selectedWorkspaceId]);

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col bg-zinc-900 pt-10 text-zinc-100">
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        <SidebarNav busy={busy || chatBusy} createConversation={createConversation} />
        <section className="mt-4 min-w-0">
          <ProjectHeading busy={busy} openLocalFolder={openLocalFolder} />
          {activeWorkspaces.length === 0 && inactiveRecentWorkspaces.length === 0 ? (
            <p className="px-2 py-1 text-xs text-zinc-500">No projects</p>
          ) : null}
          <ProjectList
            activeRun={activeRun}
            busy={busy}
            chatBusy={chatBusy}
            closeWorkspace={closeWorkspace}
            conversations={conversations}
            expandedWorkspaceId={expandedWorkspaceId}
            selectConversation={selectConversation}
            selectWorkspace={selectWorkspace}
            selectedConversationId={selectedConversationId}
            selectedWorkspaceId={selectedWorkspaceId}
            setExpandedWorkspaceId={setExpandedWorkspaceId}
            workspaces={activeWorkspaces}
          />
          <RecentProjectList
            busy={busy}
            recentWorkspaces={inactiveRecentWorkspaces}
            removeRecent={removeRecent}
          />
        </section>
      </div>
    </aside>
  );
}

function SidebarNav({
  busy,
  createConversation,
}: {
  busy: boolean;
  createConversation: (title?: string) => Promise<void>;
}) {
  return (
    <nav className="grid gap-0.5" aria-label="Primary">
      <SidebarNavButton
        disabled={busy}
        icon={<PenLine className="h-3.5 w-3.5" />}
        label="New chat"
        onClick={() => void createConversation()}
      />
      <SidebarNavButton icon={<Plug className="h-3.5 w-3.5" />} label="Plugins" />
      <SidebarNavButton icon={<Clock3 className="h-3.5 w-3.5" />} label="Automations" />
    </nav>
  );
}

function SidebarNavButton({
  disabled = false,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="flex h-7 w-full min-w-0 items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="shrink-0 text-zinc-300">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function ProjectHeading({
  busy,
  openLocalFolder,
}: {
  busy: boolean;
  openLocalFolder: () => Promise<void>;
}) {
  return (
    <div className="flex h-7 items-center justify-between gap-2 px-2 pb-1">
      <h2 className="text-xs font-medium text-zinc-500">Projects</h2>
      <button
        aria-label="Open project folder"
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
        disabled={busy}
        onClick={() => void openLocalFolder()}
        title="Open project folder"
        type="button"
      >
        <FolderPlus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ProjectList({
  activeRun,
  busy,
  chatBusy,
  closeWorkspace,
  conversations,
  expandedWorkspaceId,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspaceId,
  setExpandedWorkspaceId,
  workspaces,
}: {
  activeRun: Run | null;
  busy: boolean;
  chatBusy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  conversations: ConversationListItem[];
  expandedWorkspaceId: string;
  selectConversation: (conversationId: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspaceId: string;
  setExpandedWorkspaceId: (next: string) => void;
  workspaces: WorkspaceSummary[];
}) {
  if (workspaces.length === 0) {
    return null;
  }

  const renderProject = (workspace: WorkspaceSummary) => (
    <ProjectWithChats
      activeRun={activeRun}
      busy={busy}
      chatBusy={chatBusy}
      closeWorkspace={closeWorkspace}
      conversations={conversations}
      expanded={expandedWorkspaceId === workspace.id}
      selectConversation={selectConversation}
      selectWorkspace={selectWorkspace}
      selected={workspace.id === selectedWorkspaceId}
      selectedConversationId={selectedConversationId}
      setExpandedWorkspaceId={setExpandedWorkspaceId}
      workspace={workspace}
    />
  );

  if (workspaces.length > directProjectRenderLimit) {
    const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
    return (
      <>
        <div
          className="h-52 overflow-hidden"
          aria-label="Projects"
          data-testid="active-workspace-list"
        >
          <VirtualWorkspaceList
            itemTestId="active-workspace-item"
            items={workspaces}
            renderItem={(workspace) => (
              <ProjectRow
                busy={busy}
                closeWorkspace={closeWorkspace}
                expanded={expandedWorkspaceId === workspace.id}
                selectWorkspace={selectWorkspace}
                selected={workspace.id === selectedWorkspaceId}
                setExpandedWorkspaceId={setExpandedWorkspaceId}
                workspace={workspace}
              />
            )}
            rowHeight={activeWorkspaceRowHeight}
            testId="active-workspace-list-virtual"
          />
        </div>
        {selectedWorkspace && expandedWorkspaceId === selectedWorkspace.id ? (
          <ProjectChats
            activeRun={activeRun}
            busy={chatBusy}
            conversations={conversations}
            selectConversation={selectConversation}
            selectedConversationId={selectedConversationId}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="grid" aria-label="Projects" data-testid="active-workspace-list">
      {workspaces.map((workspace) => (
        <div data-testid="active-workspace-item" key={workspace.id}>
          {renderProject(workspace)}
        </div>
      ))}
    </div>
  );
}

function ProjectWithChats({
  activeRun,
  busy,
  chatBusy,
  closeWorkspace,
  conversations,
  expanded,
  selectConversation,
  selectWorkspace,
  selected,
  selectedConversationId,
  setExpandedWorkspaceId,
  workspace,
}: {
  activeRun: Run | null;
  busy: boolean;
  chatBusy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  conversations: ConversationListItem[];
  expanded: boolean;
  selectConversation: (conversationId: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selected: boolean;
  selectedConversationId: string;
  setExpandedWorkspaceId: (next: string) => void;
  workspace: WorkspaceSummary;
}) {
  return (
    <div className="min-w-0">
      <ProjectRow
        busy={busy}
        closeWorkspace={closeWorkspace}
        expanded={expanded}
        selectWorkspace={selectWorkspace}
        selected={selected}
        setExpandedWorkspaceId={setExpandedWorkspaceId}
        workspace={workspace}
      />
      {expanded && selected ? (
        <ProjectChats
          activeRun={activeRun}
          busy={chatBusy}
          conversations={conversations}
          selectConversation={selectConversation}
          selectedConversationId={selectedConversationId}
        />
      ) : null}
    </div>
  );
}

function ProjectRow({
  busy,
  closeWorkspace,
  expanded,
  selectWorkspace,
  selected,
  setExpandedWorkspaceId,
  workspace,
}: {
  busy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  expanded: boolean;
  selectWorkspace: (id: string) => Promise<void>;
  selected: boolean;
  setExpandedWorkspaceId: (next: string) => void;
  workspace: WorkspaceSummary;
}) {
  return (
    <div className="group grid h-7 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center rounded-sm hover:bg-zinc-800/60">
      <button
        className="flex min-w-0 items-center gap-2 px-2 text-left"
        data-testid="active-workspace-select"
        disabled={busy}
        onClick={() => {
          setExpandedWorkspaceId(expanded ? "" : workspace.id);
          if (!selected) {
            void selectWorkspace(workspace.id);
          }
        }}
        title={workspace.rootPath}
        type="button"
      >
        {expanded ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
        ) : (
          <FolderClosed className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
        )}
        <span
          className={cn(
            "truncate text-xs",
            selected ? "font-medium text-zinc-100" : "text-zinc-400",
          )}
        >
          {workspace.displayName}
        </span>
      </button>
      <IconButton
        className="mr-0.5 opacity-0 group-hover:opacity-100"
        disabled={busy}
        label="Close workspace"
        onClick={() => void closeWorkspace(workspace.id)}
      >
        <X className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}

function ProjectChats({
  activeRun,
  busy,
  conversations,
  selectConversation,
  selectedConversationId,
}: {
  activeRun: Run | null;
  busy: boolean;
  conversations: ConversationListItem[];
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

  if (visibleConversations.length === 0) {
    return <div className="py-1 pr-1 pl-7 text-xs text-zinc-600">No chats</div>;
  }

  return (
    <div className="grid py-0.5 pr-0.5 pl-6" data-testid="conversation-list">
      {visibleConversations.map((item) => (
        <ConversationRow
          activeRun={activeRun}
          busy={busy}
          item={item}
          key={item.conversation.id}
          selectConversation={selectConversation}
          selected={item.conversation.id === selectedConversationId}
        />
      ))}
      {visibleConversations.length < conversations.length ? (
        <button
          className="h-6 rounded-sm px-2 text-left text-xs text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200"
          onClick={() => setVisibleLimit((current) => current + chatHistoryLimit)}
          type="button"
        >
          More chats
        </button>
      ) : null}
    </div>
  );
}

function ConversationRow({
  activeRun,
  busy,
  item,
  selectConversation,
  selected,
}: {
  activeRun: Run | null;
  busy: boolean;
  item: ConversationListItem;
  selectConversation: (conversationId: string) => Promise<void>;
  selected: boolean;
}) {
  const running =
    item.activeRunId !== "" ||
    (activeRun?.conversationId === item.conversation.id &&
      (activeRun.status === "queued" || activeRun.status === "running"));

  return (
    <button
      className={cn(
        "grid h-7 w-full min-w-0 grid-cols-[10px_minmax(0,1fr)] items-center gap-1.5 rounded-sm px-2 text-left hover:bg-zinc-800/70 hover:text-zinc-100",
        selected ? "text-zinc-100" : "text-zinc-300",
      )}
      data-testid="conversation-list-item"
      disabled={busy}
      onClick={() => void selectConversation(item.conversation.id)}
      type="button"
    >
      {running ? (
        <LoaderCircle className="h-3 w-3 animate-spin text-zinc-300" />
      ) : (
        <Circle className="h-1.5 w-1.5 fill-zinc-500 text-zinc-500" />
      )}
      <span className="truncate text-xs">{item.conversation.title}</span>
    </button>
  );
}

function RecentProjectList({
  busy,
  recentWorkspaces,
  removeRecent,
}: {
  busy: boolean;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
}) {
  if (recentWorkspaces.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 h-36 min-h-0 overflow-hidden" aria-label="Recent projects">
      <VirtualWorkspaceList
        itemTestId="recent-workspace-item"
        items={recentWorkspaces}
        renderItem={(workspace) => (
          <RecentWorkspaceRow busy={busy} removeRecent={removeRecent} workspace={workspace} />
        )}
        rowHeight={recentWorkspaceRowHeight}
        testId="recent-workspace-list"
      />
    </div>
  );
}

function RecentWorkspaceRow({
  busy,
  removeRecent,
  workspace,
}: {
  busy: boolean;
  removeRecent: (id: string) => Promise<void>;
  workspace: WorkspaceSummary;
}) {
  return (
    <div className="group grid h-7 grid-cols-[minmax(0,1fr)_auto] items-center rounded-sm hover:bg-zinc-800/60">
      <div className="flex min-w-0 items-center gap-2 px-2">
        <Workflow className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="truncate text-xs text-zinc-500">{workspace.displayName}</span>
      </div>
      <IconButton
        className="mr-0.5 opacity-0 group-hover:opacity-100"
        disabled={busy}
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
  className,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-20",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
