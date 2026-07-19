import type {
  AcceptedMasterInput,
  ActiveShellInteraction,
  MasterInput,
  MasterInputModality,
  PresentationIntent,
  PresentationResolution,
  PresentationResolutionRequest,
  ReadMasterInputRoutingStateRequest,
  ShellInteractionState,
  Transcript,
} from "@generated/backend";

import { canonicalSpeechInputTimestamp } from "../global-speech/speech-input-submission";
import {
  interactionRequiresNavigation,
  validShellPresentationIntent,
} from "./app-shell-master-presentation-validation";
import type {
  AppShellMasterControllerDependencies,
  AppShellMasterSnapshot,
  CompletedGlobalSpeechTranscript,
  MasterInteractionState,
  PendingShellMasterInput,
} from "./app-shell-master-controller-types";
import { masterTranscriptReadLimit, validMasterTranscript } from "./app-shell-master-transcript";
import { acceptedMasterInputMatches, masterInputsEqual } from "./app-shell-master-input-validation";

export type {
  AppShellMasterControllerDependencies,
  AppShellMasterSnapshot,
  CompletedGlobalSpeechTranscript,
  MasterInputFocusHints,
  MasterInputSubmissionState,
  MasterInteractionState,
} from "./app-shell-master-controller-types";

// AppShellMasterController owns the active shell interaction and the durable
// transcript read model exposed by the backend.
export class AppShellMasterController {
  private readonly dependencies: AppShellMasterControllerDependencies;
  private readonly listeners = new Set<() => void>();

  private disposed = false;
  private cancellationGeneration = 0;
  private interactionGeneration = 0;
  private pending: PendingShellMasterInput | null = null;
  private submissionGeneration = 0;
  private transcriptGeneration = 0;
  private snapshotValue: AppShellMasterSnapshot = {
    cancellation: { type: "idle" },
    completedTranscript: null,
    draft: "",
    interaction: { type: "disconnected" },
    overlayOpen: false,
    runtimeId: null,
    submission: { type: "idle" },
    transcript: { type: "disconnected" },
  };

