#!/usr/bin/env node
/* global console */

import { readFile } from "node:fs/promises";
import { basename, delimiter, dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertArtifactsExcludeMarkers,
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
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import {
  configureConversationAgentApprovals,
  submitDefaultApprovalLikeTurn,
} from "./topic-conversation-default-permission-workflow.mjs";
import {
  assertPersistedMasterCancellation,
  exerciseVerifiedMasterCancellation,
} from "./topic-conversation-master-cancellation-workflow.mjs";
import {
  assertMasterRouteContextAuthority,
  assertMasterRouteDecision,
  captureActiveMasterInteraction,
  closeMasterOverlay,
  createPersistentMasterClarification,
  exerciseMasterOverlayEntryPoints,
  verifyRestoredMasterInteraction,
  waitForMasterRouteDecision,
} from "./topic-conversation-master-overlay-assertions.mjs";
import { exerciseMasterPaneRouting } from "./topic-conversation-master-pane-routing.mjs";
import {
  assertRecordedMasterSynthesis,
  assertRecordedNarrationSynthesis,
  assertRecordedProgressHighlightSynthesis,
  waitForAutomaticNarrationStatusPlayback,
  waitForMasterProviderRequest,
  waitForNarratorProviderRequest,
  waitForRecordedConversationKeepAlive,
  waitForRecordedMasterSpeechSynthesis,
  waitForRecordedSpeechSynthesis,
} from "./topic-conversation-narration-speech-assertions.mjs";
import {
  assertDistinctNarratorVoices,
  assertInactiveNarratorVoiceCapacityReleased,
  assertPersistedNarratorVoice,
  assertUnavailableExactVoiceErrors,
  exhaustNarratorVoiceCatalog,
  narratorVoice,
  updateMasterVoice,
} from "./topic-conversation-narrator-voice-workflow.mjs";
import { assertRecordedPaneLayouts } from "./topic-conversation-layout-recording.mjs";
import { saveOpenAIVoiceCredentialThroughSettingsAndClose } from "./speech-credential-byok-workflow.mjs";
import { startSpeechTranscriptionProviderFixture } from "./speech-transcription-provider-fixture.mjs";
import {
  assertDistinctConversationPalettes,
  exercisePaneFreeShellCapture,
  safeTopicConversationSurfaceStates,
  verifyConversationCapturePresentation,
  verifyIdleGlobalSpeech,
  verifyNarratorPlaybackPresentation,
  waitForRecordedPaneSpeechInput,
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
  assertIndependentWorkingTopics,
  assertNarratorStatusIsolation,
  expectedNarratorStatusReply,
  hasFinalNarrationForEveryTurn,
  narratorCaughtUp,
  requiredConversationSurface,
} from "./topic-conversation-projection-assertions.mjs";
import {
  assertApprovalDeniedNow,
  assertApprovalRequestedNow,
  assertApprovalResolvedNow,
  assertWorkingNow,
} from "./topic-conversation-now-highlight-assertions.mjs";
import { verifySideConversationRestart } from "./topic-conversation-side-restart-workflow.mjs";
import {
  assertChangedConversationInputConflicts,
  assertDispatchedConversationInputRoutingState,
  assertRecordedRoutedTextInput,
  assertRoutedConversationInputDecision,
  assertRoutedConversationInputReceipt,
  escalateToMaster,
  readConversationInputRoutingState,
  submitConversationInput,
  waitForRecordedTextConversationInput,
} from "./topic-conversation-input-routing-assertions.mjs";
import { exerciseCodexAccountNotificationWorkflow } from "./topic-conversation-codex-account-workflow.mjs";
import { assertEasyButtonBindingPersistence } from "./topic-conversation-pane-binding-assertions.mjs";
import { assertImmediateInitialEasyButtonPlaceholder } from "./topic-conversation-startup-placeholder-assertions.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-pane-projection";
const workflowTimeoutMs = 50_000;
const initialThreadStartDelayMs = 900;
const initialPanePlaceholderBudgetMs = 500;
const cancelledMasterText = "Cancel active master route.";
const shellClarificationText = "Clarify the shell topic.";
const typedMasterOverlayText = "Focus Alpha topic.";
const paneSpeechTranscript = "  Keep this pane transcript exact.  ";
const secretApprovalAnswer = "setta-private-approval-answer-20260714";
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
let shellMasterSpeech;
let cancelledMasterInput;
let sharedMasterSessionId;
let statusCapturePreemption;
let statusSpeechPlayback;
const runtimeDeviceTokens = [];

try {
  context = await launchElectronCdpContext({
    artifactDir: firstLaunchDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: speechProvider.baseURL,
      SETTA_E2E_TOPIC_CODEX_INITIAL_THREAD_START_DELAY_MS: String(initialThreadStartDelayMs),
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  let backend = await backendProbe(firstLaunchDir);
  runtimeDeviceTokens.push(backend.deviceToken);
  const workspaceOpenStartedAt = Date.now();
  const workspaceId = await openWorkspace(context.client);
  const initialPanePlaceholder = await assertImmediateInitialEasyButtonPlaceholder(
    context.client,
    workspaceOpenStartedAt,
    initialPanePlaceholderBudgetMs,
  );
  await saveOpenAIVoiceCredentialThroughSettingsAndClose(
    context.client,
    speechProvider.apiKey,
    workflowTimeoutMs,
  );
  await captureScreenshot(context.client, join(artifactDir, "initial-easy-button-startup.png"));
  const initialConversation = await waitForInitialConversation(backend, workspaceId);
  await assertInitialEasyButtonExperience(context.client, initialConversation.conversation.id);
  await assertNavigatorDoesNotOfferAnotherEasyButtonView(
    context.client,
    initialConversation.conversation.id,
  );
  await submitDefaultApprovalLikeTurn({
    client: context.client,
    conversationId: initialConversation.conversation.id,
    text: "approval default yolo",
    timeoutMs: workflowTimeoutMs,
  });
  await exerciseCodexAccountNotificationWorkflow({
    backend,
    client: context.client,
    timeoutMs: workflowTimeoutMs,
  });

  const createInitialTopic = (title) =>
    createTopic(context.client, backend, workspaceId, title, workflowTimeoutMs);
  const alpha = await createInitialTopic("Alpha topic");
  const beta = await createInitialTopic("Beta topic");
  await configureConversationAgentApprovals(backend, workspaceId, alpha.id);
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
    (page) => {
      const alphaVoice = narratorVoice(page, alpha.id);
      const betaVoice = narratorVoice(page, beta.id);
      return (
        [alphaVoice, betaVoice].every((voice) => voice && voice !== masterVoice.resolvedVoiceId) &&
        alphaVoice !== betaVoice
      );
    },
    workflowTimeoutMs,
  );
  alpha.narratorVoiceId = narratorVoice(reassignedPage, alpha.id);
  beta.narratorVoiceId = narratorVoice(reassignedPage, beta.id);
  assertDistinctNarratorVoices(alpha, beta, masterVoice.resolvedVoiceId);
  const betaVoice = await context.client.driver("presentationConfigurationUpdateNarratorVoice", {
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
  const exhaustedVoice = await exhaustNarratorVoiceCatalog(
    context.client,
    backend,
    workspaceId,
    workflowTimeoutMs,
  );
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  assertPersistedNarratorVoice(await listTopics(backend, workspaceId), exhaustedVoice);
  cancelledMasterInput = await exerciseVerifiedMasterCancellation({
    artifactDirectory: firstLaunchDir,
    backend,
    client: context.client,
    providerStatePath: fakeCodex.statePath,
    text: cancelledMasterText,
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });
  const shellClarificationRoute = await createPersistentMasterClarification({
    artifactDirectory: firstLaunchDir,
    backend,
    client: context.client,
    text: shellClarificationText,
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });
  sharedMasterSessionId = shellClarificationRoute.decision.masterSessionId;
  await stopElectronCdpContext(context);
  context = null;

  context = await launchElectronCdpContext({
    artifactDir: secondLaunchDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: speechProvider.baseURL,
      SETTA_E2E_TOPIC_CODEX_INITIAL_THREAD_START_DELAY_MS: String(initialThreadStartDelayMs),
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  backend = await backendProbe(secondLaunchDir);
  runtimeDeviceTokens.push(backend.deviceToken);
  await assertPersistedMasterCancellation(backend, cancelledMasterInput);
  const restoredWorkspaceId = await openWorkspace(context.client);
  if (restoredWorkspaceId !== workspaceId) {
    throw new Error(
      `workspace changed across application restart: ${JSON.stringify({ restoredWorkspaceId, workspaceId })}`,
    );
  }
  await verifyRestoredMasterInteraction({
    artifactPath: join(artifactDir, "master-clarification-after-restart.png"),
    client: context.client,
    expectedResultKind: "clarify",
    expectedText: shellClarificationText,
    timeoutMs: workflowTimeoutMs,
  });
  await closeMasterOverlay(context.client, workflowTimeoutMs);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await verifyRestoredMasterInteraction({
    artifactPath: join(artifactDir, "master-clarification-after-reload.png"),
    client: context.client,
    expectedResultKind: "clarify",
    expectedText: shellClarificationText,
    timeoutMs: workflowTimeoutMs,
  });
  await closeMasterOverlay(context.client, workflowTimeoutMs);
  await installScriptedRealtimeBrowser(context.client);
  const initial = await waitForConversationSurfaces(
    context.client,
    (surfaces) =>
      hasReadyConversation(surfaces, alpha.id) && hasReadyConversation(surfaces, beta.id),
  );
  await assertEasyButtonBindingPersistence(backend, workspaceId, [alpha.id, beta.id], alpha.id);
  const alphaPaneId = requiredConversationSurface(initial.surfaces, alpha.id).paneId;
  shellMasterOverlayInput = await exerciseMasterOverlayEntryPoints({
    artifactDirectory: secondLaunchDir,
    client: context.client,
    text: typedMasterOverlayText,
    timeoutMs: workflowTimeoutMs,
    waitForNavigation: true,
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
    expectedSessionId: sharedMasterSessionId,
    expectedTargetId: alpha.id,
  });
  await waitForState(
    context.client,
    driverCallExpression("topicConversationNavigatorState", { conversationId: alpha.id }),
    (state) => state.focusedPaneId === alphaPaneId,
    workflowTimeoutMs,
  );
  const reloadedVoices = await listTopics(backend, workspaceId);
  assertPersistedNarratorVoice(reloadedVoices, alpha);
  assertPersistedNarratorVoice(reloadedVoices, beta);
  assertInactiveNarratorVoiceCapacityReleased(
    reloadedVoices,
    exhaustedVoice,
    masterVoice.resolvedVoiceId,
  );
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
  const paneInput = await waitForRecordedPaneSpeechInput(
    secondLaunchDir,
    alpha.id,
    alphaPaneId,
    paneSpeechTranscript,
    workflowTimeoutMs,
  );
  const conversationInputRequest = paneInput.request;
  const acceptedConversationInput = paneInput.accepted;
  const routedConversationInput = await waitForBackendState(
    () => readConversationInputRoutingState(context.client, workspaceId, conversationInputRequest),
    (state) => state.input?.status === "dispatched",
    workflowTimeoutMs,
  );
  assertDispatchedConversationInputRoutingState(
    routedConversationInput,
    acceptedConversationInput.input,
    acceptedConversationInput.sequence,
  );
  assertRoutedConversationInputReceipt(
    acceptedConversationInput,
    await submitConversationInput(context.client, conversationInputRequest),
    acceptedConversationInput.input,
    acceptedConversationInput.sequence,
  );
  await assertChangedConversationInputConflicts(context.client, conversationInputRequest);
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    alpha.id,
    (snapshot) =>
      snapshot.conversation.status === "idle" &&
      snapshot.turns.turns.some(
        (turn) => turn.authoredInput.text === paneSpeechTranscript && turn.status === "completed",
      ),
  );
  speechProvider.assertHealthy();

  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: alpha.id,
      text: "hold alpha",
    }),
    "submitted",
  );
  const routedTextInput = await waitForRecordedTextConversationInput(
    secondLaunchDir,
    alpha.id,
    "hold alpha",
    workflowTimeoutMs,
  );
  const routedTextState = await waitForBackendState(
    () => readConversationInputRoutingState(context.client, workspaceId, routedTextInput.request),
    (state) => state.input?.status === "dispatched",
    workflowTimeoutMs,
  );
  if (
    routedTextState.decisions?.[0]?.decision?.kind !== "send_to_parent" ||
    !routedTextState.decisions[0].routerContext ||
    !routedTextState.decisions[0].resolvedInvocation
  ) {
    throw new Error(
      `pane text did not use local route by default: ${JSON.stringify(routedTextState)}`,
    );
  }
  await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) =>
      surface.state === "working" &&
      surface.agentText === "" &&
      surface.agentTextPresent === false &&
      surface.helperText === "" &&
      surface.helperPresent === false,
  );
  await waitForConversationSnapshot(backend, workspaceId, alpha.id, (snapshot) =>
    snapshotHasAgentText(snapshot, "Streaming hold alpha"),
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
      conversationSurfaces(surfaces, alpha.id).every(
        (surface) =>
          surface.state === "working" &&
          surface.agentTextPresent === false &&
          surface.helperPresent === false,
      ) &&
      conversationSurfaces(surfaces, beta.id).some(
        (surface) =>
          surface.state === "working" &&
          surface.agentTextPresent === false &&
          surface.helperPresent === false,
      ),
  );
  await waitForConversationSnapshot(backend, workspaceId, beta.id, (snapshot) =>
    snapshotHasAgentText(snapshot, "Streaming hold beta"),
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
    await context.client.driver("topicConversationSubmit", {
      conversationId: alpha.id,
      text: statusQuestion,
    }),
    "submitted",
  );
  const statusWhileWorking = await waitForConversationSurfaces(context.client, (surfaces) => {
    const alphaSurfaces = conversationSurfaces(surfaces, alpha.id);
    const betaSurfaces = conversationSurfaces(surfaces, beta.id);
    return (
      alphaSurfaces.length === 1 &&
      betaSurfaces.length === 1 &&
      alphaSurfaces.every(
        (surface) =>
          surface.state === "working" &&
          surface.statusLabel === "STATUS" &&
          surface.statusQuestion === "" &&
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
  await assertRecordedRoutedTextInput({
    artifactDirectory: secondLaunchDir,
    client: context.client,
    conversationId: alpha.id,
    expectedKind: "answer_as_narrator",
    text: statusQuestion,
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });
  statusSpeechPlayback = await waitForAutomaticNarrationStatusPlayback({
    client: context.client,
    initialRequestCount: synthesisRequestCountBeforeStatus,
    provider: speechProvider,
    resolvedVoiceId: alpha.narratorVoiceId,
    text: expectedNarratorStatusReply,
    timeoutMs: workflowTimeoutMs,
  });
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
  const recordedStatusSynthesis = await waitForRecordedSpeechSynthesis({
    artifactDirectory: secondLaunchDir,
    narrationEventId: statusEvent.id,
    timeoutMs: workflowTimeoutMs,
  });
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
  const workingInput = await waitForRecordedPaneSpeechInput(
    secondLaunchDir,
    alpha.id,
    alphaPaneId,
    paneSpeechTranscript,
    workflowTimeoutMs,
    2,
  );
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
  assertRoutedConversationInputDecision(
    routedWorkingConversationInput,
    acceptedWorkingConversationInput.input,
    "queue_parent_turn",
  );
  assertRoutedConversationInputReceipt(
    acceptedWorkingConversationInput,
    await submitConversationInput(context.client, workingConversationInputRequest),
    acceptedWorkingConversationInput.input,
    acceptedWorkingConversationInput.sequence,
  );
  const masterEscalation = await escalateToMaster({
    artifactDirectory: secondLaunchDir,
    client: context.client,
    paneId: alphaPaneId,
    timeoutMs: workflowTimeoutMs,
    topic: alpha,
    workspaceId,
  });
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
  assertMasterRouteContextAuthority(escalationMasterRoute, {
    expectedConversationId: beta.id,
    expectedKinds: ["queue_agent_turn", "steer_active_turn"],
  });

  await submitAndWaitForQueue(context.client, alpha.id, "artifact alpha", 2);
  await assertRecordedRoutedTextInput({
    artifactDirectory: secondLaunchDir,
    client: context.client,
    conversationId: alpha.id,
    expectedKind: "queue_parent_turn",
    text: "artifact alpha",
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });
  await submitAndWaitForQueue(context.client, alpha.id, "approval alpha", 3);

  await closeConversationPane(context.client, alpha.id);
  await waitForConversationSurfaces(
    context.client,
    (surfaces) => conversationSurfaces(surfaces, alpha.id).length === 0,
  );
  assertNavigator(await waitForNavigator(context.client, alpha.id, 0, workflowTimeoutMs), alpha, 0);
  const closedConversationSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    alpha.id,
    (snapshot) => snapshot.turns.turns.some((turn) => turn.authoredInput.text === "approval alpha"),
  );

  assertDriverAction(
    await context.client.driver("topicConversationPresentFromNavigator", {
      conversationId: alpha.id,
    }),
    "clicked",
  );
  await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) => surface.projectionStatus === "ready" && surface.paletteId === alpha.paletteId,
  );
  const reopenedBeforeApproval = await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) =>
      surface.projectionStatus === "ready" &&
      surface.paletteId === alpha.paletteId &&
      (surface.approvalId !== "" || surface.state === "working"),
  );
  if (reopenedBeforeApproval.approvalId === "") {
    assertDriverAction(
      await context.client.driver("topicConversationStop", {
        conversationId: alpha.id,
      }),
      "stopped",
    );
    await waitForConversationSnapshot(backend, workspaceId, alpha.id, (snapshot) =>
      snapshot.turns.turns.some(
        (turn) => turn.authoredInput.text === "hold alpha" && turn.status === "cancelled",
      ),
    );
  }
  const reopenedAwaitingApproval = await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) =>
      surface.approvalId !== "" &&
      surface.artifactCount === 1 &&
      surface.artifactText.includes("artifact.png") &&
      surface.helperText === "Waiting for approval",
  );
  assertApprovalRequestedNow(reopenedAwaitingApproval, "reopened approval", {
    artifactReady: true,
  });
  assertDriverAction(
    await context.client.driver("topicConversationRespondApproval", {
      answer: secretApprovalAnswer,
      conversationId: alpha.id,
    }),
    "answered",
  );
  const reopenedApprovalComplete = await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) =>
      surface.state === "complete" &&
      surface.status === "completed" &&
      surface.summaryText === "Approval alpha completed.",
  );
  if (reopenedApprovalComplete.artifactCount !== 1) {
    throw new Error(
      `Alpha artifact was not retained after reopened approval: ${JSON.stringify(
        reopenedApprovalComplete,
      )}`,
    );
  }
  assertApprovalResolvedNow(reopenedApprovalComplete, "reopened approval completion", {
    artifactReady: true,
  });
  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: alpha.id,
      text: "hold alpha after reopen",
    }),
    "submitted",
  );
  const reopenedWorking = await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) => surface.state === "working" && surface.paletteId === alpha.paletteId,
  );

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const reloadedWorking = await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) =>
      surface.projectionStatus === "ready" &&
      surface.state === "working" &&
      surface.paletteId === alpha.paletteId,
  );
  assertWorkingNow(reloadedWorking, "reloaded active turn");
  await waitForConversationSurface(
    context.client,
    beta.id,
    (surface) => surface.projectionStatus === "ready" && surface.state === "working",
  );

  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: alpha.id,
      text: "steer alpha now",
    }),
    "submitted",
  );
  await assertRecordedRoutedTextInput({
    artifactDirectory: secondLaunchDir,
    client: context.client,
    conversationId: alpha.id,
    expectedKind: "steer_parent_turn",
    text: "steer alpha now",
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    alpha.id,
    (snapshot) =>
      snapshot.conversation.status === "idle" &&
      snapshot.turns.turns.some(
        (turn) =>
          turn.authoredInput.text === "hold alpha after reopen" && turn.status === "completed",
      ) &&
      snapshot.trajectory.events.some(
        (event) =>
          event.kind === "turn_steered" && event.turnSteered?.input?.text === "steer alpha now",
      ),
  );
  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: alpha.id,
      text: "approval alpha after steer",
    }),
    "submitted",
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
  assertApprovalRequestedNow(awaitingApproval, "approval after steer");
  assertDriverAction(
    await context.client.driver("topicConversationRespondApproval", {
      answer: secretApprovalAnswer,
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
      surface.summaryText === "Approval alpha after steer completed.",
  );
  if (alphaComplete.artifactCount !== 1) {
    throw new Error(`Alpha artifact was not retained: ${JSON.stringify(alphaComplete)}`);
  }
  assertApprovalResolvedNow(alphaComplete, "approval after steer completion");

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
  assertApprovalRequestedNow(awaitingDenial, "command approval denial");
  assertDriverAction(
    await context.client.driver("topicConversationDenyApproval", {
      conversationId: alpha.id,
    }),
    "denied",
  );
  const denialComplete = await waitForConversationSurface(
    context.client,
    alpha.id,
    (surface) =>
      surface.state === "complete" &&
      surface.status === "completed" &&
      surface.approvalId === "" &&
      surface.summaryText === "Command approval denial completed.",
  );
  assertApprovalDeniedNow(denialComplete, "command approval denial completion");

  const masterPaneRoutes = await exerciseMasterPaneRouting({
    artifactDirectory: secondLaunchDir,
    backend,
    client: context.client,
    parentTopic: alpha,
    sessionId: sharedMasterSessionId,
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });

  const synthesisRequestCountBeforeNoPaneStop = speechProvider.requests.length;
  await closeConversationPane(context.client, beta.id);
  await waitForRecordedConversationKeepAlive({
    artifactDirectory: secondLaunchDir,
    conversationId: beta.id,
    timeoutMs: workflowTimeoutMs,
  });
  await context.client.evaluate(
    `window.setta.conversations.stop(${JSON.stringify({ conversationId: beta.id, workspaceId })})`,
  );
  const stoppedWithoutPane = await waitForConversationSnapshot(
    backend,
    workspaceId,
    beta.id,
    (snapshot) =>
      snapshot.turns.turns[0]?.status === "cancelled" &&
      snapshot.trajectory.events.some(
        (event) =>
          event.kind === "turn_interrupted" && event.turnId === snapshot.turns.turns[0]?.id,
      ),
  );
  const noPaneStopped = stoppedWithoutPane.trajectory.events.find(
    (event) =>
      event.kind === "turn_interrupted" && event.turnId === stoppedWithoutPane.turns.turns[0]?.id,
  );
  if (!noPaneStopped) {
    throw new Error("pane-free stop progress highlight was unavailable");
  }
  const recordedNoPaneSynthesis = await waitForRecordedSpeechSynthesis({
    artifactDirectory: secondLaunchDir,
    sourceEventId: noPaneStopped.id,
    sourceKind: "progress_highlight",
    timeoutMs: workflowTimeoutMs,
  });
  assertRecordedProgressHighlightSynthesis(
    recordedNoPaneSynthesis,
    beta.id,
    noPaneStopped.id,
    beta.narratorVoiceId,
  );
  noPaneTerminalSpeech = await waitForNarratorProviderRequest({
    initialRequestCount: synthesisRequestCountBeforeNoPaneStop,
    provider: speechProvider,
    resolvedVoiceId: beta.narratorVoiceId,
    text: "Stopped. Work stopped at your request.",
    timeoutMs: workflowTimeoutMs,
  });
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
      surface.summaryText === "Hold beta stopped before completion.",
  );
  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: beta.id,
      text: "narration backlog fail beta",
    }),
    "submitted",
  );
  await assertRecordedRoutedTextInput({
    artifactDirectory: secondLaunchDir,
    client: context.client,
    conversationId: beta.id,
    expectedKind: "send_to_parent",
    text: "narration backlog fail beta",
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });
  const betaFailed = await waitForConversationSurface(
    context.client,
    beta.id,
    (surface) =>
      surface.state === "complete" &&
      surface.status === "failed" &&
      surface.summaryText ===
        "Narration backlog fail beta failed; the reported error remains visible.",
  );

  await closeConversationPane(context.client, alpha.id);
  await closeConversationPane(context.client, beta.id);
  await closeConversationPane(context.client, initialConversation.conversation.id);
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
  await captureActiveMasterInteraction({
    artifactPath: join(artifactDir, "master-voice-immediate-result.png"),
    client: context.client,
    excludedTexts: [typedMasterOverlayText],
    expectedResultKind: "answer_global",
    expectedText: paneSpeechTranscript,
    timeoutMs: workflowTimeoutMs,
  });
  const masterAnswerText = voiceMasterRoute.decision?.resultingCommand?.answerGlobal?.text;
  if (typeof masterAnswerText !== "string" || masterAnswerText === "") {
    throw new Error(`master answer text is missing: ${JSON.stringify(voiceMasterRoute)}`);
  }
  const synthesisRequestCountBeforeMasterReplay = speechProvider.requests.length;
  await clickEnabledButtonByAria(context.client, "Replay master answer", workflowTimeoutMs);
  const recordedMasterSynthesis = await waitForRecordedMasterSpeechSynthesis({
    artifactDirectory: secondLaunchDir,
    inputId: shellMasterInput.accepted.input.id,
    timeoutMs: workflowTimeoutMs,
  });
  assertRecordedMasterSynthesis(
    recordedMasterSynthesis,
    shellMasterInput.accepted.input.id,
    masterVoice.resolvedVoiceId,
  );
  shellMasterSpeech = await waitForMasterProviderRequest({
    initialRequestCount: synthesisRequestCountBeforeMasterReplay,
    provider: speechProvider,
    resolvedVoiceId: masterVoice.resolvedVoiceId,
    text: masterAnswerText,
    timeoutMs: workflowTimeoutMs,
  });
  await context.client.evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.finishAllAudio()");
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
      snapshot.turns.turns.length === 8 &&
      snapshot.turns.turns.filter((turn) => turn.status === "cancelled").length === 1 &&
      snapshot.turns.turns.filter((turn) => turn.status === "completed").length === 7 &&
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
    forkTitle: "Alpha topic fork",
    parentSnapshot: alphaSnapshot,
    parentTopic: alpha,
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });
  await assertRecordedRoutedTextInput({
    artifactDirectory: secondLaunchDir,
    client: context.client,
    conversationId: alpha.id,
    expectedKind: "create_side_conversation",
    text: "side lifecycle answer",
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });
  await assertRecordedRoutedTextInput({
    artifactDirectory: secondLaunchDir,
    client: context.client,
    conversationId: alpha.id,
    expectedKind: "fork_conversation",
    text: "Alpha topic fork",
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
  await assertRecordedPaneLayouts(secondLaunchDir, [alpha.id, beta.id], workflowTimeoutMs);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  assertRoutedConversationInputReceipt(
    acceptedConversationInput,
    await submitConversationInput(context.client, conversationInputRequest),
    acceptedConversationInput.input,
    acceptedConversationInput.sequence,
  );
  assertDispatchedConversationInputRoutingState(
    await readConversationInputRoutingState(context.client, workspaceId, conversationInputRequest),
    acceptedConversationInput.input,
    acceptedConversationInput.sequence,
  );
  assertRoutedConversationInputDecision(
    await readConversationInputRoutingState(
      context.client,
      workspaceId,
      workingConversationInputRequest,
    ),
    acceptedWorkingConversationInput.input,
    "queue_parent_turn",
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
    acceptedConversationInput.input,
    acceptedConversationInput.sequence,
  );
  assertRoutedConversationInputDecision(
    await readConversationInputRoutingState(
      context.client,
      workspaceId,
      workingConversationInputRequest,
    ),
    acceptedWorkingConversationInput.input,
    "queue_parent_turn",
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
    closedConversationSnapshot,
    concurrent,
    conversationInput: acceptedConversationInput,
    masterEscalation,
    workingConversationInput: acceptedWorkingConversationInput,
    exhaustedVoice,
    initialPanePlaceholder,
    noPaneTerminalSpeech,
    reloaded,
    reopenedWorking,
    reloadedWorking,
    reloadedSideFailure,
    shellMasterInput,
    shellMasterSpeech,
    shellMasterOverlayInput,
    masterPaneRoutes,
    sideFailure,
    sideFailureTopic,
    status: "passed",
    statusCapturePreemption,
    statusSpeechPlayback,
    statusWhileWorking,
    workspaceId,
    workspaceName: basename(fixture.workspaceRoot),
  });
  await stopElectronCdpContext(context);
  context = null;
  await assertArtifactsExcludeMarkers(
    artifactDir,
    [
      "https://chatgpt.com/auth/fake-topic",
      "data:image/png;base64,",
      speechProvider.apiKey,
      speechProvider.clientSecret,
      speechProvider.audioMarker,
      speechProvider.audioBase64,
      secretApprovalAnswer,
      ...runtimeDeviceTokens,
    ],
    "private speech audio, approval, or runtime credential",
  );
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
async function waitForInitialConversation(backend, workspaceId) {
  const page = await waitForBackendState(
    () => listTopics(backend, workspaceId),
    (current) =>
      current.items.length === 1 && current.items[0]?.conversation.title === "New conversation",
    workflowTimeoutMs,
  );
  return page.items[0];
}
async function assertInitialEasyButtonExperience(client, conversationId) {
  const state = await waitForState(
    client,
    driverCallExpression("topicConversationStartupState", { conversationId }),
    initialEasyButtonExperienceReady,
    workflowTimeoutMs,
  );
  await waitForNavigator(client, conversationId, 1, workflowTimeoutMs);
  assertDriverAction(
    await client.driver("topicConversationTogglePaneMaximized", { paneId: state.paneId }),
    "clicked",
  );
  await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", { conversationId }),
    (navigator) => navigator.maximizedPaneId === state.paneId,
    workflowTimeoutMs,
  );
  assertDriverAction(
    await client.driver("topicConversationTogglePaneMaximized", { paneId: state.paneId }),
    "clicked",
  );
  await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", { conversationId }),
    (navigator) => navigator.maximizedPaneId === "",
    workflowTimeoutMs,
  );
}
function initialEasyButtonExperienceReady(state) {
  return [
    !state.createControlPresent,
    !state.searchControlPresent,
    !state.startupPanePresent,
    state.topBarSpeechStatusPresent,
    !state.voiceOffPresent,
    state.actionCount === 5,
    state.visiblePaneCount === 2,
    state.easyButtonPaneCount === 1,
    state.emptyFramePaneCount === 1,
    state.matchingSurfaceCount === 1,
  ].every(Boolean);
}
async function assertNavigatorDoesNotOfferAnotherEasyButtonView(client, conversationId) {
  const before = await waitForNavigator(client, conversationId, 1, workflowTimeoutMs);
  if (before.duplicateViewButtonCount !== 0) {
    throw new Error(
      `navigator exposed ${before.duplicateViewButtonCount} duplicate-view controls for ${conversationId}`,
    );
  }
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", { conversationId }),
    "clicked",
  );
  await waitForNavigator(client, conversationId, 1, workflowTimeoutMs);
}
async function installScriptedRealtimeBrowser(client) {
  await client.evaluate(await readFile(speechRealtimeBrowserFixture, "utf8"));
  await client.evaluate(
    `globalThis.__settaSpeechRealtimeBrowserFixture.setTranscript(${JSON.stringify(paneSpeechTranscript)})`,
  );
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
  await waitForConversationSurfaces(client, (surfaces) =>
    surfaces.every((surface) => surface.conversationId !== conversationId),
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

function snapshotHasAgentText(snapshot, expected) {
  return snapshot.trajectory.events.some((event) => {
    if (event.agentPublicTextDelta?.delta.includes(expected)) {
      return true;
    }
    return event.agentMessageCompleted?.text.includes(expected) ?? false;
  });
}
