export async function runProtocolApprovalWorkflows({
  backend,
  clickButtonByText,
  client,
  conversationId,
  setInputValue,
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
    clickButtonByText,
    client,
    setInputValue,
    submitComposer,
    waitForState,
    waitForText,
    waitForTexts,
  });
  await acceptStructuredFormApproval({
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
  await runDynamicToolWorkflow({
    backend,
    client,
    conversationId,
    submitComposer,
    waitForRunWithPrompt,
    waitForTexts,
    workspaceId,
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
  clickButtonByText,
  client,
  setInputValue,
  submitComposer,
  waitForState,
  waitForText,
  waitForTexts,
}) {
  await submitComposer(client, "user input approval workflow", "Send message");
  await waitForTexts(client, [
    "User input approval",
    "What should the scripted workflow continue with?",
  ]);
  await setInputValue(client, '[data-testid="approval-card"] input[type="text"]', "continue");
  await clickButtonByText(client, "Answer");
  await waitForText(client, "User input approval resolved.");
  await waitForApprovalCardAbsent(client, waitForState);
}

async function acceptStructuredFormApproval({
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
  await submitComposer(client, "mcp elicitation form accept workflow", "Send message");
  await waitForTexts(client, ["MCP input requested: deploy", "Target", "Confirm"]);
  await setSelectValue(client, 'select[data-testid="structured-input-field-target"]', "staging");
  await setCheckboxChecked(client, 'input[data-testid="structured-input-field-confirm"]', true);
  await clickButtonByText(client, "Submit");
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
    (item) => item.type === "structured_input" && item.serverName === "deploy",
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

async function runDynamicToolWorkflow({
  backend,
  client,
  conversationId,
  submitComposer,
  waitForRunWithPrompt,
  waitForTexts,
  workspaceId,
}) {
  await submitComposer(client, "dynamic tool workflow", "Send message");
  await waitForTexts(client, ["Dynamic tool workflow complete."]);
  const run = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "dynamic tool workflow",
    "completed",
  );
  await waitForRunActivityItem(
    backend,
    workspaceId,
    run.id,
    (item) =>
      item.type === "dynamic_tool_call" &&
      item.status === "completed" &&
      item.namespace === "setta" &&
      item.toolName === "fakeTool" &&
      item.result.includes("tool ok"),
  );
}

async function setSelectValue(client, selector, value) {
  const changed = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLSelectElement) || element.disabled) {
      return false;
    }
    element.value = ${JSON.stringify(value)};
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return element.value === ${JSON.stringify(value)};
  })()`);
  if (!changed) {
    throw new Error(`select was not editable: ${selector}`);
  }
}

async function setCheckboxChecked(client, selector, checked) {
  const changed = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLInputElement) || element.type !== "checkbox" || element.disabled) {
      return false;
    }
    if (element.checked !== ${JSON.stringify(checked)}) {
      element.click();
    }
    return element.checked === ${JSON.stringify(checked)};
  })()`);
  if (!changed) {
    throw new Error(`checkbox was not editable: ${selector}`);
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
