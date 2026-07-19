import type {
  ArtifactMetadata,
  ConversationSnapshot,
  ConversationTurn,
  TrajectoryEvent,
  TrajectoryEventKind,
} from "@generated/backend";

import type { PendingConversationApproval } from "./easy-button-approval-projection";
import type { EasyButtonProgressHighlight } from "./easy-button-rails";

type TerminalTurn = ConversationTurn & {
  status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
};

interface ProgressHighlightProjectionContext {
  artifactById: ReadonlyMap<string, ArtifactMetadata>;
  blockedTurnIds: Set<string>;
  highlightSequenceById: Map<string, number>;
  highlights: EasyButtonProgressHighlight[];
  projectedArtifactIds: Set<string>;
  snapshot: ConversationSnapshot;
  stateHighlightIdByTurn: Map<string, string>;
  terminalTurnIds: Set<string>;
  turnById: ReadonlyMap<string, ConversationTurn>;
}

type ProgressEventHandler = (
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
) => void;

const ignoredProgressEvent: ProgressEventHandler = () => {};

const progressEventHandlers = {
  activity_completed: ignoredProgressEvent,
  activity_failed: ignoredProgressEvent,
  activity_progressed: ignoredProgressEvent,
  activity_started: ignoredProgressEvent,
  agent_liveness_changed: ignoredProgressEvent,
  agent_message_completed: ignoredProgressEvent,
  agent_public_text_delta: ignoredProgressEvent,
  approval_requested: projectApprovalRequested,
  approval_resolved: projectApprovalResolved,
  artifact_emitted: projectArtifactEmitted,
  file_change_completed: ignoredProgressEvent,
  file_change_proposed: ignoredProgressEvent,
  model_rerouted: ignoredProgressEvent,
  plan_changed: ignoredProgressEvent,
  provider_lifecycle_changed: ignoredProgressEvent,
  public_reasoning_summary_updated: ignoredProgressEvent,
  subagent_completed: ignoredProgressEvent,
  subagent_started: ignoredProgressEvent,
  subagent_updated: ignoredProgressEvent,
  turn_completed: projectTurnCompleted,
  turn_failed: projectTurnFailed,
  turn_interrupted: projectTurnInterrupted,
  turn_promoted: ignoredProgressEvent,
  turn_queued: ignoredProgressEvent,
  turn_started: projectTurnStarted,
  turn_steered: ignoredProgressEvent,
  user_input_accepted: ignoredProgressEvent,
} satisfies Record<TrajectoryEventKind, ProgressEventHandler>;

export function progressHighlightViews(
  snapshot: ConversationSnapshot,
  latestTurn: ConversationTurn | null,
  pendingApproval: PendingConversationApproval | null,
): EasyButtonProgressHighlight[] {
  const context = progressHighlightProjectionContext(snapshot);
  projectActiveTurnState(context, latestTurn);
  for (const event of snapshot.trajectory.events) {
    progressEventHandlers[event.kind](context, event);
  }
  projectPendingApproval(context, pendingApproval);
  projectArtifactMetadata(context);
  projectTerminalState(context, latestTurn);
  return sortedProgressHighlights(context);
}

function progressHighlightProjectionContext(
  snapshot: ConversationSnapshot,
): ProgressHighlightProjectionContext {
  return {
    artifactById: new Map(snapshot.artifacts.artifacts.map((artifact) => [artifact.id, artifact])),
    blockedTurnIds: new Set<string>(),
    highlightSequenceById: new Map<string, number>(),
    highlights: [],
    projectedArtifactIds: new Set<string>(),
    snapshot,
    stateHighlightIdByTurn: new Map<string, string>(),
    terminalTurnIds: new Set<string>(),
    turnById: new Map(snapshot.turns.turns.map((turn) => [turn.id, turn])),
  };
}

function projectTurnStarted(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
): void {
  const turnId = event.turnId;
  if (!turnId) {
    return;
  }
  replaceTurnStateHighlight(context, turnId, workStartedHighlight(context, event), event.sequence);
}

function projectApprovalRequested(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
): void {
  const turnId = event.turnId;
  const payload = event.approvalRequested;
  if (!turnId || !payload || context.terminalTurnIds.has(turnId)) {
    return;
  }
  context.blockedTurnIds.add(turnId);
  replaceTurnStateHighlight(
    context,
    turnId,
    approvalRequestedHighlight(context, event, payload),
    event.sequence,
  );
}

