const transientActivityMarkerStatuses = new Set(["pending", "running", "waiting_approval"]);

export function assertStopRefreshPreservedRendererState(before, after) {
  assertRendererIdentityStable(before, after);
  assertCameraPreserved(before, after, "Stop refresh");
  if (after.render.edgeLabelObjectCount !== before.render.edgeLabelObjectCount) {
    throw new Error(
      `Stop refresh changed edge label object count: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
  if (after.graph.edgeCount !== before.graph.edgeCount) {
    throw new Error(
      `Stop refresh changed edge topology: before=${JSON.stringify(before.graph)} after=${JSON.stringify(after.graph)}`,
    );
  }
  if (after.render.edgeLabelRematerializeCount !== before.render.edgeLabelRematerializeCount) {
    throw new Error(
      `Stop refresh rematerialized edge labels: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
}

export function snapshotHasActiveTransientActivityMarkers(snapshot) {
  return transientActivityArtifacts(snapshot).length > 0;
}

export function assertNoActiveTransientActivityMarkers(snapshot, executionId) {
  const artifacts = transientActivityArtifacts(snapshot);
  if (artifacts.length > 0) {
    throw new Error(
      `stopped workflow ${executionId} retained active transient activity chips: ${JSON.stringify(artifacts)}`,
    );
  }
}

export function assertWorkflowNodeNeverStarted(execution, nodeId) {
  const nodeExecutions = execution.nodeExecutions.filter(
    (nodeExecution) => nodeExecution.nodeId === nodeId,
  );
  if (nodeExecutions.length > 0) {
    throw new Error(
      `workflow node ${nodeId} should not start after Stop: ${JSON.stringify(nodeExecutions)}`,
    );
  }
}

function transientActivityArtifacts(snapshot) {
  return [
    ...activeTransientMarkers(snapshot),
    ...visibleTransientChips(snapshot),
    ...transientVisualStates(snapshot.visualGrammar?.activityMarkerStatesById, "markerState"),
    ...transientVisualStates(snapshot.visualGrammar?.activityChipStatesById, "chipState"),
  ];
}

function activeTransientMarkers(snapshot) {
  return snapshot.activity.markers
    .filter((marker) => marker.active && isTransientActivityStatus(marker.status))
    .map((marker) => ({ kind: "marker", value: marker }));
}

function visibleTransientChips(snapshot) {
  return (snapshot.visualGrammar?.activityChips ?? [])
    .filter((chip) => chip.visible && chipHasTransientState(chip))
    .map((chip) => ({ kind: "chip", value: chip }));
}

function chipHasTransientState(chip) {
  return (
    isTransientActivityStatus(chip.status) || isTransientActivityStatus(chip.visualState?.state)
  );
}

function transientVisualStates(statesById, kind) {
  return Object.entries(statesById ?? {})
    .filter(([, state]) => isTransientActivityStatus(state?.state))
    .map(([id, state]) => ({ id, kind, value: state }));
}

function isTransientActivityStatus(status) {
  return transientActivityMarkerStatuses.has(status);
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

function assertRenderCounterUnchanged(before, after, counter, label) {
  if (after.render[counter] !== before.render[counter]) {
    throw new Error(
      `activity marker update ${label}: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
}

function assertCameraPreserved(before, after, label) {
  for (const field of ["x", "y", "zoom"]) {
    if (!numbersWithinTolerance(after.camera[field], before.camera[field], 0.001)) {
      throw new Error(
        `${label} changed camera ${field}: before=${JSON.stringify(before.camera)} after=${JSON.stringify(after.camera)}`,
      );
    }
  }
}

function numbersWithinTolerance(left, right, tolerance) {
  return (
    typeof left === "number" && typeof right === "number" && Math.abs(left - right) <= tolerance
  );
}
