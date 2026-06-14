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
} from "./workflow-graph-layout-helpers.mjs";
import { createWorkflowProjectionFixture } from "./workflow-projection-smoke-helpers.mjs";
import {
  captureWorkflowGraphFitContactSheet,
  dispatchRecordedWorkflowGraphMouseDrag,
  dispatchRecordedWorkflowGraphWheel,
  getWorkflowGraphDebugSnapshot,
  recordWorkflowGraphPanZoomDiagnostics,
} from "./workflow-graph-performance-recording.mjs";

const scenarioNames = new Set(["active", "baseline", "large"]);
const largeNodeCounts = [500, 1000, 2500, 5000];
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
    `Usage: node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario <baseline|active|large> [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]`,
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
  for (const nodeCount of largeNodeCounts) {
    const artifactDir = join(artifactRoot, `${nodeCount}-nodes`);
    summaries.push(
      await runScenario({
        artifactDir,
        nodeCount,
        scenario: "large",
      }),
    );
    await writeJson(join(artifactRoot, "summary.json"), {
      artifactRoot,
      scenarios: summaries,
      status: "running",
    });
  }
  return summaries;
}

async function runScenario({ artifactDir, nodeCount = 0, scenario }) {
  const fixture = await createElectronFixture(
    `workflow-graph-pan-zoom-${scenario}${nodeCount ? `-${nodeCount}` : ""}`,
  );
  let context = null;
  let workflowGraphSurfaceId = null;
  try {
    if (scenario === "baseline") {
      await seedSemanticGraphFixture(fixture);
    }
    context = await launchElectronCdpContext({
      artifactDir,
      extraEnv: launchEnvForScenario({ nodeCount, scenario }),
      fixture,
      visible: options.visible,
    });
    if (scenario === "baseline") {
      await createWorkflowProjectionFixture(context.client, fixture.workspaceRoot);
      await reloadPage(context.client);
    }
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
        exercisePanZoom(context.client, workflowGraphSurfaceId, inputSamples),
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
      initial: summarizeSnapshot(initial),
      nodeCount: final.graph.nodeCount,
      scenario,
      status: "passed",
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

function assertPhase0DebugSnapshot(snapshot, expected) {
  assertLargeNodeCount(snapshot, expected);
  assertFiniteRenderCounters(snapshot);
  assertPanZoomCounters(snapshot);
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
    "cameraUpdateCount",
    "labelSyncCount",
    "visibleLabelCount",
    "spatialIndexQueryCount",
    "totalDisplayObjectCount",
  ]) {
    if (!Number.isFinite(snapshot.render[counter])) {
      throw new Error(`render counter was not finite: ${counter}=${snapshot.render[counter]}`);
    }
  }
}

function assertPanZoomCounters(snapshot) {
  if (
    snapshot.render.cameraUpdateCount <= 0 ||
    snapshot.render.pointerPanUpdateCount <= 0 ||
    snapshot.render.wheelPanUpdateCount <= 0 ||
    snapshot.render.wheelZoomUpdateCount <= 0
  ) {
    throw new Error(`pan/zoom counters did not advance: ${JSON.stringify(snapshot.render)}`);
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
      cameraUpdateCount: snapshot.render.cameraUpdateCount,
      frameCount: snapshot.render.frameCount,
      p95FrameMs: snapshot.render.p95FrameMs,
      pointerPanUpdateCount: snapshot.render.pointerPanUpdateCount,
      timingBuckets: snapshot.render.timingBuckets,
      totalDisplayObjectCount: snapshot.render.totalDisplayObjectCount,
      visibleLabelCount: snapshot.render.visibleLabelCount,
      wheelPanUpdateCount: snapshot.render.wheelPanUpdateCount,
      wheelZoomUpdateCount: snapshot.render.wheelZoomUpdateCount,
      worstFrameMs: snapshot.render.worstFrameMs,
    },
  };
}

function launchEnvForScenario({ nodeCount, scenario }) {
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
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_SCENE: "workflow",
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
