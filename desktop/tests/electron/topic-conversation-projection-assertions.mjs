import { conversationSurfaces } from "./topic-conversation-fork-workflow.mjs";

export const expectedNarratorStatusReply =
  "The topic is still working and has not been steered or interrupted.";

export function assertIndependentWorkingTopics(surfaces, alphaId, betaId) {
  const alpha = conversationSurfaces(surfaces, alphaId);
  const beta = conversationSurfaces(surfaces, betaId);
  if (
    alpha.length !== 1 ||
    beta.length !== 1 ||
    alpha.some((surface) => !surfaceIsWorkingWithoutCenterProgress(surface)) ||
    beta.some((surface) => !surfaceIsWorkingWithoutCenterProgress(surface))
  ) {
    throw new Error(`concurrent topic surfaces drifted: ${JSON.stringify({ alpha, beta })}`);
  }
}

function surfaceIsWorkingWithoutCenterProgress(surface) {
  return (
    surface.state === "working" &&
    surface.agentText === "" &&
    surface.agentTextPresent === false &&
    surface.helperText === "" &&
    surface.helperPresent === false
  );
}

export function assertRunningTurn(snapshot, label) {
  const running = snapshot.turns.turns.find((turn) => turn.status === "running");
  if (!running?.providerTurnId) {
    throw new Error(`${label} lost its running turn: ${JSON.stringify(snapshot.turns)}`);
  }
}

export function assertNarratorStatusIsolation(before, after, question) {
  const beforeRunning = before.turns.turns.find((turn) => turn.status === "running");
  const afterRunning = after.turns.turns.find((turn) => turn.status === "running");
  const reply = after.narration.events.findLast((event) => event.kind === "status_reply");

  assertStatusPrimaryTurn(before, after, beforeRunning, afterRunning);
  assertStatusProjectionCursors(before, after);
  assertStatusReply(reply, question, { after, before });
}

function assertStatusPrimaryTurn(before, after, beforeRunning, afterRunning) {
  if (
    !beforeRunning ||
    !afterRunning ||
    beforeRunning.id !== afterRunning.id ||
    beforeRunning.providerTurnId !== afterRunning.providerTurnId ||
    after.conversation.status !== "working"
  ) {
    throw new Error(`narrator status changed primary turn: ${JSON.stringify({ after, before })}`);
  }
  if (
    after.conversation.lastTrajectorySequence !== before.conversation.lastTrajectorySequence ||
    after.trajectory.events.length !== before.trajectory.events.length
  ) {
    throw new Error(
      `narrator status changed primary trajectory: ${JSON.stringify({ after, before })}`,
    );
  }
}

function assertStatusProjectionCursors(before, after) {
  if (
    after.narratorState.observedThroughSequence !== before.narratorState.observedThroughSequence ||
    after.narratorState.checkpointThroughSequence !== before.narratorState.checkpointThroughSequence
  ) {
    throw new Error(
      `narrator status changed projection cursors: ${JSON.stringify({ after, before })}`,
    );
  }
}

function assertStatusReply(reply, question, snapshots) {
  if (
    reply?.statusReply?.question !== question ||
    reply.statusReply.text !== expectedNarratorStatusReply
  ) {
    throw new Error(`narrator status reply mismatch: ${JSON.stringify({ reply, ...snapshots })}`);
  }
}

export function assertAlphaLifecycle(snapshot, approvalId) {
  const kinds = snapshot.trajectory.events.map((event) => event.kind);
  assertAlphaQueueAndArtifact(snapshot);
  assertAlphaTrajectoryKinds(kinds, snapshot);
  assertAlphaApproval(snapshot, approvalId);
  assertAutomaticNarration(snapshot, "Alpha");
}

function assertAlphaQueueAndArtifact(snapshot) {
  if (snapshot.queue.length !== 0 || snapshot.artifacts.artifacts.length !== 1) {
    throw new Error(
      `Alpha queue or artifact projection is incomplete: ${JSON.stringify(snapshot)}`,
    );
  }
}

