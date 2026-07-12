#!/usr/bin/env node
/* global console */

import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, delimiter, dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
const workflowTimeoutMs = 50_000;
const expectedNarratorStatusReply =
  "The primary topic agent is still working and has not been steered or interrupted.";
const fakeTopicCodexFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-topic-codex-app-server.mjs",
);

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
const fakeCodex = await installFakeTopicCodex(fixture);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    visible: options.visible,
  });
  await context.client.installDriver();
  const backend = await backendProbe(artifactDir);
  const workspaceId = await openWorkspace(context.client);

  const alpha = await createTopic(context.client, backend, workspaceId, "Alpha topic");
  const beta = await createTopic(context.client, backend, workspaceId, "Beta topic");
  const initial = await waitForConversationSurfaces(
    context.client,
    (surfaces) =>
      hasReadyConversation(surfaces, alpha.id) && hasReadyConversation(surfaces, beta.id),
  );
  assertDistinctConversationPalettes(initial.surfaces, alpha.id, beta.id);
  assertPaneVoiceCaptureRequests(initial.surfaces, alpha.id, beta.id);
  const conversationInputRequest = paneConversationInputRequest(
    alpha.id,
    requiredConversationSurface(initial.surfaces, alpha.id).paneId,
  );
  const acceptedConversationInput = await submitConversationInput(
    context.client,
    conversationInputRequest,
  );
  assertIdempotentConversationInput(
    acceptedConversationInput,
    await submitConversationInput(context.client, conversationInputRequest),
    conversationInputRequest.input,
  );
  await assertChangedConversationInputConflicts(context.client, conversationInputRequest);

  await context.client.driver("topicConversationOpenBoundPane", { conversationId: alpha.id });
  const duplicated = await waitForConversationSurfaces(
    context.client,
    (surfaces) =>
      conversationSurfaces(surfaces, alpha.id).length === 2 &&
      conversationSurfaces(surfaces, beta.id).length === 1 &&
      conversationSurfaces(surfaces, alpha.id).every(
        (surface) => surface.projectionStatus === "ready",
      ),
  );
  assertDuplicateConversationPalette(duplicated.surfaces, alpha.id);
  assertNavigator(await waitForNavigator(context.client, alpha.id, 2), alpha, 2);
  await captureScreenshot(context.client, join(artifactDir, "two-topics-and-duplicate.png"));

  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: alpha.id,
      text: "hold alpha",
    }),
    "submitted",
  );
  await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) => surface.state === "working" && surface.agentText.includes("Streaming hold alpha"),
  );
  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: beta.id,
      text: "hold beta",
    }),
    "submitted",
  );
  const concurrent = await waitForConversationSurfaces(
    context.client,
    (surfaces) =>
      conversationSurfaces(surfaces, alpha.id).every((surface) => surface.state === "working") &&
      conversationSurfaces(surfaces, beta.id).some(
        (surface) =>
          surface.state === "working" && surface.agentText.includes("Streaming hold beta"),
      ),
  );
  assertIndependentWorkingTopics(concurrent.surfaces, alpha.id, beta.id);

  const alphaBeforeStatus = await waitForConversationSnapshot(
    backend,
    workspaceId,
    alpha.id,
    (snapshot) => snapshot.conversation.status === "working",
  );
  const statusQuestion = "What is the primary agent doing?";
  assertDriverAction(
    await context.client.driver("topicConversationAskStatus", {
      conversationId: alpha.id,
      question: statusQuestion,
    }),
    "asked",
  );
  const statusWhileWorking = await waitForConversationSurfaces(context.client, (surfaces) => {
    const alphaSurfaces = conversationSurfaces(surfaces, alpha.id);
    const betaSurfaces = conversationSurfaces(surfaces, beta.id);
    return (
      alphaSurfaces.length === 2 &&
      betaSurfaces.length === 1 &&
      alphaSurfaces.every(
        (surface) =>
          surface.state === "working" &&
          surface.statusQuestion === statusQuestion &&
          surface.statusReplyText === expectedNarratorStatusReply,
      ) &&
      betaSurfaces.every((surface) => surface.statusReplyText === "")
    );
  });
  const alphaAfterStatus = await waitForConversationSnapshot(
    backend,
    workspaceId,
    alpha.id,
    (snapshot) => snapshot.narration.events.some((event) => event.kind === "status_reply"),
  );
  assertNarratorStatusIsolation(alphaBeforeStatus, alphaAfterStatus, statusQuestion);

  await submitAndWaitForQueue(context.client, alpha.id, "artifact alpha", 1);
  await submitAndWaitForQueue(context.client, alpha.id, "approval alpha", 2);

  await closeConversationPane(context.client, alpha.id);
  await closeConversationPane(context.client, alpha.id);
  await waitForConversationSurfaces(
    context.client,
    (surfaces) => conversationSurfaces(surfaces, alpha.id).length === 0,
  );
  assertNavigator(await waitForNavigator(context.client, alpha.id, 0), alpha, 0);
  const closedWorkingSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    alpha.id,
    (snapshot) => snapshot.conversation.status === "working" && snapshot.queue.length === 2,
  );
  assertRunningTurn(closedWorkingSnapshot, "closed working conversation");

  assertDriverAction(
    await context.client.driver("topicConversationPresentFromNavigator", {
      conversationId: alpha.id,
    }),
    "clicked",
  );
  const reopenedWorking = await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) => surface.state === "working" && surface.queueCount === 2,
  );
  if (reopenedWorking.paletteId !== alpha.paletteId) {
    throw new Error(`reopened Alpha palette changed: ${JSON.stringify(reopenedWorking)}`);
  }

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const reloadedWorking = await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) =>
      surface.projectionStatus === "ready" &&
      surface.state === "working" &&
      surface.queueCount === 2 &&
      surface.paletteId === alpha.paletteId &&
      surface.statusQuestion === statusQuestion &&
      surface.statusReplyText === expectedNarratorStatusReply,
  );
  await waitForConversationSurface(
    context.client,
    beta.id,
    (surface) => surface.projectionStatus === "ready" && surface.state === "working",
  );

  assertDriverAction(
    await context.client.driver("topicConversationSteer", {
      conversationId: alpha.id,
      text: "steer alpha now",
    }),
    "steered",
  );
  const awaitingApproval = await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) =>
      surface.approvalId !== "" &&
      surface.artifactCount === 1 &&
      surface.artifactText.includes("artifact.png") &&
      surface.helperText === "Waiting for approval",
  );
  assertDriverAction(
    await context.client.driver("topicConversationRespondApproval", {
      answer: "focused",
      conversationId: alpha.id,
    }),
    "answered",
  );
  const alphaComplete = await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) =>
      surface.state === "complete" &&
      surface.status === "completed" &&
      surface.summaryText === "Narrator completed approval alpha.",
  );
  if (alphaComplete.artifactCount !== 1) {
    throw new Error(`Alpha artifact was not retained: ${JSON.stringify(alphaComplete)}`);
  }

  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: alpha.id,
      text: "command approval denial",
    }),
    "submitted",
  );
  const awaitingDenial = await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) => surface.approvalId !== "" && surface.helperText === "Waiting for approval",
  );
  assertDriverAction(
    await context.client.driver("topicConversationDenyApproval", {
      conversationId: alpha.id,
    }),
    "denied",
  );
  await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) =>
      surface.state === "complete" &&
      surface.status === "completed" &&
      surface.approvalId === "" &&
      surface.summaryText === "Narrator completed command approval denial.",
  );

  assertDriverAction(
    await context.client.driver("topicConversationStop", { conversationId: beta.id }),
    "stopped",
  );
  await waitForConversationSurface(
    context.client,
    beta.id,
    (surface) =>
      surface.state === "complete" &&
      surface.status === "stopped" &&
      surface.summaryText === "Narrator completed hold beta.",
  );
  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: beta.id,
      text: "narration backlog fail beta",
    }),
    "submitted",
  );
  const betaFailed = await waitForConversationSurface(
    context.client,
    beta.id,
    (surface) =>
      surface.state === "complete" &&
      surface.status === "failed" &&
      surface.summaryText === "Narrator completed narration backlog fail beta.",
  );

  const alphaSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    alpha.id,
    (snapshot) =>
      snapshot.turns.turns.length === 4 &&
      snapshot.turns.turns.every((turn) => turn.status === "completed") &&
      hasFinalNarrationForEveryTurn(snapshot) &&
      narratorCaughtUp(snapshot),
  );
  const betaSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    beta.id,
    (snapshot) =>
      snapshot.turns.turns.length === 2 &&
      snapshot.turns.turns[0]?.status === "cancelled" &&
      snapshot.turns.turns[1]?.status === "failed" &&
      hasFinalNarrationForEveryTurn(snapshot) &&
      narratorCaughtUp(snapshot) &&
      snapshot.narratorState.checkpointThroughSequence > 0 &&
      snapshot.narratorState.degradation === null,
  );
  assertAlphaLifecycle(alphaSnapshot, awaitingApproval.approvalId);
  assertDeniedApproval(alphaSnapshot, awaitingDenial.approvalId);
  assertBetaLifecycle(betaSnapshot);

  await captureScreenshot(context.client, join(artifactDir, "commands-complete.png"));
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  assertIdempotentConversationInput(
    acceptedConversationInput,
    await submitConversationInput(context.client, conversationInputRequest),
    conversationInputRequest.input,
  );
  const reloaded = await waitForConversationSurfaces(
    context.client,
    (surfaces) =>
      conversationSurfaces(surfaces, alpha.id).some(
        (surface) =>
          surface.projectionStatus === "ready" &&
          surface.status === "completed" &&
          surface.artifactCount === 1,
      ) &&
      conversationSurfaces(surfaces, beta.id).some(
        (surface) => surface.projectionStatus === "ready" && surface.status === "failed",
      ),
  );
  assertReloadedProjection(reloaded.surfaces, alpha, beta);
  assertNavigator(await waitForNavigator(context.client, alpha.id, 1), alpha, 1);
  assertNavigator(await waitForNavigator(context.client, beta.id, 1), beta, 1);
  await captureScreenshot(context.client, join(artifactDir, "commands-reloaded.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    alpha,
    alphaAfterStatus,
    alphaBeforeStatus,
    alphaComplete,
    alphaSnapshot,
    artifactDir,
    beta,
    betaFailed,
    betaSnapshot,
    closedWorkingSnapshot,
    concurrent,
    conversationInput: acceptedConversationInput,
    duplicated,
    reloaded,
    reopenedWorking,
    reloadedWorking,
    status: "passed",
    statusWhileWorking,
    workspaceId,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron topic conversation production workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      surfaces: await safeSurfaceStates(context.client),
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

async function installFakeTopicCodex(fixture) {
  const binDir = join(fixture.tempRoot, "fake-topic-bin");
  await mkdir(binDir, { recursive: true });
  const scriptPath = join(binDir, "fake-topic-codex-app-server.mjs");
  await copyFile(fakeTopicCodexFixture, scriptPath);
  if (process.platform === "win32") {
    await writeFile(join(binDir, "codex.cmd"), `@echo off\r\nnode "${scriptPath}" %*\r\n`, "utf8");
  } else {
    const commandPath = join(binDir, "codex");
    await writeFile(commandPath, `#!/usr/bin/env sh\nexec node "${scriptPath}" "$@"\n`, "utf8");
    await chmod(commandPath, 0o755);
  }
  return { binDir };
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

async function createTopic(client, backend, workspaceId, title) {
  const before = await listTopics(backend, workspaceId);
  assertDriverAction(await client.driver("topicConversationCreate", { title }), "created");
  const page = await waitForBackendState(
    async () => listTopics(backend, workspaceId),
    (current) =>
      current.items.length === before.items.length + 1 &&
      current.items.some((item) => item.conversation.title === title),
    workflowTimeoutMs,
  );
  const item = page.items.find((candidate) => candidate.conversation.title === title);
  if (!item) {
    throw new Error(`created topic ${title} was not listed: ${JSON.stringify(page)}`);
  }
  if (
    item.presentationProfile.narratorVoiceSelection !== "auto_distinct" ||
    item.presentationProfile.requestedNarratorVoiceId !== null ||
    item.presentationProfile.resolvedNarratorVoiceId !== null ||
    item.presentationProfile.narratorVoiceReuse !== null
  ) {
    throw new Error(
      `created topic ${title} has an invalid durable narrator voice selection: ${JSON.stringify(item.presentationProfile)}`,
    );
  }
  await waitForConversationSurface(
    client,
    item.conversation.id,
    (surface) => surface.projectionStatus === "ready" && !surface.inputDisabled,
  );
  return {
    id: item.conversation.id,
    narratorVoiceSelection: item.presentationProfile.narratorVoiceSelection,
    paletteId: item.presentationProfile.resolvedPaletteId,
    title,
  };
}

function listTopics(backend, workspaceId) {
  return backend.post("/conversations/navigator/list", {
    cursor: null,
    limit: 80,
    query: "",
    workspaceId,
  });
}

function paneConversationInputRequest(conversationId, sourcePaneId) {
  return {
    input: {
      conversationId,
      id: "conversation_input_alpha_e2e",
      modality: "voice",
      replyToInputId: null,
      requestedMode: "route",
      sourcePaneId,
      submittedAt: "2026-07-12T18:00:00Z",
      text: "  Keep this pane transcript exact.  ",
    },
  };
}

async function submitConversationInput(client, request) {
  return client.evaluate(`window.setta.conversations.submitInput(${JSON.stringify(request)})`);
}

function assertIdempotentConversationInput(first, duplicate, expectedInput) {
  if (!validConversationInputReceipt(first, expectedInput) || !sameInputReceipt(first, duplicate)) {
    throw new Error(
      `conversation input was not accepted idempotently: ${JSON.stringify({ duplicate, first })}`,
    );
  }
}

function validConversationInputReceipt(receipt, expectedInput) {
  return (
    receipt?.sequence === 1 &&
    receipt.status === "accepted" &&
    conversationInputsEqual(receipt.input, expectedInput)
  );
}

function sameInputReceipt(first, duplicate) {
  return (
    duplicate?.sequence === first.sequence &&
    duplicate.status === first.status &&
    duplicate.acceptedAt === first.acceptedAt &&
    conversationInputsEqual(duplicate.input, first.input)
  );
}

function conversationInputsEqual(left, right) {
  return (
    left?.id === right.id &&
    left.conversationId === right.conversationId &&
    left.sourcePaneId === right.sourcePaneId &&
    left.replyToInputId === right.replyToInputId &&
    left.text === right.text &&
    left.modality === right.modality &&
    left.requestedMode === right.requestedMode &&
    left.submittedAt === right.submittedAt
  );
}

async function assertChangedConversationInputConflicts(client, request) {
  const changed = {
    input: { ...request.input, text: "Changed content for the same conversation input id" },
  };
  const result = await client.evaluate(`(async () => {
    try {
      await window.setta.conversations.submitInput(${JSON.stringify(changed)});
      return { accepted: true, message: "" };
    } catch (error) {
      return { accepted: false, message: error instanceof Error ? error.message : String(error) };
    }
  })()`);
  if (result?.accepted || !result?.message.includes("already accepted with different content")) {
    throw new Error(`changed conversation input id did not conflict: ${JSON.stringify(result)}`);
  }
}

async function submitAndWaitForQueue(client, conversationId, text, queueCount) {
  assertDriverAction(
    await client.driver("topicConversationSubmit", { conversationId, text }),
    "submitted",
  );
  await waitForConversationSurface(
    client,
    conversationId,
    (surface) => surface.queueCount === queueCount,
  );
}

async function closeConversationPane(client, conversationId) {
  assertDriverAction(
    await client.driver("topicConversationCloseOneBoundPane", { conversationId }),
    "clicked",
  );
}

async function waitForConversationSurfaces(client, ready) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => ready(state.surfaces),
    workflowTimeoutMs,
  );
}

async function waitForConversationSurface(client, conversationId, ready) {
  const state = await waitForConversationSurfaces(client, (surfaces) => {
    const surface = conversationSurfaces(surfaces, conversationId)[0];
    return Boolean(surface && ready(surface));
  });
  return conversationSurfaces(state.surfaces, conversationId)[0];
}

function conversationSurfaces(surfaces, conversationId) {
  return surfaces.filter((surface) => surface.conversationId === conversationId);
}

function hasReadyConversation(surfaces, conversationId) {
  return conversationSurfaces(surfaces, conversationId).some(
    (surface) => surface.projectionStatus === "ready" && !surface.inputDisabled,
  );
}

async function waitForNavigator(client, conversationId, openViewCount) {
  return waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", { conversationId }),
    (state) => state.rowCount === 1 && state.openViewCount === openViewCount,
    workflowTimeoutMs,
  );
}

