import {
  clickEnabledButtonByAria,
  reloadPage,
  waitForSelector,
  waitForState,
} from "./electron-cdp-harness.mjs";
import { clickButtonByText } from "./chat-workflow-harness.mjs";
import {
  clickEasyButtonStop,
  easyButtonStateExpression,
  easyButtonStateSettled,
  openEasyButtonFromShortcut,
  workflowTimeoutMs,
  workspaceIdExpression,
} from "./easy-button-pane-actions.mjs";

export async function runSpeechCaptureFailureCases({
  client,
  firstWorkspaceId,
  narratorFailureRequest,
  preservedDraft,
  rejectedTranscript,
  secondWorkspace,
  stoppedRunId,
}) {
  await exercisePermissionDenial(client, preservedDraft, stoppedRunId, firstWorkspaceId);
  await callBrowserFixture(client, "allowMicrophone");
  await exerciseEmptyCompletion(client, preservedDraft, stoppedRunId, firstWorkspaceId);
  await exerciseTranscriptionFailure(client, preservedDraft, stoppedRunId, firstWorkspaceId);
  await exercisePaneTeardown(client, preservedDraft);
  await exerciseWorkspaceSwitch(client, preservedDraft, secondWorkspace);
  await exerciseRejectedSpokenStart(client, {
    narratorFailureRequest,
    preservedDraft,
    rejectedTranscript,
    workspaceId: secondWorkspace.id,
  });
  await exerciseReloadTeardown(client, {
    narratorFailureRequest,
    preservedDraft,
    workspaceId: secondWorkspace.id,
  });
}

async function exercisePermissionDenial(client, draft, expectedRunId, workspaceId) {
  await setFooterDraft(client, draft);
  await callBrowserFixture(client, "holdMicrophone");
  await clickStartVoiceRequest(client);
  await waitForCaptureState(client, (state) => state.capture === "requesting-permission");
  await callBrowserFixture(client, "denyMicrophone");
  const denied = await waitForCaptureState(
    client,
    (state) => state.capture === "failed" && state.captureError.includes("access was denied"),
  );
  assertFailedCaptureRestored(denied, draft);
  await assertLatestEasyRunId(client, workspaceId, expectedRunId, "microphone denial");
}

async function exerciseEmptyCompletion(client, draft, expectedRunId, workspaceId) {
  await beginSpeechCapture(client, draft);
  await commitCapture(client);
  await callBrowserFixture(client, "emitCompleted", " \n ");
  const empty = await waitForCaptureState(
    client,
    (state) => state.capture === "failed" && state.captureError.includes("No speech was detected"),
  );
  assertFailedCaptureRestored(empty, draft);
  await assertLatestEasyRunId(client, workspaceId, expectedRunId, "empty completion");
}

async function exerciseTranscriptionFailure(client, draft, expectedRunId, workspaceId) {
  await beginSpeechCapture(client, draft);
  await commitCapture(client);
  await callBrowserFixture(client, "emitTranscriptionFailed");
  const failed = await waitForCaptureState(
    client,
    (state) =>
      state.capture === "failed" &&
      state.captureError.includes("could not transcribe the recorded audio"),
  );
  assertFailedCaptureRestored(failed, draft);
  if (failed.captureError.includes("fixture provider body")) {
    throw new Error(`provider error prose reached the pane: ${JSON.stringify(failed)}`);
  }
  await assertLatestEasyRunId(client, workspaceId, expectedRunId, "provider failure");
}

async function exercisePaneTeardown(client, draft) {
  await beginSpeechCapture(client, draft);
  const pane = await client.driver("easyButtonPaneState");
  const closed = await client.driver("easyButtonPaneClose", { paneId: pane.paneId });
  if (!closed) {
    throw new Error(`active speech pane did not close: ${JSON.stringify(pane)}`);
  }
  await waitForState(
    client,
    easyButtonStateExpression(),
    (state) => state.exists === false,
    workflowTimeoutMs,
  );
  assertClosedCaptureResources(
    await waitForCaptureState(client, captureResourcesClosed),
    "pane close",
  );
  await openEasyButtonFromShortcut(client);
  await waitForConfiguredRestingCapture(client);
}

