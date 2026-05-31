export async function runPostCompletionActiveRunWorkflow({
  backend,
  client,
  conversationId,
  submitComposer,
  waitForRunStatus,
  waitForRunWithPrompt,
  waitForState,
  waitForTexts,
  workspaceId,
}) {
  await submitComposer(client, "workflow hold for queue and steering", "Send message");
  const activeRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "workflow hold for queue and steering",
    "running",
  );
  await assertRendererRunStatus(client, waitForState, "running");
  await submitComposer(client, "finish second active run", "Send steering message");
  await waitForTexts(client, [
    "Steered with finish second active run.",
    "Active workflow complete.",
  ]);
  await waitForRunStatus(backend, workspaceId, conversationId, activeRun.id, "completed");
}

async function assertRendererRunStatus(client, waitForState, status) {
  await waitForState(
    client,
    `(() => {
      const pane = document.querySelector('[data-testid="chat-detail-pane"]');
      return { status: pane?.getAttribute("data-run-status") ?? "" };
    })()`,
    (value) => value.status === status,
  );
}
