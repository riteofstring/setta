import type { CorruptionSummary, Diagnostic, Run, WorkspaceSummary } from "@generated/backend";
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
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import type { WorkflowDefinitionListState } from "../stores/workflow-definition-store";
import type { WorkspaceConversationListState } from "../stores/chat-store";
import { SidebarIconButton } from "./sidebar-header-actions";
import { ConversationRow } from "./workspace-sidebar-conversation-row";
import type {
  SidebarNavigationCommand,
  SidebarNavigationItem,
  SidebarWorkspaceConversationList,
  SidebarWorkspaceWorkflowDefinitionList,
} from "./workspace-sidebar-model";

const projectMenuHeight = 200;
const projectMenuInset = 8;
const projectMenuWidth = 224;

export interface SidebarWorkspaceConversationState
  extends SidebarWorkspaceConversationList, WorkspaceConversationListState {
  corruption: CorruptionSummary;
  diagnostics: Diagnostic[];
}

export interface SidebarWorkspaceWorkflowDefinitionState
  extends SidebarWorkspaceWorkflowDefinitionList, WorkflowDefinitionListState {}

export function sidebarWorkspaceDiagnostics(
  workspaceConversationLists: Record<string, SidebarWorkspaceConversationState | undefined>,
) {
  return Object.values(workspaceConversationLists).flatMap((list) => list?.diagnostics ?? []);
}

