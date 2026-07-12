import {
  conversationInputStatusValues,
  type AcceptedConversationInput,
  type ConversationInput,
  type SubmitConversationInputRequest,
} from "@generated/backend";

import type {
  CompletedConversationSpeechTranscript,
  FinalizedConversationSpeechTranscript,
} from "./speech-capture-destination";
import { canonicalSpeechInputTimestamp } from "./speech-input-submission";

export type ConversationInputSubmissionState =
  | { type: "idle" }
  | { input: ConversationInput; type: "submitting" }
  | { accepted: AcceptedConversationInput; type: "accepted" }
  | {
      input: ConversationInput;
      message: string;
      type: "failed";
    };

export interface GlobalSpeechConversationSubmissionSnapshot {
  completedTranscript: CompletedConversationSpeechTranscript | null;
  submission: ConversationInputSubmissionState;
}

export interface GlobalSpeechConversationSubmissionDependencies {
  now: () => Date;
  submitConversationInput: (
    request: SubmitConversationInputRequest,
  ) => Promise<AcceptedConversationInput>;
}

const conversationInputStatuses = new Set(conversationInputStatusValues);

export class GlobalSpeechConversationSubmissionController {
  private readonly dependencies: GlobalSpeechConversationSubmissionDependencies;
  private readonly listeners = new Set<() => void>();

  private disposed = false;
  private generation = 0;
  private snapshotValue: GlobalSpeechConversationSubmissionSnapshot = {
    completedTranscript: null,
    submission: { type: "idle" },
  };

  constructor(dependencies: GlobalSpeechConversationSubmissionDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot = (): GlobalSpeechConversationSubmissionSnapshot => this.snapshotValue;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  submitTranscript(completedTranscript: FinalizedConversationSpeechTranscript): void {
    this.assertUsable();
    if (this.snapshotValue.completedTranscript) {
      throw new Error("a completed conversation speech transcript is already awaiting submission");
    }
    const input = conversationInputForTranscript(completedTranscript, this.dependencies.now());
    const completed = Object.freeze({ ...completedTranscript, input });
    this.updateSnapshot({
      completedTranscript: completed,
      submission: { input, type: "submitting" },
    });
    this.submit(completed);
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
      throw new Error("a submitting conversation input cannot be discarded");
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

  private submit(completed: CompletedConversationSpeechTranscript): void {
    this.generation += 1;
    const generation = this.generation;
    let pending: Promise<AcceptedConversationInput>;
    try {
      pending = this.dependencies.submitConversationInput({ input: completed.input });
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
    completed: CompletedConversationSpeechTranscript,
    accepted: AcceptedConversationInput,
  ): void {
    if (!this.isCurrent(generation, completed)) {
      return;
    }
    if (!acceptedConversationInputMatches(accepted, completed.input)) {
      this.handleFailure(generation, completed);
      return;
    }
    const durableAccepted = Object.freeze({ ...accepted, input: completed.input });
    this.updateSnapshot({
      completedTranscript: null,
      submission: { accepted: durableAccepted, type: "accepted" },
    });
  }

  private handleFailure(
    generation: number,
    completed: CompletedConversationSpeechTranscript,
  ): void {
    if (!this.isCurrent(generation, completed)) {
      return;
    }
    console.info(`Conversation voice input submission failed: inputId=${completed.input.id}`);
    this.updateSnapshot({
      submission: {
        input: completed.input,
        message:
          "Setta could not accept the conversation voice request. Retry without recording it again.",
        type: "failed",
      },
    });
  }

  private isCurrent(generation: number, completed: CompletedConversationSpeechTranscript): boolean {
    return (
      !this.disposed &&
      generation === this.generation &&
      this.snapshotValue.completedTranscript === completed
    );
  }

  private invalidate(): void {
    this.generation += 1;
  }

  private updateSnapshot(update: Partial<GlobalSpeechConversationSubmissionSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...update };
    for (const listener of this.listeners) {
      listener();
    }
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("global speech conversation submission controller is disposed");
    }
  }
}

function conversationInputForTranscript(
  completed: FinalizedConversationSpeechTranscript,
  now: Date,
): ConversationInput {
  return Object.freeze({
    conversationId: completed.request.destination.conversationId,
    id: completed.captureSessionId,
    modality: "voice",
    replyToInputId: null,
    sourcePaneId: completed.request.sourcePaneId,
    submittedAt: canonicalSpeechInputTimestamp(now),
    text: completed.transcript,
  });
}

export function acceptedConversationInputMatches(
  accepted: AcceptedConversationInput,
  input: ConversationInput,
): boolean {
  return (
    Number.isSafeInteger(accepted.sequence) &&
    accepted.sequence > 0 &&
    conversationInputStatuses.has(accepted.status) &&
    accepted.acceptedAt !== "" &&
    conversationInputsEqual(accepted.input, input)
  );
}

function conversationInputsEqual(left: ConversationInput, right: ConversationInput): boolean {
  return (
    left.id === right.id &&
    left.conversationId === right.conversationId &&
    left.sourcePaneId === right.sourcePaneId &&
    left.replyToInputId === right.replyToInputId &&
    left.text === right.text &&
    left.modality === right.modality &&
    left.submittedAt === right.submittedAt
  );
}
