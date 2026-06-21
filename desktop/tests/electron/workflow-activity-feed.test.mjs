/* global console */

import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readJsonLinesOptional,
  reloadPage,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
  pagePointForCanvasPoint,
} from "./workflow-graph-layout-helpers.mjs";
import { createWorkflowProjectionFixture } from "./workflow-projection-smoke-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/workflow-activity-feed.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("workflow-activity-feed");
await writeLatestRecordingPointer("workflow-activity-feed", artifactDir);
const fixture = await createElectronFixture("workflow-activity-feed");
let context = null;
let workflowGraphSurfaceId = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_WORKFLOW_GRAPH_DEBUG: "1",
    },
    fixture,
    visible: options.visible,
  });

  const projection = await createWorkflowProjectionFixture(context.client, fixture.workspaceRoot);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await openWorkflowGraphPane(context.client);
  await waitForSelector(context.client, '[data-testid="workflow-graph"]');
  workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client);
  await waitForWorkflowGraphSnapshot(
    context.client,
    workflowGraphSurfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === projection.definitionId &&
      snapshot.graph.workflow?.workspaceId === projection.workspaceId &&
      snapshot.graph.nodeCount >= 3,
  );

  const definition = await installActivityWorkflow(context.client, projection);
  await waitForWorkflowGraphSnapshot(
    context.client,
    workflowGraphSurfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === projection.definitionId &&
      snapshot.graph.workflow?.definitionName === "Activity feed workflow" &&
      snapshot.graph.nodes.some((node) => node.id === "activity"),
  );
  await waitForWorkflowGraphSnapshot(
    context.client,
    workflowGraphSurfaceId,
    (snapshot) => snapshot.activity.snapshotsLoaded >= 1,
  );
  const beforeActivityRun = await getWorkflowGraphSnapshot(context.client, workflowGraphSurfaceId);
  const pan = await beginActivityCameraPan(context.client, workflowGraphSurfaceId);
  let activityDebug = null;
  let afterContinuedPan = null;
  try {
    await rendererWorkflow(context.client, "startExecution", [
      projection.workspaceId,
      definition.id,
    ]);

    activityDebug = await waitForWorkflowGraphSnapshot(
      context.client,
      workflowGraphSurfaceId,
      (snapshot) =>
        snapshot.activity.snapshotsLoaded >= 1 &&
        snapshot.activity.deltasApplied >= 1 &&
        snapshot.activity.recordsRetained >= 1 &&
        snapshot.activity.activityDeltasDuringCameraMovement >= 1 &&
        snapshot.activity.graphSceneReplacementCheckCount >= 1 &&
        snapshot.activity.markerCreatedCount >= 4 &&
        snapshot.activity.markerUpdatedCount >= 1 &&
        snapshot.render.activityMarkerGraphicsCount >= snapshot.activity.markers.length &&
        activityMarkersHavePhase2BKinds(snapshot.activity.markers),
    );
    afterContinuedPan = await continueActivityCameraPan(
      context.client,
      workflowGraphSurfaceId,
      pan.pageTo,
      activityDebug,
    );
  } finally {
    await releaseActivityCameraPan(context.client, pan.pageTo).catch(() => {});
  }
  assertPhase2BActivityDebug(beforeActivityRun, activityDebug, afterContinuedPan);

  const activitySnapshot = await waitForActivitySnapshot(
    context.client,
    projection.workspaceId,
    (snapshot) => snapshotHasPhase2AActivityKinds(snapshot),
  );
  await submitPendingWorkflowApproval(context.client, activitySnapshot);
  const completedActivityDebug = await waitForWorkflowGraphSnapshot(
    context.client,
    workflowGraphSurfaceId,
    (snapshot) =>
      snapshot.activity.markerUpdatedCount > activityDebug.activity.markerUpdatedCount &&
      activityMarkersShowCompletion(snapshot.activity.markers),
  );
  assertPhase2BCompletionMarkers(completedActivityDebug.activity);
  await captureScreenshot(context.client, join(artifactDir, "activity-feed.png"));

  const consoleRows = await readJsonLinesOptional(join(artifactDir, "renderer-console.jsonl"));
  const consoleErrors = consoleRows.filter((row) => Number(row.level) >= 2);
  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors recorded: ${JSON.stringify(consoleErrors)}`);
  }

  await writeJson(join(artifactDir, "summary.json"), {
    activityDebug: activityDebug.activity,
    completedActivityDebug: completedActivityDebug.activity,
    activityKinds: activitySnapshot.activities.map((activity) => activity.kind),
    activityMarkers: completedActivityDebug.activity.markers,
    artifactDir,
    status: "passed",
  });
  console.log(`workflow activity feed passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    if (workflowGraphSurfaceId) {
      await getWorkflowGraphSnapshot(context.client, workflowGraphSurfaceId)
        .then((snapshot) => writeJson(join(artifactDir, "failure-snapshot.json"), snapshot))
        .catch(() => {});
    }
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

