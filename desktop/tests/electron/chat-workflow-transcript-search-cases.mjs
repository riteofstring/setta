import { rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

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
  waitForState,
} from "./chat-workflow-harness.mjs";
import { installFakeCodexAppServer } from "./codex-protocol-workflow.mjs";

export async function runTranscriptSearchWorkflowLaunch(
  results,
  { recordingRoot, runHappyPathWorkflow, runWorkflowStep },
) {
  const fixture = await createFixture("transcript-search");
  const fakeCodex = await installFakeCodexAppServer(fixture);
  const recordingDir = join(recordingRoot, "transcript-search");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
    },
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir, context.client);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    await runWorkflowStep(results, recordingDir, "transcript-search", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runHappyPathWorkflow(context.client, backend, workspaceId, conversationId, {
        postCompletionActiveRun: false,
      });
      await runTranscriptSearchWorkflow(context.client);
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
      "/chat/messages/queue",
      "/chat/messages/steer",
      "/chat/runs/list",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:send-message",
      "chat:queue-message",
      "chat:steer-message",
    ],
  });
}

async function runTranscriptSearchWorkflow(client) {
  await openChatSearch(client);
  const lateAssistant = "Queued response for queued follow-up three from active run.";
  await setInputValue(client, 'input[placeholder="Search chat"]', lateAssistant);
  await waitForActiveSearchMessage(client, lateAssistant);

  const firstPrompt = "workflow hold for queue and steering";
  await setInputValue(client, 'input[placeholder="Search chat"]', firstPrompt);
  await waitForActiveSearchMessage(client, firstPrompt);
  await clickButtonByAria(client, "Close chat search");
  await waitForState(
    client,
    `(() => ({ open: Boolean(document.querySelector('input[placeholder="Search chat"]')) }))()`,
    (value) => !value.open,
  );
}

async function openChatSearch(client) {
  await client.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "f",
      metaKey: true,
    }));
  })()`);
  await waitForState(
    client,
    `(() => ({ open: Boolean(document.querySelector('input[placeholder="Search chat"]')) }))()`,
    (value) => value.open,
  );
}

async function waitForActiveSearchMessage(client, expectedText) {
  await waitForState(
    client,
    `(() => {
      const row = document.querySelector('[data-search-active="true"]');
      return {
        activeMessageId: row?.getAttribute("data-message-id") ?? "",
        text: row?.innerText ?? "",
      };
    })()`,
    (value) => value.text.includes(expectedText),
  );
}
