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
  reloadPage,
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
  listTopics,
} from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-archive";
const workflowTimeoutMs = 30_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/topic-conversation-archive-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
const firstLaunchDir = join(artifactDir, "first-launch");
const secondLaunchDir = join(artifactDir, "second-launch");
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const launchEnvironment = {
  PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
  SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
};
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir: firstLaunchDir,
    extraEnv: launchEnvironment,
    fixture,
    visible: options.visible,
  });
  await prepareRenderer(context.client);
  let backend = await backendProbe(firstLaunchDir);
  const workspaceId = await openWorkspace(context.client);
  const archivedTopic = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Archive this durable topic",
    workflowTimeoutMs,
  );
  const retainedTopic = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Retain this durable topic",
    workflowTimeoutMs,
  );

  assertDriverAction(
    await context.client.driver("topicConversationArchiveFromNavigator", {
      conversationId: archivedTopic.id,
    }),
    "archived",
  );
  const archivedSnapshot = await waitForArchivedBackendState(
    backend,
    workspaceId,
    archivedTopic.id,
  );
  await verifyRepeatedArchiveUnchanged(backend, workspaceId, archivedSnapshot);
  await verifyArchivedInputRejected(backend, archivedSnapshot);
  await verifyArchivedRendererState(context.client, archivedTopic.id, retainedTopic.id);
  await captureScreenshot(context.client, join(artifactDir, "archived-read-only-pane.png"));

  await reloadPage(context.client);
  await prepareRenderer(context.client);
  await verifyArchivedRendererState(context.client, archivedTopic.id, retainedTopic.id);

  await stopElectronCdpContext(context);
  context = null;
  context = await launchElectronCdpContext({
    artifactDir: secondLaunchDir,
    extraEnv: launchEnvironment,
    fixture,
    visible: options.visible,
  });
  await prepareRenderer(context.client);
  backend = await backendProbe(secondLaunchDir);
  const restoredWorkspaceId = await openWorkspace(context.client);
  assertEqual(restoredWorkspaceId, workspaceId, "restored archive workspace");
  const restoredSnapshot = await waitForArchivedBackendState(
    backend,
    workspaceId,
    archivedTopic.id,
  );
  await verifyArchivedRendererState(context.client, archivedTopic.id, retainedTopic.id);
  await captureScreenshot(context.client, join(artifactDir, "archived-after-restart.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    archivedAt: archivedSnapshot.conversation.archivedAt,
    archivedTopic,
    artifactDir,
    restoredArchivedAt: restoredSnapshot.conversation.archivedAt,
    retainedTopic,
    status: "passed",
    workspaceId,
  });
  console.log(`Electron topic conversation archive workflow passed: ${artifactDir}`);
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

async function prepareRenderer(client) {
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await client.installDriver();
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

async function waitForArchivedBackendState(backend, workspaceId, conversationId) {
  const snapshot = await waitForBackendState(
    () =>
      backend.post("/conversations/snapshot/read", {
        conversationId,
        workspaceId,
      }),
    (candidate) =>
      typeof candidate.conversation.archivedAt === "string" &&
      candidate.conversation.archivedAt === candidate.conversation.updatedAt,
    workflowTimeoutMs,
  );
  const page = await listTopics(backend, workspaceId);
  if (page.items.some((item) => item.conversation.id === conversationId)) {
    throw new Error(`archived conversation remained in navigator results: ${JSON.stringify(page)}`);
  }
  return snapshot;
}

async function verifyRepeatedArchiveUnchanged(backend, workspaceId, archivedSnapshot) {
  const repeated = await backend.post("/conversations/archive", {
    conversationId: archivedSnapshot.conversation.id,
    workspaceId,
  });
  assertEqual(
    repeated.conversation.archivedAt,
    archivedSnapshot.conversation.archivedAt,
    "repeated archive timestamp",
  );
  assertEqual(
    repeated.eventCursor.sequence,
    archivedSnapshot.eventCursor.sequence,
    "repeated archive event cursor",
  );
}

async function verifyArchivedInputRejected(backend, archivedSnapshot) {
  const response = await backend.request("POST", "/conversations/inputs/submit", {
    input: {
      conversationId: archivedSnapshot.conversation.id,
      id: "input-after-archive",
      modality: "text",
      replyToInputId: null,
      sourcePaneId: null,
      submittedAt: archivedSnapshot.conversation.archivedAt,
      text: "Archived conversations must reject new work",
    },
  });
  const payload = await response.json();
  assertEqual(response.status, 409, "archived input response status");
  assertEqual(
    payload?.error?.code,
    "conversation_input_state_conflict",
    "archived input error code",
  );
}

async function verifyArchivedRendererState(client, archivedConversationId, retainedConversationId) {
  const surfaces = await waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => {
      const archived = conversationSurfaces(state.surfaces, archivedConversationId);
      return (
        archived.length === 1 &&
        archived[0].archived &&
        archived[0].helperText === "Conversation archived" &&
        archived[0].inputDisabled
      );
    },
    workflowTimeoutMs,
  );
  const archived = conversationSurfaces(surfaces.surfaces, archivedConversationId)[0];
  if (!archived || !archived.archived || !archived.inputDisabled) {
    throw new Error(`archived pane remained writable: ${JSON.stringify(surfaces)}`);
  }
  await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", {
      conversationId: archivedConversationId,
    }),
    (state) => state.rowCount === 0 && state.openViewCount === 1,
    workflowTimeoutMs,
  );
  await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", {
      conversationId: retainedConversationId,
    }),
    (state) => state.rowCount === 1 && state.openViewCount === 1,
    workflowTimeoutMs,
  );
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} = ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}