  constructor(dependencies: AppShellMasterControllerDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot = (): AppShellMasterSnapshot => this.snapshotValue;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  synchronizeRuntime(runtimeId: string | null): void {
    this.assertUsable();
    if (runtimeId === this.snapshotValue.runtimeId) {
      return;
    }
    this.invalidateSubmission();
    this.invalidateInteraction();
    this.invalidateCancellation();
    this.invalidateTranscript();
    this.pending = null;
    this.updateSnapshot({
      completedTranscript: null,
      cancellation: { type: "idle" },
      interaction: runtimeId ? { type: "loading" } : { type: "disconnected" },
      runtimeId,
      submission: { type: "idle" },
      transcript: runtimeId ? { type: "loading" } : { type: "disconnected" },
    });
    if (runtimeId) {
      this.loadTranscript(runtimeId, true);
      this.loadActiveInteraction(runtimeId);
    }
  }

  openOverlay = (): void => {
    this.assertUsable();
    if (!this.snapshotValue.overlayOpen) {
      this.updateSnapshot({ overlayOpen: true });
    }
  };

  closeOverlay = (): void => {
    this.assertUsable();
    if (!this.snapshotValue.overlayOpen) {
      return;
    }
    const update: Partial<AppShellMasterSnapshot> = { overlayOpen: false };
    if (interactionIsDismissible(this.snapshotValue.interaction)) {
      update.interaction = this.snapshotValue.runtimeId
        ? { type: "idle" }
        : { type: "disconnected" };
      if (this.snapshotValue.submission.type === "accepted") {
        update.submission = { type: "idle" };
      }
    }
    this.updateSnapshot(update);
  };

  setDraft = (draft: string): void => {
    this.assertUsable();
    if (draft !== this.snapshotValue.draft) {
      this.updateSnapshot({ draft });
    }
  };

  canSubmitInput(): boolean {
    return (
      !this.disposed &&
      this.snapshotValue.runtimeId !== null &&
      this.pending === null &&
      this.snapshotValue.submission.type !== "failed" &&
      !interactionBlocksNewInput(this.snapshotValue.interaction)
    );
  }

  canCancelActiveInput(): boolean {
    return (
      !this.disposed &&
      this.snapshotValue.runtimeId !== null &&
      this.snapshotValue.cancellation.type !== "cancelling" &&
      cancellableInteractionState(this.snapshotValue.interaction) !== null
    );
  }

  cancelActiveInput = (): void => {
    this.assertUsable();
    const state = cancellableInteractionState(this.snapshotValue.interaction);
    if (state === null || !this.canCancelActiveInput()) {
      return;
    }
    const runtimeId = this.requiredRuntimeID();
    this.invalidateInteraction();
    this.cancellationGeneration += 1;
    const generation = this.cancellationGeneration;
    this.updateSnapshot({
      cancellation: { inputId: state.input.id, type: "cancelling" },
    });
    let pending: Promise<ShellInteractionState>;
    try {
      pending = this.dependencies.cancelMasterInput({ inputId: state.input.id });
    } catch {
      this.handleCancellationFailure(generation, runtimeId, state);
      return;
    }
    void pending.then(
      (cancelled) => this.handleCancellationSuccess(generation, runtimeId, state, cancelled),
      () => this.handleCancellationFailure(generation, runtimeId, state),
    );
  };

  submitText(text: string): string {
    this.assertUsable();
    if (text.trim() === "") {
      throw new Error("master text input is required");
    }
    const inputId = this.dependencies.createInputId();
    this.submitShellInput(inputId, "text", text, null);
    return inputId;
  }

  submitVoiceTranscript(captureSessionId: string, runtimeId: string, transcript: string): void {
    this.assertUsable();
    if (runtimeId !== this.requiredRuntimeID()) {
      throw new Error("master voice transcript belongs to a stale runtime");
    }
    this.submitShellInput(captureSessionId, "voice", transcript, {
      captureSessionId,
      runtimeId,
      transcript,
    });
  }

  retry(): void {
    this.assertUsable();
    if (!this.pending || this.snapshotValue.submission.type !== "failed") {
      return;
    }
    this.updateSnapshot({ submission: { input: this.pending.input, type: "submitting" } });
    this.submitPending(this.pending);
  }

  discard(): void {
    this.assertUsable();
    if (this.snapshotValue.submission.type === "submitting") {
      throw new Error("a submitting master input cannot be discarded");
    }
    this.invalidateSubmission();
    this.invalidateInteraction();
    this.invalidateCancellation();
    this.pending = null;
    const runtimeId = this.snapshotValue.runtimeId;
    this.updateSnapshot({
      completedTranscript: null,
      cancellation: { type: "idle" },
      interaction: runtimeId ? { type: "loading" } : { type: "disconnected" },
      submission: { type: "idle" },
    });
    if (runtimeId) {
      this.loadActiveInteraction(runtimeId);
    }
  }

  clearAccepted(): void {
    this.assertUsable();
    if (this.snapshotValue.submission.type === "accepted") {
      this.updateSnapshot({ submission: { type: "idle" } });
    }
  }

  retryInteraction = (): void => {
    this.assertUsable();
    const runtimeId = this.snapshotValue.runtimeId;
    if (!runtimeId) {
      return;
    }
    switch (this.snapshotValue.interaction.type) {
      case "load_failed":
        this.updateSnapshot({ interaction: { type: "loading" } });
        this.loadActiveInteraction(runtimeId);
        return;
      case "observation_failed":
        this.updateSnapshot({
          interaction: { state: this.snapshotValue.interaction.state, type: "active" },
        });
        this.observeInteraction(runtimeId, this.snapshotValue.interaction.state);
        return;
      case "active":
      case "disconnected":
      case "idle":
      case "loading":
        return;
      default:
        return assertNever(this.snapshotValue.interaction);
    }
  };

  retryTranscript = (): void => {
    this.assertUsable();
    const runtimeId = this.snapshotValue.runtimeId;
    if (!runtimeId || this.snapshotValue.transcript.type !== "failed") {
      return;
    }
    this.loadTranscript(runtimeId, true);
  };

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.invalidateSubmission();
    this.invalidateInteraction();
    this.invalidateCancellation();
    this.invalidateTranscript();
    this.pending = null;
    this.listeners.clear();
  }