async function exerciseWorkspaceSwitch(client, draft, nextWorkspace) {
  await beginSpeechCapture(client, draft);
  await clickButtonByText(client, nextWorkspace.displayName);
  await waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId === nextWorkspace.id,
    workflowTimeoutMs,
  );
  assertClosedCaptureResources(
    await waitForCaptureState(client, captureResourcesClosed),
    "workspace switch",
  );
  await openEasyButtonFromShortcut(client);
  assertRestingCapture(await waitForConfiguredRestingCapture(client));
}

async function exerciseRejectedSpokenStart(
  client,
  { narratorFailureRequest, preservedDraft, rejectedTranscript, workspaceId },
) {
  await beginSpeechCapture(client, preservedDraft);
  const directStart = await client.driver("easyButtonPaneStartDirect", narratorFailureRequest);
  if (!directStart.ok) {
    throw new Error(`blocking Easy Run did not start: ${JSON.stringify(directStart)}`);
  }
  await waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.easyState === "working" &&
      state.runRequestText === narratorFailureRequest &&
      state.buttonAriaLabel === "Finish voice steering" &&
      state.stopButtonVisible &&
      !state.stopButtonDisabled,
    workflowTimeoutMs,
  );
  await commitCapture(client);
  await callBrowserFixture(client, "emitCompleted", rejectedTranscript);
  const rejected = await waitForCaptureState(
    client,
    (state) => state.capture === "failed" && state.captureError.includes("already working"),
  );
  if (rejected.inputValue !== rejectedTranscript || !rejected.inputFocused) {
    throw new Error(`rejected speech was not restored exactly: ${JSON.stringify(rejected)}`);
  }
  assertClosedCaptureResources(rejected, "rejected spoken start");
  assertSingleTriggerChatRecord(
    await client.driver("easyButtonPaneChatRecord"),
    narratorFailureRequest,
    rejectedTranscript,
  );
  await clickEasyButtonStop(client);
  await waitForEasyButtonTerminal(client, narratorFailureRequest);
  await assertLatestEasyRunId(client, workspaceId, directStart.run.id, "rejected spoken start");
}

async function exerciseReloadTeardown(
  client,
  { narratorFailureRequest, preservedDraft, workspaceId },
) {
  await beginSpeechCapture(client, preservedDraft);
  await commitCapture(client);
  const partialTranscript = "reload must discard this partial transcript";
  await callBrowserFixture(client, "emitDelta", partialTranscript);
  await waitForCaptureState(client, (state) => state.captureLine === partialTranscript);
  const runId = await latestEasyRunId(client, workspaceId);
  await reloadPage(client);
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await client.installDriver();
  const restored = await waitForCaptureState(
    client,
    (state) =>
      state.capture === "off" &&
      state.captureLine === "" &&
      state.fixture.activeTrackCount === 0 &&
      state.speech === "configured",
  );
  assertRestingCapture(restored);
  await assertLatestEasyRunId(client, workspaceId, runId, "reload teardown");
  assertSingleTriggerChatRecord(
    await client.driver("easyButtonPaneChatRecord"),
    narratorFailureRequest,
    partialTranscript,
  );
}

async function beginSpeechCapture(client, draft) {
  await setFooterDraft(client, draft);
  await clickStartVoiceRequest(client);
  await waitForCaptureState(
    client,
    (state) => state.capture === "connecting" && state.fixture.dataChannelLabel === "oai-events",
  );
  await callBrowserFixture(client, "openProviderSession");
  const listening = await waitForCaptureState(client, (state) => state.capture === "listening");
  if (listening.inputValue !== draft) {
    throw new Error(`speech failure case lost its draft: ${JSON.stringify(listening)}`);
  }
}

async function clickStartVoiceRequest(client) {
  const state = await client.evaluate(captureStateExpression());
  const label = state.buttonAriaLabel;
  if (label !== "Start voice request" && label !== "Retry voice request") {
    throw new Error(`voice request could not start from ${JSON.stringify(state)}`);
  }
  await clickEnabledButtonByAria(client, label);
}

