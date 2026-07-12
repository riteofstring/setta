import type {
  AcceptedMasterInput,
  InputRoutingState,
  MasterInput,
  MasterInputModality,
  ReadMasterInputRoutingStateRequest,
  RecentMasterInputHistory,
  SubmitMasterInputRequest,
} from "@generated/backend";

import { canonicalSpeechInputTimestamp } from "../global-speech/speech-input-submission";

// Until the backend supplies its owned history capacity, retain only the newest
// local receipt so a failed or stalled hydration cannot create an unbounded DOM.
const unhydratedRecentInputCapacity = 1;

export interface MasterInputFocusHints {
  focusedConversationId: string | null;
  focusedPaneId: string | null;
  focusedWorkspaceId: string | null;
}

export interface MasterConversationPresentationTarget {
  conversationId: string;
  workspaceId: string;
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

type MasterInputHistoryState =
  | { type: "disconnected" }
  | { type: "loading" }
  | { capacity: number; type: "ready" }
  | { message: string; type: "failed" };

export interface AppShellMasterSnapshot {
  completedTranscript: CompletedGlobalSpeechTranscript | null;
  draft: string;
  history: MasterInputHistoryState;
  overlayOpen: boolean;
  recentInputs: readonly AcceptedMasterInput[];
  runtimeId: string | null;
  submission: MasterInputSubmissionState;
}

export interface AppShellMasterControllerDependencies {
  createInputId: () => string;
  now: () => Date;
  presentConversation: (target: MasterConversationPresentationTarget) => Promise<void>;
  readRecentMasterInputs: (runtimeId: string) => Promise<RecentMasterInputHistory>;
  readFocusHints: () => MasterInputFocusHints;
  submitMasterInput: (request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>;
  waitMasterInputState: (request: ReadMasterInputRoutingStateRequest) => Promise<InputRoutingState>;
}

// AppShellMasterController is the sole shell-owned intake controller. Text and
// finalized voice transcripts use the same runtime generation, focus snapshot,
// durable submission state, exact retry, and shared master input endpoint.
export class AppShellMasterController {
  private readonly dependencies: AppShellMasterControllerDependencies;
  private readonly listeners = new Set<() => void>();
  private readonly recentInputCapacityByRuntimeId = new Map<string, number>();
  private readonly recentInputsByRuntimeId = new Map<string, readonly AcceptedMasterInput[]>();

  private disposed = false;
  private generation = 0;
  private historyGeneration = 0;
  private routingGeneration = 0;
  private recentInputsRuntimeId: string | null = null;
  private pending: PendingShellMasterInput | null = null;
  private snapshotValue: AppShellMasterSnapshot = {
    completedTranscript: null,
    draft: "",
    history: { type: "disconnected" },
    overlayOpen: false,
    recentInputs: [],
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
    this.invalidate();
    this.invalidateHistory();
    this.invalidateRouting();
    this.pending = null;
    const recentInputs = this.synchronizeRecentInputs(runtimeId);
    this.updateSnapshot({
      completedTranscript: null,
      history: runtimeId ? { type: "loading" } : { type: "disconnected" },
      recentInputs,
      runtimeId,
      submission: { type: "idle" },
    });
    if (runtimeId) {
      this.loadRecentInputs(runtimeId);
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
    if (this.snapshotValue.overlayOpen) {
      this.updateSnapshot({ overlayOpen: false });
    }
  };

  setDraft = (draft: string): void => {
    this.assertUsable();
    if (draft !== this.snapshotValue.draft) {
      this.updateSnapshot({ draft });
    }
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
    this.invalidate();
    this.pending = null;
    this.updateSnapshot({ completedTranscript: null, submission: { type: "idle" } });
  }

  clearAccepted(): void {
    this.assertUsable();
    if (this.snapshotValue.submission.type === "accepted") {
      this.updateSnapshot({ submission: { type: "idle" } });
    }
  }

  retryHistory = (): void => {
    this.assertUsable();
    const runtimeId = this.snapshotValue.runtimeId;
    if (!runtimeId || this.snapshotValue.history.type !== "failed") {
      return;
    }
    this.updateSnapshot({ history: { type: "loading" } });
    this.loadRecentInputs(runtimeId);
  };

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.invalidate();
    this.invalidateHistory();
    this.invalidateRouting();
    this.pending = null;
    this.recentInputCapacityByRuntimeId.clear();
    this.recentInputsByRuntimeId.clear();
    this.listeners.clear();
  }