  private submitShellInput(
    inputId: string,
    modality: MasterInputModality,
    text: string,
    voice: Omit<CompletedGlobalSpeechTranscript, "input"> | null,
  ): void {
    if (!this.canSubmitInput()) {
      throw new Error("the active master interaction must settle before another request");
    }
    if (text.trim() === "") {
      throw new Error("master input text is required");
    }
    const runtimeId = this.requiredRuntimeID();
    const focus = this.dependencies.readFocusHints();
    const input = Object.freeze({
      focusedConversationId: focus.focusedConversationId,
      focusedPaneId: focus.focusedPaneId,
      focusedWorkspaceId: focus.focusedWorkspaceId,
      id: inputId,
      modality,
      originatingConversationId: null,
      originatingConversationInputId: null,
      originatingPaneId: null,
      originatingWorkspaceId: null,
      source: "shell",
      submittedAt: canonicalSpeechInputTimestamp(this.dependencies.now()),
      text,
    } satisfies MasterInput);
    const completedTranscript = voice ? { ...voice, input } : null;
    const pending = { input, runtimeId };
    this.invalidateInteraction();
    this.invalidateCancellation();
    this.pending = pending;
    this.updateSnapshot({
      completedTranscript,
      cancellation: { type: "idle" },
      interaction: { type: "idle" },
      overlayOpen: true,
      submission: { input, type: "submitting" },
    });
    this.submitPending(pending);
  }

  private submitPending(pendingInput: PendingShellMasterInput): void {
    this.submissionGeneration += 1;
    const generation = this.submissionGeneration;
    let pending: Promise<AcceptedMasterInput>;
    try {
      pending = this.dependencies.submitMasterInput({ input: pendingInput.input });
    } catch {
      this.handleSubmissionFailure(generation, pendingInput);
      return;
    }
    void pending.then(
      (accepted) => this.handleAccepted(generation, pendingInput, accepted),
      () => this.handleSubmissionFailure(generation, pendingInput),
    );
  }

  private handleAccepted(
    generation: number,
    pending: PendingShellMasterInput,
    accepted: AcceptedMasterInput,
  ): void {
    if (!this.isCurrentSubmission(generation, pending)) {
      return;
    }
    if (!acceptedMasterInputMatches(accepted, pending.input)) {
      this.handleSubmissionFailure(generation, pending);
      return;
    }
    const durableAccepted = Object.freeze({ ...accepted, input: pending.input });
    const state = acceptedShellInteractionState(durableAccepted);
    this.pending = null;
    this.updateSnapshot({
      completedTranscript: null,
      interaction: { state, type: "active" },
      submission: { accepted: durableAccepted, type: "accepted" },
    });
    this.loadTranscript(pending.runtimeId, false);
    this.observeInteraction(pending.runtimeId, state);
  }

  private handleSubmissionFailure(generation: number, pending: PendingShellMasterInput): void {
    if (!this.isCurrentSubmission(generation, pending)) {
      return;
    }
    console.info(`Shell master input submission failed: inputId=${pending.input.id}`);
    this.updateSnapshot({
      submission: {
        input: pending.input,
        message: submissionFailureMessage(pending.input.modality),
        type: "failed",
      },
    });
  }

  private handleCancellationSuccess(
    generation: number,
    runtimeId: string,
    observed: ShellInteractionState,
    cancelled: ShellInteractionState,
  ): void {
    if (!this.isCurrentCancellation(generation, runtimeId, observed.input.id)) {
      return;
    }
    if (
      !validShellInteractionState(cancelled) ||
      cancelled.status !== "cancelled" ||
      !masterInputsEqual(cancelled.input, observed.input)
    ) {
      this.handleCancellationFailure(generation, runtimeId, observed);
      return;
    }
    this.updateSnapshot({
      cancellation: { type: "idle" },
      completedTranscript: null,
      interaction: { state: cancelled, type: "active" },
      submission: { type: "idle" },
    });
    this.loadTranscript(runtimeId, false);
  }

