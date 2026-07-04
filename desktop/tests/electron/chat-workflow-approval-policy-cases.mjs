import { rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

import {
  appendWorkflowState,
  assertAssistantCompleted,
  assertNoActiveRun,
  assertNoLinkedCodexRef,
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
  waitForRunStatus,
  waitForRunWithPrompt,
} from "./chat-workflow-harness.mjs";
import { installFakeCodexAppServer } from "./codex-protocol-workflow.mjs";

export async function runCodexApprovalPolicyRemovalWorkflowLaunch(results, { recordingRoot }) {
  const fixture = await createFixture("codex-approval-policy-removal");
  const fakeCodex = await installFakeCodexAppServer(fixture);
  const recordingDir = join(recordingRoot, "codex-approval-policy-removal");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_FAKE_CODEX_UNSUPPORTED_APPROVAL_POLICY_SOURCE: "thread-start-once",
    },
    harness: "codex",
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    const conversationId = await createChat(context.client, backend, workspaceId);

    await submitComposer(context.client, "unsupported approval policy workflow", "Send message");
    const failedRun = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      "unsupported approval policy workflow",
      null,
    );
    const terminalRun = await waitForRunStatus(
      backend,
      workspaceId,
      conversationId,
      failedRun.id,
      "failed",
    );
    if (!terminalRun.error.includes('unsupported approval policy "on-failure"')) {
      throw new Error(`failed run did not preserve unsupported policy error: ${terminalRun.error}`);
    }
    await assertNoActiveRun(backend, workspaceId, conversationId);
    await assertNoLinkedCodexRef(backend, workspaceId, conversationId);

    await submitComposer(
      context.client,
      "supported approval policy recovery workflow",
      "Send message",
    );
    const recoveryRun = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      "supported approval policy recovery workflow",
      null,
    );
    await waitForRunStatus(backend, workspaceId, conversationId, recoveryRun.id, "completed");
    await assertAssistantCompleted(backend, workspaceId, conversationId, recoveryRun.id);
    await captureScreenshot(context.client, join(recordingDir, "success.png"));
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
  });
  results.push("codex-approval-policy-removal");
  await appendWorkflowState(recordingDir, {
    name: "codex-approval-policy-removal",
    status: "passed",
  });
  process.stdout.write("Electron chat workflow passed: codex-approval-policy-removal\n");
}
