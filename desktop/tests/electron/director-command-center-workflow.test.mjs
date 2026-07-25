#!/usr/bin/env node
/* global console */

import { delimiter, join } from "node:path";
import process from "node:process";

import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import {
  assertArtifactsExcludeMarkers,
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
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "director-command-center";
const workflowTimeoutMs = 60_000;
const secretApprovalAnswer = "director-secret-scope";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/director-command-center-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
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
  context = await launchDirectorElectron(firstLaunchDir);
  let backend = await backendProbe(firstLaunchDir);
  const workspaceId = await openWorkspace(context.client);
  const initial = await subscribeFromRenderer(context.client);
  assertEqual(initial.workstreams.length, 0, "initial Director workstream count");

  const folderlessReceipt = await submitDirector(context.client, "Director create folderless.");
  assertEqual(folderlessReceipt.submit?.decision, "create_workstream", "folderless decision");
  const rootWorkstreamId = requiredString(
    folderlessReceipt.submit?.workstreamId,
    "folderless receipt workstream",
  );
  const resourceRequestId = requiredString(
    folderlessReceipt.submit?.resourceRequestId,
    "folderless receipt resource request",
  );
  const folderless = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.workstreams.some(
        (entry) =>
          entry.workstream.id === rootWorkstreamId &&
          entry.workstream.resourceScope.kind === "folderless" &&
          entry.workstream.status === "awaiting_resource",
      ) &&
      snapshot.unresolvedResourceRequests.some(
        (request) => request.id === resourceRequestId && request.workstreamId === rootWorkstreamId,
      ),
  );
  assertEqual(folderless.aggregates.awaitingResourceCount, 1, "folderless resource aggregate");

  await dispatchDirector(context.client, {
    kind: "resolve_resource_request",
    resolveResourceRequest: { requestId: resourceRequestId, workspaceId },
  });
  await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.unresolvedResourceRequests.length === 0 &&
      snapshot.workstreams.some(
        (entry) =>
          entry.workstream.id === rootWorkstreamId &&
          entry.workstream.resourceScope.kind === "folder" &&
          entry.workstream.resourceScope.folder?.workspaceId === workspaceId &&
          entry.workstream.resourceBindings.length === 1,
      ),
  );
  await selectWorkstream(context.client, rootWorkstreamId);

  await submitDirector(context.client, "Director send hold.");
  await waitForWorkstream(context.client, rootWorkstreamId, (workstream) =>
    Boolean(workstream.activeRunId),
  );
  await submitDirector(context.client, "Director queue next.");
  await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.queuedRunCount === 1 && workstream.activeRunId !== null,
  );
  await submitDirector(context.client, "Director steer now.");
  const delivered = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationID(rootWorkstreamId),
    (snapshot) =>
      snapshot.queue.length === 0 &&
      snapshot.turns.turns.length === 2 &&
      snapshot.turns.turns.every((turn) => turn.status === "completed"),
  );
  assertEqual(
    delivered.turns.turns[1]?.authoredInput.text,
    "director queued",
    "promoted queued Director work",
  );
  await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.activeRunId === null && workstream.queuedRunCount === 0,
  );

  await submitDirector(context.client, "Director send cancel hold.");
  const cancellable = await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.activeRunId !== null,
  );
  const cancelledRunId = requiredString(cancellable.activeRunId, "cancellable Director run");
  await dispatchDirector(context.client, {
    cancelRun: { runId: cancelledRunId, workstreamId: rootWorkstreamId },
    kind: "cancel_run",
  });
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationID(rootWorkstreamId),
    (snapshot) =>
      snapshot.turns.turns.some(
        (turn) => turn.id === cancelledRunId && turn.status === "cancelled",
      ),
  );
  await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.activeRunId === null,
  );

  await submitDirector(context.client, "Director request approval.");
  const approvalSnapshot = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.unresolvedApprovals.length === 1 &&
      snapshot.unresolvedApprovals[0]?.workstreamId === rootWorkstreamId,
  );
  const approvalId = requiredString(
    approvalSnapshot.unresolvedApprovals[0]?.id,
    "Director approval",
  );
  await dispatchDirector(context.client, {
    kind: "resolve_approval",
    resolveApproval: {
      answers: [{ answers: [secretApprovalAnswer], questionId: "scope" }],
      approvalId,
      decision: "answered",
    },
  });
  const approved = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationID(rootWorkstreamId),
    (snapshot) =>
      snapshot.trajectory.events.some(
        (event) =>
          event.kind === "approval_resolved" &&
          event.approvalResolved?.resolution.approvalId === approvalId,
      ) && snapshot.turns.turns.at(-1)?.status === "completed",
  );
  const durableApproval = approved.trajectory.events.find(
    (event) =>
      event.kind === "approval_resolved" &&
      event.approvalResolved?.resolution.approvalId === approvalId,
  )?.approvalResolved?.resolution;
  assertEqual(durableApproval?.secretsRedacted, true, "secret approval redaction marker");
  assertEqual(durableApproval?.answers.length, 0, "durable secret approval answers");
  assertExcludes(JSON.stringify(approved), secretApprovalAnswer, "conversation trajectory");
  await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.unresolvedApprovals.length === 0 &&
      snapshot.workstreams.some(
        (entry) =>
          entry.workstream.id === rootWorkstreamId &&
          entry.workstream.activeRunId === null &&
          entry.workstream.unresolvedApprovalCount === 0,
      ),
  );

  await submitDirector(context.client, "Director fail.");
  const failed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationID(rootWorkstreamId),
    (snapshot) => snapshot.turns.turns.at(-1)?.status === "failed",
  );
  const firstFailedRunId = requiredString(failed.turns.turns.at(-1)?.id, "failed Director run");
  await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.status === "failed" && workstream.activeRunId === null,
  );
  await submitDirector(context.client, "Director recover.");
  const recovered = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationID(rootWorkstreamId),
    (snapshot) =>
      snapshot.turns.turns.filter((turn) => turn.authoredInput.text === "director fail").length ===
        2 && snapshot.turns.turns.at(-1)?.status === "completed",
  );
  assertEqual(
    recovered.turns.turns.at(-1)?.authoredInput.text,
    failed.turns.turns.at(-1)?.authoredInput.text,
    "recovered authored input",
  );
  if (recovered.turns.turns.at(-1)?.id === firstFailedRunId) {
    throw new Error("Director recovery reused the failed run id");
  }
  await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.status === "completed" && workstream.activeRunId === null,
  );

  const repaired = await submitDirector(context.client, "Director repair malformed.");
  assertEqual(repaired.submit?.decision, "answer_directly", "repaired decision");
  assertEqual(
    repaired.submit?.publicText,
    "The malformed decision was repaired.",
    "repaired public answer",
  );
  assertExcludes(JSON.stringify(repaired), "not_a_director_decision", "Director receipt");

  const childReceipt = await submitDirector(context.client, "Director create child.");
  assertEqual(childReceipt.submit?.decision, "create_workstream", "child decision");
  const childWorkstreamId = requiredString(
    childReceipt.submit?.workstreamId,
    "child receipt workstream",
  );
  const childConversationId = conversationID(childWorkstreamId);
  await waitForDirectorSnapshot(context.client, (snapshot) =>
    snapshot.workstreams.some(
      (entry) =>
        entry.workstream.id === childWorkstreamId &&
        entry.workstream.parentId === rootWorkstreamId &&
        entry.workstream.status === "completed",
    ),
  );
  const childConversation = await waitForConversationSnapshot(
    backend,
    workspaceId,
    childConversationId,
    (snapshot) =>
      snapshot.turns.turns.length === 1 && snapshot.turns.turns[0]?.status === "completed",
  );
  assertEqual(
    childConversation.turns.turns[0]?.authoredInput.text,
    "director child work",
    "child first input",
  );
  const branch = await readBranch(backend, workspaceId, childConversationId);
  assertEqual(branch.kind, "child", "Director child branch kind");
  assertEqual(branch.decisionSource, "director", "Director child decision source");
  assertEqual(branch.forkedAtTurnId, "", "Director child fork point");
  assertEqual(Object.keys(branch.providerMetadata).length, 0, "Director child provider metadata");

  await selectWorkstream(context.client, childWorkstreamId);
  await submitDirector(context.client, "Director artifact.");
  const beforeRestart = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.selectedWorkstreamId === childWorkstreamId &&
      snapshot.artifacts.some((artifact) => artifact.workstreamId === childWorkstreamId),
  );
  const rendererEvents = await readRendererEvents(context.client);
  assertDirectorEventSequence(initial.eventCursor, rendererEvents);
  assertEventKinds(rendererEvents, [
    "director.approval.updated",
    "director.artifact.updated",
    "director.graph.updated",
    "director.resource_request.updated",
    "director.selection.changed",
    "director.text.delta",
    "director.workstream.updated",
  ]);
  assertExcludes(JSON.stringify(rendererEvents), secretApprovalAnswer, "Director pushed events");
  assertExcludes(
    JSON.stringify({ events: rendererEvents, snapshot: beforeRestart }),
    "not_a_director_decision",
    "Director renderer state",
  );
  const durableBeforeRestart = comparableDirectorSnapshot(beforeRestart);
  await writeJson(join(artifactDir, "before-restart.json"), durableBeforeRestart);

  await stopElectronCdpContext(context);
  context = null;
  await assertArtifactsExcludeMarkers(
    firstLaunchDir,
    [secretApprovalAnswer, "not_a_director_decision"],
    "Director private routing state",
  );

  context = await launchDirectorElectron(secondLaunchDir);
  backend = await backendProbe(secondLaunchDir);
  const restoredWorkspaceId = await openWorkspace(context.client);
  assertEqual(restoredWorkspaceId, workspaceId, "restored Director workspace");
  const restored = await readDirectorSnapshot(context.client);
  const durableRestored = comparableDirectorSnapshot(restored);
  assertDeepEqual(durableRestored, durableBeforeRestart, "restored Director snapshot");
  await readBranch(backend, workspaceId, childConversationId);

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    childWorkstreamId,
    eventCount: rendererEvents.length,
    rootWorkstreamId,
    status: "passed",
    workspaceId,
  });
  console.log(`Electron Director command-center workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-director-snapshot.json"), {
      events: await readRendererEvents(context.client).catch(() => []),
      snapshot: await readDirectorSnapshot(context.client).catch(() => null),
    }).catch(() => {});
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

async function launchDirectorElectron(launchArtifactDir) {
  const launched = await launchElectronCdpContext({
    artifactDir: launchArtifactDir,
    extraEnv: launchEnvironment,
    fixture,
    visible: options.visible,
  });
  await waitForSelector(launched.client, '[data-testid="workspace-layout-area"]');
  await launched.client.installDriver();
  return launched;
}

async function openWorkspace(client) {
  const current = await client.evaluate(workspaceIdExpression());
  if (!validWorkspaceId(current)) {
    await openFixtureWorkspace(client, workflowTimeoutMs);
  }
  return waitForState(client, workspaceIdExpression(), validWorkspaceId, workflowTimeoutMs);
}

function workspaceIdExpression() {
  return `(() => document.querySelector('[data-testid="workspace-layout-area"]')?.getAttribute("data-workspace-id") ?? "")()`;
}

function validWorkspaceId(workspaceId) {
  return workspaceId !== "" && workspaceId !== "empty";
}

async function subscribeFromRenderer(client) {
  const snapshot = await readDirectorSnapshot(client);
  await client.evaluate(`(async () => {
    globalThis.__settaDirectorAuditEvents = [];
    globalThis.__settaDisposeDirectorAuditEvents?.();
    globalThis.__settaDisposeDirectorAuditEvents = window.setta.director.onEvent((event) => {
      globalThis.__settaDirectorAuditEvents.push(event);
    });
    await window.setta.director.subscribe({ cursor: ${JSON.stringify(snapshot.eventCursor)} });
  })()`);
  return snapshot;
}

function readDirectorSnapshot(client) {
  return client.evaluate("window.setta.director.readSnapshot()");
}

function readRendererEvents(client) {
  return client.evaluate("globalThis.__settaDirectorAuditEvents ?? []");
}

function waitForDirectorSnapshot(client, ready) {
  return waitForBackendState(() => readDirectorSnapshot(client), ready, workflowTimeoutMs);
}

async function waitForWorkstream(client, workstreamId, ready) {
  const snapshot = await waitForDirectorSnapshot(client, (candidate) => {
    const workstream = candidate.workstreams.find(
      (entry) => entry.workstream.id === workstreamId,
    )?.workstream;
    return Boolean(workstream && ready(workstream));
  });
  return snapshot.workstreams.find((entry) => entry.workstream.id === workstreamId).workstream;
}

function dispatchDirector(client, intent) {
  return client.evaluate(`window.setta.director.dispatch(${JSON.stringify(intent)})`);
}

function submitDirector(client, text) {
  return dispatchDirector(client, {
    kind: "submit",
    submit: { modality: "text", text },
  });
}

function selectWorkstream(client, workstreamId) {
  return dispatchDirector(client, {
    kind: "select_workstream",
    selectWorkstream: { workstreamId },
  });
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}

async function readBranch(backend, workspaceId, conversationId) {
  const page = await backend.post("/conversations/navigator/list", {
    cursor: null,
    limit: 50,
    query: "",
    workspaceId,
  });
  const item = page.items.find((candidate) => candidate.conversation.id === conversationId);
  if (!item?.branch) {
    throw new Error(`navigator omitted Director child branch ${conversationId}`);
  }
  return item.branch;
}

function conversationID(workstreamId) {
  const prefix = "workstream:";
  if (!workstreamId.startsWith(prefix) || workstreamId.length === prefix.length) {
    throw new Error(`unexpected workstream identity ${workstreamId}`);
  }
  return workstreamId.slice(prefix.length);
}

function assertDirectorEventSequence(cursor, events) {
  if (events.length === 0) {
    throw new Error("Director renderer subscription delivered no events");
  }
  let expected = cursor.sequence + 1;
  for (const event of events) {
    if (event.kind === "director.resync_required") {
      throw new Error(`Director renderer subscription required resync: ${JSON.stringify(event)}`);
    }
    if (event.streamId !== cursor.streamId || event.sequence !== expected) {
      throw new Error(
        `Director renderer event sequence drifted: ${JSON.stringify({
          actual: `${event.streamId}:${event.sequence}`,
          expected: `${cursor.streamId}:${expected}`,
        })}`,
      );
    }
    expected += 1;
  }
}

function assertEventKinds(events, requiredKinds) {
  const actual = new Set(events.map((event) => event.kind));
  const missing = requiredKinds.filter((kind) => !actual.has(kind));
  if (missing.length > 0) {
    throw new Error(`Director renderer events omitted kinds: ${missing.join(", ")}`);
  }
}

function comparableDirectorSnapshot(snapshot) {
  return {
    artifacts: snapshot.artifacts,
    graphs: snapshot.graphs,
    selectedWorkstreamId: snapshot.selectedWorkstreamId,
    unresolvedApprovals: snapshot.unresolvedApprovals,
    unresolvedResourceRequests: snapshot.unresolvedResourceRequests,
    workstreams: snapshot.workstreams,
  };
}

function requiredString(value, label) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} was missing: ${JSON.stringify(value)}`);
  }
  return value;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} = ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed: ${JSON.stringify({ actual, expected }, null, 2)}`);
  }
}

function assertExcludes(value, marker, label) {
  if (value.includes(marker)) {
    throw new Error(`${label} exposed ${JSON.stringify(marker)}`);
  }
}