async function installActivityWorkflow(client, projection) {
  const graph = activityWorkflowGraph();
  const validation = await rendererWorkflow(client, "validateDefinition", [
    projection.workspaceId,
    graph,
  ]);
  if (!validation.valid) {
    throw new Error(`activity workflow graph invalid: ${JSON.stringify(validation.diagnostics)}`);
  }
  const definition = await rendererWorkflow(client, "updateDefinition", [
    projection.workspaceId,
    projection.definitionId,
    "Activity feed workflow",
    "Workflow that emits typed activity feed records.",
    graph,
  ]);
  await client.evaluate(
    `window.dispatchEvent(new CustomEvent("setta:workflow-definition-changed", { detail: ${JSON.stringify(
      {
        definitionId: projection.definitionId,
        workspaceId: projection.workspaceId,
      },
    )} }))`,
  );
  return definition;
}

function activityWorkflowGraph() {
  return {
    edges: [
      {
        condition: {
          exitCode: null,
          invert: false,
          kind: "always",
          nodeId: "",
          signalName: "",
          signalValue: "",
          status: null,
        },
        fromNodeId: "start",
        id: "start_activity",
        kind: "normal",
        toNodeId: "activity",
      },
      {
        condition: null,
        fromNodeId: "activity",
        id: "activity_end",
        kind: "normal",
        toNodeId: "end",
      },
    ],
    layout: {
      nodes: [
        { nodeId: "start", x: -280, y: 0 },
        { nodeId: "activity", x: 0, y: 120 },
        { nodeId: "end", x: 280, y: 0 },
      ],
    },
    nodes: [
      {
        action: null,
        gateway: null,
        id: "start",
        kind: "start",
        loopGuard: null,
        title: "Start",
      },
      {
        action: {
          codex: {
            freshConversation: true,
            model: "",
            prompt: "activity feed workflow",
            reasoningEffort: "",
          },
          kind: "agent.codex",
        },
        gateway: null,
        id: "activity",
        kind: "action",
        loopGuard: null,
        title: "Activity",
      },
      {
        action: null,
        gateway: null,
        id: "end",
        kind: "end",
        loopGuard: null,
        title: "End",
      },
    ],
  };
}

async function waitForWorkflowGraphSnapshot(client, surfaceId, predicate, timeoutMs = 20_000) {
  const state = await waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", {
      includeVisual: false,
      surfaceId,
    }),
    (value) => value.ready && predicate(value.snapshot),
    timeoutMs,
  );
  return state.snapshot;
}

async function getWorkflowGraphSnapshot(client, surfaceId) {
  await client.installDriver();
  return client.driver("workflowGraphDebugSnapshot", {
    includeVisual: false,
    surfaceId,
  });
}

async function waitForActivitySnapshot(client, workspaceId, predicate, timeoutMs = 20_000) {
  return waitForState(
    client,
    `window.setta.workspaceActivity.snapshot(${JSON.stringify(workspaceId)}, 100)`,
    predicate,
    timeoutMs,
  );
}

