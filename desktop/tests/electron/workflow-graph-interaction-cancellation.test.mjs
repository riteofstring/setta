/* global console */

import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readJsonLinesOptional,
  reloadPage,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
  pagePointForCanvasPoint,
} from "./workflow-graph-layout-helpers.mjs";
import {
  createWorkflowProjectionFixture,
  isWorkflowProjectionSnapshotReady,
} from "./workflow-projection-smoke-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/workflow-graph-interaction-cancellation.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir =
  options.artifactDir || timestampedRecordingDir("workflow-graph-interaction-cancellation");
await writeLatestRecordingPointer("workflow-graph-interaction-cancellation", artifactDir);
const fixture = await createElectronFixture("workflow-graph-interaction-cancellation");
let context = null;
let workflowGraphSurfaceId = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_WORKFLOW_GRAPH_DEBUG: "1",
    },
    fixture,
    visible: options.visible,
  });

  const workflowProjection = await createWorkflowProjectionFixture(
    context.client,
    fixture.workspaceRoot,
  );
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await openWorkflowGraphPane(context.client);
  await waitForSelector(context.client, '[data-testid="workflow-graph"]');
  workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client);
  const initial = await waitForWorkflowGraphSnapshot(context.client, (snapshot) =>
    isWorkflowProjectionSnapshotReady(snapshot, workflowProjection),
  );
  const source = visibleSourcePortByNode(initial, "work");
  const emptyPoint = emptyCanvasPoint(initial);
  const { active, releasePoint } = await beginEdgeDraw(context.client, source, emptyPoint);
  if (!active.interaction.drawingEdge) {
    throw new Error(
      `edge drawing did not become active before graph update: ${JSON.stringify(active.interaction)}`,
    );
  }
  await captureScreenshot(context.client, join(artifactDir, "active-edge-draw.png"));

  await context.client.driver("removeWorkflowProjectionFixtureNode", {
    definitionId: workflowProjection.definitionId,
    nodeId: source.nodeId,
    workspaceId: workflowProjection.workspaceId,
  });
  const afterRemoval = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.render.graphUpdateCount > active.render.graphUpdateCount &&
      snapshot.render.lastGraphUpdate?.source === "workflow-projection" &&
      snapshot.render.lastGraphUpdate?.interactionCancelled &&
      !snapshot.interaction.drawingEdge &&
      !graphHasNode(snapshot, source.nodeId),
  );
  assertSourceRemovalCancelledEdgeDrawing(active, afterRemoval, source.nodeId);

  await context.client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: releasePoint.x,
    y: releasePoint.y,
  });
  await delay(100);
  const afterRelease = await getWorkflowGraphSnapshot(context.client);
  assertSourceRemovalCancelledEdgeDrawing(active, afterRelease, source.nodeId);
  await captureScreenshot(context.client, join(artifactDir, "after-cancel.png"));

  const consoleRows = await readJsonLinesOptional(join(artifactDir, "renderer-console.jsonl"));
  const consoleErrors = consoleRows.filter((row) => Number(row.level) >= 2);
  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors recorded: ${JSON.stringify(consoleErrors)}`);
  }

  await writeJson(join(artifactDir, "summary.json"), {
    active,
    afterRelease,
    afterRemoval,
    artifactDir,
    initial,
    status: "passed",
  });
  console.log(`workflow graph interaction cancellation passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await getWorkflowGraphSnapshot(context.client)
      .then((snapshot) => writeJson(join(artifactDir, "failure-snapshot.json"), snapshot))
      .catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
}

async function waitForWorkflowGraphSnapshot(client, predicate) {
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshot", { surfaceId: workflowGraphSurfaceId }),
    predicate,
  );
}

async function getWorkflowGraphSnapshot(client) {
  return client.driver("workflowGraphDebugSnapshot", { surfaceId: workflowGraphSurfaceId });
}

async function beginEdgeDraw(client, from, to) {
  const steps = 8;
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
  }
  return {
    active: await getWorkflowGraphSnapshot(client),
    releasePoint: pageTo,
  };
}

