#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
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

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowTimeoutMs = 25_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/settings-page-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("settings-page-workflow");
await writeLatestRecordingPointer("settings-page-workflow", artifactDir);
const fixture = await createElectronFixture("settings-page-workflow");
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const emptyBeforeOpen = await waitForEmptyWorkspace(context.client);
  await clickSettingsButton(context.client);
  const noWorkspaceSettings = await waitForSettingsPageWithoutWorkspace(context.client);
  await captureScreenshot(context.client, join(artifactDir, "no-workspace-settings-open.png"));
  await clickBackToWorkspace(context.client);
  await waitForEmptyWorkspaceRestored(context.client, emptyBeforeOpen);

  const workspaceId = await ensureWorkspaceOpen(context.client);

  await persistLayoutWithoutSettings(context.client, workspaceId);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const beforeOpen = await waitForLayoutWithoutSettings(context.client, workspaceId);
  await captureScreenshot(context.client, join(artifactDir, "before-settings-open.png"));

  await clickSettingsButton(context.client);
  const afterOpen = await waitForSettingsPage(context.client, beforeOpen);
  await captureScreenshot(context.client, join(artifactDir, "after-settings-open.png"));

  await clickBackToWorkspace(context.client);
  const afterBack = await waitForWorkspaceRestored(context.client, beforeOpen);
  await captureScreenshot(context.client, join(artifactDir, "after-settings-back.png"));

  await openBrowserPane(context.client);
  const browserOpened = await waitForBrowserPane(context.client, workspaceId, afterBack);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const browserRestored = await waitForBrowserLayoutRestored(context.client, browserOpened);
  await captureScreenshot(context.client, join(artifactDir, "browser-restored.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    afterOpen,
    afterBack,
    artifactDir,
    beforeOpen,
    browserOpened,
    browserRestored,
    noWorkspaceSettings,
    status: "passed",
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron settings page workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      state: await safeSettingsState(context.client),
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

async function waitForEmptyWorkspace(client) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.emptyWorkspaceVisible &&
      state.workspaceId === "" &&
      state.paneCount === 0 &&
      !state.settingsPageOpen &&
      !state.workspaceShellHidden,
    workflowTimeoutMs,
  );
}

async function waitForSettingsPageWithoutWorkspace(client) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.emptyWorkspaceVisible &&
      state.workspaceId === "" &&
      state.paneCount === 0 &&
      state.settingsPageOpen &&
      state.settingsPanelReady &&
      state.workspaceShellHidden &&
      state.workspaceShellInert,
    workflowTimeoutMs,
  );
}

async function waitForEmptyWorkspaceRestored(client, beforeOpen) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.workspaceId === beforeOpen.workspaceId &&
      state.paneCount === beforeOpen.paneCount &&
      state.emptyWorkspaceVisible &&
      !state.settingsPageOpen &&
      !state.settingsPanelReady &&
      !state.workspaceShellHidden &&
      !state.workspaceShellInert,
    workflowTimeoutMs,
  );
}

async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = (await client.driver("settingsPageState")).workspaceId;
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return currentWorkspaceId;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  const opened = await waitForState(
    client,
    settingsPageStateExpression(),
    (state) => state.workspaceId !== "" && state.workspaceId !== "empty",
    workflowTimeoutMs,
  );
  return opened.workspaceId;
}

async function persistLayoutWithoutSettings(client, workspaceId) {
  const result = await client.evaluate(`(async () => {
    await window.setta.workspace.saveUILayout(${JSON.stringify(layoutWithoutSettings(workspaceId))});
    return true;
  })()`);
  if (!result) {
    throw new Error("workspace UI layout was not persisted");
  }
}

async function waitForLayoutWithoutSettings(client, workspaceId) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.workspaceId === workspaceId &&
      state.paneCount === 2 &&
      state.paneIds.length === 2 &&
      !state.settingsPageOpen &&
      !state.settingsPanelReady,
    workflowTimeoutMs,
  );
}

async function clickSettingsButton(client) {
  const result = await client.driver("settingsPageClickSettingsButton");
  if (!result.clicked) {
    throw new Error("settings button was not clickable");
  }
}

async function waitForSettingsPage(client, beforeOpen) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) => sameWorkspaceLayout(state, beforeOpen) && settingsPageVisible(state),
    workflowTimeoutMs,
  );
}

async function clickBackToWorkspace(client) {
  const result = await client.driver("settingsPageClickBack");
  if (!result.clicked) {
    throw new Error("Back to workspace button was not clickable");
  }
}

