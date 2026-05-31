import type { ConversationListItem, Run, WorkspaceSummary } from "@generated/backend";
import {
  Ellipsis,
  FolderClosed,
  FolderOpen,
  MessageSquarePlus,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type WorkspaceGitState, useWorkspaceGitInfo } from "../hooks/use-workspace-git-info";
import { cn } from "../lib/utils";
import {
  defaultSidebarSections,
  SidebarAccordionSection,
  type SidebarSectionId,
  type SidebarSectionState,
} from "./sidebar-accordion";
import { ConversationRow } from "./workspace-sidebar-conversation-row";
import { EmptySectionSpace, SidebarSettingsButton } from "./sidebar-secondary-sections";
import { ProjectFolderButton, SidebarIconButton } from "./sidebar-header-actions";
import { SidebarShortcuts } from "./sidebar-shortcuts";

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
  openSettingsPane: () => void;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspaceId: string;
  sidebarWidth?: number;
  unreadConversationIds: Record<string, true>;
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
  openSettingsPane,
  recentWorkspaces,
  removeRecent,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspaceId,
  sidebarWidth = 220,
  unreadConversationIds,
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
  const projectsEmpty = activeWorkspaces.length === 0 && inactiveRecentWorkspaces.length === 0;
  const selectedWorkspace =
    activeWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const selectedGit = useWorkspaceGitInfo(selectedWorkspace?.rootPath ?? null);
  const selectedBranchLabel = branchHoverLabel(selectedGit);
  const [sections, setSections] =
    useState<Record<SidebarSectionId, SidebarSectionState>>(defaultSidebarSections);

  useEffect(() => {
    if (selectedWorkspaceId) {
      setExpandedWorkspaceId(selectedWorkspaceId);
    }
  }, [selectedWorkspaceId]);

  function setSectionOpen(sectionId: SidebarSectionId, open: boolean) {
    setSections((current) => ({
      ...current,
      [sectionId]: { ...current[sectionId], open },
    }));
  }

  function setSectionHeight(sectionId: SidebarSectionId, height: number) {
    setSections((current) => ({
      ...current,
      [sectionId]: { ...current[sectionId], height, resized: true },
    }));
  }

  return (
    <aside
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-[#202124] text-zinc-100"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <div
        className={cn("shrink-0 px-1 pb-2", chromeInsetClass(chromeInsetTop))}
        data-testid="sidebar-shortcuts-shell"
      >
        <SidebarAccordionSection
          height={sections.shortcuts.height}
          onHeightChange={(height) => setSectionHeight("shortcuts", height)}
          onOpenChange={(open) => setSectionOpen("shortcuts", open)}
          open={sections.shortcuts.open}
          resized={sections.shortcuts.resized}
          testId="shortcuts-section"
          title="Shortcuts"
        >
          <SidebarShortcuts
            busy={busy || chatBusy}
            createConversation={createConversation}
            hasWorkspace={selectedWorkspaceId !== ""}
          />
        </SidebarAccordionSection>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-1 pb-1"
        data-testid="sidebar-scrollable-sections"
      >
        <div className="grid gap-2">
          <SidebarAccordionSection
            action={<ProjectFolderButton busy={busy} openLocalFolder={openLocalFolder} />}
            height={sections.projects.height}
            onHeightChange={(height) => setSectionHeight("projects", height)}
            onOpenChange={(open) => setSectionOpen("projects", open)}
            open={sections.projects.open}
            resized={sections.projects.resized}
            testId="projects-section"
            title="Projects"
          >
            {projectsEmpty ? (
              <EmptySectionSpace />
            ) : (
              <>
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
                  unreadConversationIds={unreadConversationIds}
                  workspaces={activeWorkspaces}
                />
                <RecentProjectList
                  busy={busy}
                  recentWorkspaces={inactiveRecentWorkspaces}
                  removeRecent={removeRecent}
                />
              </>
            )}
          </SidebarAccordionSection>
        </div>
      </div>
      <div className="grid shrink-0 gap-0.5 px-1 py-1" data-testid="sidebar-memory-footer">
        <SidebarSettingsButton onOpenSettings={openSettingsPane} />
      </div>
    </aside>
  );
}

function chromeInsetClass(enabled: boolean) {
  return enabled ? "pt-10" : "";
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
  unreadConversationIds,
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
  unreadConversationIds: Record<string, true>;
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
      unreadConversationIds={unreadConversationIds}
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
  unreadConversationIds,
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
  unreadConversationIds: Record<string, true>;
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
          className="grid min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 px-2 text-left"
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
          <SidebarIconButton
            disabled={rowBusy}
            label={`New chat in ${workspace.displayName}`}
            onClick={() => void createProjectConversation()}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </SidebarIconButton>
          <ProjectMoreMenu busy={busy} closeWorkspace={closeWorkspace} workspace={workspace} />
        </div>
      </div>
      {hasVisibleChats ? (
        <div className="min-w-0">
          <ConversationList
            activeRun={activeRun}
            branchLabel={branchLabel}
            busy={chatBusy}
            conversations={conversations}
            selectConversation={selectConversation}
            selectedConversationId={selectedConversationId}
            unreadConversationIds={unreadConversationIds}
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

  return (
    <div ref={menuRef} className="relative">
      <SidebarIconButton
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
      </SidebarIconButton>
      {open ? (
        <div
          className="fixed z-50 w-56 rounded-sm border border-zinc-700/80 bg-zinc-900/95 p-1 shadow-2xl shadow-zinc-950/50 backdrop-blur"
          role="menu"
          style={menuPosition}
        >
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
  onClick: () => void;
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

function ConversationList({
  activeRun,
  branchLabel,
  busy,
  conversations,
  selectConversation,
  selectedConversationId,
  showEmpty = true,
  unreadConversationIds,
}: {
  activeRun: Run | null;
  branchLabel: string;
  busy: boolean;
  conversations: ConversationListItem[];
  selectConversation: (conversationId: string) => Promise<void>;
  selectedConversationId: string;
  showEmpty?: boolean;
  unreadConversationIds: Record<string, true>;
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
    return showEmpty ? <div className="px-2 py-1 text-xs text-zinc-600">No chats</div> : null;
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
          unread={Boolean(unreadConversationIds[item.conversation.id])}
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
      <SidebarIconButton
        className="mr-0.5 opacity-0 group-hover:opacity-100"
        disabled={busy}
        label="Remove recent workspace"
        onClick={() => void removeRecent(workspace.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </SidebarIconButton>
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
