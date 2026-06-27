#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
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
const shellTopBarButtonGapPx = 6;
const shellTopBarButtonSizePx = 28;
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
  await waitForWorkspaceControls(context.client);
  await captureScreenshot(context.client, join(artifactDir, "before.png"));

  const regions = await sampleDragRegions(context.client);
  assertWorkspaceControlsNotDraggable(regions);
  assertShellTopBarDragRegions(regions);
  assertPaneChromeNotWindowDraggable(regions);
  assertPaneDragHandleNotWindowDraggable(regions);
  await assertEffectiveWindowDragRegions(context.client);

  const before = await windowPosition(context.client);
  const shellTopBar = requiredRegion(regions, "shell-top-bar");
  const from = { x: Math.round(shellTopBar.left + 600), y: Math.round(shellTopBar.top + 12) };
  const to = { x: from.x + 120, y: from.y + 76 };
  await dispatchPhysicalMouseDrag(context.client, { from, steps: 24, to });
  await delay(800);
  const after = await windowPosition(context.client);
  const result = dragResult(before, after, from, to);
  assertDragResult(result);

  await assertCollapsedWorkspaceControlsClickable(context.client, artifactDir);
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
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  await waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    workflowTimeoutMs,
  );
}

async function waitForWorkspaceControls(client) {
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

async function dispatchPhysicalMouseClick(client, point) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await delay(80);
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: point.x,
    y: point.y,
  });
}

async function windowPosition(client) {
  return client.evaluate(
    `(() => ({ screenX: window.screenX, screenY: window.screenY, outerWidth: window.outerWidth, outerHeight: window.outerHeight }))()`,
  );
}

async function assertCollapsedWorkspaceControlsClickable(client, artifactDir) {
  const toggle = await elementCenter(client, '[data-testid="project-sidebar-toggle"]');
  await dispatchPhysicalMouseClick(client, toggle);
  await waitForProjectToggleLabel(client, "Show project sidebar");
  await captureScreenshot(client, join(artifactDir, "collapsed-controls.png"));
  const collapsedRegions = await sampleDragRegions(client);
  assertWorkspaceControlsNotDraggable(collapsedRegions);
  assertShellTopBarDragRegions(collapsedRegions);
  assertShellTopBarControlSizing(await shellTopBarControlMeasurements(client));
  await assertEffectiveWindowDragRegions(client);

  const maximizeButton = await elementCenter(
    client,
    '[data-testid="workspace-pane-host"][data-visible="true"] [data-workspace-pane-maximize-button="true"]:not([disabled])',
  );
  await dispatchPhysicalMouseClick(client, maximizeButton);
  await waitForPaneMaximized(client, true);
  const restoreButton = await elementCenter(
    client,
    '[data-testid="workspace-pane-host"][data-visible="true"] [data-workspace-pane-maximize-button="true"]:not([disabled])',
  );
  await dispatchPhysicalMouseClick(client, restoreButton);
  await waitForPaneMaximized(client, false);

  const overviewButton = await elementCenter(client, ".workspace-toolbar-button");
  await dispatchPhysicalMouseClick(client, overviewButton);
  await waitForState(
    client,
    `(() => document.querySelector('[data-testid="workspace-layout-area"]')?.getAttribute("data-presentation-mode") ?? "")()`,
    (mode) => mode === "overview",
    workflowTimeoutMs,
  );
  const overviewExitButton = await elementCenter(client, ".workspace-toolbar-button");
  await dispatchPhysicalMouseClick(client, overviewExitButton);
  await waitForState(
    client,
    `(() => document.querySelector('[data-testid="workspace-layout-area"]')?.getAttribute("data-presentation-mode") ?? "")()`,
    (mode) => mode === "normal",
    workflowTimeoutMs,
  );
  const newFrameButton = await elementCenter(client, ".workspace-toolbar-menu-button");
  await dispatchPhysicalMouseClick(client, newFrameButton);
  await waitForNewFrameMenu(client, true);
  const newFrameCloseButton = await elementCenter(client, ".workspace-toolbar-menu-button");
  await dispatchPhysicalMouseClick(client, newFrameCloseButton);
  await waitForNewFrameMenu(client, false);

  await dispatchPhysicalMouseClick(client, toggle);
  await waitForProjectToggleLabel(client, "Hide project sidebar");
}

