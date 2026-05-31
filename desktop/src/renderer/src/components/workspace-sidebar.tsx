import type {
  ConversationListItem,
  CorruptionSummary,
  Diagnostic,
  ListConversationsResponse,
  Run,
  WorkspaceSummary,
} from "@generated/backend";
import {
  AlertTriangle,
  Ellipsis,
  FolderClosed,
  FolderOpen,
  MessageSquarePlus,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";

import { cn } from "../lib/utils";
import {
  defaultSidebarSections,
  SidebarAccordionSection,
  type SidebarSectionId,
  type SidebarSectionState,
} from "./sidebar-accordion";
import {
  selectSidebarNavigationItems,
  type SidebarNavigationCommand,
  type SidebarNavigationItem,
  type SidebarWorkspaceConversationList,
} from "./workspace-sidebar-model";
import { ConversationRow } from "./workspace-sidebar-conversation-row";
import { EmptySectionSpace, SidebarSettingsButton } from "./sidebar-secondary-sections";
import { ProjectFolderButton, SidebarIconButton } from "./sidebar-header-actions";
import { SidebarShortcuts } from "./sidebar-shortcuts";

const chatHistoryLimit = 80;
const projectMenuHeight = 200;
const projectMenuInset = 8;
const projectMenuWidth = 224;
const sidebarNavigationMaxHeight = 360;
const sidebarNavigationRowHeight = 28;
const workspaceListOverscan = 6;
const noScrollAnchoringStyle = { overflowAnchor: "none" } satisfies CSSProperties;
const emptyCorruptionSummary = {
  byKind: [],
  bySeverity: [],
  hasCorruption: false,
  total: 0,
} satisfies CorruptionSummary;

interface WorkspaceSidebarProps {
  activeRun: Run | null;
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  chromeInsetTop?: boolean;
  chatBusy: boolean;
  chatLoading: boolean;
  chatWorkspaceId: string | null;
  closeWorkspace: (id: string) => Promise<void>;
  conversations: ConversationListItem[];
  corruption: CorruptionSummary;
  createConversation: (title?: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  diagnostics: Diagnostic[];
  openLocalFolder: () => Promise<void>;
  openWorkspacePath: (rootPath: string) => Promise<void>;
  openSettingsPane: () => void;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  selectConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspaceId: string;
  sidebarWidth?: number;
}

interface VirtualWorkspaceListProps {
  items: SidebarNavigationItem[];
  renderItem: (item: SidebarNavigationItem) => ReactNode;
  rowHeight: number;
  testId: string;
}

interface SidebarWorkspaceConversationState extends SidebarWorkspaceConversationList {
  corruption: CorruptionSummary;
  diagnostics: Diagnostic[];
}

export function WorkspaceSidebar({
  activeRun,
  activeWorkspaces,
  busy,
  chromeInsetTop = false,
  chatBusy,
  chatLoading,
  chatWorkspaceId,
  closeWorkspace,
  conversations,
  corruption,
  createConversation,
  createWorkspaceConversation,
  diagnostics,
  openLocalFolder,
  openWorkspacePath,
  openSettingsPane,
  recentWorkspaces,
  removeRecent,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspaceId,
  sidebarWidth = 220,
}: WorkspaceSidebarProps) {
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<ReadonlySet<string>>(
    () => new Set(selectedWorkspaceId ? [selectedWorkspaceId] : []),
  );
  const [workspaceConversationLists, setWorkspaceConversationLists] = useState<
    Record<string, SidebarWorkspaceConversationState | undefined>
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
  const [sections, setSections] =
    useState<Record<SidebarSectionId, SidebarSectionState>>(defaultSidebarSections);
  const selectedWorkspaceList = useMemo(
    () =>
      selectedWorkspaceId && chatWorkspaceId === selectedWorkspaceId
        ? {
            conversations: chatLoading ? [] : conversations,
            corruption,
            diagnostics,
            error: null,
            loading: chatLoading,
          }
        : null,
    [chatLoading, chatWorkspaceId, conversations, corruption, diagnostics, selectedWorkspaceId],
  );
  const visibleWorkspaceConversationLists = useMemo(() => {
    if (!selectedWorkspaceId || !selectedWorkspaceList) {
      return workspaceConversationLists;
    }
    return {
      ...workspaceConversationLists,
      [selectedWorkspaceId]: selectedWorkspaceList,
    };
  }, [selectedWorkspaceId, selectedWorkspaceList, workspaceConversationLists]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      setExpandedWorkspaceIds((current) => {
        if (current.has(selectedWorkspaceId)) {
          return current;
        }
        return new Set([...current, selectedWorkspaceId]);
      });
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId || !selectedWorkspaceList) {
      return;
    }
    setWorkspaceConversationLists((current) => ({
      ...current,
      [selectedWorkspaceId]: selectedWorkspaceList,
    }));
  }, [selectedWorkspaceId, selectedWorkspaceList]);

  useEffect(() => {
    const activeIds = new Set(activeWorkspaces.map((workspace) => workspace.id));
    setWorkspaceConversationLists((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([workspaceId]) => activeIds.has(workspaceId)),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [activeWorkspaces]);

  useEffect(() => {
    for (const workspace of activeWorkspaces) {
      if (!expandedWorkspaceIds.has(workspace.id) || workspace.id === selectedWorkspaceId) {
        continue;
      }
      const list = workspaceConversationLists[workspace.id];
      if (list) {
        continue;
      }
      void loadSidebarWorkspaceConversations(workspace.id);
    }
  }, [activeWorkspaces, expandedWorkspaceIds, selectedWorkspaceId, workspaceConversationLists]);

  async function loadSidebarWorkspaceConversations(workspaceId: string) {
    setWorkspaceConversationLists((current) => {
      if (current[workspaceId]) {
        return current;
      }
      return {
        ...current,
        [workspaceId]: {
          conversations: [],
          corruption: emptyCorruptionSummary,
          diagnostics: [],
          error: null,
          loading: true,
        },
      };
    });
    try {
      const list = await window.setta.chat.listConversations(workspaceId);
      setWorkspaceConversationLists((current) => ({
        ...current,
        [workspaceId]: sidebarWorkspaceConversationState(list),
      }));
    } catch (error) {
      setWorkspaceConversationLists((current) => ({
        ...current,
        [workspaceId]: {
          conversations: current[workspaceId]?.conversations ?? [],
          corruption: emptyCorruptionSummary,
          diagnostics: [],
          error: error instanceof Error ? error.message : String(error),
          loading: false,
        },
      }));
    }
  }

  function setWorkspaceExpanded(workspaceId: string, expanded: boolean) {
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(workspaceId);
      } else {
        next.delete(workspaceId);
      }
      return next;
    });
  }

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
        className={cn("shrink-0 px-1 pb-2", chromeInsetTop && "pt-10")}
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
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1"
        data-testid="sidebar-scrollable-sections"
        style={noScrollAnchoringStyle}
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
                <ProjectNavigationList
                  activeRun={activeRun}
                  busy={busy}
                  chatBusy={chatBusy}
                  closeWorkspace={closeWorkspace}
                  createWorkspaceConversation={createWorkspaceConversation}
                  expandedWorkspaceIds={expandedWorkspaceIds}
                  openWorkspacePath={openWorkspacePath}
                  recentWorkspaces={recentWorkspaces}
                  removeRecent={removeRecent}
                  selectConversation={selectConversation}
                  selectWorkspace={selectWorkspace}
                  selectedConversationId={selectedConversationId}
                  selectedWorkspaceId={selectedWorkspaceId}
                  setWorkspaceExpanded={setWorkspaceExpanded}
                  workspaceConversationLists={visibleWorkspaceConversationLists}
                  activeWorkspaces={activeWorkspaces}
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

