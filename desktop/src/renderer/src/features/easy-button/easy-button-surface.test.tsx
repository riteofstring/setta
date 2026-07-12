import type {
  Artifact,
  ConversationPresentationProfile,
  ConversationSnapshot,
  ConversationTurn,
  NarrationEvent,
  NarratorState,
  PermissionProfile,
  ResolvedInvocation,
  Role,
  RoleProfile,
  TopicConversation,
  TrajectoryApprovalRequest,
  TrajectoryEvent,
} from "@generated/backend";
import { conversationInputModeValues } from "@generated/backend";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ConversationProjection } from "../../stores/conversation-projection";
import { useConversationStore } from "../../stores/conversation-store";
import {
  EasyButtonProjectionSurface,
  EasyButtonSurface,
  easyButtonConversationProjection,
  easyButtonProjectionView,
} from "./easy-button-surface";
import { ConversationApprovalPanel } from "./easy-button-approval-panel";
import { requestEasyButtonSpeechCapture } from "./easy-button-conversation-commands";

const workspaceId = "workspace_topic";
const timestamp = "2026-07-11T20:00:00Z";

describe("Easy Button topic conversation projection", () => {
  beforeEach(() => {
    useConversationStore.getState().reset();
  });

  test("selects only the conversation bound to the pane", () => {
    const working = workingSnapshot("conversation_alpha", "Alpha topic", "violet");
    const completed = completedSnapshot("conversation_beta", "Beta topic", "amber");
    useConversationStore.getState().hydrateSnapshot(workspaceId, working.conversation.id, working);
    useConversationStore
      .getState()
      .hydrateSnapshot(workspaceId, completed.conversation.id, completed);

    const projections = useConversationStore.getState().conversations;
    const alpha = renderToString(
      <EasyButtonProjectionSurface
        view={easyButtonProjectionView(
          working.conversation.id,
          easyButtonConversationProjection(projections, working.conversation.id),
        )}
      />,
    );
    const beta = renderToString(
      <EasyButtonProjectionSurface
        view={easyButtonProjectionView(
          completed.conversation.id,
          easyButtonConversationProjection(projections, completed.conversation.id),
        )}
      />,
    );

    expect(alpha).toContain('data-conversation-id="conversation_alpha"');
    expect(alpha).toContain('data-conversation-palette="violet"');
    expect(alpha).toContain("--conversation-accent-dark:oklch(0.76 0.125 290)");
    expect(alpha).toContain("--conversation-accent-light:oklch(0.48 0.14 290)");
    expect(alpha).toContain('data-easy-button-state="working"');
    expect(alpha).toContain("Implement Alpha topic");
    expect(alpha).toContain("Alpha topic milestone");
    expect(alpha).toContain("Alpha topic artifact");
    expect(alpha).not.toContain("Beta topic is complete");

    expect(beta).toContain('data-conversation-id="conversation_beta"');
    expect(beta).toContain('data-conversation-palette="amber"');
    expect(beta).toContain("--conversation-accent-dark:oklch(0.82 0.135 78)");
    expect(beta).toContain('data-easy-button-state="complete"');
    expect(beta).toContain("Beta topic is complete");
    expect(beta).not.toContain("Alpha topic milestone");
  });

  test("reports an unbound or unloaded pane without reading selected-workspace state", () => {
    const unbound = renderToString(<EasyButtonSurface conversationId={null} />);
    const unloaded = renderToString(<EasyButtonSurface conversationId="conversation_unloaded" />);

    expect(unbound).toContain('data-easy-button-projection="binding_required"');
    expect(unbound).toContain("This Easy Button pane is not bound to a topic conversation.");
    expect(unloaded).toContain('data-conversation-id="conversation_unloaded"');
    expect(unloaded).toContain('data-easy-button-projection="unloaded"');
    expect(unloaded).toContain("Conversation projection is not loaded");
  });

  test.each(conversationInputModeValues)(
    "requests %s voice capture for the bound conversation and source pane",
    async (inputMode) => {
      const start = vi.fn(async () => {});

      await requestEasyButtonSpeechCapture(
        { start },
        "conversation_voice",
        "pane_voice",
        inputMode,
      );

      expect(start).toHaveBeenCalledWith({
        destination: {
          conversationId: "conversation_voice",
          inputMode,
          type: "conversation",
        },
        sourcePaneId: "pane_voice",
      });
    },
  );

  test("defaults an ordinary pane voice request to AI routing", async () => {
    const start = vi.fn(async () => {});

    await requestEasyButtonSpeechCapture({ start }, "conversation_voice", "pane_voice");

    expect(start).toHaveBeenCalledWith({
      destination: {
        conversationId: "conversation_voice",
        inputMode: "route",
        type: "conversation",
      },
      sourcePaneId: "pane_voice",
    });
  });

  test("keeps a working turn out of the terminal narration channel", () => {
    const snapshot = workingSnapshot("conversation_working", "Working topic", "sky");
    snapshot.narration.events.unshift(
      finalSummaryEvent("conversation_working", "turn_previous", "Stale prior summary", 1),
    );
    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));

    expect(view.viewState).toBe("working");
    expect(view.statusTone).toBe("none");
    expect(view.terminalSummary).toBeNull();
    expect(view.currentFocus).toBe("Implement Working topic");
  });

  test("renders the latest explicit narrator status reply without changing working state", () => {
    const snapshot = workingSnapshot("conversation_status", "Status topic", "sky");
    snapshot.narration.events.push(
      statusReplyEvent(
        snapshot.conversation.id,
        snapshot.turns.turns[0]!.id,
        "What is happening?",
        "The topic agent is still implementing the requested change.",
        2,
      ),
    );

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));
    const html = renderToString(<EasyButtonProjectionSurface view={view} />);

    expect(view.viewState).toBe("working");
    expect(view.statusReply).toEqual({
      id: "status_conversation_status_2",
      question: "What is happening?",
      text: "The topic agent is still implementing the requested change.",
    });
    expect(html).toContain('data-testid="easy-button-status-reply"');
    expect(html).toContain("What is happening?");
    expect(html).toContain("The topic agent is still implementing the requested change.");
  });

  test("projects approval, degradation, and resynchronization explicitly", () => {
    const snapshot = workingSnapshot("conversation_approval", "Approval topic", "teal");
    snapshot.conversation.status = "waiting_for_approval";
    snapshot.narratorState = {
      ...snapshot.narratorState,
      degradation: {
        code: "narrator_unavailable",
        degradedAt: timestamp,
        diagnosticReference: "diagnostic:narrator",
        message: "Narrator model is unavailable.",
        retryable: true,
      },
      status: "degraded",
    };
    const projection: ConversationProjection = {
      ...readyProjection(snapshot),
      resync: {
        detail: "event sequence gap",
        minimumCursor: { sequence: 2, streamId: conversationStreamId(snapshot.conversation.id) },
        reason: "event_sequence_gap",
      },
    };
    const view = easyButtonProjectionView(snapshot.conversation.id, projection);

    expect(view.projectionStatus).toBe("resyncing");
    expect(view.helperCopy).toBe("Refreshing conversation…");
    expect(view.focusStatus).toBe("stale");
    expect(view.narratorDegradation).toBe("Narrator model is unavailable.");
    expect(view.activeAgentCount).toBe(1);

    const html = renderToString(<EasyButtonProjectionSurface view={view} />);
    expect(html).toContain('data-testid="easy-button-narrator-status"');
    expect(html).toContain("Narrator model is unavailable.");
    expect(html).toContain("Implement Approval topic");
    expect(html).not.toContain("Narration degraded");
  });

  test("keeps loading and failed refresh state explicit while retaining a snapshot", () => {
    const snapshot = workingSnapshot("conversation_refresh", "Refresh topic", "green");
    const loading = easyButtonProjectionView(snapshot.conversation.id, {
      ...readyProjection(snapshot),
      status: "loading",
    });
    const failed = easyButtonProjectionView(snapshot.conversation.id, {
      ...readyProjection(snapshot),
      error: "Snapshot refresh failed.",
      status: "error",
    });

    expect(loading.projectionStatus).toBe("loading");
    expect(loading.helperCopy).toBe("Loading conversation…");
    expect(failed.projectionStatus).toBe("error");
    expect(failed.helperCopy).toBe("Conversation could not be loaded");
    expect(failed.error).toBe("Snapshot refresh failed.");
  });

  test("presents cancellation without success affordances", () => {
    const snapshot = completedSnapshot("conversation_cancelled", "Cancelled topic", "blue");
    snapshot.turns.turns[0] = {
      ...snapshot.turns.turns[0]!,
      resolvedInvocation: resolvedInvocation("agent", "cancelled"),
      status: "cancelled",
    };

    const html = renderToString(
      <EasyButtonProjectionSurface
        view={easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot))}
      />,
    );

    expect(html).toContain('data-easy-button-status="stopped"');
    expect(html).toContain('data-easy-button-glyph="cancelled"');
    expect(html).toContain('aria-label="Conversation work cancelled"');
    expect(html).toContain("Work cancelled");
    expect(html).not.toContain('data-easy-button-glyph="completed"');
  });

  test("does not present an unresolved approval from a terminal prior turn", () => {
    const snapshot = completedSnapshot("conversation_stale_approval", "Stale approval", "teal");
    const request = approvalRequest("approval_stale", true);
    snapshot.trajectory.events.push(
      approvalRequestedTrajectory(snapshot.conversation.id, snapshot.turns.turns[0]!.id, request),
    );
    snapshot.conversation.lastTrajectorySequence = 2;

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));

    expect(view.pendingApproval).toBeNull();
  });

  test("renders secret structured input with a password control", () => {
    const approval = approvalRequest("approval_secret", true);
    approval.questions[0] = {
      ...approval.questions[0]!,
      allowsOther: false,
      options: ["fixed-secret"],
    };
    const html = renderToString(
      <ConversationApprovalPanel approval={approval} pending={false} submit={() => {}} />,
    );

    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="off"');
    expect(html).not.toContain("<select");
  });

  test("counts subagents only for the currently running turn", () => {
    const snapshot = workingSnapshot("conversation_subagent_scope", "Subagent scope", "teal");
    const running = snapshot.turns.turns[0]!;
    const prior = {
      ...running,
      endedAt: timestamp,
      id: "turn_prior",
      providerTurnId: "provider_turn_prior",
      resolvedInvocation: resolvedInvocation("agent", "succeeded"),
      status: "completed" as const,
    };
    snapshot.turns.turns = [prior, running];
    snapshot.trajectory.events.push(
      subagentStartedTrajectory(snapshot.conversation.id, prior.id, "subagent_prior", 2),
    );
    snapshot.conversation.lastTrajectorySequence = 2;

    const view = easyButtonProjectionView(snapshot.conversation.id, readyProjection(snapshot));

    expect(view.activeAgentCount).toBe(1);
  });
});

