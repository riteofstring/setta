import type { DirectorReceipt, DirectorVoiceSelection } from "@generated/backend";

import type {
  AppShellSpeechPlaybackController,
  SpeechPlaybackIntent,
} from "../global-speech/app-shell-speech-playback-controller";

export function directorSpeechPlaybackIntent(
  receipt: DirectorReceipt,
  directorVoice: DirectorVoiceSelection,
): SpeechPlaybackIntent | null {
  const outcome = receipt.kind === "submit" ? receipt.submit : null;
  if (outcome === null) {
    return null;
  }
  if (outcome.decision !== "answer_directly" && outcome.decision !== "ask_clarification") {
    return null;
  }
  if (!directorVoice.resolvedVoiceId) {
    throw new Error("Director speech requires a resolved Director voice");
  }
  if (outcome.publicText.trim() === "") {
    throw new Error("Director reply speech requires public text");
  }
  return {
    kind: "director_reply",
    resolvedVoiceId: directorVoice.resolvedVoiceId,
    source: {
      conversationId: null,
      eventId: outcome.intentId,
      speaker: "director",
    },
    sourceCreatedAt: null,
  };
}

export async function enqueueDirectorSpeechPlayback({
  controller,
  readDirectorVoiceSelection,
  receipt,
}: {
  controller: AppShellSpeechPlaybackController;
  readDirectorVoiceSelection: (() => Promise<DirectorVoiceSelection>) | undefined;
  receipt: DirectorReceipt;
}): Promise<void> {
  if (receipt.kind !== "submit" || readDirectorVoiceSelection === undefined) {
    return;
  }
  const directorVoice = await readDirectorVoiceSelection();
  const intent = directorSpeechPlaybackIntent(receipt, directorVoice);
  if (intent !== null) {
    controller.enqueueAutomatic(intent);
  }
}
