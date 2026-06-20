import { join } from "node:path";
import process from "node:process";
import { URL } from "node:url";

import { readJsonLinesOptional } from "./electron-cdp-harness.mjs";

export function assertPhase0PerformanceGuardrails({
  artifacts,
  final,
  initial,
  scenario,
  semanticTraffic,
  syntheticScene,
}) {
  const gate = phase0PerformanceScenarioGate({
    diagnostics: artifacts.metrics,
    final,
    initial,
    scenario,
    semanticTraffic,
    syntheticScene,
  });
  const failures = gate.checks
    .filter((check) => check.severity === "hard" && check.status !== "pass")
    .map((check) => `${check.id}: ${check.summary}`);
  if (failures.length > 0) {
    throw new Error(`phase 0 performance guardrails failed: ${failures.join("; ")}`);
  }
  return gate;
}

export function assertPhase8PerformanceGuardrails(request) {
  return assertPhase0PerformanceGuardrails(request);
}

export async function workflowGraphSemanticTrafficDuringInteraction({ artifactDir, inputWindow }) {
  const window = interactionWindow(inputWindow);
  if (window === null) {
    return emptySemanticTrafficMetrics();
  }
  const [ipcRows, backendRows] = await Promise.all([
    readJsonLinesOptional(join(artifactDir, "ipc.jsonl")),
    readJsonLinesOptional(join(artifactDir, "backend-http.jsonl")),
  ]);
  return {
    firstInputAt: inputWindow.firstAt,
    lastInputAt: inputWindow.lastAt,
    workingSetHttpRequests: backendRows.filter(
      (row) =>
        row.type === "backend_http_request" &&
        rowInInteractionWindow(row, window) &&
        backendRowPath(row) === "/semantic-graph/working-set/read",
    ).length,
    workingSetIpcStarts: ipcRows.filter(
      (row) =>
        row.type === "ipc_start" &&
        row.channel === "semantic-graph:working-set-read" &&
        rowInInteractionWindow(row, window),
    ).length,
  };
}

export function phase0PerformanceScenarioGate({
  diagnostics,
  final,
  initial,
  scenario,
  semanticTraffic,
  syntheticScene,
}) {
  const context = phase8PerformanceGateContext({
    diagnostics,
    final,
    initial,
    scenario,
    semanticTraffic,
  });
  return {
    checks: phase8PerformanceChecks(context),
    inputCountsByKind: context.inputCounts,
    inputEventCount: context.inputEventCount,
    renderDeltas: context.renderDeltas,
    scenario,
    syntheticScene,
  };
}

function phase8PerformanceGateContext({ diagnostics, final, initial, scenario, semanticTraffic }) {
  const renderDeltas = phase8InteractionRenderDeltas(diagnostics, initial, final);
  const inputMetrics = phase8InputMetrics(diagnostics);
  const labelMetrics = phase8LabelMetrics(final, inputMetrics.panWheelEventCount);
  const renderMetrics = phase8RenderMetrics(
    diagnostics,
    final,
    renderDeltas,
    inputMetrics.nodeDragMoveEvents,
    scenario,
  );
  return {
    diagnostics,
    final,
    renderDeltas,
    semanticTraffic: semanticTraffic ?? emptySemanticTrafficMetrics(),
    scenario,
    timingThresholdsHard: phase0TimingThresholdsHard(),
    wheelLatency: diagnostics?.wheelLatency ?? emptyWheelLatencyMetrics(),
    ...inputMetrics,
    ...labelMetrics,
    ...renderMetrics,
  };
}

function phase8InteractionRenderDeltas(diagnostics, initial, final) {
  return diagnostics?.interactionRenderDeltas ?? renderCounterDeltas(initial.render, final.render);
}

function phase8InputMetrics(diagnostics) {
  const inputCounts = phase8InputCounts(diagnostics);
  return {
    inputCounts,
    inputCountsByKind: inputCounts,
    inputEventCount: diagnostics?.inputEventCount ?? 0,
    nodeDragMoveEvents: phase8InputKindCount(inputCounts, "node-drag"),
    panWheelEventCount: phase8PanWheelEventCount(inputCounts),
  };
}