async function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    async () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}

function assertDriverAction(result, property) {
  if (result?.[property] !== true) {
    throw new Error(`topic conversation action ${property} failed: ${JSON.stringify(result)}`);
  }
}

function assertDistinctConversationPalettes(surfaces, alphaId, betaId) {
  const alpha = conversationSurfaces(surfaces, alphaId)[0];
  const beta = conversationSurfaces(surfaces, betaId)[0];
  if (!alpha?.paletteId || !beta?.paletteId || alpha.paletteId === beta.paletteId) {
    throw new Error(`topic palettes were not distinct: ${JSON.stringify({ alpha, beta })}`);
  }
}

function assertPaneVoiceCaptureRequests(surfaces, ...conversationIds) {
  for (const conversationId of conversationIds) {
    const surface = requiredConversationSurface(surfaces, conversationId);
    if (!surface.paneId || !surface.voiceCaptureAvailable) {
      throw new Error(
        `conversation pane has no typed voice capture request: ${JSON.stringify(surface)}`,
      );
    }
  }
}

function assertDuplicateConversationPalette(surfaces, conversationId) {
  const duplicates = conversationSurfaces(surfaces, conversationId);
  const palettes = new Set(duplicates.map((surface) => surface.paletteId));
  const paneIds = new Set(duplicates.map((surface) => surface.paneId));
  if (duplicates.length !== 2 || palettes.size !== 1 || paneIds.size !== 2 || palettes.has("")) {
    throw new Error(`duplicate topic views diverged: ${JSON.stringify(duplicates)}`);
  }
}

