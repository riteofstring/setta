import type {
  ConversationPresentationProfile,
  NarrationEvent,
  TurnStatus,
} from "@generated/backend";

import type {
  NarratorSpeechPlaybackIntent,
  SpeechPlaybackIntentKind,
} from "./app-shell-speech-playback-controller";

export function narrationSpeechPlaybackIntent(
  event: NarrationEvent,
  profile: ConversationPresentationProfile,
  turnStatus: TurnStatus | null,
): NarratorSpeechPlaybackIntent | null {
  if (event.conversationId !== profile.conversationId) {
    throw new Error("narration speech event and presentation profile ownership do not match");
  }
  if (!profile.narratorSpeechEnabled) {
    return null;
  }
  if (!profile.resolvedNarratorVoiceId) {
    throw new Error("enabled narrator speech requires a resolved narrator voice");
  }
  const kind = narrationPlaybackKind(event, turnStatus);
  if (!kind) {
    return null;
  }
  return {
    kind,
    resolvedVoiceId: profile.resolvedNarratorVoiceId,
    source: {
      conversationId: event.conversationId,
      eventId: event.id,
      speaker: "narrator",
    },
    sourceCreatedAt: event.createdAt,
    sourceSequenceEnd: event.sourceSequenceEnd,
    sourceSequenceStart: event.sourceSequenceStart,
    turnId: event.turnId,
  };
}

export function speechPlaybackPriority(kind: SpeechPlaybackIntentKind): number {
  switch (kind) {
    case "master_answer":
    case "status_reply":
      return 4;
    case "attention":
    case "error":
      return 3;
    case "final_summary":
      return 2;
    case "milestone":
      return 1;
    default:
      return assertNever(kind);
  }
}

function narrationPlaybackKind(
  event: NarrationEvent,
  turnStatus: TurnStatus | null,
): NarratorSpeechPlaybackIntent["kind"] | null {
  switch (event.kind) {
    case "status_reply":
      return "status_reply";
    case "final_summary":
      if (turnStatus === null) {
        throw new Error("final narration playback requires its authoritative turn status");
      }
      return turnStatus === "failed" ? "error" : "final_summary";
    case "milestone":
      return event.trigger === "approval_required" ? "attention" : "milestone";
    case "topic_descriptor":
      return null;
    default:
      return assertNever(event.kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported speech playback value: ${JSON.stringify(value)}`);
}
