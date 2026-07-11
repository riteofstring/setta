import { describe, expect, test } from "vitest";

import type { EasyRunSpeechPlaybackIntent } from "../../stores/easy-run-events";
import {
  automaticSummarySource,
  type AutomaticSummaryPlaybackContext,
} from "./use-speech-playback";

const intent: EasyRunSpeechPlaybackIntent = {
  eventId: "events:7",
  source: { easyRunId: "easy_run_live", workspaceId: "workspace_live" },
  type: "terminal_summary",
};

const enabledContext: AutomaticSummaryPlaybackContext = {
  mode: "final",
  outputConfigured: true,
  runtimeId: "runtime_live",
  workspaceId: "workspace_live",
};

describe("Easy Button automatic summary playback", () => {
  test.each(["final", "highlights_and_final"] as const)(
    "accepts a live summary intent in %s mode",
    (mode) => {
      expect(automaticSummarySource(intent, { ...enabledContext, mode })).toEqual(intent.source);
    },
  );

  test.each([
    ["output off", { mode: "off" }],
    ["speech unconfigured", { outputConfigured: false }],
    ["runtime disconnected", { runtimeId: null }],
    ["workspace changed", { workspaceId: "workspace_other" }],
  ] satisfies ReadonlyArray<readonly [string, Partial<AutomaticSummaryPlaybackContext>]>)(
    "rejects an intent when %s",
    (_name, override) => {
      expect(automaticSummarySource(intent, { ...enabledContext, ...override })).toBeNull();
    },
  );
});
