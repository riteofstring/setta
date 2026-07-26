#!/usr/bin/env node
/* global console */

import { readFile } from "node:fs/promises";
import { basename, delimiter, join } from "node:path";
import process from "node:process";

import {
  backendProbe,
  openFixtureWorkspace,
  waitForBackendState,
} from "./electron-workflow-harness.mjs";
import {
  assertArtifactsExcludeMarkers,
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  dispatchKeyEvent,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import { directorInventedSecretApprovalAnswer } from "./fixtures/fake-topic-codex-director-tools.mjs";

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
  const workspaceId = await openFixtureWorkspace(context.client, workflowTimeoutMs);
  await waitForSelector(context.client, '[data-testid="director-command-center-shell"]');
  const initial = await subscribeFromRenderer(context.client);
  assertEqual(initial.workstreams.length, 0, "initial Director workstream count");

  await submitDirectorInComposer(context.client, "Director create workspace workstream.");
  const created = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.workstreams.length === 1 &&
      snapshot.workstreams[0]?.workstream.resourceScope.kind === "folder" &&
      snapshot.workstreams[0]?.workstream.resourceScope.folder?.workspaceId === workspaceId &&
      snapshot.workstreams[0]?.workstream.status === "idle" &&
      snapshot.selectedWorkstreamId === snapshot.workstreams[0]?.workstream.id,
  );
  const rootWorkstreamId = requiredString(
    created.workstreams[0]?.workstream.id,
    "workspace-scoped Director workstream",
  );
  const projectedCreation = await waitForDirectorSnapshot(context.client, (snapshot) =>
    hasProjectedDirectorCreation(snapshot, rootWorkstreamId),
  );
  assertProjectedDirectorCreation(projectedCreation, rootWorkstreamId);
  const workspaceSettings = await verifyWorkspaceSettings(context.client, workspaceId);
  await verifyComposerQueuesWhileDirectorAnswers(context.client, fakeCodex.statePath);

  const normal = await submitDirector(context.client, "Director normal conversation.");
  assertEqual(
    normal.submit?.replyText,
    "The Director can answer without acting.",
    "Director normal reply",
  );
  assertEqual(normal.submit?.toolCalls.length, 0, "Director normal reply tool-call count");

  const remembered = await submitDirector(
    context.client,
    "Remember DIRECTOR_HISTORY_OK and acknowledge it.",
  );
  assertEqual(
    remembered.submit?.replyText,
    "I will remember DIRECTOR_HISTORY_OK.",
    "Director remembered reply",
  );
  assertEqual(remembered.submit?.toolCalls.length, 0, "Director remembered reply tool-call count");

  await submitDirector(context.client, "Director send hold.");
  await waitForWorkstream(context.client, rootWorkstreamId, (workstream) =>
    Boolean(workstream.activeRunId),
  );
  await assertRunningSummaryIsCurrent(context.client);
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
  const cancelTurn = await submitDirector(context.client, "Director cancel.");
  const cancelCall = cancelTurn.submit?.toolCalls.find(
    (call) => call.tool === "cancel_run" && call.succeeded,
  );
  assertEqual(cancelCall?.workstreamId, rootWorkstreamId, "Director cancel_run target");
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
  assertEqual(
    approvalSnapshot.unresolvedApprovals[0]?.questions[0]?.id,
    "scope",
    "Director approval question",
  );
  const refusedSecretTurn = await submitDirector(context.client, "Director try secret approval.");
  const refusedSecretCall = refusedSecretTurn.submit?.toolCalls.find(
    (call) => call.tool === "resolve_approval",
  );
  assertEqual(refusedSecretCall?.succeeded, false, "Director secret approval refusal");
  if (!refusedSecretCall?.summary.includes("secret only the user can supply")) {
    throw new Error(
      `Director secret approval refusal was not specific: ${JSON.stringify(refusedSecretCall)}`,
    );
  }
  await waitForDirectorSnapshot(context.client, (snapshot) =>
    snapshot.unresolvedApprovals.some((approval) => approval.id === approvalId),
  );
  await answerDirectorApprovalInRail(context.client, approvalId, "scope", secretApprovalAnswer);
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

  await submitDirector(context.client, "Director request command approval.");
  const commandApprovalSnapshot = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.unresolvedApprovals.length === 1 &&
      snapshot.unresolvedApprovals[0]?.workstreamId === rootWorkstreamId &&
      snapshot.unresolvedApprovals[0]?.secret === false,
  );
  const commandApprovalId = requiredString(
    commandApprovalSnapshot.unresolvedApprovals[0]?.id,
    "Director command approval",
  );
  const deniedTurn = await submitDirector(context.client, "Director deny command approval.");
  const deniedCall = deniedTurn.submit?.toolCalls.find(
    (call) => call.tool === "resolve_approval" && call.succeeded,
  );
  assertEqual(deniedCall?.workstreamId, rootWorkstreamId, "Director resolve_approval target");
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationID(rootWorkstreamId),
    (snapshot) =>
      snapshot.trajectory.events.some(
        (event) =>
          event.kind === "approval_resolved" &&
          event.approvalResolved?.resolution.approvalId === commandApprovalId &&
          event.approvalResolved?.resolution.decision === "denied",
      ) && snapshot.turns.turns.at(-1)?.status === "completed",
  );
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

  const folderlessTurn = await submitDirector(context.client, "Director create folderless.");
  const folderlessCall = folderlessTurn.submit?.toolCalls.find(
    (call) => call.tool === "create_workstream" && call.succeeded,
  );
  const folderlessWorkstreamId = requiredString(
    folderlessCall?.workstreamId,
    "folderless Director workstream",
  );
  const resourceSnapshot = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.selectedWorkstreamId === folderlessWorkstreamId &&
      snapshot.unresolvedResourceRequests.some(
        (request) => request.workstreamId === folderlessWorkstreamId,
      ),
  );
  const resourceRequestId = requiredString(
    resourceSnapshot.unresolvedResourceRequests.find(
      (request) => request.workstreamId === folderlessWorkstreamId,
    )?.id,
    "Director folder request",
  );
  const resolvedResourceTurn = await submitDirector(context.client, "Director resolve folder.");
  const resolvedResourceCall = resolvedResourceTurn.submit?.toolCalls.find(
    (call) => call.tool === "resolve_resource_request" && call.succeeded,
  );
  assertEqual(
    resolvedResourceCall?.workstreamId,
    folderlessWorkstreamId,
    "Director resolve_resource_request target",
  );
  await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      !snapshot.unresolvedResourceRequests.some((request) => request.id === resourceRequestId) &&
      snapshot.workstreams.some(
        (entry) =>
          entry.workstream.id === folderlessWorkstreamId &&
          entry.workstream.resourceScope.kind === "folder" &&
          entry.workstream.resourceScope.folder?.workspaceId === workspaceId &&
          entry.workstream.activeRunId === null,
      ),
  );

  const renamedTurn = await submitDirector(context.client, "Director rename selected.");
  const renamedCall = renamedTurn.submit?.toolCalls.find(
    (call) => call.tool === "rename_workstream" && call.succeeded,
  );
  assertEqual(renamedCall?.workstreamId, folderlessWorkstreamId, "Director rename target");
  await waitForWorkstream(
    context.client,
    folderlessWorkstreamId,
    (workstream) => workstream.title === "Resolved draft",
  );
  const renamedProjection = await waitForDirectorSnapshot(context.client, (snapshot) => {
    const graph = snapshot.graphs.find(
      (candidate) => candidate.workstreamId === folderlessWorkstreamId,
    );
    return graph?.nodes.some(
      (node) =>
        node.kind === "workstream" &&
        node.publicSummary === "Resolved draft" &&
        node.sourceEventIds.length >= 2,
    );
  });
  const renamedAnchor = renamedProjection.graphs
    .find((graph) => graph.workstreamId === folderlessWorkstreamId)
    ?.nodes.find((node) => node.kind === "workstream");
  assertEqual(renamedAnchor?.publicSummary, "Resolved draft", "renamed workstream anchor");

  const archivedTurn = await submitDirector(context.client, "Director archive selected.");
  const archivedCall = archivedTurn.submit?.toolCalls.find(
    (call) => call.tool === "archive_workstream" && call.succeeded,
  );
  assertEqual(archivedCall?.workstreamId, folderlessWorkstreamId, "Director archive target");
  await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.selectedWorkstreamId === null &&
      !snapshot.workstreams.some((entry) => entry.workstream.id === folderlessWorkstreamId) &&
      snapshot.aggregates.workstreamCount === 1,
  );
  await assertDirectorFocusIsConsistent(context.client);

  const selectedRootTurn = await submitDirector(context.client, "Director select root.");
  const selectedRootCall = selectedRootTurn.submit?.toolCalls.find(
    (call) => call.tool === "select_workstream" && call.succeeded,
  );
  assertEqual(selectedRootCall?.workstreamId, rootWorkstreamId, "Director select target");
  await waitForDirectorSnapshot(
    context.client,
    (snapshot) => snapshot.selectedWorkstreamId === rootWorkstreamId,
  );

  await submitDirector(context.client, "Director artifact.");
  const beforeRestart = await waitForDirectorSnapshot(context.client, (snapshot) => {
    const workstream = snapshot.workstreams.find(
      (entry) => entry.workstream.id === rootWorkstreamId,
    )?.workstream;
    return (
      snapshot.selectedWorkstreamId === rootWorkstreamId &&
      snapshot.artifacts.some(
        (artifact) => artifact.workstreamId === rootWorkstreamId && artifact.status === "available",
      ) &&
      workstream?.activeRunId === null &&
      workstream.status === "completed"
    );
  });
  const openedArtifact = beforeRestart.artifacts.find(
    (artifact) => artifact.workstreamId === rootWorkstreamId && artifact.status === "available",
  );
  const openedArtifactId = requiredString(openedArtifact?.id, "Director artifact");
  const artifactDetail = await openDirectorArtifactDetail(context.client, openedArtifactId);
  assertEqual(artifactDetail.status, "loaded", "Director artifact detail status");
  if (!artifactDetail.text.includes(openedArtifact.title)) {
    throw new Error(`Director artifact detail omitted title: ${JSON.stringify(artifactDetail)}`);
  }
  if (!artifactDetail.documentText.includes("-artifact.png")) {
    throw new Error(
      `Director artifact detail omitted rendered document: ${JSON.stringify(artifactDetail)}`,
    );
  }
  await closeDirectorArtifactDetail(context.client);
  const history = await readDirectorHistory(context.client);
  assertHistoryContainsOnlyUserAndTerminalTurns(history);
  await verifyRailsFlankTheCanvas(context.client);
  await verifyCompactRailFocusRestoration(context.client);
  const rendererEvents = await readRendererEvents(context.client);
  assertDirectorEventSequence(initial.eventCursor, rendererEvents);
  assertEventKinds(rendererEvents, [
    "director.approval.updated",
    "director.artifact.updated",
    "director.graph.updated",
    "director.resource_request.updated",
    "director.selection.changed",
    "director.text.delta",
    "director.workstream.removed",
    "director.workstream.updated",
  ]);
  assertGraphUpdates(rendererEvents, ["director", rootWorkstreamId]);
  assertExcludes(JSON.stringify(rendererEvents), secretApprovalAnswer, "Director pushed events");
  const durableBeforeRestart = comparableDirectorSnapshot(beforeRestart);
  await writeJson(join(artifactDir, "before-restart.json"), durableBeforeRestart);

  await stopElectronCdpContext(context);
  context = null;
  const privateApprovalMarkers = [directorInventedSecretApprovalAnswer, secretApprovalAnswer];
  await assertArtifactsExcludeMarkers(
    firstLaunchDir,
    privateApprovalMarkers,
    "Director private approval state",
  );
  await assertArtifactsExcludeMarkers(
    fixture.appDataDir,
    privateApprovalMarkers,
    "Director durable private approval state",
  );

  context = await launchDirectorElectron(secondLaunchDir);
  backend = await backendProbe(secondLaunchDir);
  const restoredWorkspaceId = await openFixtureWorkspace(context.client, workflowTimeoutMs);
  assertEqual(restoredWorkspaceId, workspaceId, "restored Director workspace");
  const restored = await readDirectorSnapshot(context.client);
  const durableRestored = comparableDirectorSnapshot(restored);
  assertDeepEqual(durableRestored, durableBeforeRestart, "restored Director snapshot");

  const recalled = await submitDirector(context.client, "What marker did I ask you to remember?");
  assertEqual(recalled.submit?.replyText, "DIRECTOR_HISTORY_OK", "replayed Director reply");
  assertEqual(recalled.submit?.toolCalls.length, 0, "replayed Director reply tool-call count");

  const createdAfterRestart = await submitDirector(
    context.client,
    "Director create workspace workstream.",
  );
  const createCall = createdAfterRestart.submit?.toolCalls.find(
    (call) => call.tool === "create_workstream" && call.succeeded,
  );
  const restartedWorkstreamId = requiredString(
    createCall?.workstreamId,
    "post-restart Director workstream",
  );
  if (restartedWorkstreamId === rootWorkstreamId) {
    throw new Error("post-restart Director tool call reused the original workstream");
  }
  await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.selectedWorkstreamId === restartedWorkstreamId &&
      snapshot.workstreams.some(
        (entry) =>
          entry.workstream.id === restartedWorkstreamId &&
          entry.workstream.resourceScope.folder?.workspaceId === workspaceId,
      ),
  );
  const providerLifecycle = await readProviderLifecycle(fakeCodex.statePath);

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    eventCount: rendererEvents.length,
    providerLifecycle,
    restartedWorkstreamId,
    rootWorkstreamId,
    status: "passed",
    workspaceSettings,
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
  await waitForSelector(launched.client, '[data-testid="director-command-center-shell"]');
  await launched.client.installDriver();
  return launched;
}