  private handleCancellationFailure(
    generation: number,
    runtimeId: string,
    observed: ShellInteractionState,
  ): void {
    if (!this.isCurrentCancellation(generation, runtimeId, observed.input.id)) {
      return;
    }
    console.info(`Active master routing cancellation failed: inputId=${observed.input.id}`);
    this.updateSnapshot({
      cancellation: {
        inputId: observed.input.id,
        message: "Setta could not confirm cancellation. Retry while this request is still active.",
        type: "failed",
      },
    });
    this.observeInteraction(runtimeId, observed);
  }

  private loadActiveInteraction(runtimeId: string): void {
    this.interactionGeneration += 1;
    const generation = this.interactionGeneration;
    let pending: Promise<ActiveShellInteraction>;
    try {
      pending = this.dependencies.readActiveInteraction(runtimeId);
    } catch {
      this.handleInteractionLoadFailure(generation, runtimeId);
      return;
    }
    void pending.then(
      (interaction) => this.handleInteractionLoaded(generation, runtimeId, interaction),
      () => this.handleInteractionLoadFailure(generation, runtimeId),
    );
  }

  private handleInteractionLoaded(
    generation: number,
    runtimeId: string,
    interaction: ActiveShellInteraction,
  ): void {
    if (!this.isCurrentInteraction(generation, runtimeId)) {
      return;
    }
    if (!validActiveShellInteraction(interaction)) {
      this.handleInteractionLoadFailure(generation, runtimeId);
      return;
    }
    if (!interaction.state) {
      this.updateSnapshot({ interaction: { type: "idle" } });
      return;
    }
    const state = interaction.state;
    this.updateSnapshot({ interaction: { state, type: "active" } });
    if (!shellInteractionSettled(state)) {
      this.observeInteraction(runtimeId, state);
    } else if (interactionRequiresNavigation(state)) {
      this.observePresentationIntent(generation, runtimeId, state);
    }
  }

  private handleInteractionLoadFailure(generation: number, runtimeId: string): void {
    if (!this.isCurrentInteraction(generation, runtimeId)) {
      return;
    }
    console.info(`Active master shell interaction load failed: runtimeId=${runtimeId}`);
    this.updateSnapshot({
      interaction: {
        message:
          "Setta could not restore the active routing interaction. Retry before starting another request.",
        type: "load_failed",
      },
    });
  }

  private observeInteraction(runtimeId: string, state: ShellInteractionState): void {
    this.interactionGeneration += 1;
    const generation = this.interactionGeneration;
    const request = { inputId: state.input.id } satisfies ReadMasterInputRoutingStateRequest;
    let pending: Promise<ShellInteractionState>;
    try {
      pending = this.dependencies.waitShellInteraction(request);
    } catch {
      this.handleObservationFailure(generation, runtimeId, state);
      return;
    }
    void pending.then(
      (settled) => this.handleInteractionSettled(generation, runtimeId, state, settled),
      () => this.handleObservationFailure(generation, runtimeId, state),
    );
  }

  private handleInteractionSettled(
    generation: number,
    runtimeId: string,
    observed: ShellInteractionState,
    settled: ShellInteractionState,
  ): void {
    if (!this.isCurrentInteraction(generation, runtimeId)) {
      return;
    }
    if (!validSettledShellInteractionState(settled, observed.input)) {
      this.handleObservationFailure(generation, runtimeId, observed);
      return;
    }
    this.updateSnapshot({
      cancellation: { type: "idle" },
      interaction: { state: settled, type: "active" },
    });
    if (settled.status === "cancelled" || settled.status === "failed") {
      this.loadTranscript(runtimeId, false);
    }
    if (settled.status === "decided") {
      this.observePresentationIntent(generation, runtimeId, settled);
    }
  }

  private observePresentationIntent(
    generation: number,
    runtimeId: string,
    state: ShellInteractionState,
  ): void {
    const request = { inputId: state.input.id } satisfies ReadMasterInputRoutingStateRequest;
    let pending: Promise<PresentationIntent>;
    try {
      pending = this.dependencies.waitPresentationIntent(request);
    } catch {
      this.handleObservationFailure(generation, runtimeId, state);
      return;
    }
    void pending.then(
      (intent) => this.handlePresentationIntent(generation, runtimeId, state, intent),
      () => this.handleObservationFailure(generation, runtimeId, state),
    );
  }

