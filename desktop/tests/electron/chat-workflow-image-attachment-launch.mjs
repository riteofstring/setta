import { readFile, rm, truncate, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

import { runImageAttachmentWorkflow } from "./chat-workflow-image-attachment-cases.mjs";
import { installFakeCodexAppServer } from "./codex-protocol-workflow.mjs";
import {
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  clickButtonByAria,
  createChat,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  setInputValue,
  stopElectron,
  waitForRunWithPrompt,
  waitForState,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

export async function runImageAttachmentWorkflowLaunch(results, { recordingRoot }) {
  const fixture = await createFixture("image-attachment");
  const fakeCodex = await installFakeCodexAppServer(fixture);
  const recordingDir = join(recordingRoot, "image-attachment");
  const oversizedPath = join(fixture.tempRoot, "oversized-picker.png");
  await writeFile(oversizedPath, "");
  await truncate(oversizedPath, 20 * 1024 * 1024 + 1);
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_IMAGE_ATTACHMENT_PATHS: JSON.stringify([oversizedPath]),
    },
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    await runOversizedPickerImageAttachmentWorkflow({
      backend,
      client: context.client,
      conversationId: await createChat(context.client, backend, workspaceId),
      waitForState,
      waitForTexts,
      workspaceId,
    });
    await runImageAttachmentWorkflow({
      backend,
      clickButtonByAria,
      client: context.client,
      conversationId: await createChat(context.client, backend, workspaceId),
      setInputValue,
      waitForRunWithPrompt,
      waitForState,
      waitForTexts,
      workspaceId,
    });
    results.push("image-attachments");
    process.stdout.write("Electron chat workflow passed: image-attachments\n");
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
      "/chat/attachments/images/from-bytes",
      "/chat/messages/send",
      "/chat/messages/page",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:create-image-attachment-from-bytes",
      "chat:send-message",
    ],
    expectedIpcFailures: [
      (entry) =>
        entry.channel === "chat:select-image-attachments" &&
        typeof entry.error?.message === "string" &&
        entry.error.message.includes("maximum is 20971520"),
    ],
  });
  await assertOversizedPickerUsedPathEndpoint(recordingDir);
}

async function runOversizedPickerImageAttachmentWorkflow({
  backend,
  client,
  conversationId,
  waitForState,
  waitForTexts,
  workspaceId,
}) {
  await waitForTexts(client, ["New chat"]);
  await waitForState(
    client,
    `Boolean(document.querySelector('button[aria-label="Attach image"]:not([disabled])'))`,
    Boolean,
  );
  await client.evaluate(`document.querySelector('button[aria-label="Attach image"]').click()`);
  await waitForTexts(client, ["maximum is 20971520"]);
  const page = await backend.post("/chat/messages/page", {
    beforeBlockOrdinal: 0,
    conversationId,
    limit: 20,
    workspaceId,
  });
  if (page.messages.some((message) => message.parts.some((part) => part.type === "image"))) {
    throw new Error(`oversized picker image was persisted: ${JSON.stringify(page.messages)}`);
  }
}

async function assertOversizedPickerUsedPathEndpoint(recordingDir) {
  const backendHTTP = await readJsonLines(join(recordingDir, "backend-http.jsonl"));
  const pathResponses = backendHTTP.filter(
    (entry) =>
      entry.type === "backend_http_response" &&
      entry.url.includes("/chat/attachments/images/from-path"),
  );
  if (!pathResponses.some((entry) => entry.status === 400)) {
    throw new Error(
      `oversized picker did not fail through path endpoint: ${JSON.stringify(pathResponses)}`,
    );
  }
  const byteRequests = backendHTTP.filter(
    (entry) =>
      entry.type === "backend_http_request" &&
      entry.url.includes("/chat/attachments/images/from-bytes"),
  );
  if (byteRequests.length !== 1) {
    throw new Error(
      `expected only paste workflow to use from-bytes endpoint, saw ${byteRequests.length} requests`,
    );
  }
  const ipc = await readJsonLines(join(recordingDir, "ipc.jsonl"));
  if (
    !ipc.some(
      (entry) =>
        entry.type === "ipc_failure" &&
        entry.channel === "chat:select-image-attachments" &&
        typeof entry.error?.message === "string" &&
        entry.error.message.includes("maximum is 20971520"),
    )
  ) {
    throw new Error("oversized picker IPC failure was not recorded");
  }
}

async function readJsonLines(path) {
  const content = await readFile(path, "utf8");
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
