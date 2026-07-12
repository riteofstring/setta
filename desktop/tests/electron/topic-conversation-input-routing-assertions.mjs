export async function submitConversationInput(client, request) {
  return client.evaluate(`window.setta.conversations.submitInput(${JSON.stringify(request)})`);
}

export async function readConversationInputRoutingState(client, workspaceId, request) {
  return client.evaluate(
    `window.setta.conversations.readInputState(${JSON.stringify(inputStateRequest(workspaceId, request))})`,
  );
}

export async function discardConversationInput(client, workspaceId, request) {
  return client.evaluate(
    `window.setta.conversations.discardInput(${JSON.stringify(inputStateRequest(workspaceId, request))})`,
  );
}

export function assertIdempotentConversationInput(first, duplicate, expectedInput) {
  const expectedFirst = receiptSummary({
    ...first,
    input: expectedInput,
    sequence: 1,
    status: "accepted",
  });
  if (
    JSON.stringify(receiptSummary(first)) !== JSON.stringify(expectedFirst) ||
    JSON.stringify(receiptSummary(duplicate)) !== JSON.stringify(receiptSummary(first))
  ) {
    throw new Error(
      `conversation input was not accepted idempotently: ${JSON.stringify({ duplicate, first })}`,
    );
  }
}

export function assertRoutedConversationInputReceipt(
  first,
  duplicate,
  expectedInput,
  expectedSequence = 1,
) {
  const expectedFirst = receiptSummary({
    ...first,
    input: expectedInput,
    sequence: expectedSequence,
    status: "accepted",
  });
  const expectedDuplicate = { ...expectedFirst, status: "dispatched" };
  if (
    JSON.stringify(receiptSummary(first)) !== JSON.stringify(expectedFirst) ||
    JSON.stringify(receiptSummary(duplicate)) !== JSON.stringify(expectedDuplicate)
  ) {
    throw new Error(
      `conversation input did not preserve its receipt across routing: ${JSON.stringify({ duplicate, first })}`,
    );
  }
}

export function assertAcceptedConversationInputRoutingState(state, expectedInput) {
  assertRoutingState(
    state,
    expectedInput,
    {
      failureCode: null,
      failureRetryable: null,
      routingAttempt: 0,
      status: "accepted",
    },
    "accepted",
  );
}

export function assertDispatchedConversationInputRoutingState(state, expectedInput) {
  assertRoutedConversationInputState(state, expectedInput, {
    branch: "sendToParent",
    kind: "send_to_parent",
    sequence: 1,
  });
  assertIdleConversationRouterContextAudit(state.decisions[0].routerContext, state.input.sequence);
}

export function assertQueuedConversationInputRoutingState(state, expectedInput) {
  assertRoutedConversationInputState(state, expectedInput, {
    branch: "queueParentTurn",
    kind: "queue_parent_turn",
    sequence: 2,
  });
  assertWorkingConversationRouterContextAudit(
    state.decisions[0].routerContext,
    state.input.sequence,
  );
}

function assertRoutedConversationInputState(state, expectedInput, expectedRoute) {
  assertRoutingState(
    state,
    expectedInput,
    {
      failureCode: null,
      failureRetryable: null,
      routingAttempt: 1,
      status: "dispatched",
    },
    "dispatched",
    1,
    expectedRoute.sequence,
  );
  const decision = state.decisions[0];
  assertConversationRouterDecision(decision, expectedInput, expectedRoute);
  assertConversationRouterInvocation(decision.resolvedInvocation);
}

function assertConversationRouterDecision(decision, expectedInput, expectedRoute) {
  const command = decision.resultingCommand[expectedRoute.branch];
  const routed = decision.decision[expectedRoute.branch];
  const actual = {
    commandKind: decision.resultingCommand.kind,
    commandText: command?.authoredInput?.text,
    decisionKind: decision.decision.kind,
    decisionText: routed?.authoredInput?.text,
    source: decision.source,
  };
  const expected = {
    commandKind: expectedRoute.kind,
    commandText: expectedInput.text,
    decisionKind: expectedRoute.kind,
    decisionText: expectedInput.text,
    source: "conversation_router",
  };
  assertEqualJSON(actual, expected, "conversation-router decision");
  assertNonEmptyString(command?.turnId, "conversation-router parent turn id");
}

