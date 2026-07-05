export async function runProtocolApprovalWorkflows({
  backend,
  clickButtonByText,
  client,
  conversationId,
  submitComposer,
  waitForRunWithPrompt,
  waitForState,
  waitForText,
  waitForTexts,
  workspaceId,
}) {
  await approveDecisionWorkflow({
    clickButtonByText,
    client,
    prompt: "command approval workflow",
    submitComposer,
    title: "Command approval",
    waitForState,
    waitForText,
  });
  await approveDecisionWorkflow({
    clickButtonByText,
    client,
    prompt: "file approval workflow",
    submitComposer,
    title: "File change approval",
    waitForState,
    waitForText,
  });
  await approveDecisionWorkflow({
    clickButtonByText,
    client,
    prompt: "permission approval workflow",
    submitComposer,
    title: "Permission approval",
    waitForState,
    waitForText,
  });
  await answerUserInputApproval({
    backend,
    client,
    conversationId,
    submitComposer,
    waitForRunWithPrompt,
    waitForState,
    waitForText,
    waitForTexts,
    workspaceId,
  });
  await acceptStructuredFormApproval({
    backend,
    client,
    conversationId,
    submitComposer,
    waitForRunWithPrompt,
    waitForState,
    waitForText,
    waitForTexts,
    workspaceId,
  });
  await cancelStructuredFormApproval({
    clickButtonByText,
    client,
    submitComposer,
    waitForState,
    waitForText,
    waitForTexts,
  });
  await declineStructuredURLApproval({
    clickButtonByText,
    client,
    submitComposer,
    waitForState,
    waitForText,
    waitForTexts,
  });
}

async function approveDecisionWorkflow({
  clickButtonByText,
  client,
  prompt,
  submitComposer,
  title,
  waitForState,
  waitForText,
}) {
  await submitComposer(client, prompt, "Send message");
  await waitForText(client, title);
  await clickButtonByText(client, "Approve");
  await waitForText(client, `${title} resolved.`);
  await waitForApprovalCardAbsent(client, waitForState);
}

async function answerUserInputApproval({
  backend,
  client,
  conversationId,
  submitComposer,
  waitForRunWithPrompt,
  waitForState,
  waitForText,
  waitForTexts,
  workspaceId,
}) {
  await submitComposer(client, "user input approval workflow", "Send message");
  await waitForTexts(client, [
    "User input approval",
    "What should the scripted workflow continue with?",
  ]);
  const pendingRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "user input approval workflow",
    "running",
  );
  await submitUserInputApproval(client, {
    approvalId: `approval_user_input_${pendingRun.id}`,
    conversationId,
    workspaceId,
  });
  await waitForText(client, "User input approval resolved.");
  await waitForApprovalCardAbsent(client, waitForState);
  await waitForRunActivityItem(
    backend,
    workspaceId,
    pendingRun.id,
    (item) =>
      item.type === "approval_request" &&
      item.details?.approval?.approvalKind === "user_input" &&
      item.details.approval.approvalStatus === "answered" &&
      item.details.approval.questions.some((question) => question.id === "scripted_answer"),
  );
}

async function acceptStructuredFormApproval({
  backend,
  client,
  conversationId,
  submitComposer,
  waitForRunWithPrompt,
  waitForState,
  waitForText,
  waitForTexts,
  workspaceId,
}) {
  await submitComposer(client, "mcp elicitation form accept workflow", "Send message");
  await waitForTexts(client, ["MCP input requested: deploy", "Target", "Confirm"]);
  const pendingRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "mcp elicitation form accept workflow",
    "running",
  );
  await submitStructuredInputApproval(client, {
    approvalId: `approval_mcp_form_${pendingRun.id}`,
    conversationId,
    workspaceId,
  });
  await waitForText(client, "MCP form accepted.");
  await waitForApprovalCardAbsent(client, waitForState);
  const run = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "mcp elicitation form accept workflow",
    "completed",
  );
  await waitForRunActivityItem(
    backend,
    workspaceId,
    run.id,
    (item) =>
      item.type === "approval_request" &&
      item.details?.approval?.approvalKind === "structured_input" &&
      item.details.approval.structuredInput?.serverName === "deploy",
  );
}

async function cancelStructuredFormApproval({
  clickButtonByText,
  client,
  submitComposer,
  waitForState,
  waitForText,
  waitForTexts,
}) {
  await submitComposer(client, "mcp elicitation form cancel workflow", "Send message");
  await waitForTexts(client, ["MCP input requested: deploy", "Target", "Confirm"]);
  await clickButtonByText(client, "Cancel");
  await waitForText(client, "MCP form cancelled.");
  await waitForApprovalCardAbsent(client, waitForState);
}

async function declineStructuredURLApproval({
  clickButtonByText,
  client,
  submitComposer,
  waitForState,
  waitForText,
  waitForTexts,
}) {
  await submitComposer(client, "mcp elicitation url decline workflow", "Send message");
  await waitForTexts(client, ["MCP input requested: accounts", "https://example.test/login"]);
  await clickButtonByText(client, "Decline");
  await waitForText(client, "MCP url declined.");
  await waitForApprovalCardAbsent(client, waitForState);
}

async function waitForApprovalCardAbsent(client, waitForState) {
  await waitForState(
    client,
    `(() => ({ present: Boolean(document.querySelector('[data-testid="approval-card"]')) }))()`,
    (value) => !value.present,
  );
}

async function submitStructuredInputApproval(client, { approvalId, conversationId, workspaceId }) {
  const result = await client.evaluate(`(async () => {
    const submitApproval = window.setta?.chat?.submitApproval;
    if (typeof submitApproval !== "function") {
      return { reason: "missing-submit-approval-api", submitted: false };
    }
    await submitApproval({
      approvalId: ${JSON.stringify(approvalId)},
      approved: true,
      answers: [
        { answers: [], questionId: "target", value: "staging" },
        { answers: [], questionId: "confirm", value: true },
      ],
      cancelled: false,
      conversationId: ${JSON.stringify(conversationId)},
      response: "",
      workspaceId: ${JSON.stringify(workspaceId)},
    });
    return { submitted: true };
  })()`);
  if (!result.submitted) {
    throw new Error(`structured input approval was not submittable: ${JSON.stringify(result)}`);
  }
}

async function submitUserInputApproval(client, { approvalId, conversationId, workspaceId }) {
  const result = await client.evaluate(`(async () => {
    const submitApproval = window.setta?.chat?.submitApproval;
    if (typeof submitApproval !== "function") {
      return { reason: "missing-submit-approval-api", submitted: false };
    }
    await submitApproval({
      approvalId: ${JSON.stringify(approvalId)},
      approved: true,
      answers: [
        { answers: ["continue"], questionId: "scripted_answer", value: null },
      ],
      cancelled: false,
      conversationId: ${JSON.stringify(conversationId)},
      response: "",
      workspaceId: ${JSON.stringify(workspaceId)},
    });
    return { submitted: true };
  })()`);
  if (!result.submitted) {
    throw new Error(`user input approval was not submittable: ${JSON.stringify(result)}`);
  }
}

async function waitForRunActivityItem(backend, workspaceId, runId, isReady) {
  return waitForBackendState(async () => {
    const page = await backend.post("/chat/runs/activity", { limit: 100, runId, workspaceId });
    return page.items.find(isReady) ?? null;
  }, Boolean);
}

async function waitForBackendState(readState, isReady, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await readState();
    if (isReady(lastValue)) {
      return lastValue;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for backend state: ${JSON.stringify(lastValue)}`);
}