function sidebarWorkspaceConversationState(
  response: ListConversationsResponse,
): SidebarWorkspaceConversationState {
  return {
    conversations: response.conversations,
    corruption: response.corruption,
    diagnostics: response.diagnostics,
    error: null,
    loading: false,
  };
}

function sidebarWorkspaceDiagnostics(
  workspaceConversationLists: Record<string, SidebarWorkspaceConversationState | undefined>,
) {
  return Object.values(workspaceConversationLists).flatMap((list) => list?.diagnostics ?? []);
}

function ProjectNavigationList({
  activeRun,
  activeWorkspaces,
  busy,
  chatBusy,
  closeWorkspace,
  createWorkspaceConversation,
  expandedWorkspaceIds,
  openWorkspacePath,
  recentWorkspaces,
  removeRecent,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspaceId,
  setWorkspaceExpanded,
  workspaceConversationLists,
}: {
  activeRun: Run | null;
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  chatBusy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  expandedWorkspaceIds: ReadonlySet<string>;
  openWorkspacePath: (rootPath: string) => Promise<void>;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  selectConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspaceId: string;
  setWorkspaceExpanded: (workspaceId: string, expanded: boolean) => void;
  workspaceConversationLists: Record<string, SidebarWorkspaceConversationState | undefined>;
}) {
  const [visibleConversationLimit, setVisibleConversationLimit] = useState(chatHistoryLimit);
  const items = useMemo(
    () =>
      selectSidebarNavigationItems({
        activeWorkspaces,
        expandedWorkspaceIds,
        recentWorkspaces,
        selectedConversationId,
        selectedWorkspaceId,
        visibleConversationLimit,
        workspaceConversationLists,
      }),
    [
      activeWorkspaces,
      expandedWorkspaceIds,
      recentWorkspaces,
      selectedConversationId,
      selectedWorkspaceId,
      visibleConversationLimit,
      workspaceConversationLists,
    ],
  );
  const corruptionLabelsByConversationId = useMemo(
    () => conversationCorruptionLabels(sidebarWorkspaceDiagnostics(workspaceConversationLists)),
    [workspaceConversationLists],
  );

  if (items.length === 0) {
    return null;
  }

  async function runCommand(command: SidebarNavigationCommand) {
    switch (command.type) {
      case "activateWorkspace":
        await runActivateWorkspaceCommand(command);
        return;
      case "createWorkspaceConversation":
        await runCreateWorkspaceConversationCommand(command);
        return;
      default:
        await runBasicNavigationCommand(command);
    }
  }

  async function runActivateWorkspaceCommand(
    command: Extract<SidebarNavigationCommand, { type: "activateWorkspace" }>,
  ) {
    setWorkspaceExpanded(command.workspaceId, command.nextExpanded);
    if (command.selectWorkspace) {
      await selectWorkspace(command.workspaceId);
    }
  }

  async function runCreateWorkspaceConversationCommand(
    command: Extract<SidebarNavigationCommand, { type: "createWorkspaceConversation" }>,
  ) {
    setWorkspaceExpanded(command.workspaceId, true);
    if (command.workspaceId !== selectedWorkspaceId) {
      await selectWorkspace(command.workspaceId);
    }
    await createWorkspaceConversation(command.workspaceId);
  }

  async function runBasicNavigationCommand(
    command: Exclude<
      SidebarNavigationCommand,
      Extract<
        SidebarNavigationCommand,
        { type: "activateWorkspace" | "createWorkspaceConversation" }
      >
    >,
  ) {
    switch (command.type) {
      case "closeWorkspace":
        await closeWorkspace(command.workspaceId);
        return;
      case "openRecentWorkspace":
        await openWorkspacePath(command.rootPath);
        return;
      case "removeRecentWorkspace":
        await removeRecent(command.workspaceId);
        return;
      case "selectConversation":
        if (command.workspaceId !== selectedWorkspaceId) {
          await selectWorkspace(command.workspaceId);
        }
        await selectConversation(command.conversationId, command.workspaceId);
        return;
      case "showMoreConversations":
        setVisibleConversationLimit((current) => current + chatHistoryLimit);
        return;
      default:
        assertNever(command);
    }
  }

  return (
    <div
      className="min-h-0 overflow-hidden"
      aria-label="Projects"
      data-testid="active-workspace-list"
      style={sidebarNavigationListStyle(items.length)}
    >
      <VirtualWorkspaceList
        items={items}
        renderItem={(item) => (
          <SidebarNavigationRow
            activeRun={activeRun}
            busy={busy}
            chatBusy={chatBusy}
            workspaceConversationLists={workspaceConversationLists}
            corruptionLabelsByConversationId={corruptionLabelsByConversationId}
            item={item}
            runCommand={runCommand}
          />
        )}
        rowHeight={sidebarNavigationRowHeight}
        testId="sidebar-navigation-list"
      />
    </div>
  );
}

