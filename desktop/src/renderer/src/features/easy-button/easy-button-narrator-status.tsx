import type { NarrationEvent, NarratorState } from "@generated/backend";

export interface EasyButtonNarratorStatusReply {
  createdAt: string;
  id: string;
  question: string;
  sourceSequenceEnd: number;
  streamSequence: number;
  text: string;
}

const statusReplyPresentationLifetimeMs = 20_000;

export function latestNarratorStatusReply(
  narration: readonly NarrationEvent[],
  lastTrajectorySequence: number,
  nowMs = Date.now(),
): EasyButtonNarratorStatusReply | null {
  let laterMeaningfulNarration = false;
  for (let index = narration.length - 1; index >= 0; index -= 1) {
    const event = narration[index];
    if (!event) {
      continue;
    }
    if (isStatusReplyEvent(event)) {
      return activeStatusReply(event, lastTrajectorySequence, laterMeaningfulNarration, nowMs);
    }
    if (statusReplySupersedingNarration(event)) {
      laterMeaningfulNarration = true;
    }
  }
  return null;
}

function isStatusReplyEvent(
  event: NarrationEvent,
): event is NarrationEvent & { statusReply: NonNullable<NarrationEvent["statusReply"]> } {
  return event.kind === "status_reply" && event.statusReply !== null;
}

function activeStatusReply(
  event: NarrationEvent & { statusReply: NonNullable<NarrationEvent["statusReply"]> },
  lastTrajectorySequence: number,
  laterMeaningfulNarration: boolean,
  nowMs: number,
): EasyButtonNarratorStatusReply | null {
  if (statusReplyStale(event, lastTrajectorySequence, laterMeaningfulNarration, nowMs)) {
    return null;
  }
  return {
    createdAt: event.createdAt,
    id: event.id,
    question: event.statusReply.question,
    sourceSequenceEnd: event.sourceSequenceEnd,
    streamSequence: event.streamSequence,
    text: event.statusReply.text,
  };
}

function statusReplyStale(
  event: NarrationEvent,
  lastTrajectorySequence: number,
  laterMeaningfulNarration: boolean,
  nowMs: number,
): boolean {
  return (
    laterMeaningfulNarration ||
    event.sourceSequenceEnd < lastTrajectorySequence ||
    statusReplyExpired(event.createdAt, nowMs)
  );
}

function statusReplyExpired(createdAt: string, nowMs: number): boolean {
  const createdMs = Date.parse(createdAt);
  return Number.isFinite(createdMs) && nowMs - createdMs > statusReplyPresentationLifetimeMs;
}

function statusReplySupersedingNarration(event: NarrationEvent): boolean {
  switch (event.kind) {
    case "milestone":
    case "final_summary":
    case "topic_descriptor":
      return true;
    case "status_reply":
      return false;
  }
}

export function narratorDegradationMessage(state: NarratorState): string | null {
  return state.degradation ? state.degradation.message : null;
}

export function NarratorStatusReply({ reply }: { reply: EasyButtonNarratorStatusReply | null }) {
  if (!reply) {
    return null;
  }
  return (
    <section
      aria-label="Narrator status reply"
      className="easy-button-status-reply"
      data-narration-event-id={reply.id}
      data-testid="easy-button-status-reply"
    >
      <p className="easy-button-status-label">STATUS</p>
      <p aria-live="polite" className="easy-button-status-reply-text" role="status">
        {reply.text}
      </p>
    </section>
  );
}

export function NarratorDegradationStatus({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p
      aria-live="polite"
      className="easy-button-narrator-status"
      data-testid="easy-button-narrator-status"
      role="status"
    >
      {message}
    </p>
  );
}
