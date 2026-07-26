#!/usr/bin/env node
/* global console */

import { readdir } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

import {
  backendProbe,
  openFixtureWorkspace,
  waitForBackendState,
} from "./electron-workflow-harness.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  reloadPage,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";

/**
 * Native artifact routing through the production desktop app.
 *
 * The recorded failure this workflow guards started with zero open workspaces:
 * a request for Setta artifacts became a website build waiting for a project
 * folder. So the workflow opens no workspace at all until the folderless half is
 * proven, and only then binds one to show the same artifacts come out of a
 * workspace-bound conversation.
 */
const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "native-artifact-routing";
const workflowTimeoutMs = 60_000;
const datasetTableTitle = "Language line counts";
const datasetChartTitle = "Language line count chart";
const releaseNotesTitle = "Qualitative release notes";
const mixedDocumentTitle = "Policy memo";
const mixedDocumentPath = "docs/setta-artifact-policy-memo.md";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/native-artifact-routing-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
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
  context = await launchWorkflowElectron(firstLaunchDir);
  let backend = await backendProbe(firstLaunchDir);
  await assertNoWorkspaceIsOpen(context.client);
  const initial = await readDirectorSnapshot(context.client);
  assertEqual(initial.workstreams.length, 0, "initial workstream count");
  assertEqual(initial.artifacts.length, 0, "initial artifact count");

  // A native artifact request with no workspace starts immediately.
  await submitDirector(context.client, "Director create unbound.");
  const started = await waitForDirectorSnapshot(
    context.client,
    (snapshot) => snapshot.workstreams.length === 1,
  );
  const unboundWorkstreamId = requiredString(
    started.workstreams[0]?.workstream.id,
    "unbound workstream",
  );
  const unboundConversationId = conversationID(unboundWorkstreamId);
  const privateDirectory = join(fixture.appDataDir, "unbound-conversations", unboundConversationId);
  const published = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      artifactsFor(snapshot, unboundWorkstreamId).length === 2 &&
      workstreamOf(snapshot, unboundWorkstreamId)?.activeRunId === null &&
      workstreamOf(snapshot, unboundWorkstreamId)?.status === "completed",
  );
  const unboundWorkstream = workstreamOf(published, unboundWorkstreamId);
  assertEqual(unboundWorkstream?.resourceScope.kind, "folderless", "unbound resource scope");
  assertEqual(published.unresolvedResourceRequests.length, 0, "unbound folder requests");
  const unboundTurns = await waitForConversationSnapshot(
    backend,
    null,
    unboundConversationId,
    (snapshot) => snapshot.turns.turns.at(-1)?.status === "completed",
  );
  assertEqual(unboundTurns.turns.turns.length, 1, "unbound turn count");
  assertEqual(unboundTurns.conversation.workspaceId, null, "unbound conversation workspace");

  // Two independently useful artifacts, published separately.
  const datasetArtifacts = artifactsFor(published, unboundWorkstreamId);
  const unboundTable = requiredArtifact(datasetArtifacts, datasetTableTitle);
  const unboundChart = requiredArtifact(datasetArtifacts, datasetChartTitle);
  assertEqual(unboundTable.workspaceId, null, "unbound table artifact workspace");
  assertEqual(unboundChart.workspaceId, null, "unbound chart artifact workspace");
  const unboundTableSource = await readArtifactSource(context.client, unboundTable);
  const unboundChartSource = await readArtifactSource(context.client, unboundChart);
  assertSeparateArtifactDocuments(unboundTableSource, unboundChartSource, [
    datasetTableTitle,
    datasetChartTitle,
  ]);
  await assertRailShowsArtifacts(context.client, published, [unboundTable, unboundChart]);
  const tableDetail = await openArtifactBrowser(
    context.client,
    published,
    unboundTable,
    "TypeScript",
  );
  assertEqual(tableDetail.title, datasetTableTitle, "unbound table browser title");
  await closeArtifactBrowser(context.client);

  // The provider saved a file into its own private working directory. That
  // directory is not an authorized workspace, so the save stays an activity and
  // never becomes a durable file reference.
  await submitDirector(context.client, "Director unbound saved image.");
  const afterSavedImage = await waitForConversationSnapshot(
    backend,
    null,
    unboundConversationId,
    (snapshot) =>
      snapshot.turns.turns.length === 2 && snapshot.turns.turns.at(-1)?.status === "completed",
  );
  const privateFiles = await directoryFileNames(privateDirectory);
  if (privateFiles.length === 0) {
    throw new Error(`unbound turns did not run in ${privateDirectory}`);
  }
  const stillTwo = await waitForDirectorSnapshot(
    context.client,
    (snapshot) => workstreamOf(snapshot, unboundWorkstreamId)?.activeRunId === null,
  );
  assertEqual(
    artifactsFor(stillTwo, unboundWorkstreamId).length,
    2,
    "unbound artifact count after a private-directory save",
  );
  assertExcludes(JSON.stringify(stillTwo), privateDirectory, "Director snapshot");
  assertExcludes(JSON.stringify(afterSavedImage), privateDirectory, "unbound conversation");
  assertExcludes(unboundTableSource, "FileReference", "unbound artifact document");

  // Queue, steer, cancel, and recover all run without a workspace.
  await submitDirector(context.client, "Director unbound hold.");
  await waitForWorkstream(context.client, unboundWorkstreamId, (workstream) =>
    Boolean(workstream.activeRunId),
  );
  await submitDirector(context.client, "Director unbound queue.");
  await waitForWorkstream(
    context.client,
    unboundWorkstreamId,
    (workstream) => workstream.queuedRunCount === 1 && workstream.activeRunId !== null,
  );
  await submitDirector(context.client, "Director unbound steer.");
  const steered = await waitForConversationSnapshot(
    backend,
    null,
    unboundConversationId,
    (snapshot) =>
      snapshot.queue.length === 0 &&
      snapshot.turns.turns.length === 4 &&
      snapshot.turns.turns.every((turn) => turn.status === "completed"),
  );
  assertEqual(
    steered.turns.turns.at(-1)?.authoredInput.text,
    "unbound queued",
    "promoted unbound queued work",
  );

  await submitDirector(context.client, "Director unbound cancel hold.");
  const cancellable = await waitForWorkstream(
    context.client,
    unboundWorkstreamId,
    (workstream) => workstream.activeRunId !== null,
  );
  const cancelledRunId = requiredString(cancellable.activeRunId, "cancellable unbound run");
  await submitDirector(context.client, "Director cancel.");
  await waitForConversationSnapshot(backend, null, unboundConversationId, (snapshot) =>
    snapshot.turns.turns.some((turn) => turn.id === cancelledRunId && turn.status === "cancelled"),
  );

  await submitDirector(context.client, "Director unbound fail.");
  await waitForWorkstream(
    context.client,
    unboundWorkstreamId,
    (workstream) => workstream.status === "failed" && workstream.activeRunId === null,
  );
  await submitDirector(context.client, "Director recover.");
  await waitForWorkstream(
    context.client,
    unboundWorkstreamId,
    (workstream) => workstream.status === "completed" && workstream.activeRunId === null,
  );

  await submitDirector(context.client, "Director unbound notes.");
  const afterLifecycle = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      artifactsFor(snapshot, unboundWorkstreamId).length === 3 &&
      workstreamOf(snapshot, unboundWorkstreamId)?.activeRunId === null,
  );
  requiredArtifact(artifactsFor(afterLifecycle, unboundWorkstreamId), releaseNotesTitle);
  assertEqual(
    afterLifecycle.unresolvedResourceRequests.length,
    0,
    "folder requests after lifecycle",
  );

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="director-command-center-shell"]');
  await context.client.installDriver();
  const reloaded = await waitForDirectorSnapshot(
    context.client,
    (snapshot) => artifactsFor(snapshot, unboundWorkstreamId).length === 3,
  );
  assertEqual(
    workstreamOf(reloaded, unboundWorkstreamId)?.resourceScope.kind,
    "folderless",
    "reloaded unbound resource scope",
  );

  // Work that genuinely needs the user's files still asks for a folder.
  await submitDirector(context.client, "Director create file dependent.");
  const fileDependent = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.workstreams.length === 2 && snapshot.unresolvedResourceRequests.length === 1,
  );
  const fileDependentWorkstreamId = requiredString(
    fileDependent.unresolvedResourceRequests[0]?.workstreamId,
    "file-dependent workstream",
  );
  const waiting = workstreamOf(fileDependent, fileDependentWorkstreamId);
  assertEqual(waiting?.resourceScope.kind, "folderless", "file-dependent resource scope");
  assertEqual(waiting?.activeRunId, null, "file-dependent active run");
  assertEqual(waiting?.queuedRunCount, 0, "file-dependent queued runs");

  // Nothing so far touched the user's files, so no project tree was written.
  assertEqual(
    (await directoryFileNames(fixture.workspaceRoot)).length,
    0,
    "user folder file count",
  );

  const workspaceId = await openFixtureWorkspace(context.client, workflowTimeoutMs);
  await waitForSelector(context.client, '[data-testid="director-command-center-shell"]');
  await context.client.installDriver();
  await submitDirector(context.client, "Director create bound.");
  const boundCreated = await waitForDirectorSnapshot(
    context.client,
    (snapshot) => snapshot.workstreams.length === 3,
  );
  const boundWorkstreamId = requiredString(
    boundCreated.workstreams.find(
      (entry) => entry.workstream.resourceScope.folder?.workspaceId === workspaceId,
    )?.workstream.id,
    "bound workstream",
  );

  await submitDirector(context.client, "Director bound dataset.");
  const boundPublished = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      artifactsFor(snapshot, boundWorkstreamId).length === 2 &&
      workstreamOf(snapshot, boundWorkstreamId)?.activeRunId === null,
  );
  const boundArtifacts = artifactsFor(boundPublished, boundWorkstreamId);
  const boundTable = requiredArtifact(boundArtifacts, datasetTableTitle);
  const boundChart = requiredArtifact(boundArtifacts, datasetChartTitle);
  assertEqual(boundTable.workspaceId, workspaceId, "bound table artifact workspace");
  assertEqual(boundChart.workspaceId, workspaceId, "bound chart artifact workspace");
  assertEqual(
    await readArtifactSource(context.client, boundTable),
    unboundTableSource,
    "bound and unbound table document",
  );
  assertEqual(
    await readArtifactSource(context.client, boundChart),
    unboundChartSource,
    "bound and unbound chart document",
  );

  // A bound artifact may address a real file inside the authorized workspace.
  await submitDirector(context.client, "Director mixed artifact.");
  const mixedPublished = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      artifactsFor(snapshot, boundWorkstreamId).length === 3 &&
      workstreamOf(snapshot, boundWorkstreamId)?.activeRunId === null,
  );
  const mixedArtifact = requiredArtifact(
    artifactsFor(mixedPublished, boundWorkstreamId),
    mixedDocumentTitle,
  );
  const mixedSource = await readArtifactSource(context.client, mixedArtifact);
  assertIncludes(mixedSource, `FileReference("${mixedDocumentPath}"`, "bound mixed document");
  const mixedDetail = await openArtifactBrowser(
    context.client,
    mixedPublished,
    mixedArtifact,
    mixedDocumentPath,
  );
  assertEqual(mixedDetail.title, mixedDocumentTitle, "bound mixed browser title");
  await closeArtifactBrowser(context.client);

  const beforeRestart = comparableRoutingSnapshot(mixedPublished);
  await writeJson(join(artifactDir, "before-restart.json"), beforeRestart);

  await stopElectronCdpContext(context);
  context = null;
  context = await launchWorkflowElectron(secondLaunchDir);
  backend = await backendProbe(secondLaunchDir);
  const restoredWorkspaceId = await openFixtureWorkspace(context.client, workflowTimeoutMs);
  assertEqual(restoredWorkspaceId, workspaceId, "restored workspace");
  await waitForSelector(context.client, '[data-testid="director-command-center-shell"]');
  await context.client.installDriver();
  const restored = await waitForDirectorSnapshot(
    context.client,
    (snapshot) => snapshot.workstreams.length === 3 && snapshot.artifacts.length === 6,
  );
  assertDeepEqual(comparableRoutingSnapshot(restored), beforeRestart, "restored routing snapshot");

  // Restart preserved optional-workspace execution: the unbound workstream
  // still runs and publishes without a folder while one is open beside it.
  await submitDirector(context.client, "Director select unbound.");
  await waitForDirectorSnapshot(
    context.client,
    (snapshot) => snapshot.selectedWorkstreamId === unboundWorkstreamId,
  );
  await submitDirector(context.client, "Director unbound notes.");
  const afterRestart = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      artifactsFor(snapshot, unboundWorkstreamId).length === 4 &&
      workstreamOf(snapshot, unboundWorkstreamId)?.activeRunId === null,
  );
  const restartArtifacts = artifactsFor(afterRestart, unboundWorkstreamId);
  if (restartArtifacts.some((artifact) => artifact.workspaceId !== null)) {
    throw new Error(`unbound artifacts gained a workspace: ${JSON.stringify(restartArtifacts)}`);
  }
  assertEqual(
    workstreamOf(afterRestart, unboundWorkstreamId)?.resourceScope.kind,
    "folderless",
    "unbound resource scope after restart",
  );
  assertEqual(afterRestart.unresolvedResourceRequests.length, 1, "folder requests after restart");

  // Last, because the refusal is a loud retryable failure rather than a silent
  // downgrade: the same file the unbound run can see in its own working
  // directory is still not a file its artifact may address.
  await submitDirector(context.client, "Director unbound file reference.");
  const refused = await waitForConversationSnapshot(
    backend,
    null,
    unboundConversationId,
    (snapshot) => snapshot.turns.turns.at(-1)?.status === "failed",
  );
  const refusal = refused.turns.turns.at(-1)?.error;
  assertEqual(refusal?.retryable, true, "private-directory reference retryability");
  assertIncludes(refusal?.diagnosticReference ?? "", "invalid_file_reference", "refusal reference");
  if (!(await directoryFileNames(privateDirectory)).includes("setta-artifact-policy-memo.md")) {
    throw new Error(`the refused file was never written under ${privateDirectory}`);
  }
  const afterRefusal = await waitForDirectorSnapshot(
    context.client,
    (snapshot) => workstreamOf(snapshot, unboundWorkstreamId)?.activeRunId === null,
  );
  const finalArtifacts = artifactsFor(afterRefusal, unboundWorkstreamId);
  assertEqual(finalArtifacts.length, 4, "unbound artifact count after the refused reference");
  if (finalArtifacts.some((artifact) => artifact.title === "Private directory reference")) {
    throw new Error(
      `a private-directory artifact was published: ${JSON.stringify(finalArtifacts)}`,
    );
  }
  assertExcludes(JSON.stringify(afterRefusal), privateDirectory, "Director snapshot after refusal");

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    artifactCount: afterRefusal.artifacts.length,
    boundWorkstreamId,
    fileDependentWorkstreamId,
    privateWorkingDirectoryFiles: privateFiles,
    status: "passed",
    unboundWorkstreamId,
    workspaceId,
  });
  console.log(`Electron native artifact routing workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-director-snapshot.json"), {
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

async function launchWorkflowElectron(launchArtifactDir) {
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

async function assertNoWorkspaceIsOpen(client) {
  const session = await client.evaluate("window.setta.workspace.session()");
  assertEqual(session.activeWorkspaces.length, 0, "open workspace count");
  assertEqual(session.selectedWorkspaceId, "", "selected workspace");
}

function readDirectorSnapshot(client) {
  return client.evaluate("window.setta.director.readSnapshot()");
}

function waitForDirectorSnapshot(client, ready) {
  return waitForBackendState(() => readDirectorSnapshot(client), ready, workflowTimeoutMs);
}

async function waitForWorkstream(client, workstreamId, ready) {
  const snapshot = await waitForDirectorSnapshot(client, (candidate) => {
    const workstream = workstreamOf(candidate, workstreamId);
    return Boolean(workstream && ready(workstream));
  });
  return workstreamOf(snapshot, workstreamId);
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}

function submitDirector(client, text) {
  return client.evaluate(
    `window.setta.director.dispatch(${JSON.stringify({
      kind: "submit",
      submit: { modality: "text", text },
    })})`,
  );
}

function workstreamOf(snapshot, workstreamId) {
  return snapshot.workstreams.find((entry) => entry.workstream.id === workstreamId)?.workstream;
}

function artifactsFor(snapshot, workstreamId) {
  return snapshot.artifacts.filter(
    (artifact) => artifact.workstreamId === workstreamId && artifact.status === "available",
  );
}

function requiredArtifact(artifacts, title) {
  const matches = artifacts.filter((artifact) => artifact.title === title);
  if (matches.length !== 1) {
    throw new Error(`artifact ${JSON.stringify(title)} count = ${matches.length}, want 1`);
  }
  return matches[0];
}

function readArtifactSource(client, artifact) {
  return client.evaluate(
    `window.setta.conversations.readArtifact(${JSON.stringify({
      artifactId: artifact.id,
      conversationId: artifact.conversationId,
      workspaceId: artifact.workspaceId,
    })}).then((entry) => entry.document.source)`,
  );
}

/**
 * Independently requested artifacts stay independent documents.
 *
 * Each source is one root document that carries only its own subject, so
 * nothing collapsed the pair into a tabbed, accordion, or gallery wrapper.
 */
function assertSeparateArtifactDocuments(firstSource, secondSource, titles) {
  if (firstSource === secondSource) {
    throw new Error("separately published artifacts shared one document");
  }
  for (const [source, ownTitle] of [
    [firstSource, titles[0]],
    [secondSource, titles[1]],
  ]) {
    assertEqual(occurrenceCount(source, "root = Document(["), 1, "artifact root document count");
    for (const title of titles) {
      if (title !== ownTitle && source.includes(title)) {
        throw new Error(`artifact document combined ${JSON.stringify(title)}: ${source}`);
      }
    }
  }
}

function occurrenceCount(value, marker) {
  return value.split(marker).length - 1;
}

async function assertRailShowsArtifacts(client, snapshot, artifacts) {
  for (const artifact of artifacts) {
    const card = await waitForArtifactCard(client, artifact.id);
    assertIncludes(card.title, artifact.title, `rail card title for ${artifact.id}`);
  }
  const railed = await client.evaluate(
    "document.querySelectorAll('.director-artifact-preview').length",
  );
  assertEqual(railed, snapshot.artifacts.length, "rail card count");
}

function waitForArtifactCard(client, artifactId) {
  const selector = `.director-artifact-preview[data-artifact-id="${artifactId}"]`;
  return waitForState(
    client,
    `(() => {
      const card = document.querySelector(${JSON.stringify(selector)});
      return {
        state: card?.getAttribute("data-preview-state") ?? "",
        title: card?.querySelector(".director-artifact-preview-title")?.textContent ?? ""
      };
    })()`,
    (card) => card.state === "ready",
    workflowTimeoutMs,
  );
}

async function openArtifactBrowser(client, snapshot, artifact, documentMarker) {
  await waitForArtifactCard(client, artifact.id);
  const selector = `.director-artifact-preview[data-artifact-id="${artifact.id}"] .director-artifact-expand`;
  const clicked = await client.evaluate(`(() => {
    const expand = document.querySelector(${JSON.stringify(selector)});
    if (!(expand instanceof HTMLButtonElement) || expand.disabled) {
      return false;
    }
    expand.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`artifact expand control was not clickable: ${artifact.id}`);
  }
  const detail = await waitForState(
    client,
    `(() => {
      const modal = document.querySelector(".director-artifact-browser");
      return {
        documentText: modal?.querySelector(".director-artifact-browser-document")?.textContent ?? "",
        loadState: modal?.getAttribute("data-artifact-load-state") ?? "",
        openId: modal?.getAttribute("data-artifact-id") ?? "",
        position: modal?.querySelector(".director-artifact-browser-position")?.textContent ?? "",
        title: modal?.querySelector(".director-artifact-browser-title")?.textContent ?? ""
      };
    })()`,
    (state) =>
      state.openId === artifact.id &&
      state.loadState === "ready" &&
      state.documentText.includes(documentMarker),
    workflowTimeoutMs,
  );
  const position = snapshot.artifacts.findIndex((candidate) => candidate.id === artifact.id) + 1;
  assertEqual(
    detail.position,
    `${position} of ${snapshot.artifacts.length}`,
    `artifact browser position for ${artifact.id}`,
  );
  return detail;
}