function SidebarNavigationRow({
  activeRun,
  busy,
  chatBusy,
  corruptionLabelsByConversationId,
  item,
  runCommand,
  workspaceConversationLists,
}: {
  activeRun: Run | null;
  busy: boolean;
  chatBusy: boolean;
  corruptionLabelsByConversationId: Map<string, string>;
  item: SidebarNavigationItem;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
  workspaceConversationLists: Record<string, SidebarWorkspaceConversationState | undefined>;
}) {
  switch (item.kind) {
    case "activeWorkspace":
      return (
        <ActiveWorkspaceNavigationRow
          busy={busy}
          chatBusy={chatBusy}
          item={item}
          runCommand={runCommand}
          workspaceConversationLists={workspaceConversationLists}
        />
      );
    case "conversation":
      return (
        <ConversationNavigationRow
          activeRun={activeRun}
          chatBusy={chatBusy}
          corruptionLabelsByConversationId={corruptionLabelsByConversationId}
          item={item}
          runCommand={runCommand}
        />
      );
    case "emptyConversationList":
      return <ConversationStatusRow item={item} />;
    case "moreConversations":
      return <MoreConversationsRow item={item} runCommand={runCommand} />;
    case "recentWorkspace":
      return <RecentWorkspaceRow busy={busy} item={item} runCommand={runCommand} />;
    default:
      return assertNever(item);
  }
}

