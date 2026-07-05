import { setTimeout as delay } from "node:timers/promises";

import { pagePointForCanvasPoint } from "./workflow-graph-layout-helpers.mjs";

export async function assertSafeWorkflowProjectionUpdateDuringCameraPan({
  assertCameraMoved,
  clampCanvasPoint,
  client,
  emptyCanvasPoint,
  getWorkflowGraphSnapshot,
  nodeById,
  projection,
  snapshot,
  surfaceId,
  waitForWorkflowGraphSnapshot,
}) {
  const from = emptyCanvasPoint(snapshot);
  const mid = clampCanvasPoint(snapshot, { x: from.x - 64, y: from.y - 36 });
  const to = clampCanvasPoint(snapshot, { x: from.x - 132, y: from.y - 72 });
  const pageFrom = await pagePointForCanvasPoint(client, surfaceId, from);
  const pageMid = await pagePointForCanvasPoint(client, surfaceId, mid);
  const pageTo = await pagePointForCanvasPoint(client, surfaceId, to);
  await beginCameraPan(client, pageFrom, pageMid);
  const beforeUpdate = await getWorkflowGraphSnapshot(client);
  assertPanActive(beforeUpdate, "before safe graph update");
  await updateWorkflowProjectionFixtureNodeTitle(client, projection);
  const afterUpdate = await waitForWorkflowGraphSnapshot(
    client,
    (candidate) =>
      candidate.render.graphUpdateCount > beforeUpdate.render.graphUpdateCount &&
      candidate.render.lastGraphUpdate?.source === "workflow-projection" &&
      nodeById(candidate, "work").label.text === "Task",
  );
  assertSafeGraphUpdatePreservedCameraPan(beforeUpdate, afterUpdate);
  await continueCameraPan(client, pageTo);
  const afterContinuedPan = await getWorkflowGraphSnapshot(client);
  assertCameraMoved(afterUpdate, afterContinuedPan, "continued pan after safe graph update");
  await releaseCameraPan(client, pageTo);
  const afterRelease = await getWorkflowGraphSnapshot(client);
  assertPanReleased(afterRelease);
  return afterRelease;
}

async function beginCameraPan(client, pageFrom, pageMid) {
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
    x: pageMid.x,
    y: pageMid.y,
  });
  await delay(50);
}

async function continueCameraPan(client, pageTo) {
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    type: "mouseMoved",
    x: pageTo.x,
    y: pageTo.y,
  });
  await delay(50);
}

async function releaseCameraPan(client, pageTo) {
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

async function updateWorkflowProjectionFixtureNodeTitle(client, projection) {
  await client.driver("updateWorkflowProjectionFixtureNodeTitle", {
    definitionId: projection.definitionId,
    nodeId: "work",
    title: "Task",
    workspaceId: projection.workspaceId,
  });
}

function assertPanActive(snapshot, label) {
  if (!snapshot.interaction.panningCamera) {
    throw new Error(
      `camera pan did not become active ${label}: ${JSON.stringify(snapshot.interaction)}`,
    );
  }
}

function assertPanReleased(snapshot) {
  if (snapshot.interaction.panningCamera) {
    throw new Error(
      `camera pan remained active after release: ${JSON.stringify(snapshot.interaction)}`,
    );
  }
}

function assertSafeGraphUpdatePreservedCameraPan(before, after) {
  assertPanActive(after, "after safe graph update");
  assertRendererIdentityStable(before, after);
  assertEdgeRenderingSkipped(before, after);
  assertSafeGraphUpdateCounters(before, after);
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

function assertEdgeRenderingSkipped(before, after) {
  assertRenderCounterUnchanged(before, after, "edgeRedrawCount", "redrew shared edge graphics");
  if (after.render.edgeGraphicsRedrawSkipCount <= before.render.edgeGraphicsRedrawSkipCount) {
    throw new Error(
      `safe graph update did not record a skipped edge graphics redraw: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
  if (after.render.edgeLabelObjectCount < 1) {
    throw new Error(
      `safe graph update had no edge labels to retain: ${JSON.stringify(after.render)}`,
    );
  }
  assertRenderCounterUnchanged(
    before,
    after,
    "edgeLabelRematerializeCount",
    "rematerialized edge labels",
  );
}

function assertSafeGraphUpdateCounters(before, after) {
  assertLastGraphUpdate(after.render.lastGraphUpdate);
  if (
    after.render.graphUpdateSourceCounts["workflow-projection"] <=
    before.render.graphUpdateSourceCounts["workflow-projection"]
  ) {
    throw new Error(
      `workflow projection source counter did not advance: before=${JSON.stringify(before.render.graphUpdateSourceCounts)} after=${JSON.stringify(after.render.graphUpdateSourceCounts)}`,
    );
  }
  if (after.render.graphUpdateCameraMovingCount <= before.render.graphUpdateCameraMovingCount) {
    throw new Error(
      `camera-moving graph update counter did not advance: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
  assertRenderCounterUnchanged(
    before,
    after,
    "graphUpdateInteractionCancelCount",
    "cancelled an interaction",
  );
}

function assertLastGraphUpdate(update) {
  const expected = {
    cameraMoving: true,
    edgeGraphicsSkipped: true,
    edgeLabelRematerializeCount: 0,
    edgeRematerializeCount: 0,
    interactionCancelled: false,
    source: "workflow-projection",
  };
  for (const [field, value] of Object.entries(expected)) {
    if (update?.[field] !== value) {
      throw new Error(`safe graph update counter ${field} was wrong: ${JSON.stringify(update)}`);
    }
  }
  if ((update?.edgeLabelRetainCount ?? 0) < 1) {
    throw new Error(`safe graph update did not retain edge labels: ${JSON.stringify(update)}`);
  }
}

function assertRenderCounterUnchanged(before, after, counter, label) {
  if (after.render[counter] !== before.render[counter]) {
    throw new Error(
      `safe graph update ${label}: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
}
