import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
import { waitForBackendState } from "./electron-workflow-harness.mjs";
import {
  captureScreenshot,
  clickEnabledButtonByAria,
  dispatchKeyEvent,
  waitForState,
} from "./electron-cdp-harness.mjs";

export async function exerciseMasterOverlayEntryPoints({
  artifactDirectory,
  client,
  text,
  timeoutMs,
  workspaceId,
  waitForNavigation = false,
}) {
  await assertMasterPaneEntryPoint(client, timeoutMs);
  await focusMasterPaneFromGlobalShortcut(client, "", timeoutMs);
  await setMasterPaneDraft(client, text, timeoutMs);
  await openFromAppChrome(client, text, timeoutMs);
  await openFromGlobalShortcut(client, text, timeoutMs);

  await clickEnabledButtonByAria(client, "Send to Setta", timeoutMs);
  await assertActiveMasterInteraction(client, { expectedText: text }, timeoutMs);
  const recorded = await waitForRecordedMasterOverlayInput(artifactDirectory, text, timeoutMs);
  assertRecordedTypedMasterInput(recorded, workspaceId);

  if (waitForNavigation) {
    await waitForState(
      client,
      `(() => ({ overlayOpen: Boolean(document.querySelector('[data-testid="master-overlay"]')) }))()`,
      (state) => !state.overlayOpen,
      timeoutMs,
    );
  }
  return recorded;
}

export async function createPersistentMasterClarification({
  artifactDirectory,
  backend,
  client,
  text,
  timeoutMs,
  workspaceId,
}) {
  const recorded = await exerciseMasterOverlayEntryPoints({
    artifactDirectory,
    client,
    text,
    timeoutMs,
    workspaceId,
  });
  const route = await waitForMasterRouteDecision(backend, recorded.accepted.input.id, timeoutMs);
  assertMasterRouteDecision(route, {
    expectedInputId: recorded.accepted.input.id,
    expectedKind: "clarify",
  });
  return route;
}

export async function exerciseMasterCancellation({
  artifactDirectory,
  backend,
  client,
  providerStatePath,
  text,
  timeoutMs,
  workspaceId,
}) {
  await assertMasterPaneEntryPoint(client, timeoutMs);
  await focusMasterPaneFromGlobalShortcut(client, "", timeoutMs);
  await setMasterPaneDraft(client, text, timeoutMs);
  await clickEnabledButtonByAria(client, "Send to Setta", timeoutMs);
  await assertActiveMasterInteraction(client, { expectedText: text }, timeoutMs);
  const recorded = await waitForRecordedMasterOverlayInput(artifactDirectory, text, timeoutMs);
  assertRecordedTypedMasterInput(recorded, workspaceId);
  await waitForBackendState(
    async () => backend.post("/master/inputs/state/read", { inputId: recorded.accepted.input.id }),
    (state) => state.status === "routing",
    timeoutMs,
  );
  const activeProvider = await waitForMasterProviderTurn(
    providerStatePath,
    "inProgress",
    null,
    timeoutMs,
  );
  await clickEnabledButtonByAria(client, "Cancel active Setta request", timeoutMs);
  const cancelled = await waitForBackendState(
    async () => backend.post("/master/inputs/state/read", { inputId: recorded.accepted.input.id }),
    (state) => state.status === "cancelled",
    timeoutMs,
  );
  assertCancelledMasterInputState(cancelled, recorded.accepted.input.id);
  await waitForState(
    client,
    `(() => ({
      cancelActionPresent: Boolean(document.querySelector('[aria-label="Cancel active Setta request"]')),
      resultText: document.querySelector('.setta-master-overlay-result.is-cancelled')?.textContent ?? null,
      routingStatus: document.querySelector('[data-master-routing-status]')?.getAttribute('data-master-routing-status') ?? null,
    }))()`,
    (state) =>
      !state.cancelActionPresent &&
      state.routingStatus === "cancelled" &&
      state.resultText?.includes("Request cancelled"),
    timeoutMs,
  );
  await captureScreenshot(client, join(artifactDirectory, "master-route-cancelled.png"));
  await focusMasterPaneFromGlobalShortcut(client, "", timeoutMs);
  const restoredTranscript = await waitForState(
    client,
    `(() => ({
      cancellationPresent: Array.from(
        document.querySelectorAll('[data-testid="master-transcript-entry"][data-master-transcript-kind="cancellation"]'),
      ).some((entry) => entry.textContent?.includes("Request cancelled")),
      requestPresent: Boolean(document.querySelector('[data-testid="master-active-request"]')),
      transcriptEntryCount: document.querySelectorAll('[data-testid="master-transcript-entry"]').length,
    }))()`,
    (state) => !state.requestPresent && state.cancellationPresent,
    timeoutMs,
  );
  if (!restoredTranscript.cancellationPresent) {
    throw new Error(
      `cancelled master interaction did not restore as transcript: ${JSON.stringify(restoredTranscript)}`,
    );
  }
  return {
    activeProviderTurnId: activeProvider.turn.id,
    cancelled,
    recorded,
  };
}