  private submitShellInput(
    inputId: string,
    modality: MasterInputModality,
    text: string,
    voice: Omit<CompletedGlobalSpeechTranscript, "input"> | null,
  ): void {
    if (this.pending) {
      throw new Error("a shell master input is already awaiting durable submission");
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
    this.pending = pending;
    this.updateSnapshot({
      completedTranscript,
      overlayOpen: true,
      submission: { input, type: "submitting" },
    });
    this.submitPending(pending);
  }

  private submitPending(pendingInput: PendingShellMasterInput): void {
    this.generation += 1;
    const generation = this.generation;
    let pending: Promise<AcceptedMasterInput>;
    try {
      pending = this.dependencies.submitMasterInput({ input: pendingInput.input });
    } catch {
      this.handleFailure(generation, pendingInput);
      return;
    }
    void pending.then(
      (accepted) => this.handleAccepted(generation, pendingInput, accepted),
      () => this.handleFailure(generation, pendingInput),
    );
  }

  private handleAccepted(
    generation: number,
    pending: PendingShellMasterInput,
    accepted: AcceptedMasterInput,
  ): void {
    if (!this.isCurrent(generation, pending)) {
      return;
    }
    if (!acceptedMasterInputMatches(accepted, pending.input)) {
      this.handleFailure(generation, pending);
      return;
    }
    const durableAccepted = Object.freeze({ ...accepted, input: pending.input });
    const recentInputs = appendRecentMasterInput(
      this.snapshotValue.recentInputs,
      durableAccepted,
      this.recentInputCapacityByRuntimeId.get(pending.runtimeId) ?? unhydratedRecentInputCapacity,
    );
    this.recentInputsByRuntimeId.set(pending.runtimeId, recentInputs);
    this.recentInputsRuntimeId = pending.runtimeId;
    this.pending = null;
    this.updateSnapshot({
      completedTranscript: null,
      recentInputs,
      submission: { accepted: durableAccepted, type: "accepted" },
    });
    this.observeAcceptedInputRouting(durableAccepted, pending.runtimeId);
  }

  private observeAcceptedInputRouting(accepted: AcceptedMasterInput, runtimeId: string): void {
    const generation = this.routingGeneration;
    let pending: Promise<InputRoutingState>;
    try {
      pending = this.dependencies.waitMasterInputState({ inputId: accepted.input.id });
    } catch {
      this.reportRoutingPresentationFailure(accepted.input.id, "wait boundary failed");
      return;
    }
    void pending.then(
      (state) => this.handleSettledInputRouting(generation, runtimeId, accepted, state),
      () => {
        if (this.isCurrentRouting(generation, runtimeId)) {
          this.reportRoutingPresentationFailure(accepted.input.id, "wait boundary failed");
        }
      },
    );
  }

  private async handleSettledInputRouting(
    generation: number,
    runtimeId: string,
    accepted: AcceptedMasterInput,
    state: InputRoutingState,
  ): Promise<void> {
    if (!this.isCurrentRouting(generation, runtimeId)) {
      return;
    }
    if (state.input.input.id !== accepted.input.id) {
      this.reportRoutingPresentationFailure(accepted.input.id, "settled input id changed");
      return;
    }
    let target: MasterConversationPresentationTarget | null;
    try {
      target = masterConversationPresentationTarget(state);
    } catch {
      this.reportRoutingPresentationFailure(accepted.input.id, "settled route was invalid");
      return;
    }
    if (!target) {
      return;
    }
    try {
      await this.dependencies.presentConversation(target);
    } catch {
      if (this.isCurrentRouting(generation, runtimeId)) {
        this.reportRoutingPresentationFailure(accepted.input.id, "pane presentation failed");
      }
    }
  }

  private isCurrentRouting(generation: number, runtimeId: string): boolean {
    return (
      !this.disposed &&
      generation === this.routingGeneration &&
      this.snapshotValue.runtimeId === runtimeId
    );
  }

  private reportRoutingPresentationFailure(inputId: string, reason: string): void {
    console.info(`Master route presentation failed: inputId=${inputId} reason=${reason}`);
  }

  private handleFailure(generation: number, pending: PendingShellMasterInput): void {
    if (!this.isCurrent(generation, pending)) {
      return;
    }
    console.info(`Shell master input submission failed: inputId=${pending.input.id}`);
    this.updateSnapshot({
      submission: {
        input: pending.input,
        message: failureMessage(pending.input.modality),
        type: "failed",
      },
    });
  }

  private isCurrent(generation: number, pending: PendingShellMasterInput): boolean {
    return (
      !this.disposed &&
      generation === this.generation &&
      this.pending === pending &&
      this.snapshotValue.runtimeId === pending.runtimeId
    );
  }

  private requiredRuntimeID(): string {
    const runtimeId = this.snapshotValue.runtimeId;
    if (!runtimeId) {
      throw new Error("connect to a Setta runtime before submitting master input");
    }
    return runtimeId;
  }

  private invalidate(): void {
    this.generation += 1;
  }

  private invalidateHistory(): void {
    this.historyGeneration += 1;
  }

  private invalidateRouting(): void {
    this.routingGeneration += 1;
  }

  private loadRecentInputs(runtimeId: string): void {
    this.historyGeneration += 1;
    const generation = this.historyGeneration;
    let pending: Promise<RecentMasterInputHistory>;
    try {
      pending = this.dependencies.readRecentMasterInputs(runtimeId);
    } catch {
      this.handleHistoryFailure(generation, runtimeId);
      return;
    }
    void pending.then(
      (history) => this.handleHistoryLoaded(generation, runtimeId, history),
      () => this.handleHistoryFailure(generation, runtimeId),
    );
  }

  private handleHistoryLoaded(
    generation: number,
    runtimeId: string,
    history: RecentMasterInputHistory,
  ): void {
    if (!this.isCurrentHistory(generation, runtimeId) || !validRecentMasterInputHistory(history)) {
      if (this.isCurrentHistory(generation, runtimeId)) {
        this.handleHistoryFailure(generation, runtimeId);
      }
      return;
    }
    const recentInputs = mergeRecentMasterInputs(
      history.inputs,
      this.snapshotValue.recentInputs,
      history.capacity,
    );
    this.recentInputCapacityByRuntimeId.set(runtimeId, history.capacity);
    this.recentInputsByRuntimeId.set(runtimeId, recentInputs);
    this.recentInputsRuntimeId = runtimeId;
    this.updateSnapshot({
      history: { capacity: history.capacity, type: "ready" },
      recentInputs,
    });
  }

  private handleHistoryFailure(generation: number, runtimeId: string): void {
    if (!this.isCurrentHistory(generation, runtimeId)) {
      return;
    }
    console.info(`Recent master input history load failed: runtimeId=${runtimeId}`);
    this.updateSnapshot({
      history: {
        message:
          "Setta could not load the durable master history. Retry to restore recent exchanges.",
        type: "failed",
      },
    });
  }

  private isCurrentHistory(generation: number, runtimeId: string): boolean {
    return (
      !this.disposed &&
      generation === this.historyGeneration &&
      runtimeId === this.snapshotValue.runtimeId
    );
  }

  private synchronizeRecentInputs(runtimeId: string | null): readonly AcceptedMasterInput[] {
    if (this.recentInputsRuntimeId) {
      this.recentInputsByRuntimeId.set(this.recentInputsRuntimeId, this.snapshotValue.recentInputs);
    }
    if (!runtimeId || runtimeId === this.recentInputsRuntimeId) {
      return this.snapshotValue.recentInputs;
    }
    this.recentInputsRuntimeId = runtimeId;
    return this.recentInputsByRuntimeId.get(runtimeId) ?? [];
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

export function masterConversationPresentationTarget(
  state: InputRoutingState,
): MasterConversationPresentationTarget | null {
  switch (state.status) {
    case "failed":
      return null;
    case "decided": {
      const record = state.decision;
      if (!record || record.inputId !== state.input.input.id) {
        throw new Error("decided master input is missing its matching route decision");
      }
      switch (record.decision.kind) {
        case "focus_conversation": {
          const conversationId = record.decision.focusConversation?.conversationId;
          if (!conversationId) {
            throw new Error("focus-conversation route is missing its target");
          }
          const authorities = record.context.targetAuthorities.filter(
            (authority) => authority.conversationId === conversationId,
          );
          if (
            authorities.length !== 1 ||
            !authorities[0]!.allowedDecisionKinds.includes("focus_conversation")
          ) {
            throw new Error("focus-conversation route target is not authorized");
          }
          return { conversationId, workspaceId: authorities[0]!.workspaceId };
        }
        case "answer_global":
        case "ask_narrator":
        case "clarify":
        case "create_conversation":
        case "create_side_conversation":
        case "fork_conversation":
        case "queue_agent_turn":
        case "send_to_agent":
        case "steer_active_turn":
          return null;
        default:
          return assertNeverRouteDecision(record.decision.kind);
      }
    }
    case "accepted":
    case "routing":
      throw new Error(`master input wait returned unsettled status ${state.status}`);
    default:
      return assertNeverRouteStatus(state.status);
  }
}

function appendRecentMasterInput(
  recentInputs: readonly AcceptedMasterInput[],
  accepted: AcceptedMasterInput,
  capacity: number,
): readonly AcceptedMasterInput[] {
  const next = [
    ...recentInputs.filter((candidate) => candidate.input.id !== accepted.input.id),
    accepted,
  ];
  return Object.freeze(next.slice(-capacity));
}

function mergeRecentMasterInputs(
  durableInputs: readonly AcceptedMasterInput[],
  localInputs: readonly AcceptedMasterInput[],
  capacity: number,
): readonly AcceptedMasterInput[] {
  const byID = new Map<string, AcceptedMasterInput>();
  for (const accepted of [...localInputs, ...durableInputs]) {
    byID.set(accepted.input.id, accepted);
  }
  return Object.freeze(
    [...byID.values()].sort((left, right) => left.sequence - right.sequence).slice(-capacity),
  );
}

function validRecentMasterInputHistory(history: RecentMasterInputHistory): boolean {
  if (
    !Number.isSafeInteger(history.capacity) ||
    history.capacity <= 0 ||
    history.inputs.length > history.capacity
  ) {
    return false;
  }
  let previousSequence = 0;
  const inputIDs = new Set<string>();
  for (const accepted of history.inputs) {
    if (
      !validAcceptedMasterInput(accepted) ||
      accepted.sequence <= previousSequence ||
      inputIDs.has(accepted.input.id)
    ) {
      return false;
    }
    previousSequence = accepted.sequence;
    inputIDs.add(accepted.input.id);
  }
  return true;
}

function acceptedMasterInputMatches(accepted: AcceptedMasterInput, input: MasterInput): boolean {
  return validAcceptedMasterInput(accepted) && masterInputsEqual(accepted.input, input);
}

function validAcceptedMasterInput(accepted: AcceptedMasterInput): boolean {
  return (
    Number.isSafeInteger(accepted.sequence) &&
    accepted.sequence > 0 &&
    accepted.acceptedAt !== "" &&
    accepted.replyDelivery.showInMasterOverlay &&
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

function failureMessage(modality: MasterInputModality): string {
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
  throw new Error(`Unhandled master input modality: ${String(value)}`);
}

function assertNeverRouteDecision(value: never): never {
  throw new Error(`Unhandled master route decision: ${String(value)}`);
}

function assertNeverRouteStatus(value: never): never {
  throw new Error(`Unhandled master route status: ${String(value)}`);
}