function phase8InputCounts(diagnostics) {
  return diagnostics?.inputCountsByKind ?? {};
}

function phase8InputKindCount(inputCounts, kind) {
  return inputCounts[kind] ?? 0;
}

function phase8PanWheelEventCount(inputCounts) {
  return (
    phase8InputKindCount(inputCounts, "pointer-pan") +
    phase8InputKindCount(inputCounts, "wheel") +
    phase8InputKindCount(inputCounts, "wheel-burst")
  );
}

function phase8LabelMetrics(final, panWheelEventCount) {
  const graphNodeCount = Number(final.graph.nodeCount ?? 0);
  return {
    cameraMovingLabelSyncBudget: 0,
    fullGraphLabelSyncBudget: phase8FullGraphLabelSyncBudget(graphNodeCount, panWheelEventCount),
    graphNodeCount,
    materializedLabelCount: Math.max(1, Number(final.render.materializedLabelCount ?? 0)),
  };
}

function phase8FullGraphLabelSyncBudget(graphNodeCount, panWheelEventCount) {
  return Math.max(1, panWheelEventCount) * Math.max(1, graphNodeCount) * 0.25;
}

function phase8RenderMetrics(diagnostics, final, renderDeltas, nodeDragMoveEvents, scenario) {
  return {
    coalescedStaticGlowBudget: phase8StaticGlowBudget(renderDeltas, nodeDragMoveEvents),
    displayObjectBudget: phase8DisplayObjectBudget(scenario),
    cameraMovingLabelSyncDelta: Number(renderDeltas.cameraMovingLabelSyncedFrameCount ?? 0),
    labelSyncDelta: Number(renderDeltas.labelSyncCount ?? 0),
    materializedNodeBudget: phase8MaterializedNodeBudget(final),
    nodeDragDelta: Number(renderDeltas.nodeDragUpdateCount ?? 0),
    staticGlowRedrawCount: phase8StaticGlowRedrawCount(diagnostics),
  };
}

function phase8StaticGlowBudget(renderDeltas, nodeDragMoveEvents) {
  return Number(renderDeltas.cameraDependentSyncFrameCount ?? 0) + nodeDragMoveEvents + 6;
}

function phase8StaticGlowRedrawCount(diagnostics) {
  return diagnostics?.timingBucketDeltas?.["static-glow-redraw"]?.count ?? 0;
}

function phase8MaterializedNodeBudget(final) {
  return Math.max(
    96,
    Math.ceil(Number(final.render.lastVisibleMaterializedNodeCount ?? 0) * 3 + 64),
  );
}

function phase8DisplayObjectBudget(scenario) {
  return scenario === "large" ? 2500 : 3000;
}

function phase8PerformanceChecks(context) {
  const checks = [
    ...phase0StructuralChecks(context),
    ...phase8NodeDragChecks(context),
    ...phase0CameraLatencyChecks(context),
    phase0CameraWorkingSetReadCheck(context),
    phase0PresentedFrameBudgetBlockedCheck(context),
    phase8LabelSyncCheck(context),
    phase8StaticGlowCheck(context),
    phase8MaterializedNodeCountCheck(context),
    phase8DisplayObjectCountCheck(context),
    phase8FrameBudgetCheck(context),
    phase8LongTaskCheck(context),
  ];
  return checks;
}

function phase0StructuralChecks(context) {
  return [
    phase0ActiveRendererCountCheck(context),
    phase0RendererInstanceStabilityCheck(context),
    phase0RendererCanvasCreationCheck(context),
    phase0PaneMutationCheck(context),
    phase0ReactCommitCheck(context),
    phase0GraphReplacementCheck(context),
  ];
}

function phase0ActiveRendererCountCheck({ diagnostics }) {
  const lifecycle = diagnostics?.rendererLifecycle ?? {};
  const duplicateSampleCount = lifecycle.duplicateRendererSamples?.length ?? 0;
  return hardCheck({
    actual: duplicateSampleCount,
    budget: 0,
    id: "one-active-renderer-for-focused-graph-surface",
    pass: duplicateSampleCount === 0,
    summary: `duplicateRendererSamples=${duplicateSampleCount}, maxCanvasCountForSurface=${lifecycle.maxCanvasCountForSurface ?? 0}, maxActiveRendererCount=${lifecycle.maxActiveRendererCount ?? 0}`,
  });
}

