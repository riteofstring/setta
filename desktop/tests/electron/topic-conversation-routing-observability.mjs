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
      schemaVersion: 1,
      sourcePaneId: routeState.input.input.sourcePaneId,
      validationResult: "committed",
    },
    "conversation route recording observability",
  );
  assertPrivateTextOmitted(event, conversationPrivateTexts(routeState, inputText));
  return event;
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
      masterSessionId: routeRecord.masterSessionId,
      origin: routeOrigin(inputIdentity),
      resultingEffectKind: routeRecord.resultingCommand.kind,
      routingAttempt: routeRecord.routingAttempt,
      schemaVersion: 1,
      validationResult: "committed",
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
      schemaVersion: 1,
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
      routingAttempt: event.payload.routingAttempt,
      schemaVersion: event.payload.schemaVersion,
    },
    {
      cancelledAt: state.cancellation.cancelledAt,
      inputId: inputIdentity.id,
      inputModality: inputIdentity.modality,
      inputSource: inputIdentity.source,
      inputTextBytes: Buffer.byteLength(inputText, "utf8"),
      routingAttempt: state.routingAttempt,
      schemaVersion: 1,
    },
    "master route cancellation recording observability",
  );
  assertPrivateTextOmitted(event, [inputText]);
  return event;
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
