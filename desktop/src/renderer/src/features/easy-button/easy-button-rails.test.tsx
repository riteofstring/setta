import type { EasyHighlight } from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { HighlightRail, highlightIsSpeaking } from "./easy-button-rails";
import type { SpeechPlaybackState } from "./speech-playback-controller";

describe("Easy Button narrator-highlight speech source", () => {
  const first = highlight("highlight_first");
  const second = highlight("highlight_second");
  const speaking: SpeechPlaybackState = {
    source: {
      easyRunId: first.easyRunId,
      highlightId: first.id,
      kind: "highlight",
      workspaceId: "workspace_visible",
    },
    type: "speaking",
  };

  test("marks only the exact persisted highlight while it is speaking", () => {
    expect(highlightIsSpeaking(speaking, first, "workspace_visible")).toBe(true);
    expect(highlightIsSpeaking(speaking, second, "workspace_visible")).toBe(false);
    expect(highlightIsSpeaking(speaking, first, "workspace_other")).toBe(false);
    expect(highlightIsSpeaking(speaking, first, null)).toBe(false);
    expect(
      highlightIsSpeaking({ ...speaking, type: "synthesizing" }, first, "workspace_visible"),
    ).toBe(false);
  });

  test("does not point at a terminal summary from the same run", () => {
    expect(
      highlightIsSpeaking(
        {
          source: {
            easyRunId: first.easyRunId,
            kind: "terminal_summary",
            workspaceId: "workspace_visible",
          },
          type: "speaking",
        },
        first,
        "workspace_visible",
      ),
    ).toBe(false);
  });

  test("keeps equalizer bars mounted inside every fixed dot box", () => {
    const html = renderToString(
      <HighlightRail
        highlights={[first, second]}
        latestRun={null}
        playbackState={speaking}
        workspaceId="workspace_visible"
      />,
    );

    expect(html).toContain(
      'data-easy-button-highlight-id="highlight_first" data-easy-button-highlight-speaking="true"',
    );
    expect(html).toContain(
      'data-easy-button-highlight-id="highlight_second" data-easy-button-highlight-speaking="false"',
    );
    expect(html.match(/class="easy-button-highlight-dot"/g)).toHaveLength(2);
    expect(html.match(/<i><\/i>/g)).toHaveLength(6);
  });
});

function highlight(id: string): EasyHighlight {
  return {
    at: "2026-07-10T12:00:01Z",
    easyRunId: "easy_run_visible",
    id,
    ordinal: id === "highlight_first" ? 1 : 2,
    text: id,
  };
}