function phase0RendererInstanceStabilityCheck({ diagnostics }) {
  const lifecycle = diagnostics?.rendererLifecycle ?? {};
  return hardCheck({
    actual: lifecycle.rendererInstanceChanged ? 1 : 0,
    budget: 0,
    id: "no-renderer-instance-replacement-during-interaction",
    pass: lifecycle.rendererInstanceChanged !== true,
    summary: `beforeRendererInstanceId=${lifecycle.beforeRendererInstanceId}, afterRendererInstanceId=${lifecycle.afterRendererInstanceId}`,
  });
}

function phase0RendererCanvasCreationCheck({ diagnostics }) {
  const lifecycle = diagnostics?.rendererLifecycle ?? {};
  const actual = Number(lifecycle.canvasCreationDelta ?? 0);
  return hardCheck({
    actual,
    budget: 0,
    id: "no-graph-app-creation-during-camera-interaction",
    pass: actual === 0,
    summary: `canvasCreationDelta=${actual}, rendererDestroyDelta=${lifecycle.rendererDestroyDelta ?? 0}`,
  });
}

function phase0PaneMutationCheck({ diagnostics }) {
  const actual = Number(diagnostics?.paneMutations?.cameraCausedCount ?? 0);
  return hardCheck({
    actual,
    budget: 0,
    id: "no-camera-caused-workspace-presentation-writes",
    pass: actual === 0,
    summary: `cameraCausedPaneMutations=${actual}`,
  });
}

function phase0ReactCommitCheck({ diagnostics }) {
  const actual = Number(diagnostics?.reactCommits?.cameraCausedCount ?? 0);
  return hardCheck({
    actual,
    budget: 0,
    id: "no-camera-caused-graph-react-commits",
    pass: actual === 0,
    summary: `cameraCausedReactCommits=${actual}, totalReactCommits=${diagnostics?.reactCommits?.totalCount ?? 0}`,
  });
}

function phase0GraphReplacementCheck({ diagnostics }) {
  const actual = Number(diagnostics?.graphSceneReplacementCount ?? 0);
  return hardCheck({
    actual,
    budget: 0,
    id: "no-camera-caused-full-graph-replacement",
    pass: actual === 0,
    summary: `graphSceneReplacementCount=${actual}`,
  });
}

function phase8NodeDragChecks(context) {
  if (context.scenario === "runtime-burst") {
    return [];
  }
  return [phase8NodeDragCheck(context)];
}

function phase8NodeDragCheck({ nodeDragDelta }) {
  return hardCheck({
    actual: nodeDragDelta,
    id: "node-drag-recorded",
    pass: nodeDragDelta > 0,
    summary: `nodeDragUpdateCount advanced by ${nodeDragDelta}`,
  });
}

function phase0CameraLatencyChecks(context) {
  if (
    context.scenario !== "small-trackpad" &&
    context.scenario !== "small-active" &&
    context.scenario !== "runtime-burst"
  ) {
    return [];
  }
  return [
    phase0WheelEventToCameraUpdateCheck(context),
    phase0WheelEventToFirstPixiRenderCheck(context),
  ];
}

function phase0WheelEventToCameraUpdateCheck({ timingThresholdsHard, wheelLatency }) {
  const check = phase0TimingCheck({ timingThresholdsHard });
  return check({
    actual: wheelLatency.p95EventToCameraUpdateMs,
    budget: 16,
    id: "idle-wheel-pinch-to-camera-transform-p95-ms",
    pass: wheelLatency.sampleCount > 0 && Number(wheelLatency.p95EventToCameraUpdateMs) < 16,
    summary: `wheelLatencySamples=${wheelLatency.sampleCount}, maxEventToCameraUpdateMs=${wheelLatency.maxEventToCameraUpdateMs}`,
  });
}

