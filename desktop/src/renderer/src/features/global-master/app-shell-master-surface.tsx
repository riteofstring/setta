import type {
  AppearanceMasterVoiceShortcut,
  MasterInput,
  MasterInputModality,
  RouteDecision,
  RouteDecisionKind,
  ShellInteractionState,
} from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import {
  ArrowUp,
  Check,
  CircleAlert,
  LoaderCircle,
  MessageCircleMore,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type {
  AppShellMasterController,
  AppShellMasterSnapshot,
  MasterInteractionState,
} from "./app-shell-master-controller";
import {
  MasterTranscriptEntries,
  MasterTranscriptFailure,
  MasterTranscriptHistory,
  MasterTranscriptLoading,
  visibleTranscriptEntries,
} from "./app-shell-master-transcript-view";
import { MasterSurfaceHeader } from "./app-shell-master-surface-header";
import {
  createMasterVoiceModel,
  MasterVoiceButton,
  MasterVoiceStatus,
} from "./master-voice-controls";
import { useAppShellMasterShortcuts } from "./app-shell-master-shortcuts";
import {
  type AppShellSpeechCaptureContextValue,
  useAppShellSpeechCapture,
} from "../global-speech/app-shell-speech-capture";
import { masterSpeechPlaybackIntent } from "../global-speech/app-shell-master-speech-playback-intent";
import type { AppShellSpeechPlaybackController } from "../global-speech/app-shell-speech-playback-controller";
import { useAppShellSpeechPlayback } from "../global-speech/app-shell-speech-playback";
import { useAppearanceStore } from "../../stores/appearance-store";
import { defaultShortcutsSettings } from "../../workspace-layout/workspace-shortcuts";
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
  const masterVoiceShortcut = useMasterVoiceShortcut();
  const openVoiceCredentialSettingsFromMaster = useCallback(() => {
    controller.closeOverlay();
    onOpenVoiceCredentialSettings();
  }, [controller, onOpenVoiceCredentialSettings]);

  useAppShellMasterShortcuts({
    controller,
    masterVoiceShortcut,
    openVoiceCredentialSettingsFromMaster,
    platform,
    speechCaptureController,
  });

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

export function useMasterVoiceShortcut(): AppearanceMasterVoiceShortcut {
  return useAppearanceStore(
    (state) =>
      (state.draft ?? state.settings)?.shortcuts?.masterVoice ??
      defaultShortcutsSettings.masterVoice,
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
  return (
    <div className="setta-master-overlay-layer" data-testid="master-overlay-layer">
      <div
        aria-hidden="true"
        className="setta-master-overlay-backdrop"
        onMouseDown={() => controller.closeOverlay()}
      />
      <MasterSurfaceFrame
        controller={controller}
        focused
        masterVoiceShortcut={masterVoiceShortcut}
        onClose={controller.closeOverlay}
        onOpenVoiceCredentialSettings={onOpenVoiceCredentialSettings}
        platform={platform}
        snapshot={snapshot}
        speechCapture={speechCapture}
        speechPlayback={null}
        variant="overlay"
      />
    </div>
  );
}
export function MasterSurfaceFrame({
  controller,
  focused,
  masterVoiceShortcut,
  onClose,
  onOpenVoiceCredentialSettings,
  platform,
  snapshot,
  speechCapture,
  speechPlayback,
  variant,
}: {
  controller: AppShellMasterController;
  focused: boolean;
  masterVoiceShortcut: AppearanceMasterVoiceShortcut;
  onClose?: () => void;
  onOpenVoiceCredentialSettings?: () => void;
  platform: DesktopPlatform;
  snapshot: AppShellMasterSnapshot;
  speechCapture: AppShellSpeechCaptureContextValue | null;
  speechPlayback: AppShellSpeechPlaybackController | null;
  variant: "overlay" | "pane";
}) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [synchronousError, setSynchronousError] = useState<string | null>(null);
  const canSubmit = controller.canSubmitInput() && snapshot.draft.trim() !== "";
  const masterVoice = createMasterVoiceModel(speechCapture, platform, masterVoiceShortcut);
  const headingId = masterSurfaceHeadingId(variant);

  useEffect(() => {
    if (focused) {
      composerRef.current?.focus();
    }
  }, [focused]);

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
    <section
      aria-labelledby={headingId}
      aria-modal={variant === "overlay" ? true : undefined}
      className={`setta-master-overlay${variant === "pane" ? " setta-master-pane" : ""}`}
      data-master-overlay-state={variant === "overlay" ? "open" : undefined}
      data-master-pane-state={variant === "pane" ? "ready" : undefined}
      data-testid={variant === "pane" ? "master-pane-surface" : "master-overlay"}
      role={variant === "overlay" ? "dialog" : "region"}
    >
      <MasterSurfaceHeader
        headingId={headingId}
        masterVoiceShortcut={masterVoiceShortcut}
        onClose={onClose}
        platform={platform}
        variant={variant}
      />

      <MasterInteraction
        controller={controller}
        snapshot={snapshot}
        speechPlayback={speechPlayback}
      />

      <MasterSurfaceFooter
        canSubmit={canSubmit}
        composerRef={composerRef}
        controller={controller}
        masterVoice={masterVoice}
        onComposerKeyDown={handleComposerKeyDown}
        onOpenVoiceCredentialSettings={onOpenVoiceCredentialSettings}
        onSubmit={submit}
        snapshot={snapshot}
        synchronousError={synchronousError}
      />
    </section>
  );
}

