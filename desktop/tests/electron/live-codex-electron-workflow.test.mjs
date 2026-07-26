#!/usr/bin/env node
/* global console */

import { execFile } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import { prepareLiveCodexAuth } from "./codex-chatgpt-auth.mjs";
import {
  assertBuildExists,
  clickEnabledButtonByAria,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  waitForSelector,
  waitForState,
} from "./electron-cdp-harness.mjs";
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import {
  assertDriverAction,
  conversationSurfaces,
  createTopic,
} from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "live-codex-electron";
const workflowTimeoutMs = 240_000;
const expectedMarker = "LIVE_ELECTRON_CODEX_OK";

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
    await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
    await context.client.installDriver();
    const backend = await backendProbe(artifactDir, context.client);
    const workspaceId = await openWorkspace(context.client);
    const topic = await createTopic(
      context.client,
      backend,
      workspaceId,
      "Live Codex Electron",
      workflowTimeoutMs,
    );
    assertDriverAction(
      await context.client.driver("topicConversationSubmit", {
        conversationId: topic.id,
        text: `Reply with exactly ${expectedMarker} and no other text.`,
      }),
      "submitted",
    );
    await waitForConversationSurface(
      context.client,
      topic.id,
      (surface) =>
        surface.state === "complete" &&
        surface.status === "completed" &&
        surface.summaryText.includes(expectedMarker),
    );
    await waitForBackendState(
      () =>
        backend.post("/conversations/snapshot/read", {
          conversationId: topic.id,
          workspaceId,
        }),
      (candidate) =>
        candidate.turns.turns.length === 1 &&
        candidate.turns.turns[0]?.status === "completed" &&
        candidate.trajectory.events.some((event) =>
          event.agentMessageCompleted?.text.includes(expectedMarker),
        ) &&
        candidate.narratorState.observedThroughSequence ===
          candidate.conversation.lastTrajectorySequence,
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

async function openWorkspace(client) {
  const initial = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => state.openButtonReady || validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  if (!validWorkspaceId(initial.workspaceId)) {
    await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  }
  const opened = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  return opened.workspaceId;
}

function waitForConversationSurface(client, conversationId, ready) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => {
      const surface = conversationSurfaces(state.surfaces, conversationId)[0];
      return Boolean(surface && ready(surface));
    },
    workflowTimeoutMs,
  );
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

function validWorkspaceId(value) {
  return typeof value === "string" && value !== "";
}
