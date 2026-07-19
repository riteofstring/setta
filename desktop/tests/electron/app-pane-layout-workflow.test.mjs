#!/usr/bin/env node
/* global console */

import { realpath } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  clickEnabledButtonByAria,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForState,
  waitForSelector,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "app-pane-layout";
const workflowTimeoutMs = 20_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/app-pane-layout-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
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
    fixture,
    visible: options.visible,
  });
  await context.client.installDriver();
  const result = await waitForState(
    context.client,
    driverCallExpression("appPaneLayoutRoundTrip"),
    (state) => state.status === "passed" || state.status === "failed",
    workflowTimeoutMs,
  );
  if (result.status !== "passed") {
    throw new Error(`app pane layout workflow failed: ${JSON.stringify(result)}`);
  }
  const workspaceId = await ensureWorkspaceOpen(context.client);
  await context.client.evaluate(
    `window.setta.appLayout.savePaneLayout(${JSON.stringify(shellAppPaneLayout())})`,
  );
  await context.client.call("Page.reload", { ignoreCache: true });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]', workflowTimeoutMs);
  await context.client.installDriver();
  const restoredShell = await waitForState(
    context.client,
    driverCallExpression("appPaneLayoutShellState"),
    (state) => shellLayoutRestored(state, workspaceId),
    workflowTimeoutMs,
  );
  const click = await context.client.driver("appPaneLayoutClickFocusedMaximize");
  if (!click.clicked) {
    throw new Error(`app pane layout shell maximize click failed: ${JSON.stringify(click)}`);
  }
  const workspaceRoot = await realpath(fixture.workspaceRoot);
  const persistedShell = await waitForState(
    context.client,
    shellPersistedReadExpression(workspaceRoot),
    appLayoutShellPersisted,
    workflowTimeoutMs,
  );

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    focusedPaneId: result.readBack.layout.focusedPaneId,
    persistedShell,
    restoredShell,
    status: "passed",
    workspaceId,
  });
  console.log(`Electron app pane layout workflow passed: ${artifactDir}`);
} catch (error) {
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  }).catch(() => {});
  throw error;
} finally {
  await stopElectronCdpContext(context);
}

async function ensureWorkspaceOpen(client) {
  const current = await waitForState(
    client,
    driverCallExpression("appPaneLayoutShellState"),
    (state) => state.ready,
    workflowTimeoutMs,
  );
  if (validWorkspaceId(current.workspaceId)) {
    return current.workspaceId;
  }
  await clickEnabledButtonByAria(client, "Choose project folder", workflowTimeoutMs);
  const opened = await waitForState(
    client,
    driverCallExpression("appPaneLayoutShellState"),
    (state) => validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  return opened.workspaceId;
}

function validWorkspaceId(workspaceId) {
  return workspaceId !== "" && workspaceId !== "empty";
}

function shellLayoutRestored(state, workspaceId) {
  return (
    state.ready &&
    state.workspaceId === workspaceId &&
    state.paneCount === "2" &&
    state.maximizedPaneId === "app_shell_conversation" &&
    state.hosts.some(
      (host) =>
        host.paneId === "app_shell_conversation" &&
        host.focused === "true" &&
        host.maximized === "true" &&
        host.surfaceKind === "easy-button",
    )
  );
}

function shellPersistedReadExpression(workspaceRoot) {
  return `(async () => {
    const read = await window.setta.appLayout.readPaneLayout();
    const layout = read.layout;
    const conversation = layout?.panes?.find((pane) => pane.paneId === "app_shell_conversation");
    return {
      focusedPaneId: layout?.focusedPaneId ?? "",
      maximizedPaneId: layout ? layout.maximizedPaneId : "__missing__",
      resourceRoot: conversation?.conversationConfig?.resourceBindings?.[0]?.folder?.rootPath ?? "",
      surfaceKind: conversation?.surfaceKind ?? "",
      workspaceRoot: ${JSON.stringify(workspaceRoot)}
    };
  })()`;
}

function appLayoutShellPersisted(state) {
  return (
    state.focusedPaneId === "app_shell_conversation" &&
    state.maximizedPaneId === null &&
    state.resourceRoot === state.workspaceRoot &&
    state.surfaceKind === "conversation"
  );
}

function shellAppPaneLayout() {
  return {
    columns: [
      {
        columnId: "app_shell_column_master",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 0,
        paneIds: ["app_shell_master"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "px", value: 520 },
      },
      {
        columnId: "app_shell_column_0",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 1,
        paneIds: ["app_shell_empty"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "px", value: 520 },
      },
      {
        columnId: "app_shell_column_1",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 2,
        paneIds: ["app_shell_conversation"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 1,
        widthSpec: { unit: "px", value: 520 },
      },
    ],
    focusedPaneId: "app_shell_conversation",
    maximizedPaneId: "app_shell_conversation",
    panes: [
      {
        columnId: "app_shell_column_master",
        conversationConfig: null,
        heat: 0,
        masterConfig: {},
        paneId: "app_shell_master",
        sequence: 0,
        subtitle: "Global coordinator",
        surfaceId: "app_shell_surface_master",
        surfaceKind: "master",
        title: "Setta",
        tone: "slate",
        weight: 1,
      },
      {
        columnId: "app_shell_column_0",
        conversationConfig: null,
        heat: 0,
        masterConfig: null,
        paneId: "app_shell_empty",
        sequence: 0,
        subtitle: "Shell fixture",
        surfaceId: "app_shell_surface_empty",
        surfaceKind: "empty-frame",
        title: "Shell Frame",
        tone: "slate",
        weight: 1,
      },
      {
        columnId: "app_shell_column_1",
        conversationConfig: {
          conversationId: "conversation_shell_workflow",
          presentationIdentity: {
            subtitle: "Topic conversation",
            title: "Shell workflow topic",
            tone: "cyan",
          },
          resourceBindings: [],
        },
        heat: 37,
        masterConfig: null,
        paneId: "app_shell_conversation",
        sequence: 1,
        subtitle: "Topic conversation",
        surfaceId: "app_shell_surface_conversation",
        surfaceKind: "conversation",
        title: "Shell workflow topic",
        tone: "cyan",
        weight: 1,
      },
    ],
    schemaVersion: 1,
  };
}
