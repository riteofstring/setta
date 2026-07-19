#!/usr/bin/env node
/* global console */

import { delimiter, join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  openFixtureWorkspace,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import {
  assertDriverAction,
  conversationSurfaces,
  createTopic,
} from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-artifact-unresolved";
const workflowTimeoutMs = 30_000;
const unresolvedArtifactText = "Use supplied incomplete artifact without retry.";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/topic-conversation-artifact-unresolved.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const backend = await backendProbe(artifactDir);
  const workspaceId = await openWorkspace(context.client);
  const topic = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Artifact unresolved topic",
    workflowTimeoutMs,
  );

  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: topic.id,
      text: unresolvedArtifactText,
    }),
    "submitted",
  );
  const failedSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    topic.id,
    unresolvedDeliverySnapshot,
  );
  const failedSurface = await waitForConversationSurface(
    context.client,
    topic.id,
    (surface) => surface.state === "complete" && surface.status === "failed",
  );
  await captureScreenshot(context.client, join(artifactDir, "artifact-unresolved.png"));
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    conversationId: topic.id,
    status: "passed",
    surface: failedSurface,
    turn: failedSnapshot.turns.turns.find(
      (turn) => turn.authoredInput.text === unresolvedArtifactText,
    ),
    workflowName,
  });
  console.log(`Electron artifact unresolved workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
}

async function openWorkspace(client) {
  const initial = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => state.openButtonReady || validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  if (!validWorkspaceId(initial.workspaceId)) {
    await openFixtureWorkspace(client, workflowTimeoutMs);
  }
  const opened = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  return opened.workspaceId;
}

function validWorkspaceId(workspaceId) {
  return workspaceId !== "" && workspaceId !== "empty";
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    async () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}

async function waitForConversationSurface(client, conversationId, ready) {
  const state = await waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (candidate) => {
      const surface = conversationSurfaces(candidate.surfaces, conversationId)[0];
      return Boolean(surface && ready(surface));
    },
    workflowTimeoutMs,
  );
  return conversationSurfaces(state.surfaces, conversationId)[0];
}

function unresolvedDeliverySnapshot(snapshot) {
  const turn = snapshot.turns.turns.find(
    (candidate) => candidate.authoredInput.text === unresolvedArtifactText,
  );
  return (
    snapshot.conversation.status === "failed" &&
    turnHasUnresolvedArtifactFailure(turn) &&
    snapshot.artifacts.artifacts.length === 0 &&
    hasArtifactToolFailure(snapshot) &&
    hasDiagnosticAgentProse(snapshot) &&
    hasUnresolvedTurnFailure(snapshot)
  );
}

function turnHasUnresolvedArtifactFailure(turn) {
  return (
    turn?.status === "failed" &&
    turn.error?.code === "artifact_delivery_unresolved" &&
    turn.error.retryable === true
  );
}

function hasArtifactToolFailure(snapshot) {
  return snapshot.trajectory.events.some(
    (event) =>
      event.kind === "activity_failed" &&
      event.activityFailed?.activity?.kind === "dynamic_tool" &&
      event.activityFailed.activity.namespace === "setta" &&
      event.activityFailed.activity.tool === "emit_artifact" &&
      event.activityFailed.failure?.code === "missing_required_fields",
  );
}

function hasDiagnosticAgentProse(snapshot) {
  return snapshot.trajectory.events.some(
    (event) =>
      event.kind === "agent_message_completed" &&
      event.agentMessageCompleted?.text ===
        "Completed supplied incomplete artifact after prose fallback.",
  );
}

function hasUnresolvedTurnFailure(snapshot) {
  return snapshot.trajectory.events.some(
    (event) =>
      event.kind === "turn_failed" &&
      event.actor === "system" &&
      event.turnFailed?.failure?.code === "artifact_delivery_unresolved",
  );
}