function masterSurfaceHeadingId(variant: "overlay" | "pane"): string {
  return variant === "pane" ? "setta-master-pane-title" : "setta-master-overlay-title";
}

function MasterSurfaceFooter({
  canSubmit,
  composerRef,
  controller,
  masterVoice,
  onComposerKeyDown,
  onOpenVoiceCredentialSettings,
  onSubmit,
  snapshot,
  synchronousError,
}: {
  canSubmit: boolean;
  composerRef: { current: HTMLTextAreaElement | null };
  controller: AppShellMasterController;
  masterVoice: ReturnType<typeof createMasterVoiceModel>;
  onComposerKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onOpenVoiceCredentialSettings?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  snapshot: AppShellMasterSnapshot;
  synchronousError: string | null;
}) {
  return (
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
      <form className="setta-master-overlay-composer" onSubmit={onSubmit}>
        <textarea
          aria-label="Ask Setta"
          onChange={(event) => controller.setDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
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
  );
}

function MasterInteraction({
  controller,
  snapshot,
  speechPlayback,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
  speechPlayback: AppShellSpeechPlaybackController | null;
}) {
  const pendingInput = pendingSubmissionInput(snapshot);
  const transcriptEntries = visibleTranscriptEntries(snapshot);
  if (pendingInput) {
    return (
      <div className="setta-master-overlay-interaction" data-testid="master-active-interaction">
        <MasterTranscriptEntries entries={transcriptEntries} />
        <MasterRequest input={pendingInput.input} />
        <MasterProgress state={pendingInput.state} />
      </div>
    );
  }
  switch (snapshot.interaction.type) {
    case "disconnected":
    case "idle":
      return (
        <InactiveMasterInteraction
          controller={controller}
          snapshot={snapshot}
          transcriptEntries={transcriptEntries}
        />
      );
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
          <MasterTranscriptEntries entries={transcriptEntries} />
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
          speechPlayback={speechPlayback}
          state={snapshot.interaction.state}
        />
      );
    default:
      return assertNever(snapshot.interaction);
  }
}

function InactiveMasterInteraction({
  controller,
  snapshot,
  transcriptEntries,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
  transcriptEntries: ReturnType<typeof visibleTranscriptEntries>;
}) {
  if (transcriptEntries.length > 0) {
    return <MasterTranscriptHistory entries={transcriptEntries} />;
  }
  switch (snapshot.transcript.type) {
    case "loading":
      return <MasterTranscriptLoading />;
    case "failed":
      return (
        <MasterTranscriptFailure
          message={snapshot.transcript.message}
          onRetryTranscript={controller.retryTranscript}
        />
      );
    case "disconnected":
    case "ready":
      return <EmptyMasterInteraction />;
    default:
      return assertNever(snapshot.transcript);
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
  speechPlayback,
  state,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
  speechPlayback: AppShellSpeechPlaybackController | null;
  state: ShellInteractionState;
}) {
  return (
    <div
      className="setta-master-overlay-interaction"
      data-master-input-id={state.input.id}
      data-master-routing-status={state.status}
      data-testid="master-active-interaction"
    >
      <MasterTranscriptEntries entries={visibleTranscriptEntries(snapshot)} />
      <MasterRequest input={state.input} />
      <MasterRoutingResult
        controller={controller}
        snapshot={snapshot}
        speechPlayback={speechPlayback}
        state={state}
      />
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
  speechPlayback,
  state,
}: {
  controller: AppShellMasterController;
  snapshot: AppShellMasterSnapshot;
  speechPlayback: AppShellSpeechPlaybackController | null;
  state: ShellInteractionState;
}) {
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
    case "decided":
      return <DecidedMasterRoutingResult speechPlayback={speechPlayback} state={state} />;
    default:
      return assertNever(state.status);
  }
}

function DecidedMasterRoutingResult({
  speechPlayback,
  state,
}: {
  speechPlayback: AppShellSpeechPlaybackController | null;
  state: ShellInteractionState;
}) {
  const playback = useAppShellSpeechPlayback();
  const playbackController = speechPlayback ?? playback?.controller ?? null;
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
        <MasterAnswerReplayButton controller={playbackController} state={state} />
      ) : null}
    </div>
  );
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
