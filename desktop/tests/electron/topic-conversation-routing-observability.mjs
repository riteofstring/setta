import { Buffer } from "node:buffer";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { readJsonLinesWhileAppending } from "./topic-conversation-master-overlay-assertions.mjs";

export async function assertRecordedConversationRouteObservability({
  artifactDirectory,
  inputText,
  routeState,
  timeoutMs,
}) {
  const record = routeState.decisions.at(-1);
  if (!record) {
    throw new Error(
      `conversation route state has no decision audit: ${JSON.stringify(routeState)}`,
    );
  }
  const event = await waitForSemanticEvent(
    artifactDirectory,
    "conversation_route_observed",
    (candidate) => candidate.payload.decisionId === record.id,
    timeoutMs,
  );
  const payload = event.payload;
  assertEqualJSON(
    {
      callKind: payload.callKind,
      clarification: payload.clarification,
      context: {
        allowedDecisionKinds: payload.context.allowedDecisionKinds,
        inputSequence: payload.context.inputSequence,
        latestTrajectorySequence: payload.context.latestTrajectorySequence,
      },
      conversationId: payload.conversationId,
      decisionKind: payload.decision.kind,
      executionStatus: payload.executionStatus,
      inputId: payload.inputId,
      inputModality: payload.inputModality,
      inputTextBytes: payload.inputTextBytes,
      invocation: {
        contextInputBytes: payload.invocation.contextUsage.inputBytes,
        providerRequestId: payload.invocation.providerReferences.requestId,
        requestedRole: payload.invocation.requested.role,
        resolvedModelId: payload.invocation.resolved.modelId,
        resolvedReasoningEffort: payload.invocation.resolved.reasoningEffort,
      },
      resultingEffectKind: payload.resultingEffect.kind,
      routingAttempt: payload.routingAttempt,
      schemaVersion: payload.schemaVersion,
      sourcePaneId: payload.sourcePaneId,
      validationResult: payload.validationResult,
    },
    {
      callKind: "input_route",
      clarification:
        record.clarificationInputId === null
          ? null
          : conversationClarificationSummary(routeState.clarificationReply),
      context: {
        allowedDecisionKinds: record.routerContext.allowedDecisionKinds,
        inputSequence: record.routerContext.inputSequence,
        latestTrajectorySequence: record.routerContext.latestTrajectorySequence,
      },
      conversationId: record.conversationId,
      decisionKind: record.decision.kind,
      executionStatus:
        record.resultingCommand.kind === "clarify" ? "awaiting_clarification" : "dispatched",
      inputId: record.inputId,
      inputModality: routeState.input.input.modality,
      inputTextBytes: Buffer.byteLength(inputText, "utf8"),
      invocation: {
        contextInputBytes: record.resolvedInvocation.contextUsage.inputBytes,
        providerRequestId: record.resolvedInvocation.providerReferences.requestId,
        requestedRole: "narrator",
        resolvedModelId: record.resolvedInvocation.resolved.modelId,
        resolvedReasoningEffort: record.resolvedInvocation.resolved.reasoningEffort,
      },
      resultingEffectKind: record.resultingCommand.kind,
      routingAttempt: record.routingAttempt,
      schemaVersion: 4,
      sourcePaneId: routeState.input.input.sourcePaneId,
      validationResult: "committed",
    },
    "conversation route recording observability",
  );
  const invocation = await waitForSemanticEvent(
    artifactDirectory,
    "conversation_invocation_attempted",
    (candidate) =>
      candidate.payload.conversationId === record.conversationId &&
      candidate.payload.attempt.callKind === "input_route" &&
      candidate.payload.attempt.context.inputId === record.inputId &&
      candidate.payload.attempt.context.clarificationInputId === record.clarificationInputId &&
      candidate.payload.attempt.generation === record.routingAttempt &&
      candidate.payload.attempt.output.structuredKind === record.decision.kind &&
      candidate.payload.attempt.outcome === "completed",
    timeoutMs,
  );
  assertEqualJSON(
    {
      allowedDecisionKinds: invocation.payload.attempt.context.allowedDecisionKinds,
      callKind: invocation.payload.attempt.callKind,
      commitDecision: invocation.payload.attempt.commitDecision,
      contextInputId: invocation.payload.attempt.context.inputId,
      generation: invocation.payload.attempt.generation,
      outcome: invocation.payload.attempt.outcome,
      providerRequestId: invocation.payload.attempt.providerReferences.requestId,
      requestedRole: invocation.payload.attempt.requested.role,
      resolvedModelId: invocation.payload.attempt.resolved.modelId,
      structuredKind: invocation.payload.attempt.output.structuredKind,
      validationResult: invocation.payload.attempt.validationResult,
    },
    {
      allowedDecisionKinds: record.routerContext.allowedDecisionKinds,
      callKind: "input_route",
      commitDecision: "output_committed",
      contextInputId: record.inputId,
      generation: record.routingAttempt,
      outcome: "completed",
      providerRequestId: record.resolvedInvocation.providerReferences.requestId,
      requestedRole: "narrator",
      resolvedModelId: record.resolvedInvocation.resolved.modelId,
      structuredKind: record.decision.kind,
      validationResult: "passed",
    },
    "conversation route invocation recording observability",
  );
  assertPrivateTextOmitted(event, conversationPrivateTexts(routeState, inputText));
  assertPrivateTextOmitted(invocation, conversationPrivateTexts(routeState, inputText));
  return { invocation, route: event };
}

