#!/usr/bin/env node
/* global console */

import { execFile } from "node:child_process";
import { basename, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { backendProbe, waitForBackendState } from "./chat-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  dispatchMouseClick,
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
const workflowName = "topic-conversation-pane-projection";
const conversationId = "conversation_projection_e2e";
const workflowTimeoutMs = 25_000;
const execFileAsync = promisify(execFile);

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/topic-conversation-pane-projection.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
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
    extraEnv: { SETTA_E2E_CHAT_HARNESS: "scripted-workflow" },
    fixture,
    visible: options.visible,
  });
  await context.client.installDriver();
  const backend = await backendProbe(artifactDir);
  const workspaceId = await seedBoundConversationPane(backend, fixture);
  await openSeededWorkspace(context.client, workspaceId);

  const opened = await waitForBoundConversationSurface(context.client, workspaceId);
  assertBoundUnloadedProjection(opened);
  assertNavigatorState(await waitForNavigatorState(context.client, 1), 1);
  await captureScreenshot(context.client, join(artifactDir, "bound-conversation-open.png"));

  const firstPersisted = await backend.post("/workspaces/ui/layout/read", { workspaceId });
  assertPersistedBindings(firstPersisted, workspaceId, 1);

  await context.client.driver("topicConversationOpenBoundPane", { conversationId });
  const duplicatedPersisted = await waitForBackendState(
    async () => backend.post("/workspaces/ui/layout/read", { workspaceId }),
    (result) => easyButtonPanes(result, workspaceId).length === 2,
    workflowTimeoutMs,
  );
  assertPersistedBindings(duplicatedPersisted, workspaceId, 2);
  const duplicated = await waitForBoundConversationSurfaces(context.client, workspaceId, 2);
  for (const surface of duplicated.surfaces) {
    assertBoundUnloadedProjection(surface);
  }
  assertDistinctPaneViews(duplicated.surfaces);
  assertNavigatorState(await waitForNavigatorState(context.client, 2), 2);
  await captureScreenshot(context.client, join(artifactDir, "bound-conversation-views-opened.png"));

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const reloaded = await waitForBoundConversationSurfaces(context.client, workspaceId, 2);
  for (const surface of reloaded.surfaces) {
    assertBoundUnloadedProjection(surface);
  }
  assertDistinctPaneViews(reloaded.surfaces);
  const navigatorBeforeFocusAway = await waitForNavigatorState(context.client, 2);
  assertNavigatorState(navigatorBeforeFocusAway, 2);
  if (
    !navigatorBeforeFocusAway.focusedPaneId ||
    navigatorBeforeFocusAway.focusedPaneId === "shell_pane"
  ) {
    throw new Error(
      `expected a focused conversation pane before focus-away: ${JSON.stringify(navigatorBeforeFocusAway)}`,
    );
  }
  await captureScreenshot(
    context.client,
    join(artifactDir, "bound-conversation-views-reloaded.png"),
  );

  const focusAway = await context.client.driver("topicConversationShellFocusPoint");
  if (!focusAway.ok) {
    throw new Error(`shell pane focus point was unavailable: ${JSON.stringify(focusAway)}`);
  }
  await dispatchMouseClick(context.client, focusAway);
  await waitForNavigatorFocus(context.client, "shell_pane", 2);
  await context.client.driver("topicConversationPresentFromNavigator", { conversationId });
  const focusedExisting = await waitForNavigatorFocus(
    context.client,
    navigatorBeforeFocusAway.focusedPaneId,
    2,
  );
  assertNavigatorState(focusedExisting, 2);
  const focusedPersisted = await backend.post("/workspaces/ui/layout/read", { workspaceId });
  assertPersistedBindings(focusedPersisted, workspaceId, 2);

  await closeOneBoundPane(context.client, backend, workspaceId, 1);
  await closeOneBoundPane(context.client, backend, workspaceId, 0);
  const zeroPaneNavigator = await waitForNavigatorState(context.client, 0);
  assertNavigatorState(zeroPaneNavigator, 0);
  await captureScreenshot(
    context.client,
    join(artifactDir, "conversation-zero-pane-navigable.png"),
  );

  await context.client.driver("topicConversationPresentFromNavigator", { conversationId });
  const reopenedPersisted = await waitForBackendState(
    async () => backend.post("/workspaces/ui/layout/read", { workspaceId }),
    (result) => easyButtonPanes(result, workspaceId).length === 1,
    workflowTimeoutMs,
  );
  assertPersistedBindings(reopenedPersisted, workspaceId, 1);
  const reopened = await waitForBoundConversationSurface(context.client, workspaceId);
  assertBoundUnloadedProjection(reopened);
  assertNavigatorState(await waitForNavigatorState(context.client, 1), 1);

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const reopenedAfterReload = await waitForBoundConversationSurfaces(
    context.client,
    workspaceId,
    1,
  );
  assertBoundUnloadedProjection(reopenedAfterReload.surfaces[0]);
  assertNavigatorState(await waitForNavigatorState(context.client, 1), 1);
  await captureScreenshot(context.client, join(artifactDir, "conversation-reopened.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    conversationId,
    duplicated,
    duplicatedPersisted,
    focusedExisting,
    focusedPersisted,
    opened,
    reloaded,
    reopened,
    reopenedAfterReload,
    reopenedPersisted,
    status: "passed",
    workspaceId,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron topic conversation pane projection workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      surface: await safeConversationSurface(context.client),
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

async function seedBoundConversationPane(backend, fixture) {
  const opened = await backend.post("/workspaces/open", { rootPath: fixture.workspaceRoot });
  const workspaceId = requireOpenedWorkspaceId(opened);
  await seedTopicConversation(fixture.appDataDir, workspaceId);
  const navigator = await backend.post("/conversations/navigator/list", {
    cursor: null,
    limit: 80,
    query: "",
    workspaceId,
  });
  assertSeededNavigator(navigator);
  const saved = await backend.post("/workspaces/ui/layout/save", {
    layout: boundConversationLayout(workspaceId),
  });
  assertSavedLayoutOwnership(saved, workspaceId);
  return workspaceId;
}

function requireOpenedWorkspaceId(opened) {
  const workspaceId = opened.workspace?.id ?? "";
  if (!workspaceId) {
    throw new Error(`workspace open response missing id: ${JSON.stringify(opened)}`);
  }
  return workspaceId;
}

function assertSeededNavigator(navigator) {
  if (navigator.items?.length !== 1 || navigator.items[0]?.conversation?.id !== conversationId) {
    throw new Error(`seeded navigator mismatch: ${JSON.stringify(navigator)}`);
  }
}

function assertSavedLayoutOwnership(saved, workspaceId) {
  if (saved.workspaceId !== workspaceId) {
    throw new Error(`saved layout ownership mismatch: ${JSON.stringify(saved)}`);
  }
}

async function seedTopicConversation(appDataDir, workspaceId) {
  const databasePath = join(appDataDir, "topic-conversations", "conversations.sqlite");
  const timestamp = "2026-07-11T20:00:00Z";
  const sql = `
PRAGMA busy_timeout = 5000;
BEGIN IMMEDIATE;
INSERT INTO conversations (
  id, workspace_id, title, topic_descriptor, status, created_at, updated_at,
  archived_at, last_trajectory_sequence
) VALUES (
  ${sqlLiteral(conversationId)}, ${sqlLiteral(workspaceId)},
  'Navigator topic', 'durable topic conversation', 'idle',
  ${sqlLiteral(timestamp)}, ${sqlLiteral(timestamp)}, NULL, 0
);
INSERT INTO conversation_presentation_profiles (
  conversation_id, palette_selection, requested_palette_id, resolved_palette_id,
  palette_reuse_json, narrator_voice_selection, requested_narrator_voice_id,
  resolved_narrator_voice_id, narrator_voice_reuse_json,
  narrator_speech_enabled, updated_at
) VALUES (
  ${sqlLiteral(conversationId)}, 'auto_distinct', NULL, 'sky', NULL,
  'auto_distinct', NULL, 'alloy', NULL, 1, ${sqlLiteral(timestamp)}
);
COMMIT;
`;
  await execFileAsync("sqlite3", [databasePath, sql]);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function openSeededWorkspace(client, workspaceId) {
  const initial = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId }),
    (state) => state.workspaceId === workspaceId || state.openButtonReady,
    workflowTimeoutMs,
  );
  if (initial.workspaceId !== workspaceId) {
    await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  }
  await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId }),
    (state) => state.workspaceId === workspaceId,
    workflowTimeoutMs,
  );
}

