/* global console */

import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  dispatchMouseDrag,
  dispatchWheel,
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

const options = parseElectronHarnessArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    `Usage: node desktop/tests/electron/pixi-workspace-smoke.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]`,
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("pixi-workspace");
await writeLatestRecordingPointer("pixi-workspace", artifactDir);
const fixture = await createElectronFixture("pixi-workspace-smoke");
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_PIXI_WORKSPACE_DEBUG: "1",
      SETTA_PIXI_WORKSPACE_PROTOTYPE: "1",
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="pixi-workspace"]');
  const initial = await waitForPixiSnapshot(context.client, (snapshot) => {
    return (
      snapshot.canvas.clientWidth > 0 &&
      snapshot.canvas.clientHeight > 0 &&
      snapshot.render.frameCount > 2 &&
      snapshot.visual.hasNonBackgroundPixels
    );
  });
  assertInitialSnapshot(initial);
  await captureScreenshot(context.client, join(artifactDir, "initial.png"));

  const panStart = {
    x: Math.max(40, initial.canvas.clientWidth - 160),
    y: Math.max(40, initial.canvas.clientHeight - 90),
  };
  await dispatchMouseDrag(context.client, {
    from: panStart,
    to: { x: panStart.x - 110, y: panStart.y - 60 },
  });
  await delay(150);
  const afterPan = await getPixiSnapshot(context.client);
  assertCameraMoved(initial, afterPan, "pan");

  await dispatchWheel(context.client, {
    deltaY: -360,
    x: Math.floor(afterPan.canvas.clientWidth / 2),
    y: Math.floor(afterPan.canvas.clientHeight / 2),
  });
  await delay(200);
  const afterZoom = await getPixiSnapshot(context.client);
  assertZoomChanged(afterPan, afterZoom);

  const dragNode = visibleNode(afterZoom);
  if (!dragNode) {
    throw new Error(
      `no visible node was present in Pixi debug snapshot: ${JSON.stringify(afterZoom.graph.nodes)}`,
    );
  }
  await dispatchMouseDrag(context.client, {
    from: { x: dragNode.screenX, y: dragNode.screenY },
    steps: 14,
    to: { x: dragNode.screenX + 86, y: dragNode.screenY + 42 },
  });
  await delay(200);
  const afterDrag = await getPixiSnapshot(context.client);
  assertNodeMoved(afterZoom, afterDrag, dragNode.id);
  const cancelPair = visiblePortPair(afterDrag);
  if (!cancelPair) {
    throw new Error(
      `no visible source/target port pair was present in Pixi debug snapshot: ${JSON.stringify(afterDrag.graph.nodes)}`,
    );
  }
  const cancelPoint = emptyCanvasPoint(afterDrag);
  const duringCancelledEdge = await dispatchEdgeDrag(context.client, {
    from: cancelPair.source,
    screenshotPath: join(artifactDir, "edge-drawing-cancel.png"),
    to: cancelPoint,
  });
  await delay(150);
  const afterCancel = await getPixiSnapshot(context.client);
  assertEdgeCancelled(afterDrag, duringCancelledEdge, afterCancel);

  const commitPair = visiblePortPair(afterCancel);
  if (!commitPair) {
    throw new Error(
      `no visible source/target port pair was present after edge cancellation: ${JSON.stringify(afterCancel.graph.nodes)}`,
    );
  }
  const duringEdgeDraw = await dispatchEdgeDrag(context.client, {
    from: commitPair.source,
    screenshotPath: join(artifactDir, "edge-drawing-commit.png"),
    to: commitPair.target,
  });
  await delay(200);
  const afterEdgeDraw = await getPixiSnapshot(context.client);
  assertEdgeCommitted(afterCancel, duringEdgeDraw, afterEdgeDraw, commitPair);
  assertRendererFramesHealthy(afterEdgeDraw);
  await captureScreenshot(context.client, join(artifactDir, "final.png"));

  const consoleRows = await readJsonLinesOptional(join(artifactDir, "renderer-console.jsonl"));
  const consoleErrors = consoleRows.filter((row) => Number(row.level) >= 2);
  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors recorded: ${JSON.stringify(consoleErrors)}`);
  }

  await writeJson(join(artifactDir, "summary.json"), {
    afterCancel,
    afterDrag,
    afterEdgeDraw,
    afterPan,
    afterZoom,
    artifactDir,
    cancelPoint,
    commitPair,
    duringCancelledEdge,
    duringEdgeDraw,
    initial,
    status: "passed",
  });
  console.log(`Pixi workspace visual smoke passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await getPixiSnapshot(context.client)
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

