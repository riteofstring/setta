#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowTimeoutMs = 25_000;
const dragDeltaTolerancePx = 35;
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 1440,
};

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/app-window-drag-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("app-window-drag-workflow");
await writeLatestRecordingPointer("app-window-drag-workflow", artifactDir);
const fixture = await createElectronFixture("app-window-drag-workflow");
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    visible: options.visible,
  });
  await context.client.call("Emulation.setDeviceMetricsOverride", viewport);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await ensureWorkspaceOpen(context.client);
  await waitForToolbar(context.client);
  await captureScreenshot(context.client, join(artifactDir, "before.png"));

  const regions = await sampleDragRegions(context.client);
  assertToolbarDragSurface(regions);
  assertPaneChromeNotDraggable(regions);

  const before = await windowPosition(context.client);
  const from = { x: 900, y: 12 };
  const to = { x: 1020, y: 88 };
  await dispatchPhysicalMouseDrag(context.client, { from, steps: 24, to });
  await delay(800);
  const after = await windowPosition(context.client);
  const result = dragResult(before, after, from, to);
  assertDragResult(result);

  await captureScreenshot(context.client, join(artifactDir, "after.png"));
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    regions,
    result,
    status: "passed",
    viewport,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron app window drag workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-regions.json"), {
      regions: await safeSampleDragRegions(context.client),
    }).catch(() => {});
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

async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return;
  }
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Open project folder"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-open-project-folder-button" };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-open-project-folder-button" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!opened.ok) {
    throw new Error(`workspace open failed: ${JSON.stringify(opened)}`);
  }
  await waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    workflowTimeoutMs,
  );
}

async function waitForToolbar(client) {
  await waitForState(
    client,
    `(() => Boolean(document.querySelector('.workspace-toolbar')))()`,
    Boolean,
    workflowTimeoutMs,
  );
}

async function dispatchPhysicalMouseDrag(client, { from, steps, to }) {
  const startWindow = await windowPosition(client);
  const startScreen = {
    x: startWindow.screenX + from.x,
    y: startWindow.screenY + from.y,
  };
  const endScreen = {
    x: startScreen.x + to.x - from.x,
    y: startScreen.y + to.y - from.y,
  };

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

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const targetScreen = {
      x: startScreen.x + (endScreen.x - startScreen.x) * progress,
      y: startScreen.y + (endScreen.y - startScreen.y) * progress,
    };
    const currentWindow = await windowPosition(client);
    await client.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: targetScreen.x - currentWindow.screenX,
      y: targetScreen.y - currentWindow.screenY,
    });
    await delay(16);
  }

  const finalWindow = await windowPosition(client);
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: endScreen.x - finalWindow.screenX,
    y: endScreen.y - finalWindow.screenY,
  });
}

async function windowPosition(client) {
  return client.evaluate(
    `(() => ({ screenX: window.screenX, screenY: window.screenY, outerWidth: window.outerWidth, outerHeight: window.outerHeight }))()`,
  );
}

function dragResult(before, after, from, to) {
  const actualDelta = {
    x: after.screenX - before.screenX,
    y: after.screenY - before.screenY,
  };
  const expectedDelta = {
    x: to.x - from.x,
    y: to.y - from.y,
  };
  return {
    actualDelta,
    after,
    before,
    deltaError: {
      x: Math.abs(actualDelta.x - expectedDelta.x),
      y: Math.abs(actualDelta.y - expectedDelta.y),
    },
    expectedDelta,
  };
}

function assertDragResult(result) {
  if (result.actualDelta.x === 0 && result.actualDelta.y === 0) {
    throw new Error("window did not move from app toolbar drag");
  }
  if (result.deltaError.x > dragDeltaTolerancePx || result.deltaError.y > dragDeltaTolerancePx) {
    throw new Error(`app toolbar drag moved by unexpected delta: ${JSON.stringify(result)}`);
  }
}

async function sampleDragRegions(client) {
  return client.evaluate(`(() => {
    function sample(name, x, y) {
      const el = document.elementFromPoint(x, y);
      const style = el instanceof Element ? getComputedStyle(el) : null;
      return {
        aria: el instanceof Element ? el.getAttribute("aria-label") : null,
        className: el instanceof HTMLElement ? el.className : "",
        name,
        region: style?.getPropertyValue("-webkit-app-region") ?? null,
        tag: el instanceof Element ? el.tagName.toLowerCase() : null,
        testid: el instanceof Element ? el.getAttribute("data-testid") : null,
        x,
        y,
      };
    }
    const paneTop = document
      .querySelector('[data-testid="workspace-pane-host"][data-visible="true"] .workspace-pane-top-bar')
      ?.getBoundingClientRect();
    return [
      sample("toolbar-empty-center", 900, 12),
      sample("toolbar-empty-left", 360, 12),
      sample("toolbar-control", 1390, 16),
      sample("pane-title-bar", paneTop ? paneTop.left + 120 : 350, paneTop ? paneTop.top + 12 : 53),
    ];
  })()`);
}

function assertToolbarDragSurface(regions) {
  const toolbar = requiredRegion(regions, "toolbar-empty-center");
  if (toolbar.testid !== "workspace-toolbar" || toolbar.className.includes("app-drag")) {
    throw new Error(`toolbar drag surface is wrong: ${JSON.stringify(toolbar)}`);
  }
}

function assertPaneChromeNotDraggable(regions) {
  const pane = requiredRegion(regions, "pane-title-bar");
  if (pane.region !== "no-drag") {
    throw new Error(`pane top bar is draggable: ${JSON.stringify(pane)}`);
  }
}

function requiredRegion(regions, name) {
  const region = regions.find((candidate) => candidate.name === name);
  if (!region) {
    throw new Error(`missing sampled region ${name}: ${JSON.stringify(regions)}`);
  }
  return region;
}

async function safeSampleDragRegions(client) {
  try {
    return await sampleDragRegions(client);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function workspaceIdExpression() {
  return `(() => document.querySelector('[data-testid="workspace-layout-area"]')?.getAttribute('data-workspace-id') ?? "")()`;
}
