import type { ConversationPresentationProfile, TrajectoryEvent } from "@generated/backend";

import type { NarratorSpeechPlaybackIntent } from "./app-shell-speech-playback-controller";

export function progressHighlightSpeechPlaybackIntent(
  event: TrajectoryEvent,
  profile: ConversationPresentationProfile,
): NarratorSpeechPlaybackIntent | null {
  if (event.conversationId !== profile.conversationId) {
    throw new Error("progress highlight event and presentation profile ownership do not match");
  }
  if (!profile.narratorSpeechEnabled) {
    return null;
  }
  if (!profile.resolvedNarratorVoiceId) {
    throw new Error("enabled narrator speech requires a resolved narrator voice");
  }
  if (!progressHighlightEventIsSpeechWorthy(event)) {
    return null;
  }
  return {
    kind: "progress_highlight",
    resolvedVoiceId: profile.resolvedNarratorVoiceId,
    source: {
      conversationId: event.conversationId,
      eventId: event.id,
      kind: "progress_highlight",
      speaker: "narrator",
    },
    sourceCreatedAt: event.emittedAt,
    sourceSequenceEnd: event.sequence,
    sourceSequenceStart: event.sequence,
    turnId: event.turnId,
  };
}

function progressHighlightEventIsSpeechWorthy(event: TrajectoryEvent): boolean {
  return progressHighlightSpeechEligibility[event.kind](event);
}

type ProgressHighlightSpeechEligibility = Record<
  TrajectoryEvent["kind"],
  (event: TrajectoryEvent) => boolean
>;

const routineTrajectoryEvent = () => false;

const progressHighlightSpeechEligibility = {
  activity_completed: routineTrajectoryEvent,
  activity_failed: routineTrajectoryEvent,
  activity_progressed: routineTrajectoryEvent,
  activity_started: routineTrajectoryEvent,
  agent_liveness_changed: routineTrajectoryEvent,
  agent_message_completed: routineTrajectoryEvent,
  agent_public_text_delta: routineTrajectoryEvent,
  approval_requested: (event) => hasTurn(event) && event.approvalRequested !== null,
  approval_resolved: (event) => hasTurn(event) && event.approvalResolved !== null,
  artifact_emitted: (event) => event.artifactEmitted !== null,
  file_change_completed: routineTrajectoryEvent,
  file_change_proposed: routineTrajectoryEvent,
  model_rerouted: routineTrajectoryEvent,
  plan_changed: routineTrajectoryEvent,
  provider_lifecycle_changed: routineTrajectoryEvent,
  public_reasoning_summary_updated: routineTrajectoryEvent,
  subagent_completed: routineTrajectoryEvent,
  subagent_started: routineTrajectoryEvent,
  subagent_updated: routineTrajectoryEvent,
  turn_completed: (event) => hasTurn(event) && event.turnCompleted !== null,
  turn_failed: (event) => hasTurn(event) && event.turnFailed !== null,
  turn_interrupted: (event) => hasTurn(event) && event.turnInterrupted !== null,
  turn_promoted: routineTrajectoryEvent,
  turn_queued: routineTrajectoryEvent,
  turn_started: (event) => hasTurn(event) && event.turnStarted !== null,
  turn_steered: routineTrajectoryEvent,
  user_input_accepted: routineTrajectoryEvent,
} satisfies ProgressHighlightSpeechEligibility;

function hasTurn(event: TrajectoryEvent): boolean {
  return event.turnId !== null;
}