function workingSnapshot(
  conversationId: string,
  title: string,
  palette: ConversationPresentationProfile["resolvedPaletteId"],
): ConversationSnapshot {
  const turn = conversationTurn(conversationId, "running");
  return conversationSnapshot(conversationId, title, palette, {
    artifacts: [artifact(conversationId, turn.id, title)],
    conversationStatus: "working",
    focus: `Implement ${title}`,
    narration: [milestoneEvent(conversationId, turn.id, `${title} milestone`, 1)],
    narratorStatus: "running",
    turn,
  });
}

function completedSnapshot(
  conversationId: string,
  title: string,
  palette: ConversationPresentationProfile["resolvedPaletteId"],
): ConversationSnapshot {
  const turn = conversationTurn(conversationId, "completed");
  return conversationSnapshot(conversationId, title, palette, {
    artifacts: [],
    conversationStatus: "idle",
    focus: `Completed ${title}`,
    narration: [finalSummaryEvent(conversationId, turn.id, `${title} is complete`, 1)],
    narratorStatus: "ready",
    turn,
  });
}

function conversationSnapshot(
  conversationId: string,
  title: string,
  palette: ConversationPresentationProfile["resolvedPaletteId"],
  options: {
    artifacts: Artifact[];
    conversationStatus: TopicConversation["status"];
    focus: string;
    narration: NarrationEvent[];
    narratorStatus: NarratorState["status"];
    turn: ConversationTurn;
  },
): ConversationSnapshot {
  return {
    artifacts: { artifacts: options.artifacts, hasEarlier: false },
    branch: null,
    conversation: {
      archivedAt: null,
      createdAt: timestamp,
      id: conversationId,
      lastTrajectorySequence: 1,
      status: options.conversationStatus,
      title,
      topicDescriptor: `${title} descriptor`,
      updatedAt: timestamp,
      workspaceId,
    },
    eventCursor: { sequence: 0, streamId: conversationStreamId(conversationId) },
    narration: { events: options.narration, hasEarlier: false },
    narratorState: narratorState(conversationId, options.focus, options.narratorStatus),
    presentationProfile: presentationProfile(conversationId, palette),
    queue: [],
    roleProfileOverrides: [],
    schemaVersion: 1,
    sideConversations: [],
    threadBinding: null,
    trajectory: {
      events: [userInputTrajectory(conversationId, options.turn.id, title)],
      hasEarlier: false,
    },
    turns: { hasEarlier: false, turns: [options.turn] },
  };
}