export async function assertRecordedMasterRouteObservability({
  artifactDirectory,
  inputIdentity,
  inputText,
  presentationKind,
  routeRecord,
  timeoutMs,
}) {
  const event = await waitForSemanticEvent(
    artifactDirectory,
    "master_route_observed",
    (candidate) => candidate.payload.decisionId === routeRecord.id,
    timeoutMs,
  );
  const payload = event.payload;
  assertEqualJSON(
    {
      callKind: payload.callKind,
      context: {
        candidateQueryBytes: payload.context.candidateQueryBytes,
        includedCandidateIds: payload.context.includedCandidateIds,
        inputSequence: payload.context.inputSequence,
        retrievedCandidateIds: payload.context.retrievedCandidates.map(
          (candidate) => candidate.conversationId,
        ),
      },
      decisionKind: payload.decision.kind,
      inputId: payload.inputId,
      inputSource: payload.inputSource,
      inputTextBytes: payload.inputTextBytes,
      invocation: {
        inputBytes: payload.invocation.inputBytes,
        providerRequestId: payload.invocation.providerRequestId,
        resolvedModel: payload.invocation.configuration.resolvedModel,
        resolvedReasoningEffort: payload.invocation.configuration.resolvedReasoningEffort,
      },
      invocationAttempt: {
        commitDecision: payload.invocationAttempt.commitDecision,
        decisionKind: payload.invocationAttempt.decisionKind,
        outcome: payload.invocationAttempt.outcome,
        validationResult: payload.invocationAttempt.validationResult,
      },
      masterSessionId: payload.masterSessionId,
      origin: routeOrigin(payload),
      resultingEffectKind: payload.resultingEffect.kind,
      routingAttempt: payload.routingAttempt,
      schemaVersion: payload.schemaVersion,
      validationResult: payload.validationResult,
    },
    {
      callKind: "route",
      context: {
        candidateQueryBytes: Buffer.byteLength(routeRecord.context.candidateQuery, "utf8"),
        includedCandidateIds: routeRecord.context.includedCandidateIds,
        inputSequence: routeRecord.context.inputSequence,
        retrievedCandidateIds: routeRecord.context.retrievedCandidates.map(
          (candidate) => candidate.conversationId,
        ),
      },
      decisionKind: routeRecord.decision.kind,
      inputId: routeRecord.inputId,
      inputSource: inputIdentity.source,
      inputTextBytes: Buffer.byteLength(inputText, "utf8"),
      invocation: {
        inputBytes: routeRecord.resolvedInvocation.inputBytes,
        providerRequestId: routeRecord.resolvedInvocation.providerRequestId,
        resolvedModel: routeRecord.resolvedInvocation.configuration.resolvedModel,
        resolvedReasoningEffort:
          routeRecord.resolvedInvocation.configuration.resolvedReasoningEffort,
      },
      invocationAttempt: {
        commitDecision: routeRecord.invocationAttempt.commitDecision,
        decisionKind: routeRecord.invocationAttempt.decisionKind,
        outcome: routeRecord.invocationAttempt.outcome,
        validationResult: routeRecord.invocationAttempt.validationResult,
      },
      masterSessionId: routeRecord.masterSessionId,
      origin: routeOrigin(inputIdentity),
      resultingEffectKind: routeRecord.resultingCommand.kind,
      routingAttempt: routeRecord.routingAttempt,
      schemaVersion: 4,
      validationResult: "passed",
    },
    "master route recording observability",
  );
  const presentation = await waitForSemanticEvent(
    artifactDirectory,
    "master_presentation_observed",
    (candidate) =>
      candidate.payload.inputId === routeRecord.inputId &&
      candidate.payload.intent.kind === presentationKind,
    timeoutMs,
  );
  assertEqualJSON(
    {
      inputId: presentation.payload.inputId,
      inputSource: presentation.payload.inputSource,
      intentKind: presentation.payload.intent.kind,
      origin: routeOrigin(presentation.payload),
      schemaVersion: presentation.payload.schemaVersion,
    },
    {
      inputId: routeRecord.inputId,
      inputSource: inputIdentity.source,
      intentKind: presentationKind,
      origin: routeOrigin(inputIdentity),
      schemaVersion: 4,
    },
    "master presentation recording observability",
  );
  const privateTexts = masterPrivateTexts(routeRecord, inputText);
  assertPrivateTextOmitted(event, privateTexts);
  assertPrivateTextOmitted(presentation, privateTexts);
  return { presentation, route: event };
}

