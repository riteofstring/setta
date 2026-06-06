/* global console */

import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  dispatchKeyEvent,
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
const cdpMetaModifier = 4;
const cdpShiftModifier = 8;
const expectedBitmapLabelFontFamily = "InterMSDF";
const labelVisibilityReasons = new Set([
  "all-visible",
  "decluttered",
  "outside-viewport",
  "selected",
  "visible-priority",
  "zoom-hidden",
]);

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

  const selectionNodes = visibleNodes(initial);
  if (selectionNodes.length < 2) {
    throw new Error(
      `fewer than two visible nodes were present for selection coverage: ${JSON.stringify(initial.graph.nodes)}`,
    );
  }
  const [firstNode, secondNode] = selectionNodes;
  await dispatchMouseClick(context.client, { x: firstNode.screenX, y: firstNode.screenY });
  await delay(100);
  const afterPlainSelect = await getPixiSnapshot(context.client);
  assertSelectedExactly(afterPlainSelect, [firstNode.id], "plain node click");

  await dispatchMouseClick(context.client, {
    modifiers: cdpMetaModifier,
    x: secondNode.screenX,
    y: secondNode.screenY,
  });
  await delay(100);
  const afterCmdAdd = await getPixiSnapshot(context.client);
  assertSelectedExactly(afterCmdAdd, [firstNode.id, secondNode.id], "Cmd-click add");

  await dispatchMouseClick(context.client, {
    modifiers: cdpMetaModifier,
    x: secondNode.screenX,
    y: secondNode.screenY,
  });
  await delay(100);
  const afterCmdRemove = await getPixiSnapshot(context.client);
  assertSelectedExactly(afterCmdRemove, [firstNode.id], "Cmd-click remove");

  const selectionClearPoint = emptyCanvasPoint(afterCmdRemove);
  await dispatchMouseClick(context.client, selectionClearPoint);
  await delay(100);
  const afterEmptySelectionClear = await getPixiSnapshot(context.client);
  assertSelectedExactly(afterEmptySelectionClear, [], "plain empty click");

  const marquee = marqueeForNodes(afterEmptySelectionClear, [firstNode.id, secondNode.id]);
  const duringMarquee = await dispatchMouseDragWithSnapshot(context.client, {
    from: marquee.from,
    modifiers: cdpShiftModifier,
    screenshotPath: join(artifactDir, "marquee-selection.png"),
    steps: 16,
    to: marquee.to,
  });
  await delay(150);
  const afterMarquee = await getPixiSnapshot(context.client);
  assertMarqueeCommitted(afterEmptySelectionClear, duringMarquee, afterMarquee, marquee.nodeIds);

  const selectedGroupNodeIds = [...afterMarquee.interaction.selectedNodeIds];
  const groupPrimaryNode = nodeById(afterMarquee, selectedGroupNodeIds[0]);
  await dispatchMouseDrag(context.client, {
    from: { x: groupPrimaryNode.screenX, y: groupPrimaryNode.screenY },
    steps: 14,
    to: { x: groupPrimaryNode.screenX + 86, y: groupPrimaryNode.screenY + 42 },
  });
  await delay(200);
  const afterGroupDrag = await getPixiSnapshot(context.client);
  assertGroupDragMoved(afterMarquee, afterGroupDrag, selectedGroupNodeIds);

  await dispatchEscape(context.client);
  await delay(100);
  const afterEscapeClear = await getPixiSnapshot(context.client);
  assertSelectedExactly(afterEscapeClear, [], "Escape clear");

  const panStart = {
    x: Math.max(40, afterEscapeClear.canvas.clientWidth - 160),
    y: Math.max(40, afterEscapeClear.canvas.clientHeight - 90),
  };
  await dispatchMouseDrag(context.client, {
    from: panStart,
    to: { x: panStart.x - 110, y: panStart.y - 60 },
  });
  await delay(150);
  const afterPan = await getPixiSnapshot(context.client);
  assertCameraMoved(afterEscapeClear, afterPan, "empty-space pan after marquee interactions");
  assertLabelsAttachedToNodeCenters(afterPan, "empty-space pan");
  assertLabelsScreenSpace(afterPan, "empty-space pan");
  assertLabelSyncAdvanced(afterEscapeClear, afterPan, "empty-space pan label sync");
  assertReactRenderCountUnchanged(afterEscapeClear, afterPan, "empty-space pan label sync");

  await dispatchWheel(context.client, {
    deltaY: -360,
    x: Math.floor(afterPan.canvas.clientWidth / 2),
    y: Math.floor(afterPan.canvas.clientHeight / 2),
  });
  await delay(200);
  const afterZoom = await getPixiSnapshot(context.client);
  assertZoomChanged(afterPan, afterZoom);
  assertZoomAtLeast(afterZoom, 1.1, "zoomed group drag setup");
  assertLabelsAttachedToNodeCenters(afterZoom, "wheel zoom");
  assertLabelsScreenSpace(afterZoom, "wheel zoom");
  assertLabelSyncAdvanced(afterPan, afterZoom, "wheel zoom label sync");
  assertReactRenderCountUnchanged(afterPan, afterZoom, "wheel zoom label sync");

  const zoomGroupNodes = visibleNodes(afterZoom);
  if (zoomGroupNodes.length < 2) {
    throw new Error(
      `fewer than two visible nodes were present for zoomed group drag coverage: ${JSON.stringify(afterZoom.graph.nodes)}`,
    );
  }
  const [zoomGroupFirstNode, zoomGroupSecondNode] = zoomGroupNodes;
  await dispatchMouseClick(context.client, {
    x: zoomGroupFirstNode.screenX,
    y: zoomGroupFirstNode.screenY,
  });
  await delay(100);
  const afterZoomGroupFirstSelect = await getPixiSnapshot(context.client);
  assertSelectedExactly(
    afterZoomGroupFirstSelect,
    [zoomGroupFirstNode.id],
    "zoomed group first select",
  );

  await dispatchMouseClick(context.client, {
    modifiers: cdpMetaModifier,
    x: zoomGroupSecondNode.screenX,
    y: zoomGroupSecondNode.screenY,
  });
  await delay(100);
  const afterZoomGroupSelect = await getPixiSnapshot(context.client);
  const zoomGroupNodeIds = [zoomGroupFirstNode.id, zoomGroupSecondNode.id];
  assertSelectedExactly(afterZoomGroupSelect, zoomGroupNodeIds, "zoomed group select");
  const zoomGroupPrimaryNode = nodeById(afterZoomGroupSelect, zoomGroupNodeIds[0]);
  await dispatchMouseDrag(context.client, {
    from: { x: zoomGroupPrimaryNode.screenX, y: zoomGroupPrimaryNode.screenY },
    steps: 12,
    to: { x: zoomGroupPrimaryNode.screenX + 52, y: zoomGroupPrimaryNode.screenY + 28 },
  });
  await delay(200);
  const afterZoomGroupDrag = await getPixiSnapshot(context.client);
  assertGroupDragMoved(afterZoomGroupSelect, afterZoomGroupDrag, zoomGroupNodeIds);
  assertZoomUnchanged(afterZoomGroupSelect, afterZoomGroupDrag, "zoomed group node drag");

  await dispatchWheel(context.client, {
    deltaX: 34,
    deltaY: 28,
    x: Math.floor(afterZoomGroupDrag.canvas.clientWidth / 2),
    y: Math.floor(afterZoomGroupDrag.canvas.clientHeight / 2),
  });
  await delay(150);
  const afterWheelPan = await getPixiSnapshot(context.client);
  assertCameraMoved(afterZoomGroupDrag, afterWheelPan, "trackpad-style wheel pan");
  assertZoomUnchanged(afterZoomGroupDrag, afterWheelPan, "trackpad-style wheel pan");
  assertLabelsAttachedToNodeCenters(afterWheelPan, "trackpad-style wheel pan");
  assertLabelsScreenSpace(afterWheelPan, "trackpad-style wheel pan");
  assertLabelSyncAdvanced(afterZoomGroupDrag, afterWheelPan, "trackpad-style wheel pan label sync");
  assertReactRenderCountUnchanged(
    afterZoomGroupDrag,
    afterWheelPan,
    "trackpad-style wheel pan label sync",
  );

  const cancelPair = visiblePortPair(afterWheelPan);
  if (!cancelPair) {
    throw new Error(
      `no visible source/target port pair was present in Pixi debug snapshot: ${JSON.stringify(afterWheelPan.graph.nodes)}`,
    );
  }
  const cancelPoint = emptyCanvasPoint(afterWheelPan);
  const duringCancelledEdge = await dispatchEdgeDrag(context.client, {
    from: cancelPair.source,
    screenshotPath: join(artifactDir, "edge-drawing-cancel.png"),
    to: cancelPoint,
  });
  await delay(150);
  const afterCancel = await getPixiSnapshot(context.client);
  assertEdgeCancelled(afterWheelPan, duringCancelledEdge, afterCancel);

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
  const deepZoomTarget = visibleNodes(afterEdgeDraw)[0];
  if (!deepZoomTarget) {
    throw new Error(
      `no visible node was present for deep label zoom coverage: ${JSON.stringify(afterEdgeDraw.graph.nodes)}`,
    );
  }
  await dispatchWheel(context.client, {
    deltaY: -1200,
    x: deepZoomTarget.screenX,
    y: deepZoomTarget.screenY,
  });
  await delay(250);
  const afterDeepZoom = await getPixiSnapshot(context.client);
  assertZoomAtLeast(afterDeepZoom, 3, "deep label zoom");
  assertLabelsAttachedToNodeCenters(afterDeepZoom, "deep label zoom");
  assertLabelsScreenSpace(afterDeepZoom, "deep label zoom");
  assertAtLeastOneVisibleLabel(afterDeepZoom, "deep label zoom");
  assertLabelSyncAdvanced(afterEdgeDraw, afterDeepZoom, "deep label zoom sync");
  assertReactRenderCountUnchanged(afterEdgeDraw, afterDeepZoom, "deep label zoom sync");
  await captureScreenshot(context.client, join(artifactDir, "deep-zoom-labels.png"));

  await dispatchWheel(context.client, {
    deltaX: 34,
    deltaY: 28,
    x: deepZoomTarget.screenX,
    y: deepZoomTarget.screenY,
  });
  await delay(150);
  const afterDeepZoomPan = await getPixiSnapshot(context.client);
  assertCameraMoved(afterDeepZoom, afterDeepZoomPan, "pan after deep label zoom");
  assertZoomUnchanged(afterDeepZoom, afterDeepZoomPan, "pan after deep label zoom");
  assertLabelsAttachedToNodeCenters(afterDeepZoomPan, "pan after deep label zoom");
  assertLabelsScreenSpace(afterDeepZoomPan, "pan after deep label zoom");
  assertAllVisibleModeLabels(afterDeepZoomPan, "pan after deep label zoom");
  assertAtLeastOneVisibleLabel(afterDeepZoomPan, "pan after deep label zoom");
  assertLabelSyncAdvanced(afterDeepZoom, afterDeepZoomPan, "pan after deep label zoom sync");
  assertReactRenderCountUnchanged(
    afterDeepZoom,
    afterDeepZoomPan,
    "pan after deep label zoom sync",
  );

  const lowZoomTarget = visibleNodes(afterDeepZoomPan)[0];
  if (!lowZoomTarget) {
    throw new Error(
      `no visible node was present for low-zoom label LOD coverage: ${JSON.stringify(afterDeepZoomPan.graph.nodes)}`,
    );
  }
  await dispatchMouseClick(context.client, {
    x: lowZoomTarget.screenX,
    y: lowZoomTarget.screenY,
  });
  await delay(100);
  const afterLowZoomSelect = await getPixiSnapshot(context.client);
  assertSelectedExactly(afterLowZoomSelect, [lowZoomTarget.id], "low-zoom LOD target select");
  assertReactRenderCountUnchanged(
    afterDeepZoomPan,
    afterLowZoomSelect,
    "selection label visibility sync",
  );

  await dispatchWheel(context.client, {
    deltaY: 1600,
    x: nodeById(afterLowZoomSelect, lowZoomTarget.id).screenX,
    y: nodeById(afterLowZoomSelect, lowZoomTarget.id).screenY,
  });
  await delay(250);
  const afterLowZoom = await getPixiSnapshot(context.client);
  assertLabelsAttachedToNodeCenters(afterLowZoom, "low zoom selected-mode LOD");
  assertLabelsScreenSpace(afterLowZoom, "low zoom selected-mode LOD");
  assertSelectedModeLabelVisibility(afterLowZoom, lowZoomTarget.id, "low zoom selected-mode LOD");
  assertLabelSyncAdvanced(afterLowZoomSelect, afterLowZoom, "low zoom selected-mode label sync");
  assertReactRenderCountUnchanged(
    afterLowZoomSelect,
    afterLowZoom,
    "low zoom selected-mode label sync",
  );
  await captureScreenshot(context.client, join(artifactDir, "low-zoom-selected-label.png"));

  const afterOffscreenPan = await panNodeLabelOutsideViewport(
    context.client,
    afterLowZoom,
    lowZoomTarget.id,
  );
  assertNodeLabelOutsideViewport(afterOffscreenPan, lowZoomTarget.id, "offscreen label culling");
  assertReactRenderCountUnchanged(afterLowZoom, afterOffscreenPan, "offscreen label culling");
  assertRendererFramesHealthy(afterOffscreenPan);
  await captureScreenshot(context.client, join(artifactDir, "final.png"));

  const consoleRows = await readJsonLinesOptional(join(artifactDir, "renderer-console.jsonl"));
  const consoleErrors = consoleRows.filter((row) => Number(row.level) >= 2);
  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors recorded: ${JSON.stringify(consoleErrors)}`);
  }

  await writeJson(join(artifactDir, "summary.json"), {
    afterCancel,
    afterCmdAdd,
    afterCmdRemove,
    afterDeepZoom,
    afterDeepZoomPan,
    afterEmptySelectionClear,
    afterEscapeClear,
    afterEdgeDraw,
    afterGroupDrag,
    afterLowZoom,
    afterLowZoomSelect,
    afterMarquee,
    afterOffscreenPan,
    afterPan,
    afterPlainSelect,
    afterWheelPan,
    afterZoom,
    afterZoomGroupDrag,
    afterZoomGroupFirstSelect,
    afterZoomGroupSelect,
    artifactDir,
    cancelPoint,
    commitPair,
    duringCancelledEdge,
    duringEdgeDraw,
    duringMarquee,
    initial,
    marquee,
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

async function dispatchMouseClick(client, { modifiers = 0, x, y }) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    modifiers,
    type: "mouseMoved",
    x,
    y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers,
    type: "mousePressed",
    x,
    y,
  });
  await delay(16);
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    modifiers,
    type: "mouseReleased",
    x,
    y,
  });
}

async function dispatchMouseDragWithSnapshot(
  client,
  { from, modifiers = 0, screenshotPath, steps = 12, to },
) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    modifiers,
    type: "mouseMoved",
    x: from.x,
    y: from.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers,
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
      modifiers,
      type: "mouseMoved",
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    });
    await delay(16);
    if (step === Math.floor(steps / 2)) {
      during = await getPixiSnapshot(client);
      if (screenshotPath) {
        await captureScreenshot(client, screenshotPath);
      }
    }
  }
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    modifiers,
    type: "mouseReleased",
    x: to.x,
    y: to.y,
  });
  return during ?? getPixiSnapshot(client);
}

async function dispatchEscape(client) {
  await dispatchKeyEvent(client, { code: "Escape", key: "Escape" });
  await dispatchKeyEvent(client, { code: "Escape", key: "Escape", type: "keyUp" });
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

async function panNodeLabelOutsideViewport(client, snapshot, nodeId) {
  let current = snapshot;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const node = nodeById(current, nodeId);
    if (!node.label.visible && node.label.visibilityReason === "outside-viewport") {
      return current;
    }
    await dispatchWheel(client, {
      deltaX: node.screenX < current.canvas.clientWidth / 2 ? 900 : -900,
      deltaY: 0,
      x: Math.floor(current.canvas.clientWidth / 2),
      y: Math.floor(current.canvas.clientHeight / 2),
    });
    await delay(100);
    current = await getPixiSnapshot(client);
  }
  throw new Error(
    `node label did not become offscreen-hidden after pan attempts: nodeId=${nodeId} snapshot=${JSON.stringify(current)}`,
  );
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
  assertSelectionDebugShape(snapshot);
  assertLabelsAttachedToNodeCenters(snapshot, "initial render");
  assertLabelsScreenSpace(snapshot, "initial render");
  assertLabelVisibilityMode(snapshot, "visible-priority", "initial render");
  assertAtLeastOneVisibleLabel(snapshot, "initial render");
  assertLabelDebugCounters(snapshot, "initial render");
}

function assertSelectionDebugShape(snapshot) {
  if (
    typeof snapshot.interaction.drawingMarquee !== "boolean" ||
    !Array.isArray(snapshot.interaction.selectedNodeIds)
  ) {
    throw new Error(
      `Pixi debug snapshot did not expose selection state: ${JSON.stringify(snapshot.interaction)}`,
    );
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

function assertZoomAtLeast(snapshot, minimumZoom, label) {
  if (snapshot.camera.zoom < minimumZoom) {
    throw new Error(
      `${label} did not reach target zoom: minimum=${minimumZoom} camera=${JSON.stringify(snapshot.camera)}`,
    );
  }
}

function assertZoomUnchanged(before, after, label) {
  if (Math.abs(after.camera.zoom - before.camera.zoom) > 0.005) {
    throw new Error(
      `camera zoom changed during ${label}: before=${JSON.stringify(before.camera)} after=${JSON.stringify(after.camera)}`,
    );
  }
}

function assertCameraUnchanged(before, after, label) {
  const moved =
    Math.abs(after.camera.x - before.camera.x) > 0.5 ||
    Math.abs(after.camera.y - before.camera.y) > 0.5 ||
    Math.abs(after.camera.zoom - before.camera.zoom) > 0.005;
  if (moved) {
    throw new Error(
      `camera moved during ${label}: before=${JSON.stringify(before.camera)} after=${JSON.stringify(after.camera)}`,
    );
  }
}

function assertSelectedExactly(snapshot, expectedNodeIds, label) {
  const actual = snapshot.interaction.selectedNodeIds;
  const actualSet = new Set(actual);
  const expectedSet = new Set(expectedNodeIds);
  if (actual.length !== actualSet.size) {
    throw new Error(`${label} reported duplicate selected nodes: ${JSON.stringify(actual)}`);
  }
  if (!setsEqual(actualSet, expectedSet)) {
    throw new Error(
      `${label} selected wrong nodes: expected=${JSON.stringify([...expectedSet])} actual=${JSON.stringify(actual)}`,
    );
  }
  const expectedFirst = expectedNodeIds[0] ?? null;
  if (snapshot.interaction.selectedNodeId !== expectedFirst) {
    throw new Error(
      `${label} selectedNodeId did not mirror the first selected node: expected=${expectedFirst} actual=${snapshot.interaction.selectedNodeId}`,
    );
  }
}

function assertLabelsAttachedToNodeCenters(snapshot, label) {
  for (const node of snapshot.graph.nodes) {
    const nodeCenter = { x: Math.round(node.screenX), y: Math.round(node.screenY) };
    assertFiniteNumber(node.label?.screenX, `${label} ${node.id} label.screenX`);
    assertFiniteNumber(node.label?.screenY, `${label} ${node.id} label.screenY`);
    if (
      Math.abs(node.label.screenX - nodeCenter.x) > 1 ||
      Math.abs(node.label.screenY - nodeCenter.y) > 1
    ) {
      throw new Error(
        `${label} label was not attached to node center: node=${JSON.stringify(node)}`,
      );
    }
    if (
      Math.abs(node.label.globalX - node.label.screenX) > 1 ||
      Math.abs(node.label.globalY - node.label.screenY) > 1
    ) {
      throw new Error(
        `${label} label global position did not match screen position: node=${JSON.stringify(node)}`,
      );
    }
  }
}

function assertLabelsScreenSpace(snapshot, label) {
  for (const node of snapshot.graph.nodes) {
    if (!node.label || node.label.text.length === 0) {
      throw new Error(`${label} node label was missing text: ${JSON.stringify(node)}`);
    }
    if (node.label.eventMode !== "none") {
      throw new Error(`${label} node label was interactive: ${JSON.stringify(node)}`);
    }
    assertLabelBitmapFontMetadata(node, label);
    const scaleFields = ["scaleX", "scaleY", "worldScaleX", "worldScaleY"];
    for (const field of scaleFields) {
      assertFiniteNumber(node.label[field], `${label} ${node.id} label.${field}`);
      if (Math.abs(node.label[field] - 1) > 0.01) {
        throw new Error(
          `${label} label was viewport-scaled: field=${field} node=${JSON.stringify(node)} camera=${JSON.stringify(snapshot.camera)}`,
        );
      }
    }
  }
}

function assertLabelBitmapFontMetadata(node, label) {
  if (node.label.kind !== "bitmap-text") {
    throw new Error(`${label} node label was not BitmapText: ${JSON.stringify(node)}`);
  }
  if (node.label.fontFamily !== expectedBitmapLabelFontFamily) {
    throw new Error(
      `${label} node label used wrong bitmap font: expected=${expectedBitmapLabelFontFamily} node=${JSON.stringify(node)}`,
    );
  }
  if (node.label.fontDistanceFieldType !== "msdf" || node.label.fontDistanceFieldRange !== 4) {
    throw new Error(`${label} node label did not use an MSDF font: ${JSON.stringify(node)}`);
  }
}

function assertLabelDebugCounters(snapshot, label) {
  assertNonNegativeInteger(snapshot.render.labelObjectCount, `${label} labelObjectCount`);
  assertNonNegativeInteger(snapshot.render.labelSyncCount, `${label} labelSyncCount`);
  assertNonNegativeInteger(snapshot.render.visibleLabelCount, `${label} visibleLabelCount`);
  assertLabelVisibilityModeValue(
    snapshot.render.labelVisibilityMode,
    `${label} labelVisibilityMode`,
  );
  if (snapshot.render.labelObjectCount !== snapshot.graph.nodeCount) {
    throw new Error(
      `${label} labelObjectCount did not match graph node count: graph=${snapshot.graph.nodeCount} render=${JSON.stringify(snapshot.render)}`,
    );
  }
  const visibleNodeLabels = snapshot.graph.nodes.filter((node) => node.label?.visible).length;
  if (snapshot.render.visibleLabelCount !== visibleNodeLabels) {
    throw new Error(
      `${label} visibleLabelCount did not match visible node labels: expected=${visibleNodeLabels} render=${JSON.stringify(snapshot.render)}`,
    );
  }
  assertLabelVisibilityReasons(snapshot, label);
}

function assertLabelVisibilityReasons(snapshot, label) {
  for (const node of snapshot.graph.nodes) {
    if (!labelVisibilityReasons.has(node.label?.visibilityReason)) {
      throw new Error(
        `${label} node label reported invalid visibility reason: ${JSON.stringify(node)}`,
      );
    }
    if (
      node.label.visible &&
      !["all-visible", "selected", "visible-priority"].includes(node.label.visibilityReason)
    ) {
      throw new Error(`${label} visible label used hidden reason: ${JSON.stringify(node)}`);
    }
    if (
      !node.label.visible &&
      !["decluttered", "outside-viewport", "zoom-hidden"].includes(node.label.visibilityReason)
    ) {
      throw new Error(`${label} hidden label used visible reason: ${JSON.stringify(node)}`);
    }
  }
}

function assertLabelSyncAdvanced(before, after, label) {
  assertRenderCounterAdvanced(before, after, "labelSyncCount", label);
  assertLabelDebugCounters(after, label);
}

function assertAtLeastOneVisibleLabel(snapshot, label) {
  const visibleLabels = snapshot.graph.nodes.filter(
    (node) => node.label?.visible && visiblePoint(snapshot, node.label),
  );
  if (visibleLabels.length === 0) {
    throw new Error(
      `${label} did not leave any labels visible: nodes=${JSON.stringify(snapshot.graph.nodes)} camera=${JSON.stringify(snapshot.camera)}`,
    );
  }
}

function assertLabelVisibilityMode(snapshot, expectedMode, label) {
  assertLabelVisibilityModeValue(
    snapshot.render.labelVisibilityMode,
    `${label} labelVisibilityMode`,
  );
  if (snapshot.render.labelVisibilityMode !== expectedMode) {
    throw new Error(
      `${label} used wrong label visibility mode: expected=${expectedMode} render=${JSON.stringify(snapshot.render)}`,
    );
  }
}

function assertLabelVisibilityModeValue(value, label) {
  if (!["all-visible", "selected", "visible-priority"].includes(value)) {
    throw new Error(`${label} was invalid: ${String(value)}`);
  }
}

function assertSelectedModeLabelVisibility(snapshot, selectedNodeId, label) {
  assertLabelVisibilityMode(snapshot, "selected", label);
  assertLabelDebugCounters(snapshot, label);
  const selectedNode = nodeById(snapshot, selectedNodeId);
  if (!nodeIntersectsCanvas(snapshot, selectedNode)) {
    throw new Error(`${label} selected node was not in viewport: ${JSON.stringify(selectedNode)}`);
  }
  if (!selectedNode.label.visible || selectedNode.label.visibilityReason !== "selected") {
    throw new Error(
      `${label} selected in-viewport label was not visible: ${JSON.stringify(selectedNode)}`,
    );
  }
  for (const node of snapshot.graph.nodes) {
    if (node.id === selectedNodeId) {
      continue;
    }
    if (node.label.visible) {
      throw new Error(`${label} unselected label was visible: ${JSON.stringify(node)}`);
    }
    if (!["outside-viewport", "zoom-hidden"].includes(node.label.visibilityReason)) {
      throw new Error(`${label} unselected label used wrong reason: ${JSON.stringify(node)}`);
    }
  }
}

function assertAllVisibleModeLabels(snapshot, label) {
  assertLabelVisibilityMode(snapshot, "all-visible", label);
  assertLabelDebugCounters(snapshot, label);
  for (const node of snapshot.graph.nodes) {
    if (nodeIntersectsCanvas(snapshot, node)) {
      if (!node.label.visible || node.label.visibilityReason !== "all-visible") {
        throw new Error(`${label} in-viewport label was not visible: ${JSON.stringify(node)}`);
      }
      continue;
    }
    if (node.label.visible || node.label.visibilityReason !== "outside-viewport") {
      throw new Error(`${label} offscreen label was not culled: ${JSON.stringify(node)}`);
    }
  }
}

function assertNodeLabelOutsideViewport(snapshot, nodeId, label) {
  assertLabelDebugCounters(snapshot, label);
  const node = nodeById(snapshot, nodeId);
  if (nodeIntersectsCanvas(snapshot, node)) {
    throw new Error(`${label} node still intersected the viewport: ${JSON.stringify(node)}`);
  }
  if (node.label.visible || node.label.visibilityReason !== "outside-viewport") {
    throw new Error(`${label} node label was not hidden as offscreen: ${JSON.stringify(node)}`);
  }
}

function assertReactRenderCountUnchanged(before, after, label) {
  if (after.render.reactRenderCount !== before.render.reactRenderCount) {
    throw new Error(
      `${label} changed React render count: before=${before.render.reactRenderCount} after=${after.render.reactRenderCount}`,
    );
  }
}

function assertFiniteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} was not finite: ${String(value)}`);
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} was not a non-negative integer: ${String(value)}`);
  }
}

function assertMarqueeCommitted(before, during, after, targetNodeIds) {
  if (!during.interaction.drawingMarquee) {
    throw new Error(
      `debug snapshot did not report active marquee selection: ${JSON.stringify(during.interaction)}`,
    );
  }
  if (after.interaction.drawingMarquee) {
    throw new Error(
      `marquee selection remained active after release: ${JSON.stringify(after.interaction)}`,
    );
  }
  if (after.interaction.selectedNodeIds.length < 2) {
    throw new Error(
      `marquee did not select multiple nodes: ${JSON.stringify(after.interaction.selectedNodeIds)}`,
    );
  }
  for (const nodeId of targetNodeIds) {
    if (!after.interaction.selectedNodeIds.includes(nodeId)) {
      throw new Error(
        `marquee did not include target node ${nodeId}: selected=${JSON.stringify(after.interaction.selectedNodeIds)}`,
      );
    }
  }
  assertCameraUnchanged(before, after, "Shift marquee selection");
  assertRenderCounterAdvanced(before, after, "marqueeUpdateCount", "marquee update");
  assertRenderCounterAdvanced(before, after, "selectionChangeCount", "marquee selection");
}

function assertGroupDragMoved(before, after, selectedNodeIds) {
  if (selectedNodeIds.length < 2) {
    throw new Error(
      `group drag requires multiple selected nodes: ${JSON.stringify(selectedNodeIds)}`,
    );
  }
  assertSelectedExactly(after, selectedNodeIds, "group drag");
  assertCameraUnchanged(before, after, "group node drag");
  assertRenderCounterAdvanced(before, after, "nodeDragUpdateCount", "group node drag");
  assertRenderCounterAdvanced(before, after, "edgeRedrawCount", "group node drag edge redraw");
  assertLabelsAttachedToNodeCenters(after, "group node drag");
  assertLabelsScreenSpace(after, "group node drag");
  assertLabelSyncAdvanced(before, after, "group node drag label sync");
  assertReactRenderCountUnchanged(before, after, "group node drag label sync");

  const primaryBefore = nodeById(before, selectedNodeIds[0]);
  const primaryAfter = nodeById(after, selectedNodeIds[0]);
  const delta = { x: primaryAfter.x - primaryBefore.x, y: primaryAfter.y - primaryBefore.y };
  if (Math.abs(delta.x) < 1 && Math.abs(delta.y) < 1) {
    throw new Error(
      `group drag primary node did not move: before=${JSON.stringify(primaryBefore)} after=${JSON.stringify(primaryAfter)}`,
    );
  }
  assertSelectedNodesMovedWithDelta(before, after, selectedNodeIds, delta);
  assertUnselectedNodesStationary(before, after, selectedNodeIds);
}

function assertSelectedNodesMovedWithDelta(before, after, selectedNodeIds, delta) {
  for (const nodeId of selectedNodeIds) {
    const beforeNode = nodeById(before, nodeId);
    const afterNode = nodeById(after, nodeId);
    const nodeDeltaX = afterNode.x - beforeNode.x;
    const nodeDeltaY = afterNode.y - beforeNode.y;
    if (Math.abs(nodeDeltaX - delta.x) > 0.5 || Math.abs(nodeDeltaY - delta.y) > 0.5) {
      throw new Error(
        `selected node ${nodeId} did not move with the group: expectedDelta=${JSON.stringify(delta)} actualDelta=${JSON.stringify({ x: nodeDeltaX, y: nodeDeltaY })}`,
      );
    }
  }
}

function assertUnselectedNodesStationary(before, after, selectedNodeIds) {
  const selectedSet = new Set(selectedNodeIds);
  for (const beforeNode of before.graph.nodes) {
    if (selectedSet.has(beforeNode.id)) {
      continue;
    }
    const afterNode = nodeById(after, beforeNode.id);
    if (Math.abs(afterNode.x - beforeNode.x) > 0.5 || Math.abs(afterNode.y - beforeNode.y) > 0.5) {
      throw new Error(
        `unselected node ${beforeNode.id} moved during group drag: before=${JSON.stringify(beforeNode)} after=${JSON.stringify(afterNode)}`,
      );
    }
  }
}

function visibleNodes(snapshot) {
  return snapshot.graph.nodes.filter((node) => {
    return (
      node.screenX > 24 &&
      node.screenY > 24 &&
      node.screenX < snapshot.canvas.clientWidth - 24 &&
      node.screenY < snapshot.canvas.clientHeight - 24
    );
  });
}

function marqueeForNodes(snapshot, nodeIds) {
  const targetNodes = nodeIds.map((nodeId) => nodeById(snapshot, nodeId));
  const bounds = targetNodes.map((node) => nodeScreenBounds(snapshot, node));
  const left = Math.min(...bounds.map((bound) => bound.left)) - 28;
  const top = Math.min(...bounds.map((bound) => bound.top)) - 28;
  const right = Math.max(...bounds.map((bound) => bound.right)) + 28;
  const bottom = Math.max(...bounds.map((bound) => bound.bottom)) + 28;
  return {
    from: clampCanvasPoint(snapshot, { x: left, y: top }),
    nodeIds,
    to: clampCanvasPoint(snapshot, { x: right, y: bottom }),
  };
}

function nodeById(snapshot, nodeId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`node ${nodeId} missing from debug snapshot`);
  }
  return node;
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

function nodeIntersectsCanvas(snapshot, node) {
  const bounds = nodeScreenBounds(snapshot, node);
  return (
    bounds.left <= snapshot.canvas.clientWidth &&
    bounds.right >= 0 &&
    bounds.top <= snapshot.canvas.clientHeight &&
    bounds.bottom >= 0
  );
}

function clampCanvasPoint(snapshot, point) {
  return {
    x: Math.max(12, Math.min(snapshot.canvas.clientWidth - 12, point.x)),
    y: Math.max(12, Math.min(snapshot.canvas.clientHeight - 12, point.y)),
  };
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
    const awayFromPorts = ports.every(
      (port) => Math.hypot(candidate.x - port.screenX, candidate.y - port.screenY) > 72,
    );
    const outsideNodes = snapshot.graph.nodes.every((node) => {
      return !pointInsideNodeScreenBounds(snapshot, node, candidate, 24);
    });
    return awayFromPorts && outsideNodes;
  });
  if (!point) {
    throw new Error(
      `could not find an empty canvas point away from visible nodes and ports: nodes=${JSON.stringify(snapshot.graph.nodes)} ports=${JSON.stringify(ports)}`,
    );
  }
  return point;
}

function pointInsideNodeScreenBounds(snapshot, node, point, padding) {
  const bounds = nodeScreenBounds(snapshot, node);
  return (
    point.x >= bounds.left - padding &&
    point.x <= bounds.right + padding &&
    point.y >= bounds.top - padding &&
    point.y <= bounds.bottom + padding
  );
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
  assertFrameTimingsHealthy(snapshot);
  assertPositiveRenderCounters(snapshot, [
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
  ]);
}

function assertFrameTimingsHealthy(snapshot) {
  if (snapshot.render.frameCount <= 0) {
    throw new Error(`Pixi ticker did not advance: ${JSON.stringify(snapshot.render)}`);
  }
  if (
    !Number.isFinite(snapshot.render.averageFrameMs) ||
    !Number.isFinite(snapshot.render.worstFrameMs)
  ) {
    throw new Error(`Pixi frame timings were not finite: ${JSON.stringify(snapshot.render)}`);
  }
}

function assertPositiveRenderCounters(snapshot, counters) {
  for (const counter of counters) {
    if (snapshot.render[counter] <= 0) {
      throw new Error(
        `Pixi render counter did not advance: ${counter} render=${JSON.stringify(snapshot.render)}`,
      );
    }
  }
}

function setsEqual(left, right) {
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