async function assertRunningSummaryIsCurrent(client) {
  const state = await waitForState(
    client,
    `(() => {
      const summary = document.querySelector(
        "#director-now-rail > .director-rail-section:first-child .director-rail-summary"
      );
      const status = document.querySelector(".director-selected-status");
      return {
        status: status?.textContent?.trim() ?? "",
        summary: summary?.textContent?.trim() ?? ""
      };
    })()`,
    (candidate) =>
      candidate.status === "Running" && !candidate.summary.includes("Waiting for a project folder"),
    workflowTimeoutMs,
  );
  assertExcludes(state.summary, "Waiting for a project folder", "running Now summary");
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

async function submitDirectorInComposer(client, text) {
  await waitForSelector(client, "#director-composer-input");
  const updated = await client.evaluate(`(() => {
    const input = document.querySelector("#director-composer-input");
    if (!(input instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: "missing-composer" };
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    );
    descriptor?.set?.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return { ok: true };
  })()`);
  if (!updated.ok) {
    throw new Error(`Director composer did not update: ${JSON.stringify(updated)}`);
  }
  const submitted = await client.evaluate(`(() => {
    const input = document.querySelector("#director-composer-input");
    if (!(input instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: "missing-composer" };
    }
    input.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter"
    }));
    return { ok: true };
  })()`);
  if (!submitted.ok) {
    throw new Error(`Director composer did not submit: ${JSON.stringify(submitted)}`);
  }
}

async function verifyComposerQueuesWhileDirectorAnswers(client, statePath) {
  const delayed = "Director delayed conversation.";
  const queued = "Director normal conversation.";
  const prepared = await client.evaluate(`(() => {
    const trigger = document.querySelector('button[aria-label="Open settings"]');
    if (!(trigger instanceof HTMLButtonElement)) {
      return false;
    }
    trigger.focus();
    return true;
  })()`);
  if (!prepared) {
    throw new Error("Director global typing check could not focus a shell control");
  }
  await dispatchKeyEvent(client, { code: "KeyD", key: "D", text: "D" });
  await dispatchKeyEvent(client, { code: "KeyD", key: "D", type: "keyUp" });
  await waitForState(
    client,
    `(() => {
      const input = document.querySelector("#director-composer-input");
      return {
        focused: document.activeElement === input,
        value: input instanceof HTMLTextAreaElement ? input.value : null
      };
    })()`,
    (state) => state.focused && state.value === "D",
    workflowTimeoutMs,
  );

  await submitDirectorInComposer(client, delayed);
  await waitForState(
    client,
    `(() => {
      const hint = document.querySelector(".director-composer-hint");
      const input = document.querySelector("#director-composer-input");
      return {
        answering: hint?.getAttribute("data-answering") === "true",
        disabled: input instanceof HTMLTextAreaElement ? input.disabled : null,
        focused: document.activeElement === input
      };
    })()`,
    (state) => state.answering && state.disabled === false && state.focused,
    workflowTimeoutMs,
  );
  await submitDirectorInComposer(client, queued);
  await waitForState(
    client,
    `(() => {
      const hint = document.querySelector(".director-composer-hint");
      const input = document.querySelector("#director-composer-input");
      const status = document.querySelector(".director-live-status");
      return {
        answering: hint?.getAttribute("data-answering") === "true",
        status: status?.textContent?.trim() ?? "",
        value: input instanceof HTMLTextAreaElement ? input.value : null
      };
    })()`,
    (state) =>
      state.answering === false &&
      state.status === "The Director can answer without acting." &&
      state.value === "",
    workflowTimeoutMs,
  );

  const providerState = JSON.parse(await readFile(statePath, "utf8"));
  const submitted = providerState.methodLog
    .filter((entry) => entry.method === "turn/start" && entry.isDirector === true)
    .map((entry) => entry.inputText)
    .filter((text) => text === delayed || text === queued)
    .slice(-2);
  assertDeepEqual(submitted, [delayed, queued], "queued Director composer turn order");
}

function submitDirector(client, text) {
  return dispatchDirector(client, {
    kind: "submit",
    submit: { modality: "text", text },
  });
}

async function assertDirectorFocusIsConsistent(client) {
  const focus = await waitForState(
    client,
    `(() => ({
      composerFocus:
        document.querySelector(".director-composer-hint-focus")?.textContent?.trim() ?? "",
      currentDots: document.querySelectorAll('.director-workstream-dot[aria-current="page"]').length,
      headingCount: document.querySelectorAll("h1").length,
      nowTitle: document.querySelector("#director-now-rail h2")?.textContent?.trim() ?? "",
      topMeta: document.querySelector(".director-focus-meta")?.textContent?.trim() ?? "",
      topTitle: document.querySelector(".director-focus-title")?.textContent?.trim() ?? ""
    }))()`,
    (state) =>
      state.composerFocus === "No workstream in focus" &&
      state.currentDots === 0 &&
      state.headingCount === 1 &&
      state.nowTitle === "Director" &&
      state.topMeta === "No workstream in focus" &&
      state.topTitle === "Director",
    workflowTimeoutMs,
  );
  assertDeepEqual(
    focus,
    {
      composerFocus: "No workstream in focus",
      currentDots: 0,
      headingCount: 1,
      nowTitle: "Director",
      topMeta: "No workstream in focus",
      topTitle: "Director",
    },
    "Director focus after selected workstream archive",
  );
}

async function readProviderLifecycle(statePath) {
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const starts = state.methodLog.filter((entry) => entry.method === "thread/start");
  const injections = state.methodLog.filter((entry) => entry.method === "thread/inject_items");
  const turns = state.methodLog.filter((entry) => entry.method === "turn/start");
  const retiredLifecycleCalls = state.methodLog.filter((entry) =>
    ["thread/fork", "thread/resume"].includes(entry.method),
  );
  if (starts.length === 0 || starts.some((entry) => entry.ephemeral !== true)) {
    throw new Error(`Setta provider carrier starts drifted: ${JSON.stringify(starts)}`);
  }
  if (retiredLifecycleCalls.length !== 0) {
    throw new Error(
      `Setta used retired provider lifecycle calls: ${JSON.stringify(retiredLifecycleCalls)}`,
    );
  }

  const directorStarts = starts.filter((entry) => entry.carrierKind === "director");
  const directorThreadIds = new Set(directorStarts.map((entry) => entry.threadId));
  const directorInjections = injections.filter(
    (entry) => entry.carrierKind === "director" && directorThreadIds.has(entry.threadId),
  );
  const directorTurns = turns.filter((entry) => entry.carrierKind === "director");
  if (
    directorStarts.length !== 2 ||
    new Set(directorStarts.map((entry) => entry.generation)).size !== 2
  ) {
    throw new Error(`Director provider starts drifted: ${JSON.stringify(directorStarts)}`);
  }
  if (directorInjections.length !== 2) {
    throw new Error(
      `Director provider replay lifecycle drifted: ${JSON.stringify(directorInjections)}`,
    );
  }
  if (
    directorTurns.length < 2 ||
    directorTurns.some((entry) => {
      const started = directorStarts.find((candidate) => candidate.generation === entry.generation);
      return started?.threadId !== entry.threadId;
    })
  ) {
    throw new Error(
      `Director turns did not stay on one provider thread per run: ${JSON.stringify(directorTurns)}`,
    );
  }
  const replayRoles = directorInjections[1]?.injectedRoles;
  if (
    !Array.isArray(replayRoles) ||
    !replayRoles.includes("user") ||
    !replayRoles.includes("assistant")
  ) {
    throw new Error(
      `Director restart omitted durable conversation roles: ${JSON.stringify(replayRoles)}`,
    );
  }

  const conversationStarts = starts.filter((entry) => entry.carrierKind === "conversation");
  const conversationThreadIds = new Set(conversationStarts.map((entry) => entry.threadId));
  const conversationInjections = injections.filter(
    (entry) => entry.carrierKind === "conversation" && conversationThreadIds.has(entry.threadId),
  );
  const conversationTurns = turns.filter((entry) => entry.carrierKind === "conversation");
  if (conversationStarts.length === 0) {
    throw new Error("Director workflow did not start a workstream conversation carrier");
  }
  assertCarrierReplayLifecycle(
    conversationStarts,
    conversationInjections,
    conversationTurns,
    "workstream conversation",
  );

  const sideStarts = starts.filter((entry) => entry.carrierKind === "side");
  const sideThreadIds = new Set(sideStarts.map((entry) => entry.threadId));
  const sideInjections = injections.filter(
    (entry) => entry.carrierKind === "side" && sideThreadIds.has(entry.threadId),
  );
  const sideTurns = turns.filter((entry) => entry.carrierKind === "side");
  assertCarrierReplayLifecycle(sideStarts, sideInjections, sideTurns, "side conversation");

  const invalidInjection = injections.find(
    (entry) => !["conversation", "director", "side"].includes(entry.carrierKind),
  );
  if (invalidInjection) {
    throw new Error(
      `provider replay targeted an invalid carrier: ${JSON.stringify(invalidInjection)}`,
    );
  }
  return {
    carrierCounts: Object.fromEntries(
      ["conversation", "director", "side", "structured"].map((kind) => [
        kind,
        starts.filter((entry) => entry.carrierKind === kind).length,
      ]),
    ),
    conversationThreadIds: [...conversationThreadIds],
    generations: directorStarts.map((entry) => entry.generation),
    replayRoles,
    directorThreadIds: directorStarts.map((entry) => entry.threadId),
    directorTurnCount: directorTurns.length,
  };
}

function assertCarrierReplayLifecycle(starts, injections, turns, label) {
  if (starts.length !== injections.length) {
    throw new Error(
      `${label} carrier replay count drifted: ${JSON.stringify({ injections, starts })}`,
    );
  }
  for (const start of starts) {
    const injected = injections.filter((entry) => entry.threadId === start.threadId);
    if (
      injected.length !== 1 ||
      injected[0].injectedItemCount < 2 ||
      injected[0].injectedRoles?.[0] !== "developer"
    ) {
      throw new Error(
        `${label} carrier omitted Setta replay: ${JSON.stringify({ injected, start })}`,
      );
    }
  }
  for (const turn of turns) {
    const start = starts.find((entry) => entry.threadId === turn.threadId);
    if (!start || start.generation !== turn.generation) {
      throw new Error(`${label} turn escaped its process-local carrier: ${JSON.stringify(turn)}`);
    }
  }
}

async function verifyWorkspaceSettings(client, workspaceId) {
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Open settings"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!opened) {
    throw new Error("Director command center omitted its Settings action");
  }
  await waitForSelector(client, '[data-testid="settings-shell-page"]');
  await client.evaluate(`document.querySelector("#settings-subtab-roles")?.click()`);
  await waitForSelector(client, '[data-testid="role-configuration-scope-settings"]');
  const result = await waitForState(
    client,
    `(() => {
      const select = document.querySelector('select[aria-label="AI role configuration scope"]');
      if (!(select instanceof HTMLSelectElement)) {
        return { ready: false };
      }
      const workspaceOption = Array.from(select.options).find(
        (option) => option.value === "workspace"
      );
      return {
        ready: Boolean(workspaceOption),
        workspaceLabel: workspaceOption?.textContent ?? "",
        workspaceValue: workspaceOption?.value ?? ""
      };
    })()`,
    (state) => state.ready,
    workflowTimeoutMs,
  );
  assertEqual(result.workspaceValue, "workspace", "workspace role scope option");
  if (!result.workspaceLabel.includes(basename(fixture.workspaceRoot))) {
    throw new Error(`workspace role scope omitted the active workspace: ${JSON.stringify(result)}`);
  }
  const closed = await client.evaluate(`(() => {
    const button = document.querySelector(".setta-settings-page-back");
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!closed) {
    throw new Error("Settings page omitted Back to command center");
  }
  await waitForSelector(client, '[data-testid="director-command-center-shell"]');
  return { ...result, workspaceId };
}

async function readDirectorHistory(client) {
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector(".director-history-open");
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!opened) {
    throw new Error("Director history action was unavailable");
  }
  await waitForSelector(client, ".director-history-dialog");
  const modal = await client.evaluate(`(() => {
    const background = document.querySelector(".director-command-center-content");
    const close = document.querySelector(
      '.director-history-dialog button[aria-label="Close history"]'
    );
    const dialog = document.querySelector('[role="dialog"].director-history-overlay');
    if (
      !(background instanceof HTMLElement) ||
      !(close instanceof HTMLButtonElement) ||
      !(dialog instanceof HTMLElement)
    ) {
      return { ready: false };
    }
    const focusedInitially = document.activeElement === close;
    close.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab"
    }));
    const focusedAfterTab = document.activeElement === close;
    close.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      shiftKey: true
    }));
    return {
      backgroundHidden: background.getAttribute("aria-hidden") === "true",
      backgroundInert: background.inert,
      focusedAfterShiftTab: document.activeElement === close,
      focusedAfterTab,
      focusedInitially,
      ready: true
    };
  })()`);
  assertDeepEqual(
    modal,
    {
      backgroundHidden: true,
      backgroundInert: true,
      focusedAfterShiftTab: true,
      focusedAfterTab: true,
      focusedInitially: true,
      ready: true,
    },
    "Director history focus isolation",
  );
  const history = await client.evaluate(`(() =>
    Array.from(document.querySelectorAll(".director-history-dialog-list li")).map((item) => ({
      kind: item.getAttribute("data-node-kind") ?? "",
      text: item.textContent?.trim() ?? ""
    }))
  )()`);
  await client.evaluate(
    `document.querySelector('.director-history-dialog button[aria-label="Close history"]')?.click()`,
  );
  await waitForState(
    client,
    `(() => {
      const background = document.querySelector(".director-command-center-content");
      const trigger = document.querySelector(".director-history-open");
      return {
        backgroundInert: background instanceof HTMLElement && background.inert,
        focusedTrigger: document.activeElement === trigger,
        overlayOpen: Boolean(document.querySelector(".director-history-overlay"))
      };
    })()`,
    (state) => !state.backgroundInert && state.focusedTrigger && !state.overlayOpen,
    workflowTimeoutMs,
  );
  return history;
}

/*
 * Above the phone breakpoint both rails sit beside the canvas and the canvas is
 * still the whole window. A narrow desktop window used to stack the rails into
 * full-width bars that covered the graph, which is the pane workspace the
 * command center replaced.
 */
async function verifyRailsFlankTheCanvas(client) {
  await client.call("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: 720,
    mobile: false,
    width: 900,
  });
  try {
    const layout = await waitForState(
      client,
      `(() => {
        const box = (selector) => {
          const node = document.querySelector(selector);
          if (!(node instanceof HTMLElement)) {
            return null;
          }
          const rect = node.getBoundingClientRect();
          return {
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width
          };
        };
        return {
          artifacts: box("#director-artifacts-rail"),
          canvas: box(".director-graph-canvas"),
          compact: matchMedia("(max-width: 760px)").matches,
          composer: box(".director-composer"),
          now: box("#director-now-rail"),
          viewportWidth: window.innerWidth
        };
      })()`,
      (state) =>
        state.compact === false &&
        state.artifacts !== null &&
        state.canvas !== null &&
        state.composer !== null &&
        state.now !== null,
      workflowTimeoutMs,
    );
    const described = JSON.stringify(layout);
    if (layout.now.right > layout.artifacts.left) {
      throw new Error(`Director rails stacked instead of flanking the canvas: ${described}`);
    }
    if (layout.now.width < 200 || layout.artifacts.width < 200) {
      throw new Error(`Director rails collapsed beside the canvas: ${described}`);
    }
    if (layout.canvas.width < layout.viewportWidth - 1) {
      throw new Error(`Director canvas was cut down to fit the rails: ${described}`);
    }
    if (layout.composer.top < layout.now.bottom - 1) {
      throw new Error(`Director composer overlapped the Now rail: ${described}`);
    }
  } finally {
    await client.call("Emulation.clearDeviceMetricsOverride");
  }
}

async function verifyCompactRailFocusRestoration(client) {
  await client.call("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: 844,
    mobile: true,
    width: 390,
  });
  try {
    await waitForState(
      client,
      `(() => ({
        compact: matchMedia("(max-width: 760px)").matches,
        triggerReady: Boolean(
          document.querySelector('button[aria-controls="director-now-rail"][aria-expanded="false"]')
        )
      }))()`,
      (state) => state.compact && state.triggerReady,
      workflowTimeoutMs,
    );
    const opened = await client.evaluate(`(() => {
      const trigger = document.querySelector(
        'button[aria-controls="director-now-rail"][aria-expanded="false"]'
      );
      if (!(trigger instanceof HTMLButtonElement)) {
        return false;
      }
      trigger.click();
      return true;
    })()`);
    if (!opened) {
      throw new Error("compact Now rail did not expose its disclosure button");
    }
    await waitForState(
      client,
      `(() => {
        const rail = document.querySelector("#director-now-rail");
        const trigger = document.querySelector('button[aria-controls="director-now-rail"]');
        return {
          expanded: trigger?.getAttribute("aria-expanded") === "true",
          visible: rail instanceof HTMLElement && getComputedStyle(rail).display !== "none"
        };
      })()`,
      (state) => state.expanded && state.visible,
      workflowTimeoutMs,
    );
    const escaped = await client.evaluate(`(() => {
      const railAction = document.querySelector("#director-now-rail .director-history-open");
      if (!(railAction instanceof HTMLButtonElement)) {
        return false;
      }
      railAction.focus();
      railAction.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape"
      }));
      return true;
    })()`);
    if (!escaped) {
      throw new Error("compact Now rail did not contain a focusable history action");
    }
    await waitForState(
      client,
      `(() => {
        const rail = document.querySelector("#director-now-rail");
        const trigger = document.querySelector('button[aria-controls="director-now-rail"]');
        return {
          collapsed: trigger?.getAttribute("aria-expanded") === "false",
          focusedTrigger: document.activeElement === trigger,
          hidden: rail instanceof HTMLElement && getComputedStyle(rail).display === "none"
        };
      })()`,
      (state) => state.collapsed && state.focusedTrigger && state.hidden,
      workflowTimeoutMs,
    );
    await verifyMinimumCompactWidth(client);
  } finally {
    await client.call("Emulation.clearDeviceMetricsOverride");
  }
}

async function verifyMinimumCompactWidth(client) {
  await client.call("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: 720,
    mobile: true,
    width: 320,
  });
  const layout = await waitForState(
    client,
    `(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!(node instanceof HTMLElement)) {
          return null;
        }
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };
      const title = document.querySelector(".director-focus-title");
      return {
        composer: rect(".director-composer"),
        controls: rect(".director-command-center-view-controls"),
        headingCount: document.querySelectorAll("h1").length,
        metaHidden:
          getComputedStyle(document.querySelector(".director-focus-meta")).display === "none",
        navigation: rect(".director-workstream-nav"),
        titleClipped:
          title instanceof HTMLElement ? title.scrollWidth > title.clientWidth + 1 : true,
        viewportWidth: window.innerWidth
      };
    })()`,
    (state) =>
      state.composer !== null &&
      state.controls !== null &&
      state.headingCount === 1 &&
      state.metaHidden &&
      state.navigation !== null &&
      !state.titleClipped &&
      state.viewportWidth === 320,
    workflowTimeoutMs,
  );
  const described = JSON.stringify(layout);
  if (layout.navigation.right > layout.controls.left + 1) {
    throw new Error(`Director compact navigation overlapped view controls: ${described}`);
  }
  if (layout.composer.left < 0 || layout.composer.right > layout.viewportWidth) {
    throw new Error(`Director compact composer escaped the viewport: ${described}`);
  }
}

function assertHistoryContainsOnlyUserAndTerminalTurns(history) {
  if (history.length === 0) {
    throw new Error("Director history omitted completed work");
  }
  const allowed = new Set(["user_goal", "completed", "failed", "cancelled"]);
  const unexpected = history.filter((item) => !allowed.has(item.kind));
  if (unexpected.length > 0) {
    throw new Error(`Director history exposed intermediate activity: ${JSON.stringify(history)}`);
  }
  if (!history.some((item) => item.kind === "completed" && item.text !== "Run completed")) {
    throw new Error(`Director history omitted a final response: ${JSON.stringify(history)}`);
  }
}

async function answerDirectorApprovalInRail(client, approvalId, questionId, answer) {
  const approvalSelector = `[data-approval-id="${approvalId}"]`;
  await waitForSelector(client, approvalSelector);
  const fieldSelector = `${approvalSelector} [name="${questionId}"]`;
  const updated = await client.evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(fieldSelector)});
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) {
      return { ok: false, reason: "missing-question" };
    }
    const valueDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value");
    valueDescriptor?.set?.call(field, ${JSON.stringify(answer)});
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  })()`);
  if (!updated.ok) {
    throw new Error(`Director approval rail did not update: ${JSON.stringify(updated)}`);
  }
  const answered = await client.evaluate(`(() => {
    const approval = document.querySelector(${JSON.stringify(approvalSelector)});
    if (!(approval instanceof HTMLElement)) {
      return { ok: false, reason: "missing-approval" };
    }
    const answerButton = Array.from(approval.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Answer" && !button.disabled
    );
    if (!(answerButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-answer-button" };
    }
    answerButton.click();
    return { ok: true };
  })()`);
  if (!answered.ok) {
    throw new Error(`Director approval rail did not submit: ${JSON.stringify(answered)}`);
  }
}

