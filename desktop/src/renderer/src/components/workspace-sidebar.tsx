import type {
  ConversationListItem,
  CorruptionSummary,
  Diagnostic,
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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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

interface WorkspaceSidebarProps {
  activeRun: Run | null;
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  chromeInsetTop?: boolean;
  chatBusy: boolean;
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
  items: SidebarNavigationItem[];
  renderItem: (item: SidebarNavigationItem) => ReactNode;
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
                <ProjectNavigationList
                  activeRun={activeRun}
                  busy={busy}
                  chatBusy={chatBusy}
                  closeWorkspace={closeWorkspace}
                  conversations={conversations}
                  corruption={corruption}
                  createWorkspaceConversation={createWorkspaceConversation}
                  diagnostics={diagnostics}
                  expandedWorkspaceId={expandedWorkspaceId}
                  openWorkspacePath={openWorkspacePath}
                  recentWorkspaces={recentWorkspaces}
                  removeRecent={removeRecent}
                  selectConversation={selectConversation}
                  selectWorkspace={selectWorkspace}
                  selectedConversationId={selectedConversationId}
                  selectedWorkspaceId={selectedWorkspaceId}
                  setExpandedWorkspaceId={setExpandedWorkspaceId}
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

function chromeInsetClass(enabled: boolean) {
  return enabled ? "pt-10" : "";
}

function ProjectNavigationList({
  activeRun,
  activeWorkspaces,
  busy,
  chatBusy,
  closeWorkspace,
  conversations,
  corruption,
  createWorkspaceConversation,
  diagnostics,
  expandedWorkspaceId,
  openWorkspacePath,
  recentWorkspaces,
  removeRecent,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspaceId,
  setExpandedWorkspaceId,
}: {
  activeRun: Run | null;
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  chatBusy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  conversations: ConversationListItem[];
  corruption: CorruptionSummary;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  diagnostics: Diagnostic[];
  expandedWorkspaceId: string;
  openWorkspacePath: (rootPath: string) => Promise<void>;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspaceId: string;
  setExpandedWorkspaceId: (next: string) => void;
}) {
  const [visibleConversationLimit, setVisibleConversationLimit] = useState(chatHistoryLimit);
  const items = useMemo(
    () =>
      selectSidebarNavigationItems({
        activeWorkspaces,
        conversations,
        expandedWorkspaceId,
        recentWorkspaces,
        selectedConversationId,
        selectedWorkspaceId,
        visibleConversationLimit,
      }),
    [
      activeWorkspaces,
      conversations,
      expandedWorkspaceId,
      recentWorkspaces,
      selectedConversationId,
      selectedWorkspaceId,
      visibleConversationLimit,
    ],
  );
  const corruptionLabelsByConversationId = useMemo(
    () => conversationCorruptionLabels(diagnostics),
    [diagnostics],
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
    setExpandedWorkspaceId(command.nextExpandedWorkspaceId);
    if (command.selectWorkspace) {
      await selectWorkspace(command.workspaceId);
    }
  }

  async function runCreateWorkspaceConversationCommand(
    command: Extract<SidebarNavigationCommand, { type: "createWorkspaceConversation" }>,
  ) {
    setExpandedWorkspaceId(command.workspaceId);
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
        await selectConversation(command.conversationId);
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
            corruption={corruption}
            corruptionLabelsByConversationId={corruptionLabelsByConversationId}
            diagnostics={diagnostics}
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
  corruption,
  corruptionLabelsByConversationId,
  diagnostics,
  item,
  runCommand,
}: {
  activeRun: Run | null;
  busy: boolean;
  chatBusy: boolean;
  corruption: CorruptionSummary;
  corruptionLabelsByConversationId: Map<string, string>;
  diagnostics: Diagnostic[];
  item: SidebarNavigationItem;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
}) {
  switch (item.kind) {
    case "activeWorkspace":
      return (
        <ProjectRow
          busy={busy}
          chatBusy={chatBusy}
          corruption={item.selected ? corruption : null}
          diagnostics={diagnostics}
          item={item}
          runCommand={runCommand}
        />
      );
    case "conversation":
      return (
        <div className="pl-4">
          <ConversationRow
            activeRun={activeRun}
            busy={chatBusy}
            corruptionLabel={
              corruptionLabelsByConversationId.get(item.conversation.conversation.id) ?? null
            }
            item={item.conversation}
            selectConversation={() => runCommand(item.commands.primary)}
            selected={item.selected}
            unread={item.unread}
          />
        </div>
      );
    case "emptyConversationList":
      return <div className="h-7 px-6 py-1 text-xs text-zinc-600">{item.label}</div>;
    case "moreConversations":
      return (
        <button
          className="h-7 w-full rounded-sm px-6 text-left text-xs text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200"
          onClick={() => void runCommand(item.commands.primary)}
          type="button"
        >
          {item.label}
        </button>
      );
    case "recentWorkspace":
      return <RecentWorkspaceRow busy={busy} item={item} runCommand={runCommand} />;
    default:
      return assertNever(item);
  }
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
        {visibleItems.map((item, offset) => {
          const index = range.start + offset;
          return (
            <li
              className="absolute left-0 w-full"
              data-testid={sidebarItemTestId(item)}
              key={item.id}
              style={virtualRowStyle(index, rowHeight)}
            >
              {renderItem(item)}
            </li>
          );
        })}
      </ul>
    </div>
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