function assertNavigator(state, topic, expectedOpenViews) {
  if (
    state.rowCount !== 1 ||
    state.conversationId !== topic.id ||
    state.openViewCount !== expectedOpenViews ||
    !state.label.includes(topic.title)
  ) {
    throw new Error(
      `conversation navigator mismatch: ${JSON.stringify({ expectedOpenViews, state, topic })}`,
    );
  }
}

function assertIndependentWorkingTopics(surfaces, alphaId, betaId) {
  const alpha = conversationSurfaces(surfaces, alphaId);
  const beta = conversationSurfaces(surfaces, betaId);
  if (
    alpha.length !== 2 ||
    beta.length !== 1 ||
    alpha.some((surface) => !surface.agentText.includes("hold alpha")) ||
    beta.some((surface) => !surface.agentText.includes("hold beta"))
  ) {
    throw new Error(`concurrent topic streams crossed: ${JSON.stringify({ alpha, beta })}`);
  }
}

function assertRunningTurn(snapshot, label) {
  const running = snapshot.turns.turns.find((turn) => turn.status === "running");
  if (!running?.providerTurnId) {
    throw new Error(`${label} lost its running turn: ${JSON.stringify(snapshot.turns)}`);
  }
}

function assertNarratorStatusIsolation(before, after, question) {
  const beforeRunning = before.turns.turns.find((turn) => turn.status === "running");
  const afterRunning = after.turns.turns.find((turn) => turn.status === "running");
  const reply = after.narration.events.findLast((event) => event.kind === "status_reply");

  assertStatusPrimaryTurn(before, after, beforeRunning, afterRunning);
  assertStatusProjectionCursors(before, after);
  assertStatusReply(reply, question, { after, before });
}

