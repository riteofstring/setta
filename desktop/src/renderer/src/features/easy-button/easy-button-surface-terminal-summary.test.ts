import type {
  Artifact,
  ArtifactMetadata,
  ConversationPresentationProfile,
  ConversationSnapshot,
  ConversationTurn,
  NarrationEvent,
  NarratorState,
  TopicConversation,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import type { ConversationProjection } from "../../stores/conversation-projection";
import { easyButtonProjectionView } from "./easy-button-surface";

const workspaceId = "workspace_topic";
const conversationId = "conversation_loc";
const turnId = "turn_loc";
const timestamp = "2026-07-11T20:00:00Z";

describe("Easy Button projection terminal summaries", () => {
  test("passes loaded same-turn table data into compact artifact-first completion", () => {
    const snapshot = completedSnapshot();
    const artifact = tableMetadata();
    snapshot.artifacts.artifacts = [artifact];
    snapshot.narration.events = [
      finalSummaryEvent("Narrator repeated source totals, top languages, and table details."),
    ];

    const view = easyButtonProjectionView(conversationId, readyProjection(snapshot), null, null, [
      locTableArtifact(artifact),
    ]);

    expect(view.terminalSummary).toMatchObject({
      id: "artifact:artifact_loc",
      text: "Done. The source total is 245,293 LOC; the full breakdown is in the table.",
      turnId,
    });
  });
});

function completedSnapshot(): ConversationSnapshot {
  return {
    artifacts: { artifacts: [], hasEarlier: false },
    branch: null,
    conversation: conversation(),
    eventCursor: { sequence: 4, streamId: `conversation:${conversationId}` },
    narration: { events: [], hasEarlier: false },
    narratorState: narratorState(),
    pendingApprovals: [],
    presentationProfile: presentationProfile(),
    queue: [],
    roleProfileOverrides: [],
    schemaVersion: 1,
    sideConversations: [],
    sideEvents: { events: [], hasEarlier: false, limit: 200 },
    threadBinding: null,
    trajectory: { events: [], hasEarlier: false },
    turns: { hasEarlier: false, turns: [completedTurn()] },
  };
}

function conversation(): TopicConversation {
  return {
    archivedAt: null,
    createdAt: timestamp,
    id: conversationId,
    lastTrajectorySequence: 4,
    status: "idle",
    title: "LOC topic",
    topicDescriptor: "LOC topic",
    updatedAt: timestamp,
    workspaceId,
  };
}

function completedTurn(): ConversationTurn {
  return {
    acceptedAt: timestamp,
    authoredInput: { text: "Count repository LOC" },
    conversationId,
    delivery: "normal",
    endedAt: timestamp,
    error: null,
    id: turnId,
    providerTurnId: "provider_turn_loc",
    requestedRoleProfile: {} as ConversationTurn["requestedRoleProfile"],
    resolvedInvocation: null,
    startedAt: timestamp,
    status: "completed",
  };
}

function tableMetadata(): ArtifactMetadata {
  return {
    conversationId,
    createdAt: timestamp,
    id: "artifact_loc",
    kind: "table",
    title: "Setta repository LOC breakdown",
    trajectorySequence: 3,
    turnId,
  };
}

function locTableArtifact(metadata: ArtifactMetadata): Artifact {
  return {
    barChart: null,
    conversationId: metadata.conversationId,
    createdAt: metadata.createdAt,
    file: null,
    id: metadata.id,
    kind: "table",
    markdown: null,
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
    title: metadata.title,
    trajectorySequence: metadata.trajectorySequence,
    turnId: metadata.turnId,
  };
}

function finalSummaryEvent(text: string): NarrationEvent {
  return {
    conversationId,
    createdAt: timestamp,
    finalSummary: { text },
    id: "summary_loc",
    kind: "final_summary",
    milestone: null,
    resolvedInvocation: {} as NarrationEvent["resolvedInvocation"],
    sourceSequenceEnd: 4,
    sourceSequenceStart: 1,
    statusReply: null,
    streamSequence: 1,
    topicDescriptor: null,
    trigger: "turn_terminal",
    turnId,
  };
}

function narratorState(): NarratorState {
  return {
    checkpointText: "",
    checkpointThroughSequence: 0,
    conversationId,
    currentFocus: "Count repository LOC",
    currentFocusRevision: 1,
    currentFocusSourceSequence: 1,
    degradation: null,
    lastInvocationAt: timestamp,
    observedThroughSequence: 4,
    status: "ready",
    topicDescriptor: "LOC topic",
    updatedAt: timestamp,
  };
}

function presentationProfile(): ConversationPresentationProfile {
  return {
    conversationId,
    narratorSpeechEnabled: true,
    narratorVoiceReuse: null,
    narratorVoiceSelection: "auto_distinct",
    paletteReuse: null,
    paletteSelection: "auto_distinct",
    requestedNarratorVoiceId: null,
    requestedPaletteId: null,
    resolvedNarratorVoiceId: "alloy",
    resolvedPaletteId: "sky",
    updatedAt: timestamp,
  };
}

function readyProjection(snapshot: ConversationSnapshot): ConversationProjection {
  return {
    conversationId,
    error: null,
    resync: null,
    snapshot,
    status: "ready",
    workspaceId,
  };
}