function assertAlphaTrajectoryKinds(kinds, snapshot) {
  const required = ["turn_queued", "turn_promoted", "turn_steered", "artifact_emitted"];
  const missing = required.filter((kind) => !kinds.includes(kind));
  if (missing.length > 0) {
    throw new Error(
      `Alpha trajectory is missing ${missing.join(", ")}: ${JSON.stringify(snapshot)}`,
    );
  }
}

function assertAlphaApproval(snapshot, approvalId) {
  const request = snapshot.trajectory.events.find(
    (event) => event.approvalRequested && event.approvalRequested.approval.id === approvalId,
  );
  const resolutionEvent = snapshot.trajectory.events.find(
    (event) =>
      event.approvalResolved && event.approvalResolved.resolution.approvalId === approvalId,
  );
  if (!request || !resolutionEvent) {
    throw new Error(`Alpha approval lifecycle is incomplete: ${JSON.stringify(snapshot)}`);
  }
  const resolution = resolutionEvent.approvalResolved.resolution;
  if (resolution.answers.length !== 0 || !resolution.secretsRedacted) {
    throw new Error(`Alpha approval secret was retained: ${JSON.stringify(snapshot)}`);
  }
}

export function assertDeniedApproval(snapshot, approvalId) {
  const resolution = snapshot.trajectory.events.find(
    (event) =>
      event.approvalResolved && event.approvalResolved.resolution.approvalId === approvalId,
  )?.approvalResolved?.resolution;
  if (
    !resolution ||
    resolution.decision !== "denied" ||
    resolution.response !== "" ||
    resolution.answers.length !== 0
  ) {
    throw new Error(`Alpha denied approval lifecycle is incomplete: ${JSON.stringify(snapshot)}`);
  }
}

export function assertBetaLifecycle(snapshot) {
  const kinds = snapshot.trajectory.events.map((event) => event.kind);
  if (!kinds.includes("turn_interrupted") || !kinds.includes("turn_failed")) {
    throw new Error(`Beta terminal lifecycle is incomplete: ${JSON.stringify(snapshot)}`);
  }
  if (
    snapshot.narratorState.checkpointThroughSequence < 0 ||
    snapshot.narratorState.checkpointThroughSequence >
      snapshot.narratorState.observedThroughSequence
  ) {
    throw new Error(`Beta narrator checkpoint is incomplete: ${JSON.stringify(snapshot)}`);
  }
  assertAutomaticNarration(snapshot, "Beta", { requireMilestone: false });
}

export function hasFinalNarrationForEveryTurn(snapshot) {
  const summarizedTurnIds = new Set(
    snapshot.narration.events
      .filter((event) => event.kind === "final_summary" && event.turnId)
      .map((event) => event.turnId),
  );
  return snapshot.turns.turns.every((turn) => summarizedTurnIds.has(turn.id));
}

export function narratorCaughtUp(snapshot) {
  return (
    snapshot.narratorState.observedThroughSequence === snapshot.conversation.lastTrajectorySequence
  );
}

function assertAutomaticNarration(snapshot, label, { requireMilestone = true } = {}) {
  const milestones = snapshot.narration.events.filter((event) => event.kind === "milestone");
  const finals = snapshot.narration.events.filter((event) => event.kind === "final_summary");
  if (
    (requireMilestone && milestones.length === 0) ||
    finals.length !== snapshot.turns.turns.length ||
    finals.some(
      (event) =>
        event.trigger !== "turn_terminal" ||
        typeof event.finalSummary?.text !== "string" ||
        event.finalSummary.text === "" ||
        event.finalSummary.text.startsWith("Narrator ") ||
        event.resolvedInvocation?.resolved?.modelId !== "gpt-5.4-mini",
    )
  ) {
    throw new Error(`${label} automatic narration is incomplete: ${JSON.stringify(snapshot)}`);
  }
}

export function requiredConversationSurface(surfaces, conversationId) {
  const surface = conversationSurfaces(surfaces, conversationId)[0];
  if (!surface) {
    throw new Error(
      `conversation surface ${conversationId} is missing: ${JSON.stringify(surfaces)}`,
    );
  }
  return surface;
}
