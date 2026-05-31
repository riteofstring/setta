import type { ConversationListItem, Run, WorkspaceSummary } from "@generated/backend";
import {
  Archive,
  BookOpen,
  Circle,
  Clock3,
  Database,
  Ellipsis,
  FileText,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitFork,
  LoaderCircle,
  MessageSquarePlus,
  PenLine,
  Pencil,
  Pin,
  Plug,
  Search,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type WorkspaceGitState, useWorkspaceGitInfo } from "../hooks/use-workspace-git-info";
import { cn } from "../lib/utils";

const activeWorkspaceRowHeight = 28;
const recentWorkspaceRowHeight = 28;
const chatHistoryLimit = 80;
const directProjectRenderLimit = 120;
const projectMenuHeight = 200;
const projectMenuInset = 8;
const projectMenuWidth = 224;
const workspaceListOverscan = 6;

interface WorkspaceSidebarProps {
  activeRun: Run | null;
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  chromeInsetTop?: boolean;
  chatBusy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  conversations: ConversationListItem[];
  createConversation: (title?: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  openLocalFolder: () => Promise<void>;
  openSearch: () => void;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspaceId: string;
  sidebarWidth?: number;
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
  chromeInsetTop = false,
  chatBusy,
  closeWorkspace,
  conversations,
  createConversation,
  createWorkspaceConversation,
  openLocalFolder,
  openSearch,
  recentWorkspaces,
  removeRecent,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspaceId,
  sidebarWidth = 220,
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
  const selectedWorkspace =
    activeWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const selectedGit = useWorkspaceGitInfo(selectedWorkspace?.rootPath ?? null);
  const selectedBranchLabel = branchHoverLabel(selectedGit);

  useEffect(() => {
    if (selectedWorkspaceId) {
      setExpandedWorkspaceId(selectedWorkspaceId);
    }
  }, [selectedWorkspaceId]);

  return (
    <aside
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-[#202124] text-zinc-100"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <div
        className={cn("min-h-0 flex-1 overflow-y-auto px-1 pb-3", chromeInsetClass(chromeInsetTop))}
      >
        <SidebarNav
          busy={busy || chatBusy}
          createConversation={createConversation}
          hasWorkspace={selectedWorkspaceId !== ""}
          openSearch={openSearch}
        />
        <section className="mt-4 min-w-0">
          <ProjectHeading busy={busy} openLocalFolder={openLocalFolder} />
          {activeWorkspaces.length === 0 && inactiveRecentWorkspaces.length === 0 ? (
            <p className="px-2 py-1 text-xs text-zinc-500">No projects</p>
          ) : null}
          <ProjectList
            activeRun={activeRun}
            branchLabel={selectedBranchLabel}
            busy={busy}
            chatBusy={chatBusy}
            closeWorkspace={closeWorkspace}
            conversations={conversations}
            createWorkspaceConversation={createWorkspaceConversation}
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
        <UnorganizedChatsSection />
        <NotesSection />
        <MemoryIntegrationsSection />
      </div>
    </aside>
  );
}

function chromeInsetClass(enabled: boolean) {
  return enabled ? "pt-9" : "";
}

function SidebarNav({
  busy,
  createConversation,
  hasWorkspace,
  openSearch,
}: {
  busy: boolean;
  createConversation: (title?: string) => Promise<void>;
  hasWorkspace: boolean;
  openSearch: () => void;
}) {
  return (
    <nav className="grid gap-0.5" aria-label="Primary">
      <SidebarNavButton
        disabled={busy || !hasWorkspace}
        icon={<PenLine className="h-3.5 w-3.5" />}
        label="New chat"
        onClick={() => void createConversation()}
      />
      <SidebarNavButton
        icon={<Search className="h-3.5 w-3.5" />}
        label="Search"
        onClick={openSearch}
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
  branchLabel,
  busy,
  chatBusy,
  closeWorkspace,
  conversations,
  createWorkspaceConversation,
  expandedWorkspaceId,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspaceId,
  setExpandedWorkspaceId,
  workspaces,
}: {
  activeRun: Run | null;
  branchLabel: string;
  busy: boolean;
  chatBusy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  conversations: ConversationListItem[];
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
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

  const renderProject = (workspace: WorkspaceSummary, allowProjectChats: boolean) => (
    <ProjectRow
      activeRun={activeRun}
      allowProjectChats={allowProjectChats}
      branchLabel={branchLabel}
      busy={busy}
      chatBusy={chatBusy}
      closeWorkspace={closeWorkspace}
      conversations={conversations}
      createWorkspaceConversation={createWorkspaceConversation}
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
    return (
      <div
        className="h-52 overflow-hidden"
        aria-label="Projects"
        data-testid="active-workspace-list"
      >
        <VirtualWorkspaceList
          itemTestId="active-workspace-item"
          items={workspaces}
          renderItem={(workspace) => renderProject(workspace, false)}
          rowHeight={activeWorkspaceRowHeight}
          testId="active-workspace-list-virtual"
        />
      </div>
    );
  }

  return (
    <div className="grid" aria-label="Projects" data-testid="active-workspace-list">
      {workspaces.map((workspace) => (
        <div data-testid="active-workspace-item" key={workspace.id}>
          {renderProject(workspace, true)}
        </div>
      ))}
    </div>
  );
}

function ProjectRow({
  activeRun,
  allowProjectChats,
  branchLabel,
  busy,
  chatBusy,
  closeWorkspace,
  conversations,
  createWorkspaceConversation,
  expanded,
  selectConversation,
  selectWorkspace,
  selected,
  selectedConversationId,
  setExpandedWorkspaceId,
  workspace,
}: {
  activeRun: Run | null;
  allowProjectChats: boolean;
  branchLabel: string;
  busy: boolean;
  chatBusy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  conversations: ConversationListItem[];
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  expanded: boolean;
  selectConversation: (conversationId: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selected: boolean;
  selectedConversationId: string;
  setExpandedWorkspaceId: (next: string) => void;
  workspace: WorkspaceSummary;
}) {
  const hasVisibleChats = allowProjectChats && selected && expanded;
  const rowBusy = busy || chatBusy;

  async function createProjectConversation() {
    setExpandedWorkspaceId(workspace.id);
    if (!selected) {
      await selectWorkspace(workspace.id);
    }
    await createWorkspaceConversation(workspace.id);
  }

  return (
    <div className="min-w-0">
      <div className="group grid h-7 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center rounded-sm hover:bg-zinc-800/55">
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
        <div className="mr-0.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <IconButton
            disabled={rowBusy}
            label={`New chat in ${workspace.displayName}`}
            onClick={() => void createProjectConversation()}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </IconButton>
          <ProjectMoreMenu busy={busy} closeWorkspace={closeWorkspace} workspace={workspace} />
        </div>
      </div>
      {hasVisibleChats ? (
        <div className="ml-5 min-w-0">
          <ConversationList
            activeRun={activeRun}
            branchLabel={branchLabel}
            busy={chatBusy}
            conversations={conversations}
            selectConversation={selectConversation}
            selectedConversationId={selectedConversationId}
          />
        </div>
      ) : null}
    </div>
  );
}

function ProjectMoreMenu({
  busy,
  closeWorkspace,
  workspace,
}: {
  busy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  workspace: WorkspaceSummary;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    left: projectMenuInset,
    top: projectMenuInset,
  });
  const menuRef = useRef<HTMLDivElement | null>(null);

  function updateMenuPosition() {
    const anchor = menuRef.current?.getBoundingClientRect();
    if (!anchor) {
      return;
    }
    const maxLeft = Math.max(
      projectMenuInset,
      window.innerWidth - projectMenuWidth - projectMenuInset,
    );
    setMenuPosition({
      left: Math.min(Math.max(projectMenuInset, anchor.right - projectMenuWidth), maxLeft),
      top: Math.min(
        anchor.bottom + 4,
        Math.max(projectMenuInset, window.innerHeight - projectMenuHeight - projectMenuInset),
      ),
    });
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    updateMenuPosition();

    function closeOnOutsidePress(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function repositionMenu() {
      updateMenuPosition();
    }

    window.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", repositionMenu);
    window.addEventListener("scroll", repositionMenu, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", repositionMenu);
      window.removeEventListener("scroll", repositionMenu, true);
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <div ref={menuRef} className="relative">
      <IconButton
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={busy}
        label={`More options for ${workspace.displayName}`}
        onClick={() => {
          if (!open) {
            updateMenuPosition();
          }
          setOpen((current) => !current);
        }}
      >
        <Ellipsis className="h-3.5 w-3.5" />
      </IconButton>
      {open ? (
        <div
          className="fixed z-50 w-56 rounded-sm border border-zinc-700/80 bg-zinc-900/95 p-1 shadow-2xl shadow-zinc-950/50 backdrop-blur"
          role="menu"
          style={menuPosition}
        >
          <ProjectMenuItem
            icon={<Pin className="h-4 w-4" />}
            label="Pin project"
            onClick={closeMenu}
          />
          <ProjectMenuItem
            icon={<FolderOpen className="h-4 w-4" />}
            label="Open in Finder"
            onClick={closeMenu}
          />
          <ProjectMenuItem
            icon={<GitFork className="h-4 w-4" />}
            label="Create permanent worktree"
            onClick={closeMenu}
          />
          <ProjectMenuItem
            icon={<Pencil className="h-4 w-4" />}
            label="Rename project"
            onClick={closeMenu}
          />
          <ProjectMenuItem
            icon={<Archive className="h-4 w-4" />}
            label="Archive chats"
            onClick={closeMenu}
          />
          <ProjectMenuItem
            icon={<X className="h-4 w-4" />}
            label="Remove"
            onClick={() => {
              setOpen(false);
              void closeWorkspace(workspace.id);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function ProjectMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50"
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <span className="shrink-0 text-zinc-400">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function UnorganizedChatsSection() {
  return (
    <section className="mt-3 min-w-0" data-testid="standalone-chat-section">
      <div className="flex h-7 items-center justify-between gap-2 px-2 pb-1">
        <h2 className="text-xs font-medium text-zinc-500">Chats</h2>
        <button
          aria-label="New unorganized chat"
          className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-zinc-600 disabled:pointer-events-none"
          disabled
          title="Unorganized chats are not available yet"
          type="button"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-2 py-1 text-xs text-zinc-600">No unorganized chats</div>
    </section>
  );
}

// Notes are app-local Markdown documents for now. Keep the boundary narrow so a
// future Markdown/WYSIWYG editor can replace the empty state without changing
// project chat or external memory integration contracts.
function NotesSection() {
  return (
    <section className="mt-3 min-w-0" data-testid="notes-section">
      <div className="flex h-7 items-center justify-between gap-2 px-2 pb-1">
        <h2 className="text-xs font-medium text-zinc-500">Notes</h2>
        <button
          aria-label="New Markdown note"
          className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-zinc-600 disabled:pointer-events-none"
          disabled
          title="Markdown notes are not available yet"
          type="button"
        >
          <PenLine className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-2 py-1 text-xs text-zinc-600">No Markdown notes</div>
    </section>
  );
}

// External memories should be provider-backed later: local folders, Obsidian
// vaults/libraries, qmd stores, cognee graphs, or other richer memory systems.
function MemoryIntegrationsSection() {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-3 min-w-0" data-testid="memory-integrations-section">
      <button
        className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-400 hover:bg-zinc-800/55 hover:text-zinc-100"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Database className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="min-w-0 flex-1 truncate font-medium">DB / Memories</span>
        <span className="text-[11px] text-zinc-600">Integrations</span>
      </button>
      <MemoryIntegrationsModal onOpenChange={setOpen} open={open} />
    </section>
  );
}

function MemoryIntegrationsModal({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/35 px-3 pt-12"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
      role="presentation"
    >
      <div
        aria-label="Memory integrations"
        className="mx-auto w-full max-w-sm overflow-hidden rounded-sm border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-xl shadow-black/40"
        role="dialog"
      >
        <div className="flex h-8 items-center justify-between border-b border-zinc-800 px-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Database className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <h2 className="truncate text-xs font-medium">DB / Memories</h2>
          </div>
          <button
            aria-label="Close memory integrations"
            className="grid h-5 w-5 place-items-center rounded-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid gap-0.5 p-1">
          <MemoryIntegrationOption
            description="Markdown and QMD files"
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            label="Folder"
          />
          <MemoryIntegrationOption
            description="Vault or library"
            icon={<BookOpen className="h-3.5 w-3.5" />}
            label="Obsidian"
          />
          <MemoryIntegrationOption
            description="Queryable Markdown"
            icon={<FileText className="h-3.5 w-3.5" />}
            label="QMD"
          />
          <MemoryIntegrationOption
            description="Graph memory"
            icon={<Workflow className="h-3.5 w-3.5" />}
            label="Cognee"
          />
        </div>
      </div>
    </div>
  );
}

function MemoryIntegrationOption({
  description,
  icon,
  label,
}: {
  description: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      className="grid h-8 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
      type="button"
    >
      <span className="text-zinc-500">{icon}</span>
      <span className="truncate">{label}</span>
      <span className="truncate text-[11px] text-zinc-600">{description}</span>
    </button>
  );
}

function ConversationList({
  activeRun,
  branchLabel,
  busy,
  conversations,
  selectConversation,
  selectedConversationId,
}: {
  activeRun: Run | null;
  branchLabel: string;
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
    return <div className="px-2 py-1 text-xs text-zinc-600">No chats</div>;
  }

  return (
    <div className="grid py-0.5 pr-0.5" data-testid="conversation-list">
      {visibleConversations.map((item) => (
        <ConversationRow
          activeRun={activeRun}
          branchLabel={branchLabel}
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
  branchLabel,
  busy,
  item,
  selectConversation,
  selected,
}: {
  activeRun: Run | null;
  branchLabel: string;
  busy: boolean;
  item: ConversationListItem;
  selectConversation: (conversationId: string) => Promise<void>;
  selected: boolean;
}) {
  const running =
    item.activeRunId !== "" ||
    (activeRun?.conversationId === item.conversation.id &&
      (activeRun.status === "queued" || activeRun.status === "running"));
  const responseAge = formatConversationAge(item.conversation.updatedAt);

  return (
    <div className="group/chat relative min-w-0">
      <button
        className={cn(
          "grid h-7 w-full min-w-0 grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-sm px-2 text-left hover:bg-zinc-800/70 hover:text-zinc-100",
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
        {responseAge ? (
          <time
            className="pl-2 text-[11px] text-zinc-500"
            dateTime={item.conversation.updatedAt}
            title={item.conversation.updatedAt}
          >
            {responseAge}
          </time>
        ) : null}
      </button>
      <div
        className="pointer-events-none fixed z-50 hidden min-w-52 max-w-72 rounded-sm border border-zinc-700/80 bg-zinc-900/95 px-2 py-1.5 text-xs text-zinc-100 shadow-xl shadow-zinc-950/50 backdrop-blur group-hover/chat:block"
        data-testid="conversation-hover-card"
        style={{ left: "calc(var(--sidebar-width, 220px) + 8px)" }}
      >
        <div className="truncate text-xs font-medium">{item.conversation.title}</div>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-zinc-300">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span className="truncate">{branchLabel}</span>
        </div>
      </div>
    </div>
  );
}

function branchHoverLabel(git: WorkspaceGitState) {
  switch (git.status) {
    case "ready":
      return git.info.branchName;
    case "loading":
      return "Reading branch";
    case "error":
      return "Branch unavailable";
    case "idle":
      return "No branch";
    default:
      return assertWorkspaceGitState(git);
  }
}

function formatConversationAge(updatedAt: string) {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) {
    return "now";
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 14) {
    return `${elapsedDays}d`;
  }
  const elapsedWeeks = Math.floor(elapsedDays / 7);
  if (elapsedWeeks < 8) {
    return `${elapsedWeeks}w`;
  }
  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedDays < 365) {
    return `${Math.max(1, elapsedMonths)}mo`;
  }
  return `${Math.floor(elapsedDays / 365)}y`;
}

function assertWorkspaceGitState(value: never): never {
  throw new Error(`Unhandled workspace git state: ${value}`);
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
    <div
      className="group grid h-7 grid-cols-[minmax(0,1fr)_auto] items-center rounded-sm hover:bg-zinc-800/60"
      title={workspace.rootPath}
    >
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
  type = "button",
  ...buttonProps
}: {
  children: ReactNode;
  className?: string;
  disabled: boolean;
  label: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...buttonProps}
      aria-label={label}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-20",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type={type}
    >
      {children}
    </button>
  );
}
