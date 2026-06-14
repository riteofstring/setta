/* global console */

import { spawn } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readJsonLinesOptional,
  reloadPage,
  repoRoot,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
  pagePointForCanvasPoint,
} from "./workflow-graph-layout-helpers.mjs";
import { createWorkflowProjectionFixture } from "./workflow-projection-smoke-helpers.mjs";
import {
  captureWorkflowGraphFitContactSheet,
  dispatchRecordedWorkflowGraphMouseDrag,
  dispatchRecordedWorkflowGraphWheel,
  dispatchRecordedWorkflowGraphWheelBurst,
  getWorkflowGraphDebugSnapshot,
  recordWorkflowGraphPanZoomDiagnostics,
} from "./workflow-graph-performance-recording.mjs";

const scenarioNames = new Set(["active", "baseline", "large", "small-trackpad"]);
const largeNodeCounts = [500, 1000, 2500, 5000];
const largeSyntheticScenes = ["workflow", "semantic-cells"];
const scenarioTimeoutMs = 120_000;
const requiredTimingBuckets = [
  "animation-active-set-recompute",
  "animated-glow-redraw",
  "commit-camera-change",
  "edge-label-redraw",
  "edge-redraw",
  "filter-area-sync",
  "grid-redraw",
  "label-position-sync",
  "label-visibility-sync",
  "pixi-render",
  "scene-graph-node-diff-update-rebuild",
  "static-glow-redraw",
];

const options = parseGraphRecordingArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    `Usage: node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario <baseline|active|large|small-trackpad> [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]`,
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const recordingName = `workflow-graph-pan-zoom-${options.scenario}`;
const artifactRoot = options.artifactDir || timestampedRecordingDir(recordingName);
await writeLatestRecordingPointer(recordingName, artifactRoot);

