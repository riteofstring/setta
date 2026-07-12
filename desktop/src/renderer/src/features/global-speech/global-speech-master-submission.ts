import type {
  AcceptedMasterInput,
  MasterInput,
  SubmitMasterInputRequest,
} from "@generated/backend";

import { canonicalSpeechInputTimestamp } from "./speech-input-submission";

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

export type MasterInputSubmissionState =
  | { type: "idle" }
  | { input: MasterInput; type: "submitting" }
  | { accepted: AcceptedMasterInput; type: "accepted" }
  | {
      input: MasterInput;
      message: string;
      type: "failed";
    };

export interface GlobalSpeechMasterSubmissionSnapshot {
  completedTranscript: CompletedGlobalSpeechTranscript | null;
  submission: MasterInputSubmissionState;
}

export interface GlobalSpeechMasterSubmissionDependencies {
  now: () => Date;
  readFocusHints: () => MasterInputFocusHints;
  submitMasterInput: (request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>;
}

export class GlobalSpeechMasterSubmissionController {
  private readonly dependencies: GlobalSpeechMasterSubmissionDependencies;
  private readonly listeners = new Set<() => void>();

  private disposed = false;
  private generation = 0;
  private snapshotValue: GlobalSpeechMasterSubmissionSnapshot = {
    completedTranscript: null,
    submission: { type: "idle" },
  };

  constructor(dependencies: GlobalSpeechMasterSubmissionDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot = (): GlobalSpeechMasterSubmissionSnapshot => this.snapshotValue;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  submitTranscript(captureSessionId: string, runtimeId: string, transcript: string): void {
    this.assertUsable();
    if (this.snapshotValue.completedTranscript) {
      throw new Error("a completed global speech transcript is already awaiting master submission");
    }
    const focus = this.dependencies.readFocusHints();
    const input = Object.freeze({
      focusedConversationId: focus.focusedConversationId,
      focusedPaneId: focus.focusedPaneId,
      focusedWorkspaceId: focus.focusedWorkspaceId,
      id: captureSessionId,
      modality: "voice",
      submittedAt: canonicalSpeechInputTimestamp(this.dependencies.now()),
      text: transcript,
    } satisfies MasterInput);
    const completedTranscript = { captureSessionId, input, runtimeId, transcript };
    this.updateSnapshot({
      completedTranscript,
      submission: { input, type: "submitting" },
    });
    this.submit(completedTranscript);
  }

  retry(): void {
    this.assertUsable();
    const completed = this.snapshotValue.completedTranscript;
    if (!completed || this.snapshotValue.submission.type !== "failed") {
      return;
    }
    this.updateSnapshot({ submission: { input: completed.input, type: "submitting" } });
    this.submit(completed);
  }

  discard(): void {
    this.assertUsable();
    if (this.snapshotValue.submission.type === "submitting") {
      throw new Error("a submitting master input cannot be discarded");
    }
    this.invalidate();
    this.updateSnapshot({ completedTranscript: null, submission: { type: "idle" } });
  }

  clearAccepted(): void {
    this.assertUsable();
    if (this.snapshotValue.submission.type === "accepted") {
      this.updateSnapshot({ submission: { type: "idle" } });
    }
  }

  reset(): void {
    this.assertUsable();
    this.invalidate();
    this.updateSnapshot({ completedTranscript: null, submission: { type: "idle" } });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.invalidate();
    this.listeners.clear();
  }

  private submit(completed: CompletedGlobalSpeechTranscript): void {
    this.generation += 1;
    const generation = this.generation;
    let pending: Promise<AcceptedMasterInput>;
    try {
      pending = this.dependencies.submitMasterInput({ input: completed.input });
    } catch {
      this.handleFailure(generation, completed);
      return;
    }
    void pending.then(
      (accepted) => this.handleAccepted(generation, completed, accepted),
      () => this.handleFailure(generation, completed),
    );
  }

  private handleAccepted(
    generation: number,
    completed: CompletedGlobalSpeechTranscript,
    accepted: AcceptedMasterInput,
  ): void {
    if (!this.isCurrent(generation, completed)) {
      return;
    }
    if (!acceptedMasterInputMatches(accepted, completed.input)) {
      this.handleFailure(generation, completed);
      return;
    }
    const durableAccepted = Object.freeze({ ...accepted, input: completed.input });
    this.updateSnapshot({
      completedTranscript: null,
      submission: { accepted: durableAccepted, type: "accepted" },
    });
  }

  private handleFailure(generation: number, completed: CompletedGlobalSpeechTranscript): void {
    if (!this.isCurrent(generation, completed)) {
      return;
    }
    console.info(`Global master input submission failed: inputId=${completed.input.id}`);
    this.updateSnapshot({
      submission: {
        input: completed.input,
        message: "Setta could not accept the voice request. Retry without recording it again.",
        type: "failed",
      },
    });
  }

  private isCurrent(generation: number, completed: CompletedGlobalSpeechTranscript): boolean {
    return (
      !this.disposed &&
      generation === this.generation &&
      this.snapshotValue.completedTranscript === completed
    );
  }

  private invalidate(): void {
    this.generation += 1;
  }

  private updateSnapshot(update: Partial<GlobalSpeechMasterSubmissionSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...update };
    for (const listener of this.listeners) {
      listener();
    }
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("global speech master submission controller is disposed");
    }
  }
}

function acceptedMasterInputMatches(accepted: AcceptedMasterInput, input: MasterInput): boolean {
  return (
    Number.isSafeInteger(accepted.sequence) &&
    accepted.sequence > 0 &&
    accepted.acceptedAt !== "" &&
    masterInputsEqual(accepted.input, input)
  );
}

function masterInputsEqual(left: MasterInput, right: MasterInput): boolean {
  return (
    left.id === right.id &&
    left.text === right.text &&
    left.modality === right.modality &&
    left.submittedAt === right.submittedAt &&
    left.focusedWorkspaceId === right.focusedWorkspaceId &&
    left.focusedConversationId === right.focusedConversationId &&
    left.focusedPaneId === right.focusedPaneId
  );
}
