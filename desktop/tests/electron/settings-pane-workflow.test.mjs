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

  await persistLayoutWithoutSettings(context.client, workspaceId);
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
        subtitle: "workspace chat",
        surfaceId: "workspace_surface_0",
        surfaceKind: "chat-dom",
        title: "Chat",
        tone: "cyan",
        weight: 1.6,
      }),
      storedPane({
        columnId: "workspace_column_1",
        paneId: "workspace_pane_1",
        sequence: 1,
        subtitle: "workspace command surface",
        surfaceId: "workspace_surface_1",
        surfaceKind: "terminal",
        title: "Terminal",
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
    heat: (pane.sequence * 37) % 100,
    terminalConfig: null,
    workflowNodeDetailsConfig: null,
  };
}
