import type { Artifact } from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  ArtifactRail,
  HighlightRail,
  type EasyButtonMilestone,
  milestoneElapsedLabel,
} from "./easy-button-rails";

describe("Easy Button conversation rails", () => {
  test("renders persisted narrator milestones without provider-thread identity", () => {
    const html = renderToString(
      <HighlightRail milestones={[milestone("milestone_first"), milestone("milestone_second")]} />,
    );

    expect(html).toContain('aria-label="Milestones"');
    expect(html).toContain('data-easy-button-highlight-id="milestone_first"');
    expect(html).toContain('data-easy-button-highlight-id="milestone_second"');
    expect(html).not.toContain("providerThreadId");
    expect(html.match(/class="easy-button-highlight-dot"/g)).toHaveLength(2);
    expect(html).not.toContain("data-easy-button-highlight-speaking");
  });

  test("measures each milestone from its own conversation turn", () => {
    expect(milestoneElapsedLabel("2026-07-11T20:00:00Z", "2026-07-11T20:02:03Z")).toBe("2:03");
    expect(milestoneElapsedLabel(null, "2026-07-11T20:02:03Z")).toBe("");
    expect(milestoneElapsedLabel("later", "earlier")).toBe("");
  });

  test("renders the typed conversation artifact identity and reference", () => {
    const html = renderToString(<ArtifactRail artifacts={[artifact()]} />);

    expect(html).toContain('data-artifact-id="artifact_topic"');
    expect(html).toContain('data-artifact-kind="tool_output"');
    expect(html).toContain("Tool output");
    expect(html).toContain("Conversation report");
    expect(html).toContain("setta://artifacts/topic-report");
    expect(html).toContain("application/json");
  });
});

function milestone(id: string): EasyButtonMilestone {
  return {
    at: "2026-07-11T20:00:01Z",
    id,
    text: id,
    turnStartedAt: "2026-07-11T20:00:00Z",
  };
}

function artifact(): Artifact {
  return {
    conversationId: "conversation_topic",
    createdAt: "2026-07-11T20:00:01Z",
    id: "artifact_topic",
    kind: "tool_output",
    mediaType: "application/json",
    metadata: {},
    title: "Conversation report",
    trajectorySequence: null,
    turnId: "turn_topic",
    uri: "setta://artifacts/topic-report",
  };
}
