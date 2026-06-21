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

  const definition = await createActivityWorkflow(context.client, projection.workspaceId);
  await waitForWorkflowGraphSnapshot(
    context.client,
    workflowGraphSurfaceId,
    (snapshot) => snapshot.activity.snapshotsLoaded >= 1,
  );
  const pan = await beginActivityCameraPan(context.client, workflowGraphSurfaceId);
  let activityDebug = null;
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
        snapshot.activity.graphSceneReplacementCheckCount >= 1,
    );
  } finally {
    await releaseActivityCameraPan(context.client, pan.pageTo).catch(() => {});
  }
  assertPhase2AActivityDebug(activityDebug.activity);

  const activitySnapshot = await waitForActivitySnapshot(
    context.client,
    projection.workspaceId,
    (snapshot) => snapshotHasPhase2AActivityKinds(snapshot),
  );
  await captureScreenshot(context.client, join(artifactDir, "activity-feed.png"));

  const consoleRows = await readJsonLinesOptional(join(artifactDir, "renderer-console.jsonl"));
  const consoleErrors = consoleRows.filter((row) => Number(row.level) >= 2);
  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors recorded: ${JSON.stringify(consoleErrors)}`);
  }

  await writeJson(join(artifactDir, "summary.json"), {
    activityDebug: activityDebug.activity,
    activityKinds: activitySnapshot.activities.map((activity) => activity.kind),
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

async function createActivityWorkflow(client, workspaceId) {
  const graph = activityWorkflowGraph();
  const validation = await rendererWorkflow(client, "validateDefinition", [workspaceId, graph]);
  if (!validation.valid) {
    throw new Error(`activity workflow graph invalid: ${JSON.stringify(validation.diagnostics)}`);
  }
  return rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Activity feed workflow",
    "Workflow that emits typed activity feed records.",
    graph,
  ]);
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

function assertPhase2AActivityDebug(activity) {
  assertActivityInstrumentationObserved(activity);
  assertNoPhase2AMarkerWork(activity);
  assertNoPhase2AGraphReplacement(activity);
  assertNoPhase2ABackendReadsDuringCameraMovement(activity);
  assertNoPhase2ARevisionReload(activity);
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

function assertNoPhase2AMarkerWork(activity) {
  if (activity.markerCreatedCount !== 0 || activity.markerUpdatedCount !== 0) {
    throw new Error(`Phase 2A created markers: ${JSON.stringify(activity)}`);
  }
  if (activity.markerRetainedCount !== 0 || activity.markerRemovedCount !== 0) {
    throw new Error(`Phase 2A mutated marker counters: ${JSON.stringify(activity)}`);
  }
}

function assertNoPhase2AGraphReplacement(activity) {
  if (activity.graphSceneReplacementTouched) {
    throw new Error(`activity feed touched graph scene replacement: ${JSON.stringify(activity)}`);
  }
}

function assertNoPhase2ABackendReadsDuringCameraMovement(activity) {
  if (activity.backendReadsDuringCameraMovement !== 0) {
    throw new Error(
      `activity feed requested backend reads during camera movement: ${JSON.stringify(activity)}`,
    );
  }
}

function assertNoPhase2ARevisionReload(activity) {
  if (activity.revisionGapReloads !== 0) {
    throw new Error(
      `activity feed unexpectedly reloaded for revision gaps: ${JSON.stringify(activity)}`,
    );
  }
}

async function beginActivityCameraPan(client, surfaceId) {
  const snapshot = await getWorkflowGraphSnapshot(client, surfaceId);
  const from = emptyCanvasPoint(snapshot);
  const to = clampCanvasPoint(snapshot, { x: from.x - 132, y: from.y - 72 });
  const pageFrom = await pagePointForCanvasPoint(client, surfaceId, from);
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
    x: pageTo.x,
    y: pageTo.y,
  });
  await waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (candidate) => candidate.interaction.panningCamera,
    5_000,
  );
  return { pageTo };
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

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}
