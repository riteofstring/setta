import type { EasyRunSpeechPlaybackIntent } from "../../stores/easy-run-events";
import type { SpeechPlaybackSource } from "./speech-playback-controller";
import type { SpeechOutputMode } from "./speech-output-preference";

export interface AutomaticSpeechPlaybackContext {
  easyRunId: string | null;
  mode: SpeechOutputMode;
  outputConfigured: boolean;
  runtimeId: string | null;
  workspaceId: string | null;
}

export function automaticSpeechPlaybackSource(
  intent: EasyRunSpeechPlaybackIntent,
  context: AutomaticSpeechPlaybackContext,
): SpeechPlaybackSource | null {
  if (
    !context.outputConfigured ||
    !context.runtimeId ||
    intent.source.workspaceId !== context.workspaceId ||
    intent.source.easyRunId !== context.easyRunId
  ) {
    return null;
  }
  switch (intent.type) {
    case "terminal_summary":
      return context.mode === "off" ? null : { ...intent.source, kind: "terminal_summary" };
    case "highlight":
      return context.mode === "highlights_and_final"
        ? { ...intent.source, kind: "highlight" }
        : null;
  }
}
