#!/usr/bin/env node
/* global console */

import { delimiter, join } from "node:path";
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
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import {
  assertDriverAction,
  assertNavigator,
  conversationSurfaces,
  createTopic,
  waitForNavigator,
} from "./topic-conversation-fork-workflow.mjs";
import { assertDuplicateConversationPalette } from "./topic-conversation-projection-assertions.mjs";
import { assertDistinctConversationPalettes } from "./topic-conversation-speech-state-assertions.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-palette-identity";
const workflowTimeoutMs = 30_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/topic-conversation-palette-identity.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    visible: options.visible,
  });
  await prepareRenderer(context.client);
  const backend = await backendProbe(artifactDir);
  const workspaceId = await openWorkspace(context.client);
  const alpha = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Alpha palette identity",
    workflowTimeoutMs,
  );
  const beta = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Beta palette identity",
    workflowTimeoutMs,
  );

  const initial = await waitForPaletteSurfaces(context.client, alpha.id, beta.id, 1);
  assertDistinctConversationPalettes(initial.surfaces, alpha.id, beta.id);
  assertExactTopicIdentity(initial.surfaces, alpha, beta, 1);

  assertDriverAction(
    await context.client.driver("topicConversationOpenBoundPane", {
      conversationId: alpha.id,
    }),
    "requested",
  );
  const duplicated = await waitForPaletteSurfaces(context.client, alpha.id, beta.id, 2);
  assertDuplicateConversationPalette(duplicated.surfaces, alpha.id);
  assertDistinctConversationPalettes(duplicated.surfaces, alpha.id, beta.id);
  assertExactTopicIdentity(duplicated.surfaces, alpha, beta, 2);
  assertNavigator(await waitForNavigator(context.client, alpha.id, 2, workflowTimeoutMs), alpha, 2);
  await waitForPersistedTopicPanes(backend, workspaceId, alpha.id, beta.id);
  await captureScreenshot(context.client, join(artifactDir, "duplicate-palette-identity.png"));

  const beforeReload = paletteSurfaceIdentity(duplicated.surfaces);
  await reloadPage(context.client);
  await prepareRenderer(context.client);
  const reloaded = await waitForPaletteSurfaces(context.client, alpha.id, beta.id, 2);
  assertDuplicateConversationPalette(reloaded.surfaces, alpha.id);
  assertDistinctConversationPalettes(reloaded.surfaces, alpha.id, beta.id);
  assertExactTopicIdentity(reloaded.surfaces, alpha, beta, 2);
  assertStableReloadIdentity(beforeReload, paletteSurfaceIdentity(reloaded.surfaces));
  assertNavigator(await waitForNavigator(context.client, alpha.id, 2, workflowTimeoutMs), alpha, 2);
  assertNavigator(await waitForNavigator(context.client, beta.id, 1, workflowTimeoutMs), beta, 1);
  await captureScreenshot(context.client, join(artifactDir, "reloaded-palette-identity.png"));
  await writeJson(join(artifactDir, "summary.json"), {
    alpha,
    artifactDir,
    beforeReload,
    beta,
    reloaded: paletteSurfaceIdentity(reloaded.surfaces),
    status: "passed",
  });
  console.log(`Electron conversation palette identity workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
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

async function prepareRenderer(client) {
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await client.installDriver();
}

async function openWorkspace(client) {
  const initial = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => state.openButtonReady || validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  if (!validWorkspaceId(initial.workspaceId)) {
    await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  }
  const opened = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  return opened.workspaceId;
}

function validWorkspaceId(workspaceId) {
  return workspaceId !== "" && workspaceId !== "empty";
}

function waitForPaletteSurfaces(client, alphaId, betaId, alphaPaneCount) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => {
      const alpha = conversationSurfaces(state.surfaces, alphaId);
      const beta = conversationSurfaces(state.surfaces, betaId);
      return (
        alpha.length === alphaPaneCount &&
        beta.length === 1 &&
        [...alpha, ...beta].every(
          (surface) =>
            surface.projectionStatus === "ready" &&
            surface.hostAccentDark !== "" &&
            surface.hostConversationId === surface.conversationId &&
            surface.hostPaletteId === surface.paletteId,
        )
      );
    },
    workflowTimeoutMs,
  );
}

function assertExactTopicIdentity(surfaces, alpha, beta, alphaPaneCount) {
  const alphaSurfaces = conversationSurfaces(surfaces, alpha.id);
  const betaSurfaces = conversationSurfaces(surfaces, beta.id);
  const valid =
    alphaSurfaces.length === alphaPaneCount &&
    betaSurfaces.length === 1 &&
    alpha.paletteId !== beta.paletteId &&
    alphaSurfaces.every(
      (surface) =>
        surface.paletteId === alpha.paletteId &&
        surface.hostPaletteId === alpha.paletteId &&
        surface.hostConversationId === alpha.id &&
        surface.hostAccentDark !== "" &&
        surface.title.includes(alpha.title),
    ) &&
    betaSurfaces.every(
      (surface) =>
        surface.paletteId === beta.paletteId &&
        surface.hostPaletteId === beta.paletteId &&
        surface.hostConversationId === beta.id &&
        surface.hostAccentDark !== "" &&
        surface.title.includes(beta.title),
    );
  if (!valid) {
    throw new Error(
      `conversation palette identity mismatch: ${JSON.stringify({ alpha, alphaSurfaces, beta, betaSurfaces })}`,
    );
  }
}

async function waitForPersistedTopicPanes(backend, workspaceId, alphaId, betaId) {
  return waitForBackendState(
    () => backend.post("/workspaces/ui/layout/read", { workspaceId }),
    (result) => {
      const topicPanes =
        result.layout?.panes.filter((pane) => pane.surfaceKind === "easy-button") ?? [];
      return (
        topicPanes.filter((pane) => pane.easyButtonConfig?.conversationId === alphaId).length ===
          2 &&
        topicPanes.filter((pane) => pane.easyButtonConfig?.conversationId === betaId).length === 1
      );
    },
    workflowTimeoutMs,
  );
}

function paletteSurfaceIdentity(surfaces) {
  return surfaces
    .map((surface) => ({
      accent: surface.hostAccentDark,
      conversationId: surface.conversationId,
      hostConversationId: surface.hostConversationId,
      hostPaletteId: surface.hostPaletteId,
      paletteId: surface.paletteId,
      paneId: surface.paneId,
      title: surface.title,
    }))
    .sort((left, right) => left.paneId.localeCompare(right.paneId));
}

function assertStableReloadIdentity(beforeReload, reloaded) {
  if (JSON.stringify(beforeReload) !== JSON.stringify(reloaded)) {
    throw new Error(
      `conversation palette identity changed across reload: ${JSON.stringify({ beforeReload, reloaded })}`,
    );
  }
}
