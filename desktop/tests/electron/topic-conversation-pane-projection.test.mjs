#!/usr/bin/env node
/* global console */

import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, delimiter, dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

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
import {
  assertMasterRouteDecision,
  captureMasterHistory,
  closeMasterOverlay,
  exerciseMasterOverlayEntryPoints,
  readJsonLinesWhileAppending,
  waitForMasterRouteDecision,
} from "./topic-conversation-master-overlay-assertions.mjs";
import { startSpeechTranscriptionProviderFixture } from "./speech-transcription-provider-fixture.mjs";
import {
  assertDistinctConversationPalettes,
  exercisePaneFreeShellCapture,
  safeTopicConversationSurfaceStates,
  verifyConversationCapturePresentation,
  verifyIdleGlobalSpeech,
  verifyNarratorPlaybackPresentation,
} from "./topic-conversation-speech-state-assertions.mjs";
import {
  assertDriverAction,
  assertNavigator,
  conversationSurfaces,
  createTopic,
  exerciseEphemeralSideForkFailure,
  exerciseSideAndDurableForkWorkflow,
  hasReadyConversation,
  listTopics,
  verifyReloadedConversationProjections,
  waitForNavigator,
} from "./topic-conversation-fork-workflow.mjs";
import {
  assertAlphaLifecycle,
  assertBetaLifecycle,
  assertDeniedApproval,
  assertDuplicateConversationPalette,
  assertIndependentWorkingTopics,
  assertNarratorStatusIsolation,
  assertRunningTurn,
  expectedNarratorStatusReply,
  hasFinalNarrationForEveryTurn,
  narratorCaughtUp,
  requiredConversationSurface,
} from "./topic-conversation-projection-assertions.mjs";
import { verifySideConversationRestart } from "./topic-conversation-side-restart-workflow.mjs";
import {
  assertChangedConversationInputConflicts,
  assertDispatchedConversationInputRoutingState,
  assertQueuedConversationInputRoutingState,
  assertRoutedConversationInputReceipt,
  escalateToMaster,
  readConversationInputRoutingState,
  submitConversationInput,
} from "./topic-conversation-input-routing-assertions.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-pane-projection";
const workflowTimeoutMs = 50_000;
const typedMasterOverlayText = "Focus Alpha topic.";
const paneSpeechTranscript = "  Keep this pane transcript exact.  ";
const fakeTopicCodexFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-topic-codex-app-server.mjs",
);
const speechRealtimeBrowserFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "speech-realtime-browser-fixture.js",
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
const firstLaunchDir = join(artifactDir, "first-launch");
const secondLaunchDir = join(artifactDir, "second-launch");
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const speechProvider = await startSpeechTranscriptionProviderFixture();
let context = null;
let noPaneTerminalSpeech;
let shellMasterOverlayInput;
let shellMasterInput;
let sharedMasterSessionId;
let statusCapturePreemption;
let statusSpeechPlayback;