  private handlePresentationIntent(
    generation: number,
    runtimeId: string,
    state: ShellInteractionState,
    intent: PresentationIntent,
  ): void {
    if (!this.isCurrentInteraction(generation, runtimeId)) {
      return;
    }
    if (!validShellPresentationIntent(intent, state)) {
      this.handleObservationFailure(generation, runtimeId, state);
      return;
    }
    this.loadTranscript(runtimeId, false);
    if (intent.kind === "show_master_reply") {
      return;
    }
    let pending: Promise<{ paneId: string }>;
    try {
      pending = this.dependencies.presentPresentationIntent(intent);
    } catch {
      this.handleObservationFailure(generation, runtimeId, state);
      return;
    }
    void pending.then(
      (presented) => {
        if (!this.isCurrentInteraction(generation, runtimeId)) {
          return;
        }
        this.resolvePresentationIntent(generation, runtimeId, state, intent, presented.paneId);
      },
      () => this.handleObservationFailure(generation, runtimeId, state),
    );
  }

  private resolvePresentationIntent(
    generation: number,
    runtimeId: string,
    state: ShellInteractionState,
    intent: PresentationIntent,
    paneId: string,
  ): void {
    const request = {
      inputId: state.input.id,
      intentId: intent.id,
      paneId,
    } satisfies PresentationResolutionRequest;
    let pending: Promise<PresentationResolution>;
    try {
      pending = this.dependencies.resolvePresentationIntent(request);
    } catch {
      this.handleObservationFailure(generation, runtimeId, state);
      return;
    }
    void pending.then(
      (resolution) => {
        if (!this.isCurrentInteraction(generation, runtimeId)) {
          return;
        }
        if (!validPresentationResolution(resolution, request)) {
          this.handleObservationFailure(generation, runtimeId, state);
          return;
        }
        this.invalidateInteraction();
        this.updateSnapshot({
          completedTranscript: null,
          interaction: { type: "idle" },
          overlayOpen: false,
          submission: { type: "idle" },
        });
        this.loadTranscript(runtimeId, false);
      },
      () => this.handleObservationFailure(generation, runtimeId, state),
    );
  }

  private loadTranscript(runtimeId: string, showLoading: boolean): void {
    this.transcriptGeneration += 1;
    const generation = this.transcriptGeneration;
    if (showLoading) {
      this.updateSnapshot({ transcript: { type: "loading" } });
    }
    let pending: Promise<Transcript>;
    try {
      pending = this.dependencies.readTranscript({ limit: masterTranscriptReadLimit });
    } catch {
      this.handleTranscriptFailure(generation, runtimeId);
      return;
    }
    void pending.then(
      (transcript) => this.handleTranscriptLoaded(generation, runtimeId, transcript),
      () => this.handleTranscriptFailure(generation, runtimeId),
    );
  }

  private handleTranscriptLoaded(
    generation: number,
    runtimeId: string,
    transcript: Transcript,
  ): void {
    if (!this.isCurrentTranscript(generation, runtimeId)) {
      return;
    }
    if (!validMasterTranscript(transcript)) {
      this.handleTranscriptFailure(generation, runtimeId);
      return;
    }
    this.updateSnapshot({ transcript: { transcript, type: "ready" } });
  }

  private handleTranscriptFailure(generation: number, runtimeId: string): void {
    if (!this.isCurrentTranscript(generation, runtimeId)) {
      return;
    }
    console.info(`Master transcript load failed: runtimeId=${runtimeId}`);
    this.updateSnapshot({
      transcript: {
        message: "Setta could not load the durable master transcript.",
        type: "failed",
      },
    });
  }

  private handleObservationFailure(
    generation: number,
    runtimeId: string,
    state: ShellInteractionState,
  ): void {
    if (!this.isCurrentInteraction(generation, runtimeId)) {
      return;
    }
    console.info(`Active master routing observation failed: inputId=${state.input.id}`);
    this.updateSnapshot({
      interaction: {
        message:
          "Setta could not observe the routing result. The durable request is still safe; retry the status connection.",
        state,
        type: "observation_failed",
      },
    });
  }

