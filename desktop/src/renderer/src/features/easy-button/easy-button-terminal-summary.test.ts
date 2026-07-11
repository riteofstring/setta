import { describe, expect, test } from "vitest";

import type { SpeechPlaybackState, SpeechSummarySource } from "./speech-playback-controller";
import { terminalSummaryPlaybackType } from "./easy-button-terminal-summary";

describe("Easy Button terminal summary speech source", () => {
  const source: SpeechSummarySource = {
    easyRunId: "run_visible",
    workspaceId: "workspace_visible",
  };

  test.each<Exclude<SpeechPlaybackState["type"], "idle">>([
    "synthesizing",
    "speaking",
    "stopped",
    "failed",
  ])("identifies the exact visible summary while %s", (type) => {
    const state = playbackState(type, source);
    expect(terminalSummaryPlaybackType(state, source)).toBe(type);
  });

  test("does not point at a different run or workspace", () => {
    const speaking = playbackState("speaking", source);

    expect(terminalSummaryPlaybackType(speaking, { ...source, easyRunId: "run_other" })).toBe(
      "idle",
    );
    expect(
      terminalSummaryPlaybackType(speaking, { ...source, workspaceId: "workspace_other" }),
    ).toBe("idle");
    expect(terminalSummaryPlaybackType(speaking, null)).toBe("idle");
  });
});

function playbackState(
  type: Exclude<SpeechPlaybackState["type"], "idle">,
  source: SpeechSummarySource,
): SpeechPlaybackState {
  return type === "failed" ? { message: "Voice failed", source, type } : { source, type };
}