function assertStatusPrimaryTurn(before, after, beforeRunning, afterRunning) {
  if (
    !beforeRunning ||
    !afterRunning ||
    beforeRunning.id !== afterRunning.id ||
    beforeRunning.providerTurnId !== afterRunning.providerTurnId ||
    after.conversation.status !== "working"
  ) {
    throw new Error(`narrator status changed primary turn: ${JSON.stringify({ after, before })}`);
  }
  if (
    after.conversation.lastTrajectorySequence !== before.conversation.lastTrajectorySequence ||
    after.trajectory.events.length !== before.trajectory.events.length
  ) {
    throw new Error(
      `narrator status changed primary trajectory: ${JSON.stringify({ after, before })}`,
    );
  }
}

function assertStatusProjectionCursors(before, after) {
  if (
    after.narratorState.observedThroughSequence !== before.narratorState.observedThroughSequence ||
    after.narratorState.checkpointThroughSequence !== before.narratorState.checkpointThroughSequence
  ) {
    throw new Error(
      `narrator status changed projection cursors: ${JSON.stringify({ after, before })}`,
    );
  }
}

function assertStatusReply(reply, question, snapshots) {
  if (
    reply?.statusReply?.question !== question ||
    reply.statusReply.text !== expectedNarratorStatusReply
  ) {
    throw new Error(`narrator status reply mismatch: ${JSON.stringify({ reply, ...snapshots })}`);
  }
}

