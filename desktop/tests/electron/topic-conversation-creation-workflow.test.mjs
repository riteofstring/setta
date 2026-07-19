#!/usr/bin/env node
/* global console */

import { basename, delimiter, join } from "node:path";
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
import { configureConversationAgentApprovals } from "./topic-conversation-default-permission-workflow.mjs";
import {
  assertDriverAction,
  conversationSurfaces,
  listTopics,
  waitForNavigator,
} from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-creation";
const workflowTimeoutMs = 60_000;
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 1600,
};

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
  await context.client.call("Emulation.setDeviceMetricsOverride", viewport);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const backend = await backendProbe(artifactDir);
  const workspaceId = await openWorkspace(context.client);
  const initialConversation = await waitForInitialConversation(backend, workspaceId);
  await waitForConversationSurface(
    context.client,
    initialConversation.id,
    (surface) => surface.projectionStatus === "ready" && !surface.inputDisabled,
  );
  await captureScreenshot(context.client, join(artifactDir, "initial.png"));

  const headerConversation = await createConversationThroughUI({
    action: () =>
      context.client.driver("topicConversationClickNewConversationHeader", {
        clicks: 1,
      }),
    backend,
    client: context.client,
    source: "sidebar-header",
    workspaceId,
  });
  const toolbarConversation = await createConversationThroughUI({
    action: () => context.client.driver("topicConversationClickNewFrameConversation"),
    backend,
    client: context.client,
    source: "new-frame-menu",
    workspaceId,
  });
  const emptyFramePaneId = await waitForEmptyFramePaneId(context.client);
  const emptyFrameConversation = await createConversationThroughUI({
    action: () =>
      context.client.driver("topicConversationClickEmptyFrameConversation", {
        paneId: emptyFramePaneId,
      }),
    backend,
    client: context.client,
    expectedPaneId: emptyFramePaneId,
    source: "empty-frame",
    workspaceId,
  });
  assertDistinctConversationIds([
    initialConversation,
    headerConversation,
    toolbarConversation,
    emptyFrameConversation,
  ]);
  const rapidRepeatConversation = await createRapidRepeatConversationThroughUI({
    backend,
    client: context.client,
    workspaceId,
  });
  assertDistinctConversationIds([
    initialConversation,
    headerConversation,
    toolbarConversation,
    emptyFrameConversation,
    rapidRepeatConversation,
  ]);
  const creationRaceFailures = await exerciseConversationCreationRaceFailures({
    backend,
    client: context.client,
    workspaceId,
  });

  const focusResult = await verifyNavigatorFocusDoesNotDuplicate({
    backend,
    client: context.client,
    conversation: headerConversation,
    workspaceId,
  });
  const restoredHeaderConversation = await verifyCloseAndRestoreFromNavigator({
    backend,
    client: context.client,
    conversation: headerConversation,
    workspaceId,
  });
  const concurrentRuns = await submitConcurrentHoldTurns({
    backend,
    client: context.client,
    conversations: [restoredHeaderConversation, toolbarConversation],
    workspaceId,
  });
  const uiLifecycle = await exerciseUICreatedConversationLifecycle({
    backend,
    client: context.client,
    conversation: restoredHeaderConversation,
    workspaceId,
  });
  const uiFailure = await exerciseUICreatedConversationFailure({
    backend,
    client: context.client,
    conversation: toolbarConversation,
    workspaceId,
  });
  const extraConversations = await createUntilMoreThanTenEasyButtonPanes({
    backend,
    client: context.client,
    workspaceId,
  });
  const scaledLayout = await waitForUILayout(backend, workspaceId, (layout) => {
    const easyButtonPanes = easyButtonLayoutPanes(layout);
    return easyButtonPanes.length > 10 && uniqueEasyButtonConversationBindings(layout);
  });
  const scaledState = await waitForCreationWorkspaceState(
    context.client,
    (state) => state.newConversationButtonEnabled && state.newFrameButtonEnabled,
  );

  await captureScreenshot(context.client, join(artifactDir, "before-reload.png"));
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]', workflowTimeoutMs);
  await context.client.installDriver();
  await waitForState(
    context.client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId }),
    (state) => state.workspaceId === workspaceId,
    workflowTimeoutMs,
  );
  const reloadedLayout = await verifyReloadedConversationBindings({
    backend,
    conversations: [
      initialConversation,
      restoredHeaderConversation,
      toolbarConversation,
      emptyFrameConversation,
      rapidRepeatConversation,
      ...extraConversations,
    ],
    exactPaneBinding: {
      conversationId: emptyFrameConversation.id,
      paneId: emptyFramePaneId,
    },
    workspaceId,
  });
  await waitForNavigatorOpenInWorkspace(context.client, restoredHeaderConversation.id);
  await waitForNavigatorOpenInWorkspace(context.client, toolbarConversation.id);
  await waitForNavigatorOpenInWorkspace(context.client, emptyFrameConversation.id);
  await captureScreenshot(context.client, join(artifactDir, "after-reload.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    concurrentRuns,
    emptyFrameConversation,
    emptyFramePaneId,
    extraConversationCount: extraConversations.length,
    focusResult,
    headerConversation: restoredHeaderConversation,
    initialConversation,
    creationRaceFailures,
    rapidRepeatConversation,
    reloadedEasyButtonPaneCount: easyButtonLayoutPanes(reloadedLayout).length,
    scaledEasyButtonPaneCount: easyButtonLayoutPanes(scaledLayout).length,
    scaledState,
    status: "passed",
    toolbarConversation,
    uiFailure,
    uiLifecycle,
    viewport,
    workspaceId,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron topic conversation creation workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      snapshot: await safeCreationWorkspaceState(context.client),
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
  return topicSummary(page.items[0], "initial");
}

async function createConversationThroughUI({
  action,
  backend,
  client,
  expectedPaneId = "",
  source,
  workspaceId,
}) {
  const before = await listTopics(backend, workspaceId);
  const beforeIds = new Set(before.items.map((item) => item.conversation.id));
  assertDriverAction(await action(), "clicked");
  const page = await waitForBackendState(
    () => listTopics(backend, workspaceId),
    (current) => newConversationItems(current, beforeIds).length === 1,
    workflowTimeoutMs,
  );
  const created = topicSummary(newConversationItems(page, beforeIds)[0], source);
  assertCondition(
    created.title === "New conversation",
    "UI-created conversation title drifted",
    created,
  );
  const surface = await waitForConversationSurface(
    client,
    created.id,
    (candidate) =>
      candidate.projectionStatus === "ready" &&
      !candidate.inputDisabled &&
      (expectedPaneId === "" || candidate.paneId === expectedPaneId),
  );
  await waitForPersistedConversationPane(backend, workspaceId, created.id, expectedPaneId);
  await waitForNavigator(client, created.id, 1, workflowTimeoutMs);
  return { ...created, paneId: surface.paneId };
}

async function createRapidRepeatConversationThroughUI({ backend, client, workspaceId }) {
  const before = await listTopics(backend, workspaceId);
  const beforeIds = new Set(before.items.map((item) => item.conversation.id));
  const action = await client.driver("topicConversationClickNewConversationHeader", {
    clicks: 2,
  });
  assertDriverAction(action, "clicked");
  assertCondition(action.clickCount === 2, "rapid-repeat did not request two activations", {
    action,
  });
  const page = await waitForBackendState(
    () => listTopics(backend, workspaceId),
    (current) => newConversationItems(current, beforeIds).length === 1,
    workflowTimeoutMs,
  );
  const createdItems = newConversationItems(page, beforeIds);
  const created = topicSummary(createdItems[0], "sidebar-header-rapid-repeat");
  const surface = await waitForConversationSurface(
    client,
    created.id,
    (candidate) => candidate.projectionStatus === "ready" && !candidate.inputDisabled,
  );
  await waitForPersistedConversationPane(backend, workspaceId, created.id, "");
  await waitForNavigator(client, created.id, 1, workflowTimeoutMs);
  return {
    ...created,
    createdConversationCount: createdItems.length,
    paneId: surface.paneId,
    requestedClickCount: action.clickCount,
  };
}

async function exerciseConversationCreationRaceFailures({ backend, client, workspaceId }) {
  return {
    disappearedTarget: await createConversationWithPostCreateLayoutRace({
      backend,
      client,
      expectedError: "The conversation was created, but its frame no longer exists.",
      mutation: "close-target",
      source: "empty-frame-disappeared-after-create",
      workspaceId,
    }),
    nonEmptyTarget: await createConversationWithPostCreateLayoutRace({
      backend,
      client,
      expectedError: "The conversation was created, but the selected frame is no longer empty.",
      mutation: "fill-target-browser",
      source: "empty-frame-filled-after-create",
      workspaceId,
    }),
  };
}

async function createConversationWithPostCreateLayoutRace({
  backend,
  client,
  expectedError,
  mutation,
  source,
  workspaceId,
}) {
  const targetPaneId = await ensureEmptyFramePaneForCreationRace(client);
  const before = await listTopics(backend, workspaceId);
  const beforeIds = new Set(before.items.map((item) => item.conversation.id));
  const action = await client.driver(
    "topicConversationRequestEmptyFrameConversationWithDestinationRace",
    {
      mutation,
      paneId: targetPaneId,
    },
  );
  assertDriverAction(action, "requested");
  assertCondition(
    action.workspaceId === workspaceId,
    "conversation creation race targeted the wrong workspace",
    {
      action,
      workspaceId,
    },
  );
  const page = await waitForBackendState(
    () => listTopics(backend, workspaceId),
    (current) => newConversationItems(current, beforeIds).length === 1,
    workflowTimeoutMs,
  );
  const created = topicSummary(newConversationItems(page, beforeIds)[0], source);
  await waitForCreationWorkspaceState(client, (state) =>
    state.operationErrorText.includes(expectedError),
  );
  await waitForNavigator(client, created.id, 0, workflowTimeoutMs);
  const layout = await waitForUILayout(backend, workspaceId, (candidate) =>
    layoutMatchesPostCreateRace(candidate, {
      conversationId: created.id,
      mutation,
      targetPaneId,
    }),
  );
  return {
    conversationId: created.id,
    error: expectedError,
    mutation,
    targetPaneId,
    targetPaneSurfaceKind:
      layout.panes.find((pane) => pane.paneId === targetPaneId)?.surfaceKind ?? null,
  };
}

async function ensureEmptyFramePaneForCreationRace(client) {
  const state = await waitForCreationWorkspaceState(
    client,
    (candidate) => candidate.workspaceId !== "" && candidate.workspaceId !== "empty",
  );
  const existing = state.hosts.find((host) => host.surfaceKind === "empty-frame");
  if (existing?.paneId) {
    return existing.paneId;
  }
  const split = await client.driver("topicConversationSplitFirstPaneToEmptyFrame");
  assertDriverAction(split, "clicked");
  const next = await waitForCreationWorkspaceState(client, (candidate) =>
    candidate.hosts.some((host) => host.surfaceKind === "empty-frame"),
  );
  const created =
    next.hosts.find(
      (host) => host.paneId === split.createdPaneId && host.surfaceKind === "empty-frame",
    ) ?? next.hosts.find((host) => host.surfaceKind === "empty-frame");
  assertCondition(created?.paneId, "empty frame pane was not created for race coverage", {
    next,
    split,
  });
  return created.paneId;
}

function layoutMatchesPostCreateRace(layout, { conversationId, mutation, targetPaneId }) {
  if (layoutHasConversationPane(layout, conversationId)) {
    return false;
  }
  switch (mutation) {
    case "close-target":
      return !layout.panes.some((pane) => pane.paneId === targetPaneId);
    case "fill-target-browser":
      return layout.panes.some(
        (pane) => pane.paneId === targetPaneId && pane.surfaceKind === "browser",
      );
    default:
      throw new Error(`unsupported post-create race mutation: ${mutation}`);
  }
}

function newConversationItems(page, beforeIds) {
  return page.items.filter((item) => !beforeIds.has(item.conversation.id));
}

function topicSummary(item, source) {
  return {
    id: item.conversation.id,
    source,
    title: item.conversation.title,
  };
}

function assertDistinctConversationIds(conversations) {
  const ids = conversations.map((conversation) => conversation.id);
  assertCondition(new Set(ids).size === ids.length, "conversation ids were not distinct", {
    ids,
  });
}

async function verifyNavigatorFocusDoesNotDuplicate({
  backend,
  client,
  conversation,
  workspaceId,
}) {
  const beforePage = await listTopics(backend, workspaceId);
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", {
      conversationId: conversation.id,
    }),
    "clicked",
  );
  const navigator = await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", {
      conversationId: conversation.id,
    }),
    (state) =>
      state.focusedPaneId === conversation.paneId &&
      state.openViewCount === 1 &&
      state.rowCount === 1,
    workflowTimeoutMs,
  );
  const afterPage = await listTopics(backend, workspaceId);
  assertSameConversationList(beforePage, afterPage, "navigator focus created a conversation");
  return navigator;
}

