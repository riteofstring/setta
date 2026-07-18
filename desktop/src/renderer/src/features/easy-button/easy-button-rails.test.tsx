import type {
  Artifact,
  ArtifactMetadata,
  ReadConversationArtifactRequest,
} from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  ArtifactRail,
  HighlightRail,
  type EasyButtonMilestone,
  milestoneElapsedLabel,
  readVisibleArtifactPayloads,
} from "./easy-button-rails";

const conversationId = "conversation_topic";
const workspaceId = "workspace_topic";

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

  test("marks only the milestone currently spoken by playback", () => {
    const html = renderToString(
      <HighlightRail
        milestones={[milestone("milestone_first"), milestone("milestone_second")]}
        speakingMilestoneId="milestone_first"
      />,
    );

    expect(html).toContain('data-easy-button-highlight-id="milestone_first"');
    expect(html).toContain('data-easy-button-highlight-speaking="true"');
    expect(html.match(/data-easy-button-highlight-speaking="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('data-easy-button-highlight-id="milestone_second"');
  });

  test("measures each milestone from its own conversation turn", () => {
    expect(milestoneElapsedLabel("2026-07-11T20:00:00Z", "2026-07-11T20:02:03Z")).toBe("2:03");
    expect(milestoneElapsedLabel(null, "2026-07-11T20:02:03Z")).toBe("");
    expect(milestoneElapsedLabel("later", "earlier")).toBe("");
  });

  test("renders typed conversation artifact payloads exhaustively", async () => {
    const artifacts = [markdownArtifact(), tableArtifact(), barChartArtifact(), fileArtifact()];
    const metadata = artifacts.map(artifactMetadata);
    const readArtifact = artifactReader(artifacts);
    await readVisibleArtifactPayloads({
      artifacts: metadata,
      conversationId,
      readArtifact,
      workspaceId,
    });
    const html = renderToString(
      <ArtifactRail
        artifacts={metadata}
        conversationId={conversationId}
        readArtifact={readArtifact}
        workspaceId={workspaceId}
      />,
    );

    expect(html).toContain('data-artifact-id="artifact_topic"');
    expect(html).toContain('data-artifact-kind="markdown"');
    expect(html).toContain('data-artifact-kind="table"');
    expect(html).toContain('data-artifact-kind="bar_chart"');
    expect(html).toContain('data-artifact-kind="file"');
    expect(html).toContain("Markdown");
    expect(html).toContain("Table");
    expect(html).toContain("Bar chart");
    expect(html).toContain("File");
    expect(html).toContain("Conversation report");
    expect(html).toContain("<table");
    expect(html).toContain("Rows");
    expect(html).toContain("12 files");
    expect(html).toContain("/tmp/topic-report.md");
  });

  test("renders only the newest visible artifact cards", () => {
    const artifacts = Array.from({ length: 8 }, (_, index) =>
      markdownArtifact(`artifact_${index}`),
    );
    const html = renderToString(
      <ArtifactRail
        artifacts={artifacts.map(artifactMetadata)}
        conversationId={conversationId}
        readArtifact={artifactReader(artifacts)}
        workspaceId={workspaceId}
      />,
    );

    expect(html.match(/data-artifact-id=/g)).toHaveLength(6);
    expect(html).not.toContain('data-artifact-id="artifact_0"');
    expect(html).not.toContain('data-artifact-id="artifact_1"');
    expect(html).toContain('data-artifact-id="artifact_7"');
  });

  test("reads payloads only for newest visible artifact cards", async () => {
    const artifacts = Array.from({ length: 8 }, (_, index) =>
      markdownArtifact(`visible_artifact_${index}`),
    );
    const requested: string[] = [];
    await readVisibleArtifactPayloads({
      artifacts: artifacts.map(artifactMetadata),
      conversationId,
      readArtifact: artifactReader(artifacts, requested),
      workspaceId,
    });

    expect(requested).toEqual([
      "visible_artifact_2",
      "visible_artifact_3",
      "visible_artifact_4",
      "visible_artifact_5",
      "visible_artifact_6",
      "visible_artifact_7",
    ]);
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

function baseArtifact(
  id: string,
): Omit<Artifact, "kind" | "markdown" | "table" | "barChart" | "file"> {
  return {
    conversationId,
    createdAt: "2026-07-11T20:00:01Z",
    id,
    title: "Conversation report",
    trajectorySequence: null,
    turnId: "turn_topic",
  };
}

function artifactMetadata(artifact: Artifact): ArtifactMetadata {
  return {
    conversationId: artifact.conversationId,
    createdAt: artifact.createdAt,
    id: artifact.id,
    kind: artifact.kind,
    title: artifact.title,
    trajectorySequence: artifact.trajectorySequence,
    turnId: artifact.turnId,
  };
}

function artifactReader(
  artifacts: readonly Artifact[],
  requested: string[] = [],
): (request: ReadConversationArtifactRequest) => Promise<Artifact> {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  return async (request) => {
    requested.push(request.artifactId);
    const artifact = byId.get(request.artifactId);
    if (!artifact) {
      throw new Error(`missing test artifact ${request.artifactId}`);
    }
    return artifact;
  };
}

function markdownArtifact(id = "artifact_topic"): Artifact {
  return {
    ...baseArtifact(id),
    kind: "markdown",
    markdown: { markdown: "Conversation report body" },
    table: null,
    barChart: null,
    file: null,
  };
}

function tableArtifact(): Artifact {
  return {
    ...baseArtifact("artifact_table"),
    kind: "table",
    markdown: null,
    table: {
      columns: [
        { key: "metric", label: "Metric" },
        { key: "value", label: "Value" },
      ],
      rows: [["Rows", "4"]],
    },
    barChart: null,
    file: null,
  };
}

function barChartArtifact(): Artifact {
  return {
    ...baseArtifact("artifact_bar"),
    kind: "bar_chart",
    markdown: null,
    table: null,
    barChart: { items: [{ label: "TypeScript", value: 12, unit: "files" }] },
    file: null,
  };
}

function fileArtifact(): Artifact {
  return {
    ...baseArtifact("artifact_file"),
    kind: "file",
    markdown: null,
    table: null,
    barChart: null,
    file: { path: "/tmp/topic-report.md", description: "Generated report" },
  };
}
