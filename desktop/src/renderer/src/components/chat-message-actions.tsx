import type { ChatMessage } from "@generated/backend";
import { Check, Copy, Pencil, X } from "lucide-react";
import { useEffect, useRef } from "react";

export function UserMessageEditor({
  draft,
  onCancel,
  onChange,
  onSave,
  saving,
}: {
  draft: string;
  onCancel: () => void;
  onChange: (draft: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  return (
    <form
      className="w-full max-w-full overflow-hidden rounded-sm bg-zinc-800 px-2 py-1 text-[13px] leading-5 text-zinc-50"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <textarea
        aria-label="Edit message text"
        className="max-h-40 min-h-14 w-full resize-y bg-transparent p-0 text-[13px] leading-5 text-zinc-50 outline-none placeholder:text-zinc-500"
        disabled={saving}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSave();
          }
        }}
        ref={textareaRef}
        rows={3}
        value={draft}
      />
      <div className="mt-1 flex justify-end gap-1">
        <button
          aria-label="Cancel edit"
          className="grid h-5 w-5 place-items-center rounded-sm text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100"
          disabled={saving}
          onClick={onCancel}
          title="Cancel edit"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label="Save edit"
          className="grid h-5 w-5 place-items-center rounded-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-50 disabled:pointer-events-none disabled:text-zinc-600"
          disabled={saving || draft.trim() === ""}
          title="Save edit"
          type="submit"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}

export function MessageActions({
  canEdit,
  onEdit,
  text,
}: {
  canEdit: boolean;
  onEdit: () => void;
  text: string;
}) {
  if (text.trim() === "") {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
      <button
        aria-label="Copy message"
        className="grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => void navigator.clipboard.writeText(text)}
        title="Copy message"
        type="button"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      {canEdit ? (
        <button
          aria-label="Edit message"
          className="grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={onEdit}
          title="Edit message"
          type="button"
        >
          <Pencil className="h-3.5 w-3.5" />
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
      className="mt-1 block text-[11px] leading-none text-zinc-500"
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