function assertSourceRemovalCancelledEdgeDrawing(before, after, sourceNodeId) {
  if (!before.interaction.drawingEdge) {
    throw new Error(`edge drawing was not active before removal: ${JSON.stringify(before)}`);
  }
  if (after.interaction.drawingEdge) {
    throw new Error(`edge drawing remained active after removal: ${JSON.stringify(after)}`);
  }
  if (graphHasNode(after, sourceNodeId)) {
    throw new Error(
      `source-removal graph update kept removed node ${sourceNodeId}: ${JSON.stringify(after.graph.nodes)}`,
    );
  }
  const danglingEdges = after.graph.edges.filter(
    (edge) => edge.sourceNodeId === sourceNodeId || edge.targetNodeId === sourceNodeId,
  );
  if (danglingEdges.length > 0) {
    throw new Error(
      `source-removal graph update kept dangling edges for ${sourceNodeId}: ${JSON.stringify(danglingEdges)}`,
    );
  }
  const update = after.render.lastGraphUpdate;
  if (
    update?.source !== "workflow-projection" ||
    !update.interactionCancelled ||
    update.edgeGraphicsSkipped
  ) {
    throw new Error(
      `source-removal graph update did not report interaction cancellation: ${JSON.stringify(update)}`,
    );
  }
  assertGraphDisplayObjectCountsMatchGraph(after, "source-removal graph update");
}

function assertGraphDisplayObjectCountsMatchGraph(snapshot, label) {
  const portCount = snapshot.graph.nodes.reduce((count, node) => count + node.ports.length, 0);
  const expected = {
    labelObjectCount: snapshot.graph.nodeCount,
    nodeBodyGraphicsCount: snapshot.graph.nodeCount,
    nodeContainerCount: snapshot.graph.nodeCount,
    nodeShadowGraphicsCount: snapshot.graph.nodeCount,
    portGraphicsCount: portCount,
  };
  for (const [counter, value] of Object.entries(expected)) {
    if (snapshot.render[counter] !== value) {
      throw new Error(
        `${label} left stale display objects for ${counter}: expected=${value} actual=${snapshot.render[counter]} render=${JSON.stringify(snapshot.render)}`,
      );
    }
  }
}

function visibleSourcePortByNode(snapshot, nodeId) {
  const node = nodeById(snapshot, nodeId);
  const port = node.ports.find((candidate) => {
    return candidate.role === "source" && visibleCanvasPoint(snapshot, candidate);
  });
  if (!port) {
    throw new Error(
      `node ${nodeId} did not expose a visible source port: ${JSON.stringify(node.ports)}`,
    );
  }
  return { nodeId, x: port.screenX, y: port.screenY };
}

function emptyCanvasPoint(snapshot) {
  const candidates = [
    { x: 32, y: snapshot.canvas.clientHeight - 32 },
    { x: snapshot.canvas.clientWidth - 32, y: snapshot.canvas.clientHeight - 32 },
    { x: Math.floor(snapshot.canvas.clientWidth / 2), y: snapshot.canvas.clientHeight - 32 },
    { x: 32, y: Math.floor(snapshot.canvas.clientHeight / 2) },
    { x: snapshot.canvas.clientWidth - 32, y: Math.floor(snapshot.canvas.clientHeight / 2) },
  ];
  const point = candidates.find((candidate) => {
    const awayFromPorts = snapshot.graph.nodes
      .flatMap((node) => node.ports)
      .every((port) => Math.hypot(candidate.x - port.screenX, candidate.y - port.screenY) > 72);
    const outsideNodes = snapshot.graph.nodes.every((node) => {
      const bounds = nodeScreenBounds(snapshot, node);
      return (
        candidate.x < bounds.left - 24 ||
        candidate.x > bounds.right + 24 ||
        candidate.y < bounds.top - 24 ||
        candidate.y > bounds.bottom + 24
      );
    });
    return awayFromPorts && outsideNodes;
  });
  if (!point) {
    throw new Error(`could not find an empty canvas point: ${JSON.stringify(snapshot.graph)}`);
  }
  return point;
}

function nodeById(snapshot, nodeId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`node ${nodeId} missing from debug snapshot`);
  }
  return node;
}

function graphHasNode(snapshot, nodeId) {
  return snapshot.graph.nodes.some((candidate) => candidate.id === nodeId);
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

function visibleCanvasPoint(snapshot, point) {
  return (
    point.screenX > 12 &&
    point.screenY > 12 &&
    point.screenX < snapshot.canvas.clientWidth - 12 &&
    point.screenY < snapshot.canvas.clientHeight - 12
  );
}