function conversationTurn(
  conversationId: string,
  status: Extract<ConversationTurn["status"], "running" | "completed">,
): ConversationTurn {
  const turnId = `turn_${conversationId}`;
  const invocation = resolvedInvocation("agent", status === "running" ? "running" : "succeeded");
  invocation.providerReferences.turnId = `provider_${turnId}`;
  return {
    acceptedAt: timestamp,
    authoredInput: { text: `Work on ${conversationId}` },
    conversationId,
    delivery: "normal",
    endedAt: status === "completed" ? timestamp : null,
    error: null,
    id: turnId,
    providerTurnId: invocation.providerReferences.turnId,
    requestedRoleProfile: invocation.requested,
    resolvedInvocation: invocation,
    startedAt: timestamp,
    status,
  };
}

function artifact(conversationId: string, turnId: string, title: string): Artifact {
  return {
    conversationId,
    createdAt: timestamp,
    id: `artifact_${conversationId}`,
    kind: "file",
    mediaType: "text/plain",
    metadata: {},
    title: `${title} artifact`,
    trajectorySequence: 1,
    turnId,
    uri: `setta://artifacts/${conversationId}`,
  };
}

function narratorState(
  conversationId: string,
  currentFocus: string,
  status: NarratorState["status"],
): NarratorState {
  return {
    checkpointText: "",
    checkpointThroughSequence: 0,
    conversationId,
    currentFocus,
    currentFocusRevision: 1,
    degradation: null,
    lastInvocationAt: timestamp,
    observedThroughSequence: 1,
    status,
    topicDescriptor: `${conversationId} descriptor`,
    updatedAt: timestamp,
  };
}

