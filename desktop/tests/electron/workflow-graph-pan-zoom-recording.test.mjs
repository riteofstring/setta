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
  dispatchRecordedWorkflowGraphMouseClick,
  dispatchRecordedWorkflowGraphMouseMove,
  dispatchRecordedWorkflowGraphWheel,
  dispatchRecordedWorkflowGraphWheelBurst,
  getWorkflowGraphDebugSnapshot,
  recordWorkflowGraphPanZoomDiagnostics,
} from "./workflow-graph-performance-recording.mjs";
import {
  assertPhase0PerformanceGuardrails,
  workflowGraphSemanticTrafficDuringInteraction,
} from "./workflow-graph-phase0-performance-guardrails.mjs";
import { collectPhase0RunMetadata } from "./workflow-graph-phase0-run-metadata.mjs";
import {
  assertPhase0MatrixGatePassed,
  appendPhase0PerformanceReport,
  parsePanZoomPerformanceArtifacts,
} from "./workflow-graph-phase0-performance-report.mjs";
import { assertPinnedPhase0Viewport } from "./workflow-graph-phase0-viewport.mjs";
import {
  launchEnvForScenario,
  phase0WorkloadDefinitions,
  phase0WorkloadForScenario,
} from "./workflow-graph-phase0-workloads.mjs";
import {
  assertPhase0DebugSnapshot,
  summarizeSnapshot,
} from "./workflow-graph-pan-zoom-snapshot-assertions.mjs";

const scenarioNames = new Set([
  "active",
  "baseline",
  "dense",
  "large",
  "normal",
  "phase0",
  "phase3",
  "scaling",
  "simple",
  "small-active",
  "small-trackpad",
  "stress",
]);
const largeNodeCounts = [500, 1000, 2500, 5000];
const scalingNodeCounts = [100, 500, 1000, 2500, 5000];
const largeSyntheticScenes = ["workflow", "semantic-cells"];
const scenarioTimeoutMs = 120_000;
const syntheticSceneForScenario = (scenario, fallback) =>
  phase0WorkloadDefinitions[scenario]?.syntheticScene ?? fallback;
const devicePixelRatioForWorkload = (workload) => workload?.devicePixelRatio ?? null;
const viewportForWorkload = (workload) => workload?.viewport ?? null;
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