async function waitForWorkspaceRestored(client, beforeOpen) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.workspaceId === beforeOpen.workspaceId &&
      state.paneCount === beforeOpen.paneCount &&
      sameList(state.paneIds, beforeOpen.paneIds) &&
      state.focusedPaneId === beforeOpen.focusedPaneId &&
      !state.settingsPageOpen &&
      !state.settingsPanelReady &&
      !state.workspaceShellHidden &&
      !state.workspaceShellInert &&
      !state.nativeViewOverlayActive,
    workflowTimeoutMs,
  );
}

async function openBrowserPane(client) {
  await clickEnabledButtonByAria(client, "New frame", workflowTimeoutMs);
  await waitForState(
    client,
    driverCallExpression("settingsPageOpenBrowserPane"),
    (result) => result.clicked,
    workflowTimeoutMs,
  );
}

async function waitForBrowserPane(client, workspaceId, beforeOpen) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) => browserPaneAdded(state, workspaceId, beforeOpen),
    workflowTimeoutMs,
  );
}

async function waitForBrowserLayoutRestored(client, expected) {
  return waitForState(
    client,
    settingsPageStateExpression(),
    (state) =>
      state.workspaceId === expected.workspaceId &&
      state.paneCount === expected.paneCount &&
      sameUnorderedList(state.paneIds, expected.paneIds) &&
      countSurfaceKind(state, "browser") === countSurfaceKind(expected, "browser") &&
      state.browserVisible &&
      !state.layoutRecoveryVisible,
    workflowTimeoutMs,
  );
}

async function safeSettingsState(client) {
  try {
    return await client.driver("settingsPageState");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function settingsPageStateExpression() {
  return driverCallExpression("settingsPageState");
}

function sameList(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameUnorderedList(left, right) {
  return (
    Array.isArray(left) && Array.isArray(right) && sameList([...left].sort(), [...right].sort())
  );
}

function sameWorkspaceLayout(state, expected) {
  return (
    state.workspaceId === expected.workspaceId &&
    state.paneCount === expected.paneCount &&
    sameList(state.paneIds, expected.paneIds) &&
    state.focusedPaneId === expected.focusedPaneId
  );
}

function settingsPageVisible(state) {
  return (
    state.settingsPageOpen &&
    state.settingsPanelReady &&
    state.settingsBackVisible &&
    state.workspaceShellHidden &&
    state.workspaceShellInert &&
    state.nativeViewOverlayActive
  );
}

function browserPaneAdded(state, workspaceId, beforeOpen) {
  return (
    state.workspaceId === workspaceId &&
    countSurfaceKind(state, "browser") > countSurfaceKind(beforeOpen, "browser") &&
    state.browserVisible &&
    !state.layoutRecoveryVisible
  );
}

function countSurfaceKind(state, surfaceKind) {
  return Array.isArray(state.surfaceKinds)
    ? state.surfaceKinds.filter((kind) => kind === surfaceKind).length
    : 0;
}

function layoutWithoutSettings(workspaceId) {
  return {
    columns: [
      storedColumn("workspace_column_0", 0, ["workspace_pane_0"]),
      storedColumn("workspace_column_1", 1, ["workspace_pane_1"]),
    ],
    focusedPaneId: "workspace_pane_0",
    panes: [
      storedPane({
        columnId: "workspace_column_0",
        paneId: "workspace_pane_0",
        sequence: 0,
        subtitle: "empty workspace pane",
        surfaceId: "workspace_surface_0",
        surfaceKind: "empty-frame",
        title: "Empty Frame 1",
        tone: "cyan",
        weight: 1.6,
      }),
      storedPane({
        columnId: "workspace_column_1",
        paneId: "workspace_pane_1",
        sequence: 1,
        subtitle: "empty workspace pane",
        surfaceId: "workspace_surface_1",
        surfaceKind: "empty-frame",
        title: "Empty Frame 2",
        tone: "green",
        weight: 1,
      }),
    ],
    schemaVersion: 1,
    workspaceId,
  };
}

function storedColumn(columnId, index, paneIds) {
  return {
    columnId,
    idealWidthSpec: { unit: "px", value: 520 },
    index,
    paneIds,
    planeIndex: 0,
    previousProportionWidth: null,
    slotIndex: index,
    widthSpec: { unit: "px", value: 520 },
  };
}

function storedPane(pane) {
  return {
    ...pane,
    easyButtonConfig: null,
    heat: (pane.sequence * 37) % 100,
  };
}
