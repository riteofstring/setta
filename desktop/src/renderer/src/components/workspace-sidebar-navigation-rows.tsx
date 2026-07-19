import { AlertTriangle, FolderClosed, FolderOpen, LoaderCircle, X } from "lucide-react";

import { cn } from "../lib/utils";
import { SidebarIconButton } from "./sidebar-header-actions";
import { ConversationNavigatorRow } from "./workspace-sidebar-conversation-row";
import type { SidebarNavigationCommand, SidebarNavigationItem } from "./workspace-sidebar-model";

export function SidebarNavigationRow({
  busy,
  item,
  runCommand,
}: {
  busy: boolean;
  item: SidebarNavigationItem;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
}) {
  switch (item.kind) {
    case "activeWorkspace":
      return <ActiveWorkspaceRow busy={busy} item={item} runCommand={runCommand} />;
    case "conversation":
      return (
        <div className="pl-4">
          <ConversationNavigatorRow
            archive={() => runCommand(item.commands.archive)}
            busy={busy}
            focused={item.focused}
            item={item.item}
            lineageParentTitle={item.lineageParentTitle}
            openPaneId={item.openPaneId}
            present={() => runCommand(item.commands.primary)}
            readOnly={item.readOnly}
          />
        </div>
      );
    case "conversationStatus":
      return (
        <div className="flex h-9 items-center px-6 text-xs text-muted-foreground">{item.label}</div>
      );
    case "loadMoreConversations":
      return (
        <button
          className="flex h-9 w-full items-center gap-2 rounded-sm px-6 text-left text-xs text-muted-foreground hover:bg-accent/70 hover:text-foreground disabled:opacity-50"
          disabled={item.loading}
          onClick={() => void runCommand(item.commands.primary)}
          type="button"
        >
          {item.loading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : null}
          {item.label}
        </button>
      );
    case "recentWorkspace":
      return <RecentWorkspaceRow busy={busy} item={item} runCommand={runCommand} />;
    default:
      return assertNever(item);
  }
}

function ActiveWorkspaceRow({
  busy,
  item,
  runCommand,
}: {
  busy: boolean;
  item: Extract<SidebarNavigationItem, { kind: "activeWorkspace" }>;
  runCommand: (command: SidebarNavigationCommand) => Promise<void>;
}) {
  const FolderIcon = item.available ? (item.expanded ? FolderOpen : FolderClosed) : AlertTriangle;
  return (
    <div className="group grid h-9 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center rounded-sm hover:bg-accent/55">
      <button
        aria-current={item.selected ? "page" : undefined}
        aria-expanded={item.expanded}
        className="grid h-9 min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 px-2 text-left"
        data-testid="active-workspace-select"
        data-workspace-available={item.available}
        data-workspace-id={item.workspace.id}
        disabled={busy}
        onClick={() => void runCommand(item.commands.primary)}
        title={
          item.available ? item.workspace.rootPath : `${item.workspace.rootPath} (unavailable)`
        }
        type="button"
      >
        <FolderIcon
          aria-label={item.available ? undefined : "Workspace unavailable"}
          className={cn("h-3.5 w-3.5 text-muted-foreground", !item.available && "text-amber-400")}
        />
        <span
          className={cn(
            "truncate text-xs",
            item.selected ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {item.label}
        </span>
      </button>
      <div className="mr-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <SidebarIconButton
          disabled={busy}
          label={`Close ${item.label}`}
          onClick={() => void runCommand(item.commands.close)}
        >
          <X className="h-3.5 w-3.5" />
        </SidebarIconButton>
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
  return (
    <div className="group grid h-9 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center rounded-sm hover:bg-accent/55">
      <button
        className="grid h-9 min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 px-2 text-left text-muted-foreground hover:text-foreground"
        disabled={busy}
        onClick={() => void runCommand(item.commands.primary)}
        title={item.workspace.rootPath}
        type="button"
      >
        {item.available ? (
          <FolderClosed className="h-3.5 w-3.5" />
        ) : (
          <AlertTriangle
            aria-label="Workspace unavailable"
            className="h-3.5 w-3.5 text-amber-400"
          />
        )}
        <span className="truncate text-xs">{item.label}</span>
      </button>
      <div className="mr-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <SidebarIconButton
          disabled={busy}
          label={`Forget ${item.label}`}
          onClick={() => void runCommand(item.commands.remove)}
        >
          <X className="h-3.5 w-3.5" />
        </SidebarIconButton>
      </div>
    </div>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unsupported sidebar navigation item: ${JSON.stringify(value)}`);
}
