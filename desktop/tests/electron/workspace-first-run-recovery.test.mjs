#!/usr/bin/env node
/* global console */

import { mkdir, realpath, rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  dispatchKeyEvent,
  launchElectronCdpContext,
  openFixtureWorkspace,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "workspace-first-run-recovery";
const workflowTimeoutMs = 30_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/workspace-first-run-recovery.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
const firstLaunchDir = join(artifactDir, "first-run");
const missingLaunchDir = join(artifactDir, "missing-workspace");
const fixture = await createElectronFixture(workflowName);
const replacementRoot = join(fixture.tempRoot, "replacement-workspace-root");
await mkdir(replacementRoot, { recursive: true });
const replacementRootCanonical = await realpath(replacementRoot);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fakeCodex = await installFakeTopicCodex(fixture);
const providerEnv = {
  PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
  SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
};
let context = null;
let workspaceId;
let conversationId;

try {
  context = await launchElectronCdpContext({
    artifactDir: firstLaunchDir,
    extraEnv: providerEnv,
    fixture,
    visible: options.visible,
  });
  await prepareRenderer(context.client);
  let backend = await backendProbe(firstLaunchDir);

  const freshSession = await backend.get("/workspace-session");
  assertFreshSession(freshSession);
  await assertFirstRunSurface(context.client);
  await captureScreenshot(context.client, join(firstLaunchDir, "first-run-master-pane.png"));
  await openFixtureWorkspace(context.client, workflowTimeoutMs);

  const openedSession = await waitForBackendState(
    () => backend.get("/workspace-session"),
    (session) =>
      session.activeWorkspaces.length === 1 &&
      session.workspaceAvailabilities[0]?.available === true,
    workflowTimeoutMs,
  );
  workspaceId = openedSession.selectedWorkspaceId;
  await createConversationFromToolbar(context.client);
  const initialPage = await waitForBackendState(
    () => listConversations(backend, workspaceId),
    (page) => page.items.length === 1 && page.items[0]?.conversation.title === "New conversation",
    workflowTimeoutMs,
  );
  conversationId = initialPage.items[0].conversation.id;
  await assertWritableEasyButton(context.client, conversationId);
  await waitForPersistedEasyButton(backend, workspaceId, conversationId);
  await captureScreenshot(context.client, join(firstLaunchDir, "first-run-conversation-pane.png"));

  await stopElectronCdpContext(context);
  context = null;
  await rm(fixture.workspaceRoot, { force: true, recursive: true });

  context = await launchElectronCdpContext({
    artifactDir: missingLaunchDir,
    extraEnv: {
      ...providerEnv,
      SETTA_E2E_RELOCATE_WORKSPACE_ROOT: replacementRoot,
    },
    fixture,
    visible: options.visible,
  });
  await prepareRenderer(context.client);
  backend = await backendProbe(missingLaunchDir);

  const missingSession = await waitForBackendState(
    () => backend.get("/workspace-session"),
    (session) =>
      session.selectedWorkspaceId === workspaceId &&
      session.workspaceAvailabilities.find(
        (availability) => availability.workspaceId === workspaceId,
      )?.available === false,
    workflowTimeoutMs,
  );
  assertStableWorkspaceIdentity(missingSession, workspaceId);
  await assertReadOnlyMissingWorkspace(context.client, conversationId);
  await clickEnabledButtonByAria(context.client, "Retry workspace folder", workflowTimeoutMs);
  await assertReadOnlyMissingWorkspace(context.client, conversationId);
  const missingPage = await listConversations(backend, workspaceId);
  if (missingPage.items.length !== 1 || missingPage.items[0]?.conversation.id !== conversationId) {
    throw new Error(`missing workspace history was not preserved: ${JSON.stringify(missingPage)}`);
  }
  await captureScreenshot(
    context.client,
    join(missingLaunchDir, "missing-workspace-read-only.png"),
  );

  await clickEnabledButtonByAria(context.client, "Locate workspace folder", workflowTimeoutMs);
  const relocatedSession = await waitForBackendState(
    () => backend.get("/workspace-session"),
    (session) =>
      session.selectedWorkspaceId === workspaceId &&
      session.activeWorkspaces[0]?.rootPath === replacementRootCanonical &&
      session.workspaceAvailabilities.find(
        (availability) => availability.workspaceId === workspaceId,
      )?.available === true,
    workflowTimeoutMs,
  );
  assertStableWorkspaceIdentity(relocatedSession, workspaceId);
  await reopenConversationFromMasterPicker(context.client, conversationId);
  await assertWritableEasyButton(context.client, conversationId);

  await writeJson(join(artifactDir, "summary.json"), {
    conversationId,
    replacementRoot: replacementRootCanonical,
    status: "passed",
    workspaceId,
  });
  console.log(`Electron workspace first-run/recovery workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
}

async function prepareRenderer(client) {
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await client.installDriver();
}

function assertFreshSession(session) {
  if (
    session.selectedWorkspaceId !== "" ||
    session.activeWorkspaces.length !== 0 ||
    session.recentWorkspaces.length !== 0 ||
    session.workspaceAvailabilities.length !== 0
  ) {
    throw new Error(`fresh session fabricated workspace state: ${JSON.stringify(session)}`);
  }
}

async function assertFirstRunSurface(client) {
  await waitForState(
    client,
    driverCallExpression("workspaceFirstRunMasterPaneState", {}),
    (state) =>
      state.easyButtons === 0 &&
      state.folderChoiceControls === 0 &&
      state.masterFocused &&
      state.masterHostFocused &&
      state.masterMaximized &&
      state.masterOpen &&
      !state.oldEmptyState &&
      state.paneCount === "1" &&
      !state.search,
    workflowTimeoutMs,
  );
}

async function assertWritableEasyButton(client, targetConversationId) {
  await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceAvailabilityState", {
      conversationId: targetConversationId,
    }),
    (state) =>
      state.surfaceCount === 1 &&
      state.projectionStatus === "ready" &&
      state.inputDisabled === false &&
      state.unavailableNotice === false,
    workflowTimeoutMs,
  );
}

async function createConversationFromToolbar(client) {
  const result = await client.driver("topicConversationClickNewFrameConversation");
  if (!result.clicked) {
    throw new Error(`new frame conversation action failed: ${JSON.stringify(result)}`);
  }
}

async function reopenConversationFromMasterPicker(client, targetConversationId) {
  await focusMasterPane(client);
  await clickMasterTopicsButton(client);
  await waitForState(
    client,
    `(() => {
      const row = document.querySelector(
        '[data-testid="master-conversation-picker-row"][data-conversation-id=${JSON.stringify(
          targetConversationId,
        )}]',
      );
      return {
        available: row instanceof HTMLButtonElement && !row.disabled,
        rowCount: document.querySelectorAll('[data-testid="master-conversation-picker-row"]').length,
      };
    })()`,
    (state) => state.available,
    workflowTimeoutMs,
  );
  const clicked = await client.evaluate(`(() => {
    const row = document.querySelector(
      '[data-testid="master-conversation-picker-row"][data-conversation-id=${JSON.stringify(
        targetConversationId,
      )}]',
    );
    if (!(row instanceof HTMLButtonElement) || row.disabled) {
      return false;
    }
    row.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`master conversation picker did not reopen ${targetConversationId}`);
  }
}