async function verifyCloseAndRestoreFromNavigator({ backend, client, conversation, workspaceId }) {
  const beforePage = await listTopics(backend, workspaceId);
  await closeConversationPane(client, conversation.id);
  await waitForNavigator(client, conversation.id, 0, workflowTimeoutMs);
  const afterClosePage = await listTopics(backend, workspaceId);
  assertSameConversationList(beforePage, afterClosePage, "closing a pane changed conversations");
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", {
      conversationId: conversation.id,
    }),
    "clicked",
  );
  const restoredSurface = await waitForConversationSurface(
    client,
    conversation.id,
    (surface) => surface.projectionStatus === "ready" && !surface.inputDisabled,
  );
  await waitForNavigator(client, conversation.id, 1, workflowTimeoutMs);
  const afterRestorePage = await listTopics(backend, workspaceId);
  assertSameConversationList(
    beforePage,
    afterRestorePage,
    "restoring a pane created a conversation",
  );
  return { ...conversation, paneId: restoredSurface.paneId };
}

async function submitConcurrentHoldTurns({ backend, client, conversations, workspaceId }) {
  const [alpha, beta] = conversations;
  const alphaText = "hold UI creation alpha";
  const betaText = "hold UI creation beta";
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: alpha.id,
      text: alphaText,
    }),
    "submitted",
  );
  await waitForConversationSurface(
    client,
    alpha.id,
    (surface) => surface.state === "working" && surface.intentText === alphaText,
  );
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: beta.id,
      text: betaText,
    }),
    "submitted",
  );
  const concurrent = await waitForConversationSurfaces(client, (surfaces) => {
    const alphaSurface = conversationSurfaces(surfaces, alpha.id)[0];
    const betaSurface = conversationSurfaces(surfaces, beta.id)[0];
    return (
      alphaSurface?.state === "working" &&
      betaSurface?.state === "working" &&
      alphaSurface.intentText === alphaText &&
      betaSurface.intentText === betaText &&
      alphaSurface.intentText !== betaText &&
      betaSurface.intentText !== alphaText
    );
  });
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    alpha.id,
    (snapshot) =>
      snapshot.conversation.status === "working" &&
      snapshotHasAgentText(snapshot, `Streaming ${alphaText}`),
  );
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    beta.id,
    (snapshot) =>
      snapshot.conversation.status === "working" &&
      snapshotHasAgentText(snapshot, `Streaming ${betaText}`),
  );
  await stopHeldConversation({
    backend,
    client,
    conversation: alpha,
    text: alphaText,
    workspaceId,
  });
  await stopHeldConversation({ backend, client, conversation: beta, text: betaText, workspaceId });
  return {
    alpha: conversationSurfaces(concurrent.surfaces, alpha.id)[0],
    beta: conversationSurfaces(concurrent.surfaces, beta.id)[0],
  };
}

