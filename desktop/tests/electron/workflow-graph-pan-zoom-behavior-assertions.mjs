import { join } from "node:path";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  readJsonLinesOptional,
  reloadPage,
  waitForSelector,
  waitForState,
} from "./electron-cdp-harness.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";

const cameraInputKinds = new Set(["pointer-pan", "wheel", "wheel-burst"]);

export async function assertPhase8InteractionBehavior({
  appRecordingEnabled,
  artifactDir,
  client,
  evidence,
  final,
  surfaceId,
  timeoutMs,
  waitForRefreshedSnapshot,
}) {
  if (!evidence?.drag || !evidence?.camera) {
    throw new Error(`phase 8 interaction evidence missing: ${JSON.stringify(evidence)}`);
  }
  const layoutWrites = await assertNoUnexpectedLayoutWritesDuringPanZoom({
    appRecordingEnabled,
    artifactDir,
    evidence,
  });
  const refresh = await assertDurablePositionsStableAfterRefresh({
    client,
    evidence,
    final,
    surfaceId,
    timeoutMs,
    waitForRefreshedSnapshot,
  });
  return {
    refreshedSurfaceId: refresh.surfaceId,
    summary: {
      camera: evidence.camera,
      drag: evidence.drag,
      layoutWrites,
      refresh,
      surfaceId,
    },
  };
}

export function assertOnlyNodeMoved(before, after, movedNodeId, label) {
  for (const beforeNode of before.graph.nodes) {
    const afterNode = nodeById(after, beforeNode.id);
    const moved = nodeDistance(beforeNode, afterNode) > 1;
    if (beforeNode.id === movedNodeId && !moved) {
      throw new Error(`${label} did not move ${movedNodeId}`);
    }
    if (beforeNode.id !== movedNodeId && moved) {
      throw new Error(
        `${label} moved unexpected node ${beforeNode.id}: before=${JSON.stringify({
          x: beforeNode.x,
          y: beforeNode.y,
        })} after=${JSON.stringify({ x: afterNode.x, y: afterNode.y })}`,
      );
    }
  }
}

export function assertNodePositionsStable(before, after, label) {
  for (const beforeNode of before.graph.nodes) {
    const afterNode = nodeById(after, beforeNode.id);
    if (nodeDistance(beforeNode, afterNode) > 1.5) {
      throw new Error(
        `${label} changed node position for ${beforeNode.id}: before=${JSON.stringify({
          x: beforeNode.x,
          y: beforeNode.y,
        })} after=${JSON.stringify({ x: afterNode.x, y: afterNode.y })}`,
      );
    }
  }
}

export function assertCameraOperationsChanged(operations, label) {
  const moved = operations.some((operation) => operation.cameraDelta.position > 0.5);
  const zoomed = operations.some((operation) => operation.cameraDelta.zoom > 0.0001);
  if (!moved || !zoomed) {
    throw new Error(
      `${label} did not produce both camera pan and zoom deltas: ${JSON.stringify(operations)}`,
    );
  }
}

export function assertNonCameraInputsDidNotMoveCamera(inputSamples) {
  for (const sample of inputSamples) {
    if (cameraInputKinds.has(sample.kind) || !sample.cameraBefore || !sample.cameraAfter) {
      continue;
    }
    const delta = cameraDelta(sample.cameraBefore, sample.cameraAfter);
    if (delta.position > 0.5 || delta.zoom > 0.0001) {
      throw new Error(
        `non-camera graph input changed camera state: ${JSON.stringify({
          cameraAfter: sample.cameraAfter,
          cameraBefore: sample.cameraBefore,
          delta,
          kind: sample.kind,
        })}`,
      );
    }
  }
}

export function cameraDelta(before, after) {
  return {
    position: Math.hypot(Number(after.x) - Number(before.x), Number(after.y) - Number(before.y)),
    zoom: Math.abs(Number(after.zoom) - Number(before.zoom)),
  };
}

export function compactCameraSnapshot(snapshot) {
  return {
    camera: snapshot.camera,
    render: {
      cameraUpdateCount: snapshot.render.cameraUpdateCount,
      pointerPanUpdateCount: snapshot.render.pointerPanUpdateCount,
      wheelPanUpdateCount: snapshot.render.wheelPanUpdateCount,
      wheelZoomUpdateCount: snapshot.render.wheelZoomUpdateCount,
    },
  };
}

export function compactNodePosition(snapshot, nodeId) {
  const node = nodeById(snapshot, nodeId);
  return {
    id: node.id,
    layer: node.layer,
    movementOwner: node.movementOwner?.kind ?? "",
    x: node.x,
    y: node.y,
  };
}

