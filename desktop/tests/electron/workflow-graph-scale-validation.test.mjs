/* global console */

import { join } from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readJsonLinesOptional,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import {
  dispatchWorkflowGraphMouseClick,
  dispatchWorkflowGraphMouseDrag,
  dispatchWorkflowGraphMouseMove,
  dispatchWorkflowGraphWheel,
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
  pagePointForCanvasPoint,
} from "./workflow-graph-layout-helpers.mjs";
import {
  assertNonNegativeInteger,
  assertRenderCounterAdvanced,
  assertSpatialIndexCandidateAtLeast,
  assertSpatialIndexDebugCounters,
  assertSpatialIndexQueryAdvanced,
  assertSpatialIndexUpdatesAdvanced,
  setsEqual,
  visiblePoint,
} from "./workflow-graph-smoke-assertions.mjs";

const cdpShiftModifier = 8;
const interactionDelayMs = 120;
const portHitRadiusScreen = 18;
const scenarioTimeoutMs = 120_000;
const scaleNodeCounts = [500, 1000, 2500, 5000];
const scaleEdgeDensities = [1, 2];

const options = parseElectronHarnessArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    `Usage: node desktop/tests/electron/workflow-graph-scale-validation.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]`,
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactRoot =
  options.artifactDir || timestampedRecordingDir("workflow-graph-scale-validation");
await writeLatestRecordingPointer("workflow-graph-scale-validation", artifactRoot);
const scenarioResults = [];
let workflowGraphSurfaceId = null;

try {
  for (const nodeCount of scaleNodeCounts) {
    for (const edgesPerNode of scaleEdgeDensities) {
      const scenario = { edgesPerNode, nodeCount };
      const result = await runScaleScenario(scenario);
      scenarioResults.push(result);
      await writeJson(join(artifactRoot, "summary.json"), {
        artifactRoot,
        scenarios: scenarioResults,
        status: "running",
      });
      console.log(
        `workflow graph scale scenario passed: nodes=${nodeCount} edgesPerNode=${edgesPerNode} artifactDir=${result.artifactDir}`,
      );
    }
  }
  await writeJson(join(artifactRoot, "summary.json"), {
    artifactRoot,
    recommendation: recommendationForResults(scenarioResults),
    scenarios: scenarioResults,
    status: "passed",
  });
  console.log(`workflow graph scale validation passed: ${artifactRoot}`);
} catch (error) {
  await writeJson(join(artifactRoot, "summary.json"), {
    artifactRoot,
    error: error instanceof Error ? error.message : String(error),
    scenarios: scenarioResults,
    status: "failed",
  });
  throw error;
}

async function runScaleScenario({ edgesPerNode, nodeCount }) {
  const scenarioName = `${nodeCount}-nodes-${edgesPerNode}-edges-per-node`;
  const artifactDir = join(artifactRoot, scenarioName);
  const fixture = await createElectronFixture(`workflow-graph-scale-${nodeCount}-${edgesPerNode}`);
  let context = null;
  const startedAt = performance.now();

  try {
    context = await launchScaleScenario({ artifactDir, edgesPerNode, fixture, nodeCount });
    const summary = await exerciseScaleScenario({
      artifactDir,
      client: context.client,
      edgesPerNode,
      nodeCount,
      startedAt,
    });
    await writeJson(join(artifactDir, "summary.json"), summary);
    return summary;
  } catch (error) {
    await writeScaleScenarioFailure({ artifactDir, context, edgesPerNode, error, nodeCount });
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function launchScaleScenario({ artifactDir, edgesPerNode, fixture, nodeCount }) {
  const context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_WORKFLOW_GRAPH_DEBUG: "1",
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE: String(edgesPerNode),
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT: String(nodeCount),
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]', scenarioTimeoutMs);
  await openWorkflowGraphPane(context.client, { timeoutMs: scenarioTimeoutMs });
  await waitForSelector(context.client, '[data-testid="workflow-graph"]', scenarioTimeoutMs);
  workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client, {
    timeoutMs: scenarioTimeoutMs,
  });
  return context;
}