function assertIdleConversationRouterContextAudit(audit, inputSequence) {
  const expectedAllowedKinds = [
    "send_to_parent",
    "answer_as_narrator",
    "escalate_to_master",
    "clarify",
  ];
  const actual = {
    allowedDecisionKinds: audit.allowedDecisionKinds,
    availableTrajectoryRange: audit.availableTrajectoryRange,
    clarificationInputSequence: audit.clarificationInputSequence,
    includedTrajectoryRange: audit.includedTrajectoryRange,
    inputSequence: audit.inputSequence,
    latestTrajectorySequence: audit.latestTrajectorySequence,
    priorNarrationCount: audit.priorNarrationCount,
    priorRouteDecisionCount: audit.priorRouteDecisionCount,
    requestedMode: audit.requestedMode,
    validCompletedForkPointCount: audit.validCompletedForkPointCount,
  };
  const expected = {
    allowedDecisionKinds: expectedAllowedKinds,
    availableTrajectoryRange: null,
    clarificationInputSequence: null,
    includedTrajectoryRange: null,
    inputSequence,
    latestTrajectorySequence: 0,
    priorNarrationCount: 0,
    priorRouteDecisionCount: 0,
    requestedMode: "route",
    validCompletedForkPointCount: 0,
  };
  assertEqualJSON(actual, expected, "conversation-router context audit");
}

function assertWorkingConversationRouterContextAudit(audit, inputSequence) {
  const expectedAllowedKinds = [
    "queue_parent_turn",
    "steer_parent_turn",
    "answer_as_narrator",
    "escalate_to_master",
    "clarify",
  ];
  if (audit.latestTrajectorySequence <= 0) {
    throw new Error("working conversation-router audit has no trajectory");
  }
  assertEqualJSON(
    {
      allowedDecisionKinds: audit.allowedDecisionKinds,
      availableTrajectoryEnd: audit.availableTrajectoryRange?.end,
      clarificationInputSequence: audit.clarificationInputSequence,
      includedTrajectoryEnd: audit.includedTrajectoryRange?.end,
      inputSequence: audit.inputSequence,
      priorNarrationCount: audit.priorNarrationCount,
      priorRouteDecisionCount: audit.priorRouteDecisionCount,
      requestedMode: audit.requestedMode,
      validCompletedForkPointCount: audit.validCompletedForkPointCount,
    },
    {
      allowedDecisionKinds: expectedAllowedKinds,
      availableTrajectoryEnd: audit.latestTrajectorySequence,
      clarificationInputSequence: null,
      includedTrajectoryEnd: audit.latestTrajectorySequence,
      inputSequence,
      priorNarrationCount: 1,
      priorRouteDecisionCount: 1,
      requestedMode: "route",
      validCompletedForkPointCount: 0,
    },
    "working conversation-router context audit",
  );
}

function assertConversationRouterInvocation(invocation) {
  const actual = {
    approvals: invocation.resolved.permissionProfile.approvals,
    modelMode: invocation.requested.modelSelection.mode,
    outcome: invocation.outcome,
    provider: invocation.provider,
    providerPermissionProfile: invocation.resolved.permissionProfile.providerPermissionProfile,
    requestedModelId: invocation.requested.modelSelection.modelId,
    resolvedModelId: invocation.resolved.modelId,
    role: invocation.role,
    toolAccessMode: invocation.resolved.permissionProfile.toolAccess.mode,
    workspaceMutation: invocation.resolved.permissionProfile.workspaceMutation,
  };
  const expected = {
    approvals: false,
    modelMode: "exact",
    outcome: "succeeded",
    provider: "codex",
    providerPermissionProfile: ":read-only",
    requestedModelId: "gpt-5.4-mini",
    resolvedModelId: "gpt-5.4-mini",
    role: "narrator",
    toolAccessMode: "none",
    workspaceMutation: false,
  };
  assertEqualJSON(actual, expected, "conversation-router invocation");
  assertPositiveNumber(invocation.contextUsage.inputBytes, "conversation-router input bytes");
  assertPositiveNumber(invocation.contextUsage.outputBytes, "conversation-router output bytes");
  assertNonEmptyString(invocation.providerReferences.threadId, "conversation-router thread id");
  assertNonEmptyString(invocation.providerReferences.turnId, "conversation-router turn id");
  assertNonEmptyString(invocation.providerReferences.requestId, "conversation-router request id");
}