function milestoneEvent(
  conversationId: string,
  turnId: string,
  text: string,
  streamSequence: number,
): NarrationEvent {
  return {
    conversationId,
    createdAt: "2026-07-11T20:00:05Z",
    finalSummary: null,
    id: `milestone_${conversationId}`,
    kind: "milestone",
    milestone: { text },
    resolvedInvocation: resolvedInvocation("narrator", "succeeded"),
    sourceSequenceEnd: 1,
    sourceSequenceStart: 1,
    statusReply: null,
    streamSequence,
    topicDescriptor: null,
    trigger: "plan_changed",
    turnId,
  };
}

function finalSummaryEvent(
  conversationId: string,
  turnId: string,
  text: string,
  streamSequence: number,
): NarrationEvent {
  return {
    conversationId,
    createdAt: "2026-07-11T20:00:10Z",
    finalSummary: { text },
    id: `summary_${conversationId}_${turnId}`,
    kind: "final_summary",
    milestone: null,
    resolvedInvocation: resolvedInvocation("narrator", "succeeded"),
    sourceSequenceEnd: 1,
    sourceSequenceStart: 1,
    statusReply: null,
    streamSequence,
    topicDescriptor: null,
    trigger: "turn_terminal",
    turnId,
  };
}

function statusReplyEvent(
  conversationId: string,
  turnId: string,
  question: string,
  text: string,
  streamSequence: number,
): NarrationEvent {
  return {
    conversationId,
    createdAt: "2026-07-11T20:00:08Z",
    finalSummary: null,
    id: `status_${conversationId}_${streamSequence}`,
    kind: "status_reply",
    milestone: null,
    resolvedInvocation: resolvedInvocation("narrator", "succeeded"),
    sourceSequenceEnd: 1,
    sourceSequenceStart: 1,
    statusReply: { question, text },
    streamSequence,
    topicDescriptor: null,
    trigger: "explicit_status_requested",
    turnId,
  };
}

