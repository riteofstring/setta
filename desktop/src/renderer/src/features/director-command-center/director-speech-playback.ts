import type { DirectorReceipt, MasterVoiceSelection } from "@generated/backend";

import type {
  AppShellSpeechPlaybackController,
  SpeechPlaybackIntent,
} from "../global-speech/app-shell-speech-playback-controller";

export function directorSpeechPlaybackIntent(
  receipt: DirectorReceipt,
  masterVoice: MasterVoiceSelection,
): SpeechPlaybackIntent | null {
  const outcome = receipt.kind === "submit" ? receipt.submit : null;
  if (outcome === null) {
    return null;
  }
  if (outcome.decision !== "answer_directly" && outcome.decision !== "ask_clarification") {
    return null;
  }
  if (!masterVoice.resolvedVoiceId) {
    throw new Error("Director speech requires a resolved assistant voice");
  }
  if (outcome.publicText.trim() === "") {
    throw new Error("Director reply speech requires public text");
  }
  return {
    kind: "director_reply",
    resolvedVoiceId: masterVoice.resolvedVoiceId,
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
  readMasterVoiceSelection,
  receipt,
}: {
  controller: AppShellSpeechPlaybackController;
  readMasterVoiceSelection: (() => Promise<MasterVoiceSelection>) | undefined;
  receipt: DirectorReceipt;
}): Promise<void> {
  if (receipt.kind !== "submit" || readMasterVoiceSelection === undefined) {
    return;
  }
  const masterVoice = await readMasterVoiceSelection();
  const intent = directorSpeechPlaybackIntent(receipt, masterVoice);
  if (intent !== null) {
    controller.enqueueAutomatic(intent);
  }
}