function projectApprovalResolved(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
): void {
  const turnId = event.turnId;
  const payload = event.approvalResolved;
  if (!turnId || !payload || context.terminalTurnIds.has(turnId)) {
    return;
  }
  context.blockedTurnIds.delete(turnId);
  replaceTurnStateHighlight(
    context,
    turnId,
    approvalResolvedHighlight(context, event, payload),
    event.sequence,
  );
}

function projectArtifactEmitted(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
): void {
  const payload = event.artifactEmitted;
  if (!payload) {
    return;
  }
  context.projectedArtifactIds.add(payload.artifactId);
  appendProgressHighlight(
    context,
    artifactReadyHighlight(context, event, context.artifactById.get(payload.artifactId) ?? null),
    event.sequence,
  );
}

function projectTurnCompleted(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
): void {
  if (!event.turnId) {
    return;
  }
  context.terminalTurnIds.add(event.turnId);
  appendProgressHighlight(context, completedHighlight(context, event), event.sequence);
}

function projectTurnFailed(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
): void {
  if (!event.turnId || !event.turnFailed) {
    return;
  }
  context.terminalTurnIds.add(event.turnId);
  appendProgressHighlight(
    context,
    failedHighlight(context, event, event.turnFailed),
    event.sequence,
  );
}

function projectTurnInterrupted(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
): void {
  if (!event.turnId || !event.turnInterrupted) {
    return;
  }
  context.terminalTurnIds.add(event.turnId);
  appendProgressHighlight(
    context,
    interruptedHighlight(context, event, event.turnInterrupted),
    event.sequence,
  );
}

function projectActiveTurnState(
  context: ProgressHighlightProjectionContext,
  latestTurn: ConversationTurn | null,
): void {
  if (
    !latestTurn ||
    latestTurn.status !== "running" ||
    context.stateHighlightIdByTurn.has(latestTurn.id)
  ) {
    return;
  }
  replaceTurnStateHighlight(context, latestTurn.id, activeTurnHighlight(context, latestTurn), null);
}

function projectPendingApproval(
  context: ProgressHighlightProjectionContext,
  pendingApproval: PendingConversationApproval | null,
): void {
  if (!pendingApproval || context.blockedTurnIds.has(pendingApproval.turnId)) {
    return;
  }
  replaceTurnStateHighlight(
    context,
    pendingApproval.turnId,
    pendingApprovalHighlight(context, pendingApproval),
    null,
  );
}

function projectArtifactMetadata(context: ProgressHighlightProjectionContext): void {
  for (const artifact of context.snapshot.artifacts.artifacts) {
    if (
      context.projectedArtifactIds.has(artifact.id) ||
      !retainedArtifactEmissionOmitted(context, artifact)
    ) {
      continue;
    }
    appendProgressHighlight(
      context,
      artifactMetadataReadyHighlight(context, artifact),
      artifact.trajectorySequence,
    );
  }
}

function retainedArtifactEmissionOmitted(
  context: ProgressHighlightProjectionContext,
  artifact: ArtifactMetadata,
): boolean {
  const firstVisibleSequence = context.snapshot.trajectory.events.at(0)?.sequence ?? null;
  const artifactSequence = artifact.trajectorySequence;
  return (
    artifactSequence !== null &&
    context.snapshot.trajectory.hasEarlier &&
    firstVisibleSequence !== null &&
    artifactSequence < firstVisibleSequence
  );
}

function projectTerminalState(
  context: ProgressHighlightProjectionContext,
  latestTurn: ConversationTurn | null,
): void {
  if (!latestTurn || !terminalTurn(latestTurn) || context.terminalTurnIds.has(latestTurn.id)) {
    return;
  }
  appendProgressHighlight(
    context,
    terminalStateHighlight(latestTurn),
    context.snapshot.conversation.lastTrajectorySequence,
  );
}

function replaceTurnStateHighlight(
  context: ProgressHighlightProjectionContext,
  turnId: string,
  highlight: EasyButtonProgressHighlight,
  sequence: number | null,
): void {
  const priorId = context.stateHighlightIdByTurn.get(turnId);
  if (priorId) {
    const index = context.highlights.findIndex((item) => item.id === priorId);
    if (index >= 0) {
      context.highlights.splice(index, 1);
    }
  }
  context.stateHighlightIdByTurn.set(turnId, highlight.id);
  appendProgressHighlight(context, highlight, sequence);
}

