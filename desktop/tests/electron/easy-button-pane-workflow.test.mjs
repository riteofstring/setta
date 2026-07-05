#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
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
const workflowName = "easy-button-pane";
const workflowTimeoutMs = 25_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/easy-button-pane-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
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
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await ensureWorkspaceOpen(context.client);

  await openEasyButtonFromToolbar(context.client);
  const toolbarOpen = await waitForEasyButtonPane(context.client);
  assertFullWidthColumn(toolbarOpen);
  assertIdleVisual(toolbarOpen);
  await captureScreenshot(context.client, join(artifactDir, "easy-button-toolbar-open.png"));

  await closeEasyButtonPane(context.client, toolbarOpen.paneId);
  await waitForNoEasyButtonPane(context.client);
  await openEasyButtonFromShortcut(context.client);
  const shortcutOpen = await waitForEasyButtonPane(context.client);
  assertFullWidthColumn(shortcutOpen);
  assertIdleVisual(shortcutOpen);
  await captureScreenshot(context.client, join(artifactDir, "easy-button-shortcut-open.png"));

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const restored = await waitForEasyButtonPane(context.client);
  assertFullWidthColumn(restored);
  assertIdleVisual(restored);

  await forceEasyButtonFrozenAttribute(context.client);
  const frozen = await waitForEasyButtonFrozen(context.client);
  if (frozen.buttonAnimationPlayState !== "paused") {
    throw new Error(`easy-button animation was not paused while frozen: ${JSON.stringify(frozen)}`);
  }
  await captureScreenshot(context.client, join(artifactDir, "easy-button-frozen.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    frozen,
    restored,
    shortcutOpen,
    status: "passed",
    toolbarOpen,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron easy button pane workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      easyButton: await safeEasyButtonState(context.client),
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

async function openEasyButtonFromToolbar(client) {
  await clickEnabledButtonByAria(client, "New frame", workflowTimeoutMs);
  const clicked = await client.driver("easyButtonPaneClickToolbarAction");
  if (!clicked) {
    throw new Error("easy button toolbar action was not clickable");
  }
}

async function openEasyButtonFromShortcut(client) {
  const dispatched = await client.driver("easyButtonPaneOpenShortcut");
  if (!dispatched) {
    throw new Error("easy button shortcut was not dispatched");
  }
}

async function closeEasyButtonPane(client, paneId) {
  const closed = await client.driver("easyButtonPaneClose", { paneId });
  if (!closed) {
    throw new Error(`easy button pane close action was not clickable: ${paneId}`);
  }
}

async function forceEasyButtonFrozenAttribute(client) {
  const frozen = await client.driver("easyButtonPaneForceFrozen");
  if (!frozen) {
    throw new Error("easy button pane host was not available for frozen CSS verification");
  }
}

function assertFullWidthColumn(state) {
  if (state.layoutWidthSpec?.unit !== "proportion" || state.layoutWidthSpec.value !== 1) {
    throw new Error(
      `easy-button pane did not persist a full-width column spec: ${JSON.stringify(state)}`,
    );
  }
  if (state.widthRatio < 0.75) {
    throw new Error(
      `easy-button pane was not opened as a full-width column: ${JSON.stringify(state)}`,
    );
  }
}

function assertIdleVisual(state) {
  if (state.easyState !== "idle" || !state.buttonVisible || state.railText !== "") {
    throw new Error(`easy-button idle visual did not match Phase 1: ${JSON.stringify(state)}`);
  }
  if (state.buttonAnimationName !== "easy-button-glow-breathe") {
    throw new Error(`easy-button idle glow animation was missing: ${JSON.stringify(state)}`);
  }
}

async function waitForEasyButtonPane(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "idle" &&
      state.buttonVisible,
    workflowTimeoutMs,
  );
}

async function waitForNoEasyButtonPane(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) => !state.exists,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonFrozen(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) => state.exists && state.hostFrozen === "true",
    workflowTimeoutMs,
  );
}

async function safeEasyButtonState(client) {
  try {
    return await client.evaluate(easyButtonStateExpression());
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

function easyButtonStateExpression() {
  return driverCallExpression("easyButtonPaneState");
}