  private isCurrentSubmission(generation: number, pending: PendingShellMasterInput): boolean {
    return (
      !this.disposed &&
      generation === this.submissionGeneration &&
      this.pending === pending &&
      this.snapshotValue.runtimeId === pending.runtimeId
    );
  }

  private isCurrentInteraction(generation: number, runtimeId: string): boolean {
    return (
      !this.disposed &&
      generation === this.interactionGeneration &&
      runtimeId === this.snapshotValue.runtimeId
    );
  }

  private isCurrentCancellation(generation: number, runtimeId: string, inputId: string): boolean {
    return (
      !this.disposed &&
      generation === this.cancellationGeneration &&
      runtimeId === this.snapshotValue.runtimeId &&
      this.snapshotValue.cancellation.type !== "idle" &&
      this.snapshotValue.cancellation.inputId === inputId
    );
  }

  private isCurrentTranscript(generation: number, runtimeId: string): boolean {
    return (
      !this.disposed &&
      generation === this.transcriptGeneration &&
      runtimeId === this.snapshotValue.runtimeId
    );
  }

  private requiredRuntimeID(): string {
    const runtimeId = this.snapshotValue.runtimeId;
    if (!runtimeId) {
      throw new Error("connect to a Setta runtime before submitting master input");
    }
    return runtimeId;
  }

  private invalidateSubmission(): void {
    this.submissionGeneration += 1;
  }

  private invalidateInteraction(): void {
    this.interactionGeneration += 1;
  }

  private invalidateCancellation(): void {
    this.cancellationGeneration += 1;
  }

  private invalidateTranscript(): void {
    this.transcriptGeneration += 1;
  }

  private updateSnapshot(update: Partial<AppShellMasterSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...update };
    for (const listener of this.listeners) {
      listener();
    }
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("app-shell master controller is disposed");
    }
  }
}

function acceptedShellInteractionState(accepted: AcceptedMasterInput): ShellInteractionState {
  return {
    decision: null,
    failure: null,
    input: accepted.input,
    status: "accepted",
  };
}

function validActiveShellInteraction(interaction: ActiveShellInteraction): boolean {
  if (interaction.state === null) {
    return true;
  }
  return (
    validShellInteractionState(interaction.state) &&
    interaction.state.input.source === "shell" &&
    (interaction.state.status === "accepted" ||
      interaction.state.status === "routing" ||
      interactionIsClarification(interaction.state) ||
      interactionRequiresNavigation(interaction.state))
  );
}

function validPresentationResolution(
  resolution: PresentationResolution,
  request: PresentationResolutionRequest,
): boolean {
  return (
    resolution.intentId === request.intentId &&
    resolution.inputId === request.inputId &&
    resolution.paneId === request.paneId &&
    resolution.resolvedAt.trim() !== ""
  );
}

function validSettledShellInteractionState(
  state: ShellInteractionState,
  input: MasterInput,
): boolean {
  return (
    validShellInteractionState(state) &&
    shellInteractionSettled(state) &&
    masterInputsEqual(state.input, input)
  );
}

function validShellInteractionState(state: ShellInteractionState): boolean {
  if (!validShellInput(state.input)) {
    return false;
  }
  switch (state.status) {
    case "accepted":
      return validAcceptedRoutingState(state);
    case "routing":
      return validWorkingRoutingState(state);
    case "decided":
      return validDecidedRoutingState(state);
    case "cancelled":
      return validCancelledRoutingState(state);
    case "failed":
      return validFailedRoutingState(state);
    default:
      return assertNever(state.status);
  }
}

function validCancelledRoutingState(state: ShellInteractionState): boolean {
  return [state.decision === null, state.failure === null].every(Boolean);
}

function validShellInput(input: MasterInput): boolean {
  return [
    input.id.trim() !== "",
    input.text.trim() !== "",
    input.source === "shell",
    input.submittedAt.trim() !== "",
    input.originatingWorkspaceId === null,
    input.originatingConversationId === null,
    input.originatingPaneId === null,
    input.originatingConversationInputId === null,
  ].every(Boolean);
}