function appendProgressHighlight(
  context: ProgressHighlightProjectionContext,
  highlight: EasyButtonProgressHighlight,
  sequence: number | null,
): void {
  if (sequence !== null) {
    context.highlightSequenceById.set(highlight.id, sequence);
  }
  const index = context.highlights.findIndex((item) => item.id === highlight.id);
  if (index >= 0) {
    context.highlights[index] = highlight;
    return;
  }
  context.highlights.push(highlight);
}

function workStartedHighlight(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
): EasyButtonProgressHighlight {
  return progressHighlight(context, event, {
    body: objectiveBody(context, turnForEvent(context, event)),
    title: "Working",
  });
}

function activeTurnHighlight(
  context: ProgressHighlightProjectionContext,
  turn: ConversationTurn,
): EasyButtonProgressHighlight {
  return progressHighlightForTurn(context, turn.id, {
    at: turn.startedAt ?? turn.acceptedAt,
    body: objectiveBody(context, turn),
    id: `turn:${turn.id}:running`,
    title: "Working",
  });
}

function approvalRequestedHighlight(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
  payload: NonNullable<TrajectoryEvent["approvalRequested"]>,
): EasyButtonProgressHighlight {
  return progressHighlight(context, event, {
    body: approvalRequestBody(payload.approval),
    title: "Needs approval",
  });
}

function pendingApprovalHighlight(
  context: ProgressHighlightProjectionContext,
  pending: PendingConversationApproval,
): EasyButtonProgressHighlight {
  return progressHighlightForTurn(context, pending.turnId, {
    at: pending.approval.requestedAt,
    body: approvalRequestBody(pending.approval),
    id: `approval:${pending.approval.id}`,
    title: "Needs approval",
  });
}

function approvalResolvedHighlight(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
  payload: NonNullable<TrajectoryEvent["approvalResolved"]>,
): EasyButtonProgressHighlight {
  return progressHighlight(context, event, {
    body: approvalResolutionBody(context, event, payload.resolution.decision),
    title: approvalResolutionTitle(payload.resolution.decision),
  });
}

function artifactReadyHighlight(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
  artifact: ArtifactMetadata | null,
): EasyButtonProgressHighlight {
  return progressHighlight(context, event, {
    body: displayLine(artifact?.title ?? "", "A result artifact is ready."),
    title: artifact ? artifactReadyTitle(artifact.kind) : "Artifact ready",
  });
}

function artifactMetadataReadyHighlight(
  context: ProgressHighlightProjectionContext,
  artifact: ArtifactMetadata,
): EasyButtonProgressHighlight {
  return progressHighlightForTurn(context, artifact.turnId, {
    at: artifact.createdAt,
    body: displayLine(artifact.title, "A result artifact is ready."),
    id: `artifact:${artifact.id}`,
    title: artifactReadyTitle(artifact.kind),
  });
}

function completedHighlight(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
): EasyButtonProgressHighlight {
  return progressHighlight(context, event, {
    body: "Work completed.",
    title: "Complete",
  });
}

function failedHighlight(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
  payload: NonNullable<TrajectoryEvent["turnFailed"]>,
): EasyButtonProgressHighlight {
  return progressHighlight(context, event, {
    body: displayLine(payload.failure.message, "Work failed."),
    title: "Failed",
  });
}

function interruptedHighlight(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
  payload: NonNullable<TrajectoryEvent["turnInterrupted"]>,
): EasyButtonProgressHighlight {
  return progressHighlight(context, event, {
    body: turnInterruptedBody(payload.reason),
    title: "Stopped",
  });
}

function terminalStateHighlight(turn: TerminalTurn): EasyButtonProgressHighlight {
  return {
    at: turn.endedAt ?? turn.startedAt ?? turn.acceptedAt,
    body: terminalFallbackText(turn),
    id: `turn:${turn.id}:${turn.status}`,
    title: terminalStateTitle(turn.status),
    turnStartedAt: turn.startedAt,
  };
}

function progressHighlight(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
  text: { body: string; title: string },
): EasyButtonProgressHighlight {
  return progressHighlightForTurn(context, event.turnId, {
    at: event.emittedAt,
    body: text.body,
    id: event.id,
    title: text.title,
  });
}

