import type {
  Artifact,
  ArtifactMetadata,
  ConversationTurn,
  NarrationEvent,
  TrajectoryEvent,
} from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  easyButtonTerminalSummary,
  EasyButtonTerminalSummary,
  type EasyButtonTerminalSummaryRecord,
} from "./easy-button-terminal-summary";

describe("Easy Button conversation terminal summary", () => {
  test("renders the exact persisted final-summary and source turn", () => {
    const html = renderToString(<EasyButtonTerminalSummary summary={summary("completed")} />);

    expect(html).toContain('data-easy-button-summary-source="summary_topic"');
    expect(html).toContain('data-easy-button-summary-turn="turn_topic"');
    expect(html).toContain("Topic work is complete.");
    expect(html).toContain("easy-button-summary-ok");
  });

  test.each(["cancelled", "failed"] as const)(
    "does not present a %s turn as successful",
    (status) => {
      const html = renderToString(<EasyButtonTerminalSummary summary={summary(status)} />);
      expect(html).not.toContain("easy-button-summary-ok");
    },
  );

  test("renders no terminal channel when the narrator has not produced one", () => {
    expect(renderToString(<EasyButtonTerminalSummary summary={null} />)).toBe("");
  });

  test("uses a same-turn table source total before narrator and raw final text", () => {
    const turn = conversationTurn("turn_loc", "completed");
    const artifact = artifactMetadata("artifact_loc", turn.id, "table");
    const summary = easyButtonTerminalSummary({
      artifactPayloads: [locTableArtifact(artifact)],
      artifacts: [artifact],
      latestTurn: turn,
      narration: [finalSummaryEvent(turn.id, "Narrator repeated the full result.")],
      trajectory: [agentMessageEvent(turn.id, "Raw final text repeated the table.")],
      viewState: "complete",
    });

    expect(summary).toEqual({
      id: "artifact:artifact_loc",
      status: "completed",
      text: "Done. The source total is 245,293 LOC; the full breakdown is in the table.",
      turnId: "turn_loc",
    });
  });

  test("uses compact generic copy for same-turn artifacts without a typed headline", () => {
    const turn = conversationTurn("turn_file", "completed");
    const artifact = artifactMetadata("artifact_file", turn.id, "file");
    const summary = easyButtonTerminalSummary({
      artifactPayloads: [],
      artifacts: [artifact],
      latestTurn: turn,
      narration: [finalSummaryEvent(turn.id, "Narrator repeated file details.")],
      trajectory: [agentMessageEvent(turn.id, "Raw final text repeated file details.")],
      viewState: "complete",
    });

    expect(summary?.text).toBe("Done. I put the result in the artifact.");
    expect(summary?.id).toBe("artifact:artifact_file");
  });

  test("keeps narrator final summaries when artifacts belong to earlier turns", () => {
    const turn = conversationTurn("turn_latest", "completed");
    const priorArtifact = artifactMetadata("artifact_prior", "turn_prior", "table");
    const summary = easyButtonTerminalSummary({
      artifactPayloads: [locTableArtifact(priorArtifact)],
      artifacts: [priorArtifact],
      latestTurn: turn,
      narration: [finalSummaryEvent(turn.id, "Latest narrator summary.")],
      trajectory: [agentMessageEvent(turn.id, "Latest raw final text.")],
      viewState: "complete",
    });

    expect(summary?.text).toBe("Latest narrator summary.");
    expect(summary?.id).toBe("summary_turn_latest");
  });
});

function summary(
  status: EasyButtonTerminalSummaryRecord["status"],
): EasyButtonTerminalSummaryRecord {
  return {
    id: "summary_topic",
    status,
    text: "Topic work is complete.",
    turnId: "turn_topic",
  };
}

function conversationTurn(
  id: string,
  status: EasyButtonTerminalSummaryRecord["status"],
): ConversationTurn {
  return {
    acceptedAt: "2026-07-11T20:00:00Z",
    authoredInput: { text: "Count repository LOC" },
    conversationId: "conversation_topic",
    delivery: "normal",
    endedAt: "2026-07-11T20:00:10Z",
    error: null,
    id,
    providerTurnId: `provider_${id}`,
    requestedRoleProfile: {} as ConversationTurn["requestedRoleProfile"],
    resolvedInvocation: null,
    startedAt: "2026-07-11T20:00:01Z",
    status,
  };
}

function artifactMetadata(
  id: string,
  turnId: string,
  kind: ArtifactMetadata["kind"],
): ArtifactMetadata {
  return {
    conversationId: "conversation_topic",
    createdAt: "2026-07-11T20:00:08Z",
    id,
    kind,
    title: "Setta repository LOC breakdown",
    trajectorySequence: 12,
    turnId,
  };
}

function locTableArtifact(metadata: ArtifactMetadata): Artifact {
  return {
    ...baseArtifact(metadata),
    kind: "table",
    table: {
      columns: [
        { key: "category", label: "Category" },
        { key: "language", label: "Language / format" },
        { key: "code", label: "Code/content lines" },
      ],
      rows: [
        ["Source", "Go", "117,347"],
        ["Source total", "Programming/UI languages", "245,293"],
      ],
    },
  };
}

function baseArtifact(metadata: ArtifactMetadata): Artifact {
  return {
    barChart: null,
    conversationId: metadata.conversationId,
    createdAt: metadata.createdAt,
    file: null,
    id: metadata.id,
    kind: metadata.kind,
    markdown: null,
    table: null,
    title: metadata.title,
    trajectorySequence: metadata.trajectorySequence,
    turnId: metadata.turnId,
  };
}

function finalSummaryEvent(turnId: string, text: string): NarrationEvent {
  return {
    conversationId: "conversation_topic",
    createdAt: "2026-07-11T20:00:12Z",
    finalSummary: { text },
    id: `summary_${turnId}`,
    kind: "final_summary",
    milestone: null,
    resolvedInvocation: {} as NarrationEvent["resolvedInvocation"],
    sourceSequenceEnd: 14,
    sourceSequenceStart: 10,
    statusReply: null,
    streamSequence: 3,
    topicDescriptor: null,
    trigger: "turn_terminal",
    turnId,
  };
}

function agentMessageEvent(turnId: string, text: string): TrajectoryEvent {
  return {
    actor: "agent",
    activityCompleted: null,
    activityFailed: null,
    activityProgressed: null,
    activityStarted: null,
    agentLivenessChanged: null,
    agentMessageCompleted: { providerItemId: `agent_${turnId}`, text },
    agentPublicTextDelta: null,
    approvalRequested: null,
    approvalResolved: null,
    artifactEmitted: null,
    conversationId: "conversation_topic",
    emittedAt: "2026-07-11T20:00:11Z",
    fileChangeCompleted: null,
    fileChangeProposed: null,
    id: `trajectory_agent_${turnId}`,
    kind: "agent_message_completed",
    modelRerouted: null,
    planChanged: null,
    providerEventId: null,
    providerLifecycleChanged: null,
    providerThreadId: null,
    providerTurnId: `provider_${turnId}`,
    publicReasoningSummaryUpdated: null,
    sequence: 13,
    subagentCompleted: null,
    subagentStarted: null,
    subagentUpdated: null,
    turnCompleted: null,
    turnFailed: null,
    turnId,
    turnInterrupted: null,
    turnPromoted: null,
    turnQueued: null,
    turnStarted: null,
    turnSteered: null,
    userInputAccepted: null,
  };
}