export async function assertRecordedMasterRouteCancellation({
  artifactDirectory,
  inputIdentity,
  inputText,
  state,
  timeoutMs,
}) {
  if (state.cancellation === null || state.cancellation.invocationAttempt === null) {
    throw new Error(
      `master cancellation is missing its invocation audit: ${JSON.stringify(state)}`,
    );
  }
  const event = await waitForSemanticEvent(
    artifactDirectory,
    "master_route_cancelled",
    (candidate) => candidate.payload.inputId === inputIdentity.id,
    timeoutMs,
  );
  assertEqualJSON(
    {
      cancelledAt: event.payload.cancelledAt,
      inputId: event.payload.inputId,
      inputModality: event.payload.inputModality,
      inputSource: event.payload.inputSource,
      inputTextBytes: event.payload.inputTextBytes,
      invocation: {
        commitDecision: event.payload.commitDecision,
        inputId: event.payload.invocation?.inputId ?? null,
        outcome: event.payload.outcome,
        validationResult: event.payload.validationResult,
      },
      invocationAvailable: event.payload.invocationAvailable,
      routingAttempt: event.payload.routingAttempt,
      schemaVersion: event.payload.schemaVersion,
    },
    {
      cancelledAt: state.cancellation.cancelledAt,
      inputId: inputIdentity.id,
      inputModality: inputIdentity.modality,
      inputSource: inputIdentity.source,
      inputTextBytes: Buffer.byteLength(inputText, "utf8"),
      invocation: {
        commitDecision: state.cancellation.invocationAttempt.commitDecision,
        inputId: state.cancellation.invocationAttempt.inputId,
        outcome: state.cancellation.invocationAttempt.outcome,
        validationResult: state.cancellation.invocationAttempt.validationResult,
      },
      invocationAvailable: true,
      routingAttempt: state.routingAttempt,
      schemaVersion: 4,
    },
    "master route cancellation recording observability",
  );
  assertPrivateTextOmitted(event, [inputText]);
  return event;
}

export async function assertRecordedConversationInvocationObservability({
  artifactDirectory,
  requireFailedAttempt = false,
  snapshot,
  timeoutMs,
}) {
  const targets = conversationInvocationAuditTargets(snapshot);
  const checkpoint = await waitForRecordedCheckpoint(artifactDirectory, targets, timeoutMs);
  assertRecordedCheckpoint(checkpoint, targets.checkpointThrough);
  const agent = await waitForRecordedAgent(artifactDirectory, targets, timeoutMs);
  assertRecordedAgent(agent, targets.terminalTurn);
  const trajectory = await waitForRecordedTerminalTrajectory(artifactDirectory, targets, timeoutMs);
  const thread = await waitForSemanticEvent(
    artifactDirectory,
    "agent_thread_binding_observed",
    (candidate) => candidate.payload.conversationId === targets.conversationId,
    timeoutMs,
  );
  const narrator = await waitForRecordedNarrator(artifactDirectory, targets, timeoutMs);
  assertRecordedNarrator(narrator, targets.finalNarration);

  const events = [checkpoint, agent, trajectory, thread, narrator];
  await appendRequiredFailedInvocation(
    events,
    requireFailedAttempt,
    artifactDirectory,
    targets.conversationId,
    timeoutMs,
  );
  const privateTexts = conversationSnapshotPrivateTexts(snapshot);
  for (const event of events) {
    assertPrivateTextOmitted(event, privateTexts);
  }
  return { agent, checkpoint, narrator, thread, trajectory };
}

