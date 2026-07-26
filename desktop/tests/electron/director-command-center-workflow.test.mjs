#!/usr/bin/env node
/* global console */

import { readFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

import {
  activateArtifactBrowserControl,
  answerDirectorApprovalInRail,
  assertArtifactBrowserBoundaries,
  assertArtifactBrowserContainsFocus,
  assertArtifactBrowserModalIsolation,
  assertArtifactBrowserTheme,
  assertArtifactExpandControlRegainedFocus,
  assertArtifactPreviewIgnoresSingleClick,
  assertArtifactTableOwnsHorizontalArrow,
  assertDeepEqual,
  assertDirectorArtifactPreviewTheme,
  assertDirectorEventSequence,
  assertDirectorGraphCanvasPreserved,
  assertEqual,
  assertEventKinds,
  assertExcludes,
  assertGraphUpdates,
  assertProjectedDirectorCreation,
  closeDirectorArtifactBrowser,
  comparableDirectorSnapshot,
  conversationID,
  directorArtifactMarker,
  hasProjectedDirectorCreation,
  navigateArtifactBrowserWithArrow,
  openDirectorArtifactBrowser,
  openDirectorArtifactBrowserByDoubleClick,
  rememberDirectorGraphCanvas,
  requiredString,
  verifyCompactRailFocusRestoration,
  verifyRailsFlankTheCanvas,
  verifyWorkspaceSettings,
  waitForConversationSnapshot,
  waitForDirectorArtifactPreview,
  waitForOpenDirectorArtifact,
} from "./director-command-center-workflow-helpers.mjs";
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
  const created = await waitForDirectorSnapshot(context.client, (snapshot) =>
    isCreatedWorkspaceWorkstream(snapshot, workspaceId),
  );
  const rootWorkstreamId = requiredString(
    created.workstreams[0]?.workstream.id,
    "workspace-scoped Director workstream",
  );
  const projectedCreation = await waitForDirectorSnapshot(context.client, (snapshot) =>
    hasProjectedDirectorCreation(snapshot, rootWorkstreamId),
  );
  assertProjectedDirectorCreation(projectedCreation, rootWorkstreamId);
  const workspaceSettings = await verifyWorkspaceSettings(
    context.client,
    workspaceId,
    fixture.workspaceRoot,
  );
  /*
   * This checks the Director answering, so it runs on the Director's view.
   * Typing at a workstream's view speaks to that conversation instead, and the
   * Director is not answering then — which is the point of the change, not a
   * gap in it.
   */
  const selectionBeforeComposerCheck = await client_selectedWorkstream(context.client);
  await selectDirectorView(context.client);
  await verifyComposerQueuesWhileDirectorAnswers(context.client, fakeCodex.statePath);
  await selectView(context.client, selectionBeforeComposerCheck);

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
  await waitForDirectorSnapshot(context.client, (snapshot) => {
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
  await submitDirector(context.client, "Director artifact.");
  const artifactSnapshot = await waitForDirectorSnapshot(context.client, (snapshot) => {
    const workstream = snapshot.workstreams.find(
      (entry) => entry.workstream.id === rootWorkstreamId,
    )?.workstream;
    return (
      snapshot.selectedWorkstreamId === rootWorkstreamId &&
      snapshot.artifacts.filter(
        (artifact) => artifact.workstreamId === rootWorkstreamId && artifact.status === "available",
      ).length >= 2 &&
      workstream?.activeRunId === null &&
      workstream.status === "completed"
    );
  });
  const initialArtifacts = artifactSnapshot.artifacts.filter(
    (artifact) => artifact.workstreamId === rootWorkstreamId && artifact.status === "available",
  );
  const newestArtifact = initialArtifacts[0];
  const openedArtifact = initialArtifacts[1];
  const newestArtifactId = requiredString(newestArtifact?.id, "newest Director artifact");
  const openedArtifactId = requiredString(openedArtifact?.id, "older Director artifact");
  const newestArtifactMarker = await directorArtifactMarker(context.client, newestArtifact);
  const openedArtifactMarker = await directorArtifactMarker(context.client, openedArtifact);
  const artifactPreview = await waitForDirectorArtifactPreview(context.client, openedArtifactId);
  const newestArtifactPreview = await waitForDirectorArtifactPreview(
    context.client,
    newestArtifactId,
  );
  // A card claims what its artifact is, in the author's own line. That line is
  // what binds a card to its artifact, so it is what the rail is checked for —
  // a card is no longer a bounded replay of the document's opening.
  const openedArtifactSummary = requiredString(openedArtifact?.summary, "older Director summary");
  const newestArtifactSummary = requiredString(newestArtifact?.summary, "newest Director summary");
  if (!artifactPreview.previewText.includes(openedArtifactSummary)) {
    throw new Error(
      `Director artifact card omitted its artifact's summary: ${JSON.stringify(artifactPreview)}`,
    );
  }
  if (!newestArtifactPreview.previewText.includes(newestArtifactSummary)) {
    throw new Error(
      `Newest Director artifact card omitted its artifact's summary: ${JSON.stringify(newestArtifactPreview)}`,
    );
  }
  if (artifactPreview.previewInert) {
    throw new Error(
      `Director artifact preview hid its readable content: ${JSON.stringify(artifactPreview)}`,
    );
  }
  // Two artifacts of the same kind making the same claim draw the same card.
  // A card is as tall as what it has to say, so this is what "stable" means
  // now: the height follows the claim, not the arrival order.
  assertEqual(
    newestArtifactPreview.height,
    artifactPreview.height,
    "Director artifact card height for equal claims",
  );
  await assertArtifactPreviewIgnoresSingleClick(context.client, openedArtifactId, artifactPreview);
  // Setta has one scheme, so the preview is checked for readability rather than
  // for following a mode. The risk it guards is unchanged: a preview whose text
  // and ground resolve to the same colour is invisible.
  await assertDirectorArtifactPreviewTheme(context.client, openedArtifactId);
  await rememberDirectorGraphCanvas(context.client);
  const artifactDetail = await openDirectorArtifactBrowser(
    context.client,
    openedArtifactId,
    openedArtifactMarker,
  );
  assertEqual(artifactDetail.status, "ready", "Director artifact browser load state");
  assertEqual(artifactDetail.position, "2 of 2", "Director artifact browser position");
  assertArtifactBrowserTheme(artifactDetail);
  assertArtifactBrowserModalIsolation(artifactDetail);
  assertArtifactBrowserBoundaries(artifactDetail, {
    nextDisabled: true,
    previousDisabled: false,
  });
  if (!artifactDetail.text.includes(openedArtifact.title)) {
    throw new Error(`Director artifact browser omitted title: ${JSON.stringify(artifactDetail)}`);
  }
  if (!artifactDetail.documentText.includes(openedArtifactMarker)) {
    throw new Error(
      `Director artifact browser omitted rendered document: ${JSON.stringify(artifactDetail)}`,
    );
  }
  await assertArtifactBrowserContainsFocus(context.client);
  const previousDetail = await activateArtifactBrowserControl(
    context.client,
    "Previous artifact",
    newestArtifactId,
    newestArtifactMarker,
  );
  assertEqual(previousDetail.position, "1 of 2", "previous artifact position");
  assertArtifactBrowserBoundaries(previousDetail, {
    nextDisabled: false,
    previousDisabled: true,
  });
  const keyboardDetail = await navigateArtifactBrowserWithArrow(
    context.client,
    "ArrowRight",
    openedArtifactId,
    openedArtifactMarker,
  );
  assertEqual(keyboardDetail.position, "2 of 2", "keyboard artifact position");
  await closeDirectorArtifactBrowser(context.client);
  await assertArtifactExpandControlRegainedFocus(context.client, openedArtifactId);
  await assertDirectorGraphCanvasPreserved(context.client);

  await assertDirectorArtifactPreviewTheme(context.client, openedArtifactId);
  await rememberDirectorGraphCanvas(context.client);
  const doubleClickDetail = await openDirectorArtifactBrowserByDoubleClick(
    context.client,
    openedArtifactId,
    openedArtifactMarker,
  );
  assertEqual(doubleClickDetail.position, "2 of 2", "double-click artifact position");
  assertArtifactBrowserTheme(doubleClickDetail);

  // The browser's active identity is local state. A newer Director snapshot
  // changes its computed position but must not replace or close the document
  // the reader is looking at.
  await submitDirector(context.client, "Director mixed artifact.");
  const beforeRestart = await waitForDirectorSnapshot(context.client, (snapshot) => {
    const workstream = snapshot.workstreams.find(
      (entry) => entry.workstream.id === rootWorkstreamId,
    )?.workstream;
    return (
      snapshot.artifacts.filter(
        (artifact) => artifact.workstreamId === rootWorkstreamId && artifact.status === "available",
      ).length >= 3 &&
      workstream?.activeRunId === null &&
      workstream.status === "completed"
    );
  });
  const finalArtifacts = beforeRestart.artifacts.filter(
    (artifact) => artifact.workstreamId === rootWorkstreamId && artifact.status === "available",
  );
  const arrivedArtifact = finalArtifacts[0];
  const arrivedArtifactId = requiredString(arrivedArtifact?.id, "arriving Director artifact");
  const arrivedArtifactMarker = await directorArtifactMarker(context.client, arrivedArtifact);
  const retainedDetail = await waitForOpenDirectorArtifact(
    context.client,
    openedArtifactId,
    openedArtifactMarker,
  );
  assertEqual(retainedDetail.position, "3 of 3", "retained active artifact position");

  const middleDetail = await activateArtifactBrowserControl(
    context.client,
    "Previous artifact",
    newestArtifactId,
    newestArtifactMarker,
  );
  assertEqual(middleDetail.position, "2 of 3", "middle artifact position");
  const firstDetail = await navigateArtifactBrowserWithArrow(
    context.client,
    "ArrowLeft",
    arrivedArtifactId,
    arrivedArtifactMarker,
  );
  assertEqual(firstDetail.position, "1 of 3", "first artifact position");
  if (firstDetail.tableCount !== 1) {
    throw new Error(`Mixed Director artifact omitted its table: ${JSON.stringify(firstDetail)}`);
  }
  assertArtifactBrowserBoundaries(firstDetail, {
    nextDisabled: false,
    previousDisabled: true,
  });
  await assertArtifactTableOwnsHorizontalArrow(context.client, arrivedArtifactId);
  const middleAgain = await navigateArtifactBrowserWithArrow(
    context.client,
    "ArrowRight",
    newestArtifactId,
    newestArtifactMarker,
  );
  assertEqual(middleAgain.position, "2 of 3", "middle keyboard artifact position");
  const lastDetail = await activateArtifactBrowserControl(
    context.client,
    "Next artifact",
    openedArtifactId,
    openedArtifactMarker,
  );
  assertEqual(lastDetail.position, "3 of 3", "last artifact position");
  assertArtifactBrowserBoundaries(lastDetail, {
    nextDisabled: true,
    previousDisabled: false,
  });
  await closeDirectorArtifactBrowser(context.client);
  await assertArtifactExpandControlRegainedFocus(context.client, openedArtifactId);
  await assertDirectorGraphCanvasPreserved(context.client);

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

/*
 * A running workstream's rail must not still be showing the blocker it cleared.
 *
 * The rail renders narrator sentences now, and a workstream that has just
 * started running has not been narrated yet — so the guarantee is the same one
 * stated the other way round: whatever the rail says, it is not the resolved
 * folder request.
 */
// Selecting a view. A null workstream is the Director's own, which is a
// destination the intent names rather than the absence of a workstream.
async function selectView(client, workstreamId) {
  await client.evaluate(`window.setta.director.dispatch({
    cancelRun: null,
    createWorkstream: null,
    kind: "select_workstream",
    moveSelection: null,
    resolveApproval: null,
    resolveResourceRequest: null,
    selectWorkstream: { workstreamId: ${JSON.stringify(workstreamId)} },
    submit: null
  })`);
  await waitForState(
    client,
    `(async () => (await window.setta.director.readSnapshot()).selectedWorkstreamId)()`,
    (selected) => selected === workstreamId,
    workflowTimeoutMs,
  );
}

async function selectDirectorView(client) {
  await selectView(client, null);
}

async function client_selectedWorkstream(client) {
  return client.evaluate(
    `(async () => (await window.setta.director.readSnapshot()).selectedWorkstreamId)()`,
  );
}

async function assertRunningSummaryIsCurrent(client) {
  const state = await waitForState(
    client,
    `(() => {
      const rail = document.querySelector("#director-now-rail");
      const status = document.querySelector(".director-focus-status");
      return {
        status: status?.textContent?.trim() ?? "",
        rail: rail?.textContent?.trim() ?? ""
      };
    })()`,
    (candidate) =>
      candidate.status === "Running" && !candidate.rail.includes("Waiting for a project folder"),
    workflowTimeoutMs,
  );
  assertExcludes(state.rail, "Waiting for a project folder", "running Now rail");
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

function isCreatedWorkspaceWorkstream(snapshot, workspaceId) {
  if (snapshot.workstreams.length !== 1) return false;
  const workstream = snapshot.workstreams[0]?.workstream;
  if (workstream?.resourceScope.kind !== "folder") return false;
  const folder = workstream.resourceScope.folder;
  if (folder == null) return false;
  return (
    folder.workspaceId === workspaceId &&
    workstream.status === "idle" &&
    snapshot.selectedWorkstreamId === workstream.id
  );
}

async function assertDirectorFocusIsConsistent(client) {
  const focus = await waitForState(
    client,
    `(() => ({
      composerFocus:
        document.querySelector(".director-composer-hint-focus")?.textContent?.trim() ?? "",
      currentDots: document.querySelectorAll('.director-workstream-dot[aria-current="page"]').length,
      currentIsDirector: Boolean(
        document.querySelector('.director-view-dot[aria-current="page"]')
      ),
      headingCount: document.querySelectorAll("h1").length,
      topMeta: document.querySelector(".director-focus-meta")?.textContent?.trim() ?? "",
      topTitle: document.querySelector(".director-focus-title")?.textContent?.trim() ?? ""
    }))()`,
    (state) =>
      state.composerFocus === "No workstream in focus" &&
      // The Director is a destination, so exactly one dot is current and it is
      // the Director's. It used to be none, because the Director was the
      // absence of a selection rather than a view.
      state.currentDots === 1 &&
      state.currentIsDirector &&
      state.headingCount === 1 &&
      state.topMeta === "No workstream in focus" &&
      state.topTitle === "Director",
    workflowTimeoutMs,
  );
  // The top bar is the sole owner of focus identity; the Now rail used to
  // restate the title and no longer does, so `topTitle` is the only place to
  // read it and a second assertion on the rail would only re-check itself.
  assertDeepEqual(
    focus,
    {
      composerFocus: "No workstream in focus",
      currentDots: 1,
      currentIsDirector: true,
      headingCount: 1,
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
  assertProviderCarrierStarts(starts, retiredLifecycleCalls);

  const directorLifecycle = readDirectorProviderLifecycle(starts, injections, turns);
  const conversationLifecycle = providerCarrierLifecycle(starts, injections, turns, "conversation");
  if (conversationLifecycle.starts.length === 0) {
    throw new Error("Director workflow did not start a workstream conversation carrier");
  }
  assertCarrierReplayLifecycle(
    conversationLifecycle.starts,
    conversationLifecycle.injections,
    conversationLifecycle.turns,
    "workstream conversation",
  );

  const sideLifecycle = providerCarrierLifecycle(starts, injections, turns, "side");
  assertCarrierReplayLifecycle(
    sideLifecycle.starts,
    sideLifecycle.injections,
    sideLifecycle.turns,
    "side conversation",
  );
  assertProviderReplayCarriers(injections);
  return {
    carrierCounts: Object.fromEntries(
      ["conversation", "director", "side", "structured"].map((kind) => [
        kind,
        starts.filter((entry) => entry.carrierKind === kind).length,
      ]),
    ),
    conversationThreadIds: [...conversationLifecycle.threadIds],
    generations: directorLifecycle.starts.map((entry) => entry.generation),
    replayRoles: directorLifecycle.replayRoles,
    directorThreadIds: directorLifecycle.starts.map((entry) => entry.threadId),
    directorTurnCount: directorLifecycle.turns.length,
  };
}

function assertProviderCarrierStarts(starts, retiredLifecycleCalls) {
  if (starts.length === 0 || starts.some((entry) => entry.ephemeral !== true)) {
    throw new Error(`Setta provider carrier starts drifted: ${JSON.stringify(starts)}`);
  }
  if (retiredLifecycleCalls.length !== 0) {
    throw new Error(
      `Setta used retired provider lifecycle calls: ${JSON.stringify(retiredLifecycleCalls)}`,
    );
  }
}

function readDirectorProviderLifecycle(starts, injections, turns) {
  const directorStarts = starts.filter((entry) => entry.carrierKind === "director");
  const directorThreadIds = new Set(directorStarts.map((entry) => entry.threadId));
  const directorInjections = injections.filter(
    (entry) => entry.carrierKind === "director" && directorThreadIds.has(entry.threadId),
  );
  const directorTurns = turns.filter((entry) => entry.carrierKind === "director");
  assertDirectorCarrierStarts(directorStarts, directorInjections);
  assertDirectorTurnsStayOnCarrier(directorStarts, directorTurns);
  const replayRoles = requiredDirectorReplayRoles(directorInjections);
  return {
    injections: directorInjections,
    replayRoles,
    starts: directorStarts,
    turns: directorTurns,
  };
}

function assertDirectorCarrierStarts(directorStarts, directorInjections) {
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
}

function assertDirectorTurnsStayOnCarrier(directorStarts, directorTurns) {
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
}

function requiredDirectorReplayRoles(directorInjections) {
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
  return replayRoles;
}

function providerCarrierLifecycle(starts, injections, turns, carrierKind) {
  const carrierStarts = starts.filter((entry) => entry.carrierKind === carrierKind);
  const threadIds = new Set(carrierStarts.map((entry) => entry.threadId));
  return {
    injections: injections.filter(
      (entry) => entry.carrierKind === carrierKind && threadIds.has(entry.threadId),
    ),
    starts: carrierStarts,
    threadIds,
    turns: turns.filter((entry) => entry.carrierKind === carrierKind),
  };
}

function assertProviderReplayCarriers(injections) {
  const invalidInjection = injections.find(
    (entry) => !["conversation", "director", "side"].includes(entry.carrierKind),
  );
  if (invalidInjection) {
    throw new Error(
      `provider replay targeted an invalid carrier: ${JSON.stringify(invalidInjection)}`,
    );
  }
}

function assertCarrierReplayLifecycle(starts, injections, turns, label) {
  if (starts.length !== injections.length) {
    throw new Error(
      `${label} carrier replay count drifted: ${JSON.stringify({ injections, starts })}`,
    );
  }
  for (const start of starts) {
    assertCarrierReplayInjection(start, injections, label);
  }
  for (const turn of turns) {
    assertCarrierReplayTurn(turn, starts, label);
  }
}

function assertCarrierReplayInjection(start, injections, label) {
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

function assertCarrierReplayTurn(turn, starts, label) {
  const start = starts.find((entry) => entry.threadId === turn.threadId);
  if (!start || start.generation !== turn.generation) {
    throw new Error(`${label} turn escaped its process-local carrier: ${JSON.stringify(turn)}`);
  }
}