async function commitCapture(client) {
  const state = await client.evaluate(captureStateExpression());
  const label = state.buttonAriaLabel;
  if (label !== "Finish voice request" && label !== "Finish voice steering") {
    throw new Error(`voice request could not commit from ${JSON.stringify(state)}`);
  }
  await clickEnabledButtonByAria(client, label);
  await waitForCaptureState(
    client,
    (state) => state.capture === "committing" && state.fixture.commitCount === 1,
  );
}

function waitForEasyButtonTerminal(client, requestText) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "complete") &&
      state.runRequestText === requestText &&
      state.summaryText !== "",
    workflowTimeoutMs,
  );
}

function waitForConfiguredRestingCapture(client) {
  return waitForCaptureState(
    client,
    (state) => state.capture === "off" && state.speech === "configured",
  );
}

function captureStateExpression() {
  return "globalThis.__settaSpeechCaptureFixture?.state() ?? {}";
}

function waitForCaptureState(client, isReady) {
  return waitForState(client, captureStateExpression(), isReady);
}

function callBrowserFixture(client, method, argument) {
  const serializedArgument = argument === undefined ? "" : JSON.stringify(argument);
  return client.evaluate(
    `globalThis.__settaSpeechCaptureFixture[${JSON.stringify(method)}](${serializedArgument})`,
  );
}

function setFooterDraft(client, value) {
  return client.driver("setInputValue", {
    selector: '[data-testid="easy-button-input"]',
    value,
  });
}

function assertFailedCaptureRestored(state, expectedDraft) {
  if (state.inputValue !== expectedDraft) {
    throw new Error(`failed capture did not preserve its draft: ${JSON.stringify(state)}`);
  }
  assertClosedCaptureResources(state, "failed capture");
}

function captureResourcesClosed(state) {
  return (
    state.fixture.activeTrackCount === 0 && state.fixture.channelClosed && state.fixture.peerClosed
  );
}

function assertClosedCaptureResources(state, label) {
  if (!captureResourcesClosed(state)) {
    throw new Error(`${label} leaked capture resources: ${JSON.stringify(state)}`);
  }
}

function assertRestingCapture(state) {
  if (state.capturing !== "false" || state.inputDisabled || state.captureLine !== "") {
    throw new Error(`configured capture did not rest cleanly: ${JSON.stringify(state)}`);
  }
}

function assertSingleTriggerChatRecord(page, requestText, rejectedText) {
  const userMessages = page?.messages?.filter((message) => message.role === "user") ?? [];
  const [trigger] = userMessages;
  if (
    !isHiddenEasyRunConversation(page) ||
    userMessages.length !== 1 ||
    !isExactTriggerMessage(trigger, requestText) ||
    JSON.stringify(page).includes(rejectedText.trim())
  ) {
    throw new Error(`rejected speech entered the chat record: ${JSON.stringify(page)}`);
  }
}

function isHiddenEasyRunConversation(page) {
  return page?.conversation?.internal === true && Boolean(page.conversation.easyRun?.easyRunId);
}

function isExactTriggerMessage(message, requestText) {
  return (
    message?.delivery === "normal" &&
    message.status === "complete" &&
    isExactPlainTextPart(message.parts, requestText)
  );
}

function isExactPlainTextPart(parts, requestText) {
  const [part] = parts ?? [];
  return (
    parts?.length === 1 &&
    part?.type === "text" &&
    part.text?.format === "plain" &&
    part.text.text === requestText
  );
}

async function latestEasyRunId(client, workspaceId) {
  const snapshot = await client.evaluate(
    `window.setta.easyRun.snapshot(${JSON.stringify(workspaceId)})`,
  );
  return snapshot.latestRun?.id ?? null;
}

async function assertLatestEasyRunId(client, workspaceId, expectedRunId, label) {
  const actualRunId = await latestEasyRunId(client, workspaceId);
  if (actualRunId !== expectedRunId) {
    throw new Error(`${label} changed the latest Easy Run: ${actualRunId}, want ${expectedRunId}`);
  }
}