async function openDirectorArtifactDetail(client, artifactId) {
  await waitForSelector(client, `[data-artifact-id="${artifactId}"]`);
  const opened = await client.evaluate(`(() => {
    const artifact = Array.from(document.querySelectorAll("button[data-artifact-id]")).find(
      (candidate) => candidate.getAttribute("data-artifact-id") === ${JSON.stringify(artifactId)}
    );
    if (!(artifact instanceof HTMLButtonElement) || artifact.disabled) {
      return { ok: false, reason: artifact ? "disabled-artifact" : "missing-artifact" };
    }
    artifact.click();
    return { ok: true };
  })()`);
  if (!opened.ok) {
    throw new Error(`Director artifact did not open: ${JSON.stringify(opened)}`);
  }
  return waitForState(
    client,
    `(() => {
      const detail = Array.from(document.querySelectorAll(".director-artifact-detail")).find(
        (candidate) => candidate.getAttribute("data-artifact-id") === ${JSON.stringify(artifactId)}
      );
      const artifactDocument = detail?.querySelector(".director-artifact-document");
      return {
        documentText: artifactDocument?.textContent ?? "",
        status: detail?.getAttribute("data-artifact-load-state") ?? "",
        text: detail?.textContent ?? ""
      };
    })()`,
    (detail) => detail.status === "loaded" && detail.documentText.includes("-artifact.png"),
    workflowTimeoutMs,
  );
}