async function stopHeldConversation({ backend, client, conversation, text, workspaceId }) {
  assertDriverAction(
    await client.driver("topicConversationStop", {
      conversationId: conversation.id,
    }),
    "stopped",
  );
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversation.id,
    (snapshot) =>
      snapshot.conversation.status === "idle" &&
      snapshot.turns.turns.some(
        (turn) => turn.authoredInput.text === text && turn.status === "cancelled",
      ),
  );
}

async function exerciseUICreatedConversationLifecycle({
  backend,
  client,
  conversation,
  workspaceId,
}) {
  const holdText = "hold UI lifecycle";
  const artifactText = "artifact UI lifecycle";
  const approvalText = "approval UI lifecycle";
  const steeringText = "steer alpha now";

  await waitForConversationSurface(
    client,
    conversation.id,
    (surface) => surface.projectionStatus === "ready" && !surface.inputDisabled,
  );
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: conversation.id,
      text: holdText,
    }),
    "submitted",
  );
  await waitForConversationSurface(
    client,
    conversation.id,
    (surface) => surface.state === "working" && surface.intentText === holdText,
  );
  const runningSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversation.id,
    (snapshot) =>
      snapshot.conversation.status === "working" &&
      turnTextHasStatus(snapshot, holdText, "running") &&
      snapshotHasAgentText(snapshot, `Streaming ${holdText}`),
  );
  const runningTurn = turnByText(runningSnapshot, holdText);
  assertCondition(runningTurn?.providerTurnId, "UI-created running turn lost provider identity", {
    runningSnapshot,
  });

  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: conversation.id,
      text: artifactText,
    }),
    "submitted",
  );
  await waitForConversationSurface(
    client,
    conversation.id,
    (surface) => surface.state === "working" && surface.queueCount === 1,
  );
  await configureConversationAgentApprovals(backend, workspaceId, conversation.id);
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: conversation.id,
      text: approvalText,
    }),
    "submitted",
  );
  const queuedSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversation.id,
    (snapshot) =>
      snapshot.queue.length === 2 &&
      turnTextHasStatus(snapshot, artifactText, "queued") &&
      turnTextHasStatus(snapshot, approvalText, "queued"),
  );
  await waitForConversationSurface(
    client,
    conversation.id,
    (surface) => surface.state === "working" && surface.queueCount === 2,
  );

  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: conversation.id,
      text: steeringText,
    }),
    "submitted",
  );
  const awaitingApproval = await waitForConversationSurface(
    client,
    conversation.id,
    (surface) =>
      surface.approvalId !== "" &&
      surface.artifactCount === 1 &&
      surface.artifactText.includes("artifact.png") &&
      surface.helperText === "Waiting for approval",
  );
  const promotedSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversation.id,
    (snapshot) =>
      snapshot.queue.length === 0 &&
      turnTextHasStatus(snapshot, holdText, "completed") &&
      turnTextHasStatus(snapshot, artifactText, "completed") &&
      turnTextHasStatus(snapshot, approvalText, "running") &&
      snapshotHasTrajectoryKind(snapshot, "turn_queued") &&
      snapshotHasTrajectoryKind(snapshot, "turn_promoted") &&
      snapshot.trajectory.events.some(
        (event) => event.kind === "turn_steered" && event.turnSteered?.input?.text === steeringText,
      ) &&
      snapshot.trajectory.events.some(
        (event) => event.approvalRequested?.approval?.id === awaitingApproval.approvalId,
      ),
  );

  assertDriverAction(
    await client.driver("topicConversationRespondApproval", {
      answer: "setta-ui-created-approval-answer",
      conversationId: conversation.id,
    }),
    "answered",
  );
  const completedSurface = await waitForConversationSurface(
    client,
    conversation.id,
    (surface) =>
      surface.state === "complete" &&
      surface.status === "completed" &&
      surface.queueCount === 0 &&
      surface.approvalId === "" &&
      surface.summaryText === "Approval UI lifecycle completed.",
  );
  const completedSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversation.id,
    (snapshot) =>
      snapshot.conversation.status === "idle" &&
      turnTextHasStatus(snapshot, holdText, "completed") &&
      turnTextHasStatus(snapshot, artifactText, "completed") &&
      turnTextHasStatus(snapshot, approvalText, "completed") &&
      snapshot.artifacts.artifacts.length >= 1 &&
      snapshot.trajectory.events.some(
        (event) => event.approvalResolved?.resolution?.approvalId === awaitingApproval.approvalId,
      ) &&
      hasFinalNarrationForTurnText(snapshot, holdText) &&
      hasFinalNarrationForTurnText(snapshot, artifactText) &&
      hasFinalNarrationForTurnText(snapshot, approvalText),
  );

  return {
    approvalId: awaitingApproval.approvalId,
    completedTurnCount: completedSnapshot.turns.turns.filter((turn) => turn.status === "completed")
      .length,
    paneId: completedSurface.paneId,
    promotedQueueCount: promotedSnapshot.trajectory.events.filter(
      (event) => event.kind === "turn_promoted",
    ).length,
    queuedTurnIds: queuedSnapshot.queue.map((turn) => turn.turnId),
    runningTurnId: runningTurn.id,
  };
}

