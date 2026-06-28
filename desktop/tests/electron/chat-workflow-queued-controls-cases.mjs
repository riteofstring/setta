import { waitForComposerFocus } from "./chat-workflow-assertions.mjs";

export async function runQueuedControlsWorkflow({
  assertChatLayout,
  assertNoActiveRun,
  assertNoCriticalDiagnostics,
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
  await submitComposerWithEnter({
    client,
    setInputValue,
    text: "cancel active workflow",
    waitForState,
  });
  const originalActiveRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "cancel active workflow",
    "running",
  );
  await waitForText(client, "Cancel workflow waiting.");
  await waitForComposerFocus(waitForState, client);

  await queueComposerWithTab({
    client,
    setInputValue,
    text: "queued follow-up from active run",
    waitForState,
  });
  const queuedRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "queued follow-up from active run",
    "queued",
  );
  await waitForComposerFocus(waitForState, client);
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
  await waitForTextAbsent(waitForState, client, "queued follow-up two from active run");

  await submitComposer(client, "immediate replay workflow", "Send steering message");
  await waitForTexts(client, ["immediate replay workflow", "Steering pending"]);
  // Steering interleaves into the active run's blocks, so the pending steering message lands after
  // the active run's assistant text and before the queued tail (queued runs sort after the active
  // run's blocks), rather than after the queued message by conversation ordinal.
  await assertTranscriptSequence(client, [
    "cancel active workflow",
    "Cancel workflow waiting.",
    "immediate replay workflow",
    "queued follow-up one from active run",
  ]);
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
    "immediate replay workflow",
    "finish immediate replay",
    "Active workflow complete.",
    "queued follow-up one from active run",
    "Queued response for queued follow-up one from active run.",
  ]);
  await assertChatLayout(client);
  await assertNoCriticalDiagnostics(backend, workspaceId, conversationId);
}

async function queueComposerWithTab({ client, setInputValue, text, waitForState }) {
  await waitForState(client, composerReadyExpression(), (value) => value.ready);
  await setInputValue(client, 'textarea[aria-label="Ask Setta"]', text);
  const focused = await focusComposerTextarea(client);
  if (!focused) {
    throw new Error("composer could not be focused before Tab queueing");
  }
  await dispatchTab(client, "rawKeyDown");
  await dispatchTab(client, "keyUp");
}

async function submitComposerWithEnter({ client, setInputValue, text, waitForState }) {
  await waitForState(client, composerReadyExpression(), (value) => value.ready);
  await setInputValue(client, 'textarea[aria-label="Ask Setta"]', text);
  const focused = await focusComposerTextarea(client);
  if (!focused) {
    throw new Error("composer could not be focused before Enter send");
  }
  await dispatchEnter(client, "rawKeyDown");
  await dispatchEnter(client, "keyUp");
}

async function focusComposerTextarea(client) {
  return client.evaluate(`(() => {
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
    if (!textarea || textarea.disabled) {
      return false;
    }
    textarea.focus();
    return document.activeElement === textarea;
  })()`);
}

async function dispatchTab(client, type) {
  await client.call("Input.dispatchKeyEvent", {
    code: "Tab",
    key: "Tab",
    nativeVirtualKeyCode: 9,
    type,
    windowsVirtualKeyCode: 9,
  });
}

async function dispatchEnter(client, type) {
  await client.call("Input.dispatchKeyEvent", {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    type,
    windowsVirtualKeyCode: 13,
  });
}

function composerReadyExpression() {
  return `(() => {
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
    return { ready: Boolean(textarea && !textarea.disabled) };
  })()`;
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

async function waitForTextAbsent(waitForState, client, text) {
  await waitForState(
    client,
    `(() => ({ body: document.body.innerText }))()`,
    (value) => !value.body.includes(text),
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
  return message.parts
    .map((part) => (part.type === "text" ? (part.text?.text ?? "") : ""))
    .join("");
}