function assertAlphaLifecycle(snapshot, approvalId) {
  const kinds = snapshot.trajectory.events.map((event) => event.kind);
  assertAlphaQueueAndArtifact(snapshot);
  assertAlphaTrajectoryKinds(kinds, snapshot);
  assertAlphaApproval(snapshot, approvalId);
  assertAutomaticNarration(snapshot, "Alpha");
}

function assertAlphaQueueAndArtifact(snapshot) {
  if (snapshot.queue.length !== 0 || snapshot.artifacts.artifacts.length !== 1) {
    throw new Error(
      `Alpha queue or artifact projection is incomplete: ${JSON.stringify(snapshot)}`,
    );
  }
}

function assertAlphaTrajectoryKinds(kinds, snapshot) {
  const required = ["turn_queued", "turn_promoted", "turn_steered", "artifact_emitted"];
  const missing = required.filter((kind) => !kinds.includes(kind));
  if (missing.length > 0) {
    throw new Error(
      `Alpha trajectory is missing ${missing.join(", ")}: ${JSON.stringify(snapshot)}`,
    );
  }
}

function assertAlphaApproval(snapshot, approvalId) {
  const request = snapshot.trajectory.events.find(
    (event) => event.approvalRequested && event.approvalRequested.approval.id === approvalId,
  );
  const resolutionEvent = snapshot.trajectory.events.find(
    (event) =>
      event.approvalResolved && event.approvalResolved.resolution.approvalId === approvalId,
  );
  if (!request || !resolutionEvent) {
    throw new Error(`Alpha approval lifecycle is incomplete: ${JSON.stringify(snapshot)}`);
  }
  const answers = resolutionEvent.approvalResolved.resolution.answers;
  if (answers.length !== 1 || answers[0].answers[0] !== "focused") {
    throw new Error(`Alpha approval answer is incomplete: ${JSON.stringify(snapshot)}`);
  }
}

