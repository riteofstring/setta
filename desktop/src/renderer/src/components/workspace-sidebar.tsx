import type { ConversationListItem, Run, WorkspaceSummary } from "@generated/backend";
import {
  Archive,
  Ellipsis,
  FolderClosed,
  FolderOpen,
  GitBranch,
  GitFork,
  MessageSquarePlus,
  PenLine,
  Pencil,
  Pin,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type WorkspaceGitState, useWorkspaceGitInfo } from "../hooks/use-workspace-git-info";
import { cn } from "../lib/utils";
import { AsciiSpinner } from "./ascii-spinner";
import {
  defaultSidebarSections,
  SidebarAccordionSection,
  type SidebarSectionId,
  type SidebarSectionState,
} from "./sidebar-accordion";
import {
  EmptySectionIcon,
  MemoryIntegrationsContent,
  NotesContent,
  RulesContent,
  type SidebarListItem,
  UnorganizedChatsContent,
} from "./sidebar-secondary-sections";
import { ProjectFolderButton, SidebarHeaderIconButton } from "./sidebar-header-actions";
import { SidebarShortcuts } from "./sidebar-shortcuts";

const activeWorkspaceRowHeight = 28;
const recentWorkspaceRowHeight = 28;
const chatHistoryLimit = 80;
const directProjectRenderLimit = 120;
const projectMenuHeight = 200;
const projectMenuInset = 8;
const projectMenuWidth = 224;
const workspaceListOverscan = 6;
const emptyPinnedConversationIds: string[] = [];

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
  openSearch,
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
  const [pinnedProjectConversationIds, setPinnedProjectConversationIds] = useState<
    Record<string, string[]>
  >({});
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
  const [standaloneChats, setStandaloneChats] = useState<SidebarListItem[]>([]);
  const [notes, setNotes] = useState<SidebarListItem[]>([]);
  const [rules, setRules] = useState<SidebarListItem[]>([]);

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

  function togglePinnedProjectConversation(workspaceId: string, conversationId: string) {
    setPinnedProjectConversationIds((current) => {
      const currentPinnedIds = current[workspaceId] ?? [];
      const pinned = currentPinnedIds.includes(conversationId);
      if (pinned) {
        const nextPinnedIds = currentPinnedIds.filter((id) => id !== conversationId);
        if (nextPinnedIds.length === 0) {
          const next = { ...current };
          delete next[workspaceId];
          return next;
        }
        return { ...current, [workspaceId]: nextPinnedIds };
      }
      return {
        ...current,
        [workspaceId]: [conversationId, ...currentPinnedIds],
      };
    });
  }

  function createStandaloneChat() {
    setStandaloneChats((current) => [
      {
        id: `standalone_chat_${Date.now()}_${current.length}`,
        subtitle: "now",
        title: current.length === 0 ? "New chat" : `New chat ${current.length + 1}`,
      },
      ...current,
    ]);
  }

  function createLocalNote() {
    setNotes((current) => [
      {
        id: `note_${Date.now()}_${current.length}`,
        subtitle: "local",
        title: current.length === 0 ? "Untitled note" : `Untitled note ${current.length + 1}`,
      },
      ...current,
    ]);
  }

  function createLocalRule() {
    setRules((current) => [
      {
        id: `rule_${Date.now()}_${current.length}`,
        subtitle: "node graph",
        title: current.length === 0 ? "New rule" : `New rule ${current.length + 1}`,
      },
      ...current,
    ]);
  }

  return (
    <aside
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-[#202124] text-zinc-100"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <div
        className={cn("shrink-0 px-1 pb-1", chromeInsetClass(chromeInsetTop))}
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
            openSearch={openSearch}
          />
        </SidebarAccordionSection>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-1 pb-1"
        data-testid="sidebar-scrollable-sections"
      >
        <div className="grid gap-1">
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
              <EmptySectionIcon label="Projects" />
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
                  pinnedConversationIdsByWorkspace={pinnedProjectConversationIds}
                  selectConversation={selectConversation}
                  selectWorkspace={selectWorkspace}
                  selectedConversationId={selectedConversationId}
                  selectedWorkspaceId={selectedWorkspaceId}
                  setExpandedWorkspaceId={setExpandedWorkspaceId}
                  togglePinnedConversation={togglePinnedProjectConversation}
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
          <SidebarAccordionSection
            action={
              <SidebarHeaderIconButton
                icon={<MessageSquarePlus className="h-3.5 w-3.5" />}
                label="New standalone chat"
                onClick={createStandaloneChat}
              />
            }
            height={sections.chats.height}
            onHeightChange={(height) => setSectionHeight("chats", height)}
            onOpenChange={(open) => setSectionOpen("chats", open)}
            open={sections.chats.open}
            resized={sections.chats.resized}
            testId="standalone-chat-section"
            title="Chats"
          >
            <UnorganizedChatsContent chats={standaloneChats} />
          </SidebarAccordionSection>
          <SidebarAccordionSection
            action={
              <SidebarHeaderIconButton
                icon={<PenLine className="h-3.5 w-3.5" />}
                label="New note"
                onClick={createLocalNote}
              />
            }
            height={sections.notes.height}
            onHeightChange={(height) => setSectionHeight("notes", height)}
            onOpenChange={(open) => setSectionOpen("notes", open)}
            open={sections.notes.open}
            resized={sections.notes.resized}
            testId="notes-section"
            title="Notes"
          >
            <NotesContent notes={notes} />
          </SidebarAccordionSection>
          <SidebarAccordionSection
            action={
              <SidebarHeaderIconButton
                icon={<Workflow className="h-3.5 w-3.5" />}
                label="New rule"
                onClick={createLocalRule}
              />
            }
            height={sections.rules.height}
            onHeightChange={(height) => setSectionHeight("rules", height)}
            onOpenChange={(open) => setSectionOpen("rules", open)}
            open={sections.rules.open}
            resized={sections.rules.resized}
            testId="rules-section"
            title="Rules"
          >
            <RulesContent rules={rules} />
          </SidebarAccordionSection>
        </div>
      </div>
      <div className="shrink-0 px-1 py-1" data-testid="sidebar-memory-footer">
        <MemoryIntegrationsContent />
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
  pinnedConversationIdsByWorkspace,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspaceId,
  setExpandedWorkspaceId,
  togglePinnedConversation,
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
  pinnedConversationIdsByWorkspace: Record<string, string[]>;
  selectConversation: (conversationId: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspaceId: string;
  setExpandedWorkspaceId: (next: string) => void;
  togglePinnedConversation: (workspaceId: string, conversationId: string) => void;
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
      pinnedConversationIds={
        pinnedConversationIdsByWorkspace[workspace.id] ?? emptyPinnedConversationIds
      }
      selectConversation={selectConversation}
      selectWorkspace={selectWorkspace}
      selected={workspace.id === selectedWorkspaceId}
      selectedConversationId={selectedConversationId}
      setExpandedWorkspaceId={setExpandedWorkspaceId}
      togglePinnedConversation={togglePinnedConversation}
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
  pinnedConversationIds,
  selectConversation,
  selectWorkspace,
  selected,
  selectedConversationId,
  setExpandedWorkspaceId,
  togglePinnedConversation,
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
  pinnedConversationIds: string[];
  selectConversation: (conversationId: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selected: boolean;
  selectedConversationId: string;
  setExpandedWorkspaceId: (next: string) => void;
  togglePinnedConversation: (workspaceId: string, conversationId: string) => void;
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
          <ProjectMoreMenu busy={busy} closeWorkspace={closeWorkspace} workspace={workspace} />
          <IconButton
            disabled={rowBusy}
            label={`New chat in ${workspace.displayName}`}
            onClick={() => void createProjectConversation()}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
      {hasVisibleChats ? (
        <div className="min-w-0">
          <ConversationList
            activeRun={activeRun}
            branchLabel={branchLabel}
            busy={chatBusy}
            conversations={conversations}
            onTogglePinned={(conversationId) =>
              togglePinnedConversation(workspace.id, conversationId)
            }
            pinnedConversationIds={pinnedConversationIds}
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

function ConversationList({
  activeRun,
  branchLabel,
  busy,
  conversations,
  onTogglePinned,
  pinnedConversationIds,
  selectConversation,
  selectedConversationId,
  unreadConversationIds,
}: {
  activeRun: Run | null;
  branchLabel: string;
  busy: boolean;
  conversations: ConversationListItem[];
  onTogglePinned: (conversationId: string) => void;
  pinnedConversationIds: string[];
  selectConversation: (conversationId: string) => Promise<void>;
  selectedConversationId: string;
  unreadConversationIds: Record<string, true>;
}) {
  const [visibleLimit, setVisibleLimit] = useState(chatHistoryLimit);
  const sortedConversations = useMemo(
    () => orderProjectConversations(conversations, pinnedConversationIds),
    [conversations, pinnedConversationIds],
  );
  const pinnedConversationIdsSet = useMemo(
    () => new Set(pinnedConversationIds),
    [pinnedConversationIds],
  );
  const selectedIndex = sortedConversations.findIndex(
    (item) => item.conversation.id === selectedConversationId,
  );
  const effectiveLimit =
    selectedIndex >= visibleLimit
      ? Math.min(sortedConversations.length, selectedIndex + 1)
      : visibleLimit;
  const visibleConversations = useMemo(
    () => sortedConversations.slice(0, effectiveLimit),
    [effectiveLimit, sortedConversations],
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
          onTogglePinned={onTogglePinned}
          pinned={pinnedConversationIdsSet.has(item.conversation.id)}
          selectConversation={selectConversation}
          selected={item.conversation.id === selectedConversationId}
          unread={Boolean(unreadConversationIds[item.conversation.id])}
        />
      ))}
      {visibleConversations.length < sortedConversations.length ? (
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

function orderProjectConversations(
  conversations: ConversationListItem[],
  pinnedConversationIds: string[],
) {
  if (pinnedConversationIds.length === 0) {
    return conversations;
  }
  const pinnedConversationIdsSet = new Set(pinnedConversationIds);
  const pinnedOrder = new Map(pinnedConversationIds.map((id, index) => [id, index]));
  return [...conversations].sort((left, right) => {
    const leftPinned = pinnedConversationIdsSet.has(left.conversation.id);
    const rightPinned = pinnedConversationIdsSet.has(right.conversation.id);
    if (leftPinned && rightPinned) {
      return (
        (pinnedOrder.get(left.conversation.id) ?? 0) - (pinnedOrder.get(right.conversation.id) ?? 0)
      );
    }
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }
    return 0;
  });
}

function ConversationRow({
  activeRun,
  branchLabel,
  busy,
  item,
  onTogglePinned,
  pinned,
  selectConversation,
  selected,
  unread,
}: {
  activeRun: Run | null;
  branchLabel: string;
  busy: boolean;
  item: ConversationListItem;
  onTogglePinned: (conversationId: string) => void;
  pinned: boolean;
  selectConversation: (conversationId: string) => Promise<void>;
  selected: boolean;
  unread: boolean;
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
          "grid h-7 w-full min-w-0 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 pr-7 text-left hover:bg-zinc-800/70 hover:text-zinc-100",
          selected ? "text-zinc-100" : "text-zinc-300",
        )}
        data-testid="conversation-list-item"
        disabled={busy}
        onClick={() => void selectConversation(item.conversation.id)}
        type="button"
      >
        <ConversationStatusIndicator running={running} unread={unread && !selected} />
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
      <ConversationPinButton
        conversationId={item.conversation.id}
        pinned={pinned}
        title={item.conversation.title}
        togglePinned={onTogglePinned}
      />
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

function ConversationStatusIndicator({ running, unread }: { running: boolean; unread: boolean }) {
  return (
    <span className="grid h-4 w-[18px] place-items-center overflow-hidden">
      {running ? (
        <AsciiSpinner className="w-[18px] text-[7px] text-zinc-400" label="Chat response running" />
      ) : unread ? (
        <span
          aria-label="Unread assistant response"
          className="h-1.5 w-1.5 rounded-full bg-zinc-500"
          role="status"
        />
      ) : null}
    </span>
  );
}

function ConversationPinButton({
  conversationId,
  pinned,
  title,
  togglePinned,
}: {
  conversationId: string;
  pinned: boolean;
  title: string;
  togglePinned: (conversationId: string) => void;
}) {
  const label = pinned ? `Unpin ${title}` : `Pin ${title}`;
  return (
    <button
      aria-label={label}
      className={cn(
        "absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-sm text-zinc-500 opacity-0 outline-none transition-opacity hover:bg-zinc-700/80 hover:text-zinc-100 focus-visible:bg-zinc-700/80 focus-visible:text-zinc-100 group-hover/chat:opacity-100",
        pinned ? "opacity-100 text-zinc-300" : "",
      )}
      onClick={() => togglePinned(conversationId)}
      title={pinned ? "Unpin chat" : "Pin chat"}
      type="button"
    >
      <Pin className={cn("h-3.5 w-3.5", pinned ? "fill-zinc-300" : "")} />
    </button>
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
