import type { MasterInput, MasterInputModality, MasterInputSource } from "@generated/backend";
import type { DesktopPlatform, WorkspaceBrowserViewKeyEvent } from "@shared/types";
import {
  ArrowUp,
  Check,
  LoaderCircle,
  MessageCircleMore,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "../../lib/utils";
import type {
  AppShellMasterController,
  AppShellMasterSnapshot,
  MasterInputSubmissionState,
} from "./app-shell-master-controller";

interface MasterOverlayShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export function AppShellMasterSurface({
  children,
  controller,
  platform,
}: {
  children: (overlayOpen: boolean) => ReactNode;
  controller: AppShellMasterController;
  platform: DesktopPlatform;
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (isMasterOverlayShortcut(event)) {
        event.preventDefault();
        controller.openOverlay();
        return;
      }
      if (event.key === "Escape" && !event.isComposing && controller.getSnapshot().overlayOpen) {
        event.preventDefault();
        controller.closeOverlay();
      }
    };
    const handleNativeViewKey = (event: WorkspaceBrowserViewKeyEvent) => {
      if (isMasterOverlayShortcut(event)) {
        controller.openOverlay();
      }
    };
    const unsubscribeNativeViewKey =
      window.setta.workspaceNativeViews?.onBrowserViewKey(handleNativeViewKey) ?? (() => {});
    window.addEventListener("keydown", handleWindowKeyDown, { capture: true });
    return () => {
      unsubscribeNativeViewKey();
      window.removeEventListener("keydown", handleWindowKeyDown, { capture: true });
    };
  }, [controller]);

  return (
    <>
      {children(snapshot.overlayOpen)}
      {snapshot.overlayOpen ? (
        <MasterOverlay controller={controller} platform={platform} snapshot={snapshot} />
      ) : null}
    </>
  );
}

export function MasterSidebarLauncher({
  disabled,
  onOpen,
}: {
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      aria-label="Open Ask Setta"
      className="setta-master-sidebar-launcher"
      data-testid="master-sidebar-launcher"
      disabled={disabled}
      onClick={onOpen}
      type="button"
    >
      <span aria-hidden="true" className="setta-master-sidebar-launcher-icon">
        <Sparkles />
      </span>
      <span className="min-w-0 flex-1 truncate text-left">Ask Setta</span>
      <MessageCircleMore aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-55" />
    </button>
  );
}

export function isMasterOverlayShortcut(event: MasterOverlayShortcutEvent): boolean {
  return (
    event.key.toLowerCase() === "k" &&
    !event.altKey &&
    !event.shiftKey &&
    (event.metaKey || event.ctrlKey)
  );
}

export function masterOverlayShortcutLabel(platform: DesktopPlatform): string {
  return platform === "darwin" ? "⌘K" : "Ctrl+K";
}

