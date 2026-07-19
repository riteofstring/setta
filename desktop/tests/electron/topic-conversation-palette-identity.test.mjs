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
  waitForPersistedConversationPane,
  waitForNavigator,
} from "./topic-conversation-fork-workflow.mjs";
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
  const dormantTopics = await createDormantPresentationTopics(context.client, workspaceId, 9);
  const alpha = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Alpha palette identity",
    workflowTimeoutMs,
  );
  await disposeInitialEasyButtonPane(context.client, [alpha.id]);
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
  assertPalettePanePresentation(initial.surfaces, alpha, beta);
  const alphaNavigator = await waitForNavigator(context.client, alpha.id, 1, workflowTimeoutMs);
  assertNavigator(alphaNavigator, alpha, 1);
  assertPaletteNavigatorPresentation(alphaNavigator, alpha, false);
  assertPaletteNavigatorPresentation(
    await waitForNavigator(context.client, beta.id, 1, workflowTimeoutMs),
    beta,
    true,
  );
  await assertReducedMotionNavigatorPresentation(context.client, alpha);
  const exhaustedPalette = await exhaustVisiblePaletteCatalog(
    context.client,
    backend,
    workspaceId,
    dormantTopics.slice(0, 6),
  );
  await waitForTopicPaletteSurface(context.client, exhaustedPalette.id, exhaustedPalette.paletteId);
  const activeTopicIds = [alpha.id, beta.id, ...dormantTopics.slice(0, 6).map((topic) => topic.id)];
  const persistedPanes = await waitForPersistedTopicPanes(
    backend,
    workspaceId,
    alpha.id,
    beta.id,
    dormantTopics.slice(0, 6).map((topic) => topic.id),
  );
  const beforeReload = await waitForPersistedPaletteIdentity(backend, workspaceId, activeTopicIds);
  const beforeReloadPanes = palettePaneIdentity(persistedPanes.layout?.panes ?? []);
  await captureScreenshot(context.client, join(artifactDir, "palette-identity.png"));

  await reloadPage(context.client);
  await prepareRenderer(context.client);
  const reloaded = await waitForPersistedPaletteIdentity(
    backend,
    workspaceId,
    activeTopicIds,
    beforeReload,
  );
  const reloadedPanes = await waitForPersistedTopicPanes(
    backend,
    workspaceId,
    alpha.id,
    beta.id,
    dormantTopics.slice(0, 6).map((topic) => topic.id),
  );
  assertStableReloadIdentity(beforeReload, reloaded);
  assertStableReloadIdentity(
    beforeReloadPanes,
    palettePaneIdentity(reloadedPanes.layout?.panes ?? []),
  );
  await assertPersistedPaletteExhaustion(backend, workspaceId, exhaustedPalette);
  assertDriverAction(
    await context.client.driver("topicConversationPresentFromNavigator", {
      conversationId: exhaustedPalette.id,
    }),
    "clicked",
  );
  await waitForTopicPaletteSurface(context.client, exhaustedPalette.id, exhaustedPalette.paletteId);
  assertDriverAction(
    await context.client.driver("topicConversationPresentFromNavigator", {
      conversationId: alpha.id,
    }),
    "clicked",
  );
  await waitForTopicPaletteSurface(context.client, alpha.id, alpha.paletteId);
  const reloadedAlphaNavigator = await waitForNavigator(
    context.client,
    alpha.id,
    1,
    workflowTimeoutMs,
  );
  const reloadedBetaNavigator = await waitForNavigator(
    context.client,
    beta.id,
    1,
    workflowTimeoutMs,
  );
  assertNavigator(reloadedAlphaNavigator, alpha, 1);
  assertNavigator(reloadedBetaNavigator, beta, 1);
  assertPaletteNavigatorPresentation(reloadedAlphaNavigator, alpha, true);
  assertPaletteNavigatorPresentation(reloadedBetaNavigator, beta, false);
  await captureScreenshot(context.client, join(artifactDir, "reloaded-palette-identity.png"));
  await writeJson(join(artifactDir, "summary.json"), {
    alpha,
    artifactDir,
    beforeReload,
    beta,
    dormantTopics,
    exhaustedPalette,
    reloaded,
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

async function disposeInitialEasyButtonPane(client, keptConversationIds) {
  // The first-run feature guarantees an easy-button pane on an empty workspace, so
  // this test's topics open alongside an auto "New conversation" pane. Close it
  // while exactly one real pane exists (the survivor stays focused/live, and there
  // is no far neighbor to strand), restoring the pristine layout the palette checks
  // assume. `useInitialEasyButtonPane` marks the workspace handled, so it is not
  // recreated.
  const kept = new Set(keptConversationIds);
  const state = await waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (current) =>
      keptConversationIds.every((id) =>
        current.surfaces.some((surface) => surface.conversationId === id),
      ) && current.surfaces.some((surface) => !kept.has(surface.conversationId)),
    workflowTimeoutMs,
  );
  const auto = state.surfaces.find((surface) => !kept.has(surface.conversationId));
  assertDriverAction(
    await client.driver("topicConversationCloseOneBoundPane", {
      conversationId: auto.conversationId,
    }),
    "clicked",
  );
  await waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (current) =>
      keptConversationIds.every((id) =>
        current.surfaces.some((surface) => surface.conversationId === id),
      ) && current.surfaces.every((surface) => kept.has(surface.conversationId)),
    workflowTimeoutMs,
  );
}