async function submitPendingWorkflowApproval(client, snapshot) {
  const approvalActivity = snapshot.activities.find(
    (activity) =>
      activity.kind === "approval" &&
      activity.status === "waiting_approval" &&
      activity.approval?.approvalId,
  );
  if (!approvalActivity) {
    throw new Error(
      `pending workflow approval activity missing: ${JSON.stringify(snapshot.activities)}`,
    );
  }
  const request = {
    answers: [],
    approvalId: approvalActivity.approval.approvalId,
    approved: true,
    cancelled: false,
    executionId: firstNonEmpty(
      approvalActivity.graphAnchor?.workflowExecutionId ?? "",
      approvalActivity.provenance.workflowExecutionId,
      approvalActivity.detailRef.workflowExecutionId,
    ),
    nodeExecutionId: firstNonEmpty(
      approvalActivity.graphAnchor?.workflowNodeExecutionId ?? "",
      approvalActivity.provenance.workflowNodeExecutionId,
    ),
    response: "",
    workspaceId: approvalActivity.workspaceId,
  };
  if (request.executionId === "" || request.nodeExecutionId === "") {
    throw new Error(
      `pending workflow approval activity is not workflow-scoped: ${JSON.stringify(approvalActivity)}`,
    );
  }
  await client.evaluate(`window.setta.workflow.submitApproval(${JSON.stringify(request)})`);
}

function snapshotHasPhase2AActivityKinds(snapshot) {
  const kinds = new Set(snapshot.activities.map((activity) => activity.kind));
  const hasTypedFileChange = snapshot.activities.some(
    (activity) =>
      activity.kind === "file_change" &&
      activity.fileChange?.paths.length > 0 &&
      activity.fileChange.patchStatus !== "",
  );
  return (
    kinds.has("workflow_status") &&
    kinds.has("command") &&
    kinds.has("approval") &&
    hasTypedFileChange &&
    !kinds.has("diff") &&
    !kinds.has("file_read")
  );
}

function assertPhase2BActivityDebug(beforeRunSnapshot, activitySnapshot, afterContinuedPan) {
  assertActivityInstrumentationObserved(activitySnapshot.activity);
  assertPhase2BMarkerWork(activitySnapshot);
  assertNoActivityGraphReplacement(activitySnapshot.activity);
  assertNoActivityBackendReadsDuringCameraMovement(activitySnapshot.activity);
  assertNoActivityRevisionReload(activitySnapshot.activity);
  assertRendererIdentityStable(beforeRunSnapshot, activitySnapshot);
  assertActivityCameraMovementContinued(activitySnapshot, afterContinuedPan);
}

function assertActivityInstrumentationObserved(activity) {
  if (activity.backendReadCameraMovementCheckCount < 1) {
    throw new Error(
      `activity feed did not probe backend reads during camera movement: ${JSON.stringify(activity)}`,
    );
  }
  if (activity.activityDeltasDuringCameraMovement < 1) {
    throw new Error(
      `activity feed did not apply deltas during camera movement: ${JSON.stringify(activity)}`,
    );
  }
  if (activity.graphSceneReplacementCheckCount < 1) {
    throw new Error(
      `activity feed did not probe graph scene replacement: ${JSON.stringify(activity)}`,
    );
  }
}

function assertPhase2BMarkerWork(snapshot) {
  const activity = snapshot.activity;
  assertPhase2BMarkerCounters(activity);
  assertPhase2BMarkerKinds(activity);
  assertPhase2BMarkerGraphics(snapshot);
  assertPhase2BPendingMarkers(activity);
}

function assertPhase2BMarkerCounters(activity) {
  if (activity.markerCreatedCount < 4) {
    throw new Error(`Phase 2B did not create typed markers: ${JSON.stringify(activity)}`);
  }
  if (activity.markerUpdatedCount < 1) {
    throw new Error(`Phase 2B did not update typed markers: ${JSON.stringify(activity)}`);
  }
}

function assertPhase2BMarkerKinds(activity) {
  if (!activityMarkersHavePhase2BKinds(activity.markers)) {
    throw new Error(`Phase 2B marker kinds are incomplete: ${JSON.stringify(activity.markers)}`);
  }
  if (activity.markers.some((marker) => marker.kind === "file_read" || marker.kind === "diff")) {
    throw new Error(
      `unsupported inferred marker kind rendered: ${JSON.stringify(activity.markers)}`,
    );
  }
}

