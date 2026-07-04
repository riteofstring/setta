import { rm } from "node:fs/promises";
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
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
    },
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
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
  });
}
