import type { NarrationEvent, NarratorState } from "@generated/backend";

export interface EasyButtonNarratorStatusReply {
  id: string;
  question: string;
  text: string;
}

export function latestNarratorStatusReply(
  narration: readonly NarrationEvent[],
): EasyButtonNarratorStatusReply | null {
  for (let index = narration.length - 1; index >= 0; index -= 1) {
    const event = narration[index];
    if (event?.kind === "status_reply" && event.statusReply) {
      return {
        id: event.id,
        question: event.statusReply.question,
        text: event.statusReply.text,
      };
    }
  }
  return null;
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
      <p className="easy-button-status-question">{reply.question}</p>
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