function assertPhase2BMarkerGraphics(snapshot) {
  const activity = snapshot.activity;
  if (snapshot.render.activityMarkerGraphicsCount < activity.markers.length) {
    throw new Error(
      `renderer marker graphics missing: render=${JSON.stringify(snapshot.render)} markers=${JSON.stringify(activity.markers)}`,
    );
  }
}

function assertPhase2BPendingMarkers(activity) {
  assertPhase2BCommandAndFileAnchors(activity.markers);
  assertPhase2BWaitingApprovalState(activity.markers);
  assertPhase2BCompletedFileState(activity.markers);
}

function assertPhase2BCommandAndFileAnchors(markers) {
  const command = findPhase2BMarker(markers, "command");
  const fileChange = findPhase2BMarker(markers, "file_change");
  if (!isActivityNodeMarker(command) || !isActivityNodeMarker(fileChange)) {
    throw new Error(`typed command/file markers are not anchored: ${JSON.stringify(markers)}`);
  }
}

function assertPhase2BWaitingApprovalState(markers) {
  const approval = findPhase2BMarker(markers, "approval");
  const workflow = findPhase2BMarker(markers, "workflow_status");
  if (
    !isWaitingApprovalMarker(approval) ||
    !isWaitingApprovalMarker(workflow) ||
    !isActivityNodeMarker(workflow)
  ) {
    throw new Error(
      `pending approval markers missing typed waiting state: ${JSON.stringify(markers)}`,
    );
  }
}

function assertPhase2BCompletedFileState(markers) {
  const fileChange = findPhase2BMarker(markers, "file_change");
  if (fileChange?.status !== "completed") {
    throw new Error(`completed typed file marker missing: ${JSON.stringify(markers)}`);
  }
}

function findPhase2BMarker(markers, kind) {
  return markers.find((marker) => marker.kind === kind);
}

function isActivityNodeMarker(marker) {
  return marker?.nodeId === "activity";
}

function isWaitingApprovalMarker(marker) {
  return marker?.status === "waiting_approval";
}

function assertPhase2BCompletionMarkers(activity) {
  if (!activityMarkersShowCompletion(activity.markers)) {
    throw new Error(`terminal typed markers missing: ${JSON.stringify(activity.markers)}`);
  }
}

function assertNoActivityGraphReplacement(activity) {
  if (activity.graphSceneReplacementTouched) {
    throw new Error(`activity feed touched graph scene replacement: ${JSON.stringify(activity)}`);
  }
}

function assertNoActivityBackendReadsDuringCameraMovement(activity) {
  if (activity.backendReadsDuringCameraMovement !== 0) {
    throw new Error(
      `activity feed requested backend reads during camera movement: ${JSON.stringify(activity)}`,
    );
  }
}

function assertNoActivityRevisionReload(activity) {
  if (activity.revisionGapReloads !== 0) {
    throw new Error(
      `activity feed unexpectedly reloaded for revision gaps: ${JSON.stringify(activity)}`,
    );
  }
}

function activityMarkersHavePhase2BKinds(markers) {
  const kinds = new Set(markers.map((marker) => marker.kind));
  return (
    kinds.has("workflow_status") &&
    kinds.has("command") &&
    kinds.has("approval") &&
    kinds.has("file_change") &&
    !kinds.has("diff") &&
    !kinds.has("file_read")
  );
}

function activityMarkersShowCompletion(markers) {
  const command = markers.find(
    (marker) =>
      marker.kind === "command" && marker.nodeId === "activity" && marker.status === "completed",
  );
  const fileChange = markers.find(
    (marker) => marker.kind === "file_change" && marker.nodeId === "activity",
  );
  const approval = markers.find(
    (marker) => marker.kind === "approval" && marker.nodeId === "activity",
  );
  const workflow = markers.find(
    (marker) => marker.kind === "workflow_status" && marker.nodeId === "activity",
  );
  return (
    command !== undefined &&
    fileChange?.status === "completed" &&
    approval?.status === "approved" &&
    workflow?.status === "completed"
  );
}