export function nodeById(snapshot, nodeId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`workflow graph node missing from snapshot: ${nodeId}`);
  }
  return node;
}

export function nodePositionDelta(before, after, nodeId) {
  const beforeNode = nodeById(before, nodeId);
  const afterNode = nodeById(after, nodeId);
  return {
    x: afterNode.x - beforeNode.x,
    y: afterNode.y - beforeNode.y,
  };
}

export function sampleWindow(samples) {
  const timestamps = samples
    .map((sample) => parseTimestamp(sample.at))
    .filter((timestamp) => timestamp !== null);
  if (timestamps.length === 0) {
    return { firstAt: "", lastAt: "" };
  }
  return {
    firstAt: new Date(Math.min(...timestamps)).toISOString(),
    lastAt: new Date(Math.max(...timestamps)).toISOString(),
  };
}

async function assertNoUnexpectedLayoutWritesDuringPanZoom({
  appRecordingEnabled,
  artifactDir,
  evidence,
}) {
  if (!appRecordingEnabled) {
    return { checked: false, reason: "app recording disabled" };
  }
  const rows = await readJsonLinesOptional(join(artifactDir, "ipc.jsonl"));
  const layoutWrites = rows.filter(
    (row) =>
      row.type === "ipc_start" &&
      (row.channel === "workflow:update-definition-layout" ||
        row.channel === "workflow:update-graph-view-layout"),
  );
  const interactionWindow = timestampWindow(evidence.inputWindow);
  const dragWriteWindow = timestampWindow(evidence.drag.dragInputWindow, {
    afterMs: 1500,
    beforeMs: 100,
  });
  const duringInteraction = layoutWrites.filter((row) =>
    rowInTimestampWindow(row, interactionWindow),
  );
  const outsideDrag = duringInteraction.filter(
    (row) => !rowInTimestampWindow(row, dragWriteWindow),
  );
  if (outsideDrag.length > 0) {
    throw new Error(
      `workflow graph pan/zoom issued layout writes outside the scripted drag: ${JSON.stringify({
        dragInputWindow: evidence.drag.dragInputWindow,
        inputWindow: evidence.inputWindow,
        writes: outsideDrag,
      })}`,
    );
  }
  return {
    checked: true,
    duringInteractionCount: duringInteraction.length,
    outsideDragCount: outsideDrag.length,
  };
}

async function assertDurablePositionsStableAfterRefresh({
  client,
  evidence,
  final,
  surfaceId,
  timeoutMs,
  waitForRefreshedSnapshot,
}) {
  if (!durableMovementOwner(evidence.drag.movementOwner)) {
    return {
      checked: false,
      reason: `movement owner ${evidence.drag.movementOwner || "none"} is not a durable workflow graph owner`,
      surfaceId: null,
    };
  }
  const settled = await waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", {
      includeVisual: false,
      surfaceId,
    }),
    (value) =>
      value.ready && Number(value.snapshot.render.pendingCommittedNodePositionCount ?? 0) === 0,
    timeoutMs,
  ).then((value) => value.snapshot);
  assertNodePositionsStable(final, settled, "phase 8 layout settlement");
  await reloadPage(client);
  await waitForSelector(client, '[data-testid="workspace-layout-area"]', timeoutMs);
  await openWorkflowGraphPane(client, { timeoutMs });
  await waitForSelector(client, '[data-testid="workflow-graph"]', timeoutMs);
  const refreshedSurfaceId = await maximizeWorkflowGraphPane(client, { timeoutMs });
  const refreshed = await waitForRefreshedSnapshot(refreshedSurfaceId, settled);
  assertNodePositionsStable(settled, refreshed, "phase 8 graph refresh");
  return {
    checked: true,
    nodeCount: refreshed.graph.nodeCount,
    surfaceId: refreshedSurfaceId,
  };
}

function durableMovementOwner(owner) {
  return (
    owner === "workflow_definition_layout" ||
    owner === "workflow_view_layout" ||
    owner === "semantic_layout"
  );
}

function nodeDistance(left, right) {
  return Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y));
}

function timestampWindow(window, { afterMs = 1000, beforeMs = 0 } = {}) {
  const first = parseTimestamp(window?.firstAt);
  const last = parseTimestamp(window?.lastAt);
  if (first === null || last === null) {
    return null;
  }
  return {
    first: first - beforeMs,
    last: last + afterMs,
  };
}

function rowInTimestampWindow(row, window) {
  if (window === null) {
    return false;
  }
  const timestamp = parseTimestamp(row.at);
  return timestamp !== null && timestamp >= window.first && timestamp <= window.last;
}

function parseTimestamp(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}
