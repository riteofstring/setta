import type {
  AcceptedMasterInput,
  ActiveShellInteraction,
  MasterInput,
  MasterInputModality,
  ReadMasterInputRoutingStateRequest,
  ShellInteractionState,
  SubmitMasterInputRequest,
} from "@generated/backend";

import { canonicalSpeechInputTimestamp } from "../global-speech/speech-input-submission";

export interface MasterInputFocusHints {
  focusedConversationId: string | null;
  focusedPaneId: string | null;
  focusedWorkspaceId: string | null;
}

export interface CompletedGlobalSpeechTranscript {
  captureSessionId: string;
  input: MasterInput;
  runtimeId: string;
  transcript: string;
}

interface PendingShellMasterInput {
  input: MasterInput;
  runtimeId: string;
}

export type MasterInputSubmissionState =
  | { type: "idle" }
  | { input: MasterInput; type: "submitting" }
  | { accepted: AcceptedMasterInput; type: "accepted" }
  | {
      input: MasterInput;
      message: string;
      type: "failed";
    };

export type MasterInteractionState =
  | { type: "disconnected" }
  | { type: "loading" }
  | { type: "idle" }
  | { state: ShellInteractionState; type: "active" }
  | { message: string; type: "load_failed" }
  | { message: string; state: ShellInteractionState; type: "observation_failed" };

export interface AppShellMasterSnapshot {
  completedTranscript: CompletedGlobalSpeechTranscript | null;
  draft: string;
  interaction: MasterInteractionState;
  overlayOpen: boolean;
  runtimeId: string | null;
  submission: MasterInputSubmissionState;
}

export interface AppShellMasterControllerDependencies {
  createInputId: () => string;
  now: () => Date;
  readActiveInteraction: (runtimeId: string) => Promise<ActiveShellInteraction>;
  readFocusHints: () => MasterInputFocusHints;
  submitMasterInput: (request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>;
  waitShellInteraction: (
    request: ReadMasterInputRoutingStateRequest,
  ) => Promise<ShellInteractionState>;
}

// AppShellMasterController owns exactly one transient shell interaction. The
// backend restores only in-flight work or an unresolved clarification; a
// completed result remains local until dismissed or replaced and never grows
// into a request history.
export class AppShellMasterController {
  private readonly dependencies: AppShellMasterControllerDependencies;
  private readonly listeners = new Set<() => void>();

  private disposed = false;
  private interactionGeneration = 0;
  private pending: PendingShellMasterInput | null = null;
  private submissionGeneration = 0;
  private snapshotValue: AppShellMasterSnapshot = {
    completedTranscript: null,
    draft: "",
    interaction: { type: "disconnected" },
    overlayOpen: false,
    runtimeId: null,
    submission: { type: "idle" },
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
    this.pending = null;
    this.updateSnapshot({
      completedTranscript: null,
      interaction: runtimeId ? { type: "loading" } : { type: "disconnected" },
      runtimeId,
      submission: { type: "idle" },
    });
    if (runtimeId) {
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
    this.pending = null;
    const runtimeId = this.snapshotValue.runtimeId;
    this.updateSnapshot({
      completedTranscript: null,
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

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.invalidateSubmission();
    this.invalidateInteraction();
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
    this.pending = pending;
    this.updateSnapshot({
      completedTranscript,
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
    this.updateSnapshot({ interaction: { state: settled, type: "active" } });
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
      interactionIsClarification(interaction.state))
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
    case "failed":
      return validFailedRoutingState(state);
    default:
      return assertNever(state.status);
  }
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
    case "failed":
      return true;
    case "accepted":
    case "routing":
      return false;
    default:
      return assertNever(state.status);
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
      return !shellInteractionSettled(interaction.state);
    default:
      return assertNever(interaction);
  }
}

function interactionIsDismissible(interaction: MasterInteractionState): boolean {
  switch (interaction.type) {
    case "active":
      return (
        shellInteractionSettled(interaction.state) && !interactionIsClarification(interaction.state)
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

function acceptedMasterInputMatches(accepted: AcceptedMasterInput, input: MasterInput): boolean {
  return validAcceptedMasterInput(accepted) && masterInputsEqual(accepted.input, input);
}

function validAcceptedMasterInput(accepted: AcceptedMasterInput): boolean {
  return (
    Number.isSafeInteger(accepted.sequence) &&
    accepted.sequence > 0 &&
    accepted.acceptedAt !== "" &&
    validReplyDelivery(accepted)
  );
}

function validReplyDelivery(accepted: AcceptedMasterInput): boolean {
  switch (accepted.input.source) {
    case "conversation_escalation":
      return conversationEscalationDeliveryMatches(accepted);
    case "shell":
      return shellDeliveryMatches(accepted);
    default:
      return assertNever(accepted.input.source);
  }
}

function conversationEscalationDeliveryMatches(accepted: AcceptedMasterInput): boolean {
  const input = accepted.input;
  const delivery = accepted.replyDelivery;
  return (
    input.originatingWorkspaceId !== null &&
    input.originatingConversationId !== null &&
    input.originatingConversationInputId !== null &&
    delivery.originatingWorkspaceId === input.originatingWorkspaceId &&
    delivery.originatingConversationId === input.originatingConversationId &&
    delivery.originatingPaneId === input.originatingPaneId &&
    delivery.originatingConversationInputId === input.originatingConversationInputId
  );
}

function shellDeliveryMatches(accepted: AcceptedMasterInput): boolean {
  const input = accepted.input;
  const delivery = accepted.replyDelivery;
  return (
    input.originatingWorkspaceId === null &&
    input.originatingConversationId === null &&
    input.originatingPaneId === null &&
    input.originatingConversationInputId === null &&
    delivery.originatingWorkspaceId === null &&
    delivery.originatingConversationId === null &&
    delivery.originatingPaneId === null &&
    delivery.originatingConversationInputId === null
  );
}

function masterInputsEqual(left: MasterInput, right: MasterInput): boolean {
  return (
    masterInputCoreEqual(left, right) &&
    masterInputFocusEqual(left, right) &&
    masterInputOriginEqual(left, right)
  );
}

function masterInputCoreEqual(left: MasterInput, right: MasterInput): boolean {
  return (
    left.id === right.id &&
    left.text === right.text &&
    left.modality === right.modality &&
    left.source === right.source &&
    left.submittedAt === right.submittedAt
  );
}

function masterInputFocusEqual(left: MasterInput, right: MasterInput): boolean {
  return (
    left.focusedWorkspaceId === right.focusedWorkspaceId &&
    left.focusedConversationId === right.focusedConversationId &&
    left.focusedPaneId === right.focusedPaneId
  );
}

function masterInputOriginEqual(left: MasterInput, right: MasterInput): boolean {
  return (
    left.originatingWorkspaceId === right.originatingWorkspaceId &&
    left.originatingConversationId === right.originatingConversationId &&
    left.originatingPaneId === right.originatingPaneId &&
    left.originatingConversationInputId === right.originatingConversationInputId
  );
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
