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
  assertRendererFramesHealthy(afterDrag);
  await captureScreenshot(context.client, join(artifactDir, "final.png"));

  const consoleRows = await readJsonLinesOptional(join(artifactDir, "renderer-console.jsonl"));
  const consoleErrors = consoleRows.filter((row) => Number(row.level) >= 2);
  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors recorded: ${JSON.stringify(consoleErrors)}`);
  }

  await writeJson(join(artifactDir, "summary.json"), {
    afterDrag,
    afterPan,
    afterZoom,
    artifactDir,
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

function assertInitialSnapshot(snapshot) {
  if (snapshot.graph.nodeCount < 1) {
    throw new Error(`Pixi graph did not expose nodes: ${JSON.stringify(snapshot.graph)}`);
  }
  if (snapshot.graph.edgeCount < 1) {
    throw new Error(`Pixi graph did not expose edges: ${JSON.stringify(snapshot.graph)}`);
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
}