function assertRendererIdentityStable(before, after) {
  assertRenderCounterUnchanged(before, after, "rendererInstanceId", "recreated the Pixi renderer");
  assertRenderCounterUnchanged(before, after, "canvasCreationCount", "recreated the Pixi canvas");
  assertRenderCounterUnchanged(
    before,
    after,
    "rendererLayerCreationCount",
    "recreated renderer layers",
  );
}

function assertActivityCameraMovementContinued(before, after) {
  if (after === null) {
    throw new Error("activity camera pan continuation snapshot was not captured");
  }
  if (!after.interaction.panningCamera) {
    throw new Error(`camera pan stopped during activity: ${JSON.stringify(after.interaction)}`);
  }
  if (after.render.cameraUpdateCount <= before.render.cameraUpdateCount) {
    throw new Error(
      `camera did not continue moving during activity: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
}

async function beginActivityCameraPan(client, surfaceId) {
  const snapshot = await getWorkflowGraphSnapshot(client, surfaceId);
  const from = emptyCanvasPoint(snapshot);
  const mid = clampCanvasPoint(snapshot, { x: from.x - 64, y: from.y - 36 });
  const to = clampCanvasPoint(snapshot, { x: from.x - 132, y: from.y - 72 });
  const pageFrom = await pagePointForCanvasPoint(client, surfaceId, from);
  const pageMid = await pagePointForCanvasPoint(client, surfaceId, mid);
  const pageTo = await pagePointForCanvasPoint(client, surfaceId, to);
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: pageFrom.x,
    y: pageFrom.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: pageFrom.x,
    y: pageFrom.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    type: "mouseMoved",
    x: pageMid.x,
    y: pageMid.y,
  });
  await waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (candidate) => candidate.interaction.panningCamera,
    5_000,
  );
  return { pageTo };
}

async function continueActivityCameraPan(client, surfaceId, pageTo) {
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    type: "mouseMoved",
    x: pageTo.x,
    y: pageTo.y,
  });
  await delay(100);
  return getWorkflowGraphSnapshot(client, surfaceId);
}

async function releaseActivityCameraPan(client, pageTo) {
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: pageTo.x,
    y: pageTo.y,
  });
  await delay(100);
}

function clampCanvasPoint(snapshot, point) {
  return {
    x: Math.max(12, Math.min(snapshot.canvas.clientWidth - 12, point.x)),
    y: Math.max(12, Math.min(snapshot.canvas.clientHeight - 12, point.y)),
  };
}

function emptyCanvasPoint(snapshot) {
  const candidates = [
    { x: 32, y: snapshot.canvas.clientHeight - 32 },
    { x: snapshot.canvas.clientWidth - 32, y: snapshot.canvas.clientHeight - 32 },
    { x: Math.floor(snapshot.canvas.clientWidth / 2), y: snapshot.canvas.clientHeight - 32 },
  ];
  const point = candidates.find((candidate) =>
    snapshot.graph.nodes.every(
      (node) => !pointInsideNodeScreenBounds(snapshot, node, candidate, 24),
    ),
  );
  if (!point) {
    throw new Error(
      `could not find empty graph canvas point: ${JSON.stringify(snapshot.graph.nodes)}`,
    );
  }
  return point;
}

function pointInsideNodeScreenBounds(snapshot, node, point, padding = 0) {
  const halfWidth = (node.width * snapshot.camera.zoom) / 2;
  const halfHeight = (node.height * snapshot.camera.zoom) / 2;
  return (
    point.x >= node.screenX - halfWidth - padding &&
    point.x <= node.screenX + halfWidth + padding &&
    point.y >= node.screenY - halfHeight - padding &&
    point.y <= node.screenY + halfHeight + padding
  );
}

function firstNonEmpty(...values) {
  return values.find((value) => value !== "") ?? "";
}

function assertRenderCounterUnchanged(before, after, counter, label) {
  if (after.render[counter] !== before.render[counter]) {
    throw new Error(
      `activity marker update ${label}: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}
