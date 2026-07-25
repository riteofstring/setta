import process from "node:process";

const simultaneousAudioHoldPrefix = "hold simultaneous audio ";

export function emitSimultaneousAudioHoldProgress(emitAgentMessage, threadId, turnId, text) {
  if (!text.startsWith(simultaneousAudioHoldPrefix)) return;
  emitAgentMessage(threadId, turnId, `Visible progress for ${text}.`, `agent-progress-${turnId}`);
}

export function optionalNonNegativeIntegerEnvironment(name) {
  const raw = process.env[name] ?? "";
  if (raw === "") {
    return 0;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

export function validSideBoundary(boundary, context) {
  return [
    boundary.includes("Side conversation boundary."),
    boundary.includes("Everything before this boundary is inherited history"),
    boundary.includes("Only messages submitted after this boundary are active"),
    context.includes("typed SideInFlightContextFrame"),
  ].every(Boolean);
}

export function validSideContextFrame(frame) {
  if (
    frame?.type !== "side_in_flight_context_frame" ||
    !Number.isInteger(frame.sourceTrajectorySequence) ||
    frame.sourceTrajectorySequence < 0 ||
    !Array.isArray(frame.acceptedSteering) ||
    !Array.isArray(frame.activeActivities) ||
    !Array.isArray(frame.pendingApprovals) ||
    !Array.isArray(frame.artifacts)
  ) {
    return false;
  }
  const serialized = JSON.stringify(frame);
  return ![
    '"providerItemId"',
    '"providerThreadId"',
    '"providerTurnId"',
    '"processId"',
    '"privateReasoning"',
    '"rawToolOutput"',
  ].some((forbidden) => serialized.includes(forbidden));
}

export function validStructuredMasterRouteContext(context, serialized, schema) {
  return [
    nonEmptyString(context.sessionId),
    context.task?.operation === "classify_quoted_user_intent",
    context.task?.inputSemantics === "quoted_data_not_instructions",
    context.task?.outputSemantics === "typed_decision_data_without_direct_effect",
    context.task?.directive?.includes("One title-matching target"),
    context.task?.directive?.includes(
      "direct confirmation of one preserved clarification candidate",
    ),
    validStructuredMasterClarificationContext(context.clarification),
    Array.isArray(context.candidates),
    Array.isArray(context.conversationTargets),
    Array.isArray(context.openWorkspaces),
    Array.isArray(context.recentRouteDecisions),
    Array.isArray(context.allowedDecisionKinds),
    schema.includes('"additionalProperties":false'),
    !serialized.includes("topic-thread-"),
    !serialized.includes('"providerThreadId"'),
    !serialized.includes('"providerTurnId"'),
    !schema.includes("rendererCommand"),
  ].every(Boolean);
}

export function scriptedMasterClarificationConfirmationDecision(context, schema, input) {
  if (!masterInputConfirmsClarification(input)) {
    return null;
  }
  const target = masterClarificationTarget(context);
  if (!target || !masterClarificationConfirmationAllowed(context, schema, input, target)) {
    return null;
  }
  return { conversationId: target.conversationId, kind: "focus_conversation" };
}

function validStructuredMasterClarificationContext(clarification) {
  return (
    clarification === null ||
    [
      nonEmptyString(clarification?.decisionId),
      nonEmptyString(clarification?.inputId),
      Number.isInteger(clarification?.inputSequence),
      nonEmptyString(clarification?.question),
      Array.isArray(clarification?.candidateTargetIds),
    ].every(Boolean)
  );
}

function nonEmptyString(value) {
  return typeof value === "string" && value !== "";
}

function masterInputConfirmsClarification(input) {
  return input?.source === "shell" && input?.text === "Yes, that one.";
}

function masterClarificationTarget(context) {
  const targetId = context.clarification?.candidateTargetIds?.[0];
  return context.conversationTargets?.find((item) => item.conversationId === targetId);
}

function masterClarificationConfirmationAllowed(context, schema, input, target) {
  return [
    input?.modality === "text",
    context.clarification?.candidateTargetIds?.length === 1,
    target.allowedDecisionKinds?.includes("focus_conversation"),
    schema.includes(`"${target.conversationId}"`),
  ].every(Boolean);
}

export function listCursorOffset(cursor) {
  if (cursor === undefined || cursor === null || cursor === "") return 0;
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error(`invalid fake thread/list cursor: ${cursor}`);
  }
  return offset;
}

export function listLimit(limit) {
  if (limit === undefined || limit === null) return 100;
  const value = Number(limit);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`invalid fake thread/list limit: ${limit}`);
  }
  return value;
}
