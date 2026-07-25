import type { Transcript } from "@generated/backend";

export const masterTranscriptReadLimit = 200;

export type MasterTranscriptState =
  | { type: "disconnected" }
  | { type: "loading" }
  | { transcript: Transcript; type: "ready" }
  | { message: string; type: "failed" };

type TranscriptPayload = Transcript["entries"][number]["payload"];
type TranscriptPayloadKind = TranscriptPayload["kind"];

const transcriptPayloadValidators = {
  action_receipt: validActionReceiptPayload,
  assistant_reply: validAssistantReplyPayload,
  cancellation: validCancellationPayload,
  failure: validFailurePayload,
  user_input: validUserInputPayload,
} satisfies Record<TranscriptPayloadKind, (payload: TranscriptPayload) => boolean>;

export function validMasterTranscript(transcript: Transcript): boolean {
  return (
    validTranscriptBounds(transcript) &&
    transcript.entries.every(validTranscriptEntry) &&
    validTranscriptLastSequence(transcript)
  );
}

function validTranscriptBounds(transcript: Transcript): boolean {
  return transcript.lastSequence >= 0 && transcript.entries.length <= masterTranscriptReadLimit;
}

function validTranscriptEntry(
  entry: Transcript["entries"][number],
  index: number,
  entries: Transcript["entries"],
): boolean {
  const previousSequence = index === 0 ? 0 : entries[index - 1]!.sequence;
  return (
    entry.sequence > previousSequence &&
    entry.payload.id.trim() !== "" &&
    entry.payload.inputId.trim() !== "" &&
    entry.payload.createdAt.trim() !== "" &&
    validTranscriptPayload(entry.payload)
  );
}

function validTranscriptLastSequence(transcript: Transcript): boolean {
  if (transcript.entries.length === 0) {
    return transcript.lastSequence === 0;
  }
  return transcript.lastSequence === transcript.entries[transcript.entries.length - 1]!.sequence;
}

function validTranscriptPayload(payload: TranscriptPayload): boolean {
  const validator = transcriptPayloadValidators[payload.kind];
  return transcriptPayloadBodyCount(payload) === 1 && validator(payload);
}

function transcriptPayloadBodyCount(payload: TranscriptPayload): number {
  return [
    payload.userInput,
    payload.assistantReply,
    payload.actionReceipt,
    payload.cancellation,
    payload.failure,
  ].filter(hasPayloadBody).length;
}

function hasPayloadBody<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function validUserInputPayload(payload: TranscriptPayload): boolean {
  const userInput = payload.userInput;
  return (
    hasPayloadBody(userInput) &&
    userInput.text.trim() !== "" &&
    (userInput.modality === "text" || userInput.modality === "voice")
  );
}

function validAssistantReplyPayload(payload: TranscriptPayload): boolean {
  const assistantReply = payload.assistantReply;
  return (
    hasPayloadBody(assistantReply) &&
    assistantReply.text.trim() !== "" &&
    (assistantReply.replyKind === "answer" || assistantReply.replyKind === "clarification")
  );
}

function validActionReceiptPayload(payload: TranscriptPayload): boolean {
  const actionReceipt = payload.actionReceipt;
  return hasPayloadBody(actionReceipt) && actionReceipt.text.trim() !== "";
}

function validCancellationPayload(payload: TranscriptPayload): boolean {
  const cancellation = payload.cancellation;
  return hasPayloadBody(cancellation) && cancellation.message.trim() !== "";
}

function validFailurePayload(payload: TranscriptPayload): boolean {
  const failure = payload.failure;
  return hasPayloadBody(failure) && failure.code.trim() !== "" && failure.message.trim() !== "";
}
