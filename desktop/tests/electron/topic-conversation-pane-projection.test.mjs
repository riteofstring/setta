#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";

import { backendProbe, waitForBackendState } from "./chat-workflow-harness.mjs";
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
const workflowName = "topic-conversation-pane-projection";
const conversationId = "conversation_projection_e2e";
const workflowTimeoutMs = 25_000;

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
  const workspaceId = await seedBoundConversationPane(backend, fixture.workspaceRoot);
  await openSeededWorkspace(context.client, workspaceId);

  const opened = await waitForBoundConversationSurface(context.client, workspaceId);
  assertBoundUnloadedProjection(opened);
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

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const reloaded = await waitForBoundConversationSurfaces(context.client, workspaceId, 2);
  for (const surface of reloaded.surfaces) {
    assertBoundUnloadedProjection(surface);
  }
  assertDistinctPaneViews(reloaded.surfaces);
  await captureScreenshot(
    context.client,
    join(artifactDir, "bound-conversation-views-reloaded.png"),
  );

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    conversationId,
    duplicatedPersisted,
    opened,
    reloaded,
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

async function seedBoundConversationPane(backend, workspaceRoot) {
  const opened = await backend.post("/workspaces/open", { rootPath: workspaceRoot });
  const workspaceId = opened.workspace?.id ?? "";
  if (!workspaceId) {
    throw new Error(`workspace open response missing id: ${JSON.stringify(opened)}`);
  }
  const saved = await backend.post("/workspaces/ui/layout/save", {
    layout: boundConversationLayout(workspaceId),
  });
  if (saved.workspaceId !== workspaceId) {
    throw new Error(`saved layout ownership mismatch: ${JSON.stringify(saved)}`);
  }
  return workspaceId;
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
        paneIds: ["topic_pane"],
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