async function exerciseScaleScenario({ artifactDir, client, edgesPerNode, nodeCount, startedAt }) {
  const { initial, initialRenderMs } = await waitForInitialScaleSnapshot(client, {
    artifactDir,
    edgesPerNode,
    nodeCount,
    startedAt,
  });
  const { afterClick, afterHover } = await exerciseNodeHitChecks(client, { initial });
  const { afterPan, afterZoom } = await exercisePanAndZoom(client, {
    afterClick,
    artifactDir,
  });
  const { afterMarquee, expectedMarqueeNodeIds } = await exerciseMarquee(client, {
    afterZoom,
    artifactDir,
  });
  const { afterEdgeDraw, portPair } = await exercisePortTargeting(client, {
    afterMarquee,
    artifactDir,
  });
  const afterNodeDrag = await exerciseNodeDrag(client, {
    afterEdgeDraw,
    artifactDir,
    portPair,
  });
  await assertNoRendererConsoleErrors(artifactDir);

  return scaleScenarioSummary({
    artifactDir,
    edgesPerNode,
    expectedMarqueeNodeIds,
    initialRenderMs,
    nodeCount,
    snapshots: {
      afterClick,
      afterEdgeDraw,
      afterHover,
      afterMarquee,
      afterNodeDrag,
      afterPan,
      afterZoom,
      initial,
    },
  });
}

async function waitForInitialScaleSnapshot(
  client,
  { artifactDir, edgesPerNode, nodeCount, startedAt },
) {
  const initial = await waitForWorkflowGraphSnapshot(
    client,
    (snapshot) => isInitialScaleSnapshotReady(snapshot, nodeCount),
    scenarioTimeoutMs,
  );
  const initialRenderMs = performance.now() - startedAt;
  assertScaleSnapshot(initial, { edgesPerNode, label: "initial render", nodeCount });
  assertSpatialIndexCandidateAtLeast(
    initial,
    "lastLabelVisibilityCandidateCount",
    1,
    "initial label visibility",
  );
  assertCandidateReduced(initial, "lastLabelVisibilityCandidateCount", "initial label visibility");
  await captureScreenshot(client, join(artifactDir, "initial.png"));
  return { initial, initialRenderMs };
}

function isInitialScaleSnapshotReady(snapshot, nodeCount) {
  return (
    snapshot.canvas.clientWidth > 0 &&
    snapshot.canvas.clientHeight > 0 &&
    snapshot.graph.nodeCount === nodeCount &&
    snapshot.render.frameCount > 2 &&
    snapshot.visual.hasNonBackgroundPixels
  );
}

async function exerciseNodeHitChecks(client, { initial }) {
  const interactionTarget = closestVisibleNode(initial);
  assertExactInitialHit(initial, interactionTarget);

  await dispatchMouseMove(client, {
    x: interactionTarget.screenX,
    y: interactionTarget.screenY,
  });
  await delay(interactionDelayMs);
  const afterHover = await getWorkflowGraphSnapshot(client);
  assertSpatialIndexQueryAdvanced(initial, afterHover, "node hover hit test");
  assertSpatialIndexCandidateAtLeast(afterHover, "lastNodeHitCandidateCount", 1, "node hover");
  assertCandidateReduced(afterHover, "lastNodeHitCandidateCount", "node hover");

  await dispatchMouseClick(client, {
    x: interactionTarget.screenX,
    y: interactionTarget.screenY,
  });
  await delay(interactionDelayMs);
  const afterClick = await getWorkflowGraphSnapshot(client);
  assertSelectedExactly(afterClick, [interactionTarget.id], "node click exact hit");
  assertSpatialIndexQueryAdvanced(afterHover, afterClick, "node click hit test");
  assertCandidateReduced(afterClick, "lastNodeHitCandidateCount", "node click");
  return { afterClick, afterHover };
}

function assertExactInitialHit(initial, interactionTarget) {
  const exactInitialHit = exactNodeHitAtScreen(initial, {
    x: interactionTarget.screenX,
    y: interactionTarget.screenY,
  });
  if (exactInitialHit?.id !== interactionTarget.id) {
    throw new Error(
      `initial exact hit target mismatch: expected=${interactionTarget.id} actual=${exactInitialHit?.id ?? "none"}`,
    );
  }
}

