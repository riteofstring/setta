import { waitForBackendState } from "./chat-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import { reloadPage, waitForSelector, waitForState } from "./electron-cdp-harness.mjs";

export async function exerciseDurableForkWorkflow({
  backend,
  client,
  forkTitle,
  parentSnapshot,
  parentTopic,
  timeoutMs,
  workspaceId,
}) {
  const sourceTurn = parentSnapshot.turns.turns.at(-1);
  assertCondition(sourceTurn, "parent has no completed turn for the durable fork workflow", {
    parentSnapshot,
  });
  const forkSnapshot = await forkTopic(client, {
    forkedAtTurnId: sourceTurn.id,
    parentConversationId: parentTopic.id,
    title: forkTitle,
    workspaceId,
  });
  const forkTopicSummary = assertDurableForkCreation(forkSnapshot, parentSnapshot, sourceTurn);

  await reloadPage(client);
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await client.installDriver();
  const navigator = await waitForNavigator(client, forkTopicSummary.id, 0, timeoutMs);
  assertNavigator(navigator, forkTopicSummary, 0);
  assertCondition(navigator.label.includes("durable fork"), "fork navigator lineage is missing", {
    navigator,
  });
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", {
      conversationId: forkTopicSummary.id,
    }),
    "clicked",
  );
  await waitForConversationSurface(
    client,
    forkTopicSummary.id,
    (surface) => surface.projectionStatus === "ready" && surface.state === "idle",
    timeoutMs,
  );
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: forkTopicSummary.id,
      text: "fork child artifact",
    }),
    "submitted",
  );
  const forkComplete = await waitForConversationSurface(
    client,
    forkTopicSummary.id,
    completedForkSurface,
    timeoutMs,
  );
  const forkTerminalSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    forkTopicSummary.id,
    completedForkSnapshot,
    timeoutMs,
  );
  const parentAfterForkWork = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) => snapshot.eventCursor.sequence === parentSnapshot.eventCursor.sequence,
    timeoutMs,
  );
  assertForkDidNotContaminateParent(parentSnapshot, parentAfterForkWork);
  assertDriverAction(
    await client.driver("topicConversationCloseOneBoundPane", {
      conversationId: forkTopicSummary.id,
    }),
    "clicked",
  );
  await waitForConversationSurfaces(
    client,
    (surfaces) => conversationSurfaces(surfaces, forkTopicSummary.id).length === 0,
    timeoutMs,
  );
  assertNavigator(
    await waitForNavigator(client, forkTopicSummary.id, 0, timeoutMs),
    forkTopicSummary,
    0,
  );

  return {
    forkComplete,
    forkSnapshot,
    forkTerminalSnapshot,
    forkTopic: forkTopicSummary,
  };
}

export async function waitForNavigator(client, conversationId, openViewCount, timeoutMs) {
  return waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", { conversationId }),
    (state) => state.rowCount === 1 && state.openViewCount === openViewCount,
    timeoutMs,
  );
}

export function assertNavigator(state, topic, expectedOpenViews) {
  assertCondition(
    state.rowCount === 1 &&
      state.conversationId === topic.id &&
      state.openViewCount === expectedOpenViews &&
      state.label.includes(topic.title),
    "conversation navigator mismatch",
    { expectedOpenViews, state, topic },
  );
}

export function assertDriverAction(result, property) {
  assertCondition(result?.[property] === true, `topic conversation action ${property} failed`, {
    result,
  });
}

export function conversationSurfaces(surfaces, conversationId) {
  return surfaces.filter((surface) => surface.conversationId === conversationId);
}

export function hasReadyConversation(surfaces, conversationId) {
  return conversationSurfaces(surfaces, conversationId).some(
    (surface) => surface.projectionStatus === "ready" && !surface.inputDisabled,
  );
}

function assertDurableForkCreation(forked, parent, sourceTurn) {
  const context = { forked, parent, sourceTurn };
  assertForkConversationFields(forked, parent, context);
  assertForkBranchFields(forked.branch, forked, parent, sourceTurn, context);
  assertForkProviderFields(forked.branch, forked, context);
  assertForkOwnedState(forked, context);
  return {
    id: forked.conversation.id,
    paletteId: forked.presentationProfile.resolvedPaletteId,
    title: forked.conversation.title,
  };
}