async function waitForPixiSnapshot(client, predicate) {
  return waitForState(
    client,
    `(() => {
      const api = window.__settaPixiWorkspaceDebug;
      if (!api) {
        return { ready: false };
      }
      const snapshot = api.getSnapshot();
      return { ready: true, snapshot };
    })()`,
    (value) => value.ready && predicate(value.snapshot),
  ).then((value) => value.snapshot);
}

async function getPixiSnapshot(client) {
  return client.evaluate(`(() => {
    const api = window.__settaPixiWorkspaceDebug;
    if (!api) {
      throw new Error("Pixi workspace debug API is not installed");
    }
    return api.getSnapshot();
  })()`);
}

async function dispatchEdgeDrag(client, { from, screenshotPath, to }) {
  const steps = 16;
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: from.x,
    y: from.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: from.x,
    y: from.y,
  });
  let during = null;
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    await client.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    });
    await delay(16);
    if (step === Math.floor(steps / 2)) {
      during = await getPixiSnapshot(client);
      await captureScreenshot(client, screenshotPath);
    }
  }
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: to.x,
    y: to.y,
  });
  return during ?? getPixiSnapshot(client);
}

function assertInitialSnapshot(snapshot) {
  if (snapshot.graph.nodeCount < 1) {
    throw new Error(`Pixi graph did not expose nodes: ${JSON.stringify(snapshot.graph)}`);
  }
  if (snapshot.graph.edgeCount < 1) {
    throw new Error(`Pixi graph did not expose edges: ${JSON.stringify(snapshot.graph)}`);
  }
  if (
    !Array.isArray(snapshot.graph.edges) ||
    snapshot.graph.edges.length !== snapshot.graph.edgeCount
  ) {
    throw new Error(`Pixi graph did not expose edge details: ${JSON.stringify(snapshot.graph)}`);
  }
  const nodeWithoutPorts = snapshot.graph.nodes.find(
    (node) =>
      !Array.isArray(node.ports) ||
      !node.ports.some((port) => port.role === "source") ||
      !node.ports.some((port) => port.role === "target"),
  );
  if (nodeWithoutPorts) {
    throw new Error(
      `Pixi graph node did not expose source and target ports: ${JSON.stringify(nodeWithoutPorts)}`,
    );
  }
  if (!snapshot.visual.hasNonBackgroundPixels || snapshot.visual.sampledColorCount < 2) {
    throw new Error(`Pixi canvas appears blank: ${JSON.stringify(snapshot.visual)}`);
  }
}

function assertCameraMoved(before, after, label) {
  const moved =
    Math.abs(after.camera.x - before.camera.x) > 0.5 ||
    Math.abs(after.camera.y - before.camera.y) > 0.5;
  if (!moved) {
    throw new Error(
      `camera did not move after ${label}: before=${JSON.stringify(before.camera)} after=${JSON.stringify(after.camera)}`,
    );
  }
}

function assertZoomChanged(before, after) {
  if (Math.abs(after.camera.zoom - before.camera.zoom) < 0.01) {
    throw new Error(
      `camera zoom did not change: before=${JSON.stringify(before.camera)} after=${JSON.stringify(after.camera)}`,
    );
  }
}

function assertNodeMoved(before, after, nodeId) {
  const beforeNode = before.graph.nodes.find((node) => node.id === nodeId);
  const afterNode = after.graph.nodes.find((node) => node.id === nodeId);
  if (!beforeNode || !afterNode) {
    throw new Error(`node ${nodeId} missing from debug snapshots`);
  }
  const moved =
    Math.abs(afterNode.x - beforeNode.x) > 1 || Math.abs(afterNode.y - beforeNode.y) > 1;
  if (!moved) {
    throw new Error(
      `node ${nodeId} did not move: before=${JSON.stringify(beforeNode)} after=${JSON.stringify(afterNode)}`,
    );
  }
}

