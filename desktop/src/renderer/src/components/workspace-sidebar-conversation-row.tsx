import type { NavigatorItem } from "@generated/backend";
import { AlertTriangle, Check, Copy, LoaderCircle } from "lucide-react";

import { conversationPaletteStyle } from "../features/easy-button/conversation-palette-style";
import { cn } from "../lib/utils";

export function ConversationNavigatorRow({
  busy,
  focused,
  item,
  lineageParentTitle,
  openPaneCount,
  present,
}: {
  busy: boolean;
  focused: boolean;
  item: NavigatorItem;
  lineageParentTitle: string | null;
  openPaneCount: number;
  present: () => Promise<void>;
}) {
  const { conversation, presentationProfile } = item;
  return (
    <button
      aria-current={focused ? "page" : undefined}
      aria-label={conversationRowLabel(item, lineageParentTitle, openPaneCount)}
      className={cn(
        "conversation-navigator-row conversation-presentation-identity group/conversation-row grid h-9 w-full min-w-0 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 text-left hover:text-foreground",
        focused ? "text-foreground" : "text-muted-foreground",
      )}
      data-conversation-id={conversation.id}
      data-conversation-palette={presentationProfile.resolvedPaletteId}
      data-parent-conversation-id={item.branch?.parentConversationId}
      data-testid="conversation-navigator-item"
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
      <ConversationPaneCount count={openPaneCount} />
    </button>
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

function ConversationPaneCount({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  if (count === 1) {
    return <Check aria-label="One open view" className="h-3.5 w-3.5" role="status" />;
  }
  return (
    <span
      aria-label={`${count} open views`}
      className="flex items-center gap-0.5 text-[10px]"
      role="status"
    >
      <Copy className="h-3 w-3" />
      {count}
    </span>
  );
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
  openPaneCount: number,
) {
  const lineage = item.branch
    ? lineageParentTitle
      ? `, durable fork of ${lineageParentTitle}`
      : ", durable fork"
    : "";
  const views =
    openPaneCount === 0
      ? ", no open views"
      : `, ${openPaneCount} open ${openPaneCount === 1 ? "view" : "views"}`;
  return `${item.conversation.title}, ${statusLabel(item.conversation.status)}${lineage}${views}`;
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
