import { phase0WorkloadForScenario } from "./workflow-graph-phase0-workloads.mjs";

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
  "scheduler-lane-background-recompute",
  "scheduler-lane-camera-input",
  "scheduler-lane-hover-selection-feedback",
  "scheduler-lane-semantic-runtime-visual",
  "scheduler-lane-settled-fidelity-restore",
  "scheduler-lane-trajectory-runtime-visual",
  "scheduler-lane-visible-position-sync",
  "scene-graph-node-diff-update-rebuild",
  "static-glow-redraw",
];

export function assertPhase0DebugSnapshot(snapshot, expected) {
  assertLargeNodeCount(snapshot, expected);
  const workload = phase0WorkloadForScenario(expected.scenario, expected.nodeCount);
  assertFiniteRenderCounters(snapshot, {
    expectedTrajectorySpriteCount: workload?.trajectorySpriteCount ?? null,
  });
  if (workload) {
    assertTrajectorySpriteCount(snapshot, workload.trajectorySpriteCount);
  }
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

function assertFiniteRenderCounters(snapshot, { expectedTrajectorySpriteCount = null } = {}) {
  for (const counter of [
    "activeCameraInteractionCount",
    "averageFrameMs",
    "p95FrameMs",
    "worstFrameMs",
    "cameraDependentSyncFrameCount",
    "cameraFastPathViolationCount",
    "cameraMovingLabelHiddenFrameCount",
    "cameraMovingLabelDeferredFrameCount",
    "cameraMovingLabelSyncedFrameCount",
    "cameraMovingLabelTransformCount",
    "cameraMovingLabelTransformFrameCount",
    "cameraMovingSyncFrameCount",
    "cameraPanSettleDelayMs",
    "cameraSettleDelayMs",
    "cameraSettleLabelSyncCount",
    "cameraSettleRestoreFrameCount",
    "cameraSettledSyncFrameCount",
    "cameraUpdateCount",
    "cameraZoomSettleDelayMs",
    "labelSyncCount",
    "interactionSchedulerRunCount",
    "lastDrawnEdgeCount",
    "lastDrawnEdgeLabelCount",
    "lastVisibleMaterializedNodeCount",
    "materializedLabelCount",
    "materializedNodeCount",
    "materializedPortCount",
    "nodeDragUpdateCount",
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
  for (const counter of [
    "trajectorySpriteDisplayCount",
    "trajectorySpriteSyncCount",
    "trajectorySpriteTotalCount",
  ]) {
    const value = snapshot.render[counter];
    if (expectedTrajectorySpriteCount === 0 && value === undefined) {
      continue;
    }
    if (!Number.isFinite(value)) {
      throw new Error(`render counter was not finite: ${counter}=${value}`);
    }
  }
}

function assertTrajectorySpriteCount(snapshot, expectedTrajectorySpriteCount) {
  const actual = trajectorySpriteTotalCount(snapshot);
  if (actual !== expectedTrajectorySpriteCount) {
    throw new Error(
      `trajectory sprite count mismatch: expected=${expectedTrajectorySpriteCount} actual=${actual}`,
    );
  }
}

function assertPanZoomCounters(snapshot, { scenario }) {
  assertCameraWheelUpdateCounters(snapshot);
  assertPointerPanCounter(snapshot, scenario);
  assertWheelInputCounters(snapshot);
  assertNodeDragCounter(snapshot);
}

function assertCameraWheelUpdateCounters(snapshot) {
  if (
    snapshot.render.cameraUpdateCount <= 0 ||
    snapshot.render.wheelPanUpdateCount <= 0 ||
    snapshot.render.wheelZoomUpdateCount <= 0
  ) {
    throw new Error(`pan/zoom counters did not advance: ${JSON.stringify(snapshot.render)}`);
  }
}

function assertPointerPanCounter(snapshot, scenario) {
  if (
    scenario !== "small-active" &&
    scenario !== "small-trackpad" &&
    snapshot.render.pointerPanUpdateCount <= 0
  ) {
    throw new Error(`pointer pan counter did not advance: ${JSON.stringify(snapshot.render)}`);
  }
}

function assertWheelInputCounters(snapshot) {
  if (snapshot.render.wheelInputEventCount <= 0 || snapshot.render.wheelInputGestureCount <= 0) {
    throw new Error(`wheel input counters did not advance: ${JSON.stringify(snapshot.render)}`);
  }
}

function assertNodeDragCounter(snapshot) {
  if (snapshot.render.nodeDragUpdateCount <= 0) {
    throw new Error(`node drag counter did not advance: ${JSON.stringify(snapshot.render)}`);
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
  // Camera fast-path contract (Phase 1): labels are never hidden and never fully
  // re-synced per moving frame — they ride the camera transform tier instead.
  // Every moving sync frame runs exactly one bounded label transform pass, so the
  // transform-frame count matches the moving sync-frame count, and the renderer's
  // own fast-path audit must report zero violations.
  if (snapshot.render.cameraMovingLabelSyncedFrameCount !== 0) {
    throw new Error(
      `camera motion re-synced labels per moving frame (fast-path violation): ${JSON.stringify(snapshot.render)}`,
    );
  }
  if (snapshot.render.cameraMovingLabelHiddenFrameCount !== 0) {
    throw new Error(
      `camera motion hid labels instead of riding the transform tier (fast-path violation): ${JSON.stringify(snapshot.render)}`,
    );
  }
  if (
    snapshot.render.cameraMovingLabelTransformFrameCount !==
    snapshot.render.cameraMovingSyncFrameCount
  ) {
    throw new Error(
      `labels did not ride the camera transform tier on every moving frame: ${JSON.stringify(snapshot.render)}`,
    );
  }
  if (snapshot.render.cameraFastPathViolationCount !== 0) {
    throw new Error(
      `renderer recorded camera fast-path violations: ${JSON.stringify(snapshot.render.cameraFastPathViolations)}`,
    );
  }
  assertInteractionSchedulerCounters(snapshot);
}

function assertInteractionSchedulerCounters(snapshot) {
  const counts = snapshot.render.interactionSchedulerLaneCounts ?? {};
  const definitions = snapshot.render.interactionSchedulerLaneDefinitions ?? [];
  assertInteractionSchedulerLaneRuns(counts);
  assertInteractionSchedulerPriorities(definitions);
}

function assertInteractionSchedulerLaneRuns(counts) {
  const requiredLaneIds = [
    "background-recompute",
    "camera-input",
    "hover-selection-feedback",
    "semantic-runtime-visual",
    "settled-fidelity-restore",
    "trajectory-runtime-visual",
    "visible-position-sync",
  ];
  for (const laneId of requiredLaneIds) {
    if (!Number.isFinite(counts[laneId]) || counts[laneId] <= 0) {
      throw new Error(
        `interaction scheduler lane did not run: lane=${laneId} counts=${JSON.stringify(counts)}`,
      );
    }
  }
}

function assertInteractionSchedulerPriorities(definitions) {
  const priorities = Object.fromEntries(
    definitions.map((definition) => [definition.id, definition.priority]),
  );
  const expectedLanePriorities = [
    ["camera-input", 1],
    ["visible-position-sync", 2],
    ["hover-selection-feedback", 3],
    ["semantic-runtime-visual", 4],
    ["trajectory-runtime-visual", 5],
    ["settled-fidelity-restore", 6],
    ["background-recompute", 7],
  ];
  for (const [laneId, priority] of expectedLanePriorities) {
    if (priorities[laneId] !== priority) {
      throw new Error(
        `interaction scheduler priorities were not explicit and ordered: ${JSON.stringify(definitions)}`,
      );
    }
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

export function summarizeSnapshot(snapshot) {
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
      cameraFastPathViolationCount: snapshot.render.cameraFastPathViolationCount,
      cameraMovingLabelHiddenFrameCount: snapshot.render.cameraMovingLabelHiddenFrameCount,
      cameraMovingLabelSyncedFrameCount: snapshot.render.cameraMovingLabelSyncedFrameCount,
      cameraMovingLabelTransformCount: snapshot.render.cameraMovingLabelTransformCount,
      cameraMovingLabelTransformFrameCount: snapshot.render.cameraMovingLabelTransformFrameCount,
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
      nodeDragUpdateCount: snapshot.render.nodeDragUpdateCount,
      p95FrameMs: snapshot.render.p95FrameMs,
      pointerPanUpdateCount: snapshot.render.pointerPanUpdateCount,
      pooledLabelCount: snapshot.render.pooledLabelCount,
      pooledNodeViewCount: snapshot.render.pooledNodeViewCount,
      sceneVisitCounters: snapshot.render.sceneVisitCounters,
      sceneWindowSize: snapshot.render.sceneWindowSize,
      timingBuckets: snapshot.render.timingBuckets,
      totalDisplayObjectCount: snapshot.render.totalDisplayObjectCount,
      trajectorySpriteDisplayCount: snapshot.render.trajectorySpriteDisplayCount ?? 0,
      trajectorySpriteSyncCount: snapshot.render.trajectorySpriteSyncCount ?? 0,
      trajectorySpriteTotalCount: snapshot.render.trajectorySpriteTotalCount ?? 0,
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

function trajectorySpriteTotalCount(snapshot) {
  return Number(snapshot.render.trajectorySpriteTotalCount ?? 0);
}