function visibleNode(snapshot) {
  return snapshot.graph.nodes.find((node) => {
    return (
      node.screenX > 24 &&
      node.screenY > 24 &&
      node.screenX < snapshot.canvas.clientWidth - 24 &&
      node.screenY < snapshot.canvas.clientHeight - 24
    );
  });
}

function visiblePortPair(snapshot) {
  const existingEdges = new Set(snapshot.graph.edges.map(edgeKey));
  const candidates = visiblePortCandidates(snapshot);
  return (
    firstPortPair(candidates, (source, target) => {
      const key = edgeKeyFromParts(source.nodeId, source.portId, target.nodeId, target.portId);
      return source.nodeId !== target.nodeId && !existingEdges.has(key);
    }) ?? firstPortPair(candidates, (source, target) => source.nodeId !== target.nodeId)
  );
}

function visiblePortCandidates(snapshot) {
  const visiblePorts = snapshot.graph.nodes
    .flatMap((node) => node.ports.map((port) => portCandidate(node, port)))
    .filter((candidate) => visiblePoint(snapshot, candidate));
  return {
    sources: visiblePorts.filter((candidate) => candidate.role === "source"),
    targets: visiblePorts.filter((candidate) => candidate.role === "target"),
  };
}

function portCandidate(node, port) {
  return {
    nodeId: node.id,
    portId: port.id,
    role: port.role,
    screenX: port.screenX,
    screenY: port.screenY,
    x: port.screenX,
    y: port.screenY,
  };
}

function firstPortPair({ sources, targets }, isAllowed) {
  for (const source of sources) {
    for (const target of targets) {
      if (isAllowed(source, target)) {
        return { source, target };
      }
    }
  }
  return null;
}

function emptyCanvasPoint(snapshot) {
  const candidates = [
    { x: 32, y: 32 },
    { x: snapshot.canvas.clientWidth - 32, y: 32 },
    { x: 32, y: snapshot.canvas.clientHeight - 32 },
    { x: snapshot.canvas.clientWidth - 32, y: snapshot.canvas.clientHeight - 32 },
    { x: Math.floor(snapshot.canvas.clientWidth / 2), y: snapshot.canvas.clientHeight - 32 },
  ];
  const ports = snapshot.graph.nodes.flatMap((node) => node.ports);
  const point = candidates.find((candidate) => {
    return ports.every(
      (port) => Math.hypot(candidate.x - port.screenX, candidate.y - port.screenY) > 72,
    );
  });
  if (!point) {
    throw new Error(
      `could not find an empty canvas point away from visible ports: ${JSON.stringify(ports)}`,
    );
  }
  return point;
}

function assertEdgeCancelled(before, during, after) {
  assertTemporaryEdgeActive(before, during, "release");
  assertTemporaryEdgeCleared(after, "invalid release");
  assertEdgeCountUnchanged(before, after, "invalid edge release");
  assertRenderCounterAdvanced(before, after, "temporaryEdgeUpdateCount", "temporary edge update");
}

function assertEdgeCommitted(before, during, after, pair) {
  assertTemporaryEdgeActive(before, during, "valid release");
  assertTemporaryEdgeCleared(after, "valid release");
  assertEdgeCountIncreasedByOne(before, after);
  assertRenderCounterAdvanced(before, after, "edgeCommitCount", "edge commit");
  assertCommittedEdgeMatchesPair(newCommittedEdge(before, after), pair);
}

function assertTemporaryEdgeActive(before, during, label) {
  if (!during.interaction.drawingEdge) {
    throw new Error(
      `debug snapshot did not report active temporary edge: ${JSON.stringify(during.interaction)}`,
    );
  }
  if (during.graph.edgeCount !== before.graph.edgeCount) {
    throw new Error(
      `temporary edge drawing committed before ${label}: before=${before.graph.edgeCount} during=${during.graph.edgeCount}`,
    );
  }
}

