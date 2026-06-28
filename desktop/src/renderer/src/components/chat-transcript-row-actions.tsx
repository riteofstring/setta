import type { ChatInput, ChatMessage, Run } from "@generated/backend";
import { Check, Pencil, Trash2, X, Zap } from "lucide-react";

import {
  chatInputFromMessageEdit,
  chatInputHasContent,
  chatInputsEqual,
  chatMessagePartsText,
} from "../lib/chat-input";
import { cn } from "../lib/utils";
import { startStoreBackedChatInteractiveAction } from "../stores/chat-interactive-actions";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export interface TranscriptRowActions {
  activeRun: Run | null;
  editQueuedMessage: (messageId: string, input: ChatInput) => Promise<void>;
  editingQueuedMessageId: string | null;
  operation: string | null;
  removeQueuedMessage: (messageId: string) => Promise<void>;
  removingQueuedMessageId: string | null;
  sendSteeringImmediately: (input?: ChatInput) => Promise<void>;
}

export function MessageRowActions({
  confirmRemove,
  draft,
  editMode,
  message,
  pendingSteering,
  queuedEditable,
  rowActions,
  rowBusy,
  saveQueuedEdit,
  setConfirmRemove,
  setDraft,
  setEditMode,
  removeQueued,
}: {
  confirmRemove: boolean;
  draft: string;
  editMode: boolean;
  message: ChatMessage;
  pendingSteering: boolean;
  queuedEditable: boolean;
  rowActions: TranscriptRowActions;
  rowBusy: boolean;
  saveQueuedEdit: () => Promise<void>;
  setConfirmRemove: (value: boolean) => void;
  setDraft: (value: string) => void;
  setEditMode: (value: boolean) => void;
  removeQueued: () => Promise<void>;
}) {
  if (!queuedEditable && !pendingSteering) {
    return null;
  }
  const actionClass =
    "h-6 w-6 shrink-0 rounded-sm border-border bg-secondary px-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground";
  return (
    <div className="mb-1 flex h-6 min-w-14 justify-end gap-1">
      {editMode ? (
        <>
          <Button
            aria-label="Save queued message"
            className={actionClass}
            disabled={!canSaveQueuedEdit(message, draft, rowBusy)}
            onClick={() => void saveQueuedEdit()}
            title="Save queued message"
            type="button"
            variant="secondary"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            aria-label="Cancel queued edit"
            className={actionClass}
            disabled={rowBusy}
            onClick={() => {
              setDraft(chatMessageText(message));
              setEditMode(false);
            }}
            title="Cancel queued edit"
            type="button"
            variant="secondary"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : confirmRemove ? (
        <>
          <Button
            aria-label="Remove queued message"
            className={cn(actionClass, "text-red-300 hover:text-red-200")}
            disabled={rowBusy}
            onClick={() => void removeQueued()}
            title="Remove queued message"
            type="button"
            variant="secondary"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            aria-label="Cancel remove"
            className={actionClass}
            disabled={rowBusy}
            onClick={() => setConfirmRemove(false)}
            title="Cancel remove"
            type="button"
            variant="secondary"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : queuedEditable ? (
        <>
          <Button
            aria-label="Edit queued message"
            className={actionClass}
            disabled={rowBusy}
            onClick={() => {
              setDraft(chatMessageText(message));
              setEditMode(true);
              setConfirmRemove(false);
            }}
            title="Edit queued message"
            type="button"
            variant="secondary"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            aria-label="Confirm queued message removal"
            className={actionClass}
            disabled={rowBusy}
            onClick={() => {
              setConfirmRemove(true);
              setEditMode(false);
            }}
            title="Confirm queued message removal"
            type="button"
            variant="secondary"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <Button
          aria-label="Interrupt and send pending steering"
          className={actionClass}
          disabled={
            rowActions.operation === "sendingSteeringImmediately" ||
            rowActions.operation === "cancelling"
          }
          onClick={() =>
            startStoreBackedChatInteractiveAction("send-pending-steering", () =>
              rowActions.sendSteeringImmediately(),
            )
          }
          title="Interrupt and send pending steering"
          type="button"
          variant="secondary"
        >
          <Zap className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function QueuedMessageEditor({
  draft,
  message,
  rowBusy,
  saveQueuedEdit,
  setDraft,
  setEditMode,
}: {
  draft: string;
  message: ChatMessage;
  rowBusy: boolean;
  saveQueuedEdit: () => Promise<void>;
  setDraft: (value: string) => void;
  setEditMode: (value: boolean) => void;
}) {
  return (
    <Textarea
      aria-label="Queued message text"
      className="max-h-36 min-h-16 min-w-0 resize-y overflow-y-auto border-border bg-background/70 px-2 py-1.5 text-xs leading-5 text-foreground shadow-none focus-visible:border-ring"
      disabled={rowBusy}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(chatMessageText(message));
          setEditMode(false);
          return;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void saveQueuedEdit();
        }
      }}
      rows={3}
      value={draft}
    />
  );
}

export function isQueuedEditableMessage(message: ChatMessage) {
  return message.role === "user" && message.delivery === "queued" && message.status === "pending";
}

export function isPendingSteeringMessage(message: ChatMessage, activeRun: Run | null) {
  return (
    message.role === "user" &&
    message.delivery === "steering" &&
    message.status === "pending" &&
    activeRun?.id === message.runId
  );
}

export function canSaveQueuedEdit(message: ChatMessage, draft: string, rowBusy: boolean) {
  const trimmed = draft.trim();
  const input = chatInputFromMessageEdit(message, trimmed);
  const current = chatInputFromMessageEdit(message, chatMessageText(message).trim());
  return !rowBusy && chatInputHasContent(input) && !chatInputsEqual(input, current);
}

function chatMessageText(message: ChatMessage) {
  return chatMessagePartsText(message.parts);
}