export function assertCancelledMasterInputState(state, inputId) {
  const {
    cancellation = {},
    decision,
    failure,
    input: { input: routedInput = {} } = {},
    routingAttempt,
    routingStartedAt,
    status,
  } = state ?? {};
  const summary = {
    cancelledAtPresent: nonEmptyString(cancellation.cancelledAt),
    cancellationInputId: cancellation.inputId,
    cancellationRoutingAttempt: cancellation.routingAttempt,
    decision,
    failure,
    inputId: routedInput.id,
    routingAttempt,
    routingStartedAt,
    status,
  };
  const expected = {
    cancelledAtPresent: true,
    cancellationInputId: inputId,
    cancellationRoutingAttempt: 1,
    decision: null,
    failure: null,
    inputId,
    routingAttempt: 1,
    routingStartedAt: null,
    status: "cancelled",
  };
  if (JSON.stringify(summary) !== JSON.stringify(expected)) {
    throw new Error(`invalid durable master cancellation: ${JSON.stringify(state)}`);
  }
}

export async function assertMasterProviderTurnInterrupted(statePath, turnId, timeoutMs) {
  return waitForMasterProviderTurn(statePath, "interrupted", turnId, timeoutMs);
}

async function waitForMasterProviderTurn(statePath, status, turnId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    const matchingTurns = state.turns
      .filter((turn) => turn.status === status && (turnId === null || turn.id === turnId))
      .sort((left, right) => topicTurnOrdinal(right.id) - topicTurnOrdinal(left.id));
    const newest = matchingTurns[0];
    const restrictedOwner = state.threads.find(
      (thread) => thread.restricted === true && thread.turnIds?.includes(newest?.id),
    );
    if (state.heldStructuredKeys?.includes("master:cancel-route") && newest && restrictedOwner) {
      return { thread: restrictedOwner, turn: newest };
    }
    await delay(20);
  }
  throw new Error(`fake Codex master provider turn did not reach ${status}`);
}

function topicTurnOrdinal(turnId) {
  const match = /^topic-turn-(\d+)$/.exec(turnId ?? "");
  return match ? Number(match[1]) : -1;
}

async function assertMasterPaneEntryPoint(client, timeoutMs) {
  const state = await waitForState(
    client,
    driverCallExpression("masterPaneState", { draft: "" }),
    (candidate) => candidate.open && !candidate.overlayOpen,
    timeoutMs,
  );
  if (!state.open || state.overlayOpen) {
    throw new Error(`master pane entry point is not available: ${JSON.stringify(state)}`);
  }
}

async function openFromAppChrome(client, text, timeoutMs) {
  await clickMasterSurfaceEntry(client, "master-pane-button", timeoutMs);
  await waitForState(
    client,
    driverCallExpression("masterPaneState", { draft: text }),
    (state) =>
      state.open && state.draft === text && state.focused && !state.overlayOpen && state.maximized,
    timeoutMs,
  );
}

async function openFromGlobalShortcut(client, text, timeoutMs) {
  await focusMasterPaneFromGlobalShortcut(client, text, timeoutMs);
}

async function focusMasterPaneFromGlobalShortcut(client, text, timeoutMs) {
  await dispatchKeyEvent(client, { code: "KeyK", key: "k", modifiers: 2 });
  await dispatchKeyEvent(client, {
    code: "KeyK",
    key: "k",
    modifiers: 2,
    type: "keyUp",
  });
  await waitForState(
    client,
    driverCallExpression("masterPaneState", { draft: text }),
    (state) =>
      state.open && state.draft === text && state.focused && !state.overlayOpen && state.maximized,
    timeoutMs,
  );
}