async function exerciseUICreatedConversationFailure({
  backend,
  client,
  conversation,
  workspaceId,
}) {
  const failureText = "fail UI lifecycle";
  await waitForConversationSurface(
    client,
    conversation.id,
    (surface) => surface.projectionStatus === "ready" && !surface.inputDisabled,
  );
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: conversation.id,
      text: failureText,
    }),
    "submitted",
  );
  const failedSurface = await waitForConversationSurface(
    client,
    conversation.id,
    (surface) =>
      surface.state === "complete" &&
      surface.status === "failed" &&
      surface.summaryText === "Fail UI lifecycle failed; the reported error remains visible.",
  );
  const failedSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversation.id,
    (snapshot) =>
      snapshot.conversation.status === "failed" &&
      turnTextHasStatus(snapshot, failureText, "failed") &&
      hasFinalNarrationForTurnText(snapshot, failureText),
  );
  return {
    failedTurnId: turnByText(failedSnapshot, failureText)?.id ?? "",
    paneId: failedSurface.paneId,
    summaryText: failedSurface.summaryText,
  };
}

async function createUntilMoreThanTenEasyButtonPanes({ backend, client, workspaceId }) {
  const created = [];
  let layout = await readUILayout(backend, workspaceId);
  while (easyButtonLayoutPanes(layout).length <= 10) {
    created.push(
      await createConversationThroughUI({
        action: () =>
          client.driver("topicConversationClickNewConversationHeader", {
            clicks: 1,
          }),
        backend,
        client,
        source: `sidebar-header-scale-${created.length + 1}`,
        workspaceId,
      }),
    );
    layout = await readUILayout(backend, workspaceId);
  }
  return created;
}