async function waitForBoundConversationSurface(client, workspaceId) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceState", { workspaceId }),
    (state) =>
      state.workspaceId === workspaceId &&
      state.conversationId === conversationId &&
      state.projectionStatus !== "",
    workflowTimeoutMs,
  );
}

async function waitForBoundConversationSurfaces(client, workspaceId, expectedCount) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", { workspaceId }),
    (state) =>
      state.workspaceId === workspaceId &&
      state.surfaces.length === expectedCount &&
      state.surfaces.every(
        (surface) => surface.conversationId === conversationId && surface.projectionStatus !== "",
      ),
    workflowTimeoutMs,
  );
}

async function waitForNavigatorState(client, expectedOpenViews) {
  return waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", { conversationId }),
    (state) =>
      state.rowCount === 1 &&
      state.conversationId === conversationId &&
      state.openViewCount === expectedOpenViews,
    workflowTimeoutMs,
  );
}

async function waitForNavigatorFocus(client, focusedPaneId, expectedOpenViews) {
  return waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", { conversationId }),
    (state) =>
      state.rowCount === 1 &&
      state.openViewCount === expectedOpenViews &&
      state.focusedPaneId === focusedPaneId,
    workflowTimeoutMs,
  );
}

function assertNavigatorState(state, expectedOpenViews) {
  if (
    state.rowCount !== 1 ||
    state.conversationId !== conversationId ||
    state.openViewCount !== expectedOpenViews ||
    !state.label.includes("Navigator topic")
  ) {
    throw new Error(
      `conversation navigator state mismatch: ${JSON.stringify({ expectedOpenViews, state })}`,
    );
  }
}