async function clickMasterSurfaceEntry(client, testId, timeoutMs) {
  await waitForState(
    client,
    `(() => {
      const button = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
      return { clickable: button instanceof HTMLButtonElement && !button.disabled };
    })()`,
    (state) => state.clickable,
    timeoutMs,
  );
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`master surface entry was not clickable: ${testId}`);
  }
}

async function setMasterPaneDraft(client, text, timeoutMs) {
  const updated = await client.evaluate(`(() => {
    const textarea = document.querySelector('[data-testid="master-pane-surface"] textarea[aria-label="Ask Setta"]');
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, ${JSON.stringify(text)});
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  if (!updated) {
    throw new Error("master pane draft could not be updated");
  }
  await waitForMasterPane(client, { draft: text, focused: true }, timeoutMs);
}

async function waitForMasterPane(client, { draft, focused }, timeoutMs) {
  return waitForState(
    client,
    driverCallExpression("masterPaneState", { draft }),
    (state) => state.open && state.draft === draft && state.focused === focused,
    timeoutMs,
  );
}

async function waitForMasterOverlayClosed(client, timeoutMs) {
  await waitForState(
    client,
    `(() => ({ open: Boolean(document.querySelector('[data-testid="master-overlay"]')) }))()`,
    (state) => !state.open,
    timeoutMs,
  );
}

async function assertActiveMasterInteraction(
  client,
  { excludedTexts = [], expectedResultKind, expectedText },
  timeoutMs,
) {
  return waitForState(
    client,
    driverCallExpression("topicConversationMasterActiveInteractionState"),
    (state) =>
      state.open &&
      state.interactionCount === 1 &&
      !state.legacyHistoryPresent &&
      state.requestCount === 1 &&
      state.requestText === expectedText &&
      excludedTexts.every((text) => state.requestText !== text) &&
      (expectedResultKind === undefined || state.resultKind === expectedResultKind),
    timeoutMs,
  );
}

export async function captureActiveMasterInteraction({
  artifactPath,
  client,
  excludedTexts,
  expectedResultKind,
  expectedText,
  timeoutMs,
}) {
  await assertActiveMasterInteraction(
    client,
    { excludedTexts, expectedResultKind, expectedText },
    timeoutMs,
  );
  await captureScreenshot(client, artifactPath);
}

export async function verifyRestoredMasterInteraction({
  artifactPath,
  client,
  expectedResultKind,
  expectedText,
  timeoutMs,
}) {
  await focusMasterPaneFromGlobalShortcut(client, "", timeoutMs);
  await captureActiveMasterInteraction({
    artifactPath,
    client,
    expectedResultKind,
    expectedText,
    timeoutMs,
  });
}

export async function closeMasterOverlay(client, timeoutMs) {
  await waitForMasterOverlayClosed(client, timeoutMs);
}

export async function waitForMasterRouteDecision(backend, inputId, timeoutMs) {
  if (typeof inputId !== "string" || inputId === "") {
    throw new Error(`master route input id is missing: ${JSON.stringify(inputId)}`);
  }
  return waitForBackendState(
    async () => backend.post("/master/inputs/state/read", { inputId }),
    (state) => state.status === "decided" || state.status === "failed",
    timeoutMs,
  );
}

export function assertMasterRouteDecision(
  state,
  {
    expectedInputId,
    expectedKind,
    expectedRoutingAttempt = 1,
    expectedSessionId,
    expectedTargetId,
  },
) {
  const record = state?.decision;
  if (
    !masterRouteDecisionIsValid(
      state,
      record,
      expectedInputId,
      expectedKind,
      expectedRoutingAttempt,
      expectedSessionId,
    )
  ) {
    throw new Error(`invalid durable master route decision: ${JSON.stringify(state)}`);
  }
  if (
    expectedTargetId !== undefined &&
    !masterRouteTargetIsAuthorized(record, expectedKind, expectedTargetId)
  ) {
    throw new Error(`master route target authority drifted: ${JSON.stringify(state)}`);
  }
}

export function assertMasterRouteContextAuthority(
  state,
  { expectedConversationId, expectedKinds },
) {
  const authority = state?.decision?.context?.targetAuthorities?.find(
    (target) => target.conversationId === expectedConversationId,
  );
  if (
    authority === undefined ||
    !expectedKinds.every((kind) => authority.allowedDecisionKinds.includes(kind))
  ) {
    throw new Error(
      `master route context omitted active conversation authority: ${JSON.stringify({
        expectedConversationId,
        expectedKinds,
        state,
      })}`,
    );
  }
}

function masterRouteDecisionIsValid(
  state,
  record,
  expectedInputId,
  expectedKind,
  expectedRoutingAttempt,
  expectedSessionId,
) {
  const invocation = record?.resolvedInvocation;
  const configuration = invocation?.configuration;
  return [
    masterRouteStateIsDecided(state, expectedInputId, expectedRoutingAttempt),
    masterRouteRecordMatches(
      record,
      expectedInputId,
      expectedKind,
      expectedRoutingAttempt,
      expectedSessionId,
    ),
    masterRouteInvocationIsResolved(invocation),
    masterRouteConfigurationIsRestricted(configuration),
    masterRouteContextIsRedacted(record?.context),
  ].every(Boolean);
}

function masterRouteStateIsDecided(state, expectedInputId, expectedRoutingAttempt) {
  return [
    state?.status === "decided",
    state?.routingAttempt === expectedRoutingAttempt,
    state?.routingStartedAt === null,
    state?.failure === null,
    state?.input?.input?.id === expectedInputId,
  ].every(Boolean);
}

function masterRouteRecordMatches(
  record,
  expectedInputId,
  expectedKind,
  expectedRoutingAttempt,
  expectedSessionId,
) {
  return [
    record?.inputId === expectedInputId,
    record?.routingAttempt === expectedRoutingAttempt,
    record?.decision?.kind === expectedKind,
    validMasterRouteCommand(record?.resultingCommand, expectedKind),
    matchesOptionalValue(record?.masterSessionId, expectedSessionId),
    nonEmptyString(record?.masterSessionId),
  ].every(Boolean);
}

function validMasterRouteCommand(command, expectedKind) {
  if (command?.kind !== expectedKind) return false;
  const payloads = [
    command.answerGlobal,
    command.askNarrator,
    command.clarify,
    command.createConversation,
    command.createSideConversation,
    command.focusConversation,
    command.forkConversation,
    command.queueAgentTurn,
    command.sendToAgent,
    command.steerActiveTurn,
  ];
  return payloads.filter((payload) => payload !== null).length === 1;
}

function matchesOptionalValue(actual, expected) {
  return expected === undefined ? true : actual === expected;
}

function nonEmptyString(value) {
  return typeof value === "string" && value !== "";
}

function masterRouteInvocationIsResolved(invocation) {
  return [
    nonEmptyString(invocation?.providerRequestId),
    nonEmptyString(invocation?.providerThreadId),
    nonEmptyString(invocation?.providerTurnId),
  ].every(Boolean);
}

function masterRouteConfigurationIsRestricted(configuration) {
  return [
    masterRouteModelSelectionMatches(configuration),
    masterRoutePermissionsMatch(configuration),
    configuration?.maxInputBytes > 0,
  ].every(Boolean);
}

function masterRouteModelSelectionMatches(configuration) {
  return [
    configuration?.requestedModel === "gpt-5.6-terra",
    configuration?.resolvedModel === "gpt-5.6-terra",
    configuration?.requestedReasoningEffort === "medium",
    configuration?.resolvedReasoningEffort === "medium",
  ].every(Boolean);
}

function masterRoutePermissionsMatch(configuration) {
  return [
    configuration?.requestedPermissionMode === "read_only",
    configuration?.resolvedPermissionMode === "read_only",
    configuration?.requestedApprovalMode === "never",
    configuration?.resolvedApprovalMode === "never",
  ].every(Boolean);
}

function masterRouteContextIsRedacted(context) {
  const serialized = JSON.stringify(context ?? {});
  return [
    !serialized.includes("topic-thread-"),
    !serialized.includes("providerThreadId"),
    !serialized.includes("providerTurnId"),
  ].every(Boolean);
}

function masterRouteTargetIsAuthorized(record, expectedKind, expectedTargetId) {
  const branch = masterRouteTargetBranch(record?.decision);
  const command = masterRouteTargetBranch(record?.resultingCommand);
  const authority = record?.context?.targetAuthorities?.find((target) =>
    masterRouteAuthorityMatches(target, expectedKind, expectedTargetId),
  );
  return [
    masterRouteDecisionTargets(branch, expectedKind, expectedTargetId),
    masterRouteCommandTargets(command, expectedKind, expectedTargetId),
    record?.context?.includedCandidateIds?.includes(expectedTargetId),
    authority !== undefined,
  ].every(Boolean);
}

function masterRouteDecisionTargets(branch, expectedKind, expectedTargetId) {
  if (["create_side_conversation", "fork_conversation"].includes(expectedKind)) {
    return branch?.parentConversationId === expectedTargetId;
  }
  return branch?.conversationId === expectedTargetId;
}

function masterRouteCommandTargets(command, expectedKind, expectedTargetId) {
  if (expectedKind === "fork_conversation") {
    return command?.parentConversationId === expectedTargetId;
  }
  return command?.target?.conversationId === expectedTargetId;
}

function masterRouteAuthorityMatches(target, expectedKind, expectedTargetId) {
  return [
    target.conversationId === expectedTargetId,
    target.allowedDecisionKinds.includes(expectedKind),
  ].every(Boolean);
}

function masterRouteTargetBranch(decision) {
  if (!decision) return null;
  const branchByKind = {
    answer_global: "answerGlobal",
    ask_narrator: "askNarrator",
    clarify: "clarify",
    create_conversation: "createConversation",
    create_side_conversation: "createSideConversation",
    focus_conversation: "focusConversation",
    fork_conversation: "forkConversation",
    queue_agent_turn: "queueAgentTurn",
    send_to_agent: "sendToAgent",
    steer_active_turn: "steerActiveTurn",
  };
  return decision[branchByKind[decision.kind]] ?? null;
}

async function waitForRecordedMasterOverlayInput(artifactDirectory, text, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const events = await readJsonLinesWhileAppending(join(artifactDirectory, "ipc.jsonl"));
    const starts = events.filter(
      (event) =>
        event.type === "ipc_start" &&
        event.channel === "master:submit-input" &&
        event.args?.[0]?.input?.text === text,
    );
    if (starts.length > 1) {
      throw new Error(`typed master overlay input was submitted more than once: ${starts.length}`);
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
  throw new Error("timed out waiting for typed master overlay input");
}

function assertRecordedTypedMasterInput(recorded, workspaceId) {
  const { accepted, request } = requiredRecordedMasterInput(recorded);
  void workspaceId;
  assertTypedMasterRequest(request, recorded);
  if (
    accepted.input.id !== request.input.id ||
    accepted.replyDelivery.originatingWorkspaceId !== null ||
    accepted.replyDelivery.originatingConversationId !== null ||
    accepted.replyDelivery.originatingPaneId !== null ||
    accepted.replyDelivery.originatingConversationInputId !== null
  ) {
    throw new Error(`typed master overlay receipt drifted: ${JSON.stringify(recorded)}`);
  }
}

function requiredRecordedMasterInput(recorded) {
  if (!recorded.request) {
    throw new Error(
      `typed master overlay input receipt is incomplete: ${JSON.stringify(recorded)}`,
    );
  }
  if (!recorded.accepted) {
    throw new Error(
      `typed master overlay input receipt is incomplete: ${JSON.stringify(recorded)}`,
    );
  }
  return { accepted: recorded.accepted, request: recorded.request };
}

function assertTypedMasterRequest(request, recorded) {
  const input = request.input;
  if (
    input.source !== "shell" ||
    input.modality !== "text" ||
    input.focusedWorkspaceId !== null ||
    input.focusedConversationId !== null
  ) {
    throw new Error(`typed master overlay request drifted: ${JSON.stringify(recorded)}`);
  }
}

export async function readJsonLinesWhileAppending(path) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const events = [];
  for (const line of content.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    try {
      events.push(JSON.parse(line));
    } catch {
      break;
    }
  }
  return events;
}
