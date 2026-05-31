export async function runQueuedControlsWorkflow({
  assertChatLayout,
  assertNoActiveRun,
  assertNoCriticalDiagnostics,
  assertTextAbsent,
  assertTranscriptSequence,
  backend,
  clickButtonByAria,
  client,
  conversationId,
  setInputValue,
  submitComposer,
  waitForBackendState,
  waitForRunStatus,
  waitForRunWithPrompt,
  waitForState,
  waitForText,
  waitForTexts,
  workspaceId,
}) {
  await submitComposer(client, "cancel active workflow", "Send message");
  const originalActiveRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "cancel active workflow",
    "running",
  );
  await waitForText(client, "Cancel workflow waiting.");

  await submitComposer(client, "queued follow-up from active run", "Queue follow-up");
  const queuedRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "queued follow-up from active run",
    "queued",
  );
  await clickMessageActionByText(
    waitForState,
    client,
    "queued follow-up from active run",
    "Edit queued message",
  );
  await setInputValue(
    client,
    'textarea[aria-label="Queued message text"]',
    "queued follow-up one from active run",
  );
  await clickButtonByAria(client, "Save queued message");
  const editedQueuedRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "queued follow-up one from active run",
    "queued",
  );
  if (editedQueuedRun.id !== queuedRun.id) {
    throw new Error(
      `queued edit changed run id: ${JSON.stringify({ editedQueuedRun, queuedRun })}`,
    );
  }

  await submitComposer(client, "queued follow-up two from active run", "Queue follow-up");
  await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "queued follow-up two from active run",
    "queued",
  );
  await clickMessageActionByText(
    waitForState,
    client,
    "queued follow-up two from active run",
    "Confirm queued message removal",
  );
  await clickMessageActionByText(
    waitForState,
    client,
    "queued follow-up two from active run",
    "Remove queued message",
  );
  await waitForNoRunWithPrompt(
    waitForBackendState,
    backend,
    workspaceId,
    conversationId,
    "queued follow-up two from active run",
  );
  await assertTextAbsent(client, "queued follow-up two from active run");

  await submitComposer(client, "immediate replay workflow", "Send steering message");
  await waitForTexts(client, ["immediate replay workflow", "Steering pending"]);
  await waitForPendingSteeringPrompt(
    waitForBackendState,
    backend,
    workspaceId,
    conversationId,
    "immediate replay workflow",
  );
  await clickMessageActionByText(
    waitForState,
    client,
    "immediate replay workflow",
    "Interrupt and send pending steering",
  );
  await waitForRunStatus(backend, workspaceId, conversationId, originalActiveRun.id, "cancelled");
  const replayRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "immediate replay workflow",
    "running",
  );
  await waitForRunStatus(backend, workspaceId, conversationId, editedQueuedRun.id, "queued");
  await waitForNoPendingSteeringPrompt(
    waitForBackendState,
    backend,
    workspaceId,
    conversationId,
    "immediate replay workflow",
  );

  await submitComposer(client, "finish immediate replay", "Send steering message");
  await waitForTexts(client, [
    "Steered with finish immediate replay.",
    "Active workflow complete.",
    "Queued response for queued follow-up one from active run.",
  ]);
  await waitForRunStatus(backend, workspaceId, conversationId, replayRun.id, "completed");
  await waitForRunStatus(backend, workspaceId, conversationId, editedQueuedRun.id, "completed");
  await assertNoActiveRun(backend, workspaceId, conversationId);
  await waitForNoRunWithPrompt(
    waitForBackendState,
    backend,
    workspaceId,
    conversationId,
    "queued follow-up two from active run",
  );
  await assertTranscriptSequence(client, [
    "cancel active workflow",
    "queued follow-up one from active run",
    "Queued response for queued follow-up one from active run.",
    "immediate replay workflow",
    "finish immediate replay",
    "Active workflow complete.",
  ]);
  await assertChatLayout(client);
  await assertNoCriticalDiagnostics(backend, workspaceId, conversationId);
}

async function clickMessageActionByText(waitForState, client, messageText, label) {
  await waitForState(
    client,
    messageActionStateExpression(messageText, label),
    (value) => value.ready,
  );
  const clicked = await client.evaluate(messageActionClickExpression(messageText, label));
  if (!clicked) {
    throw new Error(`message action was not clickable: ${label} for ${messageText}`);
  }
}

function messageActionStateExpression(messageText, label) {
  return `(() => {
    const rows = Array.from(document.querySelectorAll('[data-chat-message="true"]'));
    const row = rows.find((candidate) => candidate.innerText.includes(${JSON.stringify(messageText)}));
    const button = Array.from(row?.querySelectorAll("button") ?? [])
      .find((candidate) => candidate.getAttribute("aria-label") === ${JSON.stringify(label)});
    return {
      ready: Boolean(button && !button.disabled),
      rows: rows.map((candidate) => candidate.innerText.trim()),
    };
  })()`;
}

function messageActionClickExpression(messageText, label) {
  return `(() => {
    const rows = Array.from(document.querySelectorAll('[data-chat-message="true"]'));
    const row = rows.find((candidate) => candidate.innerText.includes(${JSON.stringify(messageText)}));
    const button = Array.from(row?.querySelectorAll("button") ?? [])
      .find((candidate) => candidate.getAttribute("aria-label") === ${JSON.stringify(label)});
    if (!button || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`;
}

async function waitForNoRunWithPrompt(
  waitForBackendState,
  backend,
  workspaceId,
  conversationId,
  prompt,
) {
  await waitForBackendState(
    async () => backend.post("/chat/runs/list", { conversationId, workspaceId }),
    (list) => !list.runs.some((run) => run.promptSummary === prompt),
  );
}

async function waitForPendingSteeringPrompt(
  waitForBackendState,
  backend,
  workspaceId,
  conversationId,
  prompt,
) {
  await waitForBackendState(
    () => messagePage(backend, workspaceId, conversationId),
    (page) =>
      page.messages.some(
        (message) =>
          message.delivery === "steering" &&
          message.status === "pending" &&
          messageText(message) === prompt,
      ),
  );
}

async function waitForNoPendingSteeringPrompt(
  waitForBackendState,
  backend,
  workspaceId,
  conversationId,
  prompt,
) {
  await waitForBackendState(
    () => messagePage(backend, workspaceId, conversationId),
    (page) =>
      !page.messages.some(
        (message) =>
          message.delivery === "steering" &&
          message.status === "pending" &&
          messageText(message) === prompt,
      ),
  );
}

function messagePage(backend, workspaceId, conversationId) {
  return backend.post("/chat/messages/page", {
    conversationId,
    limit: 80,
    workspaceId,
  });
}

function messageText(message) {
  return message.parts.map((part) => part.text).join("");
}
