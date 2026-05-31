import { rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { assertNoCriticalDiagnostics } from "./chat-workflow-assertions.mjs";
import { prepareLiveCodexEnv } from "./chat-live-env.mjs";

export async function runLiveCodexWorkflow(results, deps) {
  const {
    assertAssistantCompleted,
    assertNoActiveRun,
    assertNoVisibleUserMessage,
    assertRecordingEvidence,
    backendProbe,
    captureScreenshot,
    createChat,
    createFixture,
    failureWithLogs,
    launchContext,
    liveWorkflowTimeoutMs,
    openWorkspace,
    recordingRoot,
    repoRoot,
    stopElectron,
    submitComposer,
    waitForAssistantTextRendered,
    waitForCommandResult,
    waitForGoalStatus,
    waitForLinkedCodexRef,
    waitForRunStatus,
    waitForRunWithPrompt,
    waitForTexts,
  } = deps;

  const liveEnv = await prepareLiveCodexEnv(repoRoot);
  if (!liveEnv) {
    results.push("live-codex-electron-skipped-no-openai-api-key");
    process.stdout.write(
      "Electron chat workflow skipped: live-codex-electron (OPENAI_API_KEY absent in .env)\n",
    );
    return;
  }
  const fixture = await createFixture("live-codex");
  const recordingDir = join(recordingRoot, "live-codex");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: liveEnv.env,
    harness: "codex",
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    const conversationId = await createChat(context.client, backend, workspaceId);
    const liveGoalPrompt =
      "Reply with one short sentence containing the exact phrase setta live goal smoke.";
    await submitComposer(context.client, `/goal ${liveGoalPrompt}`, "Send message");
    await waitForCommandResult(
      backend,
      workspaceId,
      conversationId,
      `Goal set: ${liveGoalPrompt}`,
      liveWorkflowTimeoutMs,
    );
    await waitForTexts(context.client, [`Goal set: ${liveGoalPrompt}`]);
    await waitForLinkedCodexRef(backend, workspaceId, conversationId, liveWorkflowTimeoutMs);
    const goalRun = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      liveGoalPrompt,
      null,
    );
    await waitForRunStatus(
      backend,
      workspaceId,
      conversationId,
      goalRun.id,
      "completed",
      liveWorkflowTimeoutMs,
    );
    await assertAssistantCompleted(backend, workspaceId, conversationId, goalRun.id);
    await waitForGoalStatus(
      backend,
      workspaceId,
      conversationId,
      "complete",
      liveWorkflowTimeoutMs,
    );
    await waitForTexts(context.client, ["setta live goal smoke"]);
    await waitForTexts(context.client, ["Goal complete"]);
    await assertNoVisibleUserMessage(context.client, liveGoalPrompt);
    await submitComposer(context.client, "/goal clear", "Send message");
    await waitForCommandResult(
      backend,
      workspaceId,
      conversationId,
      "Goal cleared.",
      liveWorkflowTimeoutMs,
    );
    await waitForGoalStatus(backend, workspaceId, conversationId, null, liveWorkflowTimeoutMs);
    await submitComposer(
      context.client,
      "Reply with one short sentence containing the exact phrase setta live electron smoke.",
      "Send message",
    );
    const run = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      "Reply with one short sentence containing the exact phrase setta live electron smoke.",
      null,
    );
    await waitForRunStatus(
      backend,
      workspaceId,
      conversationId,
      run.id,
      "completed",
      liveWorkflowTimeoutMs,
    );
    await assertNoActiveRun(backend, workspaceId, conversationId);
    await assertAssistantCompleted(backend, workspaceId, conversationId, run.id);
    await waitForAssistantTextRendered(context.client, liveWorkflowTimeoutMs);
    await assertNoCriticalDiagnostics(backend, workspaceId, conversationId);
    await captureScreenshot(context.client, join(recordingDir, "success.png"));
  } catch (error) {
    failure = error;
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
  } finally {
    context.client?.close();
    await stopElectron(context.electron);
    await rm(fixture.tempRoot, { force: true, recursive: true });
    await rm(liveEnv.codexHome, { force: true, recursive: true });
  }

  if (failure) {
    throw failureWithLogs(failure, context.electron.logs);
  }
  await assertRecordingEvidence(recordingDir, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/messages/page",
      "/chat/runs/active",
      "/chat/runs/list",
      "/chat/diagnostics/list",
      "/chat/commands/execute",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:send-message",
      "chat:execute-command",
    ],
  });
  results.push("live-codex-electron");
  process.stdout.write("Electron chat workflow passed: live-codex-electron\n");
}
