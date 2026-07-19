import type {
  ArtifactMetadata,
  ConversationPresentationProfile,
  ConversationSnapshot,
  ConversationTurn,
  NarratorState,
  PermissionProfile,
  ResolvedInvocation,
  Role,
  RoleProfile,
  TrajectoryApprovalRequest,
  TrajectoryEvent,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import type { PendingConversationApproval } from "./easy-button-approval-projection";
import { progressHighlightViews } from "./easy-button-progress-highlights";

const conversationId = "conversation_progress";
const timestamp = "2026-07-11T20:00:00Z";
const turnId = "turn_progress";
const workspaceId = "workspace_progress";

describe("Easy Button progress highlight projection", () => {
  test("projects eligible trajectory events and ignores routine activity", () => {
    const table = artifact("artifact_table", "table", "Language counts");
    const turn = conversationTurn("running");
    const snapshot = conversationSnapshot({
      artifacts: [table],
      events: [
        userInputAccepted(1),
        turnStarted(2),
        activityStarted(3),
        agentTextDelta(4),
        artifactEmitted(5, table.id),
        turnCompleted(6),
      ],
      turn,
    });

    expect(progressHighlightViews(snapshot, turn, null)).toEqual([
      expect.objectContaining({
        body: "Count repository LOC",
        id: "trajectory_started",
        title: "Working",
      }),
      expect.objectContaining({
        body: "Language counts",
        id: "trajectory_artifact_table",
        title: "Table ready",
      }),
      expect.objectContaining({
        body: "Work completed.",
        id: "trajectory_completed",
        title: "Complete",
      }),
    ]);
  });

  test("replaces a blocked approval highlight when approval resolves", () => {
    const request = approvalRequest("approval_download", "Download cloc to /tmp?");
    const turn = conversationTurn("running");
    const blockedSnapshot = conversationSnapshot({
      events: [userInputAccepted(1), turnStarted(2), approvalRequested(3, request)],
      turn,
    });

    expect(progressHighlightViews(blockedSnapshot, turn, null)).toEqual([
      expect.objectContaining({
        body: "Download cloc to /tmp?",
        title: "Needs approval",
      }),
    ]);

    const resumedSnapshot = conversationSnapshot({
      events: [
        userInputAccepted(1),
        turnStarted(2),
        approvalRequested(3, request),
        approvalResolved(4, request.id),
      ],
      turn,
    });

    expect(progressHighlightViews(resumedSnapshot, turn, null)).toEqual([
      expect.objectContaining({
        body: "Count repository LOC",
        title: "Approval received",
      }),
    ]);
  });

  test("does not revive an approval request emitted after a terminal event", () => {
    const request = approvalRequest("approval_stale", "Approve stale work?");
    const turn = conversationTurn("completed");
    const snapshot = conversationSnapshot({
      events: [
        userInputAccepted(1),
        turnStarted(2),
        turnCompleted(3),
        approvalRequested(4, request),
      ],
      turn,
    });

    expect(progressHighlightViews(snapshot, turn, null)).toEqual([
      expect.objectContaining({ title: "Working" }),
      expect.objectContaining({ title: "Complete" }),
    ]);
  });

  test("uses pending approval and terminal turn state when event windows omit them", () => {
    const approval = approvalRequest("approval_pending", "Approve the pending operation?");
    const turn = conversationTurn("cancelled");
    const snapshot = conversationSnapshot({
      events: [userInputAccepted(1), turnStarted(2)],
      turn,
    });
    const pending: PendingConversationApproval = { approval, turnId: turn.id };

    expect(progressHighlightViews(snapshot, turn, pending)).toEqual([
      expect.objectContaining({
        body: "Approve the pending operation?",
        title: "Needs approval",
      }),
      expect.objectContaining({
        body: "Work cancelled.",
        title: "Stopped",
      }),
    ]);
  });
});

function conversationSnapshot({
  artifacts = [],
  events,
  turn,
}: {
  artifacts?: ArtifactMetadata[];
  events: TrajectoryEvent[];
  turn: ConversationTurn;
}): ConversationSnapshot {
  return {
    artifacts: { artifacts, hasEarlier: false },
    branch: null,
    conversation: {
      archivedAt: null,
      createdAt: timestamp,
      id: conversationId,
      lastTrajectorySequence: events.at(-1)?.sequence ?? 0,
      status: turn.status === "running" ? "working" : "idle",
      title: "LOC request",
      topicDescriptor: "LOC request",
      updatedAt: timestamp,
      workspaceId,
    },
    eventCursor: { sequence: 0, streamId: `conversation:${conversationId}` },
    narration: { events: [], hasEarlier: false },
    narratorState: narratorState(),
    presentationProfile: presentationProfile(),
    queue: [],
    roleProfileOverrides: [],
    schemaVersion: 1,
    sideConversations: [],
    sideEvents: { events: [], hasEarlier: false, limit: 200 },
    threadBinding: null,
    trajectory: { events, hasEarlier: false },
    turns: { hasEarlier: false, turns: [turn] },
  };
}

function conversationTurn(status: ConversationTurn["status"]): ConversationTurn {
  return {
    acceptedAt: timestamp,
    authoredInput: { text: "Count repository LOC" },
    conversationId,
    delivery: "normal",
    endedAt: status === "running" || status === "queued" ? null : timestamp,
    error: null,
    id: turnId,
    providerTurnId: "provider_turn_progress",
    requestedRoleProfile: roleProfile("agent"),
    resolvedInvocation: resolvedInvocation("agent", status === "running" ? "running" : "succeeded"),
    startedAt: timestamp,
    status,
  };
}

function userInputAccepted(sequence: number): TrajectoryEvent {
  return trajectoryEvent({
    actor: "user",
    kind: "user_input_accepted",
    sequence,
    userInputAccepted: {
      delivery: "normal",
      input: { text: "Count repository LOC" },
    },
  });
}

function turnStarted(sequence: number): TrajectoryEvent {
  return trajectoryEvent({
    id: "trajectory_started",
    kind: "turn_started",
    sequence,
    turnStarted: { invocation: resolvedInvocation("agent", "running") },
  });
}

function activityStarted(sequence: number): TrajectoryEvent {
  return trajectoryEvent({
    activityStarted: {
      activity: {
        command: "git ls-files",
        cwd: null,
        id: "activity_scan",
        kind: "command",
        namespace: null,
        processId: null,
        server: null,
        title: "Run repository scan",
        tool: null,
      },
    },
    kind: "activity_started",
    sequence,
  });
}

function agentTextDelta(sequence: number): TrajectoryEvent {
  return trajectoryEvent({
    agentPublicTextDelta: {
      delta: "Routine text should stay out of the rail.",
      providerItemId: "provider_text",
    },
    kind: "agent_public_text_delta",
    sequence,
  });
}

function artifactEmitted(sequence: number, artifactId: string): TrajectoryEvent {
  return trajectoryEvent({
    artifactEmitted: { artifactId },
    id: `trajectory_${artifactId}`,
    kind: "artifact_emitted",
    sequence,
  });
}

function turnCompleted(sequence: number): TrajectoryEvent {
  return trajectoryEvent({
    id: "trajectory_completed",
    kind: "turn_completed",
    sequence,
    turnCompleted: {},
  });
}

function approvalRequested(sequence: number, approval: TrajectoryApprovalRequest): TrajectoryEvent {
  return trajectoryEvent({
    approvalRequested: { approval },
    id: `trajectory_${approval.id}`,
    kind: "approval_requested",
    sequence,
  });
}

function approvalResolved(sequence: number, approvalId: string): TrajectoryEvent {
  return trajectoryEvent({
    approvalResolved: {
      resolution: {
        answers: [],
        approvalId,
        decision: "approved",
        resolvedAt: timestamp,
        response: "",
        secretsRedacted: false,
      },
    },
    id: `trajectory_${approvalId}_resolved`,
    kind: "approval_resolved",
    sequence,
  });
}

function trajectoryEvent(
  overrides: Partial<TrajectoryEvent> & Pick<TrajectoryEvent, "kind" | "sequence">,
): TrajectoryEvent {
  return {
    actor: "agent",
    activityCompleted: null,
    activityFailed: null,
    activityProgressed: null,
    activityStarted: null,
    agentLivenessChanged: null,
    agentMessageCompleted: null,
    agentPublicTextDelta: null,
    approvalRequested: null,
    approvalResolved: null,
    artifactEmitted: null,
    conversationId,
    emittedAt: timestamp,
    fileChangeCompleted: null,
    fileChangeProposed: null,
    id: `trajectory_${overrides.kind}_${overrides.sequence}`,
    modelRerouted: null,
    planChanged: null,
    providerEventId: null,
    providerLifecycleChanged: null,
    providerThreadId: null,
    providerTurnId: null,
    publicReasoningSummaryUpdated: null,
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
    ...overrides,
  };
}

function artifact(id: string, kind: ArtifactMetadata["kind"], title: string): ArtifactMetadata {
  return {
    conversationId,
    createdAt: timestamp,
    id,
    kind,
    title,
    trajectorySequence: 5,
    turnId,
  };
}

function approvalRequest(id: string, body: string): TrajectoryApprovalRequest {
  return {
    body,
    command: null,
    cwd: null,
    filePaths: [],
    id,
    kind: "permission",
    providerItemId: `provider_${id}`,
    questions: [],
    requestedAt: timestamp,
    requestedPermissionProfile: null,
    title: "Approval",
  };
}

function narratorState(): NarratorState {
  return {
    checkpointText: "",
    checkpointThroughSequence: 0,
    conversationId,
    currentFocus: "Count repository LOC",
    currentFocusRevision: 1,
    currentFocusSourceSequence: 2,
    degradation: null,
    lastInvocationAt: timestamp,
    observedThroughSequence: 2,
    status: "ready",
    topicDescriptor: "LOC request",
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
    resolvedPaletteId: "teal",
    updatedAt: timestamp,
  };
}

function resolvedInvocation(
  role: Role,
  outcome: ResolvedInvocation["outcome"],
): ResolvedInvocation {
  const requested = roleProfile(role);
  return {
    endedAt: outcome === "running" ? null : timestamp,
    failure: null,
    id: `invocation_${role}_${outcome}`,
    modelReroutes: [],
    outcome,
    provider: "codex",
    providerReferences: {
      requestId: null,
      responseId: null,
      threadId: `thread_${role}`,
      turnId: null,
    },
    requested,
    resolved: {
      modelId: "gpt-test",
      permissionProfile: requested.permissionProfile,
      reasoningEffort: "low",
      serviceTier: null,
    },
    role,
    startedAt: timestamp,
  };
}

function roleProfile(role: Role): RoleProfile {
  return {
    contextBudget: {
      maxInputBytes: 4_096,
      maxInputTokens: 1_024,
      reservedOutputTokens: 128,
    },
    modelSelection: { mode: "exact", modelId: "gpt-test" },
    permissionProfile: permissionProfile(),
    provider: "codex",
    reasoningEffort: "low",
    role,
    serviceTier: null,
  };
}

function permissionProfile(): PermissionProfile {
  return {
    approvalPolicy: "never",
    approvals: false,
    providerPermissionProfile: "read-only",
    toolAccess: { allowedTools: [], mode: "none" },
    workspaceMutation: false,
  };
}