function phase0WheelEventToFirstPixiRenderCheck({ timingThresholdsHard, wheelLatency }) {
  const check = phase0TimingCheck({ timingThresholdsHard });
  return check({
    actual: wheelLatency.p95EventToFirstPixiRenderAfterCameraMs,
    budget: 32,
    id: "idle-wheel-pinch-to-first-pixi-render-proxy-p95-ms",
    pass:
      wheelLatency.sampleCount > 0 &&
      Number(wheelLatency.p95EventToFirstPixiRenderAfterCameraMs) < 32,
    summary: `wheelLatencySamples=${wheelLatency.sampleCount}, maxEventToFirstPixiRenderAfterCameraMs=${wheelLatency.maxEventToFirstPixiRenderAfterCameraMs}; this is a Pixi postrender proxy, not compositor presentation`,
  });
}

function phase0CameraWorkingSetReadCheck({ semanticTraffic }) {
  const actual = semanticTraffic.workingSetIpcStarts + semanticTraffic.workingSetHttpRequests;
  return hardCheck({
    actual,
    budget: 0,
    id: "no-semantic-working-set-reads-during-camera-interaction",
    pass: actual === 0,
    summary: `workingSetIpcStarts=${semanticTraffic.workingSetIpcStarts}, workingSetHttpRequests=${semanticTraffic.workingSetHttpRequests}, firstInputAt=${semanticTraffic.firstInputAt}, lastInputAt=${semanticTraffic.lastInputAt}`,
  });
}

function phase0PresentedFrameBudgetBlockedCheck() {
  return reportOnlyCheck({
    actual: null,
    budget: null,
    id: "input-to-presented-frame-budget-blocked",
    pass: false,
    summary:
      "no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only",
  });
}

function phase8LabelSyncCheck(context) {
  return hardCheck({
    actual: context.cameraMovingLabelSyncDelta,
    budget: context.cameraMovingLabelSyncBudget,
    id: "no-full-graph-label-sync-per-pan-wheel-event",
    pass: context.panWheelEventCount === 0 || context.cameraMovingLabelSyncDelta === 0,
    summary: `cameraMovingLabelSyncDelta=${context.cameraMovingLabelSyncDelta}, labelSyncDelta=${context.labelSyncDelta}, panWheelEventCount=${context.panWheelEventCount}, graphNodeCount=${context.graphNodeCount}, materializedLabelCount=${context.materializedLabelCount}`,
  });
}

function phase8StaticGlowCheck(context) {
  const check = context.scenario === "runtime-burst" ? reportOnlyCheck : hardCheck;
  return check({
    actual: context.staticGlowRedrawCount,
    budget: context.coalescedStaticGlowBudget,
    id: "static-glow-not-redrawn-per-pan-wheel-event",
    pass: context.staticGlowRedrawCount <= context.coalescedStaticGlowBudget,
    summary: `staticGlowRedrawCount=${context.staticGlowRedrawCount}, cameraDependentSyncFrameDelta=${context.renderDeltas.cameraDependentSyncFrameCount}, nodeDragMoveEvents=${context.nodeDragMoveEvents}`,
  });
}

function phase8MaterializedNodeCountCheck({ final, materializedNodeBudget }) {
  return hardCheck({
    actual: final.render.materializedNodeCount,
    budget: materializedNodeBudget,
    id: "materialized-node-count-scales-with-visible-nodes",
    pass: Number(final.render.materializedNodeCount ?? 0) <= materializedNodeBudget,
    summary: `materializedNodeCount=${final.render.materializedNodeCount}, visibleMaterializedNodeCount=${final.render.lastVisibleMaterializedNodeCount}`,
  });
}

function phase8DisplayObjectCountCheck({ displayObjectBudget, final }) {
  return reportOnlyCheck({
    actual: final.render.totalDisplayObjectCount,
    budget: displayObjectBudget,
    id: "supplemental-display-object-count-budget",
    pass: Number(final.render.totalDisplayObjectCount ?? 0) <= displayObjectBudget,
    summary: `totalDisplayObjectCount=${final.render.totalDisplayObjectCount}, materializedNodeCount=${final.render.materializedNodeCount}; supplemental only, not a CPU scene-visit substitute`,
  });
}

