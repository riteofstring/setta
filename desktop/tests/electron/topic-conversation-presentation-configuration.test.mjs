#!/usr/bin/env node
/* global console */

import { delimiter, join } from "node:path";
import process from "node:process";

import { backendProbe } from "./electron-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import { createTopic } from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-presentation-configuration";
const workflowTimeoutMs = 40_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/topic-conversation-presentation-configuration.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
const firstLaunchDir = join(artifactDir, "first-launch");
const secondLaunchDir = join(artifactDir, "second-launch");
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const extraEnv = {
  PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
  SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
};
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir: firstLaunchDir,
    extraEnv,
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const backend = await backendProbe(firstLaunchDir);
  const workspaceId = await openWorkspace(context.client);
  const alpha = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Presentation alpha",
    workflowTimeoutMs,
  );
  const beta = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Presentation beta",
    workflowTimeoutMs,
  );

  await openVoiceSettings(context.client);
  const initialGlobal = await waitForGlobalSettings(context.client, "marin", "auto_distinct");
  assertEqual(initialGlobal.masterOptionCount, 14, "master voice option count");
  assertEqual(initialGlobal.narratorDefaultOptionCount, 14, "narrator voice option count");
  assertEqual(initialGlobal.catalogStatus, "Voice catalog · 13 voices", "voice catalog status");

  await configureGlobalVoices(context.client, "cedar", "ash");
  const configuredGlobal = await waitForGlobalConfiguration(context.client, "cedar", "ash");

  await presentConversation(context.client, alpha.id);
  await openConversationConfiguration(context.client, alpha.id);
  const initialConversation = await waitForConversationSettings(
    context.client,
    alpha.id,
    "auto_distinct",
    "auto_distinct",
    true,
  );
  assertEqual(initialConversation.paletteOptionCount, 8, "conversation palette option count");
  assertEqual(initialConversation.narratorVoiceOptionCount, 14, "conversation voice option count");
  await configureConversation(context.client, alpha.id, {
    narratorSpeechEnabled: false,
    narratorVoiceSelection: "ballad",
    paletteSelection: "blue",
  });
  const configuredAlpha = await waitForConversationProfile(context.client, workspaceId, alpha.id, {
    narratorSpeechEnabled: false,
    narratorVoiceSelection: "exact",
    requestedNarratorVoiceId: "ballad",
    paletteSelection: "exact",
    requestedPaletteId: "blue",
    resolvedNarratorVoiceId: "ballad",
    resolvedPaletteId: "blue",
  });
  const reassignedBeta = await waitForConversationProfile(context.client, workspaceId, beta.id, {
    narratorSpeechEnabled: true,
    narratorVoiceSelection: "auto_distinct",
    requestedNarratorVoiceId: null,
    paletteSelection: "auto_distinct",
    requestedPaletteId: null,
    resolvedNarratorVoiceId: "ash",
    resolvedPaletteId: "sky",
  });
  await presentConversation(context.client, beta.id);
  await waitForSurfacePalette(context.client, beta.id, "sky");
  await presentConversation(context.client, alpha.id);
  await openConversationConfiguration(context.client, alpha.id);
  await waitForConversationSettings(context.client, alpha.id, "blue", "ballad", false);
  await captureScreenshot(context.client, join(artifactDir, "configured-conversation.png"));

  await stopElectronCdpContext(context);
  context = null;

  context = await launchElectronCdpContext({
    artifactDir: secondLaunchDir,
    extraEnv,
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const restoredWorkspaceId = await openWorkspace(context.client);
  assertEqual(restoredWorkspaceId, workspaceId, "restored presentation workspace");
  await openVoiceSettings(context.client);
  const restoredGlobalSettings = await waitForGlobalSettings(context.client, "cedar", "ash");
  const restoredGlobal = await waitForGlobalConfiguration(context.client, "cedar", "ash");
  const restoredAlpha = await waitForConversationProfile(context.client, workspaceId, alpha.id, {
    narratorSpeechEnabled: false,
    narratorVoiceSelection: "exact",
    requestedNarratorVoiceId: "ballad",
    paletteSelection: "exact",
    requestedPaletteId: "blue",
    resolvedNarratorVoiceId: "ballad",
    resolvedPaletteId: "blue",
  });
  const restoredBeta = await waitForConversationProfile(context.client, workspaceId, beta.id, {
    narratorSpeechEnabled: true,
    narratorVoiceSelection: "auto_distinct",
    requestedNarratorVoiceId: null,
    paletteSelection: "auto_distinct",
    requestedPaletteId: null,
    resolvedNarratorVoiceId: "ash",
    resolvedPaletteId: "sky",
  });
  await presentConversation(context.client, alpha.id);
  await openConversationConfiguration(context.client, alpha.id);
  await waitForConversationSettings(context.client, alpha.id, "blue", "ballad", false);

  const gammaTitle = "Presentation default narrator";
  const created = await context.client.driver("topicConversationCreate", { title: gammaTitle });
  if (!created.created) {
    throw new Error("Topic creation control was unavailable for narrator-default verification");
  }
  const gamma = await waitForState(
    context.client,
    driverCallExpression("presentationConfigurationFindTopic", {
      title: gammaTitle,
      workspaceId,
    }),
    (state) =>
      state.found &&
      state.snapshot?.presentationProfile?.resolvedNarratorVoiceId === "ash" &&
      state.snapshot?.presentationProfile?.resolvedPaletteId === "violet",
    workflowTimeoutMs,
  );
  assertProfile(gamma.snapshot.presentationProfile, {
    narratorSpeechEnabled: true,
    narratorVoiceSelection: "exact",
    requestedNarratorVoiceId: "ash",
    paletteSelection: "auto_distinct",
    requestedPaletteId: null,
    resolvedNarratorVoiceId: "ash",
    resolvedPaletteId: "violet",
  });
  await waitForSurfacePalette(context.client, gamma.snapshot.conversation.id, "violet");
  const betaAfterDefaultCollision = await waitForConversationProfile(
    context.client,
    workspaceId,
    beta.id,
    {
      narratorSpeechEnabled: true,
      narratorVoiceSelection: "auto_distinct",
      requestedNarratorVoiceId: null,
      paletteSelection: "auto_distinct",
      requestedPaletteId: null,
      resolvedNarratorVoiceId: "alloy",
      resolvedPaletteId: "sky",
    },
  );

  await presentConversation(context.client, alpha.id);
  await openConversationConfiguration(context.client, alpha.id);
  await configureConversation(context.client, alpha.id, {
    narratorSpeechEnabled: true,
    narratorVoiceSelection: "auto_distinct",
    paletteSelection: "auto_distinct",
  });
  const automaticAlpha = await waitForConversationProfile(context.client, workspaceId, alpha.id, {
    narratorSpeechEnabled: true,
    narratorVoiceSelection: "auto_distinct",
    requestedNarratorVoiceId: null,
    paletteSelection: "auto_distinct",
    requestedPaletteId: null,
    resolvedNarratorVoiceId: "ballad",
    resolvedPaletteId: "blue",
  });
  await waitForConversationSettings(
    context.client,
    alpha.id,
    "auto_distinct",
    "auto_distinct",
    true,
  );
  await captureScreenshot(context.client, join(artifactDir, "restored-and-automatic.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    automaticAlpha: automaticAlpha.presentationProfile,
    configuredAlpha: configuredAlpha.presentationProfile,
    configuredGlobal,
    gamma: gamma.snapshot.presentationProfile,
    initialGlobal,
    reassignedBeta: reassignedBeta.presentationProfile,
    restoredAlpha: restoredAlpha.presentationProfile,
    restoredBeta: restoredBeta.presentationProfile,
    restoredGlobal,
    restoredGlobalSettings,
    status: "passed",
    betaAfterDefaultCollision: betaAfterDefaultCollision.presentationProfile,
    workspaceId,
  });
  console.log(`Electron topic presentation configuration workflow passed: ${artifactDir}`);
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

async function openVoiceSettings(client) {
  const opened = await client.driver("presentationConfigurationOpenSettings");
  if (!opened.ready && !opened.opened) {
    throw new Error("Settings pane was unavailable for voice configuration");
  }
  await waitForSelector(client, "#settings-subtab-speech", workflowTimeoutMs);
  const tab = await client.driver("presentationConfigurationOpenGlobalTab");
  if (!tab.clicked) {
    throw new Error("Voices settings tab was not clickable");
  }
  await waitForSelector(
    client,
    '[data-testid="presentation-configuration-settings"]',
    workflowTimeoutMs,
  );
}

function waitForGlobalSettings(client, masterSelection, narratorDefaultSelection) {
  return waitForState(
    client,
    driverCallExpression("presentationConfigurationGlobalState", {}),
    (state) =>
      state.ready &&
      state.masterSelection === masterSelection &&
      state.narratorDefaultSelection === narratorDefaultSelection &&
      state.masterOptionCount > 1 &&
      state.narratorDefaultOptionCount > 1 &&
      !state.masterSaveEnabled &&
      !state.narratorDefaultSaveEnabled,
    workflowTimeoutMs,
  );
}

async function configureGlobalVoices(client, masterValue, narratorValue) {
  await selectGlobalVoice(client, "master", masterValue);
  await selectGlobalVoice(client, "narrator", narratorValue);

  await saveGlobalVoice(client, "master");
  await waitForState(
    client,
    driverCallExpression("presentationConfigurationGlobalState", {}),
    (state) =>
      state.masterSelection === masterValue &&
      !state.masterSaveEnabled &&
      state.narratorDefaultSelection === narratorValue &&
      state.narratorDefaultSaveEnabled,
    workflowTimeoutMs,
  );

  await saveGlobalVoice(client, "narrator");
  await waitForState(
    client,
    driverCallExpression("presentationConfigurationGlobalState", {}),
    (state) =>
      state.masterSelection === masterValue &&
      !state.masterSaveEnabled &&
      state.narratorDefaultSelection === narratorValue &&
      !state.narratorDefaultSaveEnabled,
    workflowTimeoutMs,
  );
}

async function selectGlobalVoice(client, target, value) {
  const selected = await client.driver("presentationConfigurationSelectGlobal", { target, value });
  if (!selected.changed) {
    throw new Error(`${target} voice selection did not change to ${value}`);
  }
  await waitForState(
    client,
    driverCallExpression("presentationConfigurationGlobalState", {}),
    (state) =>
      target === "master"
        ? state.masterSelection === value && state.masterSaveEnabled
        : state.narratorDefaultSelection === value && state.narratorDefaultSaveEnabled,
    workflowTimeoutMs,
  );
}

async function saveGlobalVoice(client, target) {
  const saved = await client.driver("presentationConfigurationSaveGlobal", { target });
  if (!saved.saved) {
    throw new Error(`${target} voice Save button was not clickable`);
  }
}

function waitForGlobalConfiguration(client, masterVoiceId, narratorDefaultVoiceId) {
  return waitForState(
    client,
    driverCallExpression("presentationConfigurationReadGlobal", {}),
    (state) =>
      state.master.selection === "exact" &&
      state.master.requestedVoiceId === masterVoiceId &&
      state.master.resolvedVoiceId === masterVoiceId &&
      state.narratorDefault.selection === "exact" &&
      state.narratorDefault.requestedVoiceId === narratorDefaultVoiceId,
    workflowTimeoutMs,
  );
}

async function presentConversation(client, conversationId) {
  await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", { conversationId }),
    (state) => state.rowCount === 1,
    workflowTimeoutMs,
  );
  const result = await client.driver("topicConversationPresentFromNavigator", { conversationId });
  if (!result.clicked) {
    throw new Error(`Conversation ${conversationId} could not be presented from the navigator`);
  }
}

async function openConversationConfiguration(client, conversationId) {
  await waitForState(
    client,
    driverCallExpression("presentationConfigurationConversationState", { conversationId }),
    (state) => state.ready && state.narratorVoiceOptionCount > 1,
    workflowTimeoutMs,
  );
  const opened = await client.driver("presentationConfigurationOpenConversation", {
    conversationId,
  });
  if (!opened.opened) {
    throw new Error(`Conversation ${conversationId} presentation controls were unavailable`);
  }
}

function waitForConversationSettings(
  client,
  conversationId,
  paletteSelection,
  narratorVoiceSelection,
  narratorSpeechEnabled,
) {
  return waitForState(
    client,
    driverCallExpression("presentationConfigurationConversationState", { conversationId }),
    (state) =>
      state.ready &&
      state.open &&
      state.paletteSelection === paletteSelection &&
      state.narratorVoiceSelection === narratorVoiceSelection &&
      state.narratorSpeechEnabled === narratorSpeechEnabled &&
      !state.saveEnabled,
    workflowTimeoutMs,
  );
}

function waitForSurfacePalette(client, conversationId, paletteId) {
  return waitForState(
    client,
    driverCallExpression("presentationConfigurationConversationState", { conversationId }),
    (state) => state.ready && state.surfacePalette === paletteId,
    workflowTimeoutMs,
  );
}

async function configureConversation(client, conversationId, settings) {
  const changed = await client.driver("presentationConfigurationSetConversation", {
    conversationId,
    ...settings,
  });
  if (!changed.changed) {
    throw new Error(`Conversation ${conversationId} presentation controls did not change`);
  }
  await waitForState(
    client,
    driverCallExpression("presentationConfigurationConversationState", { conversationId }),
    (state) =>
      state.paletteSelection === settings.paletteSelection &&
      state.narratorVoiceSelection === settings.narratorVoiceSelection &&
      state.narratorSpeechEnabled === settings.narratorSpeechEnabled &&
      state.saveEnabled,
    workflowTimeoutMs,
  );
  const saved = await client.driver("presentationConfigurationSaveConversation", {
    conversationId,
  });
  if (!saved.saved) {
    throw new Error(`Conversation ${conversationId} presentation Save button was not clickable`);
  }
}

function waitForConversationProfile(client, workspaceId, conversationId, expected) {
  return waitForState(
    client,
    driverCallExpression("presentationConfigurationReadConversation", {
      conversationId,
      workspaceId,
    }),
    (snapshot) => profileMatches(snapshot.presentationProfile, expected),
    workflowTimeoutMs,
  );
}

function profileMatches(profile, expected) {
  return Object.entries(expected).every(([key, value]) => profile[key] === value);
}

function assertProfile(profile, expected) {
  if (!profileMatches(profile, expected)) {
    throw new Error(
      `presentation profile = ${JSON.stringify(profile)}, want ${JSON.stringify(expected)}`,
    );
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} = ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}