function assertDeniedApproval(snapshot, approvalId) {
  const resolution = snapshot.trajectory.events.find(
    (event) =>
      event.approvalResolved && event.approvalResolved.resolution.approvalId === approvalId,
  )?.approvalResolved?.resolution;
  if (
    !resolution ||
    resolution.decision !== "denied" ||
    resolution.response !== "" ||
    resolution.answers.length !== 0
  ) {
    throw new Error(`Alpha denied approval lifecycle is incomplete: ${JSON.stringify(snapshot)}`);
  }
}

function assertBetaLifecycle(snapshot) {
  const kinds = snapshot.trajectory.events.map((event) => event.kind);
  if (!kinds.includes("turn_interrupted") || !kinds.includes("turn_failed")) {
    throw new Error(`Beta terminal lifecycle is incomplete: ${JSON.stringify(snapshot)}`);
  }
  if (
    snapshot.narratorState.checkpointThroughSequence <= 0 ||
    snapshot.narratorState.checkpointThroughSequence >
      snapshot.narratorState.observedThroughSequence
  ) {
    throw new Error(`Beta narrator checkpoint is incomplete: ${JSON.stringify(snapshot)}`);
  }
  assertAutomaticNarration(snapshot, "Beta");
}

function hasFinalNarrationForEveryTurn(snapshot) {
  const summarizedTurnIds = new Set(
    snapshot.narration.events
      .filter((event) => event.kind === "final_summary" && event.turnId)
      .map((event) => event.turnId),
  );
  return snapshot.turns.turns.every((turn) => summarizedTurnIds.has(turn.id));
}