async function closeOneBoundPane(client, backend, workspaceId, expectedCount) {
  const result = await client.driver("topicConversationCloseOneBoundPane", { conversationId });
  if (!result.clicked) {
    throw new Error(`bound conversation pane was not closable: ${JSON.stringify(result)}`);
  }
  await waitForBackendState(
    async () => backend.post("/workspaces/ui/layout/read", { workspaceId }),
    (layout) => easyButtonPanes(layout, workspaceId).length === expectedCount,
    workflowTimeoutMs,
  );
}

function assertBoundUnloadedProjection(state) {
  const expected = {
    conversationId,
    errorText: "",
    helperText: "Conversation projection is not loaded",
    inputDisabled: true,
    projectionStatus: "unloaded",
    state: "idle",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (state[key] !== value) {
      throw new Error(
        `bound conversation surface ${key} mismatch: ${JSON.stringify({ expected, state })}`,
      );
    }
  }
  if (state.captureState !== "" || state.speechState !== "") {
    throw new Error(`bound surface retained pane-owned speech state: ${JSON.stringify(state)}`);
  }
}

function assertPersistedBindings(result, workspaceId, expectedCount) {
  const panes = easyButtonPanes(result, workspaceId);
  if (
    panes.length !== expectedCount ||
    panes.some((pane) => pane.easyButtonConfig?.conversationId !== conversationId) ||
    new Set(panes.map((pane) => pane.paneId)).size !== expectedCount ||
    new Set(panes.map((pane) => pane.surfaceId)).size !== expectedCount
  ) {
    throw new Error(`persisted conversation bindings mismatch: ${JSON.stringify(result.layout)}`);
  }
}

function easyButtonPanes(result, workspaceId) {
  if (result.workspaceId !== workspaceId || !result.layout) {
    return [];
  }
  return result.layout.panes.filter((pane) => pane.surfaceKind === "easy-button");
}

function assertDistinctPaneViews(surfaces) {
  const paneIds = surfaces.map((surface) => surface.paneId);
  if (paneIds.some((paneId) => paneId === "") || new Set(paneIds).size !== surfaces.length) {
    throw new Error(
      `conversation views do not have distinct pane ids: ${JSON.stringify(surfaces)}`,
    );
  }
}

function boundConversationLayout(workspaceId) {
  return {
    columns: [
      {
        columnId: "topic_column",
        idealWidthSpec: { unit: "proportion", value: 1 },
        index: 0,
        paneIds: ["topic_pane", "shell_pane"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "proportion", value: 1 },
      },
    ],
    focusedPaneId: "topic_pane",
    panes: [
      {
        columnId: "topic_column",
        easyButtonConfig: { conversationId },
        heat: 100,
        paneId: "topic_pane",
        sequence: 0,
        subtitle: "topic conversation",
        surfaceId: "topic_surface",
        surfaceKind: "easy-button",
        terminalConfig: null,
        title: "Topic conversation",
        tone: "cyan",
        weight: 1,
        workflowNodeDetailsConfig: null,
      },
      {
        columnId: "topic_column",
        easyButtonConfig: null,
        heat: 0,
        paneId: "shell_pane",
        sequence: 1,
        subtitle: "persistent shell pane",
        surfaceId: "shell_surface",
        surfaceKind: "empty-frame",
        terminalConfig: null,
        title: "Workspace",
        tone: "slate",
        weight: 1,
        workflowNodeDetailsConfig: null,
      },
    ],
    schemaVersion: 1,
    workspaceId,
  };
}

async function safeConversationSurface(client) {
  try {
    return await client.driver("topicConversationSurfaceState", { workspaceId: "" });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
