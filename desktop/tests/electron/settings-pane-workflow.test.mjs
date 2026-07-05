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

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowTimeoutMs = 25_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/settings-pane-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("settings-pane-workflow");
await writeLatestRecordingPointer("settings-pane-workflow", artifactDir);
const fixture = await createElectronFixture("settings-pane-workflow");
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
  const workspaceId = await ensureWorkspaceOpen(context.client);

  await closeDefaultGraphAndSettingsPanes(context.client, workspaceId);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const beforeOpen = await waitForLayoutWithoutSettings(context.client, workspaceId);
  await captureScreenshot(context.client, join(artifactDir, "before-settings-open.png"));

  await clickSettingsButton(context.client);
  const afterOpen = await waitForSettingsPanel(context.client);
  await captureScreenshot(context.client, join(artifactDir, "after-settings-open.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    afterOpen,
    artifactDir,
    beforeOpen,
    status: "passed",
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron settings pane workflow passed: ${artifactDir}`);
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

async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return currentWorkspaceId;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  return waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    workflowTimeoutMs,
  );
}

async function closeDefaultGraphAndSettingsPanes(client, workspaceId) {
  const result = await client.evaluate(`(async () => {
    const paneOperation = ${paneOperationExpression()};
    await window.setta.workspace.applyUIPaneOperation(
      ${JSON.stringify(workspaceId)},
      paneOperation("close_pane", "workspace_pane_3", { close: { surfaceClose: "none" } }),
    );
    await window.setta.workspace.applyUIPaneOperation(
      ${JSON.stringify(workspaceId)},
      paneOperation("close_pane", "workspace_pane_2", { close: { surfaceClose: "none" } }),
    );
    return true;
  })()`);
  if (!result) {
    throw new Error("workspace graph/settings panes were not closed");
  }
}

async function waitForLayoutWithoutSettings(client, workspaceId) {
  return waitForState(
    client,
    settingsStateExpression(),
    (state) =>
      state.workspaceId === workspaceId &&
      state.paneCount === 2 &&
      !state.surfaceKinds.includes("settings-dom") &&
      !state.settingsPanelReady,
    workflowTimeoutMs,
  );
}

async function clickSettingsButton(client) {
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Open settings"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error("settings button was not clickable");
  }
}

async function waitForSettingsPanel(client) {
  return waitForState(
    client,
    settingsStateExpression(),
    (state) =>
      state.paneCount === 3 &&
      state.focusedSurfaceKind === "settings-dom" &&
      state.surfaceKinds.includes("settings-dom") &&
      state.settingsPanelReady,
    workflowTimeoutMs,
  );
}

async function safeSettingsState(client) {
  try {
    return await client.evaluate(settingsStateExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function settingsStateExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const hosts = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((host) =>
        host instanceof HTMLElement &&
        host.dataset.visible === "true" &&
        (host.dataset.surfaceKind ?? "") !== ""
      );
    const focused = hosts.find((host) => host.dataset.focused === "true");
    return {
      focusedSurfaceKind: focused?.dataset.surfaceKind ?? "",
      paneCount: Number(area instanceof HTMLElement ? area.dataset.paneCount ?? "0" : "0"),
      settingsPanelReady: Boolean(document.querySelector("#settings-subtab-theme")),
      surfaceKinds: hosts.map((host) => host.dataset.surfaceKind ?? ""),
      workspaceId: area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "",
    };
  })()`;
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function paneOperationExpression() {
  return `((kind, paneId, fields = {}) => ({
    close: null,
    configure: null,
    kind,
    move: null,
    open: null,
    paneId,
    rename: null,
    reorder: null,
    resize: null,
    resizeColumn: null,
    ...fields,
  }))`;
}
