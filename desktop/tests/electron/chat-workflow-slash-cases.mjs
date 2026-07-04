import {
  assertNoCriticalDiagnostics,
  clickModelByText,
  clickReasoningEffortByText,
  dispatchDocumentEscape,
  waitForComposerFocus,
  waitForModelPicker,
  waitForModelPickerAbsent,
  waitForSelectedModel,
  waitForSelectedReasoningEffort,
} from "./chat-workflow-assertions.mjs";

export async function runSlashCommandWorkflow({
  assertAssistantCompleted,
  assertChatLayout,
  assertNoActiveRun,
  assertNoLinkedCodexRef,
  assertNoRunWithPrompt,
  assertNoVisibleUserMessage,
  assertTextAbsent,
  assertTranscriptSequence,
  backend,
  clickButtonByAria,
  client,
  conversationId,
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
  await submitComposer(client, "/model", "Send message");
  await waitForModelPicker(waitForState, client);
  await clickModelByText(waitForState, client, "Scripted Careful");
  await waitForCommandResult(backend, workspaceId, conversationId, "Model set: scripted-careful");
  await assertNoLinkedCodexRef(backend, workspaceId, conversationId);
  await submitComposer(client, "/model", "Send message");
  await waitForModelPicker(waitForState, client);
  await clickReasoningEffortByText(waitForState, client, "High");
  await waitForCommandResult(backend, workspaceId, conversationId, "Reasoning set: High");
  await assertNoLinkedCodexRef(backend, workspaceId, conversationId);
  await submitComposer(client, "pre-turn model setting workflow", "Send message");
  const preTurnModelRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "pre-turn model setting workflow",
    "completed",
  );
  await assertAssistantCompleted(backend, workspaceId, conversationId, preTurnModelRun.id);
  await waitForTexts(client, [
    "Model for next turn: scripted-careful. Reasoning for next turn: High.",
  ]);

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

  await submitComposer(client, "/model", "Send message");
  await waitForModelPicker(waitForState, client);
  await clickModelByText(waitForState, client, "scripted-fast");
  await waitForCommandResult(backend, workspaceId, conversationId, "Model set: scripted-fast");
  await waitForTexts(client, ["Model set: scripted-fast"]);
  await submitComposer(client, "/model", "Send message");
  await waitForSelectedModel(waitForState, client, "scripted-fast");
  await waitForSelectedReasoningEffort(waitForState, client, "High");
  await clickReasoningEffortByText(waitForState, client, "High");
  await waitForCommandResult(backend, workspaceId, conversationId, "Reasoning set: High");
  await waitForTexts(client, ["Reasoning set: High"]);
  await submitComposer(client, "/model", "Send message");
  await waitForSelectedModel(waitForState, client, "scripted-fast");
  await waitForSelectedReasoningEffort(waitForState, client, "High");
  await waitForComposerFocus(waitForState, client);
  await clickButtonByAria(client, "Close model picker");
  await waitForModelPickerAbsent(waitForState, client);
  await submitComposer(client, "/model", "Send message");
  await waitForSelectedModel(waitForState, client, "scripted-fast");
  await dispatchDocumentEscape(client);
  await waitForModelPickerAbsent(waitForState, client);

  await submitComposer(client, "/model", "Send message");
  await waitForModelPicker(waitForState, client);
  await clickModelByText(waitForState, client, "Scripted Careful");
  await waitForCommandResult(backend, workspaceId, conversationId, "Model set: scripted-careful");
  await assertNoRunWithPrompt(backend, workspaceId, conversationId, "/model");
  await submitComposer(client, "model setting workflow", "Send message");
  const modelRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "model setting workflow",
    "completed",
  );
  await assertAssistantCompleted(backend, workspaceId, conversationId, modelRun.id);
  await waitForTexts(client, [
    "Model for next turn: scripted-careful. Reasoning for next turn: High.",
  ]);

  await submitComposer(client, "workflow hold for queue and steering", "Send message");
  const secondRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "workflow hold for queue and steering",
    "running",
  );
  await waitForText(client, "Workflow stream started.");
  await assertModelCommandDisabled(backend, workspaceId, conversationId);
  await assertTextAbsent(client, "Model set: scripted-ultra");
  await submitComposer(client, "finish after disabled model command", "Send steering message");
  await waitForTexts(client, [
    "Steered with finish after disabled model command.",
    "Active workflow complete.",
  ]);
  await waitForRunStatus(backend, workspaceId, conversationId, secondRun.id, "completed");
  await assertNoActiveRun(backend, workspaceId, conversationId);
  await assertTranscriptSequence(client, [
    "workflow hold for queue and steering",
    "Active workflow complete.",
    "Goal paused.",
    "Goal set: replacement after pause",
    "Goal resumed.",
    "Scripted response: replacement after pause",
    "Goal cleared.",
    "Model set: scripted-fast",
    "Reasoning set: High",
    "Model set: scripted-careful",
    "model setting workflow",
    "Model for next turn: scripted-careful. Reasoning for next turn: High.",
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

async function assertModelCommandDisabled(backend, workspaceId, conversationId) {
  const result = await backend.post("/chat/commands/list", { conversationId, workspaceId });
  const modelCommand = result.commands.find((command) => command.kind === "model");
  if (!modelCommand) {
    throw new Error(`model command was not listed: ${JSON.stringify(result.commands)}`);
  }
  if (
    modelCommand.available ||
    modelCommand.unavailableReason !== "model commands are unavailable while a run is active"
  ) {
    throw new Error(`model command was not disabled while active: ${JSON.stringify(modelCommand)}`);
  }
}
