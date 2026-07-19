import { describe, expect, test } from "vitest";

import type { PaneSpeechPresentation } from "../global-speech/global-speech-presentation";
import type { EasyButtonProgressHighlight } from "./easy-button-rails";
import { speakingProgressHighlightId } from "./easy-button-speaking-highlight";

describe("Easy Button speaking highlight projection", () => {
  test("uses a direct event-backed highlight source when the playback source already matches", () => {
    expect(
      speakingProgressHighlightId(
        [highlight("trajectory_started", "Working")],
        speaking("status_reply", "trajectory_started"),
      ),
    ).toBe("trajectory_started");
  });

  test("maps narrator approval attention playback onto the event-backed approval highlight", () => {
    expect(
      speakingProgressHighlightId(
        [
          highlight("trajectory_started", "Working"),
          highlight("trajectory_approval", "Needs approval"),
        ],
        speaking("attention", "narration_approval"),
      ),
    ).toBe("trajectory_approval");
  });

  test("does not mark routine narrator playback without an event-backed highlight match", () => {
    expect(
      speakingProgressHighlightId(
        [highlight("trajectory_started", "Working")],
        speaking("status_reply", "narration_status"),
      ),
    ).toBeNull();
  });
});

function highlight(id: string, title: string): EasyButtonProgressHighlight {
  return {
    at: "2026-07-11T20:00:00Z",
    body: `${title} body`,
    id,
    title,
    turnStartedAt: "2026-07-11T20:00:00Z",
  };
}

function speaking(
  speakingIntentKind: NonNullable<PaneSpeechPresentation["speakingIntentKind"]>,
  speakingSourceEventId: string,
): PaneSpeechPresentation {
  return {
    activityKind: "speaking",
    activityLabel: "Narrator speaking",
    captureScope: "none",
    captureState: "idle",
    playbackScope: "this_conversation",
    playbackState: "speaking",
    speakingIntentKind,
    speakingSourceEventId,
    transcriptPreview: null,
    voiceControlDisabled: false,
    voiceControlLabel: "Start a voice request for this conversation",
    voiceControlSetupAction: null,
  };
}
