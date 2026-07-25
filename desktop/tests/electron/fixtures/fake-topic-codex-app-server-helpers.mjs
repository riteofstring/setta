import process from "node:process";

const simultaneousAudioHoldPrefix = "hold simultaneous audio ";

export function nonEmptyString(value) {
  return typeof value === "string" && value !== "";
}

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

export function scriptedMasterFocusDecision(context, schema, input) {
  const candidate = context.candidates?.[0];
  const conversationId = masterFocusCandidateID(candidate);
  if (
    conversationId === "" ||
    !masterFocusDecisionAllowed(context, schema, input, conversationId)
  ) {
    return null;
  }
  return { conversationId, kind: "focus_conversation" };
}

export function scriptedMasterFolderlessRecentFocusDecision(context, schema, input) {
  const target = masterFolderQuestionTarget(context);
  if (
    input?.source !== "shell" ||
    input?.modality !== "text" ||
    !masterFolderQuestionTargetIsUsable(context, schema, target)
  ) {
    return null;
  }
  return { conversationId: target.conversationId, kind: "focus_conversation" };
}

export function scriptedMasterFolderlessClarificationDecision(context, schema) {
  const target = masterFolderQuestionTarget(context);
  if (
    !context.allowedDecisionKinds?.includes("clarify") ||
    !schema.includes('"clarify"') ||
    !masterFolderQuestionTargetIsUsable(context, schema, target)
  ) {
    return null;
  }
  return {
    kind: "clarify",
    question: "Do you mean the conversation where you asked which folder you were in?",
  };
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

function masterFocusDecisionAllowed(context, schema, input, conversationId) {
  return [
    input?.source === "shell",
    input?.modality === "text",
    masterRouteTargetCanFocus(context, conversationId),
    schema.includes(`"${conversationId}"`),
  ].every(Boolean);
}

function masterFocusCandidateID(candidate) {
  return nonEmptyString(candidate?.conversationId) ? candidate.conversationId : "";
}

function masterRouteTargetCanFocus(context, conversationId) {
  const target = context.conversationTargets?.find(
    (item) => item.conversationId === conversationId,
  );
  return target?.allowedDecisionKinds?.includes("focus_conversation") === true;
}

function masterFolderQuestionTargetIsUsable(context, schema, target) {
  if (
    target?.resourceScope?.kind !== "folderless" ||
    !target.allowedDecisionKinds?.includes("focus_conversation") ||
    !schema.includes(`"${target.conversationId}"`)
  ) {
    return false;
  }
  return context.candidates?.some((candidate) => masterFolderQuestionCandidate(candidate, target));
}

function masterFolderQuestionTarget(context) {
  const candidate = context.candidates?.find((item) => masterFolderQuestionCandidate(item));
  return context.conversationTargets?.find(
    (target) => target.conversationId === candidate?.conversationId,
  );
}

function masterFolderQuestionCandidate(candidate, target = null) {
  return [
    target === null || candidate?.conversationId === target.conversationId,
    candidate?.resourceScope?.kind === "folderless",
    candidateRecentUserRequestText(candidate).toLowerCase().includes("what folder am i in"),
  ].every(Boolean);
}

function candidateRecentUserRequestText(candidate) {
  return (candidate?.recentUserRequests ?? []).map((excerpt) => excerpt.text ?? "").join("\n");
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

const scriptedMasterRouteDecisionByText = new Map([
  ["Cancel active master route.", scriptedMasterCancellationDecision],
  ["Crash master route.", scriptedMasterCrashDecision],
  ["Focus Alpha topic.", scriptedMasterFocusDecision],
  ["Create Gamma topic.", scriptedMasterCreateDecision],
  [
    "Open the recent conversation where I asked what folder I was in.",
    scriptedMasterFolderlessRecentFocusDecision,
  ],
  [
    "Clarify the recent folder question conversation.",
    scriptedMasterFolderlessClarificationDecision,
  ],
  ["Open an Alpha side.", scriptedMasterSideDecision],
  ["Fork Alpha topic.", scriptedMasterForkDecision],
]);

function scriptedMasterCancellationDecision(context, schema) {
  const valid = [
    context.allowedDecisionKinds.includes("answer_global"),
    schema.includes('"answer_global"'),
  ].every(Boolean);
  return valid
    ? { kind: "answer_global", text: "A cancelled master route must never commit this answer." }
    : null;
}

function scriptedMasterCrashDecision(context, schema) {
  const valid = [
    context.allowedDecisionKinds.includes("answer_global"),
    schema.includes('"answer_global"'),
  ].every(Boolean);
  return valid
    ? { kind: "answer_global", text: "The crashed master route recovered exactly once." }
    : null;
}
export function scriptedMasterRouteDecision(context, schema) {
  const input = context.input?.input;
  const scriptedDecision = scriptedMasterRouteDecisionByText.get(input?.text);
  if (scriptedDecision) {
    return scriptedDecision(context, schema, input);
  }
  const clarificationDecision = scriptedMasterClarificationConfirmationDecision(
    context,
    schema,
    input,
  );
  if (clarificationDecision) {
    return clarificationDecision;
  }
  if (masterInputNeedsClarification(input)) {
    return scriptedMasterClarificationDecision(context, schema);
  }
  if (isShellVoiceMasterInput(input)) {
    return scriptedMasterVoiceDecision(context, schema);
  }
  return null;
}

function scriptedMasterCreateDecision(context, schema) {
  const valid = [
    context.allowedDecisionKinds.includes("create_conversation"),
    schema.includes('"resourceScope"'),
    schema.includes('"folderless"'),
  ].every(Boolean);
  return valid
    ? {
        initialInput: "Start the Gamma topic from the global master.",
        kind: "create_conversation",
        proposedTitle: "Gamma topic",
        resourceScope: { kind: "folderless" },
      }
    : null;
}

function scriptedMasterSideDecision(context, schema) {
  const target = masterTargetByTitle(context, "Alpha topic");
  const valid = [
    target?.allowedDecisionKinds?.includes("create_side_conversation"),
    schema.includes(`"${target?.conversationId}"`),
  ].every(Boolean);
  return valid
    ? {
        input: "Answer this short Alpha tangent.",
        kind: "create_side_conversation",
        parentConversationId: target.conversationId,
      }
    : null;
}

function scriptedMasterForkDecision(context, schema) {
  const target = masterTargetByTitle(context, "Alpha topic");
  const forkPoint = target?.completedForkPoints?.at(-1);
  const valid = [
    target?.allowedDecisionKinds?.includes("fork_conversation"),
    nonEmptyString(forkPoint?.turnId),
    schema.includes(`"${target?.conversationId}"`),
    schema.includes(`"${forkPoint?.turnId}"`),
  ].every(Boolean);
  return valid
    ? {
        forkedAtTurnId: forkPoint.turnId,
        input: "Continue this Alpha work as a durable master fork.",
        kind: "fork_conversation",
        parentConversationId: target.conversationId,
      }
    : null;
}

function masterTargetByTitle(context, title) {
  return context.conversationTargets?.find((target) => target.title === title);
}

function masterInputNeedsClarification(input) {
  return input?.text === "Clarify Alpha." || input?.source === "conversation_escalation";
}
function isShellVoiceMasterInput(input) {
  return (
    input?.source === "shell" &&
    (input?.modality === "voice" || input?.text === "Answer from folderless master.")
  );
}

function scriptedMasterClarificationDecision(context, schema) {
  const valid = [
    context.allowedDecisionKinds.includes("clarify"),
    schema.includes('"clarify"'),
  ].every(Boolean);
  return valid
    ? { kind: "clarify", question: "Which topic should handle this unrelated request?" }
    : null;
}

function scriptedMasterVoiceDecision(context, schema) {
  const valid = [
    context.allowedDecisionKinds.includes("answer_global"),
    schema.includes('"answer_global"'),
  ].every(Boolean);
  return valid ? { kind: "answer_global", text: "The shell voice request was received." } : null;
}
