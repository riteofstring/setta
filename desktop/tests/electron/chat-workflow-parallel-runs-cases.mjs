import { rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

import { installFakeCodexAppServer } from "./codex-protocol-workflow.mjs";
import {
  appendWorkflowState,
  assertNoActiveRun,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  clickButtonByAria,
  clickButtonContainingText,
  createChat,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  stopElectron,
  submitComposer,
  waitForBackendState,
  waitForRunStatus,
  waitForRunWithPrompt,
  waitForText,
} from "./chat-workflow-harness.mjs";

export async function runParallelRunsWorkflowLaunch(results, { recordingRoot }) {
  const fixture = await createFixture("parallel-runs");
  const fakeCodex = await installFakeCodexAppServer(fixture);
  const recordingDir = join(recordingRoot, "parallel-runs");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_FAKE_CODEX_PARALLEL_THREADS: "1",
    },
    harness: "codex",
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    await runParallelWorkflowStep(results, recordingDir, context.client, async () => {
      await runParallelRunsWorkflow(context.client, backend, workspaceId);
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
      "/chat/messages/steer",
      "/chat/runs/cancel",
      "/chat/runs/list",
      "/chat/conversations/list",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:send-message",
      "chat:steer-message",
      "chat:cancel-run",
    ],
  });
}

async function runParallelWorkflowStep(results, recordingDir, client, workflow) {
  try {
    await workflow();
    await captureScreenshot(client, join(recordingDir, "parallel-runs-success.png"));
  } catch (error) {
    await captureScreenshot(client, join(recordingDir, "parallel-runs-failure.png")).catch(
      () => {},
    );
    throw error;
  }
  results.push("parallel-runs");
  await appendWorkflowState(recordingDir, { name: "parallel-runs", status: "passed" });
  process.stdout.write("Electron chat workflow passed: parallel-runs\n");
}

async function runParallelRunsWorkflow(client, backend, workspaceId) {
  const firstConversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "parallel-runs: stall a", "Send message");
  const firstRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    firstConversationId,
    "parallel-runs: stall a",
    "running",
  );
  await waitForText(client, "Parallel A waiting.");
  const firstThreadId = await waitForConversationThreadId(
    backend,
    workspaceId,
    firstConversationId,
  );

  const secondConversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "parallel-runs: wait steer b", "Send message");
  const secondRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    secondConversationId,
    "parallel-runs: wait steer b",
    "running",
  );
  await waitForText(client, "Parallel B waiting.");
  const secondThreadId = await waitForConversationThreadId(
    backend,
    workspaceId,
    secondConversationId,
  );

  const thirdConversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "parallel-runs: finish c", "Send message");
  const thirdRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    thirdConversationId,
    "parallel-runs: finish c",
    "completed",
  );
  await waitForText(client, "Parallel C complete.");
  const thirdThreadId = await waitForConversationThreadId(
    backend,
    workspaceId,
    thirdConversationId,
  );
  assertDistinctParallelThreads([firstThreadId, secondThreadId, thirdThreadId]);

  await clickButtonContainingText(client, "parallel-runs: wait steer b");
  await submitComposer(client, "parallel-runs: steer b", "Send steering message");
  await waitForRunStatus(backend, workspaceId, secondConversationId, secondRun.id, "completed");
  await waitForText(client, "Parallel B steered.");
  await assertCommittedSteeringMessage(
    backend,
    workspaceId,
    secondConversationId,
    secondRun.id,
    "parallel-runs: steer b",
  );

  await clickButtonContainingText(client, "parallel-runs: stall a");
  await clickButtonByAria(client, "Stop run");
  await waitForRunStatus(backend, workspaceId, firstConversationId, firstRun.id, "cancelled");

  await waitForRunStatus(backend, workspaceId, thirdConversationId, thirdRun.id, "completed");
  await assertNoActiveRun(backend, workspaceId, firstConversationId);
  await assertNoActiveRun(backend, workspaceId, secondConversationId);
  await assertNoActiveRun(backend, workspaceId, thirdConversationId);
}

async function waitForConversationThreadId(backend, workspaceId, conversationId) {
  const ref = await waitForBackendState(async () => {
    const list = await backend.post("/chat/conversations/list", { workspaceId });
    const item = list.conversations.find(
      (candidate) => candidate.conversation.id === conversationId,
    );
    return (
      item?.conversation.harnessRefs.find(
        (candidate) =>
          candidate.harness === "codex" &&
          candidate.status === "linked" &&
          candidate.threadId !== "",
      ) ?? null
    );
  }, Boolean);
  return ref.threadId;
}

async function assertCommittedSteeringMessage(backend, workspaceId, conversationId, runId, text) {
  const page = await backend.post("/chat/messages/page", {
    beforeBlockOrdinal: 0,
    conversationId,
    limit: 100,
    workspaceId,
  });
  const message = page.messages.find((candidate) =>
    isCommittedSteeringMessage(candidate, runId, text),
  );
  if (!message) {
    throw new Error(`missing committed steering message ${text} for run ${runId}`);
  }
  const block = page.blocks.find((candidate) =>
    isCommittedSteeringBlock(candidate, runId, message.id, text),
  );
  if (!block) {
    throw new Error(`missing committed steering transcript block ${message.id} for run ${runId}`);
  }
}

function isCommittedSteeringMessage(candidate, runId, text) {
  return (
    candidate.runId === runId &&
    candidate.delivery === "steering" &&
    candidate.status === "complete" &&
    hasTextPart(candidate.parts, text)
  );
}

function isCommittedSteeringBlock(candidate, runId, messageId, text) {
  if (!isSteeringUserMessageBlock(candidate, runId, messageId)) {
    return false;
  }
  return hasTextPart(candidate.userMessage.parts, text);
}

function isSteeringUserMessageBlock(candidate, runId, messageId) {
  return (
    candidate.runId === runId &&
    candidate.kind === "user_message" &&
    candidate.userMessage?.messageId === messageId &&
    candidate.userMessage?.delivery === "steering" &&
    candidate.userMessage?.status === "complete"
  );
}

function hasTextPart(parts, text) {
  return parts?.some((part) => part.text?.text === text) === true;
}

function assertDistinctParallelThreads(threadIds) {
  const distinct = new Set(threadIds);
  if (distinct.size !== threadIds.length) {
    throw new Error(`parallel runs reused provider threads: ${JSON.stringify(threadIds)}`);
  }
}