async function verifyReloadedConversationBindings({
  backend,
  conversations,
  exactPaneBinding,
  workspaceId,
}) {
  return waitForUILayout(backend, workspaceId, (layout) => {
    if (!uniqueEasyButtonConversationBindings(layout)) {
      return false;
    }
    const easyButtonPanes = easyButtonLayoutPanes(layout);
    const boundConversationIds = new Set(
      easyButtonPanes.map((pane) => pane.easyButtonConfig.conversationId),
    );
    const allExpectedBound = conversations.every((conversation) =>
      boundConversationIds.has(conversation.id),
    );
    const exactBound = easyButtonPanes.some(
      (pane) =>
        pane.paneId === exactPaneBinding.paneId &&
        pane.easyButtonConfig.conversationId === exactPaneBinding.conversationId,
    );
    return allExpectedBound && exactBound && easyButtonPanes.length > 10;
  });
}

async function waitForEmptyFramePaneId(client) {
  const state = await waitForCreationWorkspaceState(client, (candidate) =>
    candidate.hosts.some((host) => host.surfaceKind === "empty-frame"),
  );
  const host = state.hosts.find((candidate) => candidate.surfaceKind === "empty-frame");
  assertCondition(host?.paneId, "empty frame pane was unavailable", state);
  return host.paneId;
}

