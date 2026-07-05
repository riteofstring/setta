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
  dispatchKeyEvent,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  reloadPage,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowTimeoutMs = 25_000;
const cdpAltMetaModifier = 5;
const easyButtonGlowAnimationName = "setta-easy-button-glow-breathe";
const geometryTolerancePx = 1;
const minimumColumnWidthPx = 96;
const neutralPaneTopBarSelector =
  '[data-testid="workspace-pane-host"][data-visible="true"]:not([data-surface-kind="terminal"]) .workspace-pane-top-bar';
const nonEasyButtonPaneTopBarSelector =
  '[data-testid="workspace-pane-host"][data-visible="true"]:not([data-surface-kind="easy-button"]):not([data-surface-kind="terminal"]) .workspace-pane-top-bar';
const settledGeometryPolls = 2;
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 1440,
};

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/easy-button-pane-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("easy-button-pane");
const firstRecordingDir = join(artifactDir, "first-launch");
const secondRecordingDir = join(artifactDir, "second-launch");
await writeLatestRecordingPointer("easy-button-pane", artifactDir);
const fixture = await createElectronFixture("easy-button-pane");
let context = null;
let workspaceId = "";
let toolbarOpenState;
let keyboardOpenState;
let frozenState;
let reloadState;
let restartState;

