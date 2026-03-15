import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import type { KeyboardEvent } from "react";
import {
  cycleQueuedDraftSelection as resolveQueuedDraftSelection,
  type QueuedChatDraft,
} from "./chatInputSubmission";

type ChatInputQueuedDraftStackProps = {
  queuedDrafts: QueuedChatDraft[];
  selectedQueuedDraftId: string | null;
  onRestoreQueuedDraft: (draftId: string) => void;
  onSelectedQueuedDraftIdChange: (draftId: string) => void;
};

export function ChatInputQueuedDraftStack({
  queuedDrafts,
  selectedQueuedDraftId,
  onRestoreQueuedDraft,
  onSelectedQueuedDraftIdChange,
}: ChatInputQueuedDraftStackProps) {
  if (queuedDrafts.length === 0) {
    return null;
  }

  const handleQueuedDraftKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const draftId = event.currentTarget.dataset.chatQueuedDraftId;
      if (!draftId) {
        return;
      }
      onRestoreQueuedDraft(draftId);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const nextSelection = resolveQueuedDraftSelection(
        queuedDrafts,
        selectedQueuedDraftId,
        event.key === "ArrowUp" ? "prev" : "next",
      );
      if (!nextSelection) {
        return;
      }
      onSelectedQueuedDraftIdChange(nextSelection);
    }
  };

  return (
    <div
      className="mb-1 flex flex-col gap-1"
      data-chat-queued-draft-stack="true"
    >
      {queuedDrafts.map((draft, index) => {
        const isSelected = draft.id === selectedQueuedDraftId;
        const previewText = draft.message.trim();
        const attachmentCount = draft.attachments.length;
        const attachmentLabel =
          attachmentCount === 1
            ? "1 attachment"
            : `${attachmentCount} attachments`;
        const queuedDraftTooltipHandlers = getFloatingBoxHandlers({
          title: "Queued draft",
          content:
            previewText.length > 0 ? previewText : "Queued attachment message",
        });

        return (
          <button
            key={draft.id}
            type="button"
            className={`grid w-full grid-cols-[1.75rem_minmax(0,1fr)] overflow-hidden rounded-md border text-left transition-colors ${
              isSelected
                ? "border-blue-400/90 bg-blue-200 text-setta-950 dark:border-blue-700/80 dark:bg-blue-950 dark:text-white"
                : "border-blue-300/75 bg-blue-100/85 text-setta-900 hover:border-blue-400/80 hover:bg-blue-200/80 dark:border-blue-800/70 dark:bg-blue-950/70 dark:text-blue-100 dark:hover:border-blue-700 dark:hover:bg-blue-900/80"
            }`}
            data-chat-queued-draft="true"
            data-chat-queued-draft-id={draft.id}
            data-selected={isSelected ? "true" : "false"}
            onClick={() => onSelectedQueuedDraftIdChange(draft.id)}
            onDoubleClick={() => onRestoreQueuedDraft(draft.id)}
            onKeyDown={handleQueuedDraftKeyDown}
            {...queuedDraftTooltipHandlers}
          >
            <div
              className={`flex h-full items-center justify-center text-[10px] font-semibold ${
                isSelected
                  ? "bg-blue-300/75 text-blue-900 dark:bg-blue-900/80 dark:text-blue-100"
                  : "bg-blue-200/75 text-blue-900 dark:bg-blue-900/65 dark:text-blue-200"
              }`}
              data-chat-queued-draft-rail="true"
            >
              <span className="inline-flex h-4 min-w-4 items-center justify-center">
                {index + 1}
              </span>
            </div>
            <div className="min-w-0 px-2 py-1">
              <div className="flex min-w-0 items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em]">
                <span>Queued</span>
                {attachmentCount > 0 ? (
                  <span className="truncate opacity-80">{attachmentLabel}</span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-[11px] font-medium">
                {previewText.length > 0 ? previewText : "(Attachment message)"}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
