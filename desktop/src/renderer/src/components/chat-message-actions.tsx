import type { ChatMessage } from "@generated/backend";
import { Copy, RotateCcw } from "lucide-react";

export function MessageActions({ showRetry, text }: { showRetry: boolean; text: string }) {
  if (text.trim() === "") {
    return null;
  }
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100"
      data-testid="chat-message-actions"
    >
      <button
        aria-label="Copy message"
        className="grid h-6 w-6 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => void navigator.clipboard.writeText(text)}
        title="Copy message"
        type="button"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      {showRetry ? (
        <button
          aria-label="Retry message by forking conversation"
          className="grid h-6 w-6 place-items-center rounded-sm text-muted-foreground disabled:opacity-50"
          disabled
          title="Retry by forking this conversation is not wired yet"
          type="button"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function MessageTimestamp({ message }: { message: ChatMessage }) {
  const label = messageTime(message.createdAt);
  if (!label) {
    return null;
  }
  return (
    <time
      className="mt-1 block text-[11px] leading-none text-muted-foreground"
      data-testid="chat-message-timestamp"
      dateTime={message.createdAt}
      title={fullMessageTime(message.createdAt)}
    >
      {label}
    </time>
  );
}

function messageTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fullMessageTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    return "";
  }
  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