try {
  context = await launchElectronCdpContext({
    artifactDir: firstLaunchDir,
    extraEnv: {
      OPENAI_API_KEY: speechProvider.apiKey,
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: speechProvider.baseURL,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  let backend = await backendProbe(firstLaunchDir);
  const workspaceId = await openWorkspace(context.client);

  const createInitialTopic = (title) =>
    createTopic(context.client, backend, workspaceId, title, workflowTimeoutMs);
  const alpha = await createInitialTopic("Alpha topic");
  const beta = await createInitialTopic("Beta topic");
  assertDistinctNarratorVoices(alpha, beta, "marin");
  const masterVoice = await updateMasterVoice(context.client, {
    requestedVoiceId: "alloy",
    selection: "exact",
  });
  if (masterVoice.resolvedVoiceId !== "alloy") {
    throw new Error(
      `master voice override did not resolve exactly: ${JSON.stringify(masterVoice)}`,
    );
  }
  const reassignedPage = await waitForBackendState(
    async () => listTopics(backend, workspaceId),
    (page) => narratorVoice(page, alpha.id) === "ballad" && narratorVoice(page, beta.id) === "ash",
    workflowTimeoutMs,
  );
  alpha.narratorVoiceId = narratorVoice(reassignedPage, alpha.id);
  const betaVoice = await updateNarratorVoice(context.client, {
    conversationId: beta.id,
    selection: { requestedVoiceId: "cedar", selection: "exact" },
    workspaceId,
  });
  if (
    betaVoice.narratorVoiceSelection !== "exact" ||
    betaVoice.requestedNarratorVoiceId !== "cedar" ||
    betaVoice.resolvedNarratorVoiceId !== "cedar"
  ) {
    throw new Error(`narrator exact voice override drifted: ${JSON.stringify(betaVoice)}`);
  }
  beta.narratorVoiceId = "cedar";
  await assertUnavailableExactVoiceErrors(context.client, workspaceId, alpha.id);
  const sideFailureTopic = await createInitialTopic("Side fork failure topic");
  const sideFailure = await exerciseEphemeralSideForkFailure({
    backend,
    client: context.client,
    parentTopic: sideFailureTopic,
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });
  await closeConversationPane(context.client, sideFailureTopic.id);
  const exhaustedVoice = await exhaustNarratorVoiceCatalog(context.client, workspaceId);
  await enableGlobalMicrophone(context.client);
  await stopElectronCdpContext(context);
  context = null;

  context = await launchElectronCdpContext({
    artifactDir: secondLaunchDir,
    extraEnv: {
      OPENAI_API_KEY: speechProvider.apiKey,
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: speechProvider.baseURL,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  backend = await backendProbe(secondLaunchDir);
  const restoredWorkspaceId = await openWorkspace(context.client);
  if (restoredWorkspaceId !== workspaceId) {
    throw new Error(
      `workspace changed across application restart: ${JSON.stringify({ restoredWorkspaceId, workspaceId })}`,
    );
  }
  await installScriptedRealtimeBrowser(context.client);
  const initial = await waitForConversationSurfaces(
    context.client,
    (surfaces) =>
      hasReadyConversation(surfaces, alpha.id) && hasReadyConversation(surfaces, beta.id),
  );
  shellMasterOverlayInput = await exerciseMasterOverlayEntryPoints({
    artifactDirectory: secondLaunchDir,
    client: context.client,
    text: typedMasterOverlayText,
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });
  const typedMasterRoute = await waitForMasterRouteDecision(
    backend,
    shellMasterOverlayInput.accepted.input.id,
    workflowTimeoutMs,
  );
  assertMasterRouteDecision(typedMasterRoute, {
    expectedInputId: shellMasterOverlayInput.accepted.input.id,
    expectedKind: "focus_conversation",
    expectedTargetId: alpha.id,
  });
  sharedMasterSessionId = typedMasterRoute.decision.masterSessionId;
  const reloadedVoices = await listTopics(backend, workspaceId);
  assertPersistedNarratorVoice(reloadedVoices, alpha);
  assertPersistedNarratorVoice(reloadedVoices, beta);
  assertPersistedNarratorVoice(reloadedVoices, exhaustedVoice);
  const reloadedSideFailure = await waitForConversationSnapshot(
    backend,
    workspaceId,
    sideFailureTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (side) => side.id === sideFailure.failedSide.id && side.status === "failed",
      ),
  );
  const restoredMasterVoice = await context.client.evaluate(
    "window.setta.speech.readMasterVoiceSelection()",
  );
  if (
    restoredMasterVoice.selection !== "exact" ||
    restoredMasterVoice.requestedVoiceId !== "alloy" ||
    restoredMasterVoice.resolvedVoiceId !== "alloy"
  ) {
    throw new Error(
      `master voice did not survive application restart: ${JSON.stringify(restoredMasterVoice)}`,
    );
  }
  assertDistinctConversationPalettes(initial.surfaces, alpha.id, beta.id);
  await verifyIdleGlobalSpeech(context.client, workflowTimeoutMs);
  const alphaPaneId = requiredConversationSurface(initial.surfaces, alpha.id).paneId;
  assertDriverAction(
    await context.client.driver("topicConversationVoiceCapture", {
      conversationId: alpha.id,
    }),
    "requested",
  );
  await waitForState(
    context.client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) => state.channelOpen && state.connectionCount === 1,
    workflowTimeoutMs,
  );
  await verifyConversationCapturePresentation({
    artifactPath: join(artifactDir, "global-capture-attribution.png"),
    client: context.client,
    conversationId: alpha.id,
    conversationTitle: alpha.title,
    sourcePaneId: alphaPaneId,
    transcriptPreview: paneSpeechTranscript.trim(),
    timeoutMs: workflowTimeoutMs,
  });
  assertDriverAction(
    await context.client.driver("topicConversationVoiceCapture", {
      conversationId: alpha.id,
    }),
    "requested",
  );
  await waitForState(
    context.client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) => state.commitCount === 1,
    workflowTimeoutMs,
  );
  const paneInput = await waitForPaneSpeechInput(secondLaunchDir, alpha.id, alphaPaneId);
  const conversationInputRequest = paneInput.request;
  const acceptedConversationInput = paneInput.accepted;
  const routedConversationInput = await waitForBackendState(
    () => readConversationInputRoutingState(context.client, workspaceId, conversationInputRequest),
    (state) => state.input?.status === "dispatched",
    workflowTimeoutMs,
  );
  assertDispatchedConversationInputRoutingState(
    routedConversationInput,
    conversationInputRequest.input,
  );
  assertRoutedConversationInputReceipt(
    acceptedConversationInput,
    await submitConversationInput(context.client, conversationInputRequest),
    conversationInputRequest.input,
  );
  await assertChangedConversationInputConflicts(context.client, conversationInputRequest);
  speechProvider.assertHealthy();

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
  assertNavigator(await waitForNavigator(context.client, alpha.id, 2, workflowTimeoutMs), alpha, 2);
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
  const synthesisRequestCountBeforeStatus = speechProvider.requests.length;
  await context.client.evaluate(
    "globalThis.__settaSpeechRealtimeBrowserFixture.setAudioAutoEnd(false)",
  );
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
  statusSpeechPlayback = await waitForAutomaticNarrationStatusPlayback(
    context.client,
    speechProvider,
    synthesisRequestCountBeforeStatus,
    expectedNarratorStatusReply,
    alpha.narratorVoiceId,
  );
  await verifyNarratorPlaybackPresentation({
    artifactPath: join(artifactDir, "global-playback-attribution.png"),
    client: context.client,
    conversationId: alpha.id,
    conversationTitle: alpha.title,
    timeoutMs: workflowTimeoutMs,
  });
  const statusEvent = alphaAfterStatus.narration.events.find(
    (event) => event.kind === "status_reply",
  );
  if (!statusEvent) {
    throw new Error("status narration event was unavailable for automatic playback");
  }
  const recordedStatusSynthesis = await waitForRecordedSpeechSynthesis(
    secondLaunchDir,
    statusEvent.id,
  );
  assertRecordedNarrationSynthesis(
    recordedStatusSynthesis,
    alpha.id,
    statusEvent.id,
    alpha.narratorVoiceId,
  );
  const playbackBeforeCapture = await context.client.evaluate(
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
  );
  assertDriverAction(
    await context.client.driver("topicConversationVoiceCapture", {
      conversationId: alpha.id,
    }),
    "requested",
  );
  statusCapturePreemption = await waitForState(
    context.client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) =>
      state.mediaRequestCount === playbackBeforeCapture.mediaRequestCount + 1 &&
      state.audioPauseCount === playbackBeforeCapture.audioPauseCount + 1,
    workflowTimeoutMs,
  );
  await verifyConversationCapturePresentation({
    artifactPath: join(artifactDir, "global-capture-preemption.png"),
    client: context.client,
    conversationId: alpha.id,
    conversationTitle: alpha.title,
    sourcePaneId: alphaPaneId,
    transcriptPreview: paneSpeechTranscript.trim(),
    timeoutMs: workflowTimeoutMs,
  });
  assertDriverAction(
    await context.client.driver("topicConversationVoiceCapture", {
      conversationId: alpha.id,
    }),
    "requested",
  );
  await waitForState(
    context.client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) => state.commitCount === playbackBeforeCapture.commitCount + 1,
    workflowTimeoutMs,
  );
  await context.client.evaluate(
    "globalThis.__settaSpeechRealtimeBrowserFixture.setAudioAutoEnd(true)",
  );
  const workingInput = await waitForPaneSpeechInput(secondLaunchDir, alpha.id, alphaPaneId, 2);
  const workingConversationInputRequest = workingInput.request;
  const acceptedWorkingConversationInput = workingInput.accepted;
  const routedWorkingConversationInput = await waitForBackendState(
    () =>
      readConversationInputRoutingState(
        context.client,
        workspaceId,
        workingConversationInputRequest,
      ),
    (state) => state.input?.status === "dispatched",
    workflowTimeoutMs,
  );
  assertQueuedConversationInputRoutingState(
    routedWorkingConversationInput,
    workingConversationInputRequest.input,
  );
  assertRoutedConversationInputReceipt(
    acceptedWorkingConversationInput,
    await submitConversationInput(context.client, workingConversationInputRequest),
    workingConversationInputRequest.input,
    2,
  );
  const masterEscalation = await escalateToMaster(context.client, alpha, alphaPaneId, workspaceId);
  const escalationMasterInputId =
    masterEscalation.state.decisions[0]?.resultingCommand?.escalateToMaster?.masterInputId;
  const escalationMasterRoute = await waitForMasterRouteDecision(
    backend,
    escalationMasterInputId,
    workflowTimeoutMs,
  );
  assertMasterRouteDecision(escalationMasterRoute, {
    expectedInputId: escalationMasterInputId,
    expectedKind: "clarify",
    expectedSessionId: sharedMasterSessionId,
  });

  await submitAndWaitForQueue(context.client, alpha.id, "artifact alpha", 1);
  await submitAndWaitForQueue(context.client, alpha.id, "approval alpha", 2);

  await closeConversationPane(context.client, alpha.id);
  await closeConversationPane(context.client, alpha.id);
  await waitForConversationSurfaces(
    context.client,
    (surfaces) => conversationSurfaces(surfaces, alpha.id).length === 0,
  );
  assertNavigator(await waitForNavigator(context.client, alpha.id, 0, workflowTimeoutMs), alpha, 0);
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

  const synthesisRequestCountBeforeNoPaneStop = speechProvider.requests.length;
  await closeConversationPane(context.client, beta.id);
  await waitForConversationSurfaces(
    context.client,
    (surfaces) => conversationSurfaces(surfaces, beta.id).length === 0,
  );
  await waitForRecordedConversationKeepAlive(secondLaunchDir, beta.id);
  await context.client.evaluate(
    `window.setta.conversations.stop(${JSON.stringify({ conversationId: beta.id, workspaceId })})`,
  );
  const stoppedWithoutPane = await waitForConversationSnapshot(
    backend,
    workspaceId,
    beta.id,
    (snapshot) =>
      snapshot.turns.turns[0]?.status === "cancelled" &&
      snapshot.narration.events.some(
        (event) => event.kind === "final_summary" && event.turnId === snapshot.turns.turns[0]?.id,
      ),
  );
  const noPaneFinal = stoppedWithoutPane.narration.events.find(
    (event) =>
      event.kind === "final_summary" && event.turnId === stoppedWithoutPane.turns.turns[0]?.id,
  );
  if (!noPaneFinal) {
    throw new Error("terminal narration was unavailable after stopping a pane-free conversation");
  }
  const recordedNoPaneSynthesis = await waitForRecordedSpeechSynthesis(
    secondLaunchDir,
    noPaneFinal.id,
  );
  assertRecordedNarrationSynthesis(
    recordedNoPaneSynthesis,
    beta.id,
    noPaneFinal.id,
    beta.narratorVoiceId,
  );
  noPaneTerminalSpeech = await waitForNarrationProviderRequest(
    speechProvider,
    synthesisRequestCountBeforeNoPaneStop,
    noPaneFinal.finalSummary.text,
    beta.narratorVoiceId,
  );
  assertDriverAction(
    await context.client.driver("topicConversationPresentFromNavigator", {
      conversationId: beta.id,
    }),
    "clicked",
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

  await closeConversationPane(context.client, alpha.id);
  await closeConversationPane(context.client, beta.id);
  await waitForConversationSurfaces(context.client, (surfaces) => surfaces.length === 0);
  await installScriptedRealtimeBrowser(context.client);
  shellMasterInput = await exercisePaneFreeShellCapture({
    artifactDirectory: secondLaunchDir,
    artifactPath: join(artifactDir, "shell-master-capture-without-panes.png"),
    client: context.client,
    timeoutMs: workflowTimeoutMs,
    transcript: paneSpeechTranscript,
    workspaceId,
  });
  const voiceMasterRoute = await waitForMasterRouteDecision(
    backend,
    shellMasterInput.accepted.input.id,
    workflowTimeoutMs,
  );
  assertMasterRouteDecision(voiceMasterRoute, {
    expectedInputId: shellMasterInput.accepted.input.id,
    expectedKind: "answer_global",
    expectedSessionId: sharedMasterSessionId,
  });
  await captureMasterHistory({
    artifactPath: join(artifactDir, "shared-master-text-voice-history.png"),
    client: context.client,
    expectedTexts: [typedMasterOverlayText, paneSpeechTranscript],
    timeoutMs: workflowTimeoutMs,
  });
  await closeMasterOverlay(context.client, workflowTimeoutMs);
  assertDriverAction(
    await context.client.driver("topicConversationPresentFromNavigator", {
      conversationId: alpha.id,
    }),
    "clicked",
  );
  assertDriverAction(
    await context.client.driver("topicConversationPresentFromNavigator", {
      conversationId: beta.id,
    }),
    "clicked",
  );
  await waitForConversationSurfaces(
    context.client,
    (surfaces) =>
      conversationSurfaces(surfaces, alpha.id).length === 1 &&
      conversationSurfaces(surfaces, beta.id).length === 1,
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

  const {
    forkComplete: alphaForkComplete,
    forkSnapshot: alphaForkSnapshot,
    forkTerminalSnapshot: alphaForkTerminalSnapshot,
    forkTopic: alphaFork,
    restartSide: alphaRestartSide,
    side: alphaSide,
  } = await exerciseSideAndDurableForkWorkflow({
    backend,
    client: context.client,
    forkTitle: "Alpha durable fork",
    parentSnapshot: alphaSnapshot,
    parentTopic: alpha,
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });

  await waitForBackendState(
    () => backend.post("/workspaces/ui/layout/read", { workspaceId }),
    (result) =>
      result.layout?.panes.some(
        (pane) =>
          pane.paneId === alphaRestartSide.parentPaneId &&
          pane.easyButtonConfig?.conversationId === alpha.id,
      ) === true &&
      result.layout.panes.some((pane) => pane.easyButtonConfig?.conversationId === beta.id),
    workflowTimeoutMs,
  );
  await captureScreenshot(context.client, join(artifactDir, "commands-complete.png"));
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  assertRoutedConversationInputReceipt(
    acceptedConversationInput,
    await submitConversationInput(context.client, conversationInputRequest),
    conversationInputRequest.input,
  );
  assertDispatchedConversationInputRoutingState(
    await readConversationInputRoutingState(context.client, workspaceId, conversationInputRequest),
    conversationInputRequest.input,
  );
  assertQueuedConversationInputRoutingState(
    await readConversationInputRoutingState(
      context.client,
      workspaceId,
      workingConversationInputRequest,
    ),
    workingConversationInputRequest.input,
  );
  await masterEscalation.assertPersisted(context.client);
  const reloaded = await verifyReloadedConversationProjections({
    alpha,
    beta,
    client: context.client,
    restartSide: alphaRestartSide,
    timeoutMs: workflowTimeoutMs,
  });
  assertNavigator(await waitForNavigator(context.client, alpha.id, 1, workflowTimeoutMs), alpha, 1);
  assertNavigator(await waitForNavigator(context.client, beta.id, 1, workflowTimeoutMs), beta, 1);
  assertNavigator(
    await waitForNavigator(context.client, alphaFork.id, 0, workflowTimeoutMs),
    alphaFork,
    0,
  );
  const sideRestart = await verifySideConversationRestart({
    alpha,
    alphaFork,
    alphaForkTerminalSnapshot,
    alphaRestartSide,
    alphaSide,
    artifactDir,
    backend,
    context,
    fakeCodex,
    fixture,
    openWorkspace,
    speechProvider,
    visible: options.visible,
    waitForConversationSnapshot,
    workspaceId,
  });
  context = sideRestart.context;
  const {
    alphaForkReloadedSnapshot,
    alphaRestartSideRecoveredSnapshot,
    alphaRestartSideReloadedSnapshot,
    alphaSideReloadedSnapshot,
  } = sideRestart;
  assertDispatchedConversationInputRoutingState(
    await readConversationInputRoutingState(context.client, workspaceId, conversationInputRequest),
    conversationInputRequest.input,
  );
  assertQueuedConversationInputRoutingState(
    await readConversationInputRoutingState(
      context.client,
      workspaceId,
      workingConversationInputRequest,
    ),
    workingConversationInputRequest.input,
  );

  await writeJson(join(artifactDir, "summary.json"), {
    alpha,
    alphaAfterStatus,
    alphaBeforeStatus,
    alphaComplete,
    alphaFork,
    alphaForkComplete,
    alphaForkSnapshot,
    alphaForkTerminalSnapshot,
    alphaForkReloadedSnapshot,
    alphaSide,
    alphaSideReloadedSnapshot,
    alphaRestartSide,
    alphaRestartSideReloadedSnapshot,
    alphaRestartSideRecoveredSnapshot,
    alphaSnapshot,
    artifactDir,
    beta,
    betaFailed,
    betaSnapshot,
    closedWorkingSnapshot,
    concurrent,
    conversationInput: acceptedConversationInput,
    masterEscalation,
    workingConversationInput: acceptedWorkingConversationInput,
    duplicated,
    exhaustedVoice,
    noPaneTerminalSpeech,
    reloaded,
    reopenedWorking,
    reloadedWorking,
    reloadedSideFailure,
    shellMasterInput,
    shellMasterOverlayInput,
    sideFailure,
    sideFailureTopic,
    status: "passed",
    statusCapturePreemption,
    statusSpeechPlayback,
    statusWhileWorking,
    workspaceId,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron topic conversation production workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      surfaces: await safeTopicConversationSurfaceStates(context.client),
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
  await speechProvider.close();
}

async function installFakeTopicCodex(fixture) {
  const binDir = join(fixture.tempRoot, "fake-topic-bin");
  const statePath = join(fixture.tempRoot, "fake-topic-codex-state.json");
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
  return { binDir, statePath };
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

async function assertUnavailableExactVoiceErrors(client, workspaceId, conversationId) {
  const narratorError = await rejectedVoiceUpdate(client, "narrator", {
    conversationId,
    selection: { requestedVoiceId: "retired", selection: "exact" },
    workspaceId,
  });
  assertUnavailableVoiceError(narratorError, "narrator");
  const masterError = await rejectedVoiceUpdate(client, "master", {
    requestedVoiceId: "retired",
    selection: "exact",
  });
  assertUnavailableVoiceError(masterError, "master");
}

async function rejectedVoiceUpdate(client, target, request) {
  return client.evaluate(`(async () => {
    try {
      const api = ${target === "master" ? "window.setta.speech.updateMasterVoiceSelection" : "window.setta.conversations.updateNarratorVoice"};
      await api(${JSON.stringify(request)});
      return { message: "", rejected: false };
    } catch (error) {
      return { message: String(error?.message ?? error), rejected: true };
    }
  })()`);
}

function assertUnavailableVoiceError(result, target) {
  if (
    !result.rejected ||
    !result.message.includes("retired") ||
    !result.message.includes("not available")
  ) {
    throw new Error(`${target} unavailable exact voice result drifted: ${JSON.stringify(result)}`);
  }
}

async function exhaustNarratorVoiceCatalog(client, workspaceId) {
  const capabilities = await client.evaluate("window.setta.speech.readCapabilities()");
  const master = await client.evaluate("window.setta.speech.readMasterVoiceSelection()");
  const page = await client.evaluate(
    `window.setta.conversations.list(${JSON.stringify({ cursor: null, limit: 80, query: "", workspaceId })})`,
  );
  const availableNarratorVoices = capabilities.voiceCatalog.voiceIds.filter(
    (voiceId) => voiceId !== master.resolvedVoiceId,
  );
  const creationCount = availableNarratorVoices.length - page.items.length + 1;
  if (creationCount < 1) {
    throw new Error(
      `voice exhaustion precondition is invalid: ${JSON.stringify({ availableNarratorVoices, page })}`,
    );
  }
  let exhausted = null;
  for (let index = 0; index < creationCount; index += 1) {
    exhausted = await client.evaluate(
      `window.setta.conversations.create(${JSON.stringify({
        title: `Voice exhaustion topic ${String(index + 1).padStart(2, "0")}`,
        workspaceId,
      })})`,
    );
  }
  return explicitNarratorReuse(exhausted, master.resolvedVoiceId);
}

function explicitNarratorReuse(exhausted, masterVoiceId) {
  if (exhausted === null) {
    throw new Error("finite narrator catalog exhaustion created no conversation");
  }
  const profile = exhausted.presentationProfile;
  if (
    profile.narratorVoiceSelection !== "auto_distinct" ||
    profile.resolvedNarratorVoiceId === masterVoiceId ||
    profile.narratorVoiceReuse?.reason !== "catalog_exhausted" ||
    profile.narratorVoiceReuse.conflictingConversationIds.length === 0
  ) {
    throw new Error(`finite narrator catalog reuse is not explicit: ${JSON.stringify(exhausted)}`);
  }
  return {
    id: exhausted.conversation.id,
    narratorVoiceId: profile.resolvedNarratorVoiceId,
    narratorVoiceReuse: profile.narratorVoiceReuse,
    title: exhausted.conversation.title,
  };
}

function assertDistinctNarratorVoices(alpha, beta, masterVoiceId) {
  if (
    alpha.narratorVoiceId === beta.narratorVoiceId ||
    alpha.narratorVoiceId === masterVoiceId ||
    beta.narratorVoiceId === masterVoiceId
  ) {
    throw new Error(
      `automatic narrator voices are not distinct: ${JSON.stringify({ alpha, beta, masterVoiceId })}`,
    );
  }
}

function narratorVoice(page, conversationId) {
  return page.items.find((item) => item.conversation.id === conversationId)?.presentationProfile
    .resolvedNarratorVoiceId;
}

function assertPersistedNarratorVoice(page, conversation) {
  const item = page.items.find((candidate) => candidate.conversation.id === conversation.id);
  if (
    !item ||
    item.presentationProfile.resolvedNarratorVoiceId !== conversation.narratorVoiceId ||
    (conversation.narratorVoiceReuse !== undefined &&
      JSON.stringify(item.presentationProfile.narratorVoiceReuse) !==
        JSON.stringify(conversation.narratorVoiceReuse))
  ) {
    throw new Error(
      `narrator voice did not survive restart: ${JSON.stringify({ conversation, item })}`,
    );
  }
}

async function updateMasterVoice(client, request) {
  return client.evaluate(
    `window.setta.speech.updateMasterVoiceSelection(${JSON.stringify(request)})`,
  );
}

async function updateNarratorVoice(client, request) {
  return client.evaluate(
    `window.setta.conversations.updateNarratorVoice(${JSON.stringify(request)})`,
  );
}

async function waitForAutomaticNarrationStatusPlayback(
  client,
  provider,
  initialRequestCount,
  text,
  resolvedVoiceId,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const request = provider.requests
      .slice(initialRequestCount)
      .find(
        (candidate) =>
          candidate.path === "/v1/audio/speech" &&
          candidate.input === text &&
          candidate.voice === resolvedVoiceId,
      );
    if (request) {
      const audio = await waitForState(
        client,
        "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
        (state) => state.audioPlayCount > state.audioEndCount,
        workflowTimeoutMs,
      );
      provider.assertHealthy();
      return { audio, providerRequest: request };
    }
    await client.evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.finishAllAudio()");
    await delay(20);
  }
  throw new Error("automatic narrator status playback did not reach the speech provider");
}

async function waitForNarrationProviderRequest(
  provider,
  initialRequestCount,
  text,
  resolvedVoiceId,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const request = provider.requests
      .slice(initialRequestCount)
      .find(
        (candidate) =>
          candidate.path === "/v1/audio/speech" &&
          candidate.input === text &&
          candidate.voice === resolvedVoiceId,
      );
    if (request) {
      provider.assertHealthy();
      return request;
    }
    await delay(20);
  }
  throw new Error("pane-free terminal narration playback did not reach the speech provider");
}

function assertRecordedNarrationSynthesis(
  event,
  conversationId,
  narrationEventId,
  resolvedVoiceId,
) {
  const operation = event.args?.[0];
  if (
    event.channel !== "speech:synthesize" ||
    typeof operation?.operationId !== "string" ||
    !operation.operationId.startsWith("speech_") ||
    operation.request?.resolvedVoiceId !== resolvedVoiceId
  ) {
    throw new Error(`automatic narration synthesis source drifted: ${JSON.stringify(event)}`);
  }
  assertRecordedNarratorSource(operation.request.source, conversationId, narrationEventId, event);
}

function assertRecordedNarratorSource(source, conversationId, narrationEventId, event) {
  if (
    source?.speaker !== "narrator" ||
    source.conversationId !== conversationId ||
    source.eventId !== narrationEventId
  ) {
    throw new Error(`automatic narration synthesis source drifted: ${JSON.stringify(event)}`);
  }
}

async function enableGlobalMicrophone(client) {
  await client.evaluate(
    'localStorage.setItem("setta.global-speech.microphone-enabled.v1", "enabled")',
  );
}

async function installScriptedRealtimeBrowser(client) {
  await client.evaluate(await readFile(speechRealtimeBrowserFixture, "utf8"));
  await client.evaluate(
    `globalThis.__settaSpeechRealtimeBrowserFixture.setTranscript(${JSON.stringify(paneSpeechTranscript)})`,
  );
}

async function waitForRecordedSpeechSynthesis(artifactDirectory, narrationEventId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const events = await readJsonLinesWhileAppending(join(artifactDirectory, "ipc.jsonl"));
    const synthesis = events.find(
      (event) =>
        event.type === "ipc_start" &&
        event.channel === "speech:synthesize" &&
        event.args?.[0]?.request?.source?.eventId === narrationEventId,
    );
    if (synthesis) {
      return synthesis;
    }
    await delay(20);
  }
  throw new Error(`speech synthesis IPC was not recorded for narration ${narrationEventId}`);
}

async function waitForRecordedConversationKeepAlive(artifactDirectory, conversationId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const events = await readJsonLinesWhileAppending(join(artifactDirectory, "ipc.jsonl"));
    const release = events.find(
      (event) =>
        event.type === "ipc_start" &&
        event.channel === "conversation:release-events" &&
        event.args?.[0]?.conversationId === conversationId &&
        event.args[0].keepAlive === true,
    );
    if (release && events.some((event) => event.type === "ipc_finish" && event.id === release.id)) {
      return release;
    }
    await delay(20);
  }
  throw new Error(`conversation stream was not retained for pane-free work ${conversationId}`);
}

async function waitForPaneSpeechInput(
  artifactDirectory,
  conversationId,
  sourcePaneId,
  occurrence = 1,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const events = await readJsonLinesWhileAppending(join(artifactDirectory, "ipc.jsonl"));
    const starts = events.filter(
      (event) =>
        event.type === "ipc_start" &&
        event.channel === "conversation:submit-input" &&
        event.args?.[0]?.input?.conversationId === conversationId &&
        event.args[0].input.sourcePaneId === sourcePaneId &&
        event.args[0].input.text === paneSpeechTranscript,
    );
    if (
      events.some(
        (event) =>
          event.type === "ipc_start" &&
          event.channel === "master:submit-input" &&
          event.args?.[0]?.input?.text === paneSpeechTranscript,
      )
    ) {
      throw new Error("pane speech transcript was submitted to the global master");
    }
    const uniqueStarts = Array.from(
      new Map(starts.map((start) => [start.args[0].input.id, start])).values(),
    );
    if (uniqueStarts.length > occurrence) {
      throw new Error(`too many durable pane speech inputs: ${uniqueStarts.length}`);
    }
    const start = uniqueStarts[occurrence - 1];
    const finish = start
      ? events.find(
          (event) =>
            event.type === "ipc_finish" &&
            event.channel === "conversation:submit-input" &&
            event.id === start.id,
        )
      : null;
    if (start && finish) {
      const request = start.args[0];
      assertRecordedPaneSpeechInput(request.input, conversationId, sourcePaneId);
      return { accepted: finish.result, request };
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for durable pane speech input delivery ${occurrence}`);
}

function assertRecordedPaneSpeechInput(input, conversationId, sourcePaneId) {
  assertPaneSpeechField(input, "conversationId", conversationId);
  assertPaneSpeechField(input, "sourcePaneId", sourcePaneId);
  assertPaneSpeechField(input, "replyToInputId", null);
  assertPaneSpeechField(input, "modality", "voice");
  assertPaneSpeechField(input, "requestedMode", "route");
  assertPaneSpeechField(input, "text", paneSpeechTranscript);
  assertNonEmptyPaneSpeechField(input, "id");
  assertNonEmptyPaneSpeechField(input, "submittedAt");
}

function assertPaneSpeechField(input, field, expected) {
  if (input?.[field] !== expected) {
    throw new Error(`invalid pane speech input ${field}: ${JSON.stringify(input)}`);
  }
}

function assertNonEmptyPaneSpeechField(input, field) {
  if (typeof input?.[field] !== "string" || input[field].length === 0) {
    throw new Error(`invalid pane speech input ${field}: ${JSON.stringify(input)}`);
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

async function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    async () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}