function conversationInvocationAuditTargets(snapshot) {
  const conversationId = snapshot.conversation.id;
  const checkpointThrough = snapshot.narratorState.checkpointThroughSequence;
  if (checkpointThrough <= 0) {
    throw new Error(`conversation ${conversationId} has no committed checkpoint to audit`);
  }
  const terminalTurn = [...snapshot.turns.turns]
    .reverse()
    .find((turn) => turn.resolvedInvocation !== null && turn.endedAt !== null);
  if (!terminalTurn) {
    throw new Error(`conversation ${conversationId} has no terminal agent invocation to audit`);
  }
  const finalNarration = [...snapshot.narration.events]
    .reverse()
    .find((event) => event.kind === "final_summary" && event.turnId === terminalTurn.id);
  if (!finalNarration) {
    throw new Error(`conversation ${conversationId} has no terminal narrator output to audit`);
  }
  if (finalNarration.finalSummary === null) {
    throw new Error(`terminal narration ${finalNarration.id} has no final-summary payload`);
  }
  return { checkpointThrough, conversationId, finalNarration, terminalTurn };
}

function waitForRecordedCheckpoint(artifactDirectory, targets, timeoutMs) {
  return waitForSemanticEvent(
    artifactDirectory,
    "conversation_invocation_attempted",
    (candidate) =>
      candidate.payload.conversationId === targets.conversationId &&
      candidate.payload.attempt.callKind === "checkpoint" &&
      candidate.payload.attempt.context.postCursor?.checkpointThroughSequence ===
        targets.checkpointThrough &&
      candidate.payload.attempt.outcome === "completed",
    timeoutMs,
  );
}

function assertRecordedCheckpoint(checkpoint, checkpointThrough) {
  const checkpointAttempt = checkpoint.payload.attempt;
  assertRecordedCheckpointContext(checkpoint, checkpointAttempt, checkpointThrough);
  assertRecordedCheckpointOutput(checkpoint, checkpointAttempt);
}

function assertRecordedCheckpointContext(checkpoint, attempt, checkpointThrough) {
  if (
    attempt.trigger !== "checkpoint_window_exceeded" ||
    !attempt.context.materialized ||
    attempt.context.includedRanges.length === 0 ||
    attempt.context.preCursor === null ||
    attempt.context.postCursor === null ||
    attempt.context.proposedCheckpointThrough !== checkpointThrough
  ) {
    throw new Error(`checkpoint invocation recording drifted: ${JSON.stringify(checkpoint)}`);
  }
}

function assertRecordedCheckpointOutput(checkpoint, attempt) {
  if (
    !checkpointHasNarratorModel(attempt) ||
    attempt.providerReferences.requestId === null ||
    attempt.contextUsage.inputBytes <= 0 ||
    attempt.output.structuredKind !== "checkpoint" ||
    attempt.output.checkpointSummaryBytes <= 0 ||
    attempt.validationResult !== "passed" ||
    attempt.commitDecision !== "output_committed"
  ) {
    throw new Error(`checkpoint invocation recording drifted: ${JSON.stringify(checkpoint)}`);
  }
}

function checkpointHasNarratorModel(attempt) {
  if (attempt.requested === null || attempt.resolved === null) {
    return false;
  }
  return attempt.requested.role === "narrator" && typeof attempt.resolved.modelId === "string";
}

function waitForRecordedAgent(artifactDirectory, targets, timeoutMs) {
  return waitForSemanticEvent(
    artifactDirectory,
    "agent_invocation_observed",
    (candidate) =>
      candidate.payload.conversationId === targets.conversationId &&
      candidate.payload.turnId === targets.terminalTurn.id &&
      candidate.payload.status === targets.terminalTurn.status &&
      candidate.payload.resolvedInvocation !== null,
    timeoutMs,
  );
}