async function createDormantPresentationTopics(client, workspaceId, count) {
  const topics = [];
  for (let index = 0; index < count; index += 1) {
    const snapshot = await client.evaluate(
      `window.setta.conversations.create(${JSON.stringify({
        title: `Dormant palette pressure ${String(index + 1).padStart(2, "0")}`,
        workspaceId,
      })})`,
    );
    if (
      snapshot.presentationProfile.resolvedPaletteId !== "sky" ||
      snapshot.presentationProfile.paletteReuse !== null ||
      snapshot.presentationProfile.narratorVoiceReuse !== null
    ) {
      throw new Error(`dormant topic consumed presentation capacity: ${JSON.stringify(snapshot)}`);
    }
    topics.push({
      id: snapshot.conversation.id,
      title: snapshot.conversation.title,
    });
  }
  return topics;
}

async function exhaustVisiblePaletteCatalog(client, backend, workspaceId, topics) {
  let exhausted = null;
  for (const topic of topics) {
    assertDriverAction(
      await client.driver("topicConversationOpenBoundPane", { conversationId: topic.id }),
      "requested",
    );
    await waitForPersistedConversationPane(backend, workspaceId, topic.id, workflowTimeoutMs);
    const page = await waitForBackendState(
      () =>
        backend.post("/conversations/navigator/list", {
          cursor: null,
          limit: 80,
          query: "",
          workspaceId,
        }),
      (current) => current.items.some((item) => item.conversation.id === topic.id),
      workflowTimeoutMs,
    );
    exhausted = page.items.find((item) => item.conversation.id === topic.id);
  }
  if (
    !exhausted ||
    exhausted.presentationProfile.paletteReuse?.reason !== "catalog_exhausted" ||
    exhausted.presentationProfile.paletteReuse.conflictingConversationIds.length === 0
  ) {
    throw new Error(`visible palette exhaustion was not explicit: ${JSON.stringify(exhausted)}`);
  }
  return {
    id: exhausted.conversation.id,
    paletteId: exhausted.presentationProfile.resolvedPaletteId,
    paletteReuse: exhausted.presentationProfile.paletteReuse,
  };
}

