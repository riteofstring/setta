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

function assertRoutingState(state, expectedInput, expectedLifecycle, label) {
  const actual = routingStateSummary(state);
  const expected = {
    clarificationReply: null,
    decisions: 0,
    failureCode: expectedLifecycle.failureCode,
    failureRetryable: expectedLifecycle.failureRetryable,
    input: conversationInputSummary(expectedInput),
    routingAttempt: expectedLifecycle.routingAttempt,
    routingStartedAt: null,
    sequence: 1,
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
