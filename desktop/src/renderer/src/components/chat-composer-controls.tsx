import { ArrowUp, MessageSquarePlus, Square, Zap } from "lucide-react";
import type { KeyboardEvent } from "react";

import { Button } from "./ui/button";

export interface ComposerKeyActions {
  completeCommand: () => void;
  draftEmpty: boolean;
  dismissModelPicker: () => void;
  hasPendingSteering: boolean;
  modelPickerOpen: boolean;
  queueDraft: () => Promise<void> | void;
  running: boolean;
  sendDraft: () => Promise<void> | void;
  sendImmediateSteering: () => Promise<void> | void;
  slashDraft: boolean;
  stopRun: () => Promise<void> | void;
}

export function handleComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  actions: ComposerKeyActions,
) {
  if (isDismissShortcut(event, actions.modelPickerOpen)) {
    event.preventDefault();
    actions.dismissModelPicker();
    return;
  }
  if (
    isImmediateSteeringShortcut(
      event,
      actions.running,
      actions.draftEmpty,
      actions.hasPendingSteering,
    )
  ) {
    event.preventDefault();
    void actions.sendImmediateSteering();
    return;
  }
  if (isQueueShortcut(event)) {
    event.preventDefault();
    if (actions.slashDraft) {
      actions.completeCommand();
      return;
    }
    focusTextareaSoon(event.currentTarget);
    void actions.queueDraft();
    return;
  }
  if (isStopShortcut(event, actions.running)) {
    event.preventDefault();
    void actions.stopRun();
    return;
  }
  if (!isSubmitShortcut(event)) {
    return;
  }
  event.preventDefault();
  focusTextareaSoon(event.currentTarget);
  void actions.sendDraft();
}

function isDismissShortcut(event: KeyboardEvent<HTMLTextAreaElement>, modelPickerOpen: boolean) {
  return modelPickerOpen && event.key === "Escape";
}

function isQueueShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
  return event.key === "Tab" && !event.nativeEvent.isComposing;
}

function isStopShortcut(event: KeyboardEvent<HTMLTextAreaElement>, running: boolean) {
  return running && event.key === "c" && event.ctrlKey && !hasTextSelection(event.currentTarget);
}

function isImmediateSteeringShortcut(
  event: KeyboardEvent<HTMLTextAreaElement>,
  running: boolean,
  draftEmpty: boolean,
  hasPendingSteering: boolean,
) {
  return running && draftEmpty && hasPendingSteering && event.key === "Escape";
}

function isSubmitShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
  return (
    event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing
  );
}

function hasTextSelection(textarea: HTMLTextAreaElement) {
  return textarea.selectionStart !== textarea.selectionEnd;
}

function focusTextareaSoon(textarea: HTMLTextAreaElement) {
  if (typeof textarea.focus !== "function") {
    return;
  }
  globalThis.setTimeout(() => textarea.focus(), 0);
}

export function ComposerButton({
  canSend,
  canSendImmediately,
  chat,
  queueDraft,
  running,
  sendImmediateSteering,
}: {
  canSend: boolean;
  canSendImmediately: boolean;
  chat: {
    operation: string | null;
    stopActiveRun: () => Promise<void>;
  };
  queueDraft: () => Promise<void>;
  running: boolean;
  sendImmediateSteering: () => Promise<void>;
}) {
  if (running) {
    return (
      <div className="flex items-center gap-1">
        <Button
          aria-label="Send steering message"
          className="h-6 w-6 shrink-0 rounded-sm border-zinc-100 bg-zinc-100 px-0 text-zinc-950 hover:bg-white disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-500"
          disabled={!canSend}
          title="Send steering message"
          type="submit"
          variant="primary"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Queue follow-up"
          className="h-6 w-6 shrink-0 rounded-sm border-zinc-700 bg-zinc-800 px-0 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
          disabled={
            !canSend ||
            chat.operation === "queueing" ||
            chat.operation === "sendingSteeringImmediately"
          }
          onClick={() => void queueDraft()}
          title="Queue follow-up"
          type="button"
          variant="secondary"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </Button>
        <Button
          aria-label="Interrupt and send pending steering"
          className="h-6 w-6 shrink-0 rounded-sm border-zinc-700 bg-zinc-800 px-0 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
          disabled={!canSendImmediately || chat.operation === "sendingSteeringImmediately"}
          onClick={() => void sendImmediateSteering()}
          title="Interrupt and send pending steering"
          type="button"
          variant="secondary"
        >
          <Zap className="h-3.5 w-3.5" />
        </Button>
        <Button
          aria-label="Stop run"
          className="h-6 w-6 shrink-0 rounded-sm border-zinc-700 bg-zinc-800 px-0 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
          disabled={
            chat.operation === "cancelling" || chat.operation === "sendingSteeringImmediately"
          }
          onClick={() => void chat.stopActiveRun()}
          title="Stop run"
          type="button"
          variant="secondary"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }
  return (
    <Button
      aria-label="Send message"
      className="h-6 w-6 shrink-0 rounded-sm border-zinc-100 bg-zinc-100 px-0 text-zinc-950 hover:bg-white disabled:border-zinc-600 disabled:bg-zinc-700 disabled:text-zinc-500"
      disabled={!canSend}
      title="Send message"
      type="submit"
      variant="primary"
    >
      <ArrowUp className="h-4 w-4" />
    </Button>
  );
}