function waitForPaletteSurfaces(
  client,
  alphaId,
  betaId,
  alphaPaneCount,
  expectedSurfaceCount = alphaPaneCount + 1,
) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => {
      const alpha = conversationSurfaces(state.surfaces, alphaId);
      const beta = conversationSurfaces(state.surfaces, betaId);
      return (
        state.surfaces.length === expectedSurfaceCount &&
        alpha.length === alphaPaneCount &&
        beta.length === 1 &&
        state.surfaces.every(
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

async function assertPersistedPaletteExhaustion(backend, workspaceId, exhaustedPalette) {
  return waitForBackendState(
    () =>
      backend.post("/conversations/navigator/list", {
        cursor: null,
        limit: 80,
        query: "",
        workspaceId,
      }),
    (page) => {
      const item = page.items.find(
        (candidate) => candidate.conversation.id === exhaustedPalette.id,
      );
      return (
        item?.presentationProfile.resolvedPaletteId === exhaustedPalette.paletteId &&
        JSON.stringify(item.presentationProfile.paletteReuse) ===
          JSON.stringify(exhaustedPalette.paletteReuse)
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

function assertPalettePanePresentation(surfaces, alpha, beta) {
  const alphaSurfaces = conversationSurfaces(surfaces, alpha.id);
  const betaSurfaces = conversationSurfaces(surfaces, beta.id);
  const presented = [...alphaSurfaces, ...betaSurfaces].every(
    (surface) =>
      surface.hostFocusRing === surface.hostAccentDark &&
      surface.hostFocusShadow !== "" &&
      surface.topBarBackgroundImage !== "" &&
      surface.topBarBackgroundImage !== "none",
  );
  const alphaTopBarBackgrounds = new Set(
    alphaSurfaces.map((surface) => surface.topBarBackgroundImage),
  );
  const betaSurface = betaSurfaces[0];
  const distinct =
    betaSurface !== undefined &&
    alphaTopBarBackgrounds.size === 1 &&
    alphaSurfaces.every(
      (surface) =>
        surface.hostFocusRing !== betaSurface.hostFocusRing &&
        surface.hostFocusShadow !== betaSurface.hostFocusShadow &&
        surface.topBarBackgroundImage !== betaSurface.topBarBackgroundImage,
    );
  if (!presented || !distinct) {
    throw new Error(
      `conversation palette pane presentation mismatch: ${JSON.stringify({ alphaSurfaces, betaSurfaces })}`,
    );
  }
}

async function assertReducedMotionNavigatorPresentation(client, topic) {
  await client.call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  try {
    const state = await waitForNavigator(client, topic.id, 1, workflowTimeoutMs);
    if (state.presentationTransitionDuration !== "0s") {
      throw new Error(
        `conversation palette navigator ignored reduced motion: ${JSON.stringify({ state, topic })}`,
      );
    }
  } finally {
    await client.call("Emulation.setEmulatedMedia", { features: [] });
  }
}

function assertPaletteNavigatorPresentation(state, topic, expectCurrent) {
  const current = state.current === "page";
  if (
    state.paletteId !== topic.paletteId ||
    state.accentDark === "" ||
    state.presentationFocusRing !== state.accentDark ||
    current !== expectCurrent ||
    (expectCurrent && state.presentationBoxShadow === "none")
  ) {
    throw new Error(
      `conversation palette navigator presentation mismatch: ${JSON.stringify({ expectCurrent, state, topic })}`,
    );
  }
}

async function waitForPersistedTopicPanes(
  backend,
  workspaceId,
  alphaId,
  betaId,
  singlePaneConversationIds = [],
) {
  void workspaceId;
  return waitForBackendState(
    () => backend.get("/app/panes/layout"),
    (result) => {
      const topicPanes =
        result.layout?.panes.filter((pane) => pane.surfaceKind === "conversation") ?? [];
      return (
        topicPanes.filter((pane) => pane.conversationConfig?.conversationId === alphaId).length ===
          1 &&
        topicPanes.filter((pane) => pane.conversationConfig?.conversationId === betaId).length ===
          1 &&
        singlePaneConversationIds.every(
          (conversationId) =>
            topicPanes.filter((pane) => pane.conversationConfig?.conversationId === conversationId)
              .length === 1,
        )
      );
    },
    workflowTimeoutMs,
  );
}

function waitForTopicPaletteSurface(client, conversationId, paletteId) {
  return waitForTopicPaletteSurfaces(client, conversationId, paletteId, 1);
}

function waitForTopicPaletteSurfaces(client, conversationId, paletteId, expectedCount) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => {
      const surfaces = conversationSurfaces(state.surfaces, conversationId);
      return (
        surfaces.length === expectedCount &&
        surfaces.every(
          (surface) =>
            surface.projectionStatus === "ready" &&
            surface.paletteId === paletteId &&
            surface.hostPaletteId === paletteId &&
            surface.hostConversationId === conversationId &&
            surface.hostAccentDark !== "",
        )
      );
    },
    workflowTimeoutMs,
  );
}

async function waitForPersistedPaletteIdentity(
  backend,
  workspaceId,
  conversationIds,
  expected = null,
) {
  const result = await waitForBackendState(
    () =>
      backend.post("/conversations/navigator/list", {
        cursor: null,
        limit: 80,
        query: "",
        workspaceId,
      }),
    (page) => {
      const identity = paletteProfileIdentity(page.items, conversationIds);
      return (
        identity.length === conversationIds.length &&
        (expected === null || JSON.stringify(identity) === JSON.stringify(expected))
      );
    },
    workflowTimeoutMs,
  );
  return paletteProfileIdentity(result.items, conversationIds);
}

function paletteProfileIdentity(items, conversationIds) {
  const includedIds = new Set(conversationIds);
  return items
    .filter((item) => includedIds.has(item.conversation.id))
    .map((item) => ({
      conversationId: item.conversation.id,
      paletteReuse: item.presentationProfile.paletteReuse,
      requestedPaletteId: item.presentationProfile.requestedPaletteId,
      resolvedPaletteId: item.presentationProfile.resolvedPaletteId,
      selection: item.presentationProfile.paletteSelection,
    }))
    .sort((left, right) => left.conversationId.localeCompare(right.conversationId));
}

function palettePaneIdentity(panes) {
  return panes
    .filter((pane) => pane.surfaceKind === "conversation")
    .map((pane) => ({
      conversationId: pane.conversationConfig?.conversationId ?? "",
      paneId: pane.paneId,
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
