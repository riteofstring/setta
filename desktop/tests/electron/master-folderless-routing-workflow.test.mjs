#!/usr/bin/env node
/* global console */

import { basename, delimiter, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
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
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import {
  assertMasterRouteDecision,
  readJsonLinesWhileAppending,
  waitForMasterRouteDecision,
} from "./topic-conversation-master-overlay-assertions.mjs";
import { conversationSurfaces } from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "master-folderless-routing";
const workflowTimeoutMs = 40_000;
const folderQuestionText = "what folder am I in?";
const folderlessLookupText = "Open the recent conversation where I asked what folder I was in.";
const folderlessClarificationText = "Clarify the recent folder question conversation.";

if (options.help) {
  console.log(
    `Usage: node desktop/tests/electron/${basename(import.meta.url)} [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]`,
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
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]', workflowTimeoutMs);
  await context.client.installDriver();
  const backend = await backendProbe(artifactDir);
  const freshShell = await assertNoWorkspaceSelected({ backend, client: context.client });

  const masterAnswer = await routeMasterInput({
    backend,
    client: context.client,
    expectedKind: "answer_global",
    text: "Answer from folderless master.",
  });
  const created = await createFolderlessConversationFromMaster({
    backend,
    client: context.client,
  });
  const folderQuestion = await submitFolderQuestion({
    backend,
    client: context.client,
    conversationId: created.conversationId,
  });
  const focusExisting = await routeAndAssertPresented({
    backend,
    client: context.client,
    conversationId: created.conversationId,
    expectedPreferredPaneId: created.paneId,
    text: folderlessLookupText,
  });

  const closed = await closeFolderlessConversationPane(context.client, created.conversationId);
  const reopen = await routeAndAssertPresented({
    backend,
    client: context.client,
    conversationId: created.conversationId,
    expectedPreferredPaneId: null,
    text: folderlessLookupText,
  });

  const clarification = await routeMasterInput({
    backend,
    client: context.client,
    expectedKind: "clarify",
    text: folderlessClarificationText,
  });
  assertClarificationTargets(clarification.state, created.conversationId);
  const confirmation = await routeAndAssertPresented({
    backend,
    client: context.client,
    conversationId: created.conversationId,
    expectedPreferredPaneId: reopen.paneId,
    text: "Yes, that one.",
  });

  const folderResourceRequest = await requestFolderResourceFromFolderlessConversation({
    client: context.client,
    conversationId: created.conversationId,
  });
  const finalShell = await assertNoWorkspaceSelected({ backend, client: context.client });

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    clarification: routeSummary(clarification.state),
    closed,
    confirmation: routeSummary(confirmation.state),
    created,
    finalShell,
    focusExisting: routeSummary(focusExisting.state),
    folderQuestion,
    folderResourceRequest,
    freshShell,
    masterAnswer: routeSummary(masterAnswer.state),
    reopen: routeSummary(reopen.state),
    status: "passed",
  });
  console.log(`Electron master folderless routing workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      shell: await safeDriver(context.client, "appPaneLayoutShellState"),
      surfaces: await safeDriver(context.client, "topicConversationSurfaceStates"),
    }).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  }).catch(() => {});
  throw error;
} finally {
  await stopElectronCdpContext(context);
}

async function createFolderlessConversationFromMaster({ backend, client }) {
  const routed = await routeMasterInput({
    backend,
    client,
    expectedKind: "create_conversation",
    text: "Create Gamma topic.",
  });
  const command = routed.state.decision?.resultingCommand?.createConversation;
  if (!command) {
    throw new Error(`master folderless create omitted command: ${JSON.stringify(routed.state)}`);
  }
  if (
    command.target.resourceScope?.kind !== "folderless" ||
    command.target.resourceBindings.length !== 0
  ) {
    throw new Error(`master folderless create lost scope: ${JSON.stringify(command)}`);
  }
  const snapshot = await waitForConversationSnapshot(
    backend,
    command.target.conversationId,
    (value) =>
      value.conversation.title === "Gamma topic" &&
      value.conversation.workspaceId === null &&
      value.narration.events.some(
        (event) =>
          event.kind === "status_reply" &&
          event.statusReply?.question === command.initialInput &&
          event.statusReply?.text.includes("I can answer questions here"),
      ),
  );
  await waitForConversationInputState(
    backend,
    command.target.conversationId,
    command.initialInputId,
    (state) => state.input?.status === "dispatched",
  );
  const surface = await waitForConversationSurface(
    client,
    command.target.conversationId,
    (candidate) =>
      candidate.projectionStatus === "ready" &&
      candidate.state === "idle" &&
      !candidate.inputDisabled,
  );
  await assertNoWorkspaceSelected({ backend, client });
  return {
    conversationId: snapshot.conversation.id,
    inputId: command.initialInputId,
    paneId: surface.paneId,
    routeInputId: routed.inputId,
  };
}

async function submitFolderQuestion({ backend, client, conversationId }) {
  const submitted = await client.driver("appPaneLayoutSubmitFolderlessConversationText", {
    conversationId,
    text: folderQuestionText,
  });
  assertDriverStatus(submitted, "folderless folder question");
  const snapshot = await waitForConversationSnapshot(
    backend,
    conversationId,
    (value) =>
      value.conversation.workspaceId === null &&
      value.narration.events.some(
        (event) =>
          event.kind === "status_reply" && event.statusReply?.question === folderQuestionText,
      ),
  );
  await assertNoWorkspaceSelected({ backend, client });
  return {
    narrationEventCount: snapshot.narration.events.length,
    responseText: submitted.responseText,
  };
}

async function routeAndAssertPresented({
  backend,
  client,
  conversationId,
  expectedPreferredPaneId,
  text,
}) {
  const routed = await routeMasterInput({
    backend,
    client,
    expectedKind: "focus_conversation",
    expectedTargetId: conversationId,
    text,
  });
  assertFolderlessFocusCommand(routed.state, conversationId, expectedPreferredPaneId);
  const surface = await assertPresentedConversation(client, conversationId);
  await assertNoWorkspaceSelected({ backend, client });
  return { ...routed, paneId: surface.paneId };
}

async function routeMasterInput({ backend, client, expectedKind, expectedTargetId, text }) {
  const inputId = await submitMasterText(client, text);
  const state = await waitForMasterRouteDecision(backend, inputId, workflowTimeoutMs);
  assertMasterRouteDecision(state, {
    expectedInputId: inputId,
    expectedKind,
    expectedTargetId,
  });
  if (["answer_global", "clarify"].includes(expectedKind)) {
    await waitForMasterDecisionResult(client, expectedKind, text);
  }
  return { inputId, state };
}

async function submitMasterText(client, text) {
  const beforeEventCount = (await readJsonLinesWhileAppending(join(artifactDir, "ipc.jsonl")))
    .length;
  const shortcut = await client.driver("appPaneLayoutPressMasterFocusShortcut");
  if (!shortcut.defaultPrevented) {
    throw new Error(`master focus shortcut was not handled: ${JSON.stringify(shortcut)}`);
  }
  await waitForState(
    client,
    driverCallExpression("appPaneLayoutMasterFocusState", {}),
    (state) => state.masterComposerFocused && state.workspaceId === "empty",
    workflowTimeoutMs,
  );
  const submitted = await client.driver("appPaneLayoutSubmitMasterTextForRecording", { text });
  assertDriverStatus(submitted, "recorded master text submit");
  const recorded = await waitForRecordedMasterInput(text, beforeEventCount);
  assertRecordedMasterInput(recorded);
  return recorded.accepted.input.id;
}

async function waitForRecordedMasterInput(text, beforeEventCount) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const events = await readJsonLinesWhileAppending(join(artifactDir, "ipc.jsonl"));
    const starts = events
      .slice(beforeEventCount)
      .filter(
        (event) =>
          event.type === "ipc_start" &&
          event.channel === "master:submit-input" &&
          event.args?.[0]?.input?.text === text,
      );
    if (starts.length > 1) {
      throw new Error(`master text was submitted more than once: ${text}`);
    }
    const start = starts[0];
    const finish = start
      ? events.find(
          (event) =>
            event.type === "ipc_finish" &&
            event.channel === "master:submit-input" &&
            event.id === start.id,
        )
      : null;
    if (start && finish) {
      return { accepted: finish.result, request: start.args[0] };
    }
    await delay(20);
  }
  throw new Error(`timed out waiting for recorded master input: ${text}`);
}

function assertRecordedMasterInput(recorded) {
  if (!recordedMasterInputSummaryMatches(recorded)) {
    throw new Error(`recorded master input drifted: ${JSON.stringify(recorded)}`);
  }
}

function recordedMasterInputSummaryMatches(recorded) {
  const request = recorded.request ?? {};
  const accepted = recorded.accepted ?? {};
  const delivery = accepted.replyDelivery ?? {};
  return (
    JSON.stringify(recordedMasterInputSummary(request.input, accepted.input, delivery)) ===
    JSON.stringify(expectedRecordedMasterInputSummary())
  );
}

function recordedMasterInputSummary(input = {}, acceptedInput = {}, delivery = {}) {
  return {
    acceptedMatchesRequest: acceptedInput.id === input.id,
    focusedConversationId: input.focusedConversationId,
    focusedWorkspaceId: input.focusedWorkspaceId,
    modality: input.modality,
    originatingConversationId: delivery.originatingConversationId,
    originatingConversationInputId: delivery.originatingConversationInputId,
    originatingPaneId: delivery.originatingPaneId,
    originatingWorkspaceId: delivery.originatingWorkspaceId,
    source: input.source,
  };
}

function expectedRecordedMasterInputSummary() {
  return {
    acceptedMatchesRequest: true,
    focusedConversationId: null,
    focusedWorkspaceId: null,
    modality: "text",
    originatingConversationId: null,
    originatingConversationInputId: null,
    originatingPaneId: null,
    originatingWorkspaceId: null,
    source: "shell",
  };
}

async function waitForMasterDecisionResult(client, expectedKind, text) {
  await waitForState(
    client,
    `(() => {
      const interaction = document.querySelector('[data-testid="master-active-interaction"]');
      const requestText = interaction?.querySelector('[data-testid="master-active-request"] p')?.textContent ?? "";
      const result = interaction?.querySelector("[data-master-result-kind]");
      return {
        requestText,
        resultKind: result?.getAttribute("data-master-result-kind") ?? "",
      };
    })()`,
    (state) => state.requestText === text && state.resultKind === expectedKind,
    workflowTimeoutMs,
  );
}

function assertFolderlessFocusCommand(state, conversationId, expectedPreferredPaneId) {
  const target = state.decision?.resultingCommand?.focusConversation?.target;
  if (!folderlessFocusTargetMatches(target, conversationId, expectedPreferredPaneId)) {
    throw new Error(
      `folderless focus command drifted: ${JSON.stringify({
        conversationId,
        expectedPreferredPaneId,
        target,
      })}`,
    );
  }
}

function folderlessFocusTargetMatches(target, conversationId, expectedPreferredPaneId) {
  return (
    JSON.stringify(folderlessFocusTargetSummary(target, conversationId)) ===
    JSON.stringify(expectedFolderlessFocusTargetSummary(expectedPreferredPaneId))
  );
}

function folderlessFocusTargetSummary(target, conversationId) {
  return {
    conversationIdMatches: target?.conversationId === conversationId,
    preferredPaneId: target?.preferredPaneId,
    resourceBindingCount: target?.resourceBindings?.length,
    resourceScopeKind: target?.resourceScope?.kind,
  };
}

function expectedFolderlessFocusTargetSummary(expectedPreferredPaneId) {
  return {
    conversationIdMatches: true,
    preferredPaneId: expectedPreferredPaneId,
    resourceBindingCount: 0,
    resourceScopeKind: "folderless",
  };
}

function assertClarificationTargets(state, conversationId) {
  const clarify = state.decision?.resultingCommand?.clarify;
  if (
    clarify?.question !==
      "Do you mean the conversation where you asked which folder you were in?" ||
    !Array.isArray(clarify.candidateTargetIds) ||
    clarify.candidateTargetIds.length !== 1 ||
    clarify.candidateTargetIds[0] !== conversationId
  ) {
    throw new Error(
      `folderless clarification target drifted: ${JSON.stringify({ clarify, conversationId })}`,
    );
  }
}

async function requestFolderResourceFromFolderlessConversation({ client, conversationId }) {
  const requested = await client.driver("appPaneLayoutRequestFolderlessConversationFolder", {
    conversationId,
    text: "Inspect the repository files.",
  });
  assertDriverStatus(requested, "folderless folder resource request");
  if (!requested.folderResourceRequestPresent || !requested.inputAvailable) {
    throw new Error(`folderless resource request drifted: ${JSON.stringify(requested)}`);
  }
  return requested;
}

async function closeFolderlessConversationPane(client, conversationId) {
  const closed = await client.driver("appPaneLayoutCloseConversationPane", { conversationId });
  assertDriverStatus(closed, "folderless conversation pane close");
  await waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => conversationSurfaces(state.surfaces, conversationId).length === 0,
    workflowTimeoutMs,
  );
  return closed;
}

async function assertPresentedConversation(client, conversationId) {
  const surface = await waitForConversationSurface(
    client,
    conversationId,
    (candidate) =>
      candidate.projectionStatus === "ready" &&
      candidate.state === "idle" &&
      !candidate.inputDisabled,
  );
  await waitForState(
    client,
    driverCallExpression("appPaneLayoutConversationPaneState", { conversationId }),
    (state) => state.focused && state.open && state.visible && state.paneId === surface.paneId,
    workflowTimeoutMs,
  );
  return surface;
}

async function waitForConversationSurface(client, conversationId, ready) {
  const state = await waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (value) => {
      const surface = conversationSurfaces(value.surfaces, conversationId)[0];
      return Boolean(surface && ready(surface));
    },
    workflowTimeoutMs,
  );
  return conversationSurfaces(state.surfaces, conversationId)[0];
}

function waitForConversationSnapshot(backend, conversationId, ready) {
  return waitForBackendState(
    async () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId: null }),
    ready,
    workflowTimeoutMs,
  );
}

function waitForConversationInputState(backend, conversationId, inputId, ready) {
  return waitForBackendState(
    async () =>
      backend.post("/conversations/inputs/state/read", {
        conversationId,
        inputId,
        workspaceId: null,
      }),
    ready,
    workflowTimeoutMs,
  );
}

async function assertNoWorkspaceSelected({ backend, client }) {
  const shell = await waitForState(
    client,
    driverCallExpression("appPaneLayoutShellState", {}),
    (state) => state.ready,
    workflowTimeoutMs,
  );
  const session = await backend.get("/workspace-session");
  if (
    shell.workspaceId !== "empty" ||
    session.selectedWorkspaceId !== "" ||
    session.activeWorkspaces.length !== 0 ||
    session.workspaceAvailabilities.length !== 0
  ) {
    throw new Error(`workflow selected a workspace: ${JSON.stringify({ session, shell })}`);
  }
  return {
    activeWorkspaceCount: session.activeWorkspaces.length,
    selectedWorkspaceId: session.selectedWorkspaceId,
    workspaceId: shell.workspaceId,
  };
}

function routeSummary(state) {
  const record = state.decision;
  if (!record) {
    return emptyRouteSummary();
  }
  return {
    candidateIds: routeContextCandidateIds(record.context),
    commandKind: routeCommandKind(record.resultingCommand),
    inputId: routeInputID(state.input),
    targetAuthorities: routeContextTargetAuthorities(record.context),
  };
}

function emptyRouteSummary() {
  return { candidateIds: [], commandKind: "", inputId: "", targetAuthorities: [] };
}

function routeContextCandidateIds(context = {}) {
  return context.includedCandidateIds ?? [];
}

function routeCommandKind(command = {}) {
  return command.kind ?? "";
}

function routeInputID(input = {}) {
  return input.input?.id ?? "";
}

function routeContextTargetAuthorities(context = {}) {
  return context.targetAuthorities ?? [];
}

function assertDriverStatus(result, label) {
  if (result?.status !== "passed") {
    throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  }
}

async function safeDriver(client, method, args = {}) {
  try {
    return await client.driver(method, args);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
