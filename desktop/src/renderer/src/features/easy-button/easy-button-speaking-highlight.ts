import type { SpeechPlaybackIntentKind } from "../global-speech/app-shell-speech-playback-controller";
import type { PaneSpeechPresentation } from "../global-speech/global-speech-presentation";
import type { EasyButtonProgressHighlight } from "./easy-button-rails";

const fallbackSpeakingTitles = {
  attention: ["Needs approval"],
  error: ["Failed", "Stopped"],
  final_summary: [],
  master_answer: [],
  milestone: [],
  progress_highlight: [],
  status_reply: [],
} as const satisfies Record<SpeechPlaybackIntentKind, readonly string[]>;

export function speakingProgressHighlightId(
  highlights: readonly EasyButtonProgressHighlight[],
  speech: PaneSpeechPresentation | null | undefined,
): string | null {
  if (!localNarratorSpeechIsSpeaking(speech)) {
    return null;
  }
  return (
    directSpeakingHighlightId(highlights, speech.speakingSourceEventId) ??
    latestHighlightIdWithAnyTitle(highlights, fallbackSpeakingTitles[speech.speakingIntentKind])
  );
}

function localNarratorSpeechIsSpeaking(
  speech: PaneSpeechPresentation | null | undefined,
): speech is PaneSpeechPresentation & { speakingIntentKind: SpeechPlaybackIntentKind } {
  return (
    speech !== null &&
    speech !== undefined &&
    speech.playbackScope === "this_conversation" &&
    speech.playbackState === "speaking" &&
    speech.speakingIntentKind !== null
  );
}

function directSpeakingHighlightId(
  highlights: readonly EasyButtonProgressHighlight[],
  sourceEventId: string | null,
): string | null {
  if (!sourceEventId) {
    return null;
  }
  return highlights.some((highlight) => highlight.id === sourceEventId) ? sourceEventId : null;
}

function latestHighlightIdWithAnyTitle(
  highlights: readonly EasyButtonProgressHighlight[],
  titles: readonly string[],
): string | null {
  return highlights.findLast((highlight) => titles.includes(highlight.title))?.id ?? null;
}
