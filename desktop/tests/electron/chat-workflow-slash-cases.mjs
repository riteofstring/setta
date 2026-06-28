import { assertNoCriticalDiagnostics } from "./chat-workflow-assertions.mjs";

export async function runSlashCommandWorkflow({
  assertAssistantCompleted,
  assertChatLayout,
  assertNoActiveRun,
  assertNoRunWithPrompt,
  assertNoVisibleUserMessage,
  assertTextAbsent,
  assertTranscriptSequence,
  backend,
  client,
  conversationId,
  setInputValue,
  submitComposer,
  waitForCommandResult,
  waitForGoalStatus,
  waitForLinkedCodexRef,
  waitForRunStatus,
  waitForRunWithPrompt,
  waitForState,
  waitForText,
  waitForTexts,
  workspaceId,
}) {
  await setInputValue(client, 'textarea[aria-label="Ask Setta"]', "/goal");
  await waitForSlashCommandPaletteOption(waitForState, client, "/goal");

  await submitComposer(client, "/goal finish renderer tests", "Send message");
  await waitForCommandResult(
    backend,
    workspaceId,
    conversationId,
    "Goal set: finish renderer tests",
  );
  await waitForTexts(client, ["Goal set: finish renderer tests"]);
  await waitForLinkedCodexRef(backend, workspaceId, conversationId);
  const goalRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "finish renderer tests",
    "completed",
  );
  await assertAssistantCompleted(backend, workspaceId, conversationId, goalRun.id);
  await waitForGoalStatus(backend, workspaceId, conversationId, "complete");
  await waitForTexts(client, ["Scripted response: finish renderer tests"]);
  await waitForTexts(client, ["Goal complete"]);
  await assertNoVisibleUserMessage(client, "finish renderer tests");
  await submitComposer(client, "/goal", "Send message");
  await waitForCommandResult(
    backend,
    workspaceId,
    conversationId,
    "Goal is complete: finish renderer tests",
  );
  await submitComposer(client, "/goal edit", "Send message");
  await waitForComposerValue(waitForState, client, "/goal finish renderer tests");

  await submitComposer(client, "workflow hold for queue and steering", "Send message");
  const activeRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "workflow hold for queue and steering",
    "running",
  );
  await waitForText(client, "Workflow stream started.");
  await submitComposer(client, "/goal pause", "Send steering message");
  await waitForCommandResult(backend, workspaceId, conversationId, "Goal paused.");
  await waitForGoalStatus(backend, workspaceId, conversationId, "paused");
  await waitForTexts(client, ["Goal paused.", "Workflow stream started."]);
  await assertNoRunWithPrompt(backend, workspaceId, conversationId, "/goal pause");
  await assertTextAbsent(client, "Steered with /goal pause.");
  await client.evaluate("window.confirm = () => true");
  await submitComposer(client, "/goal replacement after pause", "Send steering message");
  await waitForCommandResult(
    backend,
    workspaceId,
    conversationId,
    "Goal set: replacement after pause",
  );
  await waitForGoalStatus(backend, workspaceId, conversationId, "active");
  await assertNoRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "/goal replacement after pause",
  );
  await submitComposer(client, "finish after slash command", "Send steering message");
  await waitForTexts(client, [
    "Steered with finish after slash command.",
    "Active workflow complete.",
  ]);
  await waitForRunStatus(backend, workspaceId, conversationId, activeRun.id, "completed");
  await assertNoActiveRun(backend, workspaceId, conversationId);
  await submitComposer(client, "/goal resume", "Send message");
  await waitForCommandResult(backend, workspaceId, conversationId, "Goal resumed.");
  const resumedGoalRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "replacement after pause",
    "completed",
  );
  await assertAssistantCompleted(backend, workspaceId, conversationId, resumedGoalRun.id);
  await waitForGoalStatus(backend, workspaceId, conversationId, "complete");
  await submitComposer(client, "/goal clear", "Send message");
  await waitForCommandResult(backend, workspaceId, conversationId, "Goal cleared.");
  await waitForGoalStatus(backend, workspaceId, conversationId, null);

  await submitComposer(client, "/goal e", "Send message");
  await waitForCommandResult(backend, workspaceId, conversationId, "Goal set: e");
  const shortGoalRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "e",
    "completed",
  );
  await assertAssistantCompleted(backend, workspaceId, conversationId, shortGoalRun.id);
  await waitForGoalStatus(backend, workspaceId, conversationId, "complete");
  await submitComposer(client, "/goal clear", "Send message");
  await waitForCommandResult(backend, workspaceId, conversationId, "Goal cleared.");
  await waitForGoalStatus(backend, workspaceId, conversationId, null);

  await submitComposer(client, "/goal clear the cache", "Send message");
  await waitForCommandResult(backend, workspaceId, conversationId, "Goal set: clear the cache");
  const clearCacheRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "clear the cache",
    "completed",
  );
  await assertAssistantCompleted(backend, workspaceId, conversationId, clearCacheRun.id);
  await waitForGoalStatus(backend, workspaceId, conversationId, "complete");
  await submitComposer(client, "/goal clear", "Send message");
  await waitForCommandResult(backend, workspaceId, conversationId, "Goal cleared.");
  await waitForGoalStatus(backend, workspaceId, conversationId, null);

  await submitComposer(client, "workflow hold for queue and steering", "Send message");
  const secondRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "workflow hold for queue and steering",
    "running",
  );
  await waitForText(client, "Workflow stream started.");
  await assertOnlyGoalCommandListed(backend, workspaceId, conversationId);
  await submitComposer(client, "finish after descriptor check", "Send steering message");
  await waitForTexts(client, [
    "Steered with finish after descriptor check.",
    "Active workflow complete.",
  ]);
  await waitForRunStatus(backend, workspaceId, conversationId, secondRun.id, "completed");
  await assertNoActiveRun(backend, workspaceId, conversationId);
  await assertTranscriptSequence(client, [
    "Goal paused.",
    "Goal set: replacement after pause",
    "Goal resumed.",
    "Scripted response: replacement after pause",
    "Goal cleared.",
    "Goal set: e",
    "Scripted response: e",
    "Goal cleared.",
    "Goal set: clear the cache",
    "Scripted response: clear the cache",
    "Goal cleared.",
    "workflow hold for queue and steering",
    "Active workflow complete.",
  ]);
  await assertChatLayout(client);
  await assertNoCriticalDiagnostics(backend, workspaceId, conversationId);
}

async function waitForComposerValue(waitForState, client, expectedValue) {
  await waitForState(
    client,
    `(() => {
      const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
      return { value: textarea?.value ?? "" };
    })()`,
    (value) => value.value === expectedValue,
  );
}

async function waitForSlashCommandPaletteOption(waitForState, client, commandName) {
  await waitForState(
    client,
    `(() => {
      const palette = document.querySelector('[data-testid="command-palette"]');
      const option = palette?.querySelector('[role="option"]');
      return {
        optionText: option?.innerText ?? "",
        paletteText: palette?.innerText ?? "",
      };
    })()`,
    (value) =>
      value.optionText.includes(commandName) &&
      !value.paletteText.includes("Invalid slash command") &&
      !value.paletteText.includes("Unknown slash command"),
  );
}

async function assertOnlyGoalCommandListed(backend, workspaceId, conversationId) {
  const result = await backend.post("/chat/commands/list", { conversationId, workspaceId });
  if (result.commands.length !== 1 || result.commands[0]?.name !== "/goal") {
    throw new Error(`slash command list is not /goal-only: ${JSON.stringify(result.commands)}`);
  }
}
