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
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-role-configuration";
const workflowTimeoutMs = 40_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/topic-conversation-role-configuration.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
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
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir: firstLaunchDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const workspaceId = await openWorkspace(context.client);
  await openRoleSettings(context.client);

  const initial = await waitForRoleSettings(context.client, "gpt-5.6-sol", "high", false, "global");
  assertRoleInventory(initial, ["agent", "narrator", "master", "side_agent"]);
  await selectAgentModel(context.client, "gpt-5.6-terra");
  await waitForRoleSettings(context.client, "gpt-5.6-terra", "medium", true, "global");
  await saveRoleSettings(context.client);
  const configured = await waitForGlobalAgentConfiguration(
    context.client,
    "gpt-5.6-terra",
    "global",
    true,
  );
  await captureScreenshot(context.client, join(artifactDir, "configured-global-agent.png"));

  await selectAgentModel(context.client, "gpt-5.6-luna");
  await waitForRoleSettings(context.client, "gpt-5.6-luna", "medium", true, "global");
  await assertScopeChangeCannotSaveStaleForm(context.client, "workspace");
  const workspaceInherited = await waitForRoleSettings(
    context.client,
    "gpt-5.6-terra",
    "medium",
    false,
    "workspace",
  );
  assertRoleInventory(workspaceInherited, ["agent", "narrator", "side_agent"]);
  await waitForWorkspaceAgentConfiguration(
    context.client,
    workspaceId,
    "gpt-5.6-terra",
    "global",
    false,
  );
  await selectAgentModel(context.client, "gpt-5.6-luna");
  await waitForRoleSettings(context.client, "gpt-5.6-luna", "medium", true, "workspace");
  await saveRoleSettings(context.client);
  const workspaceConfigured = await waitForWorkspaceAgentConfiguration(
    context.client,
    workspaceId,
    "gpt-5.6-luna",
    "workspace",
    true,
  );
  const firstWorkspaceTopic = await createTopic(
    context.client,
    workspaceId,
    "Workspace role precedence before restart",
  );
  assertEqual(firstWorkspaceTopic.model, "gpt-5.6-luna", "workspace primary-agent model");
  await captureScreenshot(context.client, join(artifactDir, "configured-workspace-agent.png"));

  await stopElectronCdpContext(context);
  context = null;
  context = await launchElectronCdpContext({
    artifactDir: secondLaunchDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const restoredWorkspaceId = await openWorkspace(context.client);
  assertEqual(restoredWorkspaceId, workspaceId, "restored role-configuration workspace");
  await openRoleSettings(context.client);
  const reloaded = await waitForRoleSettings(
    context.client,
    "gpt-5.6-terra",
    "medium",
    false,
    "global",
  );
  await waitForGlobalAgentConfiguration(context.client, "gpt-5.6-terra", "global", true);

  await selectRoleScope(context.client, "workspace");
  const workspaceReloaded = await waitForRoleSettings(
    context.client,
    "gpt-5.6-luna",
    "medium",
    false,
    "workspace",
  );
  const workspaceReloadedConfiguration = await waitForWorkspaceAgentConfiguration(
    context.client,
    workspaceId,
    "gpt-5.6-luna",
    "workspace",
    true,
  );

  const workspaceTopic = await createTopic(
    context.client,
    workspaceId,
    "Workspace role precedence",
  );
  assertEqual(workspaceTopic.model, "gpt-5.6-luna", "workspace primary-agent thread model");

  const conversationConfigured = await configureConversationAgent(
    context.client,
    workspaceId,
    workspaceTopic.conversationId,
    "gpt-5.6-sol",
    "high",
  );
  assertEqual(
    conversationConfigured.effectiveSource,
    "conversation",
    "conversation primary-agent source",
  );
  const turn = await submitAndWaitForAgentTurn(
    context.client,
    workspaceId,
    workspaceTopic.conversationId,
  );
  assertEqual(turn.status, "completed", "conversation role-precedence turn status");
  assertEqual(turn.requestedModel, "gpt-5.6-sol", "conversation requested agent model");
  assertEqual(turn.resolvedModel, "gpt-5.6-sol", "conversation resolved agent model");

  const fork = await createAndWaitForFork(
    context.client,
    workspaceId,
    workspaceTopic.conversationId,
  );
  assertEqual(fork.threadModel, "gpt-5.6-luna", "durable fork thread model");
  assertEqual(fork.requestedModel, "gpt-5.6-luna", "durable fork requested agent model");
  assertEqual(fork.resolvedModel, "gpt-5.6-luna", "durable fork resolved agent model");

  const conversationReset = await resetConversationAgent(
    context.client,
    workspaceId,
    workspaceTopic.conversationId,
  );
  assertEqual(conversationReset.effectiveSource, "workspace", "conversation reset source");
  assertEqual(conversationReset.modelId, "gpt-5.6-luna", "conversation reset model");

  const workspaceReset = await resetWorkspaceAgentFromSettings(context.client);
  const workspaceResetConfiguration = await waitForWorkspaceAgentConfiguration(
    context.client,
    workspaceId,
    "gpt-5.6-terra",
    "global",
    false,
  );
  const globalInheritedTopic = await createTopic(
    context.client,
    workspaceId,
    "Global role precedence after workspace reset",
  );
  assertEqual(globalInheritedTopic.model, "gpt-5.6-terra", "global inherited agent model");

  await selectRoleScope(context.client, "global");
  await resetGlobalAgentFromSettings(context.client);
  const reset = await waitForGlobalAgentConfiguration(
    context.client,
    "gpt-5.6-sol",
    "built_in",
    false,
  );
  const builtInTopic = await createTopic(context.client, workspaceId, "Built-in role precedence");
  assertEqual(builtInTopic.model, "gpt-5.6-sol", "reset primary-agent thread model");
  await captureScreenshot(context.client, join(artifactDir, "reset-built-in-agent.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    builtInTopic,
    configured,
    conversationConfigured,
    conversationReset,
    firstWorkspaceTopic,
    fork,
    globalInheritedTopic,
    initial,
    reloaded,
    reset,
    status: "passed",
    turn,
    workspaceConfigured,
    workspaceInherited,
    workspaceReloaded,
    workspaceReloadedConfiguration,
    workspaceReset,
    workspaceResetConfiguration,
    workspaceTopic,
    workspaceId,
  });
  console.log(`Electron topic role configuration workflow passed: ${artifactDir}`);
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
  const current = await client.evaluate(workspaceIdExpression());
  if (!validWorkspaceId(current)) {
    await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  }
  return waitForState(client, workspaceIdExpression(), validWorkspaceId, workflowTimeoutMs);
}

async function openRoleSettings(client) {
  const opened = await client.driver("roleConfigurationOpenSettings");
  if (!opened.ready && !opened.opened) {
    throw new Error("Settings pane was not available for AI role configuration");
  }
  await waitForSelector(client, "#settings-subtab-roles", workflowTimeoutMs);
  const tab = await client.driver("roleConfigurationOpenTab");
  if (!tab.clicked) {
    throw new Error("AI Roles settings tab was not clickable");
  }
  await waitForSelector(client, '[data-testid="role-configuration-settings"]', workflowTimeoutMs);
}

function waitForRoleSettings(client, modelId, effort, dirty, scope) {
  const controlCount = scope === "workspace" ? 3 : 4;
  return waitForState(
    client,
    driverCallExpression("roleConfigurationSettingsState", {}),
    (state) =>
      state.agentModel === modelId &&
      state.agentEffort === effort &&
      state.dirty === dirty &&
      state.scope === scope &&
      state.modelControlCount === controlCount &&
      state.effortControlCount === controlCount,
    workflowTimeoutMs,
  );
}

function assertRoleInventory(state, roles) {
  if (
    JSON.stringify(state.roles) !== JSON.stringify(roles) ||
    state.modelOptionCount !== 5 ||
    state.catalogStatus !== "Provider catalog validated · 4 models"
  ) {
    throw new Error(`AI role inventory drifted: ${JSON.stringify(state)}`);
  }
}

async function selectRoleScope(client, scope) {
  const result = await client.driver("roleConfigurationSelectScope", { scope });
  if (!result.changed) {
    throw new Error(`Role configuration scope ${scope} was not selectable`);
  }
}

async function assertScopeChangeCannotSaveStaleForm(client, scope) {
  const result = await client.driver("roleConfigurationSelectScopeAndSave", { scope });
  if (!result.changed) {
    throw new Error(`Role configuration scope ${scope} was not selectable`);
  }
  if (result.saved) {
    throw new Error("Role configuration saved a stale form after its scope changed");
  }
}

async function selectAgentModel(client, modelId) {
  const result = await client.driver("roleConfigurationSelectAgentModel", { modelId });
  if (!result.changed) {
    throw new Error("Agent model control was not editable");
  }
}

async function saveRoleSettings(client) {
  const result = await client.driver("roleConfigurationSave");
  if (!result.saved) {
    throw new Error("Role configuration Save button was not clickable");
  }
}

function waitForGlobalAgentConfiguration(client, modelId, effectiveSource, hasOverride) {
  return waitForState(
    client,
    driverCallExpression("roleConfigurationGlobalAgent", {}),
    (state) =>
      state.modelId === modelId &&
      state.effectiveSource === effectiveSource &&
      state.hasOverride === hasOverride,
    workflowTimeoutMs,
  );
}

function waitForWorkspaceAgentConfiguration(
  client,
  workspaceId,
  modelId,
  effectiveSource,
  hasOverride,
) {
  return waitForState(
    client,
    driverCallExpression("roleConfigurationWorkspaceAgent", { workspaceId }),
    (state) =>
      state.modelId === modelId &&
      state.effectiveSource === effectiveSource &&
      state.hasOverride === hasOverride,
    workflowTimeoutMs,
  );
}

async function createTopic(client, workspaceId, title) {
  return client.driver("roleConfigurationCreateTopic", { title, workspaceId });
}

async function configureConversationAgent(client, workspaceId, conversationId, modelId, effort) {
  return client.driver("roleConfigurationConfigureConversationAgent", {
    conversationId,
    effort,
    modelId,
    workspaceId,
  });
}

async function submitAndWaitForAgentTurn(client, workspaceId, conversationId) {
  const inputId = "role_configuration_precedence_input";
  const text = "verify conversation role precedence";
  const submitted = await client.driver("roleConfigurationSubmitInput", {
    conversationId,
    inputId,
    sourcePaneId: "role_configuration_test_pane",
    text,
  });
  if (!submitted.submitted) {
    throw new Error("Conversation role-precedence input was not submitted");
  }
  return waitForState(
    client,
    driverCallExpression("roleConfigurationTurnState", {
      conversationId,
      text,
      workspaceId,
    }),
    (state) => ["cancelled", "completed", "failed"].includes(state.status),
    workflowTimeoutMs,
  );
}

async function resetConversationAgent(client, workspaceId, conversationId) {
  return client.driver("roleConfigurationResetConversationAgent", {
    conversationId,
    workspaceId,
  });
}

async function createAndWaitForFork(client, workspaceId, parentConversationId) {
  const title = "Alpha topic fork";
  const submitted = await client.driver("roleConfigurationSubmitInput", {
    conversationId: parentConversationId,
    inputId: "role_configuration_fork_input",
    sourcePaneId: "role_configuration_test_pane",
    text: title,
  });
  if (!submitted.submitted) {
    throw new Error("Role-configuration fork input was not submitted");
  }
  const fork = await waitForState(
    client,
    driverCallExpression("roleConfigurationForkState", { title, workspaceId }),
    (state) =>
      state.conversationId !== "" && ["cancelled", "completed", "failed"].includes(state.status),
    workflowTimeoutMs,
  );
  assertEqual(fork.parentConversationId, parentConversationId, "durable fork parent");
  assertEqual(fork.status, "completed", "durable fork initial turn status");
  return fork;
}

async function resetGlobalAgentFromSettings(client) {
  const result = await client.driver("roleConfigurationResetGlobalAgent");
  if (!result.reset) {
    throw new Error("Global agent reset button was not clickable");
  }
  await waitForRoleSettings(client, "gpt-5.6-sol", "high", true, "global");
  await saveRoleSettings(client);
}

async function resetWorkspaceAgentFromSettings(client) {
  const result = await client.driver("roleConfigurationResetWorkspaceAgent");
  if (!result.reset) {
    throw new Error("Workspace agent reset button was not clickable");
  }
  await waitForRoleSettings(client, "gpt-5.6-luna", "medium", true, "workspace");
  await saveRoleSettings(client);
  return waitForRoleSettings(client, "gpt-5.6-terra", "medium", false, "workspace");
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function validWorkspaceId(workspaceId) {
  return workspaceId !== "" && workspaceId !== "empty";
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} = ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}