const options = parseGraphRecordingArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    `Usage: node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario <phase0|phase3|simple|normal|dense|stress|scaling|baseline|active|large|small-active|small-trackpad> [--app-recording <on|off>] [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>] [--write-report]`,
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
    options.scenario === "phase3"
      ? await runPhase3Matrix()
      : options.scenario === "phase0"
        ? await runPhase0Matrix()
        : options.scenario === "large"
          ? await runLargeScenarios()
          : options.scenario === "scaling"
            ? await runScalingScenarios()
            : [
                await runScenario({
                  appRecordingEnabled: options.appRecordingEnabled,
                  artifactDir: artifactRoot,
                  scenario: options.scenario,
                }),
              ];
  const phase0Gate = await parsePanZoomPerformanceArtifacts({
    artifactRoot,
    phase: options.scenario === "phase3" ? "phase3" : "phase0",
  });
  await writeJson(join(artifactRoot, "phase0-performance-gate.json"), phase0Gate);
  if (options.writeReport) {
    await appendPhase0PerformanceReport(phase0Gate);
  }
  assertPhase0MatrixGatePassed(phase0Gate);
  await writeJson(join(artifactRoot, "summary.json"), {
    artifactRoot,
    phase0Gate: join(artifactRoot, "phase0-performance-gate.json"),
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
          appRecordingEnabled: options.appRecordingEnabled,
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

async function runPhase3Matrix() {
  const summaries = [];
  for (const mode of phase3RecordingModes()) {
    await runPhase0Matrix({
      appRecordingEnabled: mode.appRecordingEnabled,
      matrixRoot: join(artifactRoot, mode.artifactName),
      summaries,
    });
  }
  return summaries;
}

function phase3RecordingModes() {
  return [
    { appRecordingEnabled: true, artifactName: "recording-on" },
    { appRecordingEnabled: false, artifactName: "recording-off" },
  ];
}

async function runPhase0Matrix({
  appRecordingEnabled = options.appRecordingEnabled,
  matrixRoot = artifactRoot,
  summaries = [],
} = {}) {
  for (const scenario of ["simple", "normal", "dense", "stress"]) {
    const artifactDir = join(matrixRoot, scenario);
    summaries.push(await runScenario({ appRecordingEnabled, artifactDir, scenario }));
    await writeJson(join(artifactRoot, "summary.json"), {
      artifactRoot,
      scenarios: summaries,
      status: "running",
    });
  }
  for (const summary of await runScalingScenarios(join(matrixRoot, "scaling"), {
    appRecordingEnabled,
  })) {
    summaries.push(summary);
  }
  return summaries;
}

async function runScalingScenarios(
  scalingRoot = artifactRoot,
  { appRecordingEnabled = options.appRecordingEnabled } = {},
) {
  const summaries = [];
  for (const nodeCount of scalingNodeCounts) {
    const artifactDir = join(scalingRoot, `${nodeCount}-nodes`);
    summaries.push(
      await runScenario({
        appRecordingEnabled,
        artifactDir,
        nodeCount,
        scenario: "scaling",
        syntheticScene: "phase0-scaling",
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

async function runScenario({
  appRecordingEnabled = true,
  artifactDir,
  nodeCount = 0,
  scenario,
  syntheticScene = "workflow",
}) {
  const effectiveSyntheticScene = syntheticSceneForScenario(scenario, syntheticScene);
  const phase0Workload = phase0WorkloadForScenario(scenario, nodeCount);
  const fixture = await createElectronFixture(scenarioFixtureName({ nodeCount, scenario }));
  let context = null;
  let workflowGraphSurfaceId = null;
  try {
    await prepareScenarioBeforeLaunch({ fixture, scenario });
    context = await launchElectronCdpContext({
      artifactDir,
      deviceScaleFactor: devicePixelRatioForWorkload(phase0Workload),
      extraEnv: launchEnvForScenario({
        nodeCount,
        scenario,
        syntheticScene: effectiveSyntheticScene,
      }),
      fixture,
      recordingEnabled: appRecordingEnabled,
      visible: options.visible,
      windowSize: viewportForWorkload(phase0Workload),
    });
    await assertPinnedPhase0Viewport({
      client: context.client,
      waitForState,
      workload: phase0Workload,
    });
    const runMetadata = await collectPhase0RunMetadata({
      client: context.client,
      nodeCount,
      recordingEnabled: appRecordingEnabled,
      skipBuild: options.skipBuild,
      scenario,
      syntheticScene: effectiveSyntheticScene,
    });
    await writeJson(join(artifactDir, "run-metadata.json"), runMetadata);
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
    const contactSheet = await captureScenarioContactSheet({
      artifactDir,
      client: context.client,
      scenario,
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
    const semanticTraffic = await workflowGraphSemanticTrafficDuringInteraction({
      artifactDir,
      inputWindow: artifacts.metrics.inputWindow,
    });
    const phase0Gate = assertPhase0PerformanceGuardrails({
      artifacts,
      final,
      initial,
      scenario,
      semanticTraffic,
      syntheticScene: effectiveSyntheticScene,
    });
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
      runMetadata,
      nodeCount: final.graph.nodeCount,
      phase0Gate,
      recordingEnabled: appRecordingEnabled,
      scenario,
      status: "passed",
      syntheticScene: effectiveSyntheticScene,
    };
    await writeJson(join(artifactDir, "summary.json"), summary);
    return summary;
  } catch (error) {
    await writeScenarioFailureArtifacts({ artifactDir, context, workflowGraphSurfaceId });
    await writeJson(join(artifactDir, "summary.json"), {
      artifactDir,
      error: errorMessage(error),
      scenario,
      status: "failed",
    });
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

function scenarioFixtureName({ nodeCount, scenario }) {
  return `workflow-graph-pan-zoom-${scenario}${nodeCount ? `-${nodeCount}` : ""}`;
}

async function captureScenarioContactSheet({ artifactDir, client, scenario, surfaceId }) {
  if (scenario === "scaling") {
    return { htmlPath: null };
  }
  return captureWorkflowGraphFitContactSheet({
    artifactDir,
    client,
    name: "fit-to-view",
    surfaceId,
  });
}

async function writeScenarioFailureArtifacts({ artifactDir, context, workflowGraphSurfaceId }) {
  if (!context) {
    return;
  }
  await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  if (!workflowGraphSurfaceId) {
    return;
  }
  await getWorkflowGraphDebugSnapshot(context.client, workflowGraphSurfaceId, false)
    .then((snapshot) => writeJson(join(artifactDir, "failure-snapshot.json"), snapshot))
    .catch(() => {});
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
  await exerciseHoverSelectionAndNodeDrag(client, surfaceId, inputSamples);
  if (scenario === "small-active" || scenario === "small-trackpad") {
    await exerciseSmallTrackpadPanZoom(client, surfaceId, inputSamples);
    return;
  }
  await exercisePanZoom(client, surfaceId, inputSamples);
}

async function exerciseHoverSelectionAndNodeDrag(client, surfaceId, inputSamples) {
  const snapshot = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
  const target = hitTestTargetNode(snapshot, { preferPortlessNode: true });
  if (!target) {
    throw new Error(
      `workflow graph interaction target missing before phase 8 drag: ${JSON.stringify({
        materializedNodeCount: snapshot.render.materializedNodeCount,
        nodeCount: snapshot.graph.nodeCount,
        visibleMaterializedNodeCount: snapshot.render.lastVisibleMaterializedNodeCount,
      })}`,
    );
  }
  await dispatchRecordedWorkflowGraphMouseMove(
    client,
    surfaceId,
    { x: target.point.x, y: target.point.y },
    inputSamples,
  );
  await delay(32);
  const dragTarget = nodeDragTargetPoint(target.point, snapshot.canvas);
  await dispatchRecordedWorkflowGraphMouseDrag(
    client,
    surfaceId,
    {
      downKind: "node-drag-down",
      from: target.point,
      holdMs: 0,
      moveKind: "node-drag",
      startKind: "node-drag-hover",
      steps: 8,
      to: dragTarget,
      upKind: "node-drag-up",
    },
    inputSamples,
  );
  await delay(64);
  const dragged = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
  if (dragged.render.nodeDragUpdateCount <= snapshot.render.nodeDragUpdateCount) {
    throw new Error(
      `workflow graph node drag counter did not advance: target=${JSON.stringify(
        target,
      )} before=${snapshot.render.nodeDragUpdateCount} after=${dragged.render.nodeDragUpdateCount}`,
    );
  }
  const cleared = await clearWorkflowGraphSelection(client, surfaceId);
  const selectionTarget = hitTestTargetNode(cleared, { preferPortedNode: true });
  if (!selectionTarget) {
    throw new Error("workflow graph selection target missing after recorded drag cleanup");
  }
  await dispatchRecordedWorkflowGraphMouseClick(
    client,
    surfaceId,
    { x: selectionTarget.point.x, y: selectionTarget.point.y },
    inputSamples,
  );
  await delay(64);
  const selected = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
  if (!selected.interaction.selectedNodeIds.includes(selectionTarget.nodeId)) {
    throw new Error(
      `workflow graph node selection did not apply after recorded click: target=${JSON.stringify(
        selectionTarget,
      )} selected=${JSON.stringify(selected.interaction.selectedNodeIds)}`,
    );
  }
  await clearWorkflowGraphSelection(client, surfaceId);
}

async function clearWorkflowGraphSelection(client, surfaceId) {
  await client.driver("dispatchDocumentEscape");
  const value = await waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", { includeVisual: false, surfaceId }),
    (candidate) =>
      candidate.ready &&
      candidate.snapshot.canvas.left >= 0 &&
      candidate.snapshot.interaction.selectedNodeIds.length === 0,
    scenarioTimeoutMs,
  );
  return value.snapshot;
}

function nodeDragTargetPoint(point, canvas) {
  const preferred = { x: point.x - 56, y: point.y - 36 };
  const clamped = clampCanvasPoint(preferred, canvas, 24);
  if (pointDistance(point, clamped) >= 24) {
    return clamped;
  }
  return clampCanvasPoint({ x: point.x + 56, y: point.y + 36 }, canvas, 24);
}

function clampCanvasPoint(point, canvas, margin) {
  return {
    x: Math.max(margin, Math.min(canvas.clientWidth - margin, point.x)),
    y: Math.max(margin, Math.min(canvas.clientHeight - margin, point.y)),
  };
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
  const center = await visibleWorkflowGraphCanvasPoint(client, surfaceId);
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
  await ensureSmallTrackpadWheelCounters({
    before: snapshot,
    center,
    client,
    inputSamples,
    surfaceId,
  });
}

async function ensureSmallTrackpadWheelCounters({
  before,
  center,
  client,
  inputSamples,
  surfaceId,
}) {
  const afterBurst = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
  if (wheelPanZoomCountersAdvanced(before, afterBurst)) {
    return;
  }
  await dispatchRecordedWorkflowGraphWheel(
    client,
    surfaceId,
    {
      deltaX: 160,
      deltaY: 90,
      x: center.x,
      y: center.y,
    },
    inputSamples,
  );
  await dispatchRecordedWorkflowGraphWheel(
    client,
    surfaceId,
    {
      deltaY: -180,
      modifiers: 2,
      x: center.x,
      y: center.y,
    },
    inputSamples,
  );
  await delay(180);
}

async function visibleWorkflowGraphCanvasPoint(client, surfaceId) {
  const rect = await client.driver("workflowGraphCanvasRect", { surfaceId });
  const viewport = await client.evaluate(
    "({ width: window.innerWidth, height: window.innerHeight })",
  );
  return canvasPointForPagePoint(rect, visiblePagePointForRect(rect, viewport));
}

function visiblePagePointForRect(rect, viewport) {
  const margin = 24;
  const left = Math.max(margin, rect.left + margin);
  const right = Math.min(viewport.width - margin, rect.left + rect.width - margin);
  const top = Math.max(margin, rect.top + margin);
  const bottom = Math.min(viewport.height - margin, rect.top + rect.height - margin);
  if (right < left || bottom < top) {
    throw new Error(
      `workflow graph canvas has no visible interaction point: rect=${JSON.stringify(
        rect,
      )} viewport=${JSON.stringify(viewport)}`,
    );
  }
  return {
    x: Math.round((left + right) / 2),
    y: Math.round((top + bottom) / 2),
  };
}

function canvasPointForPagePoint(rect, pagePoint) {
  return {
    x: Math.round((pagePoint.x - rect.left) * (rect.clientWidth / rect.width)),
    y: Math.round((pagePoint.y - rect.top) * (rect.clientHeight / rect.height)),
  };
}

function wheelPanZoomCountersAdvanced(before, after) {
  return (
    after.render.wheelPanUpdateCount > before.render.wheelPanUpdateCount &&
    after.render.wheelZoomUpdateCount > before.render.wheelZoomUpdateCount
  );
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
  const target = hitTestTargetNode(snapshot, { preferPortedNode: true });
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

function hitTestTargetNode(
  snapshot,
  { preferPortedNode = false, preferPortlessNode = false } = {},
) {
  const candidateMargin = preferPortlessNode ? 48 : 4;
  let candidates = materializedCanvasNodes(snapshot, candidateMargin);
  if (candidates.length === 0 && candidateMargin !== 4) {
    candidates = materializedCanvasNodes(snapshot, 4);
  }
  if (candidates.length === 0) {
    return null;
  }
  const canvasCenter = {
    x: snapshot.canvas.clientWidth / 2,
    y: snapshot.canvas.clientHeight / 2,
  };
  const portedNodes = snapshot.graph.nodes.filter(
    (node) => node.materialized === true && (node.ports?.length ?? 0) > 0,
  );
  candidates.sort(
    (left, right) =>
      nodeHitTestTargetPriority(left, { preferPortedNode, preferPortlessNode }) -
        nodeHitTestTargetPriority(right, { preferPortedNode, preferPortlessNode }) ||
      nodeHitTestTargetClearance(right, { portedNodes, preferPortlessNode }) -
        nodeHitTestTargetClearance(left, { portedNodes, preferPortlessNode }) ||
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

function materializedCanvasNodes(snapshot, margin) {
  return snapshot.graph.nodes
    .filter((node) => node.materialized === true)
    .filter((node) =>
      pointInsideCanvas({ x: node.screenX, y: node.screenY }, snapshot.canvas, margin),
    );
}

function nodeHitTestTargetPriority(node, { preferPortedNode = false, preferPortlessNode = false }) {
  if (preferPortedNode) {
    return nodePortedPriority(node);
  }
  if (preferPortlessNode) {
    return nodePortlessPriority(node);
  }
  return 0;
}

function nodePortedPriority(node) {
  return nodePortCount(node) > 0 ? 0 : 1;
}

function nodePortlessPriority(node) {
  return nodePortCount(node) === 0 ? 0 : 1;
}

function nodePortCount(node) {
  return node.ports?.length ?? 0;
}

function nodeHitTestTargetClearance(node, { portedNodes, preferPortlessNode }) {
  if (!preferPortlessNode) {
    return 0;
  }
  if ((node.ports?.length ?? 0) > 0 || portedNodes.length === 0) {
    return 0;
  }
  return Math.min(
    ...portedNodes.map((portedNode) =>
      pointDistance(
        { x: node.screenX, y: node.screenY },
        { x: portedNode.screenX, y: portedNode.screenY },
      ),
    ),
  );
}

function pointInsideCanvas(point, canvas, margin = 4) {
  return (
    point.x >= margin &&
    point.x <= canvas.clientWidth - margin &&
    point.y >= margin &&
    point.y <= canvas.clientHeight - margin
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
  const phase0Scenario = Boolean(phase0WorkloadDefinitions[scenario]) || scenario === "scaling";
  if (!baseInitialSnapshotReady(snapshot, { requireVisual: !phase0Scenario })) {
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
  if (scenario === "small-active") {
    return smallActiveSnapshotReady(snapshot);
  }
  if (phase0WorkloadDefinitions[scenario]) {
    return phase0WorkloadSnapshotReady(snapshot, phase0WorkloadDefinitions[scenario]);
  }
  if (scenario === "scaling") {
    return phase0ScalingSnapshotReady(snapshot, nodeCount);
  }
  return snapshot.graph.nodeCount === nodeCount;
}

function baseInitialSnapshotReady(snapshot, { requireVisual = true } = {}) {
  if (!initialCanvasReady(snapshot) || snapshot.render.frameCount <= 2) {
    return false;
  }
  return requireVisual
    ? snapshot.visual.hasNonBackgroundPixels
    : initialStructuralRenderReady(snapshot);
}

function initialCanvasReady(snapshot) {
  return snapshot.canvas.clientWidth > 0 && snapshot.canvas.clientHeight > 0;
}

function initialStructuralRenderReady(snapshot) {
  return (
    Number(snapshot.render.totalDisplayObjectCount ?? 0) > 0 &&
    Number(snapshot.render.lastVisibleMaterializedNodeCount ?? 0) > 0
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

function smallActiveSnapshotReady(snapshot) {
  const reviewer = snapshot.graph.nodes.find((node) => node.id === "reviewer");
  return (
    hasSmallWorkflowGraphShape(snapshot) &&
    isRunningReviewerNode(reviewer) &&
    snapshot.render.activeEdgeFlowCount > 0
  );
}

function phase0WorkloadSnapshotReady(snapshot, workload) {
  return (
    snapshot.graph.nodeCount === workload.nodeCount &&
    snapshot.graph.edgeCount === workload.edgeCount &&
    snapshot.graph.nodes.filter((node) => node.layer === "workflow").length ===
      workload.workflowNodeCount &&
    snapshot.graph.nodes.filter((node) => node.layer === "semantic").length ===
      workload.semanticNodeCount &&
    trajectorySpriteTotalCount(snapshot) === workload.trajectorySpriteCount
  );
}

function phase0ScalingSnapshotReady(snapshot, workflowNodeCount) {
  return (
    snapshot.graph.nodes.filter((node) => node.layer === "workflow").length === workflowNodeCount &&
    snapshot.graph.nodes.filter((node) => node.layer === "semantic").length === 25 &&
    trajectorySpriteTotalCount(snapshot) === 200
  );
}

function trajectorySpriteTotalCount(snapshot) {
  return Number(snapshot.render.trajectorySpriteTotalCount ?? 0);
}

function hasSmallWorkflowGraphShape(snapshot) {
  return (
    snapshot.graph.nodeCount === 3 &&
    snapshot.graph.edgeCount === 2 &&
    snapshot.graph.nodes.every((node) => node.layer === "workflow")
  );
}

function isRunningReviewerNode(node) {
  return (
    node?.status === "running" &&
    node.runtime?.sourceCount > 0 &&
    node.runtime?.status === "running"
  );
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
  let appRecordingEnabled = true;
  let scenario = "baseline";
  let writeReport = false;
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
    if (arg === "--app-recording") {
      const value = args[index + 1];
      if (value !== "on" && value !== "off") {
        throw new Error("--app-recording must be either on or off");
      }
      appRecordingEnabled = value === "on";
      index += 1;
      continue;
    }
    if (arg === "--write-report") {
      writeReport = true;
      continue;
    }
    harnessArgs.push(arg);
  }
  return {
    ...parseElectronHarnessArgs(harnessArgs),
    appRecordingEnabled,
    scenario,
    writeReport,
  };
}
