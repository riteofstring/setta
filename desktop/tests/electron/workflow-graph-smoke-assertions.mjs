const spatialIndexCandidateCounters = [
  "spatialIndexCandidateCount",
  "lastLabelVisibilityCandidateCount",
  "lastMarqueeCandidateCount",
  "lastNodeHitCandidateCount",
  "lastPortHitCandidateCount",
];
const spatialIndexCounters = [
  ...spatialIndexCandidateCounters,
  "spatialIndexNodeCount",
  "spatialIndexQueryCount",
  "spatialIndexRebuildCount",
  "spatialIndexUpdateCount",
];

export function assertFiniteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} was not finite: ${String(value)}`);
  }
}

export function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} was not a non-negative integer: ${String(value)}`);
  }
}

export function assertRenderCounterAdvanced(before, after, counter, label) {
  if (after.render[counter] <= before.render[counter]) {
    throw new Error(
      `${label} counter did not advance: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
}

const fullPositiveRenderCounters = [
  "nodeDragUpdateCount",
  "pointerPanUpdateCount",
  "marqueeUpdateCount",
  "selectionChangeCount",
  "wheelPanUpdateCount",
  "wheelZoomUpdateCount",
  "cameraUpdateCount",
  "edgeCommitCount",
  "temporaryEdgeUpdateCount",
  "labelSyncCount",
  "nodeOutlineVisibilityUpdateCount",
  "spatialIndexQueryCount",
  "spatialIndexRebuildCount",
  "spatialIndexUpdateCount",
];

export function assertRendererFramesHealthy(
  snapshot,
  { positiveRenderCounters = fullPositiveRenderCounters } = {},
) {
  assertFrameTimingsHealthy(snapshot);
  assertPositiveRenderCounters(snapshot, positiveRenderCounters);
  assertSpatialIndexDebugCounters(snapshot, "final renderer health");
}

export function assertSpatialIndexDebugCounters(snapshot, label) {
  const render = snapshot.render;
  for (const counter of spatialIndexCounters) {
    assertNonNegativeInteger(render[counter], `${label} ${counter}`);
  }
  if (render.spatialIndexNodeCount !== snapshot.graph.nodeCount) {
    throw new Error(
      `${label} spatialIndexNodeCount did not match graph node count: graph=${snapshot.graph.nodeCount} render=${JSON.stringify(render)}`,
    );
  }
  if (render.spatialIndexRebuildCount < 1) {
    throw new Error(`${label} spatial index was not built: render=${JSON.stringify(render)}`);
  }
  if (render.spatialIndexQueryCount < 1) {
    throw new Error(`${label} spatial index was not queried: render=${JSON.stringify(render)}`);
  }
  for (const counter of spatialIndexCandidateCounters) {
    if (render[counter] > snapshot.graph.nodeCount) {
      throw new Error(
        `${label} ${counter} exceeded graph node count: graph=${snapshot.graph.nodeCount} render=${JSON.stringify(render)}`,
      );
    }
  }
}

export function assertSpatialIndexQueryAdvanced(before, after, label) {
  assertRenderCounterAdvanced(before, after, "spatialIndexQueryCount", label);
  assertSpatialIndexDebugCounters(after, label);
}

export function assertSpatialIndexUpdatesAdvanced(before, after, label) {
  assertRenderCounterAdvanced(before, after, "spatialIndexUpdateCount", label);
  assertSpatialIndexDebugCounters(after, label);
}

export function assertSpatialIndexCandidateAtLeast(snapshot, counter, minimum, label) {
  assertSpatialIndexDebugCounters(snapshot, label);
  if (snapshot.render[counter] < minimum) {
    throw new Error(
      `${label} ${counter} was below expected candidate count: minimum=${minimum} render=${JSON.stringify(snapshot.render)}`,
    );
  }
}

export function setsEqual(left, right) {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

export function visiblePoint(snapshot, point) {
  return (
    point.screenX > 24 &&
    point.screenY > 24 &&
    point.screenX < snapshot.canvas.clientWidth - 24 &&
    point.screenY < snapshot.canvas.clientHeight - 24
  );
}

function assertFrameTimingsHealthy(snapshot) {
  if (snapshot.render.frameCount <= 0) {
    throw new Error(`Workflow graph ticker did not advance: ${JSON.stringify(snapshot.render)}`);
  }
  if (
    !Number.isFinite(snapshot.render.averageFrameMs) ||
    !Number.isFinite(snapshot.render.worstFrameMs)
  ) {
    throw new Error(
      `Workflow graph frame timings were not finite: ${JSON.stringify(snapshot.render)}`,
    );
  }
}

function assertPositiveRenderCounters(snapshot, counters) {
  for (const counter of counters) {
    if (snapshot.render[counter] <= 0) {
      throw new Error(
        `Workflow graph render counter did not advance: ${counter} render=${JSON.stringify(snapshot.render)}`,
      );
    }
  }
}