function ActiveWorkspaceNavigationRow({
  busy,
  chatBusy,
  item,
  runCommand,
  workspaceConversationLists,
}: {
  busy: boolean;
  chatBusy: boolean;
  item: Extract<SidebarNavigationItem, { kind: "activeWorkspace" }>;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
  workspaceConversationLists: Record<string, SidebarWorkspaceConversationState | undefined>;
}) {
  const workspaceList = workspaceConversationLists[item.workspace.id];
  return (
    <ProjectRow
      busy={busy}
      chatBusy={chatBusy}
      corruption={workspaceList?.corruption ?? null}
      diagnostics={workspaceList?.diagnostics ?? []}
      item={item}
      runCommand={runCommand}
    />
  );
}

function ConversationNavigationRow({
  activeRun,
  chatBusy,
  corruptionLabelsByConversationId,
  item,
  runCommand,
}: {
  activeRun: Run | null;
  chatBusy: boolean;
  corruptionLabelsByConversationId: Map<string, string>;
  item: Extract<SidebarNavigationItem, { kind: "conversation" }>;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
}) {
  const corruptionLabel =
    corruptionLabelsByConversationId.get(item.conversation.conversation.id) ?? null;
  return (
    <div className="pl-4">
      <ConversationRow
        activeRun={activeRun}
        busy={chatBusy}
        corruptionLabel={corruptionLabel}
        item={item.conversation}
        selectConversation={() => runCommand(item.commands.primary)}
        selected={item.selected}
        unread={item.unread}
      />
    </div>
  );
}

