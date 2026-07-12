import type {
  AcceptedMasterInput,
  MasterInput,
  MasterInputModality,
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

interface AppShellMasterSnapshot {
  completedTranscript: CompletedGlobalSpeechTranscript | null;
  runtimeId: string | null;
  submission: MasterInputSubmissionState;
}

export interface AppShellMasterControllerDependencies {
  createInputId: () => string;
  now: () => Date;
  readFocusHints: () => MasterInputFocusHints;
  submitMasterInput: (request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>;
}

// AppShellMasterController is the sole shell-owned intake controller. Text and
// finalized voice transcripts use the same runtime generation, focus snapshot,
// durable submission state, exact retry, and shared master input endpoint.
export class AppShellMasterController {
  private readonly dependencies: AppShellMasterControllerDependencies;
  private readonly listeners = new Set<() => void>();

  private disposed = false;
  private generation = 0;
  private pending: PendingShellMasterInput | null = null;
  private snapshotValue: AppShellMasterSnapshot = {
    completedTranscript: null,
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
    this.pending = null;
    this.updateSnapshot({
      completedTranscript: null,
      runtimeId,
      submission: { type: "idle" },
    });
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

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.invalidate();
    this.pending = null;
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
    this.pending = null;
    this.updateSnapshot({
      completedTranscript: null,
      submission: { accepted: durableAccepted, type: "accepted" },
    });
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

function acceptedMasterInputMatches(accepted: AcceptedMasterInput, input: MasterInput): boolean {
  return (
    Number.isSafeInteger(accepted.sequence) &&
    accepted.sequence > 0 &&
    accepted.acceptedAt !== "" &&
    accepted.replyDelivery.showInMasterOverlay &&
    accepted.replyDelivery.originatingWorkspaceId === null &&
    accepted.replyDelivery.originatingConversationId === null &&
    accepted.replyDelivery.originatingPaneId === null &&
    accepted.replyDelivery.originatingConversationInputId === null &&
    masterInputsEqual(accepted.input, input)
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
