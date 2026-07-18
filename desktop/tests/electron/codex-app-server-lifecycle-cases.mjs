import { rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

import {
  appendWorkflowState,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  stopElectron,
} from "./chat-workflow-harness.mjs";
import {
  installFakeCodexAppServer,
  runProtocolMalformedAppServerLifecycleWorkflow,
} from "./codex-protocol-workflow.mjs";

export async function runCodexAppServerLifecycleWorkflowLaunch(results, { recordingRoot }) {
  const fixture = await createFixture("codex-app-server-lifecycle");
  const fakeCodex = await installFakeCodexAppServer(fixture);
  const recordingDir = join(recordingRoot, "codex-app-server-lifecycle");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
    },
    harness: "codex",
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    await runProtocolMalformedAppServerLifecycleWorkflow(
      context.client,
      backend,
      workspaceId,
      fixture,
    );
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
  results.push("codex-app-server-lifecycle");
  await appendWorkflowState(recordingDir, {
    name: "codex-app-server-lifecycle",
    status: "passed",
  });
  process.stdout.write("Electron chat workflow passed: codex-app-server-lifecycle\n");
}