function ConversationStatusRow({
  item,
}: {
  item: Extract<SidebarNavigationItem, { kind: "emptyConversationList" }>;
}) {
  return <div className="h-7 px-6 py-1 text-xs text-zinc-600">{item.label}</div>;
}

function MoreConversationsRow({
  item,
  runCommand,
}: {
  item: Extract<SidebarNavigationItem, { kind: "moreConversations" }>;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
}) {
  return (
    <button
      className="h-7 w-full rounded-sm px-6 text-left text-xs text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200"
      onClick={() => void runCommand(item.commands.primary)}
      type="button"
    >
      {item.label}
    </button>
  );
}

function ProjectRow({
  busy,
  chatBusy,
  corruption,
  diagnostics,
  item,
  runCommand,
}: {
  busy: boolean;
  chatBusy: boolean;
  corruption: CorruptionSummary | null;
  diagnostics: Diagnostic[];
  item: Extract<SidebarNavigationItem, { kind: "activeWorkspace" }>;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
}) {
  const rowBusy = busy || chatBusy;
  const { workspace } = item;

  return (
    <div className="group grid h-7 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center rounded-sm hover:bg-zinc-800/55">
      <button
        aria-current={item.selected ? "page" : undefined}
        aria-expanded={item.expanded}
        className="grid min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 px-2 text-left"
        data-testid="active-workspace-select"
        disabled={busy}
        onClick={() => void runCommand(item.commands.primary)}
        title={workspace.rootPath}
        type="button"
      >
        {item.expanded ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
        ) : (
          <FolderClosed className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
        )}
        <span
          className={cn(
            "truncate text-xs",
            item.selected ? "font-medium text-zinc-100" : "text-zinc-400",
          )}
        >
          {workspace.displayName}
        </span>
      </button>
      <WorkspaceCorruptionIndicator corruption={corruption} diagnostics={diagnostics} />
      <div className="mr-0.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <SidebarIconButton
          disabled={rowBusy}
          label={`New chat in ${workspace.displayName}`}
          onClick={() => void runCommand(item.commands.createConversation)}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </SidebarIconButton>
        <ProjectMoreMenu
          busy={busy}
          closeCommand={item.commands.close}
          runCommand={runCommand}
          workspace={workspace}
        />
      </div>
    </div>
  );
}

function ProjectMoreMenu({
  busy,
  closeCommand,
  runCommand,
  workspace,
}: {
  busy: boolean;
  closeCommand: SidebarNavigationCommand;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
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
              void runCommand(closeCommand);
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

function WorkspaceCorruptionIndicator({
  corruption,
  diagnostics,
}: {
  corruption: CorruptionSummary | null;
  diagnostics: Diagnostic[];
}) {
  if (!corruption?.hasCorruption) {
    return null;
  }
  const latestDiagnostic = latestCriticalDiagnostic(diagnostics);
  const label = chatStateStatusLabel(corruption.total, latestDiagnostic);
  return (
    <div
      aria-label={label}
      className="group/workspace-corruption grid h-6 w-6 place-items-center rounded-sm text-amber-300 outline-none hover:bg-zinc-800/80 focus-visible:bg-zinc-800/80"
      data-testid="workspace-corruption-status"
      role="status"
      tabIndex={0}
      title={label}
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      <div
        className="pointer-events-none fixed z-50 hidden w-72 rounded-sm border border-zinc-700/80 bg-zinc-900/95 px-2 py-1.5 text-xs text-zinc-100 shadow-xl shadow-zinc-950/50 backdrop-blur group-hover/workspace-corruption:block group-focus/workspace-corruption:block"
        data-testid="workspace-corruption-tooltip"
        style={{ left: "calc(var(--sidebar-width, 220px) + 8px)" }}
      >
        <div className="font-medium text-amber-200">Malformed chat data</div>
        <div className="mt-1 break-words text-zinc-300">{label}</div>
      </div>
    </div>
  );
}

function conversationCorruptionLabels(diagnostics: Diagnostic[]) {
  const diagnosticsByConversationId = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.conversationId === "" || diagnostic.severity !== "critical") {
      continue;
    }
    const existing = diagnosticsByConversationId.get(diagnostic.conversationId);
    if (existing) {
      existing.push(diagnostic);
    } else {
      diagnosticsByConversationId.set(diagnostic.conversationId, [diagnostic]);
    }
  }

  const labels = new Map<string, string>();
  for (const [conversationId, conversationDiagnostics] of diagnosticsByConversationId) {
    const diagnostic = conversationDiagnostics.at(-1);
    if (diagnostic) {
      labels.set(conversationId, chatStateStatusLabel(conversationDiagnostics.length, diagnostic));
    }
  }
  return labels;
}

