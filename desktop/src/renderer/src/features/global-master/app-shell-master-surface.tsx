import type {
  AppearanceMasterVoiceShortcut,
  MasterInput,
  MasterInputModality,
  RouteDecision,
  RouteDecisionKind,
  ShellInteractionState,
} from "@generated/backend";
import type { DesktopPlatform, WorkspaceBrowserViewKeyEvent } from "@shared/types";
import {
  ArrowUp,
  Check,
  CircleAlert,
  LoaderCircle,
  MessageCircleMore,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type {
  AppShellMasterController,
  AppShellMasterSnapshot,
  MasterInteractionState,
} from "./app-shell-master-controller";
import {
  isMasterOverlayShortcut,
  isMasterVoiceShortcut,
  masterOverlayShortcutLabel,
  masterVoiceShortcutLabel,
} from "./master-shortcuts";
import {
  cancelMasterCaptureIfActive,
  createMasterVoiceModel,
  executeMasterVoiceCommand,
  MasterVoiceButton,
  MasterVoiceStatus,
} from "./master-voice-controls";
import {
  type AppShellSpeechCaptureContextValue,
  useAppShellSpeechCapture,
} from "../global-speech/app-shell-speech-capture";
import { masterSpeechPlaybackIntent } from "../global-speech/app-shell-master-speech-playback-intent";
import type { AppShellSpeechPlaybackController } from "../global-speech/app-shell-speech-playback-controller";
import { useAppShellSpeechPlayback } from "../global-speech/app-shell-speech-playback";
import { useAppearanceStore } from "../../stores/appearance-store";
import { defaultShortcutsSettings } from "../../workspace-layout/workspace-shortcuts";

export { isMasterOverlayShortcut, masterOverlayShortcutLabel } from "./master-shortcuts";

export function AppShellMasterSurface({
  children,
  controller,
  onOpenVoiceCredentialSettings,
  platform,
}: {
  children: (overlayOpen: boolean) => ReactNode;
  controller: AppShellMasterController;
  onOpenVoiceCredentialSettings: () => void;
  platform: DesktopPlatform;
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const speechCapture = useAppShellSpeechCapture();
  const speechCaptureController = speechCapture?.controller ?? null;
  const masterVoiceShortcut = useAppearanceStore(
    (state) =>
      (state.draft ?? state.settings)?.shortcuts?.masterVoice ??
      defaultShortcutsSettings.masterVoice,
  );
  const openVoiceCredentialSettingsFromMaster = useCallback(() => {
    controller.closeOverlay();
    onOpenVoiceCredentialSettings();
  }, [controller, onOpenVoiceCredentialSettings]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }
      if (isMasterVoiceShortcut(event, platform, masterVoiceShortcut)) {
        event.preventDefault();
        executeMasterVoiceCommand(speechCaptureController, openVoiceCredentialSettingsFromMaster);
        return;
      }
      if (isMasterOverlayShortcut(event)) {
        event.preventDefault();
        controller.openOverlay();
        return;
      }
      if (event.key === "Escape" && cancelMasterCaptureIfActive(speechCaptureController)) {
        event.preventDefault();
        return;
      }
      if (event.key === "Escape" && controller.getSnapshot().overlayOpen) {
        event.preventDefault();
        controller.closeOverlay();
      }
    };
    const handleNativeViewKey = (event: WorkspaceBrowserViewKeyEvent) => {
      if (isMasterVoiceShortcut(event, platform, masterVoiceShortcut)) {
        executeMasterVoiceCommand(speechCaptureController, openVoiceCredentialSettingsFromMaster);
        return;
      }
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
  }, [
    controller,
    masterVoiceShortcut,
    openVoiceCredentialSettingsFromMaster,
    platform,
    speechCaptureController,
  ]);

  return (
    <>
      {children(snapshot.overlayOpen)}
      {snapshot.overlayOpen ? (
        <MasterOverlay
          controller={controller}
          masterVoiceShortcut={masterVoiceShortcut}
          onOpenVoiceCredentialSettings={openVoiceCredentialSettingsFromMaster}
          platform={platform}
          snapshot={snapshot}
          speechCapture={speechCapture}
        />
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

function MasterOverlay({
  controller,
  masterVoiceShortcut,
  onOpenVoiceCredentialSettings,
  platform,
  snapshot,
  speechCapture,
}: {
  controller: AppShellMasterController;
  masterVoiceShortcut: AppearanceMasterVoiceShortcut;
  onOpenVoiceCredentialSettings: () => void;
  platform: DesktopPlatform;
  snapshot: AppShellMasterSnapshot;
  speechCapture: AppShellSpeechCaptureContextValue | null;
}) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [synchronousError, setSynchronousError] = useState<string | null>(null);
  const canSubmit = controller.canSubmitInput() && snapshot.draft.trim() !== "";
  const masterVoice = createMasterVoiceModel(speechCapture, platform, masterVoiceShortcut);

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
          <span className="setta-master-overlay-shortcuts">
            <kbd className="setta-master-overlay-shortcut">
              Text {masterOverlayShortcutLabel(platform)}
            </kbd>
            <kbd className="setta-master-overlay-shortcut">
              Voice {masterVoiceShortcutLabel(platform, masterVoiceShortcut)}
            </kbd>
          </span>
          <button
            aria-label="Close Ask Setta"
            className="setta-master-overlay-icon-button"
            onClick={() => controller.closeOverlay()}
            type="button"
          >
            <X />
          </button>
        </header>

        <MasterInteraction controller={controller} snapshot={snapshot} />

        <footer className="setta-master-overlay-footer">
          {snapshot.submission.type === "failed" ? (
            <MasterSubmissionFailureActions controller={controller} snapshot={snapshot} />
          ) : null}
          {snapshot.cancellation.type === "failed" ? (
            <MasterCancellationFailure controller={controller} snapshot={snapshot} />
          ) : null}
          {synchronousError ? (
            <div className="setta-master-overlay-error" role="alert">
              {synchronousError}
            </div>
          ) : null}
          <MasterVoiceStatus model={masterVoice} />
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
            <MasterVoiceButton
              model={masterVoice}
              onOpenVoiceCredentialSettings={onOpenVoiceCredentialSettings}
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

function MasterInteraction({
  controller,
  snapshot,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
}) {
  const pendingInput = pendingSubmissionInput(snapshot);
  if (pendingInput) {
    return (
      <div className="setta-master-overlay-interaction" data-testid="master-active-interaction">
        <MasterRequest input={pendingInput.input} />
        <MasterProgress state={pendingInput.state} />
      </div>
    );
  }
  switch (snapshot.interaction.type) {
    case "disconnected":
    case "idle":
      return <EmptyMasterInteraction />;
    case "loading":
      return (
        <InteractionStatus>
          <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />
          Restoring an unresolved master interaction…
        </InteractionStatus>
      );
    case "load_failed":
      return <InteractionFailure controller={controller} message={snapshot.interaction.message} />;
    case "observation_failed":
      return (
        <div className="setta-master-overlay-interaction" data-testid="master-active-interaction">
          <MasterRequest input={snapshot.interaction.state.input} />
          <InteractionFailure controller={controller} message={snapshot.interaction.message} />
          <MasterCancellationAction controller={controller} snapshot={snapshot} />
        </div>
      );
    case "active":
      return (
        <ActiveMasterInteraction
          controller={controller}
          snapshot={snapshot}
          state={snapshot.interaction.state}
        />
      );
    default:
      return assertNever(snapshot.interaction);
  }
}

function EmptyMasterInteraction() {
  return (
    <div className="setta-master-overlay-interaction" data-testid="master-active-interaction">
      <div className="setta-master-overlay-empty">
        <span aria-hidden="true" className="setta-master-overlay-empty-icon">
          <MessageCircleMore />
        </span>
        <h2>What should Setta bring into focus?</h2>
        <p>Find a recent topic, open a conversation, or start work somewhere new.</p>
      </div>
    </div>
  );
}

function ActiveMasterInteraction({
  controller,
  snapshot,
  state,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
  state: ShellInteractionState;
}) {
  return (
    <div
      className="setta-master-overlay-interaction"
      data-master-input-id={state.input.id}
      data-master-routing-status={state.status}
      data-testid="master-active-interaction"
    >
      <MasterRequest input={state.input} />
      <MasterRoutingResult controller={controller} snapshot={snapshot} state={state} />
    </div>
  );
}

function MasterRequest({ input }: { input: MasterInput }) {
  return (
    <article className="setta-master-overlay-user-message" data-testid="master-active-request">
      <div className="setta-master-overlay-message-meta">
        <span>Current request</span>
        <span>{masterInputModalityLabel(input.modality)}</span>
      </div>
      <p>{input.text}</p>
    </article>
  );
}

function MasterRoutingResult({
  controller,
  snapshot,
  state,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
  state: ShellInteractionState;
}) {
  const playback = useAppShellSpeechPlayback();
  switch (state.status) {
    case "accepted":
      return (
        <MasterActiveRoutingControls controller={controller} snapshot={snapshot} state="accepted" />
      );
    case "routing":
      return (
        <MasterActiveRoutingControls controller={controller} snapshot={snapshot} state="routing" />
      );
    case "cancelled":
      return (
        <div className="setta-master-overlay-result is-cancelled" role="status">
          <Square aria-hidden="true" />
          <div>
            <strong>Request cancelled</strong>
            <p>Setta stopped this routing request before it produced an action.</p>
          </div>
        </div>
      );
    case "failed":
      return (
        <div className="setta-master-overlay-result is-failed" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            <strong>Setta could not route this request</strong>
            <p>{requiredRouteFailure(state).message}</p>
          </div>
        </div>
      );
    case "decided": {
      const result = masterDecisionResult(state);
      return (
        <div
          className={`setta-master-overlay-result is-${result.tone}`}
          data-master-result-kind={result.kind}
          role="status"
        >
          <Check aria-hidden="true" />
          <div>
            <strong>{result.heading}</strong>
            <p>{result.text}</p>
          </div>
          {result.kind === "answer_global" ? (
            <MasterAnswerReplayButton controller={playback?.controller ?? null} state={state} />
          ) : null}
        </div>
      );
    }
    default:
      return assertNever(state.status);
  }
}

function MasterAnswerReplayButton({
  controller,
  state,
}: {
  controller: AppShellSpeechPlaybackController | null;
  state: ShellInteractionState;
}) {
  const readMasterVoiceSelection =
    typeof window === "undefined" ? undefined : window.setta.speech.readMasterVoiceSelection;
  const disabled = controller === null || !readMasterVoiceSelection;
  return (
    <button
      aria-label="Replay master answer"
      className="setta-master-overlay-replay"
      data-testid="master-answer-replay"
      disabled={disabled}
      onClick={() => replayMasterAnswer(controller, state)}
      title="Replay master answer"
      type="button"
    >
      <Volume2 aria-hidden="true" />
    </button>
  );
}

function replayMasterAnswer(
  controller: AppShellSpeechPlaybackController | null,
  state: ShellInteractionState,
): void {
  const readMasterVoiceSelection =
    typeof window === "undefined" ? undefined : window.setta.speech.readMasterVoiceSelection;
  if (!controller || !readMasterVoiceSelection) {
    return;
  }
  void readMasterVoiceSelection()
    .then((masterVoice) => {
      const intent = masterSpeechPlaybackIntent(state, masterVoice);
      if (!intent) {
        throw new Error("master answer replay requires a committed global answer");
      }
      controller.replay(intent);
    })
    .catch((error: unknown) => {
      console.info(`Master answer replay failed: ${masterSurfaceErrorMessage(error)}`);
    });
}

function MasterActiveRoutingControls({
  controller,
  snapshot,
  state,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
  state: "accepted" | "routing";
}) {
  return (
    <div className="setta-master-overlay-active-routing">
      <MasterProgress state={state} />
      <MasterCancellationAction controller={controller} snapshot={snapshot} />
    </div>
  );
}

function MasterCancellationAction({
  controller,
  snapshot,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
}) {
  if (snapshot.cancellation.type === "failed") {
    return null;
  }
  if (!controller.canCancelActiveInput()) {
    return snapshot.cancellation.type === "cancelling" ? (
      <button
        aria-label="Cancelling active Setta request"
        className="setta-master-overlay-cancel"
        disabled
        type="button"
      >
        <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />
        Cancelling…
      </button>
    ) : null;
  }
  return (
    <button
      aria-label="Cancel active Setta request"
      className="setta-master-overlay-cancel"
      onClick={controller.cancelActiveInput}
      type="button"
    >
      <Square aria-hidden="true" />
      Cancel request
    </button>
  );
}

function MasterProgress({ state }: { state: "accepted" | "routing" | "submitting" | "failed" }) {
  const failed = state === "failed";
  return (
    <div className={`setta-master-overlay-progress${failed ? " is-failed" : ""}`} role="status">
      {failed ? (
        <CircleAlert aria-hidden="true" />
      ) : (
        <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />
      )}
      {masterProgressLabel(state)}
    </div>
  );
}

function InteractionStatus({ children }: { children: ReactNode }) {
  return (
    <div className="setta-master-overlay-interaction" data-testid="master-active-interaction">
      <div className="setta-master-overlay-progress" role="status">
        {children}
      </div>
    </div>
  );
}

function InteractionFailure({
  controller,
  message,
}: {
  controller: AppShellMasterController;
  message: string;
}) {
  return (
    <div className="setta-master-overlay-restore-failure" role="alert">
      <span>{message}</span>
      <button onClick={controller.retryInteraction} type="button">
        <RotateCcw aria-hidden="true" />
        Retry
      </button>
    </div>
  );
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

function MasterCancellationFailure({
  controller,
  snapshot,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
}) {
  if (snapshot.cancellation.type !== "failed") {
    return null;
  }
  return (
    <div className="setta-master-overlay-failure" role="alert">
      <span>{snapshot.cancellation.message}</span>
      <span className="setta-master-overlay-failure-actions">
        <button onClick={controller.cancelActiveInput} type="button">
          <RotateCcw aria-hidden="true" />
          Retry cancellation
        </button>
      </span>
    </div>
  );
}

function pendingSubmissionInput(
  snapshot: AppShellMasterSnapshot,
): { input: MasterInput; state: "failed" | "submitting" } | null {
  switch (snapshot.submission.type) {
    case "failed":
      return { input: snapshot.submission.input, state: "failed" };
    case "submitting":
      return { input: snapshot.submission.input, state: "submitting" };
    case "accepted":
    case "idle":
      return null;
    default:
      return assertNever(snapshot.submission);
  }
}

function masterDecisionResult(state: ShellInteractionState): {
  heading: string;
  kind: string;
  text: string;
  tone: "answer" | "clarification" | "ready";
} {
  const decision = requiredRouteDecision(state);
  switch (decision.kind) {
    case "answer_global":
      return {
        heading: "Setta answered",
        kind: decision.kind,
        text: requiredPayload(decision.answerGlobal, decision.kind).text,
        tone: "answer",
      };
    case "clarify":
      return {
        heading: "Setta needs one detail",
        kind: decision.kind,
        text: requiredPayload(decision.clarify, decision.kind).question,
        tone: "clarification",
      };
    default:
      return masterActionDecisionResult(decision, decision.kind);
  }
}

type MasterActionDecisionKind = Exclude<RouteDecisionKind, "answer_global" | "clarify">;

function masterActionDecisionResult(decision: RouteDecision, kind: MasterActionDecisionKind) {
  switch (kind) {
    case "focus_conversation":
      requiredPayload(decision.focusConversation, kind);
      return readyDecision(kind, "Setta selected the topic conversation to bring forward.");
    case "create_conversation":
      requiredPayload(decision.createConversation, kind);
      return readyDecision(kind, "Setta prepared a new topic conversation for this work.");
    case "send_to_agent":
      requiredPayload(decision.sendToAgent, kind);
      return readyDecision(kind, "Setta routed the request to the topic agent.");
    case "queue_agent_turn":
      requiredPayload(decision.queueAgentTurn, kind);
      return readyDecision(kind, "Setta queued the request in the topic conversation.");
    case "steer_active_turn":
      requiredPayload(decision.steerActiveTurn, kind);
      return readyDecision(kind, "Setta directed the active topic work.");
    case "ask_narrator":
      requiredPayload(decision.askNarrator, kind);
      return readyDecision(kind, "Setta sent the question to the topic narrator.");
    case "create_side_conversation":
      requiredPayload(decision.createSideConversation, kind);
      return readyDecision(kind, "Setta selected a temporary side conversation.");
    case "fork_conversation":
      requiredPayload(decision.forkConversation, kind);
      return readyDecision(kind, "Setta selected a durable conversation fork.");
    default:
      return assertNever(kind);
  }
}

function readyDecision(kind: string, text: string) {
  return { heading: "Routing decision ready", kind, text, tone: "ready" as const };
}

function requiredRouteDecision(state: ShellInteractionState) {
  if (state.status !== "decided" || state.decision === null) {
    throw new Error("decided master interaction is missing its route decision");
  }
  return state.decision;
}

function requiredRouteFailure(state: ShellInteractionState) {
  if (state.status !== "failed" || state.failure === null) {
    throw new Error("failed master interaction is missing its route failure");
  }
  return state.failure;
}

function requiredPayload<T>(payload: T | null, kind: string): T {
  if (payload === null) {
    throw new Error(`master route decision ${kind} is missing its payload`);
  }
  return payload;
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

function masterProgressLabel(state: "accepted" | "routing" | "submitting" | "failed"): string {
  switch (state) {
    case "accepted":
      return "Request accepted; waiting for the global router";
    case "routing":
      return "Setta is choosing the next topic action";
    case "submitting":
      return "Submitting the active request";
    case "failed":
      return "The request was not accepted";
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
  if (snapshot.interaction.type === "active") {
    return activeInteractionComposerPlaceholder(snapshot.interaction.state);
  }
  if (
    snapshot.interaction.type === "loading" ||
    snapshot.interaction.type === "load_failed" ||
    snapshot.interaction.type === "observation_failed"
  ) {
    return "Restore the active interaction before continuing";
  }
  return "Find, open, or start a topic conversation…";
}

function activeInteractionComposerPlaceholder(state: ShellInteractionState): string {
  switch (state.status) {
    case "accepted":
    case "routing":
      return "Setta is routing the active request…";
    case "cancelled":
    case "failed":
      return "Find, open, or start a topic conversation…";
    case "decided":
      return state.decision?.kind === "clarify"
        ? "Answer Setta’s clarification…"
        : "Find, open, or start a topic conversation…";
    default:
      return assertNever(state.status);
  }
}

function masterConnectionLabel(snapshot: AppShellMasterSnapshot): string {
  if (!snapshot.runtimeId) {
    return "Runtime disconnected";
  }
  switch (snapshot.submission.type) {
    case "failed":
      return "Action required";
    case "submitting":
      return "Submitting";
    case "accepted":
    case "idle":
      return interactionConnectionLabel(snapshot.interaction);
    default:
      return assertNever(snapshot.submission);
  }
}

function interactionConnectionLabel(interaction: MasterInteractionState): string {
  switch (interaction.type) {
    case "disconnected":
      return "Runtime disconnected";
    case "idle":
      return "Ready";
    case "loading":
      return "Restoring active request";
    case "load_failed":
    case "observation_failed":
      return "Restore required";
    case "active":
      return interactionStateLabel(interaction.state);
    default:
      return assertNever(interaction);
  }
}

function interactionStateLabel(state: ShellInteractionState): string {
  switch (state.status) {
    case "accepted":
    case "routing":
      return "Routing";
    case "decided":
      return state.decision?.kind === "clarify" ? "Reply needed" : "Result ready";
    case "cancelled":
      return "Request cancelled";
    case "failed":
      return "Routing failed";
    default:
      return assertNever(state.status);
  }
}

function masterSurfaceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The master request could not be submitted.";
}

function assertNever(value: never): never {
  throw new Error(`Unsupported master surface value: ${JSON.stringify(value)}`);
}
