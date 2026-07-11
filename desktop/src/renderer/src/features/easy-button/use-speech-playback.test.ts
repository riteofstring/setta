import { describe, expect, test } from "vitest";

import type { EasyRunSpeechPlaybackIntent } from "../../stores/easy-run-events";
import {
  automaticSpeechPlaybackSource,
  type AutomaticSpeechPlaybackContext,
} from "./use-speech-playback";

const summaryIntent: EasyRunSpeechPlaybackIntent = {
  eventId: "events:7",
  source: { easyRunId: "easy_run_live", workspaceId: "workspace_live" },
  type: "terminal_summary",
};

const highlightIntent: EasyRunSpeechPlaybackIntent = {
  eventId: "events:6",
  source: {
    easyRunId: "easy_run_live",
    highlightId: "highlight_live",
    workspaceId: "workspace_live",
  },
  type: "highlight",
};

const enabledContext: AutomaticSpeechPlaybackContext = {
  mode: "final",
  outputConfigured: true,
  runtimeId: "runtime_live",
  workspaceId: "workspace_live",
};

describe("Easy Button automatic speech playback", () => {
  test.each(["final", "highlights_and_final"] as const)(
    "accepts a live summary intent in %s mode",
    (mode) => {
      expect(automaticSpeechPlaybackSource(summaryIntent, { ...enabledContext, mode })).toEqual({
        ...summaryIntent.source,
        kind: "terminal_summary",
      });
    },
  );

  test("accepts a live highlight only in highlights-and-final mode", () => {
    expect(
      automaticSpeechPlaybackSource(highlightIntent, {
        ...enabledContext,
        mode: "highlights_and_final",
      }),
    ).toEqual({ ...highlightIntent.source, kind: "highlight" });
    expect(automaticSpeechPlaybackSource(highlightIntent, enabledContext)).toBeNull();
    expect(
      automaticSpeechPlaybackSource(highlightIntent, { ...enabledContext, mode: "off" }),
    ).toBeNull();
  });

  test.each([
    ["output off", { mode: "off" }],
    ["speech unconfigured", { outputConfigured: false }],
    ["runtime disconnected", { runtimeId: null }],
    ["workspace changed", { workspaceId: "workspace_other" }],
  ] satisfies ReadonlyArray<readonly [string, Partial<AutomaticSpeechPlaybackContext>]>)(
    "rejects an intent when %s",
    (_name, override) => {
      expect(
        automaticSpeechPlaybackSource(summaryIntent, { ...enabledContext, ...override }),
      ).toBeNull();
      expect(
        automaticSpeechPlaybackSource(highlightIntent, {
          ...enabledContext,
          mode: "highlights_and_final",
          ...override,
        }),
      ).toBeNull();
    },
  );
});