function narratorCaughtUp(snapshot) {
  return (
    snapshot.narratorState.observedThroughSequence === snapshot.conversation.lastTrajectorySequence
  );
}

function assertAutomaticNarration(snapshot, label) {
  const milestones = snapshot.narration.events.filter((event) => event.kind === "milestone");
  const finals = snapshot.narration.events.filter((event) => event.kind === "final_summary");
  if (
    milestones.length === 0 ||
    finals.length !== snapshot.turns.turns.length ||
    finals.some(
      (event) =>
        event.trigger !== "turn_terminal" ||
        !event.finalSummary?.text.startsWith("Narrator completed ") ||
        event.resolvedInvocation?.resolved?.modelId !== "gpt-5.4-mini",
    )
  ) {
    throw new Error(`${label} automatic narration is incomplete: ${JSON.stringify(snapshot)}`);
  }
}

function assertReloadedProjection(surfaces, alpha, beta) {
  const alphaSurface = requiredConversationSurface(surfaces, alpha.id);
  const betaSurface = requiredConversationSurface(surfaces, beta.id);
  if (
    alphaSurface.paletteId !== alpha.paletteId ||
    alphaSurface.artifactCount !== 1 ||
    alphaSurface.status !== "completed"
  ) {
    throw new Error(
      `reloaded topic projections do not match durable state: ${JSON.stringify({ alphaSurface, betaSurface })}`,
    );
  }
  if (betaSurface.paletteId !== beta.paletteId || betaSurface.status !== "failed") {
    throw new Error(
      `reloaded topic projections do not match durable state: ${JSON.stringify({ alphaSurface, betaSurface })}`,
    );
  }
}

function requiredConversationSurface(surfaces, conversationId) {
  const surface = conversationSurfaces(surfaces, conversationId)[0];
  if (!surface) {
    throw new Error(
      `conversation surface ${conversationId} is missing: ${JSON.stringify(surfaces)}`,
    );
  }
  return surface;
}

async function safeSurfaceStates(client) {
  try {
    return await client.driver("topicConversationSurfaceStates", {});
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