function assertRecordedAgent(agent, terminalTurn) {
  const agentInvocation = agent.payload.resolvedInvocation;
  if (
    agentInvocation.role !== "agent" ||
    agentInvocation.providerReferences.threadId === null ||
    agentInvocation.providerReferences.turnId === null ||
    agentInvocation.startedAt === "" ||
    agentInvocation.endedAt === null ||
    agentInvocation.outcome !== terminalTurn.resolvedInvocation.outcome
  ) {
    throw new Error(`agent invocation recording drifted: ${JSON.stringify(agent)}`);
  }
}

function waitForRecordedTerminalTrajectory(artifactDirectory, targets, timeoutMs) {
  return waitForSemanticEvent(
    artifactDirectory,
    "agent_trajectory_observed",
    (candidate) =>
      candidate.payload.conversationId === targets.conversationId &&
      candidate.payload.turnId === targets.terminalTurn.id &&
      ["turn_completed", "turn_failed", "turn_interrupted"].includes(candidate.payload.eventKind),
    timeoutMs,
  );
}

function waitForRecordedNarrator(artifactDirectory, targets, timeoutMs) {
  return waitForSemanticEvent(
    artifactDirectory,
    "narrator_output_observed",
    (candidate) =>
      candidate.payload.conversationId === targets.conversationId &&
      candidate.payload.narrationId === targets.finalNarration.id,
    timeoutMs,
  );
}

function assertRecordedNarrator(narrator, finalNarration) {
  if (
    narrator.payload.kind !== "final_summary" ||
    narrator.payload.output.finalSummaryBytes !==
      Buffer.byteLength(finalNarration.finalSummary.text, "utf8") ||
    narrator.payload.resolvedInvocation.role !== "narrator" ||
    narrator.payload.resolvedInvocation.providerReferences.requestId === null
  ) {
    throw new Error(`narrator output recording drifted: ${JSON.stringify(narrator)}`);
  }
}

async function appendRequiredFailedInvocation(
  events,
  required,
  artifactDirectory,
  conversationId,
  timeoutMs,
) {
  if (required) {
    const failure = await waitForSemanticEvent(
      artifactDirectory,
      "conversation_invocation_attempted",
      (candidate) =>
        candidate.payload.conversationId === conversationId &&
        candidate.payload.attempt.outcome === "failed" &&
        candidate.payload.attempt.commitDecision === "failure_committed",
      timeoutMs,
    );
    events.push(failure);
  }
}

async function waitForSemanticEvent(artifactDirectory, type, predicate, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const events = await readJsonLinesWhileAppending(join(artifactDirectory, "events.jsonl"));
    const match = events.find((event) => event.type === type && predicate(event));
    if (match) {
      return match;
    }
    await delay(20);
  }
  throw new Error(`desktop recording did not contain semantic event ${type}`);
}

function assertPrivateTextOmitted(event, values) {
  const encoded = JSON.stringify(event);
  for (const value of values) {
    if (typeof value === "string" && value !== "" && encoded.includes(value)) {
      throw new Error(`semantic route observation retained private route text: ${encoded}`);
    }
  }
}

function conversationClarificationSummary(reply) {
  if (reply === null) {
    return null;
  }
  return {
    acceptedAt: reply.acceptedAt,
    inputId: reply.input.id,
    inputModality: reply.input.modality,
    inputTextBytes: Buffer.byteLength(reply.input.text, "utf8"),
    parentInputId: reply.input.replyToInputId,
    sequence: reply.sequence,
    sourcePaneId: reply.input.sourcePaneId,
    status: reply.status,
    submittedAt: reply.input.submittedAt,
  };
}

function conversationPrivateTexts(routeState, inputText) {
  const values = [inputText];
  if (routeState.clarificationReply !== null) {
    values.push(routeState.clarificationReply.input.text);
  }
  for (const record of routeState.decisions) {
    values.push(...conversationRouteTexts(record.decision));
    values.push(...conversationRouteTexts(record.resultingCommand));
  }
  return values;
}

function conversationSnapshotPrivateTexts(snapshot) {
  return [
    snapshot.conversation.title,
    snapshot.narratorState.checkpointText,
    snapshot.narratorState.currentFocus,
    snapshot.narratorState.topicDescriptor,
    narratorDegradationMessage(snapshot),
    ...snapshot.turns.turns.flatMap(turnPrivateTexts),
    ...snapshot.narration.events.flatMap(narrationPrivateTexts),
  ];
}

