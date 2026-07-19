import type { MasterVoiceSelection, ShellInteractionState } from "@generated/backend";

import type { SpeechPlaybackIntent } from "./app-shell-speech-playback-controller";

export function masterSpeechPlaybackIntent(
  state: ShellInteractionState,
  masterVoice: MasterVoiceSelection,
): SpeechPlaybackIntent | null {
  if (state.status !== "decided" || state.decision?.kind !== "answer_global") {
    return null;
  }
  if (!masterVoice.resolvedVoiceId) {
    throw new Error("master answer speech requires a resolved master voice");
  }
  return {
    kind: "master_answer",
    resolvedVoiceId: masterVoice.resolvedVoiceId,
    source: {
      conversationId: null,
      eventId: state.input.id,
      speaker: "master",
    },
    sourceCreatedAt: null,
  };
}