function MasterOverlay({
  controller,
  platform,
  snapshot,
}: {
  controller: AppShellMasterController;
  platform: DesktopPlatform;
  snapshot: AppShellMasterSnapshot;
}) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [synchronousError, setSynchronousError] = useState<string | null>(null);
  const submissionBlocksNewInput =
    snapshot.submission.type === "submitting" || snapshot.submission.type === "failed";
  const canSubmit =
    snapshot.runtimeId !== null && !submissionBlocksNewInput && snapshot.draft.trim() !== "";

  useEffect(() => {
    composerRef.current?.focus();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setSynchronousError(null);
    try {
      controller.submitText(snapshot.draft);
      controller.setDraft("");
    } catch (error) {
      setSynchronousError(masterSurfaceErrorMessage(error));
    }
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <div className="setta-master-overlay-layer" data-testid="master-overlay-layer">
      <div
        aria-hidden="true"
        className="setta-master-overlay-backdrop"
        onMouseDown={() => controller.closeOverlay()}
      />
      <section
        aria-labelledby="setta-master-overlay-title"
        aria-modal="true"
        className="setta-master-overlay"
        data-master-overlay-state="open"
        data-testid="master-overlay"
        role="dialog"
      >
        <header className="setta-master-overlay-header">
          <span aria-hidden="true" className="setta-master-overlay-mark">
            <Sparkles />
          </span>
          <div className="min-w-0 flex-1">
            <div className="setta-master-overlay-eyebrow">Global master</div>
            <h1 id="setta-master-overlay-title">Ask Setta</h1>
          </div>
          <kbd className="setta-master-overlay-shortcut">
            {masterOverlayShortcutLabel(platform)}
          </kbd>
          <button
            aria-label="Close Ask Setta"
            className="setta-master-overlay-icon-button"
            onClick={() => controller.closeOverlay()}
            type="button"
          >
            <X />
          </button>
        </header>

        <MasterInteractionHistory controller={controller} snapshot={snapshot} />

        <footer className="setta-master-overlay-footer">
          {snapshot.submission.type === "failed" ? (
            <MasterSubmissionFailureActions controller={controller} snapshot={snapshot} />
          ) : null}
          {synchronousError ? (
            <div className="setta-master-overlay-error" role="alert">
              {synchronousError}
            </div>
          ) : null}
          <form className="setta-master-overlay-composer" onSubmit={submit}>
            <textarea
              aria-label="Ask Setta"
              onChange={(event) => controller.setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={masterComposerPlaceholder(snapshot)}
              ref={composerRef}
              rows={2}
              value={snapshot.draft}
            />
            <button
              aria-label="Send to Setta"
              className="setta-master-overlay-send"
              disabled={!canSubmit}
              type="submit"
            >
              <ArrowUp />
            </button>
          </form>
          <div className="setta-master-overlay-composer-hint">
            <span>Enter to send · Shift+Enter for a new line</span>
            <span>{masterConnectionLabel(snapshot)}</span>
          </div>
        </footer>
      </section>
    </div>
  );
}

function MasterInteractionHistory({
  controller,
  snapshot,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
}) {
  const pending = pendingMasterInput(snapshot.submission);
  const empty = snapshot.recentInputs.length === 0 && pending === null;
  const historyStatus = masterHistoryStatus(controller, snapshot);

  return (
    <div className="setta-master-overlay-history" data-testid="master-overlay-history">
      {historyStatus}
      {empty && historyStatus === null ? (
        <div className="setta-master-overlay-empty">
          <span aria-hidden="true" className="setta-master-overlay-empty-icon">
            <MessageCircleMore />
          </span>
          <h2>What should Setta bring into focus?</h2>
          <p>Find a recent topic, open a conversation, or start work somewhere new.</p>
        </div>
      ) : (
        <ol aria-label="Recent master exchanges" className="setta-master-overlay-exchanges">
          {snapshot.recentInputs.map((accepted) => (
            <MasterInputExchange input={accepted.input} key={accepted.input.id} state="accepted" />
          ))}
          {pending ? (
            <MasterInputExchange
              input={pending.input}
              key={pending.input.id}
              state={pending.state}
            />
          ) : null}
        </ol>
      )}
    </div>
  );
}

function masterHistoryStatus(
  controller: AppShellMasterController,
  snapshot: AppShellMasterSnapshot,
) {
  switch (snapshot.history.type) {
    case "disconnected":
    case "ready":
      return null;
    case "loading":
      return (
        <div className="setta-master-overlay-history-status" role="status">
          <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />
          Restoring recent master exchanges…
        </div>
      );
    case "failed":
      return (
        <div className="setta-master-overlay-history-status is-failed" role="alert">
          <span>{snapshot.history.message}</span>
          <button onClick={controller.retryHistory} type="button">
            <RotateCcw aria-hidden="true" />
            Retry
          </button>
        </div>
      );
    default:
      return assertNever(snapshot.history);
  }
}

function MasterInputExchange({
  input,
  state,
}: {
  input: MasterInput;
  state: "accepted" | "failed" | "submitting";
}) {
  return (
    <li className="setta-master-overlay-exchange" data-master-input-id={input.id}>
      <article className="setta-master-overlay-user-message" data-master-speaker="user">
        <div className="setta-master-overlay-message-meta">
          <span>You</span>
          <span>{masterInputContextLabel(input.modality, input.source)}</span>
        </div>
        <p>{input.text}</p>
      </article>
      <div
        className={cn("setta-master-overlay-receipt", `is-${state}`)}
        data-master-input-state={state}
        role="status"
      >
        <MasterInputStateIcon state={state} />
        <span>{masterInputStateLabel(state)}</span>
      </div>
    </li>
  );
}

function MasterInputStateIcon({ state }: { state: "accepted" | "failed" | "submitting" }) {
  switch (state) {
    case "accepted":
      return <Check aria-hidden="true" />;
    case "failed":
      return <X aria-hidden="true" />;
    case "submitting":
      return <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />;
    default:
      return assertNever(state);
  }
}

function MasterSubmissionFailureActions({
  controller,
  snapshot,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
}) {
  if (snapshot.submission.type !== "failed") {
    return null;
  }
  return (
    <div className="setta-master-overlay-failure" role="alert">
      <span>{snapshot.submission.message}</span>
      <span className="setta-master-overlay-failure-actions">
        <button onClick={() => controller.retry()} type="button">
          <RotateCcw aria-hidden="true" />
          Retry
        </button>
        <button onClick={() => controller.discard()} type="button">
          <Trash2 aria-hidden="true" />
          Discard
        </button>
      </span>
    </div>
  );
}

function pendingMasterInput(
  submission: MasterInputSubmissionState,
): { input: MasterInput; state: "failed" | "submitting" } | null {
  switch (submission.type) {
    case "failed":
      return { input: submission.input, state: "failed" };
    case "submitting":
      return { input: submission.input, state: "submitting" };
    case "accepted":
    case "idle":
      return null;
    default:
      return assertNever(submission);
  }
}

function masterInputContextLabel(modality: MasterInputModality, source: MasterInputSource): string {
  const modalityLabel = masterInputModalityLabel(modality);
  switch (source) {
    case "conversation_escalation":
      return `${modalityLabel} · Conversation escalation`;
    case "shell":
      return modalityLabel;
    default:
      return assertNever(source);
  }
}

function masterInputModalityLabel(modality: MasterInputModality): string {
  switch (modality) {
    case "text":
      return "Text";
    case "voice":
      return "Voice";
    default:
      return assertNever(modality);
  }
}

function masterInputStateLabel(state: "accepted" | "failed" | "submitting"): string {
  switch (state) {
    case "accepted":
      return "Accepted into the global master session";
    case "failed":
      return "The request was not accepted";
    case "submitting":
      return "Submitting to the global master session";
    default:
      return assertNever(state);
  }
}

function masterComposerPlaceholder(snapshot: AppShellMasterSnapshot): string {
  if (!snapshot.runtimeId) {
    return "Connect to a Setta runtime to ask the global master";
  }
  if (snapshot.submission.type === "failed") {
    return "Retry or discard the failed request before sending another";
  }
  return "Find, open, or start a topic conversation…";
}

function masterConnectionLabel(snapshot: AppShellMasterSnapshot): string {
  if (!snapshot.runtimeId) {
    return "Runtime disconnected";
  }
  if (snapshot.history.type === "loading") {
    return "Restoring history";
  }
  if (snapshot.history.type === "failed") {
    return "History unavailable";
  }
  switch (snapshot.submission.type) {
    case "accepted":
      return "Request accepted";
    case "failed":
      return "Action required";
    case "idle":
      return "Ready";
    case "submitting":
      return "Submitting";
    default:
      return assertNever(snapshot.submission);
  }
}

function masterSurfaceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The master request could not be submitted.";
}

function assertNever(value: never): never {
  throw new Error(`Unsupported master surface value: ${JSON.stringify(value)}`);
}
