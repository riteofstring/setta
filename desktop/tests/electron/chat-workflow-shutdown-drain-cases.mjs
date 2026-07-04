import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import {
  assertChatLayout,
  assertNoActiveRun,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  createChat,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  stopLaunchedContext,
  submitComposer,
  waitForBackendState,
  waitForDriverState,
  waitForRunWithPrompt,
  waitForText,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

const shutdownDrainPrompt = "cancel active workflow";
const shutdownDrainError = "run interrupted by backend shutdown";

export async function runShutdownDrainWorkflow(results, { recordingRoot }) {
  const fixture = await createFixture("shutdown-drain");
  const firstRecording = join(recordingRoot, "shutdown-drain", "first-launch");
  const secondRecording = join(recordingRoot, "shutdown-drain", "second-launch");
  let first = null;
  let second = null;

  try {
    first = await launchContext(fixture, firstRecording);
    const interrupted = await startRunBeforeShutdown(first, fixture, firstRecording);
    await stopLaunchedContext(first);
    first = null;

    second = await launchContext(fixture, secondRecording);
    await assertShutdownDrainedRun(second, secondRecording, interrupted);
  } catch (error) {
    await captureShutdownDrainFailure(first, second, recordingRoot);
    throw failureWithLogs(error, [
      ...(first?.electron.logs ?? []),
      ...(second?.electron.logs ?? []),
    ]);
  } finally {
    await stopLaunchedContext(first);
    await stopLaunchedContext(second);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  await assertShutdownDrainRecordingEvidence(firstRecording, secondRecording);
  results.push("shutdown-drain");
  process.stdout.write("Electron chat workflow passed: shutdown-drain\n");
}

async function startRunBeforeShutdown(context, fixture, recordingDir) {
  const backend = await backendProbe(recordingDir);
  const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
  const conversationId = await createChat(context.client, backend, workspaceId);
  await submitComposer(context.client, shutdownDrainPrompt, "Send message");
  const activeRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    shutdownDrainPrompt,
    "running",
  );
  await waitForText(context.client, "Cancel workflow waiting.");
  await waitForActiveRunPresentation(context.client, activeRun.id);
  await captureScreenshot(context.client, join(recordingDir, "active-before-shutdown.png"));
  return { conversationId, runId: activeRun.id, workspaceId };
}

async function assertShutdownDrainedRun(context, recordingDir, interrupted) {
  const backend = await backendProbe(recordingDir);
  const drained = await waitForRunWithPrompt(
    backend,
    interrupted.workspaceId,
    interrupted.conversationId,
    shutdownDrainPrompt,
    "failed",
  );
  if (drained.id !== interrupted.runId || drained.error !== shutdownDrainError) {
    throw new Error(`shutdown-drained run mismatch: ${JSON.stringify(drained)}`);
  }
  await assertNoActiveRun(backend, interrupted.workspaceId, interrupted.conversationId);
  const page = await waitForShutdownDrainPage(backend, interrupted);
  assertShutdownDrainTranscript(page, interrupted.runId);
  await waitForTexts(context.client, [
    shutdownDrainPrompt,
    "Cancel workflow waiting.",
    shutdownDrainError,
  ]);
  await waitForShutdownDrainPresentation(context.client, interrupted.runId);
  await assertChatLayout(context.client);
  await captureScreenshot(context.client, join(recordingDir, "drained-after-restart.png"));
}

async function waitForShutdownDrainPage(backend, interrupted) {
  return waitForBackendState(
    async () =>
      backend.post("/chat/messages/page", {
        conversationId: interrupted.conversationId,
        limit: 40,
        workspaceId: interrupted.workspaceId,
      }),
    (page) => {
      const block = terminalRunStatusBlock(page, interrupted.runId);
      const assistant = assistantMessage(page, interrupted.runId);
      return (
        block?.status === "failed" &&
        block.runStatus?.mode === "failed" &&
        block.runStatus?.error === shutdownDrainError &&
        assistant?.status === "error" &&
        !hasStreamingBlock(page, interrupted.runId)
      );
    },
  );
}

function assertShutdownDrainTranscript(page, runId) {
  const terminal = terminalRunStatusBlock(page, runId);
  if (!isShutdownFailureRunStatusBlock(terminal)) {
    throw new Error(`shutdown terminal run_status block mismatch: ${JSON.stringify(page.blocks)}`);
  }
  if (hasStreamingBlock(page, runId)) {
    throw new Error(
      `shutdown-drained transcript retained streaming blocks: ${JSON.stringify(page.blocks)}`,
    );
  }
  const assistant = assistantMessage(page, runId);
  if (assistant?.status !== "error") {
    throw new Error(
      `shutdown-drained assistant message mismatch: ${JSON.stringify(page.messages)}`,
    );
  }
}

function isShutdownFailureRunStatusBlock(block) {
  return (
    block?.status === "failed" &&
    block.runStatus?.mode === "failed" &&
    block.runStatus?.error === shutdownDrainError
  );
}

function terminalRunStatusBlock(page, runId) {
  return page.blocks.find(
    (block) =>
      block.runId === runId && block.kind === "run_status" && block.runStatus?.mode !== "working",
  );
}

function hasStreamingBlock(page, runId) {
  return page.blocks.some((block) => block.runId === runId && block.status === "streaming");
}

function assistantMessage(page, runId) {
  return page.messages.find((message) => message.runId === runId && message.role === "assistant");
}

async function waitForActiveRunPresentation(client, runId) {
  await waitForDriverState(
    client,
    "runPresentation",
    { runId },
    (value) =>
      value.mode === "working" &&
      value.detailRunStatus === "running" &&
      value.liveHeadline &&
      value.stopEnabled,
  );
}

async function waitForShutdownDrainPresentation(client, runId) {
  await waitForDriverState(
    client,
    "runPresentation",
    { runId },
    (value) =>
      value.mode === "failed" &&
      value.text.includes(shutdownDrainError) &&
      value.detailRunStatus === "" &&
      value.detailLivenessStatus === "" &&
      !value.liveHeadline &&
      !value.stopEnabled,
    30_000,
  );
}

async function captureShutdownDrainFailure(first, second, recordingRoot) {
  await mkdir(join(recordingRoot, "shutdown-drain"), { recursive: true });
  await captureScreenshot(
    first?.client ?? second?.client,
    join(recordingRoot, "shutdown-drain", "failure.png"),
  ).catch(() => {});
}

async function assertShutdownDrainRecordingEvidence(firstRecording, secondRecording) {
  await assertRecordingEvidence(firstRecording, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/messages/page",
      "/chat/runs/list",
    ],
    ipcChannels: ["workspace:open-local-folder", "chat:create-conversation", "chat:send-message"],
  });
  await assertRecordingEvidence(secondRecording, {
    backendPaths: [
      "/workspace-session",
      "/chat/conversations/list",
      "/chat/messages/page",
      "/chat/runs/active",
      "/chat/runs/list",
    ],
    ipcChannels: ["workspace:session", "chat:list-conversations", "chat:message-page"],
  });
}