function presentationProfile(
  conversationId: string,
  resolvedPaletteId: ConversationPresentationProfile["resolvedPaletteId"],
): ConversationPresentationProfile {
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
    resolvedPaletteId,
    updatedAt: timestamp,
  };
}

function userInputTrajectory(
  conversationId: string,
  turnId: string,
  title: string,
): TrajectoryEvent {
  return {
    actor: "user",
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
    id: `trajectory_${conversationId}`,
    kind: "user_input_accepted",
    modelRerouted: null,
    planChanged: null,
    providerEventId: null,
    providerLifecycleChanged: null,
    providerThreadId: null,
    providerTurnId: null,
    publicReasoningSummaryUpdated: null,
    sequence: 1,
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
    userInputAccepted: { delivery: "normal", input: { text: `Work on ${title}` } },
  };
}

function approvalRequestedTrajectory(
  conversationId: string,
  turnId: string,
  approval: TrajectoryApprovalRequest,
): TrajectoryEvent {
  return {
    ...userInputTrajectory(conversationId, turnId, "approval"),
    actor: "provider",
    approvalRequested: { approval },
    id: `trajectory_${approval.id}`,
    kind: "approval_requested",
    sequence: 2,
    userInputAccepted: null,
  };
}

function subagentStartedTrajectory(
  conversationId: string,
  turnId: string,
  subagentId: string,
  sequence: number,
): TrajectoryEvent {
  return {
    ...userInputTrajectory(conversationId, turnId, "subagent"),
    actor: "agent",
    id: `trajectory_${subagentId}`,
    kind: "subagent_started",
    sequence,
    subagentStarted: {
      subagent: {
        id: subagentId,
        message: "review",
        modelId: null,
        providerThreadId: subagentId,
        reasoningEffort: null,
        status: "running",
      },
    },
    userInputAccepted: null,
  };
}

function approvalRequest(id: string, secret: boolean): TrajectoryApprovalRequest {
  return {
    body: "Provide the requested scope.",
    command: null,
    cwd: null,
    filePaths: [],
    id,
    kind: "structured_input",
    providerItemId: `provider_${id}`,
    questions: [
      {
        allowsOther: secret,
        header: "Scope",
        id: "scope",
        options: secret ? [] : ["focused"],
        question: "Which scope?",
        secret,
      },
    ],
    requestedAt: timestamp,
    requestedPermissionProfile: null,
    title: "Scope",
  };
}

function resolvedInvocation(
  role: Role,
  outcome: ResolvedInvocation["outcome"],
): ResolvedInvocation {
  const requested = roleProfile(role);
  return {
    contextUsage: {
      estimatedInputTokens: 10,
      estimatedOutputTokens: 5,
      inputBytes: 40,
      outputBytes: 20,
    },
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

function readyProjection(snapshot: ConversationSnapshot): ConversationProjection {
  return {
    conversationId: snapshot.conversation.id,
    error: null,
    resync: null,
    snapshot,
    status: "ready",
    workspaceId,
  };
}

function conversationStreamId(conversationId: string): string {
  return `conversation:${conversationId}`;
}