function validAcceptedRoutingState(state: ShellInteractionState): boolean {
  return [state.decision === null, state.failure === null].every(Boolean);
}

function validWorkingRoutingState(state: ShellInteractionState): boolean {
  return [state.decision === null, state.failure === null].every(Boolean);
}

function validDecidedRoutingState(state: ShellInteractionState): boolean {
  return [
    state.failure === null,
    state.decision !== null,
    state.decision !== null && validShellRouteDecision(state.decision),
  ].every(Boolean);
}

function validFailedRoutingState(state: ShellInteractionState): boolean {
  return [
    state.decision === null,
    state.failure !== null,
    state.failure?.code.trim() !== "",
    state.failure?.message.trim() !== "",
  ].every(Boolean);
}

function validShellRouteDecision(
  decision: NonNullable<ShellInteractionState["decision"]>,
): boolean {
  const payloads = [
    decision.answerGlobal,
    decision.askNarrator,
    decision.clarify,
    decision.createConversation,
    decision.createSideConversation,
    decision.focusConversation,
    decision.forkConversation,
    decision.queueAgentTurn,
    decision.sendToAgent,
    decision.steerActiveTurn,
  ];
  const selectedPayloadIsPresent = {
    answer_global: decision.answerGlobal !== null,
    ask_narrator: decision.askNarrator !== null,
    clarify: decision.clarify !== null,
    create_conversation: decision.createConversation !== null,
    create_side_conversation: decision.createSideConversation !== null,
    focus_conversation: decision.focusConversation !== null,
    fork_conversation: decision.forkConversation !== null,
    queue_agent_turn: decision.queueAgentTurn !== null,
    send_to_agent: decision.sendToAgent !== null,
    steer_active_turn: decision.steerActiveTurn !== null,
  } satisfies Record<typeof decision.kind, boolean>;
  return [
    payloads.filter((payload) => payload !== null).length === 1,
    selectedPayloadIsPresent[decision.kind],
  ].every(Boolean);
}

function shellInteractionSettled(state: ShellInteractionState): boolean {
  switch (state.status) {
    case "decided":
    case "cancelled":
    case "failed":
      return true;
    case "accepted":
    case "routing":
      return false;
    default:
      return assertNever(state.status);
  }
}

function cancellableInteractionState(
  interaction: MasterInteractionState,
): ShellInteractionState | null {
  switch (interaction.type) {
    case "active":
    case "observation_failed":
      return interaction.state.status === "accepted" || interaction.state.status === "routing"
        ? interaction.state
        : null;
    case "disconnected":
    case "idle":
    case "load_failed":
    case "loading":
      return null;
    default:
      return assertNever(interaction);
  }
}

function interactionBlocksNewInput(interaction: MasterInteractionState): boolean {
  switch (interaction.type) {
    case "disconnected":
    case "load_failed":
    case "loading":
      return true;
    case "idle":
      return false;
    case "observation_failed":
      return true;
    case "active":
      return (
        !shellInteractionSettled(interaction.state) ||
        interactionRequiresNavigation(interaction.state)
      );
    default:
      return assertNever(interaction);
  }
}

function interactionIsDismissible(interaction: MasterInteractionState): boolean {
  switch (interaction.type) {
    case "active":
      return (
        shellInteractionSettled(interaction.state) &&
        !interactionIsClarification(interaction.state) &&
        !interactionRequiresNavigation(interaction.state)
      );
    case "disconnected":
    case "idle":
    case "load_failed":
    case "loading":
    case "observation_failed":
      return false;
    default:
      return assertNever(interaction);
  }
}

function interactionIsClarification(state: ShellInteractionState): boolean {
  return state.status === "decided" && state.decision?.kind === "clarify";
}

function submissionFailureMessage(modality: MasterInputModality): string {
  switch (modality) {
    case "text":
      return "Setta could not accept the text request. Retry without entering it again.";
    case "voice":
      return "Setta could not accept the voice request. Retry without recording it again.";
    default:
      return assertNever(modality);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled master input value: ${String(value)}`);
}
