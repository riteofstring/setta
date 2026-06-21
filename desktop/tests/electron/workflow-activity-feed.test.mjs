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
const phase3WaitingApprovalExpectation = {
  edges: [["start_activity", "completed"]],
  markers: [
    ["approval", "waiting_approval"],
    ["workflow_status", "waiting_approval"],
    ["command", "running"],
    ["command", "completed"],
    ["file_change", "completed"],
  ],
  nodes: [["activity", "waiting_approval"]],
};
const phase3CompletedExpectation = {
  edges: [["activity_end", "completed"]],
  markers: [
    ["approval", "completed"],
    ["workflow_status", "completed"],
  ],
  nodes: [["activity", "completed"]],
};
const phase3FailedExpectation = {
  edges: [
    ["start_activity", "completed"],
    ["activity_end", "idle"],
  ],
  markers: [["workflow_status", "failed"]],
  nodes: [["activity", "failed"]],
};
const phase3CancelledExpectation = {
  edges: [
    ["start_activity", "completed"],
    ["activity_end", "idle"],
  ],
  markers: [["workflow_status", "cancelled"]],
  nodes: [["activity", "cancelled"]],
};

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

  const failedVisualDebug = await runFailedVisualWorkflow(
    context.client,
    workflowGraphSurfaceId,
    projection,
  );
  await captureScreenshot(context.client, join(artifactDir, "activity-feed-failed.png"));

  workflowGraphSurfaceId = await reloadWorkflowGraphPane(context.client);
  const cancelledVisualDebug = await runCancelledVisualWorkflow(
    context.client,
    workflowGraphSurfaceId,
    projection,
  );
  await captureScreenshot(context.client, join(artifactDir, "activity-feed-cancelled.png"));

  workflowGraphSurfaceId = await reloadWorkflowGraphPane(context.client);
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
  assertPhase3IdleVisualGrammar(beforeActivityRun);
  await captureScreenshot(context.client, join(artifactDir, "activity-feed-idle.png"));
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
        markerMaterializationRevisitedExistingMarkers(snapshot.activity) &&
        activityMarkerGraphicsMatch(snapshot) &&
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
  const waitingVisualDebug = await waitForWorkflowGraphSnapshot(
    context.client,
    workflowGraphSurfaceId,
    phase3WaitingApprovalVisualGrammarReady,
  );
  assertPhase3WaitingApprovalVisualGrammar(waitingVisualDebug);
  await captureScreenshot(context.client, join(artifactDir, "activity-feed-waiting-approval.png"));

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
      activityMarkersShowCompletion(snapshot.activity.markers) &&
      phase3CompletedVisualGrammarReady(snapshot),
  );
  assertPhase2BCompletionMarkers(completedActivityDebug.activity);
  assertPhase3CompletedVisualGrammar(completedActivityDebug);
  await captureScreenshot(context.client, join(artifactDir, "activity-feed-completed.png"));

  const consoleRows = await readJsonLinesOptional(join(artifactDir, "renderer-console.jsonl"));
  const consoleErrors = consoleRows.filter((row) => Number(row.level) >= 2);
  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors recorded: ${JSON.stringify(consoleErrors)}`);
  }

  await writeJson(join(artifactDir, "summary.json"), {
    activityDebug: activityDebug.activity,
    completedActivityDebug: completedActivityDebug.activity,
    cancelledVisualGrammar: cancelledVisualDebug.visualGrammar,
    failedVisualGrammar: failedVisualDebug.visualGrammar,
    activityKinds: activitySnapshot.activities.map((activity) => activity.kind),
    activityMarkers: completedActivityDebug.activity.markers,
    visualGrammar: completedActivityDebug.visualGrammar,
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
  return installVisualWorkflow(client, projection, {
    description: "Workflow that emits typed activity feed records.",
    graph: activityWorkflowGraph("activity feed workflow"),
    name: "Activity feed workflow",
  });
}

async function installVisualWorkflow(client, projection, { description, graph, name }) {
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
    name,
    description,
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

async function reloadWorkflowGraphPane(client) {
  await reloadPage(client);
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await openWorkflowGraphPane(client);
  await waitForSelector(client, '[data-testid="workflow-graph"]');
  return maximizeWorkflowGraphPane(client);
}

async function waitForWorkflowDraft(client, surfaceId, definitionName) {
  await waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.definitionName === definitionName &&
      snapshot.graph.workflow?.viewMode === "draft" &&
      snapshot.graph.nodes.some((node) => node.id === "activity"),
  );
}

async function runFailedVisualWorkflow(client, surfaceId, projection) {
  const definition = await installVisualWorkflow(client, projection, {
    description: "Workflow that deterministically fails for visual grammar evidence.",
    graph: activityWorkflowGraph("fail active workflow"),
    name: "Failed visual workflow",
  });
  await waitForWorkflowDraft(client, surfaceId, "Failed visual workflow");
  const started = await rendererWorkflow(client, "startExecution", [
    projection.workspaceId,
    definition.id,
  ]);
  const running = await waitForWorkflowExecution(
    client,
    projection.workspaceId,
    started.id,
    runningActivityExecutionReady,
  );
  await steerWorkflowActivity(client, projection.workspaceId, running, "trigger scripted failure");
  const snapshot = await waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    phase3FailedVisualGrammarReady,
  );
  assertPhase3FailedVisualGrammar(snapshot);
  return snapshot;
}

async function runCancelledVisualWorkflow(client, surfaceId, projection) {
  const definition = await installVisualWorkflow(client, projection, {
    description: "Workflow that deterministically cancels for visual grammar evidence.",
    graph: activityWorkflowGraph("cancel active workflow"),
    name: "Cancelled visual workflow",
  });
  await waitForWorkflowDraft(client, surfaceId, "Cancelled visual workflow");
  const started = await rendererWorkflow(client, "startExecution", [
    projection.workspaceId,
    definition.id,
  ]);
  await waitForWorkflowExecution(
    client,
    projection.workspaceId,
    started.id,
    runningActivityExecutionReady,
  );
  await rendererWorkflow(client, "cancelExecution", [projection.workspaceId, started.id]);
  const snapshot = await waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    phase3CancelledVisualGrammarReady,
  );
  assertPhase3CancelledVisualGrammar(snapshot);
  return snapshot;
}

function activityWorkflowGraph(prompt) {
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
            prompt,
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

async function waitForWorkflowExecution(client, workspaceId, executionId, predicate) {
  return waitForState(
    client,
    `window.setta.workflow.readExecution(${JSON.stringify(workspaceId)}, ${JSON.stringify(executionId)})`,
    predicate,
  );
}

async function steerWorkflowActivity(client, workspaceId, execution, prompt) {
  const nodeExecution = latestNodeExecution(execution, "activity");
  const conversationId = runnerRef(nodeExecution, "chat.conversation");
  if (conversationId === "") {
    throw new Error(
      `running workflow activity missing chat conversation: ${JSON.stringify(execution)}`,
    );
  }
  await rendererChat(client, "steerMessage", [workspaceId, conversationId, prompt]);
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

function assertPhase3IdleVisualGrammar(snapshot) {
  assertVisualGrammarShape(snapshot);
  assertNodeVisualState(snapshot, "start", "idle");
  assertNodeVisualState(snapshot, "activity", "idle");
  assertNodeVisualState(snapshot, "end", "idle");
  assertEdgeVisualState(snapshot, "start_activity", "idle");
  assertEdgeVisualState(snapshot, "activity_end", "idle");
}

function phase3WaitingApprovalVisualGrammarReady(snapshot) {
  return visualGrammarMatches(snapshot, phase3WaitingApprovalExpectation);
}

function assertPhase3WaitingApprovalVisualGrammar(snapshot) {
  assertVisualGrammarShape(snapshot);
  assertNodeVisualState(snapshot, "start", "completed");
  assertNodeVisualState(snapshot, "activity", "waiting_approval");
  assertNodeVisualState(snapshot, "end", "idle");
  assertEdgeVisualState(snapshot, "start_activity", "completed");
  assertEdgeVisualState(snapshot, "activity_end", "idle");
  assertMarkerVisualState(snapshot, "approval", "waiting_approval");
  assertMarkerVisualState(snapshot, "workflow_status", "waiting_approval");
  assertMarkerVisualState(snapshot, "command", "running");
  assertMarkerVisualState(snapshot, "command", "completed");
  assertMarkerVisualState(snapshot, "file_change", "completed");
}

function phase3CompletedVisualGrammarReady(snapshot) {
  return visualGrammarMatches(snapshot, phase3CompletedExpectation);
}

function assertPhase3CompletedVisualGrammar(snapshot) {
  assertVisualGrammarShape(snapshot);
  assertNodeVisualState(snapshot, "start", "completed");
  assertNodeVisualState(snapshot, "activity", "completed");
  assertNodeVisualState(snapshot, "end", "completed");
  assertEdgeVisualState(snapshot, "start_activity", "completed");
  assertEdgeVisualState(snapshot, "activity_end", "completed");
  assertMarkerVisualState(snapshot, "approval", "completed");
  assertMarkerVisualState(snapshot, "workflow_status", "completed");
  assertMarkerVisualState(snapshot, "command", "completed");
  assertMarkerVisualState(snapshot, "file_change", "completed");
}

function phase3FailedVisualGrammarReady(snapshot) {
  return visualGrammarMatches(snapshot, phase3FailedExpectation);
}

function assertPhase3FailedVisualGrammar(snapshot) {
  assertVisualGrammarShape(snapshot);
  assertNodeVisualState(snapshot, "start", "completed");
  assertNodeVisualState(snapshot, "activity", "failed");
  assertNodeVisualState(snapshot, "end", "idle");
  assertEdgeVisualState(snapshot, "start_activity", "completed");
  assertEdgeVisualState(snapshot, "activity_end", "idle");
  assertMarkerVisualState(snapshot, "workflow_status", "failed");
}

function phase3CancelledVisualGrammarReady(snapshot) {
  return visualGrammarMatches(snapshot, phase3CancelledExpectation);
}

function assertPhase3CancelledVisualGrammar(snapshot) {
  assertVisualGrammarShape(snapshot);
  assertNodeVisualState(snapshot, "start", "completed");
  assertNodeVisualState(snapshot, "activity", "cancelled");
  assertNodeVisualState(snapshot, "end", "idle");
  assertEdgeVisualState(snapshot, "start_activity", "completed");
  assertEdgeVisualState(snapshot, "activity_end", "idle");
  assertMarkerVisualState(snapshot, "workflow_status", "cancelled");
}

function assertVisualGrammarShape(snapshot) {
  if (
    snapshot.visualGrammar?.nodeStatesById === undefined ||
    snapshot.visualGrammar?.edgeStatesById === undefined ||
    snapshot.visualGrammar?.activityMarkerStatesById === undefined
  ) {
    throw new Error(`visual grammar debug snapshot missing: ${JSON.stringify(snapshot)}`);
  }
}

function assertNodeVisualState(snapshot, nodeId, state) {
  const actual = snapshot.visualGrammar.nodeStatesById[nodeId];
  if (actual?.state !== state) {
    throw new Error(
      `node ${nodeId} visual state = ${JSON.stringify(actual)}, want ${state}: ${JSON.stringify(snapshot.visualGrammar.nodeStatesById)}`,
    );
  }
}

function assertEdgeVisualState(snapshot, edgeId, state) {
  const actual = snapshot.visualGrammar.edgeStatesById[edgeId];
  if (actual?.state !== state) {
    throw new Error(
      `edge ${edgeId} visual state = ${JSON.stringify(actual)}, want ${state}: ${JSON.stringify(snapshot.visualGrammar.edgeStatesById)}`,
    );
  }
}

function assertMarkerVisualState(snapshot, kind, state) {
  if (!markerVisualStateMatches(snapshot, kind, state)) {
    throw new Error(
      `marker ${kind} visual state missing ${state}: ${JSON.stringify(snapshot.visualGrammar.activityMarkerStatesById)}`,
    );
  }
}

function markerVisualStateMatches(snapshot, kind, state) {
  return Object.values(snapshot.visualGrammar?.activityMarkerStatesById ?? {}).some(
    (visualState) => visualState.channels?.kindShape === kind && visualState.state === state,
  );
}

function visualGrammarMatches(snapshot, expectation) {
  return (
    visualStatesByIdMatch(snapshot.visualGrammar?.nodeStatesById, expectation.nodes) &&
    visualStatesByIdMatch(snapshot.visualGrammar?.edgeStatesById, expectation.edges) &&
    expectation.markers.every(([kind, state]) => markerVisualStateMatches(snapshot, kind, state))
  );
}

function visualStatesByIdMatch(statesById, expectedStates) {
  return expectedStates.every(([id, state]) => statesById?.[id]?.state === state);
}

function runningActivityExecutionReady(execution) {
  const nodeExecution = latestNodeExecution(execution, "activity");
  return (
    nodeExecution?.status === "running" && runnerRef(nodeExecution, "chat.conversation") !== ""
  );
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
  if (!markerMaterializationRevisitedExistingMarkers(activity)) {
    throw new Error(`Phase 2B did not revisit typed markers: ${JSON.stringify(activity)}`);
  }
}

function markerMaterializationRevisitedExistingMarkers(activity) {
  return activity.markerRetainedCount + activity.markerUpdatedCount >= 1;
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
  if (!activityMarkerGraphicsMatch(snapshot)) {
    throw new Error(
      `renderer marker graphics mismatch: render=${JSON.stringify(snapshot.render)} markers=${JSON.stringify(activity.markers)}`,
    );
  }
}

function activityMarkerGraphicsMatch(snapshot) {
  return snapshot.render.activityMarkerGraphicsCount === snapshot.activity.markers.length;
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

function latestNodeExecution(execution, nodeId) {
  return (
    execution.nodeExecutions.filter((nodeExecution) => nodeExecution.nodeId === nodeId).at(-1) ??
    null
  );
}

function runnerRef(nodeExecution, kind) {
  return nodeExecution?.runnerRefs.find((ref) => ref.kind === kind)?.id ?? "";
}

async function rendererChat(client, method, args) {
  return client.evaluate(
    `window.setta.chat[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}
