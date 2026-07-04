import { rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import {
  appendWorkflowState,
  assertNoActiveRun,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  createChat,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  stopElectron,
  submitComposer,
  waitForRunWithPrompt,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

export async function runPostCommitStartupFailureWorkflowLaunch(results, { recordingRoot }) {
  const fixture = await createFixture("post-commit-startup-failure");
  const recordingDir = join(recordingRoot, "post-commit-startup-failure");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      SETTA_E2E_CHAT_FAIL_FIRST_TRANSCRIPT_BLOCK_ID: "1",
    },
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    const conversationId = await createChat(context.client, backend, workspaceId);
    await submitComposer(context.client, "post commit startup failure", "Send message");
    const failedRun = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      "post commit startup failure",
      "failed",
    );
    if (!failedRun.error.includes("e2e injected transcript block id failure")) {
      throw new Error(`startup failure run had unexpected error: ${JSON.stringify(failedRun)}`);
    }
    await assertNoActiveRun(backend, workspaceId, conversationId);
    const pageAfterFailure = await backend.post("/chat/messages/page", {
      conversationId,
      limit: 20,
      workspaceId,
    });
    const failedAssistant = pageAfterFailure.messages.find(
      (message) => message.id === failedRun.assistantMessageId,
    );
    if (failedAssistant?.status !== "error") {
      throw new Error(
        `failed startup assistant status mismatch: ${JSON.stringify({
          failedAssistant,
          failedRun,
        })}`,
      );
    }

    await submitComposer(context.client, "after post commit startup failure", "Send message");
    const retryRun = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      "after post commit startup failure",
      "completed",
    );
    await waitForTexts(context.client, ["Scripted response: after post commit startup failure"]);
    await assertNoActiveRun(backend, workspaceId, conversationId);
    await appendWorkflowState(recordingDir, {
      failedRunId: failedRun.id,
      retryRunId: retryRun.id,
      type: "post_commit_startup_failure_verified",
    });
  } catch (error) {
    failure = error;
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
  } finally {
    context.client?.close();
    await stopElectron(context.electron);
    await rm(fixture.tempRoot, { force: true, recursive: true });
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
    ],
    ipcChannels: ["workspace:open-local-folder", "chat:create-conversation", "chat:send-message"],
    expectedIpcFailures: [
      (entry) =>
        entry.channel === "chat:send-message" &&
        typeof entry.error?.message === "string" &&
        entry.error.message.includes("e2e injected transcript block id failure"),
    ],
  });
  results.push("post-commit-startup-failure");
  process.stdout.write("Electron chat workflow passed: post-commit-startup-failure\n");
}