async function closeArtifactBrowser(client) {
  const closed = await client.evaluate(`(() => {
    const close = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === "Close artifact browser"
    );
    if (!(close instanceof HTMLButtonElement)) {
      return false;
    }
    close.click();
    return true;
  })()`);
  if (!closed) {
    throw new Error("artifact browser close control was missing");
  }
  await waitForState(
    client,
    "({ open: Boolean(document.querySelector('.director-artifact-browser')) })",
    (state) => !state.open,
    workflowTimeoutMs,
  );
}

/**
 * The durable routing facts a restart must reproduce exactly: which workstream
 * runs with which folder, and which artifact belongs to which of them.
 */
function comparableRoutingSnapshot(snapshot) {
  return {
    artifacts: snapshot.artifacts.map((artifact) => ({
      conversationId: artifact.conversationId,
      id: artifact.id,
      status: artifact.status,
      title: artifact.title,
      workspaceId: artifact.workspaceId,
      workstreamId: artifact.workstreamId,
    })),
    resourceRequests: snapshot.unresolvedResourceRequests.map((request) => ({
      kind: request.kind,
      workstreamId: request.workstreamId,
    })),
    workstreams: snapshot.workstreams.map((entry) => ({
      id: entry.workstream.id,
      scope: entry.workstream.resourceScope.kind,
      title: entry.workstream.title,
      workspaceId: entry.workstream.resourceScope.folder?.workspaceId ?? null,
    })),
  };
}

async function directoryFileNames(path) {
  const entries = await readdir(path, { recursive: true, withFileTypes: true }).catch((error) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

function conversationID(workstreamId) {
  const prefix = "workstream:";
  if (!workstreamId.startsWith(prefix) || workstreamId.length === prefix.length) {
    throw new Error(`unexpected workstream identity ${workstreamId}`);
  }
  return workstreamId.slice(prefix.length);
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

function assertIncludes(value, marker, label) {
  if (!value.includes(marker)) {
    throw new Error(`${label} omitted ${JSON.stringify(marker)}: ${JSON.stringify(value)}`);
  }
}

function assertExcludes(value, marker, label) {
  if (value.includes(marker)) {
    throw new Error(`${label} exposed ${JSON.stringify(marker)}`);
  }
}