async function focusMasterPane(client) {
  await dispatchKeyEvent(client, { code: "KeyK", key: "k", modifiers: 2 });
  await dispatchKeyEvent(client, {
    code: "KeyK",
    key: "k",
    modifiers: 2,
    type: "keyUp",
  });
  await waitForState(
    client,
    `(() => {
      const host = document.querySelector(
        '[data-testid="workspace-pane-host"][data-surface-kind="master"][data-visible="true"]',
      );
      const pane = host?.querySelector('[data-testid="master-pane-surface"]');
      const composer = pane?.querySelector('textarea[aria-label="Ask Setta"]');
      return {
        focused: composer === document.activeElement,
        hostFocused: host?.getAttribute("data-focused") === "true",
        maximized: host?.getAttribute("data-maximized") === "true",
        open: Boolean(pane),
      };
    })()`,
    (state) => state.open && state.focused && state.hostFocused,
    workflowTimeoutMs,
  );
}

async function clickMasterTopicsButton(client) {
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector(
      '[data-testid="master-pane-surface"] [data-testid="master-topics-button"]',
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error("master topics picker button was unavailable");
  }
}

async function assertReadOnlyMissingWorkspace(client, targetConversationId) {
  await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceAvailabilityState", {
      conversationId: targetConversationId,
    }),
    (state) =>
      state.surfaceCount === 1 &&
      state.inputDisabled === true &&
      state.placeholder.includes("read-only") &&
      state.unavailableNotice === true,
    workflowTimeoutMs,
  );
}

async function waitForPersistedEasyButton(backend, targetWorkspaceId, targetConversationId) {
  void targetWorkspaceId;
  await waitForBackendState(
    () => backend.get("/app/panes/layout"),
    (result) =>
      result.layout?.panes.some(
        (pane) =>
          pane.surfaceKind === "conversation" &&
          pane.conversationConfig?.conversationId === targetConversationId,
      ) === true,
    workflowTimeoutMs,
  );
}

function listConversations(backend, targetWorkspaceId) {
  return backend.post("/conversations/navigator/list", {
    cursor: null,
    limit: 20,
    query: "",
    workspaceId: targetWorkspaceId,
  });
}

function assertStableWorkspaceIdentity(session, expectedWorkspaceId) {
  if (
    session.selectedWorkspaceId !== expectedWorkspaceId ||
    session.activeWorkspaces.length !== 1 ||
    session.activeWorkspaces[0]?.id !== expectedWorkspaceId
  ) {
    throw new Error(`workspace identity changed during recovery: ${JSON.stringify(session)}`);
  }
}