export function conversationCorruptionLabels(diagnostics: Diagnostic[]) {
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

export function SidebarNavigationRow({
  activeRun,
  busy,
  chatCreateBusy,
  conversationSelectionBusy,
  corruptionLabelsByConversationId,
  item,
  runCommand,
  workspaceConversationLists,
  workspaceWorkflowDefinitionLists,
}: {
  activeRun: Run | null;
  busy: boolean;
  chatCreateBusy: boolean;
  conversationSelectionBusy: boolean;
  corruptionLabelsByConversationId: Map<string, string>;
  item: SidebarNavigationItem;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
  workspaceConversationLists: Record<string, SidebarWorkspaceConversationState | undefined>;
  workspaceWorkflowDefinitionLists: Record<
    string,
    SidebarWorkspaceWorkflowDefinitionState | undefined
  >;
}) {
  switch (item.kind) {
    case "activeWorkspace":
      return (
        <ActiveWorkspaceNavigationRow
          busy={busy}
          chatCreateBusy={chatCreateBusy}
          item={item}
          runCommand={runCommand}
          workspaceConversationLists={workspaceConversationLists}
          workspaceWorkflowDefinitionLists={workspaceWorkflowDefinitionLists}
        />
      );
    case "conversation":
      return (
        <ConversationNavigationRow
          activeRun={activeRun}
          conversationSelectionBusy={conversationSelectionBusy}
          corruptionLabelsByConversationId={corruptionLabelsByConversationId}
          item={item}
          runCommand={runCommand}
        />
      );
    case "emptyConversationList":
      return <ConversationStatusRow item={item} />;
    case "emptyWorkflowList":
      return <WorkflowStatusRow item={item} />;
    case "moreConversations":
      return <MoreConversationsRow item={item} runCommand={runCommand} />;
    case "recentWorkspace":
      return <RecentWorkspaceRow busy={busy} item={item} runCommand={runCommand} />;
    case "sectionHeader":
      return <SectionHeaderRow item={item} />;
    case "workflowDefinition":
      return <WorkflowDefinitionNavigationRow item={item} runCommand={runCommand} />;
    default:
      return assertNever(item);
  }
}

function ActiveWorkspaceNavigationRow({
  busy,
  chatCreateBusy,
  item,
  runCommand,
  workspaceConversationLists,
  workspaceWorkflowDefinitionLists,
}: {
  busy: boolean;
  chatCreateBusy: boolean;
  item: Extract<SidebarNavigationItem, { kind: "activeWorkspace" }>;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
  workspaceConversationLists: Record<string, SidebarWorkspaceConversationState | undefined>;
  workspaceWorkflowDefinitionLists: Record<
    string,
    SidebarWorkspaceWorkflowDefinitionState | undefined
  >;
}) {
  const workspaceList = workspaceConversationLists[item.workspace.id];
  const workflowList = workspaceWorkflowDefinitionLists[item.workspace.id];
  return (
    <ProjectRow
      busy={busy}
      chatCreateBusy={chatCreateBusy}
      corruption={workspaceList?.corruption ?? null}
      diagnostics={workspaceList?.diagnostics ?? []}
      item={item}
      runCommand={runCommand}
      workflowCreateBusy={workflowList?.loading ?? false}
    />
  );
}

function ConversationNavigationRow({
  activeRun,
  conversationSelectionBusy,
  corruptionLabelsByConversationId,
  item,
  runCommand,
}: {
  activeRun: Run | null;
  conversationSelectionBusy: boolean;
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
        busy={conversationSelectionBusy && item.selected}
        corruptionLabel={corruptionLabel}
        deleteConversation={() => runCommand(item.commands.delete)}
        item={item.conversation}
        selectConversation={() => runCommand(item.commands.primary)}
        selected={item.selected}
        setConversationPinned={() => runCommand(item.commands.pin)}
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
  return <div className="h-7 px-6 py-1 text-xs text-muted-foreground">{item.label}</div>;
}

function WorkflowStatusRow({
  item,
}: {
  item: Extract<SidebarNavigationItem, { kind: "emptyWorkflowList" }>;
}) {
  return <div className="h-7 px-6 py-1 text-xs text-muted-foreground">{item.label}</div>;
}

function WorkflowDefinitionNavigationRow({
  item,
  runCommand,
}: {
  item: Extract<SidebarNavigationItem, { kind: "workflowDefinition" }>;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
}) {
  return (
    <div className="pl-4">
      <button
        aria-current={item.selected ? "page" : undefined}
        className={cn(
          "grid h-7 w-full min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded-sm px-2 text-left hover:bg-accent/70",
          item.selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
        data-testid="workflow-definition-list-item"
        onClick={() => void runCommand(item.commands.primary)}
        title={item.definition.name}
        type="button"
      >
        <Workflow className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-xs">{item.definition.name}</span>
      </button>
    </div>
  );
}

function SectionHeaderRow({
  item,
}: {
  item: Extract<SidebarNavigationItem, { kind: "sectionHeader" }>;
}) {
  return (
    <div
      className="flex h-7 items-end px-6 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
      data-sidebar-section={item.section}
    >
      {item.label}
    </div>
  );
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
      className="h-7 w-full rounded-sm px-6 text-left text-xs text-muted-foreground hover:bg-accent/70 hover:text-foreground"
      onClick={() => void runCommand(item.commands.primary)}
      type="button"
    >
      {item.label}
    </button>
  );
}

function ProjectRow({
  busy,
  chatCreateBusy,
  corruption,
  diagnostics,
  item,
  runCommand,
  workflowCreateBusy,
}: {
  busy: boolean;
  chatCreateBusy: boolean;
  corruption: CorruptionSummary | null;
  diagnostics: Diagnostic[];
  item: Extract<SidebarNavigationItem, { kind: "activeWorkspace" }>;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
  workflowCreateBusy: boolean;
}) {
  const rowBusy = busy || chatCreateBusy || workflowCreateBusy;
  const { workspace } = item;

  return (
    <div className="group grid h-7 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center rounded-sm hover:bg-accent/55">
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
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <FolderClosed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span
          className={cn(
            "truncate text-xs",
            item.selected ? "font-medium text-foreground" : "text-muted-foreground",
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
          className="fixed z-50 w-56 rounded-sm border border-border bg-popover/95 p-1 shadow-2xl shadow-black/35 backdrop-blur"
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
      className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
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
      className="group/workspace-corruption grid h-6 w-6 place-items-center rounded-sm text-status-warning outline-none hover:bg-accent/80 focus-visible:bg-accent/80"
      data-testid="workspace-corruption-status"
      role="status"
      tabIndex={0}
      title={label}
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      <div
        className="pointer-events-none fixed z-50 hidden w-72 rounded-sm border border-border bg-popover/95 px-2 py-1.5 text-xs text-popover-foreground shadow-xl shadow-black/35 backdrop-blur group-hover/workspace-corruption:block group-focus/workspace-corruption:block"
        data-testid="workspace-corruption-tooltip"
        style={{ left: "calc(var(--sidebar-width, 220px) + 8px)" }}
      >
        <div className="font-medium text-status-warning">Malformed chat data</div>
        <div className="mt-1 break-words text-muted-foreground">{label}</div>
      </div>
    </div>
  );
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
      className="group grid h-7 grid-cols-[minmax(0,1fr)_auto] items-center rounded-sm hover:bg-accent/60"
      title={workspace.rootPath}
    >
      <button
        className="flex h-7 min-w-0 items-center gap-2 px-2 text-left"
        data-testid="recent-workspace-open"
        disabled={busy}
        onClick={() => void runCommand(item.commands.primary)}
        type="button"
      >
        <Workflow className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs text-muted-foreground">{workspace.displayName}</span>
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

function assertNever(value: never): never {
  throw new Error(`Unsupported sidebar navigation item: ${JSON.stringify(value)}`);
}