function phase8FrameBudgetCheck({ final, scenario }) {
  return reportOnlyCheck({
    actual: final.render.p95FrameMs,
    budget: 24,
    id: "normal-scene-p95-pan-zoom-frame-ms",
    pass: scenario === "large" || Number(final.render.p95FrameMs ?? 0) <= 24,
    summary: `p95FrameMs=${final.render.p95FrameMs}; noisy threshold remains report-only`,
  });
}

function phase8LongTaskCheck({ diagnostics, scenario, timingThresholdsHard }) {
  const maxLongTaskMs = diagnostics?.maxLongTaskMs ?? 0;
  const check = scenario === "large" || !timingThresholdsHard ? reportOnlyCheck : hardCheck;
  return check({
    actual: maxLongTaskMs,
    budget: 100,
    id: "no-long-task-over-100ms",
    pass: Number(maxLongTaskMs) <= 100,
    summary:
      scenario === "large"
        ? `maxLongTaskMs=${maxLongTaskMs}; large scale sweep remains report-only`
        : !timingThresholdsHard
          ? `maxLongTaskMs=${maxLongTaskMs}; non-reference runner remains report-only`
          : `maxLongTaskMs=${maxLongTaskMs}`,
  });
}

function phase0TimingCheck({ timingThresholdsHard }) {
  return timingThresholdsHard ? hardCheck : reportOnlyCheck;
}

function phase0TimingThresholdsHard() {
  return (
    process.env.SETTA_WORKFLOW_GRAPH_PHASE0_REFERENCE_RUNNER === "1" ||
    process.env.SETTA_PERFORMANCE_REFERENCE_RUNNER === "1"
  );
}

function emptySemanticTrafficMetrics() {
  return {
    firstInputAt: "",
    lastInputAt: "",
    workingSetHttpRequests: 0,
    workingSetIpcStarts: 0,
  };
}

function emptyWheelLatencyMetrics() {
  return {
    maxEventToCameraUpdateMs: 0,
    maxEventToFirstPixiRenderAfterCameraMs: 0,
    p95EventToCameraUpdateMs: 0,
    p95EventToFirstPixiRenderAfterCameraMs: 0,
    sampleCount: 0,
  };
}

function hardCheck({ actual, budget = null, id, pass, summary }) {
  return { actual, budget, id, severity: "hard", status: pass ? "pass" : "fail", summary };
}

function reportOnlyCheck({ actual, budget, id, pass, summary }) {
  return {
    actual,
    budget,
    id,
    severity: "report-only",
    status: pass ? "pass" : "report",
    summary,
  };
}

function renderCounterDeltas(initialRender, finalRender) {
  const counters = [
    "cameraDependentSyncFrameCount",
    "cameraMovingLabelDeferredFrameCount",
    "cameraMovingSyncFrameCount",
    "cameraMovingLabelSyncedFrameCount",
    "cameraSettleLabelSyncCount",
    "cameraSettleRestoreFrameCount",
    "cameraSettledSyncFrameCount",
    "cameraUpdateCount",
    "frameCount",
    "labelSyncCount",
    "nodeDragUpdateCount",
    "pointerPanUpdateCount",
    "spatialIndexQueryCount",
    "wheelInputEventCount",
    "wheelInputGestureCount",
    "wheelPanUpdateCount",
    "wheelZoomUpdateCount",
  ];
  return Object.fromEntries(
    counters.map((counter) => [
      counter,
      Number(finalRender[counter] ?? 0) - Number(initialRender[counter] ?? 0),
    ]),
  );
}

function interactionWindow(inputWindow) {
  const first = Date.parse(inputWindow?.firstAt ?? "");
  const last = Date.parse(inputWindow?.lastAt ?? "");
  if (!Number.isFinite(first) || !Number.isFinite(last)) {
    return null;
  }
  return {
    first,
    last: last + 1000,
  };
}

function rowInInteractionWindow(row, window) {
  const timestamp = Date.parse(row.at ?? "");
  return Number.isFinite(timestamp) && timestamp >= window.first && timestamp <= window.last;
}

function backendRowPath(row) {
  return new URL(row.url).pathname;
}
