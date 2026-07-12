import { waitForBackendState } from "./chat-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import { reloadPage, waitForSelector, waitForState } from "./electron-cdp-harness.mjs";

export async function createTopic(client, backend, workspaceId, title, timeoutMs) {
  const before = await listTopics(backend, workspaceId);
  assertDriverAction(await client.driver("topicConversationCreate", { title }), "created");
  const page = await waitForBackendState(
    async () => listTopics(backend, workspaceId),
    (current) =>
      current.items.length === before.items.length + 1 &&
      current.items.some((item) => item.conversation.title === title),
    timeoutMs,
  );
  const item = page.items.find((candidate) => candidate.conversation.title === title);
  if (!item) {
    throw new Error(`created topic ${title} was not listed: ${JSON.stringify(page)}`);
  }
  if (
    item.presentationProfile.narratorVoiceSelection !== "auto_distinct" ||
    item.presentationProfile.requestedNarratorVoiceId !== null ||
    typeof item.presentationProfile.resolvedNarratorVoiceId !== "string" ||
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
    timeoutMs,
  );
  return {
    id: item.conversation.id,
    narratorVoiceId: item.presentationProfile.resolvedNarratorVoiceId,
    narratorVoiceSelection: item.presentationProfile.narratorVoiceSelection,
    paletteId: item.presentationProfile.resolvedPaletteId,
    title,
  };
}

export function listTopics(backend, workspaceId) {
  return backend.post("/conversations/navigator/list", {
    cursor: null,
    limit: 80,
    query: "",
    workspaceId,
  });
}

export async function exerciseSideAndDurableForkWorkflow(args) {
  const { parentSnapshot, side } = await exerciseEphemeralSideForkWorkflow(args);
  const durableFork = await exerciseDurableForkWorkflow({
    ...args,
    parentSnapshot,
  });
  const restartSide = await createOpenEphemeralSide({
    ...args,
    parentSnapshot,
  });
  return { ...durableFork, restartSide, side };
}

export async function exerciseEphemeralSideForkFailure({
  backend,
  client,
  parentTopic,
  timeoutMs,
  workspaceId,
}) {
  const before = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.conversation.status === "idle" && snapshot.sideConversations.length === 0,
    timeoutMs,
  );
  const surfaces = await waitForConversationSurfaces(
    client,
    (candidates) => conversationSurfaces(candidates, parentTopic.id).length > 0,
    timeoutMs,
  );
  const parentPane = conversationSurfaces(surfaces.surfaces, parentTopic.id)[0];
  assertCondition(parentPane?.paneId, "parent pane is unavailable for failed side fork", {
    surfaces,
  });
  const rejected = await rejectSideCreation(client, {
    parentConversationId: parentTopic.id,
    parentPaneId: parentPane.paneId,
    workspaceId,
  });
  assertCondition(
    rejected.rejected && rejected.message.includes("no rollout found"),
    "side provider failure did not reach the desktop caller",
    { rejected },
  );
  const failedSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) => snapshot.sideConversations.some((side) => side.status === "failed"),
    timeoutMs,
  );
  const failedSide = failedSnapshot.sideConversations.find((side) => side.status === "failed");
  const context = { before, failedSide, failedSnapshot, rejected };
  assertCondition(failedSide, "failed side audit record is missing", context);
  assertCondition(
    failedSide.providerThreadId === null &&
      failedSide.failure?.code === "side_thread_fork_failed" &&
      failedSide.failure.retryable === true &&
      failedSide.resolvedSideAgentInvocation.outcome === "failed" &&
      failedSide.resolvedSideAgentInvocation.endedAt !== null,
    "failed side audit record drifted",
    context,
  );
  assertCondition(
    failedSnapshot.eventCursor.sequence === before.eventCursor.sequence + 2,
    "failed side lifecycle did not publish preparing and failed commits",
    context,
  );
  assertSideDidNotContaminateParent(before, failedSnapshot);
  return { failedSide, parentSnapshot: failedSnapshot };
}