try {
  const summaries =
    options.scenario === "large"
      ? await runLargeScenarios()
      : [await runScenario({ artifactDir: artifactRoot, scenario: options.scenario })];
  await writeJson(join(artifactRoot, "summary.json"), {
    artifactRoot,
    scenarios: summaries,
    status: "passed",
  });
  console.log(`${recordingName} recording passed: ${artifactRoot}`);
} catch (error) {
  await writeJson(join(artifactRoot, "summary.json"), {
    artifactRoot,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
}

async function runLargeScenarios() {
  const summaries = [];
  for (const syntheticScene of largeSyntheticScenes) {
    for (const nodeCount of largeNodeCounts) {
      const artifactDir = join(artifactRoot, syntheticScene, `${nodeCount}-nodes`);
      summaries.push(
        await runScenario({
          artifactDir,
          nodeCount,
          scenario: "large",
          syntheticScene,
        }),
      );
      await writeJson(join(artifactRoot, "summary.json"), {
        artifactRoot,
        scenarios: summaries,
        status: "running",
      });
    }
  }
  return summaries;
}

async function runScenario({ artifactDir, nodeCount = 0, scenario, syntheticScene = "workflow" }) {
  const fixture = await createElectronFixture(
    `workflow-graph-pan-zoom-${scenario}${nodeCount ? `-${nodeCount}` : ""}`,
  );
  let context = null;
  let workflowGraphSurfaceId = null;
  try {
    await prepareScenarioBeforeLaunch({ fixture, scenario });
    context = await launchElectronCdpContext({
      artifactDir,
      extraEnv: launchEnvForScenario({ nodeCount, scenario, syntheticScene }),
      fixture,
      visible: options.visible,
    });
    await prepareScenarioAfterLaunch({ context, fixture, scenario });
    await waitForSelector(
      context.client,
      '[data-testid="workspace-layout-area"]',
      scenarioTimeoutMs,
    );
    await openWorkflowGraphPane(context.client, { timeoutMs: scenarioTimeoutMs });
    await waitForSelector(context.client, '[data-testid="workflow-graph"]', scenarioTimeoutMs);
    workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client, {
      timeoutMs: scenarioTimeoutMs,
    });
    const initial = await waitForWorkflowGraphSnapshot(context.client, workflowGraphSurfaceId, {
      nodeCount,
      scenario,
    });
    await captureScreenshot(context.client, join(artifactDir, "initial.png"));
    const hitTesting = await verifyWorkflowGraphHitTesting({
      client: context.client,
      snapshot: initial,
      surfaceId: workflowGraphSurfaceId,
    });
    const contactSheet = await captureWorkflowGraphFitContactSheet({
      artifactDir,
      client: context.client,
      name: "fit-to-view",
      surfaceId: workflowGraphSurfaceId,
    });
    const artifacts = await recordWorkflowGraphPanZoomDiagnostics({
      artifactDir,
      client: context.client,
      interaction: ({ inputSamples }) =>
        exerciseScenarioPanZoom({
          client: context.client,
          inputSamples,
          scenario,
          surfaceId: workflowGraphSurfaceId,
        }),
      name: "pan-zoom",
      surfaceId: workflowGraphSurfaceId,
    });
    await delay(250);
    const final = await getWorkflowGraphDebugSnapshot(
      context.client,
      workflowGraphSurfaceId,
      false,
    );
    assertPhase0DebugSnapshot(final, { nodeCount, scenario });
    await assertNoRendererConsoleErrors(artifactDir);
    await captureScreenshot(context.client, join(artifactDir, "final.png"));
    const summary = {
      artifactDir,
      artifacts: {
        ...artifacts,
        contactSheet: contactSheet.htmlPath,
        finalScreenshot: join(artifactDir, "final.png"),
        initialScreenshot: join(artifactDir, "initial.png"),
      },
      final: summarizeSnapshot(final),
      hitTesting,
      initial: summarizeSnapshot(initial),
      nodeCount: final.graph.nodeCount,
      scenario,
      status: "passed",
      syntheticScene,
    };
    await writeJson(join(artifactDir, "summary.json"), summary);
    return summary;
  } catch (error) {
    if (context) {
      await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
      if (workflowGraphSurfaceId) {
        await getWorkflowGraphDebugSnapshot(context.client, workflowGraphSurfaceId, false)
          .then((snapshot) => writeJson(join(artifactDir, "failure-snapshot.json"), snapshot))
          .catch(() => {});
      }
    }
    await writeJson(join(artifactDir, "summary.json"), {
      artifactDir,
      error: error instanceof Error ? error.message : String(error),
      scenario,
      status: "failed",
    });
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

function scenarioUsesWorkflowProjectionFixture(scenario) {
  return scenario === "baseline" || scenario === "small-trackpad";
}

async function prepareScenarioBeforeLaunch({ fixture, scenario }) {
  if (scenario === "baseline") {
    await seedSemanticGraphFixture(fixture);
  }
}

async function prepareScenarioAfterLaunch({ context, fixture, scenario }) {
  if (!scenarioUsesWorkflowProjectionFixture(scenario)) {
    return;
  }
  await createWorkflowProjectionFixture(context.client, fixture.workspaceRoot);
  await reloadPage(context.client);
}

async function exerciseScenarioPanZoom({ client, inputSamples, scenario, surfaceId }) {
  if (scenario === "small-trackpad") {
    await exerciseSmallTrackpadPanZoom(client, surfaceId, inputSamples);
    return;
  }
  await exercisePanZoom(client, surfaceId, inputSamples);
}

async function exercisePanZoom(client, surfaceId, inputSamples) {
  const snapshot = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
  const center = {
    x: Math.floor(snapshot.canvas.clientWidth / 2),
    y: Math.floor(snapshot.canvas.clientHeight / 2),
  };
  const largeSyntheticScene = snapshot.graph.nodeCount >= 100;
  let panStart = {
    x: Math.max(40, snapshot.canvas.clientWidth - 180),
    y: Math.max(40, snapshot.canvas.clientHeight - 110),
  };
  if (largeSyntheticScene) {
    await dispatchRecordedWorkflowGraphWheel(
      client,
      surfaceId,
      {
        deltaX: -2600,
        deltaY: -1600,
        x: center.x,
        y: center.y,
      },
      inputSamples,
    );
    const shifted = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
    panStart = largeSceneBackgroundPanStart(shifted);
  }
  await dispatchRecordedWorkflowGraphMouseDrag(
    client,
    surfaceId,
    {
      from: panStart,
      steps: 18,
      to: { x: panStart.x - 180, y: panStart.y - 96 },
    },
    inputSamples,
  );
  await dispatchRecordedWorkflowGraphWheel(
    client,
    surfaceId,
    {
      deltaY: -420,
      x: center.x,
      y: center.y,
    },
    inputSamples,
  );
  await dispatchRecordedWorkflowGraphWheel(
    client,
    surfaceId,
    {
      deltaX: 180,
      deltaY: 96,
      x: center.x,
      y: center.y,
    },
    inputSamples,
  );
  await dispatchRecordedWorkflowGraphWheel(
    client,
    surfaceId,
    {
      deltaY: 360,
      x: center.x,
      y: center.y,
    },
    inputSamples,
  );
}

async function exerciseSmallTrackpadPanZoom(client, surfaceId, inputSamples) {
  const snapshot = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
  const center = {
    x: Math.floor(snapshot.canvas.clientWidth / 2),
    y: Math.floor(snapshot.canvas.clientHeight / 2),
  };
  await dispatchRecordedWorkflowGraphWheelBurst(
    client,
    surfaceId,
    {
      events: trackpadPanEvents(),
      x: center.x,
      y: center.y,
    },
    inputSamples,
  );
  await delay(160);
  await dispatchRecordedWorkflowGraphWheelBurst(
    client,
    surfaceId,
    {
      events: trackpadPinchEvents(),
      modifiers: 2,
      x: center.x,
      y: center.y,
    },
    inputSamples,
  );
  await delay(180);
}

function trackpadPanEvents() {
  return [
    { delayMs: 8, deltaX: 2, deltaY: 1, phase: "start" },
    { delayMs: 8, deltaX: 6, deltaY: 3, phase: "active" },
    { delayMs: 8, deltaX: 10, deltaY: 5, phase: "active" },
    { delayMs: 8, deltaX: 14, deltaY: 7, phase: "active" },
    { delayMs: 10, deltaX: 10, deltaY: 5, phase: "active" },
    { delayMs: 14, deltaX: 5, deltaY: 3, phase: "tail" },
    { delayMs: 20, deltaX: 2, deltaY: 1, phase: "tail" },
    { delayMs: 28, deltaX: 1, deltaY: 0.5, phase: "tail" },
  ];
}

function trackpadPinchEvents() {
  return [
    { delayMs: 8, deltaY: -0.8, phase: "start" },
    { delayMs: 8, deltaY: -1.8, phase: "active" },
    { delayMs: 8, deltaY: -3.2, phase: "active" },
    { delayMs: 8, deltaY: -5.4, phase: "active" },
    { delayMs: 8, deltaY: -7.2, phase: "active" },
    { delayMs: 10, deltaY: -5.2, phase: "active" },
    { delayMs: 14, deltaY: -2.4, phase: "tail" },
    { delayMs: 20, deltaY: -1.1, phase: "tail" },
    { delayMs: 28, deltaY: -0.4, phase: "tail" },
  ];
}

function largeSceneBackgroundPanStart(snapshot) {
  const candidates = [];
  const margin = 40;
  const step = 16;
  for (let y = margin; y <= snapshot.canvas.clientHeight - margin; y += step) {
    for (let x = margin; x <= snapshot.canvas.clientWidth - margin; x += step) {
      const point = { x, y };
      const nodePortClearance = pointNodePortClearance(point, snapshot);
      if (nodePortClearance > 4) {
        candidates.push({ nodePortClearance, point });
      }
    }
  }
  candidates.sort((left, right) => right.nodePortClearance - left.nodePortClearance);
  const edgeSegments = edgeScreenSegments(snapshot);
  let best = null;
  for (const candidate of candidates.slice(0, 800)) {
    const edgeClearance = pointEdgeClearance(candidate.point, edgeSegments);
    const score = Math.min(candidate.nodePortClearance, edgeClearance);
    if (best === null || score > best.score) {
      best = { edgeClearance, score, ...candidate };
    }
    if (edgeClearance > 2) {
      return candidate.point;
    }
  }
  throw new Error(
    `could not find large-scene background pan point: ${JSON.stringify({
      best,
      candidateCount: candidates.length,
      nodeCount: snapshot.graph.nodeCount,
    })}`,
  );
}

function pointNodePortClearance(point, snapshot) {
  let clearance = Infinity;
  for (const node of snapshot.graph.nodes) {
    clearance = Math.min(clearance, pointNodeClearance(point, node, snapshot.camera.zoom));
    for (const port of node.ports) {
      clearance = Math.min(
        clearance,
        Math.hypot(point.x - port.screenX, point.y - port.screenY) - 18,
      );
    }
  }
  return clearance;
}

function pointNodeClearance(point, node, zoom) {
  const dx = Math.abs(point.x - node.screenX) - (node.width * zoom) / 2;
  const dy = Math.abs(point.y - node.screenY) - (node.height * zoom) / 2;
  if (dx <= 0 && dy <= 0) {
    return Math.max(dx, dy);
  }
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

function edgeScreenSegments(snapshot) {
  const nodesById = new Map(snapshot.graph.nodes.map((node) => [node.id, node]));
  const segments = [];
  for (const edge of snapshot.graph.edges) {
    const source = nodesById.get(edge.sourceNodeId);
    const target = nodesById.get(edge.targetNodeId);
    const start = source?.ports.find((port) => port.id === edge.sourcePortId);
    const end = target?.ports.find((port) => port.id === edge.targetPortId);
    if (!start || !end) {
      continue;
    }
    let previous = edgeScreenPointAt(start, end, 0, snapshot.camera);
    for (let index = 1; index <= 28; index += 1) {
      const next = edgeScreenPointAt(start, end, index / 28, snapshot.camera);
      segments.push([previous, next]);
      previous = next;
    }
  }
  return segments;
}

function edgeScreenPointAt(start, end, t, camera) {
  const controlOffset = Math.max(80, Math.abs(end.x - start.x) * 0.35);
  const oneMinusT = 1 - t;
  const oneMinusTSquared = oneMinusT * oneMinusT;
  const tSquared = t * t;
  return worldToScreen(
    {
      x:
        oneMinusTSquared * oneMinusT * start.x +
        3 * oneMinusTSquared * t * (start.x + controlOffset) +
        3 * oneMinusT * tSquared * (end.x - controlOffset) +
        tSquared * t * end.x,
      y:
        oneMinusTSquared * oneMinusT * start.y +
        3 * oneMinusTSquared * t * start.y +
        3 * oneMinusT * tSquared * end.y +
        tSquared * t * end.y,
    },
    camera,
  );
}

function worldToScreen(world, camera) {
  return {
    x: (world.x - camera.x) * camera.zoom,
    y: (world.y - camera.y) * camera.zoom,
  };
}

function pointEdgeClearance(point, segments) {
  let clearance = Infinity;
  for (const [start, end] of segments) {
    clearance = Math.min(clearance, pointToSegmentDistance(point, start, end) - 8);
  }
  return clearance;
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

async function verifyWorkflowGraphHitTesting({ client, snapshot, surfaceId }) {
  const target = hitTestTargetNode(snapshot);
  if (!target) {
    throw new Error(
      `workflow graph hit test could not find a materialized node target: ${JSON.stringify({
        materializedNodeCount: snapshot.render.materializedNodeCount,
        nodeCount: snapshot.graph.nodeCount,
        visibleMaterializedNodeCount: snapshot.render.lastVisibleMaterializedNodeCount,
      })}`,
    );
  }
  await dispatchWorkflowGraphMouseClick(client, surfaceId, target.point);
  await delay(32);
  const selected = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
  if (!selected.interaction.selectedNodeIds.includes(target.nodeId)) {
    throw new Error(
      `workflow graph node hit test failed: target=${JSON.stringify(target)} selected=${JSON.stringify(
        selected.interaction.selectedNodeIds,
      )}`,
    );
  }
  await client.driver("dispatchDocumentEscape");
  await delay(32);
  const cleared = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
  if (cleared.interaction.selectedNodeIds.length !== 0) {
    throw new Error(
      `workflow graph selection cleanup failed after hit test: selected=${JSON.stringify(
        cleared.interaction.selectedNodeIds,
      )}`,
    );
  }
  return {
    cleanup: "escape",
    nodeId: target.nodeId,
    nodePoint: target.point,
    ok: true,
    selectedNodeCountAfterClear: cleared.interaction.selectedNodeIds.length,
    visibleMaterializedNodeCount: snapshot.render.lastVisibleMaterializedNodeCount,
  };
}

function hitTestTargetNode(snapshot) {
  const candidates = snapshot.graph.nodes
    .filter((node) => node.materialized === true)
    .filter((node) => pointInsideCanvas({ x: node.screenX, y: node.screenY }, snapshot.canvas));
  if (candidates.length === 0) {
    return null;
  }
  const canvasCenter = {
    x: snapshot.canvas.clientWidth / 2,
    y: snapshot.canvas.clientHeight / 2,
  };
  candidates.sort(
    (left, right) =>
      pointDistance({ x: left.screenX, y: left.screenY }, canvasCenter) -
      pointDistance({ x: right.screenX, y: right.screenY }, canvasCenter),
  );
  const node = candidates[0];
  return {
    nodeId: node.id,
    point: {
      x: Math.round(node.screenX),
      y: Math.round(node.screenY),
    },
  };
}

function pointInsideCanvas(point, canvas) {
  return (
    point.x >= 4 &&
    point.x <= canvas.clientWidth - 4 &&
    point.y >= 4 &&
    point.y <= canvas.clientHeight - 4
  );
}

function pointDistance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

async function dispatchWorkflowGraphMouseClick(client, surfaceId, canvasPoint) {
  const pagePoint = await pagePointForCanvasPoint(client, surfaceId, canvasPoint);
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: pagePoint.x,
    y: pagePoint.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: pagePoint.x,
    y: pagePoint.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: pagePoint.x,
    y: pagePoint.y,
  });
}

async function waitForWorkflowGraphSnapshot(client, surfaceId, { nodeCount, scenario }) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", { surfaceId }),
    (value) => value.ready && initialSnapshotReady(value.snapshot, { nodeCount, scenario }),
    scenarioTimeoutMs,
  ).then((value) => value.snapshot);
}

function initialSnapshotReady(snapshot, { nodeCount, scenario }) {
  if (!baseInitialSnapshotReady(snapshot)) {
    return false;
  }
  if (scenario === "baseline") {
    return baselineSnapshotReady(snapshot);
  }
  if (scenario === "active") {
    return activeSnapshotReady(snapshot);
  }
  if (scenario === "small-trackpad") {
    return smallTrackpadSnapshotReady(snapshot);
  }
  return snapshot.graph.nodeCount === nodeCount;
}

function baseInitialSnapshotReady(snapshot) {
  return (
    snapshot.canvas.clientWidth > 0 &&
    snapshot.canvas.clientHeight > 0 &&
    snapshot.render.frameCount > 2 &&
    snapshot.visual.hasNonBackgroundPixels
  );
}

function baselineSnapshotReady(snapshot) {
  return (
    snapshot.graph.nodes.some((node) => node.layer === "workflow") &&
    snapshot.graph.nodes.filter((node) => node.layer === "semantic").length >= 4
  );
}

function activeSnapshotReady(snapshot) {
  return (
    snapshot.render.activeEdgeFlowCount > 0 &&
    snapshot.render.cellAnimCount > 0 &&
    snapshot.graph.nodes.some((node) => node.layer === "workflow") &&
    snapshot.graph.nodes.some((node) => node.layer === "semantic")
  );
}

function smallTrackpadSnapshotReady(snapshot) {
  return (
    snapshot.graph.nodeCount === 3 &&
    snapshot.graph.edgeCount === 2 &&
    snapshot.graph.nodes.every((node) => node.layer === "workflow") &&
    snapshot.graph.workflow?.viewMode === "draft"
  );
}

function assertPhase0DebugSnapshot(snapshot, expected) {
  assertLargeNodeCount(snapshot, expected);
  assertFiniteRenderCounters(snapshot);
  assertPanZoomCounters(snapshot, expected);
  assertCameraSyncCounters(snapshot);
  assertRequiredTimingBuckets(snapshot);
  assertDisplayObjectLayerCounts(snapshot);
  assertTimingSampleRing(snapshot);
}

function assertLargeNodeCount(snapshot, { nodeCount, scenario }) {
  if (scenario !== "large" || snapshot.graph.nodeCount === nodeCount) {
    return;
  }
  throw new Error(
    `large scenario node count mismatch: expected=${nodeCount} actual=${snapshot.graph.nodeCount}`,
  );
}

function assertFiniteRenderCounters(snapshot) {
  for (const counter of [
    "averageFrameMs",
    "p95FrameMs",
    "worstFrameMs",
    "cameraDependentSyncFrameCount",
    "cameraMovingLabelHiddenFrameCount",
    "cameraMovingLabelSyncedFrameCount",
    "cameraMovingSyncFrameCount",
    "cameraPanSettleDelayMs",
    "cameraSettleDelayMs",
    "cameraSettleLabelSyncCount",
    "cameraSettleRestoreFrameCount",
    "cameraSettledSyncFrameCount",
    "cameraUpdateCount",
    "cameraZoomSettleDelayMs",
    "labelSyncCount",
    "lastDrawnEdgeCount",
    "lastDrawnEdgeLabelCount",
    "lastVisibleMaterializedNodeCount",
    "materializedLabelCount",
    "materializedNodeCount",
    "materializedPortCount",
    "visibleLabelCount",
    "sceneWindowSize",
    "spatialIndexQueryCount",
    "totalDisplayObjectCount",
    "wheelInputEventCount",
    "wheelInputGestureCount",
  ]) {
    if (!Number.isFinite(snapshot.render[counter])) {
      throw new Error(`render counter was not finite: ${counter}=${snapshot.render[counter]}`);
    }
  }
}

function assertPanZoomCounters(snapshot, { scenario }) {
  if (
    snapshot.render.cameraUpdateCount <= 0 ||
    snapshot.render.wheelPanUpdateCount <= 0 ||
    snapshot.render.wheelZoomUpdateCount <= 0
  ) {
    throw new Error(`pan/zoom counters did not advance: ${JSON.stringify(snapshot.render)}`);
  }
  if (scenario !== "small-trackpad" && snapshot.render.pointerPanUpdateCount <= 0) {
    throw new Error(`pointer pan counter did not advance: ${JSON.stringify(snapshot.render)}`);
  }
  if (snapshot.render.wheelInputEventCount <= 0 || snapshot.render.wheelInputGestureCount <= 0) {
    throw new Error(`wheel input counters did not advance: ${JSON.stringify(snapshot.render)}`);
  }
}

function assertCameraSyncCounters(snapshot) {
  if (
    snapshot.render.cameraDependentSyncFrameCount <= 0 ||
    snapshot.render.cameraMovingSyncFrameCount <= 0 ||
    snapshot.render.cameraSettleLabelSyncCount <= 0 ||
    snapshot.render.cameraSettleRestoreFrameCount <= 0 ||
    snapshot.render.cameraDependentSyncRequiresMovingFrame ||
    snapshot.render.cameraDependentSyncScheduled
  ) {
    throw new Error(
      `camera sync counters did not show coalesced movement: ${JSON.stringify(snapshot.render)}`,
    );
  }
  if (
    snapshot.render.cameraMovingLabelHiddenFrameCount <= 0 &&
    snapshot.render.cameraMovingLabelSyncedFrameCount <= 0
  ) {
    throw new Error(
      `camera sync counters did not show moving label handling: ${JSON.stringify(snapshot.render)}`,
    );
  }
}

function assertRequiredTimingBuckets(snapshot) {
  for (const bucket of requiredTimingBuckets) {
    const aggregate = snapshot.render.timingBuckets[bucket];
    if (!aggregate || aggregate.count <= 0 || !Number.isFinite(aggregate.worstMs)) {
      throw new Error(
        `missing renderer timing bucket ${bucket}: ${JSON.stringify(snapshot.render.timingBuckets)}`,
      );
    }
  }
}

function assertDisplayObjectLayerCounts(snapshot) {
  for (const layer of ["edge", "labels", "nodeGlow", "nodes", "stage", "viewport"]) {
    const counts = snapshot.render.displayObjectCountsByLayer[layer];
    if (!counts || counts.totalCount <= 0) {
      throw new Error(
        `missing display object layer count ${layer}: ${JSON.stringify(snapshot.render.displayObjectCountsByLayer)}`,
      );
    }
  }
}

function assertTimingSampleRing(snapshot) {
  if (
    !Array.isArray(snapshot.render.timingSamples) ||
    snapshot.render.timingSamples.length === 0 ||
    snapshot.render.timingSamples.length > snapshot.render.timingSampleLimit
  ) {
    throw new Error(`timing sample ring invalid: ${JSON.stringify(snapshot.render.timingSamples)}`);
  }
}

function summarizeSnapshot(snapshot) {
  return {
    camera: snapshot.camera,
    graph: {
      edgeCount: snapshot.graph.edgeCount,
      nodeCount: snapshot.graph.nodeCount,
      semanticNodeCount: snapshot.graph.nodes.filter((node) => node.layer === "semantic").length,
      workflowNodeCount: snapshot.graph.nodes.filter((node) => node.layer === "workflow").length,
    },
    render: {
      activeEdgeFlowCount: snapshot.render.activeEdgeFlowCount,
      averageFrameMs: snapshot.render.averageFrameMs,
      cameraDependentSyncFrameCount: snapshot.render.cameraDependentSyncFrameCount,
      cameraMovingLabelHiddenFrameCount: snapshot.render.cameraMovingLabelHiddenFrameCount,
      cameraMovingLabelSyncedFrameCount: snapshot.render.cameraMovingLabelSyncedFrameCount,
      cameraMovingSyncFrameCount: snapshot.render.cameraMovingSyncFrameCount,
      cameraPanSettleDelayMs: snapshot.render.cameraPanSettleDelayMs,
      cameraSettleLabelSyncCount: snapshot.render.cameraSettleLabelSyncCount,
      cameraSettleRestoreFrameCount: snapshot.render.cameraSettleRestoreFrameCount,
      cameraSettleDelayMs: snapshot.render.cameraSettleDelayMs,
      cameraSettledSyncFrameCount: snapshot.render.cameraSettledSyncFrameCount,
      cameraUpdateCount: snapshot.render.cameraUpdateCount,
      cameraZoomSettleDelayMs: snapshot.render.cameraZoomSettleDelayMs,
      displayObjectCountsByLayer: snapshot.render.displayObjectCountsByLayer,
      edgeLevelOfDetail: snapshot.render.edgeLevelOfDetail,
      frameCount: snapshot.render.frameCount,
      lastDrawnEdgeCount: snapshot.render.lastDrawnEdgeCount,
      lastDrawnEdgeLabelCount: snapshot.render.lastDrawnEdgeLabelCount,
      lastVisibleMaterializedNodeCount: snapshot.render.lastVisibleMaterializedNodeCount,
      materializedLabelCount: snapshot.render.materializedLabelCount,
      materializedNodeCount: snapshot.render.materializedNodeCount,
      materializedPortCount: snapshot.render.materializedPortCount,
      p95FrameMs: snapshot.render.p95FrameMs,
      pointerPanUpdateCount: snapshot.render.pointerPanUpdateCount,
      pooledLabelCount: snapshot.render.pooledLabelCount,
      pooledNodeViewCount: snapshot.render.pooledNodeViewCount,
      sceneWindowSize: snapshot.render.sceneWindowSize,
      timingBuckets: snapshot.render.timingBuckets,
      totalDisplayObjectCount: snapshot.render.totalDisplayObjectCount,
      visibleLabelCount: snapshot.render.visibleLabelCount,
      wheelInput: snapshot.render.wheelInput,
      wheelInputEventCount: snapshot.render.wheelInputEventCount,
      wheelInputGestureCount: snapshot.render.wheelInputGestureCount,
      wheelInputLastEventToSettleRestoreMs: snapshot.render.wheelInputLastEventToSettleRestoreMs,
      wheelInputTailCandidateDurationMs: snapshot.render.wheelInputTailCandidateDurationMs,
      wheelInputTailCandidateEventCount: snapshot.render.wheelInputTailCandidateEventCount,
      wheelPanUpdateCount: snapshot.render.wheelPanUpdateCount,
      wheelZoomUpdateCount: snapshot.render.wheelZoomUpdateCount,
      worstFrameMs: snapshot.render.worstFrameMs,
    },
  };
}

function launchEnvForScenario({ nodeCount, scenario, syntheticScene }) {
  const env = {
    SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    SETTA_WORKFLOW_GRAPH_DEBUG: "1",
  };
  if (scenario === "active") {
    return {
      ...env,
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE: "1",
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT: "6",
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_SCENE: "merged",
    };
  }
  if (scenario === "large") {
    return {
      ...env,
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE: "1",
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT: String(nodeCount),
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_SCENE: syntheticScene,
    };
  }
  return env;
}

async function assertNoRendererConsoleErrors(artifactDir) {
  const consoleRows = await readJsonLinesOptional(join(artifactDir, "renderer-console.jsonl"));
  const consoleErrors = consoleRows.filter((row) => Number(row.level) >= 2);
  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors recorded: ${JSON.stringify(consoleErrors)}`);
  }
}

async function seedSemanticGraphFixture({ appDataDir, workspaceRoot }) {
  const { code, output } = await spawnForOutput(
    join(repoRoot, "scripts", "go.sh"),
    [
      "run",
      "./cmd/seed-semantic-graph-dev",
      "--app-data-dir",
      appDataDir,
      "--workspace-root",
      workspaceRoot,
    ],
    { cwd: repoRoot },
  );
  if (code !== 0) {
    throw new Error(`semantic graph seed failed with code ${code}: ${output}`);
  }
}

function spawnForOutput(command, args, { cwd }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`semantic graph seed exited by signal ${signal}: ${output}`));
        return;
      }
      resolvePromise({ code: code ?? 1, output });
    });
  });
}

function parseGraphRecordingArgs(args) {
  const harnessArgs = [];
  let scenario = "baseline";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--scenario") {
      const value = args[index + 1];
      if (!scenarioNames.has(value)) {
        throw new Error(`--scenario must be one of ${[...scenarioNames].join(", ")}`);
      }
      scenario = value;
      index += 1;
      continue;
    }
    harnessArgs.push(arg);
  }
  return {
    ...parseElectronHarnessArgs(harnessArgs),
    scenario,
  };
}