async function waitForCreationWorkspaceState(client, ready) {
  return waitForState(
    client,
    driverCallExpression("topicConversationCreationWorkspaceState", {}),
    ready,
    workflowTimeoutMs,
  );
}

async function waitForNavigatorOpenInWorkspace(client, conversationId) {
  return waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", { conversationId }),
    (state) => state.rowCount === 1 && state.label.includes("open in workspace"),
    workflowTimeoutMs,
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

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    async () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}

function snapshotHasAgentText(snapshot, expected) {
  return snapshot.trajectory.events.some((event) =>
    event.agentPublicTextDelta?.delta.includes(expected),
  );
}

function snapshotHasTrajectoryKind(snapshot, kind) {
  return snapshot.trajectory.events.some((event) => event.kind === kind);
}

function turnTextHasStatus(snapshot, text, status) {
  return turnByText(snapshot, text)?.status === status;
}

function turnByText(snapshot, text) {
  return snapshot.turns.turns.find((turn) => turn.authoredInput.text === text);
}

function hasFinalNarrationForTurnText(snapshot, text) {
  const turn = turnByText(snapshot, text);
  return Boolean(
    turn &&
    snapshot.narration.events.some(
      (event) => event.kind === "final_summary" && event.turnId === turn.id,
    ),
  );
}

