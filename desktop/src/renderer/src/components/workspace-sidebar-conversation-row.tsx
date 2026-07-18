import type { NavigatorItem } from "@generated/backend";
import { AlertTriangle, Archive, Check, LoaderCircle } from "lucide-react";

import { conversationPaletteStyle } from "../features/easy-button/conversation-palette-style";
import { cn } from "../lib/utils";

export function ConversationNavigatorRow({
  archive,
  busy,
  focused,
  item,
  lineageParentTitle,
  openPaneId,
  present,
  readOnly,
}: {
  archive: () => Promise<void>;
  busy: boolean;
  focused: boolean;
  item: NavigatorItem;
  lineageParentTitle: string | null;
  openPaneId: string | null;
  present: () => Promise<void>;
  readOnly: boolean;
}) {
  const { conversation, presentationProfile } = item;
  const archiveAllowed = conversation.status === "idle" || conversation.status === "failed";
  return (
    <div className="group/conversation-row relative h-9 min-w-0">
      <button
        aria-current={focused ? "page" : undefined}
        aria-label={conversationRowLabel(item, lineageParentTitle, openPaneId)}
        className={cn(
          "conversation-navigator-row conversation-presentation-identity group/conversation-row grid h-9 w-full min-w-0 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 text-left hover:text-foreground",
          focused ? "text-foreground" : "text-muted-foreground",
        )}
        data-conversation-id={conversation.id}
        data-conversation-palette={presentationProfile.resolvedPaletteId}
        data-parent-conversation-id={item.branch?.parentConversationId}
        data-testid="conversation-navigator-item"
        data-workspace-read-only={readOnly}
        disabled={busy}
        onClick={() => void present()}
        style={conversationPaletteStyle(presentationProfile.resolvedPaletteId)}
        title={conversation.title}
        type="button"
      >
        <ConversationStatus status={conversation.status} />
        <span className="min-w-0">
          <span className="block truncate text-xs">{conversation.title}</span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {conversationSubtitle(item, lineageParentTitle)}
          </span>
        </span>
        <ConversationOpenPaneStatus open={openPaneId !== null} />
      </button>
      <button
        aria-label={`Archive ${conversation.title}`}
        className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-sm bg-background/95 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-0 group-focus-within/conversation-row:opacity-100 group-hover/conversation-row:opacity-100"
        data-conversation-id={conversation.id}
        data-testid="conversation-archive"
        disabled={busy || readOnly || !archiveAllowed}
        onClick={() => void archive()}
        title={
          readOnly
            ? "Workspace unavailable"
            : archiveAllowed
              ? `Archive ${conversation.title}`
              : "Finish active work before archiving"
        }
        type="button"
      >
        <Archive className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ConversationStatus({ status }: { status: NavigatorItem["conversation"]["status"] }) {
  const commonClass = "h-3.5 w-3.5";
  switch (status) {
    case "working":
      return (
        <LoaderCircle
          aria-label="Conversation working"
          className={cn(commonClass, "animate-spin text-[var(--conversation-accent)]")}
          role="status"
        />
      );
    case "waiting_for_approval":
      return (
        <AlertTriangle
          aria-label="Conversation waiting for approval"
          className={cn(commonClass, "text-status-warning")}
          role="status"
        />
      );
    case "failed":
      return (
        <AlertTriangle
          aria-label="Conversation failed"
          className={cn(commonClass, "text-status-critical-muted")}
          role="status"
        />
      );
    case "idle":
      return (
        <span
          aria-label="Conversation idle"
          className="h-2.5 w-2.5 rounded-full bg-[var(--conversation-accent)] opacity-70"
          role="status"
        />
      );
    default:
      return assertNever(status);
  }
}

function ConversationOpenPaneStatus({ open }: { open: boolean }) {
  if (!open) {
    return null;
  }
  return <Check aria-label="Open in workspace" className="h-3.5 w-3.5" role="status" />;
}

function conversationSubtitle(item: NavigatorItem, lineageParentTitle: string | null) {
  if (item.branch) {
    return lineageParentTitle ? `Fork of ${lineageParentTitle}` : "Durable fork";
  }
  if (item.conversation.topicDescriptor) {
    return item.conversation.topicDescriptor;
  }
  return statusLabel(item.conversation.status);
}

function conversationRowLabel(
  item: NavigatorItem,
  lineageParentTitle: string | null,
  openPaneId: string | null,
) {
  const lineage = item.branch
    ? lineageParentTitle
      ? `, durable fork of ${lineageParentTitle}`
      : ", durable fork"
    : "";
  const pane = openPaneId === null ? ", not open" : ", open in workspace";
  return `${item.conversation.title}, ${statusLabel(item.conversation.status)}${lineage}${pane}`;
}

function statusLabel(status: NavigatorItem["conversation"]["status"]) {
  switch (status) {
    case "failed":
      return "Failed";
    case "idle":
      return "Idle";
    case "waiting_for_approval":
      return "Waiting for approval";
    case "working":
      return "Working";
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported conversation status: ${String(value)}`);
}