function assertEqualJSON(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`invalid ${label}: ${JSON.stringify(actual)}`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`invalid ${label}: ${JSON.stringify(value)}`);
  }
}

function assertPositiveNumber(value, label) {
  if (typeof value !== "number" || value <= 0) {
    throw new Error(`invalid ${label}: ${JSON.stringify(value)}`);
  }
}

export function assertDiscardedConversationInputRoutingState(state, expectedInput) {
  assertRoutingState(
    state,
    expectedInput,
    {
      failureCode: "conversation_input_discarded",
      failureRetryable: false,
      routingAttempt: 0,
      status: "failed",
    },
    "discarded",
  );
}

export async function assertChangedConversationInputConflicts(client, request) {
  const changed = {
    input: { ...request.input, text: "Changed content for the same conversation input id" },
  };
  const result = await client.evaluate(`(async () => {
    try {
      await window.setta.conversations.submitInput(${JSON.stringify(changed)});
      return { accepted: true, message: "" };
    } catch (error) {
      return { accepted: false, message: error instanceof Error ? error.message : String(error) };
    }
  })()`);
  if (result?.accepted || !result?.message.includes("already accepted with different content")) {
    throw new Error(`changed conversation input id did not conflict: ${JSON.stringify(result)}`);
  }
}

function inputStateRequest(workspaceId, request) {
  return {
    conversationId: request.input.conversationId,
    inputId: request.input.id,
    workspaceId,
  };
}

function assertRoutingState(
  state,
  expectedInput,
  expectedLifecycle,
  label,
  decisions = 0,
  sequence = 1,
) {
  const actual = routingStateSummary(state);
  const expected = {
    clarificationReply: null,
    decisions,
    failureCode: expectedLifecycle.failureCode,
    failureRetryable: expectedLifecycle.failureRetryable,
    input: conversationInputSummary(expectedInput),
    routingAttempt: expectedLifecycle.routingAttempt,
    routingStartedAt: null,
    sequence,
    status: expectedLifecycle.status,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`invalid ${label} conversation input routing state: ${JSON.stringify(state)}`);
  }
}

function routingStateSummary(state) {
  const routingState = state ?? {};
  const inputState = routingState.input ?? {};
  const failure = inputState.failure ?? {};
  return {
    clarificationReply: routingState.clarificationReply,
    decisions: Array.isArray(routingState.decisions) ? routingState.decisions.length : null,
    failureCode: failure.code ?? null,
    failureRetryable: failure.retryable ?? null,
    input: conversationInputSummary(inputState.input),
    routingAttempt: inputState.routingAttempt,
    routingStartedAt: inputState.routingStartedAt,
    sequence: inputState.sequence,
    status: inputState.status,
  };
}

function receiptSummary(receipt) {
  return {
    acceptedAt: receipt?.acceptedAt,
    input: conversationInputSummary(receipt?.input),
    sequence: receipt?.sequence,
    status: receipt?.status,
  };
}

function conversationInputSummary(input) {
  return {
    conversationId: input?.conversationId,
    id: input?.id,
    modality: input?.modality,
    replyToInputId: input?.replyToInputId,
    requestedMode: input?.requestedMode,
    sourcePaneId: input?.sourcePaneId,
    submittedAt: input?.submittedAt,
    text: input?.text,
  };
}
