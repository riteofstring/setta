#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";

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
const desktopViewport = { deviceScaleFactor: 1, height: 900, mobile: false, width: 1440 };
const mobileViewport = { deviceScaleFactor: 1, height: 700, mobile: false, width: 390 };

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/mobile-layout-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("mobile-layout-workflow");
await writeLatestRecordingPointer("mobile-layout-workflow", artifactDir);
const fixture = await createElectronFixture("mobile-layout-workflow");
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
  await context.client.call("Emulation.setDeviceMetricsOverride", desktopViewport);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await ensureWorkspaceOpen(context.client);

  await context.client.call("Emulation.setDeviceMetricsOverride", mobileViewport);
  await waitForCompactLayout(context.client, true);
  const mobileChrome = await waitForMobileChrome(context.client);
  const fullScreenPane = await waitForFullScreenFocusedPane(context.client);
  await captureScreenshot(context.client, join(artifactDir, "mobile-layout.png"));

  const focusSteps = await exerciseFocusNavigation(context.client);
  const projectPane = await exerciseProjectPaneOverlay(context.client, artifactDir);
  const overview = await exerciseOverviewToggle(context.client);
  const newFrame = await exerciseNewFrameButton(context.client);

  await context.client.call("Emulation.setDeviceMetricsOverride", desktopViewport);
  await waitForCompactLayout(context.client, false);
  const desktopChrome = await waitForState(
    context.client,
    chromeStateExpression(),
    (state) => state.chromePlate && state.toolbar && !state.mobileBar,
    workflowTimeoutMs,
  );
  await captureScreenshot(context.client, join(artifactDir, "desktop-restored.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    desktopChrome,
    focusSteps,
    fullScreenPane,
    mobileChrome,
    newFrame,
    overview,
    projectPane,
    status: "passed",
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron mobile layout workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-state.json"), {
      state: await safeChromeState(context.client),
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
  if (currentWorkspaceId && !currentWorkspaceId.endsWith(":empty")) {
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
    (workspaceId) => workspaceId !== "" && !workspaceId.endsWith(":empty"),
    workflowTimeoutMs,
  );
}

async function waitForCompactLayout(client, expectedCompact) {
  await waitForState(
    client,
    `(() =>
      document
        .querySelector('[data-testid="workspace-layout-area"]')
        ?.getAttribute("data-compact-layout") ?? ""
    )()`,
    (value) => value === String(expectedCompact),
    workflowTimeoutMs,
  );
}

// The mobile chrome contract: bottom control bar in, top-left plate, top-left
// toolbar, side project pane, and per-pane top-right action buttons out.
async function waitForMobileChrome(client) {
  return waitForState(
    client,
    chromeStateExpression(),
    (state) =>
      state.mobileBar &&
      !state.chromePlate &&
      !state.toolbar &&
      !state.projectPaneOverlay &&
      !state.sideProjectPane &&
      state.paneActionStripHidden,
    workflowTimeoutMs,
  );
}

async function waitForFullScreenFocusedPane(client) {
  return waitForState(
    client,
    `(() => {
      const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
      const pane = document.querySelector(
        '[data-testid="workspace-pane-host"][data-focused="true"][data-visible="true"]',
      );
      if (!(stage instanceof Element) || !(pane instanceof Element)) {
        return null;
      }
      const stageRect = stage.getBoundingClientRect();
      const paneRect = pane.getBoundingClientRect();
      return {
        paneHeight: paneRect.height,
        paneLeft: paneRect.left - stageRect.left,
        paneTop: paneRect.top - stageRect.top,
        paneWidth: paneRect.width,
        stageHeight: stageRect.height,
        stageWidth: stageRect.width,
      };
    })()`,
    (state) =>
      state !== null &&
      state.stageHeight > 0 &&
      Math.abs(state.paneWidth - state.stageWidth) <= 1 &&
      Math.abs(state.paneHeight - state.stageHeight) <= 1 &&
      Math.abs(state.paneLeft) <= 1 &&
      Math.abs(state.paneTop) <= 1,
    workflowTimeoutMs,
  );
}

async function exerciseFocusNavigation(client) {
  const initialPaneId = await focusedPaneId(client);
  await clickTestId(client, "workspace-mobile-focus-right");
  const movedPaneId = await waitForState(
    client,
    focusedPaneIdExpression(),
    (paneId) => paneId !== "" && paneId !== initialPaneId,
    workflowTimeoutMs,
  );
  await clickTestId(client, "workspace-mobile-focus-left");
  const restoredPaneId = await waitForState(
    client,
    focusedPaneIdExpression(),
    (paneId) => paneId === initialPaneId,
    workflowTimeoutMs,
  );
  return { initialPaneId, movedPaneId, restoredPaneId };
}

async function exerciseProjectPaneOverlay(client, artifactDir) {
  await clickTestId(client, "workspace-mobile-project-toggle");
  await waitForState(
    client,
    projectPaneOverlayExpression(),
    (overlay) => overlay !== null && overlay.fullWidth,
    workflowTimeoutMs,
  );
  const open = await client.evaluate(projectPaneOverlayExpression());
  await captureScreenshot(client, join(artifactDir, "mobile-project-pane.png"));
  await clickTestId(client, "workspace-mobile-project-toggle");
  await waitForState(
    client,
    projectPaneOverlayExpression(),
    (overlay) => overlay === null,
    workflowTimeoutMs,
  );
  return { open };
}

async function exerciseOverviewToggle(client) {
  await clickTestId(client, "workspace-mobile-overview");
  const overviewMode = await waitForState(
    client,
    presentationModeExpression(),
    (mode) => mode === "overview",
    workflowTimeoutMs,
  );
  await clickTestId(client, "workspace-mobile-overview");
  const normalMode = await waitForState(
    client,
    presentationModeExpression(),
    (mode) => mode === "normal",
    workflowTimeoutMs,
  );
  return { normalMode, overviewMode };
}

async function exerciseNewFrameButton(client) {
  const beforeCount = await paneCount(client);
  await clickTestId(client, "workspace-mobile-new-frame");
  const afterCount = await waitForState(
    client,
    paneCountExpression(),
    (count) => count === beforeCount + 1,
    workflowTimeoutMs,
  );
  return { afterCount, beforeCount };
}

async function clickTestId(client, testId) {
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="${testId}"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`mobile control button was not clickable: ${testId}`);
  }
}