function assertTemporaryEdgeCleared(after, label) {
  if (after.interaction.drawingEdge) {
    throw new Error(
      `temporary edge remained active after ${label}: ${JSON.stringify(after.interaction)}`,
    );
  }
}

function assertEdgeCountUnchanged(before, after, label) {
  if (after.graph.edgeCount !== before.graph.edgeCount) {
    throw new Error(
      `${label} changed edge count: before=${before.graph.edgeCount} after=${after.graph.edgeCount}`,
    );
  }
}

function assertEdgeCountIncreasedByOne(before, after) {
  if (after.graph.edgeCount !== before.graph.edgeCount + 1) {
    throw new Error(
      `valid edge release did not add exactly one edge: before=${before.graph.edgeCount} after=${after.graph.edgeCount}`,
    );
  }
}

function assertRenderCounterAdvanced(before, after, counter, label) {
  if (after.render[counter] <= before.render[counter]) {
    throw new Error(
      `${label} counter did not advance: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
}

function newCommittedEdge(before, after) {
  const beforeEdgeIds = new Set(before.graph.edges.map((edge) => edge.id));
  const committedEdge = after.graph.edges.find((edge) => !beforeEdgeIds.has(edge.id));
  if (!committedEdge) {
    throw new Error(`no new edge id appeared after commit: ${JSON.stringify(after.graph.edges)}`);
  }
  return committedEdge;
}

function assertCommittedEdgeMatchesPair(committedEdge, pair) {
  const matchesDraggedPorts = [
    committedEdge.sourceNodeId === pair.source.nodeId,
    committedEdge.sourcePortId === pair.source.portId,
    committedEdge.targetNodeId === pair.target.nodeId,
    committedEdge.targetPortId === pair.target.portId,
  ].every(Boolean);
  if (!matchesDraggedPorts) {
    throw new Error(
      `committed edge did not match dragged ports: pair=${JSON.stringify(pair)} edge=${JSON.stringify(committedEdge)}`,
    );
  }
}

function visiblePoint(snapshot, point) {
  return (
    point.screenX > 24 &&
    point.screenY > 24 &&
    point.screenX < snapshot.canvas.clientWidth - 24 &&
    point.screenY < snapshot.canvas.clientHeight - 24
  );
}

function edgeKey(edge) {
  return edgeKeyFromParts(
    edge.sourceNodeId,
    edge.sourcePortId,
    edge.targetNodeId,
    edge.targetPortId,
  );
}

function edgeKeyFromParts(sourceNodeId, sourcePortId, targetNodeId, targetPortId) {
  return `${sourceNodeId}:${sourcePortId}->${targetNodeId}:${targetPortId}`;
}

function assertRendererFramesHealthy(snapshot) {
  if (snapshot.render.frameCount <= 0) {
    throw new Error(`Pixi ticker did not advance: ${JSON.stringify(snapshot.render)}`);
  }
  if (
    !Number.isFinite(snapshot.render.averageFrameMs) ||
    !Number.isFinite(snapshot.render.worstFrameMs)
  ) {
    throw new Error(`Pixi frame timings were not finite: ${JSON.stringify(snapshot.render)}`);
  }
  if (snapshot.render.nodeDragUpdateCount <= 0) {
    throw new Error(`Pixi node drag counter did not advance: ${JSON.stringify(snapshot.render)}`);
  }
  if (snapshot.render.cameraUpdateCount <= 0) {
    throw new Error(
      `Pixi camera update counter did not advance: ${JSON.stringify(snapshot.render)}`,
    );
  }
  if (snapshot.render.edgeCommitCount <= 0) {
    throw new Error(`Pixi edge commit counter did not advance: ${JSON.stringify(snapshot.render)}`);
  }
  if (snapshot.render.temporaryEdgeUpdateCount <= 0) {
    throw new Error(
      `Pixi temporary edge update counter did not advance: ${JSON.stringify(snapshot.render)}`,
    );
  }
}