try {
  context = await launchEasyButtonContext(firstRecordingDir);
  workspaceId = await ensureWorkspaceOpen(context.client);

  await openEasyButtonFromToolbar(context.client);
  toolbarOpenState = await waitForEasyButtonPane(context.client);
  assertEasyButtonPaneReady(toolbarOpenState, "toolbar open");
  await waitForPersistedEasyButtonLayout(context.client, workspaceId);
  await assertEasyButtonToolbarLimit(context.client);
  await captureScreenshot(context.client, join(firstRecordingDir, "toolbar-open.png"));

  await closeEasyButtonPane(context.client);
  await waitForEasyButtonPaneCount(context.client, 0);
  await openEasyButtonFromShortcut(context.client);
  keyboardOpenState = await waitForEasyButtonPane(context.client);
  assertEasyButtonPaneReady(keyboardOpenState, "keyboard open");
  await assertSecondShortcutDoesNotOpenAnotherPane(context.client);

  frozenState = await assertGlowPausedInOverview(context.client);
  await exitOverview(context.client);
  await waitForPersistedEasyButtonLayout(context.client, workspaceId);
  await captureScreenshot(
    context.client,
    join(firstRecordingDir, "keyboard-open-after-freeze.png"),
  );

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  reloadState = await waitForEasyButtonPane(context.client);
  assertEasyButtonPaneReady(reloadState, "reload");
  await captureScreenshot(context.client, join(firstRecordingDir, "after-reload.png"));

  await stopElectronCdpContext(context);
  context = null;

  context = await launchEasyButtonContext(secondRecordingDir);
  await ensureWorkspaceOpen(context.client);
  restartState = await waitForEasyButtonPane(context.client);
  assertEasyButtonPaneReady(restartState, "restart");
  await waitForPersistedEasyButtonLayout(context.client, workspaceId);
  await captureScreenshot(context.client, join(secondRecordingDir, "after-restart.png"));
} catch (error) {
  if (context) {
    const failureDir = context.artifactDir ?? artifactDir;
    await captureScreenshot(context.client, join(failureDir, "failure.png")).catch(() => {});
    await writeJson(join(failureDir, "failure-snapshot.json"), {
      easyButton: await safeEasyButtonState(context.client),
      workspaceId,
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

await writeJson(join(artifactDir, "summary.json"), {
  artifactDir,
  frozenState,
  keyboardOpenState,
  reloadState,
  restartState,
  status: "passed",
  toolbarOpenState,
  workspaceName: basename(fixture.workspaceRoot),
});
console.log(`Electron Easy Button pane workflow passed: ${artifactDir}`);

async function launchEasyButtonContext(recordingDir) {
  const launched = await launchElectronCdpContext({
    artifactDir: recordingDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    visible: options.visible,
  });
  await launched.client.call("Emulation.setDeviceMetricsOverride", viewport);
  await launched.client.call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await waitForSelector(launched.client, '[data-testid="workspace-layout-area"]');
  return launched;
}

async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return currentWorkspaceId;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  return waitForState(
    client,
    workspaceIdExpression(),
    (candidateWorkspaceId) => candidateWorkspaceId !== "" && candidateWorkspaceId !== "empty",
    workflowTimeoutMs,
  );
}

async function openEasyButtonFromToolbar(client) {
  await client.installDriver();
  await clickEnabledButtonByAria(client, "New frame", workflowTimeoutMs);
  const opened = await waitForState(
    client,
    driverCallExpression("easyButtonMenuActionState"),
    (state) => state.present,
    workflowTimeoutMs,
  );
  if (opened.disabled) {
    throw new Error(
      `Easy Button toolbar action was disabled before open: ${JSON.stringify(opened)}`,
    );
  }
  const clicked = await client.driver("clickEasyButtonMenuAction");
  if (!clicked.ok) {
    throw new Error(`Easy Button toolbar action was not clickable: ${JSON.stringify(clicked)}`);
  }
}

async function assertEasyButtonToolbarLimit(client) {
  await client.installDriver();
  await clickEnabledButtonByAria(client, "New frame", workflowTimeoutMs);
  const action = await waitForState(
    client,
    driverCallExpression("easyButtonMenuActionState"),
    (state) => state.present,
    workflowTimeoutMs,
  );
  if (!action.disabled) {
    throw new Error(
      `Easy Button toolbar action was not disabled at limit: ${JSON.stringify(action)}`,
    );
  }
  const clicked = await client.driver("clickEasyButtonMenuAction");
  if (clicked.ok) {
    throw new Error(
      `disabled Easy Button toolbar action still clicked: ${JSON.stringify(clicked)}`,
    );
  }
  await waitForEasyButtonPaneCount(client, 1);
  await clickEnabledButtonByAria(client, "New frame", workflowTimeoutMs);
}

async function closeEasyButtonPane(client) {
  const closed = await client.driver("closeEasyButtonPane");
  if (!closed.ok) {
    throw new Error(`Easy Button pane was not closeable: ${JSON.stringify(closed)}`);
  }
}

async function openEasyButtonFromShortcut(client) {
  await moveFocusToNeutralPaneTopBar(client);
  await assertShortcutFocusIsNonEditable(client);
  await dispatchKeyEvent(client, {
    code: "KeyE",
    key: "e",
    modifiers: cdpAltMetaModifier,
    type: "rawKeyDown",
  });
  await dispatchKeyEvent(client, {
    code: "KeyE",
    key: "e",
    modifiers: cdpAltMetaModifier,
    type: "keyUp",
  });
}

async function moveFocusToNeutralPaneTopBar(client) {
  await clickPaneTopBar(client, neutralPaneTopBarSelector, "neutral pane top bar");
}

async function moveFocusToNonEasyButtonPaneTopBar(client) {
  await clickPaneTopBar(client, nonEasyButtonPaneTopBarSelector, "non-Easy Button pane top bar");
}

async function clickPaneTopBar(client, selector, label) {
  const point = await client.evaluate(paneTopBarClickPointExpression(selector));
  if (!point.ok) {
    throw new Error(`${label} click target unavailable: ${JSON.stringify(point)}`);
  }
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: point.x,
    y: point.y,
  });
}

async function assertShortcutFocusIsNonEditable(client) {
  const focus = await client.evaluate(shortcutFocusStateExpression());
  if (focus.editable) {
    throw new Error(
      `Easy Button shortcut focus move failed; active element is still editable: ${JSON.stringify(focus)}`,
    );
  }
}

async function assertSecondShortcutDoesNotOpenAnotherPane(client) {
  await openEasyButtonFromShortcut(client);
  await delay(350);
  const state = await waitForEasyButtonPaneCount(client, 1);
  if (state.count !== 1) {
    throw new Error(`second Easy Button shortcut changed pane count: ${JSON.stringify(state)}`);
  }
}

async function assertGlowPausedInOverview(client) {
  await client.installDriver();
  await moveFocusToNonEasyButtonPaneTopBar(client);
  await assertEasyButtonHostUnfocused(client, "before overview");
  await clickEnabledButtonByAria(client, "Enter overview", workflowTimeoutMs);
  return waitForState(
    client,
    driverCallExpression("easyButtonPaneState"),
    (state) =>
      state.presentationMode === "overview" &&
      state.count === 1 &&
      state.hosts[0]?.surfaceFrozen === "true" &&
      state.hosts[0]?.glowAnimationPlayState === "paused",
    workflowTimeoutMs,
  );
}

async function assertEasyButtonHostUnfocused(client, label) {
  const state = await client.driver("easyButtonPaneState");
  const host = requireEasyButtonHost(state, label);
  if (host.focused === "true") {
    throw new Error(`Easy Button pane remained focused ${label}: ${JSON.stringify(state)}`);
  }
}

async function exitOverview(client) {
  await client.installDriver();
  await clickEnabledButtonByAria(client, "Exit overview", workflowTimeoutMs);
  await waitForState(
    client,
    driverCallExpression("easyButtonPaneState"),
    (state) => state.presentationMode === "normal" && state.hosts[0]?.surfaceFrozen === "false",
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonPane(client) {
  await client.installDriver();
  const isSettledEasyButtonPaneReady = settledEasyButtonPaneReadyPredicate();
  return waitForState(
    client,
    driverCallExpression("easyButtonPaneState"),
    isSettledEasyButtonPaneReady,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonPaneCount(client, count) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("easyButtonPaneState"),
    (state) => state.count === count,
    workflowTimeoutMs,
  );
}

async function waitForPersistedEasyButtonLayout(client, expectedWorkspaceId) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("readPersistedEasyButtonLayout", { workspaceId: expectedWorkspaceId }),
    (state) => persistedEasyButtonLayoutReady(state, expectedWorkspaceId),
    workflowTimeoutMs,
  );
}

function assertEasyButtonPaneReady(state, label) {
  const host = requireEasyButtonHost(state, label);
  assertEasyButtonChrome(host, state, label);
  assertEasyButtonGlowRunning(host, state, label);
  assertEasyButtonIdleOnly(host, state, label);
  assertEasyButtonProportionColumnWidth(host, state, label);
}

function persistedEasyButtonLayoutReady(state, expectedWorkspaceId) {
  return (
    JSON.stringify(persistedEasyButtonLayoutProjection(state)) ===
    JSON.stringify([expectedWorkspaceId, 1, "Easy Button", "cyan", "proportion", 1])
  );
}

function persistedEasyButtonLayoutProjection(state) {
  const pane = state.pane ?? {};
  const column = state.column ?? {};
  const widthSpec = column.widthSpec ?? {};
  return [state.workspaceId, state.count, pane.title, pane.tone, widthSpec.unit, widthSpec.value];
}

function requireEasyButtonHost(state, label) {
  const host = state.hosts[0];
  if (host) {
    return host;
  }
  throw new Error(`Easy Button pane missing after ${label}: ${JSON.stringify(state)}`);
}

function assertEasyButtonChrome(host, state, label) {
  if (host.title !== "Easy Button" || host.chromeIconViewBox !== "0 0 16 16") {
    throw new Error(`Easy Button chrome mismatch after ${label}: ${JSON.stringify(state)}`);
  }
}

function assertEasyButtonGlowRunning(host, state, label) {
  if (
    host.glowAnimationName !== easyButtonGlowAnimationName ||
    host.glowAnimationPlayState !== "running"
  ) {
    throw new Error(`Easy Button glow was not running after ${label}: ${JSON.stringify(state)}`);
  }
}

function assertEasyButtonIdleOnly(host, state, label) {
  if (host.railLabelsVisible !== 0 || host.hasFooterInput || host.hasMicGlyph) {
    throw new Error(
      `Easy Button idle-only contract mismatch after ${label}: ${JSON.stringify(state)}`,
    );
  }
}

function assertEasyButtonProportionColumnWidth(host, state, label) {
  if (!easyButtonPaneFullyInsideWorkspaceArea(host, state)) {
    throw new Error(
      `Easy Button pane was not fully visible after ${label}: ${JSON.stringify(state)}`,
    );
  }
  const insets = layoutViewportInsetsForHost(host, state);
  if (!numbersWithinTolerance(insets.left, insets.right, geometryTolerancePx)) {
    throw new Error(`Easy Button column insets mismatch after ${label}: ${JSON.stringify(state)}`);
  }
  const expectedWidth = resolvedProportionColumnWidth({
    proportion: 1,
    scenePadding: insets.left,
    viewportWidth: state.layoutViewport.width,
  });
  if (!numbersWithinTolerance(host.rect.width, expectedWidth, geometryTolerancePx)) {
    throw new Error(
      `Easy Button column width mismatch after ${label}: expected ${expectedWidth}, got ${host.rect.width}: ${JSON.stringify(state)}`,
    );
  }
}

function settledEasyButtonPaneReadyPredicate() {
  let previousRect = null;
  let settledPolls = 0;
  return (state) => {
    const host = state.hosts[0];
    if (!easyButtonPaneContentReady(host, state)) {
      previousRect = null;
      settledPolls = 0;
      return false;
    }
    const stable = previousRect !== null && rectsWithinTolerance(host.rect, previousRect);
    previousRect = { ...host.rect };
    if (!stable || !easyButtonPaneFullyInsideWorkspaceArea(host, state)) {
      settledPolls = 0;
      return false;
    }
    settledPolls += 1;
    return settledPolls >= settledGeometryPolls;
  };
}

function easyButtonPaneContentReady(host, state) {
  return (
    state.count === 1 &&
    state.surfaceCount === 1 &&
    host?.title === "Easy Button" &&
    host.helperText === "Easy Button"
  );
}

function easyButtonPaneFullyInsideWorkspaceArea(host, state) {
  return (
    host.rect.left >= state.areaRect.left - geometryTolerancePx &&
    host.rect.right <= state.areaRect.right + geometryTolerancePx
  );
}

function layoutViewportInsetsForHost(host, state) {
  const viewportLeft = state.stageRect.left + state.layoutViewport.x;
  const viewportRight = viewportLeft + state.layoutViewport.width;
  return {
    left: host.rect.left - viewportLeft,
    right: viewportRight - host.rect.right,
  };
}

function resolvedProportionColumnWidth({ proportion, scenePadding, viewportWidth }) {
  return Math.max(
    minimumColumnWidthPx,
    Math.round(availableWidthForLayoutEngine(viewportWidth, scenePadding) * proportion),
  );
}

function availableWidthForLayoutEngine(viewportWidth, scenePadding) {
  return Math.max(minimumColumnWidthPx, viewportWidth - scenePadding * 2);
}

function rectsWithinTolerance(left, right) {
  return (
    numbersWithinTolerance(left.left, right.left, geometryTolerancePx) &&
    numbersWithinTolerance(left.right, right.right, geometryTolerancePx) &&
    numbersWithinTolerance(left.width, right.width, geometryTolerancePx)
  );
}

function numbersWithinTolerance(left, right, tolerance) {
  return Math.abs(left - right) <= tolerance;
}

async function safeEasyButtonState(client) {
  try {
    return await client.driver("easyButtonPaneState");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function paneTopBarClickPointExpression(selector) {
  return `(() => {
    const topBars = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(
      (candidate) => candidate instanceof HTMLElement,
    );
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    for (const topBar of topBars) {
      const rect = topBar.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        x < 0 ||
        y < 0 ||
        x > viewportWidth ||
        y > viewportHeight
      ) {
        continue;
      }
      const hit = document.elementFromPoint(x, y);
      if (!hit || !topBar.contains(hit)) {
        continue;
      }
      return {
        ok: true,
        selector: ${JSON.stringify(selector)},
        x,
        y,
      };
    }
    return {
      candidateCount: topBars.length,
      ok: false,
      reason: "missing-clickable-pane-top-bar",
      selector: ${JSON.stringify(selector)},
    };
  })()`;
}

function shortcutFocusStateExpression() {
  return `(() => {
    const element = document.activeElement;
    const tagName = element instanceof HTMLElement ? element.tagName : "";
    return {
      className: element instanceof HTMLElement ? String(element.className) : "",
      editable: tagName === "TEXTAREA" || tagName === "INPUT",
      id: element instanceof HTMLElement ? element.id : "",
      tagName,
      type: element instanceof HTMLInputElement ? element.type : "",
    };
  })()`;
}