function narratorDegradationMessage(snapshot) {
  if (snapshot.narratorState.degradation === null) {
    return undefined;
  }
  return snapshot.narratorState.degradation.message;
}

function turnPrivateTexts(turn) {
  const values = [turn.authoredInput.text];
  if (turn.error !== null) {
    values.push(turn.error.message);
  }
  appendInvocationPrivateTexts(values, turn.resolvedInvocation);
  return values;
}

function narrationPrivateTexts(event) {
  const values = [];
  appendTextPayload(values, event.milestone);
  if (event.statusReply !== null) {
    values.push(event.statusReply.question, event.statusReply.text);
  }
  appendTextPayload(values, event.finalSummary);
  appendTextPayload(values, event.topicDescriptor);
  appendInvocationPrivateTexts(values, event.resolvedInvocation);
  return values;
}

function appendTextPayload(values, payload) {
  if (payload !== null) {
    values.push(payload.text);
  }
}

function appendInvocationPrivateTexts(values, invocation) {
  if (invocation === null) {
    return;
  }
  if (invocation.failure !== null) {
    values.push(invocation.failure.message);
  }
  for (const reroute of invocation.modelReroutes) {
    values.push(reroute.reason);
  }
}

const conversationRouteTextReaders = Object.freeze({
  answer_as_narrator: (route) => [route.answerAsNarrator?.question],
  clarify: (route) => [route.clarify?.question],
  create_side_conversation: (route) => [route.createSideConversation?.input?.text],
  escalate_to_master: (route) => [route.escalateToMaster?.input?.text],
  fork_conversation: (route) => [
    route.forkConversation?.input?.text,
    route.forkConversation?.proposedTitle,
  ],
  queue_parent_turn: (route) => [route.queueParentTurn?.authoredInput?.text],
  send_to_parent: (route) => [route.sendToParent?.authoredInput?.text],
  steer_parent_turn: (route) => [route.steerParentTurn?.authoredInput?.text],
});

function conversationRouteTexts(route) {
  const read = conversationRouteTextReaders[route.kind];
  if (!read) {
    throw new Error(`unsupported conversation route kind ${String(route.kind)}`);
  }
  return read(route);
}

function masterPrivateTexts(routeRecord, inputText) {
  return [
    inputText,
    routeRecord.context.candidateQuery,
    ...masterRouteTexts(routeRecord.decision),
    ...masterRouteTexts(routeRecord.resultingCommand),
  ];
}

const masterRouteTextReaders = Object.freeze({
  answer_global: (route) => [route.answerGlobal?.text],
  ask_narrator: (route) => [route.askNarrator?.question, route.askNarrator?.target?.title],
  clarify: (route) => [route.clarify?.question],
  create_conversation: (route) => [
    route.createConversation?.initialInput,
    route.createConversation?.proposedTitle,
    route.createConversation?.target?.title,
  ],
  create_side_conversation: (route) => [
    route.createSideConversation?.input,
    route.createSideConversation?.target?.title,
  ],
  focus_conversation: (route) => [route.focusConversation?.target?.title],
  fork_conversation: (route) => [
    route.forkConversation?.input,
    route.forkConversation?.target?.title,
  ],
  queue_agent_turn: (route) => [
    route.queueAgentTurn?.authoredInput,
    route.queueAgentTurn?.target?.title,
  ],
  send_to_agent: (route) => [route.sendToAgent?.authoredInput, route.sendToAgent?.target?.title],
  steer_active_turn: (route) => [
    route.steerActiveTurn?.authoredInput,
    route.steerActiveTurn?.target?.title,
  ],
});

function masterRouteTexts(route) {
  const read = masterRouteTextReaders[route.kind];
  if (!read) {
    throw new Error(`unsupported master route kind ${String(route.kind)}`);
  }
  return read(route);
}

function routeOrigin(value) {
  return {
    originatingConversationId: value?.originatingConversationId ?? null,
    originatingConversationInputId: value?.originatingConversationInputId ?? null,
    originatingPaneId: value?.originatingPaneId ?? null,
    originatingWorkspaceId: value?.originatingWorkspaceId ?? null,
  };
}

function assertEqualJSON(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} drifted: ${JSON.stringify({ actual, expected })}`);
  }
}
