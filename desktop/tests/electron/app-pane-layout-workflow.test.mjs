#!/usr/bin/env node
/* global console */

import { realpath } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  createElectronFixture,
  launchElectronCdpContext,
  openFixtureWorkspace,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForState,
  waitForSelector,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { backendProbe } from "./electron-workflow-harness.mjs";

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
  const backend = await backendProbe(artifactDir);
  const workspaceRoot = await realpath(fixture.workspaceRoot);
  const opened = await backend.post("/workspaces/open", { rootPath: workspaceRoot });
  const conversationId = await createFixtureConversation(
    backend,
    opened.workspace.id,
    "Workflow topic",
  );
  const result = await waitForState(
    context.client,
    driverCallExpression("appPaneLayoutRoundTrip", { conversationId, workspaceRoot }),
    (state) => state.status === "passed" || state.status === "failed",
    workflowTimeoutMs,
  );
  if (result.status !== "passed") {
    throw new Error(`app pane layout workflow failed: ${JSON.stringify(result)}`);
  }
  const workspaceId = await ensureWorkspaceOpen(context.client);
  await context.client.evaluate(
    `window.setta.appLayout.savePaneLayout(${JSON.stringify(shellAppPaneLayout(workspaceRoot, conversationId))})`,
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
  const shortcut = await context.client.driver("appPaneLayoutPressMasterFocusShortcut");
  if (!shortcut.defaultPrevented) {
    throw new Error(`master pane focus shortcut was not handled: ${JSON.stringify(shortcut)}`);
  }
  const focusedMaster = await waitForState(
    context.client,
    driverCallExpression("appPaneLayoutMasterFocusState"),
    masterPaneFocusedByShortcut,
    workflowTimeoutMs,
  );
  const persistedShell = await waitForState(
    context.client,
    driverCallExpression("appPaneLayoutPersistedShellState", { workspaceRoot }),
    appLayoutShellPersisted,
    workflowTimeoutMs,
  );
  const folderlessConversation = await context.client.driver(
    "appPaneLayoutCreateFolderlessConversationFromMaster",
  );
  if (folderlessConversation.status !== "passed") {
    throw new Error(
      `master folderless conversation create failed: ${JSON.stringify(folderlessConversation)}`,
    );
  }

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    focusedMaster,
    folderlessConversation,
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
  await openFixtureWorkspace(client, workflowTimeoutMs);
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

async function createFixtureConversation(backend, workspaceId, title) {
  const snapshot = await backend.post("/conversations/create", { title, workspaceId });
  if (
    snapshot.conversation?.workspaceId !== workspaceId ||
    snapshot.conversation?.title !== title
  ) {
    throw new Error(`fixture conversation was not created: ${JSON.stringify(snapshot)}`);
  }
  return snapshot.conversation.id;
}

function shellLayoutRestored(state, workspaceId) {
  return (
    state.ready &&
    state.workspaceId === workspaceId &&
    state.paneCount === "3" &&
    state.maximizedPaneId === "app_shell_conversation" &&
    state.hosts.some(
      (host) => host.paneId === "app_shell_master" && host.surfaceKind === "master",
    ) &&
    state.hosts.some(
      (host) =>
        host.paneId === "app_shell_conversation" &&
        host.focused === "true" &&
        host.maximized === "true" &&
        host.surfaceKind === "conversation",
    )
  );
}

function appLayoutShellPersisted(state) {
  return (
    state.focusedPaneId === "app_shell_master" &&
    state.maximizedPaneId === "app_shell_master" &&
    state.resourceRoot === state.workspaceRoot &&
    state.surfaceKind === "conversation" &&
    state.columns.some(
      (column) =>
        column.columnId === "app_shell_column_master" &&
        column.index === 0 &&
        column.slotIndex === 0,
    ) &&
    state.columns.some(
      (column) =>
        column.columnId === "app_shell_column_0" && column.index === 1 && column.slotIndex === 1,
    ) &&
    state.columns.some(
      (column) =>
        column.columnId === "app_shell_column_1" && column.index === 2 && column.slotIndex === 2,
    )
  );
}

function masterPaneFocusedByShortcut(state) {
  return (
    state.ready &&
    state.maximizedPaneId === "app_shell_master" &&
    !state.masterOverlayOpen &&
    state.masterComposerFocused &&
    state.hosts.some(
      (host) =>
        host.paneId === "app_shell_master" &&
        host.focused === "true" &&
        host.maximized === "true" &&
        host.surfaceKind === "master",
    )
  );
}

function shellAppPaneLayout(workspaceRoot, conversationId) {
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
        slotIndex: 1,
        widthSpec: { unit: "px", value: 520 },
      },
      {
        columnId: "app_shell_column_1",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 2,
        paneIds: ["app_shell_conversation"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 2,
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
          conversationId,
          presentationIdentity: {
            subtitle: "Topic conversation",
            title: "Shell workflow topic",
            tone: "cyan",
          },
          resourceBindings: [{ folder: { rootPath: workspaceRoot }, kind: "folder" }],
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