function assertForkConversationFields(forked, parent, context) {
  assertForkField(forked.conversation.status === "idle", "child status", context);
  assertForkField(forked.turns.turns.length === 0, "child turns", context);
  assertForkField(Boolean(forked.threadBinding), "child thread binding", context);
  assertForkField(
    forked.threadBinding?.threadId !== parent.threadBinding?.threadId,
    "independent child thread",
    context,
  );
}

function assertForkBranchFields(branch, forked, parent, sourceTurn, context) {
  assertForkField(branch?.childConversationId === forked.conversation.id, "branch child", context);
  assertForkField(
    branch?.parentConversationId === parent.conversation.id,
    "branch parent",
    context,
  );
  assertForkField(branch?.forkedAtTurnId === sourceTurn.id, "branch source turn", context);
  assertForkField(
    branch?.sourceTrajectorySequence === parent.conversation.lastTrajectorySequence,
    "branch source trajectory",
    context,
  );
}

function assertForkProviderFields(branch, forked, context) {
  assertForkField(
    branch?.providerMetadata?.decisionSource === "explicit",
    "decision source",
    context,
  );
  assertForkField(
    branch?.providerMetadata?.providerForkThreadId === forked.threadBinding?.threadId,
    "provider fork thread",
    context,
  );
}

function assertForkOwnedState(forked, context) {
  assertForkField(
    forked.narratorState.conversationId === forked.conversation.id,
    "child narrator",
    context,
  );
  assertForkField(
    forked.presentationProfile.conversationId === forked.conversation.id,
    "child presentation",
    context,
  );
}

function assertForkField(matches, field, context) {
  assertCondition(matches, `durable fork creation drifted at ${field}`, context);
}

function assertForkDidNotContaminateParent(before, after) {
  const context = { after, before };
  assertForkField(
    after.eventCursor.sequence === before.eventCursor.sequence,
    "parent cursor",
    context,
  );
  assertForkField(
    after.conversation.lastTrajectorySequence === before.conversation.lastTrajectorySequence,
    "parent trajectory cursor",
    context,
  );
  assertForkField(
    JSON.stringify(after.turns) === JSON.stringify(before.turns),
    "parent turns",
    context,
  );
  assertForkField(
    JSON.stringify(after.trajectory) === JSON.stringify(before.trajectory),
    "parent trajectory",
    context,
  );
}

async function forkTopic(client, request) {
  return client.evaluate(`window.setta.conversations.fork(${JSON.stringify(request)})`);
}

async function waitForConversationSurfaces(client, ready, timeoutMs) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => ready(state.surfaces),
    timeoutMs,
  );
}

async function waitForConversationSurface(client, conversationId, ready, timeoutMs) {
  const state = await waitForConversationSurfaces(
    client,
    (surfaces) => {
      const surface = conversationSurfaces(surfaces, conversationId)[0];
      return Boolean(surface && ready(surface));
    },
    timeoutMs,
  );
  return conversationSurfaces(state.surfaces, conversationId)[0];
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready, timeoutMs) {
  return waitForBackendState(
    async () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    timeoutMs,
  );
}

function completedForkSurface(surface) {
  return (
    surface.state === "complete" &&
    surface.status === "completed" &&
    surface.artifactCount === 1 &&
    surface.summaryText === "Narrator completed fork child artifact."
  );
}

function completedForkSnapshot(snapshot) {
  return (
    snapshot.turns.turns.length === 1 &&
    snapshot.turns.turns[0]?.status === "completed" &&
    hasFinalNarrationForEveryTurn(snapshot) &&
    narratorObservedThroughTerminalSequence(snapshot)
  );
}

function hasFinalNarrationForEveryTurn(snapshot) {
  return snapshot.turns.turns.every((turn) =>
    snapshot.narration.events.some(
      (event) => event.kind === "final_summary" && event.turnId === turn.id,
    ),
  );
}

function narratorObservedThroughTerminalSequence(snapshot) {
  return (
    snapshot.narratorState.observedThroughSequence >= snapshot.conversation.lastTrajectorySequence
  );
}

function assertCondition(condition, message, context) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(context)}`);
  }
}