async function focusedPaneId(client) {
  return client.evaluate(focusedPaneIdExpression());
}

async function paneCount(client) {
  return client.evaluate(paneCountExpression());
}

function chromeStateExpression() {
  return `(() => {
    const actionStrip = document.querySelector(
      '[data-testid="workspace-pane-host"][data-visible="true"] .workspace-pane-action-strip',
    );
    return {
      chromePlate: Boolean(document.querySelector('[data-testid="shell-chrome-plate"]')),
      mobileBar: Boolean(document.querySelector('[data-testid="workspace-mobile-bar"]')),
      paneActionStripHidden:
        actionStrip instanceof Element ? getComputedStyle(actionStrip).display === "none" : false,
      projectPaneOverlay: Boolean(document.querySelector('[data-testid="mobile-project-pane"]')),
      sideProjectPane: Boolean(
        document.querySelector('[aria-label="Resize project sidebar"]'),
      ),
      toolbar: Boolean(document.querySelector('[data-testid="workspace-toolbar"]')),
    };
  })()`;
}

function projectPaneOverlayExpression() {
  return `(() => {
    const overlay = document.querySelector('[data-testid="mobile-project-pane"]');
    if (!(overlay instanceof Element)) {
      return null;
    }
    const rect = overlay.getBoundingClientRect();
    return {
      fullWidth: Math.abs(rect.width - window.innerWidth) <= 1 && rect.left === 0 && rect.top === 0,
      height: rect.height,
      width: rect.width,
    };
  })()`;
}

function presentationModeExpression() {
  return `(() =>
    document
      .querySelector('[data-testid="workspace-layout-area"]')
      ?.getAttribute("data-presentation-mode") ?? ""
  )()`;
}

function focusedPaneIdExpression() {
  return `(() =>
    document
      .querySelector('[data-testid="workspace-pane-host"][data-focused="true"][data-visible="true"]')
      ?.getAttribute("data-pane-id") ?? ""
  )()`;
}

function paneCountExpression() {
  return `(() =>
    Number.parseInt(
      document
        .querySelector('[data-testid="workspace-layout-area"]')
        ?.getAttribute("data-pane-count") ?? "0",
      10,
    )
  )()`;
}

function workspaceIdExpression() {
  return `(() => document.querySelector('[data-testid="workspace-layout-area"]')?.getAttribute('data-workspace-id') ?? "")()`;
}

async function safeChromeState(client) {
  try {
    return await client.evaluate(chromeStateExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