export async function exerciseEphemeralSideForkWorkflow({
  backend,
  client,
  parentSnapshot,
  parentTopic,
  timeoutMs,
  workspaceId,
}) {
  const surfaces = await waitForConversationSurfaces(
    client,
    (candidates) => conversationSurfaces(candidates, parentTopic.id).length > 0,
    timeoutMs,
  );
  const parentPane = conversationSurfaces(surfaces.surfaces, parentTopic.id)[0];
  assertCondition(parentPane?.paneId, "parent pane is unavailable for side fork", { surfaces });
  const created = await createSide(client, {
    parentConversationId: parentTopic.id,
    parentPaneId: parentPane.paneId,
    workspaceId,
  });
  const side = assertEphemeralSideCreation(created, parentSnapshot, parentPane.paneId);
  const parentAfterSide = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.eventCursor.sequence === created.eventCursor.sequence &&
      snapshot.sideConversations.some((candidate) => candidate.id === side.id),
    timeoutMs,
  );
  assertSideDidNotContaminateParent(parentSnapshot, parentAfterSide);
  const sent = await sendSideTurn(client, {
    parentConversationId: parentTopic.id,
    sideConversationId: side.id,
    text: "side lifecycle answer",
    workspaceId,
  });
  const answered = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.eventCursor.sequence >= sent.eventCursor.sequence &&
      snapshot.sideConversations.some(
        (candidate) =>
          candidate.id === side.id &&
          candidate.activeTurnId === null &&
          candidate.activeProviderTurnId === null,
      ) &&
      snapshot.sideEvents.events.some(
        (event) =>
          event.sideConversationId === side.id &&
          event.event.kind === "agent_message_completed" &&
          event.event.agentMessageCompleted?.text === "Completed side lifecycle answer.",
      ) &&
      snapshot.sideEvents.events.some(
        (event) => event.sideConversationId === side.id && event.event.kind === "turn_completed",
      ),
    timeoutMs,
  );
  assertSideDidNotContaminateParent(parentAfterSide, answered);
  assertCondition(
    answered.sideEvents.events
      .filter((event) => event.sideConversationId === side.id)
      .every((event) => event.event.conversationId === side.id),
    "side event escaped its isolated ledger",
    { answered, side },
  );
  const disposedResponse = await disposeSide(client, {
    parentConversationId: parentTopic.id,
    parentPaneId: parentPane.paneId,
    sideConversationId: side.id,
    workspaceId,
  });
  const disposed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.eventCursor.sequence >= disposedResponse.eventCursor.sequence &&
      snapshot.sideConversations.some(
        (candidate) =>
          candidate.id === side.id &&
          candidate.status === "disposing" &&
          candidate.disposedAt !== null &&
          candidate.resolvedSideAgentInvocation.outcome === "cancelled",
      ),
    timeoutMs,
  );
  assertSideDidNotContaminateParent(answered, disposed);
  const page = await backend.post("/conversations/navigator/list", {
    cursor: null,
    limit: 100,
    query: "",
    workspaceId,
  });
  assertCondition(
    page.items.every((item) => item.conversation.id !== side.id),
    "ephemeral side entered the durable conversation navigator",
    { page, side },
  );
  return {
    parentSnapshot: disposed,
    side: disposed.sideConversations.find((candidate) => candidate.id === side.id),
  };
}

async function createOpenEphemeralSide({
  backend,
  client,
  parentSnapshot,
  parentTopic,
  timeoutMs,
  workspaceId,
}) {
  const surfaces = await waitForConversationSurfaces(
    client,
    (candidates) => conversationSurfaces(candidates, parentTopic.id).length > 0,
    timeoutMs,
  );
  const parentPane = conversationSurfaces(surfaces.surfaces, parentTopic.id)[0];
  assertCondition(parentPane?.paneId, "parent pane is unavailable for restart side", { surfaces });
  const created = await createSide(client, {
    parentConversationId: parentTopic.id,
    parentPaneId: parentPane.paneId,
    workspaceId,
  });
  const side = assertEphemeralSideCreation(created, parentSnapshot, parentPane.paneId);
  await sendSideTurn(client, {
    parentConversationId: parentTopic.id,
    sideConversationId: side.id,
    text: "hold restart side",
    workspaceId,
  });
  const active = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (candidate) =>
          candidate.id === side.id &&
          candidate.disposedAt === null &&
          candidate.activeTurnId !== null &&
          candidate.activeProviderTurnId !== null,
      ),
    timeoutMs,
  );
  assertSideDidNotContaminateParent(parentSnapshot, active);
  return active.sideConversations.find((candidate) => candidate.id === side.id);
}

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