async function exercisePanAndZoom(client, { afterClick, artifactDir }) {
  const panStart = afterClick;
  await dispatchWheel(client, {
    deltaX: 160,
    deltaY: 96,
    x: Math.floor(panStart.canvas.clientWidth / 2),
    y: Math.floor(panStart.canvas.clientHeight / 2),
  });
  await delay(interactionDelayMs);
  const afterPan = await getWorkflowGraphSnapshot(client);
  assertCameraMoved(panStart, afterPan, "wheel pan");
  assertSpatialIndexQueryAdvanced(panStart, afterPan, "wheel pan label visibility");
  assertCandidateReduced(afterPan, "lastLabelVisibilityCandidateCount", "wheel pan labels");

  await dispatchWheel(client, {
    deltaY: -420,
    x: Math.floor(afterPan.canvas.clientWidth / 2),
    y: Math.floor(afterPan.canvas.clientHeight / 2),
  });
  await delay(180);
  const afterZoom = await getWorkflowGraphSnapshot(client);
  assertZoomAtLeast(afterZoom, 1.75, "wheel zoom");
  assertSpatialIndexQueryAdvanced(afterPan, afterZoom, "wheel zoom label visibility");
  assertAllVisibleLabelsMatchViewport(afterZoom, "wheel zoom label visibility exactness");
  assertCandidateReduced(afterZoom, "lastLabelVisibilityCandidateCount", "wheel zoom labels");
  await captureScreenshot(client, join(artifactDir, "after-zoom-labels.png"));
  return { afterPan, afterZoom };
}

async function exerciseMarquee(client, { afterZoom, artifactDir }) {
  const marquee = marqueeForVisibleCluster(afterZoom);
  const expectedMarqueeNodeIds = exactMarqueeNodeIds(afterZoom, marquee);
  assertNonEmptyMarqueeSelection(expectedMarqueeNodeIds, marquee);
  await dispatchMouseDrag(client, {
    from: marquee.from,
    modifiers: cdpShiftModifier,
    steps: 12,
    to: marquee.to,
  });
  await delay(180);
  const afterMarquee = await getWorkflowGraphSnapshot(client);
  assertSelectedExactly(afterMarquee, expectedMarqueeNodeIds, "marquee exact selection");
  assertSpatialIndexQueryAdvanced(afterZoom, afterMarquee, "marquee spatial query");
  assertCandidateReduced(afterMarquee, "lastMarqueeCandidateCount", "marquee");
  await captureScreenshot(client, join(artifactDir, "marquee-selection.png"));
  return { afterMarquee, expectedMarqueeNodeIds };
}

function assertNonEmptyMarqueeSelection(expectedMarqueeNodeIds, marquee) {
  if (expectedMarqueeNodeIds.length === 0) {
    throw new Error(`marquee exact scan produced no nodes: marquee=${JSON.stringify(marquee)}`);
  }
}

async function exercisePortTargeting(client, { afterMarquee, artifactDir }) {
  const portPair = visiblePortPair(afterMarquee);
  assertExactTargetPort(afterMarquee, portPair);
  const duringEdgeDraw = await dispatchEdgeDrag(client, {
    from: portPair.source,
    screenshotPath: join(artifactDir, "edge-targeting.png"),
    to: portPair.target,
  });
  assertTemporaryEdgeDrawing(duringEdgeDraw, "edge targeting");
  await delay(180);
  const afterEdgeDraw = await getWorkflowGraphSnapshot(client);
  assertEdgeCommitted(afterMarquee, afterEdgeDraw, portPair, "port targeting exactness");
  assertSpatialIndexQueryAdvanced(afterMarquee, afterEdgeDraw, "port targeting spatial query");
  assertCandidateReduced(afterEdgeDraw, "lastPortHitCandidateCount", "port targeting");
  return { afterEdgeDraw, portPair };
}

function assertExactTargetPort(snapshot, portPair) {
  const exactTargetPort = exactTargetPortAtScreen(snapshot, portPair.target, {
    excludeNodeId: portPair.source.nodeId,
  });
  if (
    !exactTargetPort ||
    exactTargetPort.nodeId !== portPair.target.nodeId ||
    exactTargetPort.portId !== portPair.target.portId
  ) {
    throw new Error(
      `port exact scan picked wrong target: expected=${JSON.stringify(portPair.target)} actual=${JSON.stringify(exactTargetPort)}`,
    );
  }
}

function assertTemporaryEdgeDrawing(snapshot, label) {
  if (!snapshot.interaction.drawingEdge) {
    throw new Error(
      `${label} did not enter drawing state: ${JSON.stringify(snapshot.interaction)}`,
    );
  }
}

async function exerciseNodeDrag(client, { afterEdgeDraw, artifactDir, portPair }) {
  const dragTarget = nodeById(afterEdgeDraw, portPair.source.nodeId);
  await dispatchMouseDrag(client, {
    from: { x: dragTarget.screenX, y: dragTarget.screenY },
    steps: 10,
    to: { x: dragTarget.screenX + 54, y: dragTarget.screenY + 28 },
  });
  await delay(180);
  const afterNodeDrag = await getWorkflowGraphSnapshot(client);
  assertNodeMoved(afterEdgeDraw, afterNodeDrag, dragTarget.id, "node drag");
  assertSpatialIndexUpdatesAdvanced(afterEdgeDraw, afterNodeDrag, "node drag spatial update");
  await captureScreenshot(client, join(artifactDir, "final.png"));
  return afterNodeDrag;
}