async function closeDirectorArtifactDetail(client) {
  const closed = await client.evaluate(`(() => {
    const button = document.querySelector(
      '.director-artifact-detail button[aria-label="Close artifact details"]'
    );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!closed) {
    throw new Error("Director artifact detail did not expose a close action");
  }
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
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

function assertGraphUpdates(events, requiredWorkstreamIds) {
  const actual = new Set(
    events
      .filter((event) => event.kind === "director.graph.updated")
      .map((event) => event.graphUpdated?.workstreamId),
  );
  const missing = requiredWorkstreamIds.filter((workstreamId) => !actual.has(workstreamId));
  if (missing.length > 0) {
    throw new Error(`Director pushed graph updates omitted: ${missing.join(", ")}`);
  }
}

function hasProjectedDirectorCreation(snapshot, workstreamId) {
  try {
    assertProjectedDirectorCreation(snapshot, workstreamId);
    return true;
  } catch {
    return false;
  }
}

function assertProjectedDirectorCreation(snapshot, workstreamId) {
  const lane = snapshot.graphs.find((graph) => graph.workstreamId === "director");
  const workstream = snapshot.graphs.find((graph) => graph.workstreamId === workstreamId);
  if (!lane || !workstream) {
    throw new Error(
      `Director creation omitted graph scopes: ${JSON.stringify({
        graphs: snapshot.graphs.map((graph) => graph.workstreamId),
        workstreamId,
      })}`,
    );
  }
  const request = requiredGraphNode(
    lane,
    (node) =>
      node.kind === "user_goal" && node.publicSummary === "Director create workspace workstream.",
    "Director creation request",
  );
  const listed = requiredGraphNode(
    lane,
    (node) => node.kind === "action" && node.publicSummary.includes("workspace(s) are open"),
    "Director list_workspaces call",
  );
  const created = requiredGraphNode(
    lane,
    (node) =>
      node.kind === "action" && node.publicSummary === 'Started the workstream "Director root".',
    "Director create_workstream call",
  );
  const decision = requiredGraphNode(
    lane,
    (node) =>
      node.kind === "director_decision" &&
      node.publicSummary === 'Started the workstream "Director root".',
    "Director create decision",
  );
  const reply = requiredGraphNode(
    lane,
    (node) =>
      node.kind === "milestone" && node.publicSummary === "Created and selected Director root.",
    "Director creation reply",
  );
  for (const [from, to, label] of [
    [request, listed, "request to list_workspaces"],
    [listed, created, "list_workspaces to create_workstream"],
    [created, decision, "create_workstream to decision"],
    [decision, reply, "decision to reply"],
  ]) {
    if (
      !lane.edges.some(
        (edge) =>
          edge.kind === "followed_by" && edge.fromNodeId === from.id && edge.toNodeId === to.id,
      )
    ) {
      throw new Error(`Director creation graph omitted ${label}: ${JSON.stringify(lane.edges)}`);
    }
  }
  const anchor = requiredGraphNode(
    workstream,
    (node) =>
      node.kind === "workstream" &&
      node.status === "active" &&
      node.publicSummary === "Director root",
    "created workstream anchor",
  );
  // The anchor's provenance is the durable conversation record, so it cites a
  // committed event and never a Director fact.
  if (
    anchor.sourceEventIds.length === 0 ||
    anchor.sourceEventIds.some((eventId) => eventId.startsWith("director-fact:"))
  ) {
    throw new Error(
      `workstream anchor did not carry committed provenance: ${JSON.stringify(anchor)}`,
    );
  }
}

function requiredGraphNode(graph, matches, label) {
  const node = graph.nodes.find(matches);
  if (!node) {
    throw new Error(`${label} was missing: ${JSON.stringify(graph.nodes)}`);
  }
  return node;
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