async function createSide(client, request) {
  return client.evaluate(`window.setta.conversations.createSide(${JSON.stringify(request)})`);
}

async function sendSideTurn(client, request) {
  return client.evaluate(`window.setta.conversations.sendSide(${JSON.stringify(request)})`);
}

async function disposeSide(client, request) {
  return client.evaluate(`window.setta.conversations.disposeSide(${JSON.stringify(request)})`);
}

async function rejectSideCreation(client, request) {
  return client.evaluate(`(async () => {
    try {
      await window.setta.conversations.createSide(${JSON.stringify(request)});
      return { message: "", rejected: false };
    } catch (error) {
      return { message: String(error?.message ?? error), rejected: true };
    }
  })()`);
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

function assertEphemeralSideCreation(created, parent, paneId) {
  const side = [...created.sideConversations]
    .reverse()
    .find((candidate) => candidate.parentPaneId === paneId);
  const sourceTurn = parent.turns.turns.at(-1);
  const context = { created, paneId, parent, side, sourceTurn };
  assertCondition(side, "side record is missing from parent snapshot", context);
  assertCondition(
    side.parentConversationId === parent.conversation.id,
    "side parent drifted",
    context,
  );
  assertCondition(
    side.parentStatus === parent.conversation.status &&
      side.sourceProviderThreadId === parent.threadBinding?.threadId,
    "side parent status or source thread projection drifted",
    context,
  );
  assertCondition(side.status === "active" && side.failure === null, "side is not active", context);
  assertCondition(
    side.providerThreadId && side.providerThreadId !== parent.threadBinding?.threadId,
    "side provider thread is not independent",
    context,
  );
  assertCondition(
    side.sourceProviderTurnId === sourceTurn?.providerTurnId &&
      side.sourceTrajectorySequence === parent.conversation.lastTrajectorySequence,
    "side source boundary drifted",
    context,
  );
  assertSideInvocation(side, context);
  assertCondition(
    created.eventCursor.sequence === parent.eventCursor.sequence + 2,
    "side lifecycle did not publish preparing and active commits",
    context,
  );
  return side;
}

function assertSideInvocation(side, context) {
  const invocation = side.resolvedSideAgentInvocation;
  assertCondition(invocation.role === "side_agent", "side invocation role drifted", context);
  assertCondition(
    invocation.requested.modelSelection.modelId === "gpt-5.6-luna" &&
      invocation.resolved.modelId === "gpt-5.6-luna" &&
      invocation.resolved.reasoningEffort === "medium",
    "side invocation model drifted",
    context,
  );
  assertCondition(
    invocation.resolved.permissionProfile.providerPermissionProfile === ":read-only" &&
      invocation.resolved.permissionProfile.workspaceMutation === false,
    "side invocation permissions drifted",
    context,
  );
  assertCondition(
    invocation.outcome === "running" &&
      invocation.providerReferences.threadId === side.providerThreadId &&
      invocation.contextUsage.inputBytes > 0,
    "side invocation lifecycle drifted",
    context,
  );
}

function assertSideDidNotContaminateParent(before, after) {
  const context = { after, before };
  for (const field of [
    "conversation",
    "turns",
    "queue",
    "threadBinding",
    "trajectory",
    "artifacts",
    "narratorState",
    "narration",
  ]) {
    assertCondition(
      JSON.stringify(after[field]) === JSON.stringify(before[field]),
      `side fork contaminated parent ${field}`,
      context,
    );
  }
}

function assertCondition(condition, message, context) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(context)}`);
  }
}