async function waitForPersistedConversationPane(
  backend,
  workspaceId,
  conversationId,
  expectedPaneId,
) {
  return waitForUILayout(backend, workspaceId, (layout) =>
    easyButtonLayoutPanes(layout).some(
      (pane) =>
        pane.easyButtonConfig.conversationId === conversationId &&
        (expectedPaneId === "" || pane.paneId === expectedPaneId),
    ),
  );
}

async function waitForUILayout(backend, workspaceId, ready) {
  const result = await waitForBackendState(
    () => backend.post("/workspaces/ui/layout/read", { workspaceId }),
    (current) => Boolean(current.layout && ready(current.layout)),
    workflowTimeoutMs,
  );
  return result.layout;
}

async function readUILayout(backend, workspaceId) {
  const result = await backend.post("/workspaces/ui/layout/read", { workspaceId });
  if (!result.layout) {
    throw new Error(`workspace layout was unavailable: ${JSON.stringify(result)}`);
  }
  return result.layout;
}

function easyButtonLayoutPanes(layout) {
  return layout.panes.filter(
    (pane) => pane.surfaceKind === "easy-button" && pane.easyButtonConfig?.conversationId,
  );
}

function layoutHasConversationPane(layout, conversationId) {
  return easyButtonLayoutPanes(layout).some(
    (pane) => pane.easyButtonConfig.conversationId === conversationId,
  );
}

function uniqueEasyButtonConversationBindings(layout) {
  const conversationIds = easyButtonLayoutPanes(layout).map(
    (pane) => pane.easyButtonConfig.conversationId,
  );
  return new Set(conversationIds).size === conversationIds.length;
}

function assertSameConversationList(before, after, message) {
  const beforeIds = before.items.map((item) => item.conversation.id).toSorted();
  const afterIds = after.items.map((item) => item.conversation.id).toSorted();
  assertCondition(JSON.stringify(beforeIds) === JSON.stringify(afterIds), message, {
    afterIds,
    beforeIds,
  });
}

async function safeCreationWorkspaceState(client) {
  try {
    return await client.driver("topicConversationCreationWorkspaceState");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function safeTopicConversationSurfaceStates(client) {
  try {
    return await client.driver("topicConversationSurfaceStates");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function assertCondition(condition, message, context) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(context)}`);
  }
}
