import type { MasterInputModality, TranscriptEntry } from "@generated/backend";
import { Check, CircleAlert, Square } from "lucide-react";
import type { ReactNode } from "react";

import type { AppShellMasterSnapshot } from "./app-shell-master-controller";

type TranscriptEntryViewProps = { entry: TranscriptEntry };

const transcriptEntryViews = {
  action_receipt: ActionReceiptTranscriptEntry,
  assistant_reply: AssistantReplyTranscriptEntry,
  cancellation: CancellationTranscriptEntry,
  failure: FailureTranscriptEntry,
  user_input: UserInputTranscriptEntry,
} satisfies Record<
  TranscriptEntry["payload"]["kind"],
  (props: TranscriptEntryViewProps) => ReactNode
>;

export function MasterTranscriptEntries({ entries }: { entries: TranscriptEntry[] }) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <>
      {entries.map((entry) => (
        <MasterTranscriptEntryView entry={entry} key={entry.payload.id} />
      ))}
    </>
  );
}

export function visibleTranscriptEntries(snapshot: AppShellMasterSnapshot): TranscriptEntry[] {
  if (snapshot.transcript.type !== "ready") {
    return [];
  }
  const activeInputId = activeTranscriptInputId(snapshot);
  return snapshot.transcript.transcript.entries.filter(
    (entry) => entry.payload.inputId !== activeInputId,
  );
}

function MasterTranscriptEntryView({ entry }: TranscriptEntryViewProps) {
  const EntryView = transcriptEntryViews[entry.payload.kind];
  return <EntryView entry={entry} />;
}

function UserInputTranscriptEntry({ entry }: TranscriptEntryViewProps) {
  const payload = entry.payload.userInput;
  if (!payload) {
    return null;
  }
  return (
    <article
      className="setta-master-overlay-user-message"
      data-master-transcript-kind={entry.payload.kind}
      data-testid="master-transcript-entry"
    >
      <div className="setta-master-overlay-message-meta">
        <span>You</span>
        <span>{masterInputModalityLabel(payload.modality)}</span>
      </div>
      <p>{payload.text}</p>
    </article>
  );
}

function AssistantReplyTranscriptEntry({ entry }: TranscriptEntryViewProps) {
  const payload = entry.payload.assistantReply;
  if (!payload) {
    return null;
  }
  return (
    <div
      className={`setta-master-overlay-result is-${payload.replyKind === "clarification" ? "clarification" : "answer"}`}
      data-master-transcript-kind={entry.payload.kind}
      data-testid="master-transcript-entry"
      role="status"
    >
      <Check aria-hidden="true" />
      <div>
        <strong>{masterTranscriptReplyHeading(payload.replyKind)}</strong>
        <p>{payload.text}</p>
      </div>
    </div>
  );
}

function ActionReceiptTranscriptEntry({ entry }: TranscriptEntryViewProps) {
  const payload = entry.payload.actionReceipt;
  if (!payload) {
    return null;
  }
  return (
    <div
      className="setta-master-overlay-result is-ready"
      data-master-transcript-kind={entry.payload.kind}
      data-testid="master-transcript-entry"
      role="status"
    >
      <Check aria-hidden="true" />
      <div>
        <strong>Action recorded</strong>
        <p>{payload.text}</p>
      </div>
    </div>
  );
}

function CancellationTranscriptEntry({ entry }: TranscriptEntryViewProps) {
  const payload = entry.payload.cancellation;
  if (!payload) {
    return null;
  }
  return (
    <div
      className="setta-master-overlay-result is-cancelled"
      data-master-transcript-kind={entry.payload.kind}
      data-testid="master-transcript-entry"
      role="status"
    >
      <Square aria-hidden="true" />
      <div>
        <strong>Request cancelled</strong>
        <p>{payload.message}</p>
      </div>
    </div>
  );
}

function FailureTranscriptEntry({ entry }: TranscriptEntryViewProps) {
  const payload = entry.payload.failure;
  if (!payload) {
    return null;
  }
  return (
    <div
      className="setta-master-overlay-result is-failed"
      data-master-transcript-kind={entry.payload.kind}
      data-testid="master-transcript-entry"
      role="alert"
    >
      <CircleAlert aria-hidden="true" />
      <div>
        <strong>Setta could not route this request</strong>
        <p>{payload.message}</p>
      </div>
    </div>
  );
}

function activeTranscriptInputId(snapshot: AppShellMasterSnapshot): string | null {
  return pendingTranscriptInputId(snapshot) ?? interactionTranscriptInputId(snapshot);
}

function pendingTranscriptInputId(snapshot: AppShellMasterSnapshot): string | null {
  switch (snapshot.submission.type) {
    case "failed":
    case "submitting":
      return snapshot.submission.input.id;
    case "accepted":
      return snapshot.submission.accepted.input.id;
    case "idle":
      return null;
    default:
      return assertNever(snapshot.submission);
  }
}

function interactionTranscriptInputId(snapshot: AppShellMasterSnapshot): string | null {
  if (snapshot.interaction.type === "active") {
    return snapshot.interaction.state.input.id;
  }
  if (snapshot.interaction.type === "observation_failed") {
    return snapshot.interaction.state.input.id;
  }
  return null;
}

function masterInputModalityLabel(modality: MasterInputModality): string {
  switch (modality) {
    case "text":
      return "Typed";
    case "voice":
      return "Voice";
    default:
      return assertNever(modality);
  }
}

function masterTranscriptReplyHeading(replyKind: "answer" | "clarification"): string {
  switch (replyKind) {
    case "answer":
      return "Setta answered";
    case "clarification":
      return "Setta needs one detail";
    default:
      return assertNever(replyKind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported master transcript value: ${JSON.stringify(value)}`);
}