async function waitForNewFrameMenu(client, expectedOpen) {
  await waitForState(
    client,
    `(() => Boolean(document.querySelector('[role="menu"][aria-label="New frame options"]')))()`,
    (open) => open === expectedOpen,
    workflowTimeoutMs,
  );
}

async function waitForPaneMaximized(client, expectedMaximized) {
  await waitForState(
    client,
    `(() => Boolean(document.querySelector('[data-testid="workspace-pane-host"][data-visible="true"][data-maximized="true"]')))()`,
    (maximized) => maximized === expectedMaximized,
    workflowTimeoutMs,
  );
}

async function waitForProjectToggleLabel(client, label) {
  await waitForState(
    client,
    `(() => document.querySelector('[data-testid="project-sidebar-toggle"]')?.getAttribute("aria-label") ?? "")()`,
    (value) => value === label,
    workflowTimeoutMs,
  );
}

async function elementCenter(client, selector) {
  const rect = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof Element)) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
  })()`);
  if (!rect) {
    throw new Error(`missing element center target: ${selector}`);
  }
  return {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  };
}

async function shellTopBarControlMeasurements(client) {
  return client.evaluate(`(() => {
    function rectFor(selector) {
      const element = document.querySelector(selector);
      if (!(element instanceof Element)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    }
    function numericGap(selector) {
      const element = document.querySelector(selector);
      if (!(element instanceof Element)) {
        return null;
      }
      const gap = Number.parseFloat(getComputedStyle(element).gap);
      return Number.isFinite(gap) ? gap : null;
    }
    return {
      newFrameButton: rectFor(".workspace-toolbar-menu-button"),
      projectToggle: rectFor('[data-testid="project-sidebar-toggle"]'),
      settingsButton: rectFor('[data-testid="shell-settings-button"]'),
      shellTopBar: rectFor('[data-testid="shell-top-bar"]'),
      toolbarButton: rectFor(".workspace-toolbar-button"),
      toolbarGap: numericGap(".workspace-toolbar-group"),
    };
  })()`);
}

// Electron builds the OS draggable region by applying every element's
// -webkit-app-region rect in document order (SkRegion union for drag,
// difference for no-drag), so a drag surface rendered after a control
// re-covers the no-drag hole that control punched. Synthetic CDP input
// bypasses the OS region, so clicks alone cannot catch that regression;
// this models the ordered region math and checks the points that matter.
async function assertEffectiveWindowDragRegions(client) {
  const targets = [
    { name: "project-toggle", selector: '[data-testid="project-sidebar-toggle"]' },
    { name: "overview-button", selector: ".workspace-toolbar-button" },
    { name: "new-frame-button", selector: ".workspace-toolbar-menu-button" },
    {
      name: "shell-top-bar-surface",
      offsetX: 600,
      offsetY: 12,
      selector: '[data-testid="shell-top-bar"]',
    },
    {
      name: "pane-title-bar",
      offsetX: 220,
      offsetY: 12,
      selector: '[data-testid="workspace-pane-host"][data-visible="true"] .workspace-pane-top-bar',
    },
  ];
  const states = await effectiveDragRegionStates(client, targets);
  const expectations = {
    "new-frame-button": false,
    "overview-button": false,
    "pane-title-bar": false,
    "project-toggle": false,
    "shell-top-bar-surface": true,
  };
  for (const [name, expectedDraggable] of Object.entries(expectations)) {
    const state = states.find((candidate) => candidate.name === name);
    if (!state || state.missing) {
      throw new Error(
        `missing effective drag region target ${name}: ${JSON.stringify(state ?? states)}`,
      );
    }
    if (state.draggable !== expectedDraggable) {
      throw new Error(
        `effective OS drag region mismatch for ${name} (expected draggable=${expectedDraggable}): ${JSON.stringify(state)}`,
      );
    }
  }
}

async function effectiveDragRegionStates(client, targets) {
  return client.evaluate(`((targets) => {
    const points = targets.map((target) => {
      if (typeof target.x === "number" && typeof target.y === "number") {
        return { missing: null, name: target.name, x: target.x, y: target.y };
      }
      const element = document.querySelector(target.selector);
      if (!(element instanceof Element)) {
        return { missing: target.selector, name: target.name, x: 0, y: 0 };
      }
      const rect = element.getBoundingClientRect();
      return {
        missing: null,
        name: target.name,
        x: rect.left + (target.offsetX ?? rect.width / 2),
        y: rect.top + (target.offsetY ?? rect.height / 2),
      };
    });
    const draggable = points.map(() => false);
    for (const element of document.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      const region = style.getPropertyValue("-webkit-app-region");
      if (region !== "drag" && region !== "no-drag") {
        continue;
      }
      if (style.display === "none" || style.visibility === "hidden") {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      points.forEach((point, index) => {
        if (
          point.x >= rect.left &&
          point.x < rect.right &&
          point.y >= rect.top &&
          point.y < rect.bottom
        ) {
          draggable[index] = region === "drag";
        }
      });
    }
    return points.map((point, index) => ({ ...point, draggable: draggable[index] }));
  })(${JSON.stringify(targets)})`);
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
    throw new Error("window did not move from drag");
  }
  if (result.deltaError.x > dragDeltaTolerancePx || result.deltaError.y > dragDeltaTolerancePx) {
    throw new Error(`window drag moved by unexpected delta: ${JSON.stringify(result)}`);
  }
}

async function sampleDragRegions(client) {
  return client.evaluate(`(() => {
    function sample(name, x, y) {
      const el = document.elementFromPoint(x, y);
      const element = el instanceof Element ? el : null;
      const closestTestId = element?.closest("[data-testid]")?.getAttribute("data-testid") ?? null;
      const style = el instanceof Element ? getComputedStyle(el) : null;
      return {
        aria: element?.getAttribute("aria-label") ?? null,
        className: element?.getAttribute("class") ?? "",
        name,
        region: style?.getPropertyValue("-webkit-app-region") ?? null,
        tag: el instanceof Element ? el.tagName.toLowerCase() : null,
        testid: element?.getAttribute("data-testid") ?? closestTestId,
        x,
        y,
      };
    }
    function sampleElement(name, selector) {
      const element = document.querySelector(selector);
      const style = element instanceof Element ? getComputedStyle(element) : null;
      const rect = element instanceof Element ? element.getBoundingClientRect() : null;
      return {
        aria: element?.getAttribute("aria-label") ?? null,
        className: element?.getAttribute("class") ?? "",
        height: rect?.height ?? 0,
        left: rect?.left ?? 0,
        name,
        region: style?.getPropertyValue("-webkit-app-region") ?? null,
        tag: element instanceof Element ? element.tagName.toLowerCase() : null,
        testid: element?.getAttribute("data-testid") ?? null,
        top: rect?.top ?? 0,
        width: rect?.width ?? 0,
        x: -1,
        y: -1,
      };
    }
    const toolbar = document.querySelector('.workspace-toolbar')?.getBoundingClientRect();
    const paneTop = document
      .querySelector('[data-testid="workspace-pane-host"][data-visible="true"] .workspace-pane-top-bar')
      ?.getBoundingClientRect();
    const paneHandle = document
      .querySelector('[data-testid="workspace-pane-host"][data-visible="true"] .workspace-pane-drag-handle')
      ?.getBoundingClientRect();
    return [
      sample("workspace-control", toolbar ? toolbar.left + 14 : 118, toolbar ? toolbar.top + 14 : 18),
      sampleElement("shell-top-bar", '[data-testid="shell-top-bar"]'),
      sample("pane-title-bar", paneTop ? paneTop.left + 120 : 350, paneTop ? paneTop.top + 12 : 53),
      sample(
        "pane-drag-handle",
        paneHandle ? paneHandle.left + paneHandle.width / 2 : 30,
        paneHandle ? paneHandle.top + paneHandle.height / 2 : 53,
      ),
    ];
  })()`);
}

function assertWorkspaceControlsNotDraggable(regions) {
  const control = requiredRegion(regions, "workspace-control");
  if (control.testid !== "workspace-toolbar" || control.region !== "no-drag") {
    throw new Error(`workspace control drag region is wrong: ${JSON.stringify(control)}`);
  }
}

function assertShellTopBarDragRegions(regions) {
  const topBar = requiredRegion(regions, "shell-top-bar");
  if (topBar.testid !== "shell-top-bar" || topBar.region !== "drag") {
    throw new Error(`shell top bar should drag the window: ${JSON.stringify(topBar)}`);
  }
}

function assertShellTopBarControlSizing(measurements) {
  const { newFrameButton, projectToggle, settingsButton, shellTopBar, toolbarButton, toolbarGap } =
    measurements;
  for (const [name, rect] of Object.entries({
    newFrameButton,
    projectToggle,
    settingsButton,
    shellTopBar,
    toolbarButton,
  })) {
    if (!rect) {
      throw new Error(`missing shell top bar control measurement: ${name}`);
    }
  }
  assertTopBarButtonRect(projectToggle, shellTopBar, "project toggle");
  assertTopBarButtonRect(settingsButton, shellTopBar, "settings button");
  assertTopBarButtonRect(toolbarButton, shellTopBar, "workspace toolbar button");
  assertTopBarButtonRect(newFrameButton, shellTopBar, "workspace toolbar menu button");
  assertNearlyEqual(
    settingsButton.left - projectToggle.right,
    shellTopBarButtonGapPx,
    "project toggle to settings horizontal gap",
  );
  if (toolbarButton.left <= settingsButton.right) {
    throw new Error("workspace toolbar should render to the right of shell settings button");
  }
  assertNearlyEqual(
    newFrameButton.left - toolbarButton.right,
    shellTopBarButtonGapPx,
    "workspace toolbar horizontal gap",
  );
  assertNearlyEqual(toolbarGap, shellTopBarButtonGapPx, "workspace toolbar group gap");
}

function assertTopBarButtonRect(rect, topBar, name) {
  assertNearlyEqual(rect.width, shellTopBarButtonSizePx, `${name} width`);
  assertNearlyEqual(rect.height, shellTopBarButtonSizePx, `${name} height`);
  assertNearlyEqual(
    rect.top + rect.height / 2,
    topBar.top + topBar.height / 2,
    `${name} vertical top bar alignment`,
  );
}

function assertNearlyEqual(actual, expected, name) {
  if (
    typeof actual !== "number" ||
    typeof expected !== "number" ||
    Math.abs(actual - expected) > 0.5
  ) {
    throw new Error(`${name} mismatch: expected ${expected}, got ${actual}`);
  }
}

function assertPaneChromeNotWindowDraggable(regions) {
  const pane = requiredRegion(regions, "pane-title-bar");
  if (pane.region === "drag") {
    throw new Error(`pane top bar should not drag the window: ${JSON.stringify(pane)}`);
  }
}

function assertPaneDragHandleNotWindowDraggable(regions) {
  const handle = requiredRegion(regions, "pane-drag-handle");
  if (handle.region === "drag") {
    throw new Error(`pane drag handle should not drag the window: ${JSON.stringify(handle)}`);
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