function latestCriticalDiagnostic(diagnostics: Diagnostic[]) {
  return diagnostics.filter((diagnostic) => diagnostic.severity === "critical").at(-1);
}

function chatStateStatusLabel(count: number, diagnostic: Diagnostic | undefined) {
  const noun = count === 1 ? "record" : "records";
  const details = diagnostic
    ? ` Latest issue: ${diagnostic.message}${diagnostic.context.path ? ` Path: ${diagnostic.context.path}` : ""}`
    : "";
  return `${count} corrupt chat ${noun} detected.${details}`;
}

function RecentWorkspaceRow({
  busy,
  item,
  runCommand,
}: {
  busy: boolean;
  item: Extract<SidebarNavigationItem, { kind: "recentWorkspace" }>;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
}) {
  const { workspace } = item;
  return (
    <div
      className="group grid h-7 grid-cols-[minmax(0,1fr)_auto] items-center rounded-sm hover:bg-zinc-800/60"
      title={workspace.rootPath}
    >
      <button
        className="flex h-7 min-w-0 items-center gap-2 px-2 text-left"
        data-testid="recent-workspace-open"
        disabled={busy}
        onClick={() => void runCommand(item.commands.primary)}
        type="button"
      >
        <Workflow className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="truncate text-xs text-zinc-500">{workspace.displayName}</span>
      </button>
      <SidebarIconButton
        className="mr-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
        disabled={busy}
        label="Remove recent workspace"
        onClick={() => void runCommand(item.commands.remove)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </SidebarIconButton>
    </div>
  );
}

function VirtualWorkspaceList({ items, renderItem, rowHeight, testId }: VirtualWorkspaceListProps) {
  return (
    <Virtuoso
      className="h-full min-h-0 overflow-y-auto overscroll-contain"
      data={items}
      data-testid={testId}
      fixedItemHeight={rowHeight}
      initialItemCount={Math.min(
        items.length,
        Math.ceil(sidebarNavigationMaxHeight / rowHeight) + workspaceListOverscan,
      )}
      itemContent={(_, item) => (
        <div
          data-testid={sidebarItemTestId(item)}
          style={{ height: rowHeight, ...noScrollAnchoringStyle }}
        >
          {renderItem(item)}
        </div>
      )}
      overscan={workspaceListOverscan * rowHeight}
      style={noScrollAnchoringStyle}
    />
  );
}

function sidebarNavigationListStyle(itemCount: number): CSSProperties {
  return {
    height: Math.min(itemCount * sidebarNavigationRowHeight, sidebarNavigationMaxHeight),
  };
}

function sidebarItemTestId(item: SidebarNavigationItem) {
  switch (item.kind) {
    case "activeWorkspace":
      return "active-workspace-item";
    case "conversation":
      return "conversation-sidebar-item";
    case "emptyConversationList":
      return "conversation-empty-item";
    case "moreConversations":
      return "conversation-more-item";
    case "recentWorkspace":
      return "recent-workspace-item";
    default:
      return assertNever(item);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported sidebar navigation item: ${JSON.stringify(value)}`);
}