function progressHighlightForTurn(
  context: ProgressHighlightProjectionContext,
  turnId: string | null,
  value: { at: string; body: string; id: string; title: string },
): EasyButtonProgressHighlight {
  return {
    at: value.at,
    body: displayLine(value.body, "Working on your request."),
    id: value.id,
    title: displayLine(value.title, "Working", 32),
    turnStartedAt: turnId ? (context.turnById.get(turnId)?.startedAt ?? null) : null,
  };
}

function turnForEvent(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
): ConversationTurn | null {
  return event.turnId ? (context.turnById.get(event.turnId) ?? null) : null;
}

function objectiveBody(
  context: ProgressHighlightProjectionContext,
  turn: ConversationTurn | null,
): string {
  return displayLine(
    context.snapshot.narratorState.currentFocus ||
      turn?.authoredInput.text ||
      context.snapshot.conversation.title,
    "Working on your request.",
  );
}

function approvalRequestBody(
  approval: NonNullable<TrajectoryEvent["approvalRequested"]>["approval"],
): string {
  return displayLine(
    approval.body || approval.command || approval.questions[0]?.question || approval.title,
    "Approval is required to continue.",
  );
}

function approvalResolutionTitle(
  decision: NonNullable<TrajectoryEvent["approvalResolved"]>["resolution"]["decision"],
): string {
  switch (decision) {
    case "approved":
    case "approved_for_session":
      return "Approval received";
    case "answered":
      return "Answer received";
    case "denied":
      return "Approval denied";
    case "cancelled":
      return "Approval cancelled";
  }
}

function approvalResolutionBody(
  context: ProgressHighlightProjectionContext,
  event: TrajectoryEvent,
  decision: NonNullable<TrajectoryEvent["approvalResolved"]>["resolution"]["decision"],
): string {
  switch (decision) {
    case "approved":
    case "approved_for_session":
    case "answered":
      return objectiveBody(context, turnForEvent(context, event));
    case "denied":
      return "Continuing without that approval.";
    case "cancelled":
      return "The approval request was cancelled.";
  }
}

function artifactReadyTitle(kind: ArtifactMetadata["kind"]): string {
  switch (kind) {
    case "markdown":
      return "Markdown ready";
    case "table":
      return "Table ready";
    case "bar_chart":
      return "Chart ready";
    case "file":
      return "File ready";
  }
}

function terminalStateTitle(status: TerminalTurn["status"]): string {
  switch (status) {
    case "completed":
      return "Complete";
    case "cancelled":
      return "Stopped";
    case "failed":
      return "Failed";
  }
}

function turnInterruptedBody(
  reason: NonNullable<TrajectoryEvent["turnInterrupted"]>["reason"],
): string {
  switch (reason) {
    case "user_requested":
      return "Work stopped at your request.";
    case "provider_interrupted":
      return "The turn was interrupted.";
    case "runtime_shutdown":
      return "The turn stopped during shutdown.";
    case "reconciliation":
      return "The turn stopped during recovery.";
  }
}

function terminalFallbackText(turn: TerminalTurn): string {
  switch (turn.status) {
    case "completed":
      return "Work completed.";
    case "cancelled":
      return "Work cancelled.";
    case "failed":
      return turn.error?.message ?? "Work failed.";
  }
}

function terminalTurn(turn: ConversationTurn): turn is TerminalTurn {
  switch (turn.status) {
    case "completed":
    case "cancelled":
    case "failed":
      return true;
    case "queued":
    case "running":
      return false;
  }
}

function displayLine(text: string, fallback: string, maxLength = 120): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const value = normalized || fallback;
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function sortedProgressHighlights(
  context: ProgressHighlightProjectionContext,
): EasyButtonProgressHighlight[] {
  return [...context.highlights].sort((left, right) => {
    const sequenceComparison = compareKnownSequence(
      context.highlightSequenceById.get(left.id) ?? null,
      context.highlightSequenceById.get(right.id) ?? null,
    );
    if (sequenceComparison !== 0) {
      return sequenceComparison;
    }
    return left.at.localeCompare(right.at);
  });
}

function compareKnownSequence(left: number | null, right: number | null): number {
  if (left === null || right === null) {
    return 0;
  }
  return left - right;
}