async function assertNoRendererConsoleErrors(artifactDir) {
  const consoleRows = await readJsonLinesOptional(join(artifactDir, "renderer-console.jsonl"));
  const consoleErrors = consoleRows.filter((row) => Number(row.level) >= 2);
  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors recorded: ${JSON.stringify(consoleErrors)}`);
  }
}

function scaleScenarioSummary({
  artifactDir,
  edgesPerNode,
  expectedMarqueeNodeIds,
  initialRenderMs,
  nodeCount,
  snapshots,
}) {
  return {
    artifactDir,
    edgeDensity: edgesPerNode,
    expectedMarqueeNodeIds,
    initialRenderMs,
    metrics: summarizeSnapshots(snapshots),
    nodeCount,
    screenshots: {
      afterZoomLabels: join(artifactDir, "after-zoom-labels.png"),
      edgeTargeting: join(artifactDir, "edge-targeting.png"),
      final: join(artifactDir, "final.png"),
      initial: join(artifactDir, "initial.png"),
      marqueeSelection: join(artifactDir, "marquee-selection.png"),
    },
    status: "passed",
  };
}

async function writeScaleScenarioFailure({ artifactDir, context, edgesPerNode, error, nodeCount }) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await getWorkflowGraphSnapshot(context.client)
      .then((snapshot) => writeJson(join(artifactDir, "failure-snapshot.json"), snapshot))
      .catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    edgeDensity: edgesPerNode,
    error: error instanceof Error ? error.message : String(error),
    nodeCount,
    status: "failed",
  });
}

async function waitForWorkflowGraphSnapshot(client, predicate, timeoutMs) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", { surfaceId: workflowGraphSurfaceId }),
    (value) => value.ready && predicate(value.snapshot),
    timeoutMs,
  ).then((value) => value.snapshot);
}

async function getWorkflowGraphSnapshot(client) {
  return client.driver("workflowGraphDebugSnapshot", { surfaceId: workflowGraphSurfaceId });
}

async function dispatchMouseClick(client, { x, y }) {
  await dispatchWorkflowGraphMouseClick(client, workflowGraphSurfaceId, { x, y });
}

async function dispatchMouseMove(client, { x, y }) {
  await dispatchWorkflowGraphMouseMove(client, workflowGraphSurfaceId, { x, y });
}

async function dispatchEdgeDrag(client, { from, screenshotPath, to }) {
  const steps = 14;
  const pageFrom = await pagePointForCanvasPoint(client, workflowGraphSurfaceId, from);
  const pageTo = await pagePointForCanvasPoint(client, workflowGraphSurfaceId, to);
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
  let during = null;
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    await client.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: pageFrom.x + (pageTo.x - pageFrom.x) * progress,
      y: pageFrom.y + (pageTo.y - pageFrom.y) * progress,
    });
    await delay(16);
    if (step === Math.floor(steps / 2)) {
      during = await getWorkflowGraphSnapshot(client);
      await captureScreenshot(client, screenshotPath);
    }
  }
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: pageTo.x,
    y: pageTo.y,
  });
  return during ?? getWorkflowGraphSnapshot(client);
}

async function dispatchMouseDrag(client, { from, modifiers = 0, steps = 12, to }) {
  await dispatchWorkflowGraphMouseDrag(client, workflowGraphSurfaceId, {
    from,
    modifiers,
    steps,
    to,
  });
}

async function dispatchWheel(client, { deltaX = 0, deltaY = 0, modifiers = 0, x, y }) {
  await dispatchWorkflowGraphWheel(client, workflowGraphSurfaceId, {
    deltaX,
    deltaY,
    modifiers,
    x,
    y,
  });
}

function assertScaleSnapshot(snapshot, { edgesPerNode, label, nodeCount }) {
  if (snapshot.graph.nodeCount !== nodeCount) {
    throw new Error(
      `${label} graph node count mismatch: expected=${nodeCount} graph=${JSON.stringify(snapshot.graph)}`,
    );
  }
  if (snapshot.graph.edgeCount !== nodeCount * edgesPerNode) {
    throw new Error(
      `${label} graph edge count mismatch: expected=${nodeCount * edgesPerNode} graph=${JSON.stringify(snapshot.graph)}`,
    );
  }
  if (!snapshot.visual.hasNonBackgroundPixels) {
    throw new Error(`${label} canvas was blank: visual=${JSON.stringify(snapshot.visual)}`);
  }
  assertSpatialIndexDebugCounters(snapshot, label);
  assertDisplayObjectCounters(snapshot, label);
  assertFrameTimings(snapshot, label);
}

function assertDisplayObjectCounters(snapshot, label) {
  const render = snapshot.render;
  const counters = [
    "edgeGraphicsCount",
    "labelObjectCount",
    "nodeBodyGraphicsCount",
    "nodeContainerCount",
    "nodeOutlineGraphicsCount",
    "nodeShadowGraphicsCount",
    "portGraphicsCount",
    "totalDisplayObjectCount",
    "visibleLabelCount",
  ];
  for (const counter of counters) {
    assertNonNegativeInteger(render[counter], `${label} ${counter}`);
  }
  const nodeCount = snapshot.graph.nodeCount;
  const expectedMinimumDisplayObjects = nodeCount * 8;
  if (render.edgeGraphicsCount !== 1) {
    throw new Error(`${label} edgeGraphicsCount was not one: render=${JSON.stringify(render)}`);
  }
  if (render.nodeContainerCount !== nodeCount) {
    throw new Error(
      `${label} nodeContainerCount did not match node count: graph=${nodeCount} render=${JSON.stringify(render)}`,
    );
  }
  if (render.labelObjectCount !== nodeCount) {
    throw new Error(
      `${label} labelObjectCount did not match node count: graph=${nodeCount} render=${JSON.stringify(render)}`,
    );
  }
  if (render.portGraphicsCount !== nodeCount * 2) {
    throw new Error(
      `${label} portGraphicsCount did not match two ports per node: graph=${nodeCount} render=${JSON.stringify(render)}`,
    );
  }
  if (render.totalDisplayObjectCount < expectedMinimumDisplayObjects) {
    throw new Error(
      `${label} total display object count was below expected graph scale: minimum=${expectedMinimumDisplayObjects} render=${JSON.stringify(render)}`,
    );
  }
}

function assertFrameTimings(snapshot, label) {
  if (snapshot.render.frameCount <= 0) {
    throw new Error(
      `${label} Workflow graph ticker did not advance: render=${JSON.stringify(snapshot.render)}`,
    );
  }
  for (const counter of ["averageFrameMs", "worstFrameMs"]) {
    if (!Number.isFinite(snapshot.render[counter])) {
      throw new Error(
        `${label} ${counter} was not finite: render=${JSON.stringify(snapshot.render)}`,
      );
    }
  }
}

function assertCandidateReduced(snapshot, counter, label) {
  assertSpatialIndexDebugCounters(snapshot, label);
  const candidateCount = snapshot.render[counter];
  const graphNodeCount = snapshot.graph.nodeCount;
  if (candidateCount > graphNodeCount) {
    throw new Error(
      `${label} candidate count exceeded graph node count: counter=${counter} render=${JSON.stringify(snapshot.render)}`,
    );
  }
  if (graphNodeCount >= 500 && candidateCount >= graphNodeCount / 5) {
    throw new Error(
      `${label} candidate count was not materially smaller than graph size: counter=${counter} candidateCount=${candidateCount} graphNodeCount=${graphNodeCount}`,
    );
  }
}

function assertCameraMoved(before, after, label) {
  const moved =
    Math.abs(after.camera.x - before.camera.x) > 0.5 ||
    Math.abs(after.camera.y - before.camera.y) > 0.5;
  if (!moved) {
    throw new Error(
      `${label} did not move camera: before=${JSON.stringify(before.camera)} after=${JSON.stringify(after.camera)}`,
    );
  }
}

function assertZoomAtLeast(snapshot, minimumZoom, label) {
  if (snapshot.camera.zoom < minimumZoom) {
    throw new Error(
      `${label} did not reach zoom target: minimum=${minimumZoom} camera=${JSON.stringify(snapshot.camera)}`,
    );
  }
}

function assertSelectedExactly(snapshot, expectedNodeIds, label) {
  const actual = snapshot.interaction.selectedNodeIds;
  const actualSet = new Set(actual);
  const expectedSet = new Set(expectedNodeIds);
  if (actual.length !== actualSet.size || !setsEqual(actualSet, expectedSet)) {
    throw new Error(
      `${label} selected wrong nodes: expected=${JSON.stringify([...expectedSet])} actual=${JSON.stringify(actual)}`,
    );
  }
}

function assertAllVisibleLabelsMatchViewport(snapshot, label) {
  if (snapshot.render.labelVisibilityMode !== "all-visible") {
    throw new Error(
      `${label} did not enter all-visible label mode: render=${JSON.stringify(snapshot.render)}`,
    );
  }
  const expectedIds = new Set(exactViewportNodeIds(snapshot));
  const actualIds = new Set(
    snapshot.graph.nodes.filter((node) => node.label.visible).map((node) => node.id),
  );
  if (!setsEqual(expectedIds, actualIds)) {
    throw new Error(
      `${label} visible labels differed from exact viewport scan: expected=${JSON.stringify([...expectedIds])} actual=${JSON.stringify([...actualIds])}`,
    );
  }
}

function assertEdgeCommitted(before, after, portPair, label) {
  if (after.graph.edgeCount !== before.graph.edgeCount + 1) {
    throw new Error(
      `${label} did not commit one edge: before=${before.graph.edgeCount} after=${after.graph.edgeCount}`,
    );
  }
  const committed = after.graph.edges.find(
    (edge) =>
      edge.sourceNodeId === portPair.source.nodeId &&
      edge.sourcePortId === portPair.source.portId &&
      edge.targetNodeId === portPair.target.nodeId &&
      edge.targetPortId === portPair.target.portId,
  );
  if (!committed) {
    throw new Error(
      `${label} committed edge did not match exact target: pair=${JSON.stringify(portPair)} edges=${JSON.stringify(after.graph.edges.slice(-5))}`,
    );
  }
}

function assertNodeMoved(before, after, nodeId, label) {
  assertRenderCounterAdvanced(before, after, "nodeDragUpdateCount", label);
  const beforeNode = nodeById(before, nodeId);
  const afterNode = nodeById(after, nodeId);
  const moved =
    Math.abs(afterNode.x - beforeNode.x) > 1 || Math.abs(afterNode.y - beforeNode.y) > 1;
  if (!moved) {
    throw new Error(
      `${label} did not move node: before=${JSON.stringify(beforeNode)} after=${JSON.stringify(afterNode)}`,
    );
  }
}

function closestVisibleNode(snapshot) {
  const center = {
    x: snapshot.canvas.clientWidth / 2,
    y: snapshot.canvas.clientHeight / 2,
  };
  const node = visibleNodes(snapshot)
    .filter((candidate) => candidate.label.visible)
    .sort((left, right) => screenDistance(left, center) - screenDistance(right, center))[0];
  if (!node) {
    throw new Error(`no visible label-bearing node found: graph=${JSON.stringify(snapshot.graph)}`);
  }
  return node;
}

function visibleNodes(snapshot) {
  return snapshot.graph.nodes.filter((node) => visiblePoint(snapshot, node));
}

function screenDistance(node, point) {
  return Math.hypot(node.screenX - point.x, node.screenY - point.y);
}

function marqueeForVisibleCluster(snapshot) {
  const visible = visibleNodes(snapshot)
    .sort(
      (left, right) =>
        screenDistance(left, canvasCenter(snapshot)) -
        screenDistance(right, canvasCenter(snapshot)),
    )
    .slice(0, 4);
  if (visible.length < 2) {
    throw new Error(`not enough visible nodes for marquee: visible=${JSON.stringify(visible)}`);
  }
  const bounds = visible.map((node) => nodeScreenBounds(snapshot, node));
  const left = Math.min(...bounds.map((bound) => bound.left)) - 28;
  const right = Math.max(...bounds.map((bound) => bound.right)) + 28;
  const top = Math.min(...bounds.map((bound) => bound.top)) - 28;
  const bottom = Math.max(...bounds.map((bound) => bound.bottom)) + 28;
  const from = emptyCanvasPoint(snapshot);
  const center = canvasCenter(snapshot);
  const to = clampCanvasPoint(snapshot, {
    x: from.x < center.x ? right : left,
    y: from.y < center.y ? bottom : top,
  });
  return {
    from,
    to,
  };
}

function canvasCenter(snapshot) {
  return {
    x: snapshot.canvas.clientWidth / 2,
    y: snapshot.canvas.clientHeight / 2,
  };
}

function visiblePortPair(snapshot) {
  const visible = visibleNodes(snapshot).sort(
    (left, right) =>
      screenDistance(left, canvasCenter(snapshot)) - screenDistance(right, canvasCenter(snapshot)),
  );
  for (const sourceNode of visible) {
    const source = sourceNode.ports.find((port) => port.role === "source");
    if (!source || !visiblePoint(snapshot, source)) {
      continue;
    }
    for (const targetNode of visible) {
      if (targetNode.id === sourceNode.id) {
        continue;
      }
      const target = targetNode.ports.find((port) => port.role === "target");
      if (!target || !visiblePoint(snapshot, target)) {
        continue;
      }
      return {
        source: { nodeId: sourceNode.id, portId: source.id, x: source.screenX, y: source.screenY },
        target: { nodeId: targetNode.id, portId: target.id, x: target.screenX, y: target.screenY },
      };
    }
  }
  throw new Error(
    `no visible source/target port pair found: graph=${JSON.stringify(snapshot.graph)}`,
  );
}

function nodeById(snapshot, nodeId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`missing node in snapshot: ${nodeId}`);
  }
  return node;
}

function exactNodeHitAtScreen(snapshot, point) {
  const world = screenToWorld(snapshot, point);
  let picked = null;
  for (const node of snapshot.graph.nodes) {
    if (pointInsideNodeBounds(world, node)) {
      picked = node;
    }
  }
  return picked;
}

function exactMarqueeNodeIds(snapshot, marquee) {
  const bounds = worldBoundsForScreenRect(snapshot, marquee.from, marquee.to);
  return snapshot.graph.nodes
    .filter((node) => rectanglesIntersect(bounds, nodeBounds(node)))
    .map((node) => node.id);
}

function exactViewportNodeIds(snapshot) {
  const viewport = viewportWorldBounds(snapshot);
  return snapshot.graph.nodes
    .filter((node) => rectanglesIntersect(viewport, nodeBounds(node)))
    .map((node) => node.id);
}

function exactTargetPortAtScreen(snapshot, point, { excludeNodeId }) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of snapshot.graph.nodes) {
    if (node.id === excludeNodeId) {
      continue;
    }
    for (const port of node.ports) {
      if (port.role !== "target") {
        continue;
      }
      const distance = Math.hypot(point.x - port.screenX, point.y - port.screenY);
      if (distance <= portHitRadiusScreen && distance < bestDistance) {
        best = { nodeId: node.id, portId: port.id };
        bestDistance = distance;
      }
    }
  }
  return best;
}

function screenToWorld(snapshot, point) {
  return {
    x: snapshot.camera.x + point.x / snapshot.camera.zoom,
    y: snapshot.camera.y + point.y / snapshot.camera.zoom,
  };
}

function worldBoundsForScreenRect(snapshot, from, to) {
  const first = screenToWorld(snapshot, from);
  const second = screenToWorld(snapshot, to);
  return {
    height: Math.abs(second.y - first.y),
    width: Math.abs(second.x - first.x),
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
  };
}

function viewportWorldBounds(snapshot) {
  return {
    height: snapshot.canvas.clientHeight / snapshot.camera.zoom,
    width: snapshot.canvas.clientWidth / snapshot.camera.zoom,
    x: snapshot.camera.x,
    y: snapshot.camera.y,
  };
}

function nodeBounds(node) {
  return {
    height: node.height,
    width: node.width,
    x: node.x,
    y: node.y,
  };
}

function nodeScreenBounds(snapshot, node) {
  const halfWidth = (node.width * snapshot.camera.zoom) / 2;
  const halfHeight = (node.height * snapshot.camera.zoom) / 2;
  return {
    bottom: node.screenY + halfHeight,
    left: node.screenX - halfWidth,
    right: node.screenX + halfWidth,
    top: node.screenY - halfHeight,
  };
}

function emptyCanvasPoint(snapshot) {
  const candidates = [
    { x: 32, y: 32 },
    { x: snapshot.canvas.clientWidth - 32, y: 32 },
    { x: 32, y: snapshot.canvas.clientHeight - 32 },
    { x: snapshot.canvas.clientWidth - 32, y: snapshot.canvas.clientHeight - 32 },
    { x: Math.floor(snapshot.canvas.clientWidth / 2), y: 32 },
    { x: Math.floor(snapshot.canvas.clientWidth / 2), y: snapshot.canvas.clientHeight - 32 },
    { x: 32, y: Math.floor(snapshot.canvas.clientHeight / 2) },
    { x: snapshot.canvas.clientWidth - 32, y: Math.floor(snapshot.canvas.clientHeight / 2) },
  ];
  const ports = snapshot.graph.nodes.flatMap((node) => node.ports);
  const point = candidates.find((candidate) => {
    const awayFromPorts = ports.every(
      (port) => Math.hypot(candidate.x - port.screenX, candidate.y - port.screenY) > 72,
    );
    const outsideNodes = snapshot.graph.nodes.every(
      (node) => !pointInsideNodeScreenBounds(snapshot, node, candidate, 24),
    );
    return awayFromPorts && outsideNodes;
  });
  if (!point) {
    throw new Error(`could not find an empty canvas point for marquee start`);
  }
  return point;
}

function pointInsideNodeScreenBounds(snapshot, node, point, padding) {
  const bounds = nodeScreenBounds(snapshot, node);
  return (
    point.x >= bounds.left - padding &&
    point.x <= bounds.right + padding &&
    point.y >= bounds.top - padding &&
    point.y <= bounds.bottom + padding
  );
}

function clampCanvasPoint(snapshot, point) {
  return {
    x: Math.max(12, Math.min(snapshot.canvas.clientWidth - 12, point.x)),
    y: Math.max(12, Math.min(snapshot.canvas.clientHeight - 12, point.y)),
  };
}

function pointInsideNodeBounds(point, node) {
  return (
    point.x >= node.x &&
    point.x <= node.x + node.width &&
    point.y >= node.y &&
    point.y <= node.y + node.height
  );
}

function rectanglesIntersect(left, right) {
  return (
    left.x <= right.x + right.width &&
    left.x + left.width >= right.x &&
    left.y <= right.y + right.height &&
    left.y + left.height >= right.y
  );
}

function summarizeSnapshots(snapshots) {
  return Object.fromEntries(
    Object.entries(snapshots).map(([name, snapshot]) => [
      name,
      {
        averageFrameMs: snapshot.render.averageFrameMs,
        camera: snapshot.camera,
        displayObjects: {
          edgeGraphicsCount: snapshot.render.edgeGraphicsCount,
          nodeContainerCount: snapshot.render.nodeContainerCount,
          portGraphicsCount: snapshot.render.portGraphicsCount,
          totalDisplayObjectCount: snapshot.render.totalDisplayObjectCount,
        },
        edgeCount: snapshot.graph.edgeCount,
        frameCount: snapshot.render.frameCount,
        labelVisibility: {
          labelObjectCount: snapshot.render.labelObjectCount,
          mode: snapshot.render.labelVisibilityMode,
          visibleLabelCount: snapshot.render.visibleLabelCount,
        },
        reactRenderCount: snapshot.render.reactRenderCount,
        spatialIndex: {
          lastLabelVisibilityCandidateCount: snapshot.render.lastLabelVisibilityCandidateCount,
          lastMarqueeCandidateCount: snapshot.render.lastMarqueeCandidateCount,
          lastNodeHitCandidateCount: snapshot.render.lastNodeHitCandidateCount,
          lastPortHitCandidateCount: snapshot.render.lastPortHitCandidateCount,
          spatialIndexCandidateCount: snapshot.render.spatialIndexCandidateCount,
          spatialIndexNodeCount: snapshot.render.spatialIndexNodeCount,
          spatialIndexQueryCount: snapshot.render.spatialIndexQueryCount,
          spatialIndexRebuildCount: snapshot.render.spatialIndexRebuildCount,
          spatialIndexUpdateCount: snapshot.render.spatialIndexUpdateCount,
        },
        worstFrameMs: snapshot.render.worstFrameMs,
      },
    ]),
  );
}

function recommendationForResults(results) {
  const largestSparse = results.find(
    (result) => result.nodeCount === 5000 && result.edgeDensity === 1,
  );
  const largestDense = results.find(
    (result) => result.nodeCount === 5000 && result.edgeDensity === 2,
  );
  if (!largestSparse || !largestDense) {
    return "No Phase 7 recommendation: the largest required scenario did not run.";
  }
  const sparseMetrics = largestSparse.metrics.afterNodeDrag;
  const denseMetrics = largestDense.metrics.afterNodeDrag;
  const edgeDensityDeltaMs = denseMetrics.averageFrameMs - sparseMetrics.averageFrameMs;
  if (sparseMetrics.averageFrameMs <= 24 && denseMetrics.averageFrameMs <= 24) {
    return "Do not start Phase 7 virtualization yet; Phase 6 measurements are within the local report-only interaction budget for the required synthetic scenarios.";
  }
  if (sparseMetrics.averageFrameMs > 50 && edgeDensityDeltaMs < 50) {
    return "Start Phase 7 with visible node/port pooling first; sparse 5,000-node performance already misses the budget and the node-scaled display-object counters dominate before edge density does. Recheck edge culling after node/port pooling.";
  }
  return "Start Phase 7 with edge culling first; the dense edge scenario adds enough frame cost over the sparse case to make edge work the immediate bottleneck.";
}
