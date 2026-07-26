#!/usr/bin/env node
/* global console */

import { execFile } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

import { prepareLiveCodexAuth } from "./codex-chatgpt-auth.mjs";
import {
  conversationID,
  requiredString,
  waitForConversationSnapshot,
} from "./director-command-center-workflow-helpers.mjs";
import {
  assertBuildExists,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  waitForSelector,
} from "./electron-cdp-harness.mjs";
import { backendProbe, openFixtureWorkspace } from "./electron-workflow-harness.mjs";
import { submitDirector, waitForDirectorSnapshot } from "./hosted-director-workflow-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "live-codex-electron";
const workflowTimeoutMs = 8 * 60_000;
const createdMarker = "LIVE_ELECTRON_WORKSTREAM_READY";
const expectedMarker = "LIVE_ELECTRON_CODEX_OK";
const submittedMarker = "LIVE_ELECTRON_SUBMITTED";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/live-codex-electron-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const auth = await prepareLiveCodexAuth();
if (!auth.available) {
  console.log(`Live Codex Electron workflow skipped: ${auth.reason}`);
  process.exitCode = 77;
} else {
  await runLiveCodexElectron(auth);
}

async function runLiveCodexElectron(auth) {
  const fixture = await createElectronFixture(workflowName);
  const artifactDir = options.artifactDir || join(fixture.tempRoot, "recording");
  let context = null;
  try {
    context = await launchElectronCdpContext({
      artifactDir,
      extraEnv: auth.env,
      fixture,
      unsetEnv: auth.unsetEnv,
      visible: options.visible,
    });
    await waitForSelector(context.client, '[data-testid="director-command-center-shell"]');
    const backend = await backendProbe(artifactDir, context.client);
    const workspaceId = await openFixtureWorkspace(context.client, workflowTimeoutMs);
    await waitForSelector(context.client, '[data-testid="director-command-center-shell"]');

    const created = await submitDirector(
      context.client,
      "Create a new conversation titled Live Codex Electron in the currently open " +
        `workspace, and leave it idle. After it is created, answer exactly ${createdMarker} ` +
        "and no other text.",
      workflowTimeoutMs,
    );
    requireReplyMarker(created, createdMarker, "live Director create reply");
    requireSuccessfulTool(created, "list_workspaces");
    const workstreamId = requiredString(
      requireSuccessfulTool(created, "create_workstream").workstreamId,
      "live Director created workstream",
    );
    await waitForDirectorSnapshot(
      context.client,
      (snapshot) =>
        snapshot.selectedWorkstreamId === workstreamId &&
        snapshot.workstreams.some(
          (entry) =>
            entry.workstream.id === workstreamId &&
            entry.workstream.resourceScope.kind === "folder" &&
            entry.workstream.resourceScope.folder?.workspaceId === workspaceId &&
            entry.workstream.status === "idle",
        ),
      workflowTimeoutMs,
    );

    const submitted = await submitDirector(
      context.client,
      "Submit work to the selected workstream asking its agent to reply with exactly " +
        `${expectedMarker} and no other text. After the submit_work tool succeeds, ` +
        `answer exactly ${submittedMarker} and no other text.`,
      workflowTimeoutMs,
    );
    requireReplyMarker(submitted, submittedMarker, "live Director submit reply");
    const submittedCall = requireSuccessfulTool(submitted, "submit_work");
    if (submittedCall.workstreamId !== workstreamId) {
      throw new Error(
        `live Director submitted to ${JSON.stringify(submittedCall.workstreamId)}, ` +
          `want ${JSON.stringify(workstreamId)}`,
      );
    }

    const conversationId = conversationID(workstreamId);
    await waitForConversationSnapshot(
      backend,
      workspaceId,
      conversationId,
      (snapshot) =>
        snapshot.turns.turns.length === 1 &&
        snapshot.turns.turns[0]?.status === "completed" &&
        snapshot.trajectory.events.some((event) =>
          hasTerminalMarker(event.agentMessageCompleted?.text, expectedMarker),
        ) &&
        snapshot.narratorState.observedThroughSequence ===
          snapshot.conversation.lastTrajectorySequence,
      workflowTimeoutMs,
    );
    await waitForDirectorSnapshot(
      context.client,
      (snapshot) =>
        snapshot.workstreams.some(
          (entry) =>
            entry.workstream.id === workstreamId &&
            entry.workstream.activeRunId === null &&
            entry.workstream.status === "completed",
        ),
      workflowTimeoutMs,
    );
    console.log(`Live Codex Electron workflow passed: ${artifactDir}`);
  } finally {
    await stopElectronCdpContext(context);
    if (!options.keepArtifacts) {
      await executeTrash(fixture.tempRoot);
    }
  }
}

function requireSuccessfulTool(receipt, tool) {
  const call = receipt.submit?.toolCalls.find(
    (candidate) => candidate.tool === tool && candidate.succeeded,
  );
  if (!call) {
    throw new Error(
      `live Director omitted successful ${tool}: ${JSON.stringify(receipt.submit?.toolCalls)}`,
    );
  }
  return call;
}

function requireReplyMarker(receipt, marker, label) {
  if (!hasTerminalMarker(receipt.submit?.replyText, marker)) {
    throw new Error(`${label} = ${JSON.stringify(receipt.submit?.replyText)}, want ${marker}`);
  }
}

function hasTerminalMarker(text, marker) {
  return typeof text === "string" && text.trim().split(/\r?\n/u).at(-1)?.trim() === marker;
}

function executeTrash(path) {
  return new Promise((resolvePromise, reject) => {
    execFile("/usr/bin/trash", [path], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
}
