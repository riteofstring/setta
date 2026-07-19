import { waitForBackendState } from "./electron-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import { reloadPage, waitForSelector, waitForState } from "./electron-cdp-harness.mjs";

const navigatorPageLimit = 80;

export async function createTopic(
  client,
  backend,
  workspaceId,
  title,
  timeoutMs,
  { allowCatalogExhaustion = false } = {},
) {
  const item = await createAndListTopic({ backend, timeoutMs, title, workspaceId });
  assertCreatedTopicVoice(item, title, allowCatalogExhaustion);
  await presentCreatedTopic({ backend, client, item, timeoutMs, workspaceId });
  const presentedPage = await listTopics(backend, workspaceId);
  const presentedItem = requireListedTopic(
    presentedPage,
    (candidate) => candidate.conversation.id === item.conversation.id,
    `presented topic ${title}`,
  );
  return {
    id: presentedItem.conversation.id,
    narratorVoiceId: presentedItem.presentationProfile.resolvedNarratorVoiceId,
    narratorVoiceSelection: presentedItem.presentationProfile.narratorVoiceSelection,
    paletteId: presentedItem.presentationProfile.resolvedPaletteId,
    title,
  };
}

async function createAndListTopic({ backend, timeoutMs, title, workspaceId }) {
  const before = await listTopics(backend, workspaceId);
  const created = await backend.post("/conversations/create", { title, workspaceId });
  if (created.conversation?.title !== title || created.conversation?.workspaceId !== workspaceId) {
    throw new Error(`created topic did not match its request: ${JSON.stringify(created)}`);
  }
  const page = await waitForBackendState(
    async () => listTopics(backend, workspaceId),
    (current) =>
      current.items.length === Math.min(before.items.length + 1, navigatorPageLimit) &&
      current.items.some((item) => item.conversation.title === title),
    timeoutMs,
  );
  return requireListedTopic(
    page,
    (candidate) => candidate.conversation.title === title,
    `created topic ${title}`,
  );
}

function requireListedTopic(page, matches, description) {
  const item = page.items.find(matches);
  if (!item) {
    throw new Error(`${description} was not listed: ${JSON.stringify(page)}`);
  }
  return item;
}

function assertCreatedTopicVoice(item, title, allowCatalogExhaustion) {
  const profile = item.presentationProfile;
  const valid =
    profile.narratorVoiceSelection === "auto_distinct" &&
    profile.requestedNarratorVoiceId === null &&
    typeof profile.resolvedNarratorVoiceId === "string" &&
    validNarratorVoiceReuse(profile.narratorVoiceReuse, allowCatalogExhaustion);
  if (!valid) {
    throw new Error(
      `created topic ${title} has an invalid durable narrator voice selection: ${JSON.stringify(profile)}`,
    );
  }
}

async function presentCreatedTopic({ backend, client, item, timeoutMs, workspaceId }) {
  const conversationId = item.conversation.id;
  const presentation = await client.driver("topicConversationRequestPresentation", {
    conversationId,
    title: item.conversation.title,
    workspaceId,
  });
  if (presentation.kind !== "opened" && presentation.kind !== "focused") {
    throw new Error(`created topic could not be presented: ${JSON.stringify(presentation)}`);
  }
  await waitForConversationSurface(
    client,
    conversationId,
    (surface) => surface.projectionStatus === "ready" && !surface.inputDisabled,
    timeoutMs,
  );
  await waitForConversationNavigatorRow(client, conversationId, timeoutMs);
  await waitForPersistedConversationPane(backend, workspaceId, conversationId, timeoutMs);
}

export function waitForPersistedConversationPane(backend, workspaceId, conversationId, timeoutMs) {
  void workspaceId;
  return waitForBackendState(
    () => backend.get("/app/panes/layout"),
    (result) =>
      result.layout?.panes.some(
        (pane) =>
          pane.surfaceKind === "conversation" &&
          pane.conversationConfig?.conversationId === conversationId,
      ) === true,
    timeoutMs,
  );
}

function validNarratorVoiceReuse(reuse, allowCatalogExhaustion) {
  return (
    reuse === null ||
    (allowCatalogExhaustion &&
      reuse.reason === "catalog_exhausted" &&
      typeof reuse.resolvedChoiceId === "string" &&
      reuse.resolvedChoiceId !== "" &&
      Array.isArray(reuse.conflictingConversationIds) &&
      reuse.conflictingConversationIds.length > 0)
  );
}

export function listTopics(backend, workspaceId) {
  return backend.post("/conversations/navigator/list", {
    cursor: null,
    limit: navigatorPageLimit,
    query: "",
    workspaceId,
  });
}

export async function exerciseSideAndDurableForkWorkflow(args) {
  const workingParent = await startWorkingParent(args);
  const { parentSnapshot: afterAnsweredSide, side } = await exerciseEphemeralSideForkWorkflow({
    ...args,
    parentSnapshot: workingParent,
  });
  const afterFailedSide = await exerciseSideTurnFailurePresentation({
    ...args,
    parentSnapshot: afterAnsweredSide,
  });
  const afterPendingSideClose = await exercisePendingSidePaneClose({
    ...args,
    parentSnapshot: afterFailedSide,
  });
  const afterPaneCloseSide = await exercisePaneCloseSideDisposal({
    ...args,
    parentSnapshot: afterPendingSideClose,
  });
  const parentSnapshot = await finishWorkingParent({
    ...args,
    parentSnapshot: afterPaneCloseSide,
  });
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

export async function verifyReloadedConversationProjections({
  alpha,
  beta,
  client,
  restartSide,
  timeoutMs,
}) {
  await waitForConversationNavigatorRow(client, alpha.id, timeoutMs);
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", { conversationId: alpha.id }),
    "clicked",
  );
  const alphaSurface = await waitForConversationSurface(
    client,
    alpha.id,
    (surface) =>
      surface.projectionStatus === "ready" &&
      surface.status === "completed" &&
      surface.sideId === restartSide.id &&
      surface.sideStatus === "active" &&
      surface.sideParentStatus === "idle",
    timeoutMs,
  );
  await waitForConversationNavigatorRow(client, beta.id, timeoutMs);
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", { conversationId: beta.id }),
    "clicked",
  );
  const betaSurface = await waitForConversationSurface(
    client,
    beta.id,
    (surface) => surface.projectionStatus === "ready" && surface.status === "failed",
    timeoutMs,
  );
  assertCondition(
    alphaSurface.paletteId === alpha.paletteId &&
      alphaSurface.status === "completed" &&
      alphaSurface.sideId === restartSide.id &&
      alphaSurface.sideStatus === "active" &&
      alphaSurface.sideParentStatus === "idle" &&
      betaSurface.paletteId === beta.paletteId &&
      betaSurface.status === "failed",
    "reloaded topic projections do not match durable state",
    { alphaSurface, betaSurface },
  );
  return { surfaces: [alphaSurface, betaSurface] };
}

export async function exerciseEphemeralSideForkFailure({
  backend,
  client,
  parentTopic,
  timeoutMs,
  workspaceId,
}) {
  const initial = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.conversation.status === "idle" && snapshot.sideConversations.length === 0,
    timeoutMs,
  );
  const before = await ensureLinkedParentForSideForkFailure({
    backend,
    client,
    parentSnapshot: initial,
    parentTopic,
    timeoutMs,
    workspaceId,
  });
  const surfaces = await waitForConversationSurfaces(
    client,
    (candidates) => conversationSurfaces(candidates, parentTopic.id).length > 0,
    timeoutMs,
  );
  const parentPane = conversationSurfaces(surfaces.surfaces, parentTopic.id)[0];
  assertCondition(parentPane?.paneId, "parent pane is unavailable for failed side fork", {
    surfaces,
  });
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: parentTopic.id,
      text: "side provider failure",
    }),
    "submitted",
  );
  const failedSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) => snapshot.sideConversations.some((side) => side.status === "failed"),
    timeoutMs,
  );
  const failedSide = failedSnapshot.sideConversations.find((side) => side.status === "failed");
  const failedPresentation = await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) =>
      surface.sideStatus === "failed" && surface.sideTranscriptText.includes("no rollout found"),
    timeoutMs,
  );
  const context = { before, failedPresentation, failedSide, failedSnapshot };
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
    failedSnapshot.eventCursor.sequence >= before.eventCursor.sequence + 3,
    "failed side lifecycle did not publish resume, preparing, and failed commits",
    context,
  );
  assertSideDidNotContaminateParent(before, failedSnapshot);
  return { failedSide, parentSnapshot: failedSnapshot };
}

async function ensureLinkedParentForSideForkFailure({
  backend,
  client,
  parentSnapshot,
  parentTopic,
  timeoutMs,
  workspaceId,
}) {
  if (parentSnapshot.threadBinding !== null) return parentSnapshot;
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: parentTopic.id,
      text: "complete parent before side fork no rollout",
    }),
    "submitted",
  );
  return waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.threadBinding !== null &&
      snapshot.conversation.status === "idle" &&
      snapshot.sideConversations.length === 0 &&
      snapshot.turns.turns.at(-1)?.status === "completed",
    timeoutMs,
  );
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
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: parentTopic.id,
      text: "side lifecycle answer",
    }),
    "submitted",
  );
  const sidePresentation = await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.sideId !== "" && surface.sideParentStatus === "working",
    timeoutMs,
  );
  const sideId = sidePresentation.sideId;
  const answered = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (candidate) =>
          candidate.id === sideId &&
          candidate.activeTurnId === null &&
          candidate.activeProviderTurnId === null,
      ) &&
      snapshot.sideEvents.events.some(
        (event) =>
          event.sideConversationId === sideId &&
          event.event.kind === "agent_message_completed" &&
          event.event.agentMessageCompleted?.text === "Completed side lifecycle answer.",
      ) &&
      snapshot.sideEvents.events.some(
        (event) => event.sideConversationId === sideId && event.event.kind === "turn_completed",
      ),
    timeoutMs,
  );
  const side = assertEphemeralSideCreation(answered, parentSnapshot, parentPane.paneId, sideId);
  assertSideDidNotContaminateParent(parentSnapshot, answered);
  assertCondition(
    answered.sideEvents.events
      .filter((event) => event.sideConversationId === side.id)
      .every((event) => event.event.conversationId === side.id),
    "side event escaped its isolated ledger",
    { answered, side },
  );
  const answeredPresentation = await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) =>
      surface.sideId === side.id &&
      surface.sideStatus === "active" &&
      surface.sideParentStatus === "working" &&
      surface.sideTranscriptText.includes("side lifecycle answer") &&
      surface.sideTranscriptText.includes("Completed side lifecycle answer."),
    timeoutMs,
  );
  assertCondition(
    answeredPresentation.sideParentStatus === "working",
    "side presentation hid the active parent status",
    { answeredPresentation },
  );
  assertDriverAction(
    await client.driver("topicConversationEndSide", { conversationId: parentTopic.id }),
    "ended",
  );
  const disposed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
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
  await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.sideId === "" && surface.state === "working",
    timeoutMs,
  );
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

async function exerciseSideTurnFailurePresentation({
  backend,
  client,
  parentSnapshot,
  parentTopic,
  timeoutMs,
  workspaceId,
}) {
  const parentSurface = await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.state === "working" && surface.sideId === "",
    timeoutMs,
  );
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: parentTopic.id,
      text: "fail side presentation",
    }),
    "submitted",
  );
  const failedPresentation = await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) =>
      surface.sideId !== "" &&
      surface.sideStatus === "active" &&
      surface.sideParentStatus === "working" &&
      surface.sideTranscriptText.includes("Scripted topic failure"),
    timeoutMs,
  );
  const failed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (candidate) =>
          candidate.id === failedPresentation.sideId &&
          candidate.status === "active" &&
          candidate.activeTurnId === null &&
          candidate.activeProviderTurnId === null,
      ) &&
      snapshot.sideEvents.events.some(
        (event) =>
          event.sideConversationId === failedPresentation.sideId &&
          event.event.kind === "turn_failed" &&
          event.event.turnFailed?.failure.message === "Scripted topic failure",
      ),
    timeoutMs,
  );
  assertEphemeralSideCreation(
    failed,
    parentSnapshot,
    parentSurface.paneId,
    failedPresentation.sideId,
  );
  assertSideDidNotContaminateParent(parentSnapshot, failed);
  assertDriverAction(
    await client.driver("topicConversationEndSide", { conversationId: parentTopic.id }),
    "ended",
  );
  const disposed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (candidate) =>
          candidate.id === failedPresentation.sideId &&
          candidate.status === "disposing" &&
          candidate.disposedAt !== null,
      ),
    timeoutMs,
  );
  assertSideDidNotContaminateParent(failed, disposed);
  await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.state === "working" && surface.sideId === "",
    timeoutMs,
  );
  return disposed;
}

async function startWorkingParent({
  backend,
  client,
  parentSnapshot,
  parentTopic,
  timeoutMs,
  workspaceId,
}) {
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: parentTopic.id,
      text: "hold parent during side presentation",
    }),
    "submitted",
  );
  await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.state === "working" && surface.sideId === "",
    timeoutMs,
  );
  const working = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.conversation.status === "working" &&
      snapshot.turns.turns.at(-1)?.status === "running" &&
      terminalTurnsHaveFinalNarration(snapshot),
    timeoutMs,
  );
  assertCondition(
    working.turns.turns.length === parentSnapshot.turns.turns.length + 1,
    "working-parent setup did not add exactly one turn",
    { parentSnapshot, working },
  );
  return working;
}

async function exercisePendingSidePaneClose({
  backend,
  client,
  parentSnapshot,
  parentTopic,
  timeoutMs,
  workspaceId,
}) {
  const parentSurface = await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.state === "working" && surface.sideId === "",
    timeoutMs,
  );
  const knownSideIds = new Set(parentSnapshot.sideConversations.map((side) => side.id));
  const action = await client.driver("topicConversationSubmitAndClose", {
    conversationId: parentTopic.id,
    text: "hold close while side creation is pending",
  });
  assertDriverAction(action, "submitted");
  assertDriverAction(action, "closing");
  const closeAttempt = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (candidate) =>
          !knownSideIds.has(candidate.id) &&
          candidate.parentPaneId === parentSurface.paneId &&
          (candidate.status === "disposing" ||
            (candidate.status === "active" && candidate.activeTurnId !== null)),
      ),
    timeoutMs,
  );
  const closeAttemptSide = closeAttempt.sideConversations.find(
    (candidate) =>
      !knownSideIds.has(candidate.id) && candidate.parentPaneId === parentSurface.paneId,
  );
  let closePaneAfterSideEnd = false;
  if (closeAttemptSide?.status === "active") {
    await waitForConversationSurface(
      client,
      parentTopic.id,
      (surface) =>
        surface.sideId === closeAttemptSide.id &&
        surface.sideStatus === "active" &&
        surface.sideParentStatus === "working",
      timeoutMs,
    );
    assertDriverAction(
      await client.driver("topicConversationEndSide", { conversationId: parentTopic.id }),
      "ended",
    );
    closePaneAfterSideEnd = true;
  }
  const disposed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (candidate) =>
          !knownSideIds.has(candidate.id) &&
          candidate.parentPaneId === parentSurface.paneId &&
          candidate.status === "disposing" &&
          candidate.disposedAt !== null &&
          candidate.resolvedSideAgentInvocation.outcome === "cancelled",
      ),
    timeoutMs,
  );
  const disposedSide = disposed.sideConversations.find(
    (candidate) =>
      !knownSideIds.has(candidate.id) && candidate.parentPaneId === parentSurface.paneId,
  );
  assertCondition(
    disposedSide &&
      disposedSide.parentConversationId === parentTopic.id &&
      disposedSide.decisionSource === "conversation_router",
    "closing during side creation orphaned or rebound the pane-owned side",
    { disposed, parentSnapshot, parentSurface },
  );
  assertSideDidNotContaminateParent(parentSnapshot, disposed);
  if (closePaneAfterSideEnd) {
    assertDriverAction(
      await client.driver("topicConversationCloseOneBoundPane", {
        conversationId: parentTopic.id,
      }),
      "clicked",
    );
  }
  await waitForConversationSurfaces(
    client,
    (surfaces) => conversationSurfaces(surfaces, parentTopic.id).length === 0,
    timeoutMs,
  );
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", {
      conversationId: parentTopic.id,
    }),
    "clicked",
  );
  await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.state === "working" && surface.sideId === "",
    timeoutMs,
  );
  return disposed;
}

async function exercisePaneCloseSideDisposal({
  backend,
  client,
  parentSnapshot,
  parentTopic,
  timeoutMs,
  workspaceId,
}) {
  const parentSurface = await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.state === "working" && surface.sideId === "",
    timeoutMs,
  );
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: parentTopic.id,
      text: "hold pane-close side",
    }),
    "submitted",
  );
  const sidePresentation = await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) =>
      surface.sideId !== "" &&
      surface.sideStatus === "active" &&
      surface.sideParentStatus === "working" &&
      surface.sideTranscriptText.includes("hold pane-close side"),
    timeoutMs,
  );
  const active = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (candidate) =>
          candidate.id === sidePresentation.sideId &&
          candidate.activeTurnId !== null &&
          candidate.activeProviderTurnId !== null,
      ),
    timeoutMs,
  );
  assertEphemeralSideCreation(
    active,
    parentSnapshot,
    parentSurface.paneId,
    sidePresentation.sideId,
  );
  assertSideDidNotContaminateParent(parentSnapshot, active);
  assertDriverAction(
    await client.driver("topicConversationCloseOneBoundPane", {
      confirmSide: true,
      conversationId: parentTopic.id,
    }),
    "clicked",
  );
  const disposed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (candidate) =>
          candidate.id === sidePresentation.sideId &&
          candidate.status === "disposing" &&
          candidate.disposedAt !== null &&
          candidate.resolvedSideAgentInvocation.outcome === "cancelled",
      ) &&
      snapshot.sideEvents.events.some(
        (event) =>
          event.sideConversationId === sidePresentation.sideId &&
          event.event.kind === "turn_interrupted",
      ),
    timeoutMs,
  );
  assertSideDidNotContaminateParent(active, disposed);
  await waitForConversationSurfaces(
    client,
    (surfaces) => conversationSurfaces(surfaces, parentTopic.id).length === 0,
    timeoutMs,
  );
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", {
      conversationId: parentTopic.id,
    }),
    "clicked",
  );
  await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.state === "working" && surface.sideId === "",
    timeoutMs,
  );
  return disposed;
}

async function finishWorkingParent({
  backend,
  client,
  parentSnapshot,
  parentTopic,
  timeoutMs,
  workspaceId,
}) {
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: parentTopic.id,
      text: "finish the parent after side work",
    }),
    "submitted",
  );
  const completed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.conversation.status === "idle" &&
      snapshot.turns.turns.at(-1)?.status === "completed" &&
      terminalTurnsHaveFinalNarration(snapshot),
    timeoutMs,
  );
  assertCondition(
    completed.turns.turns.length === parentSnapshot.turns.turns.length,
    "steering the working parent changed its turn count",
    { completed, parentSnapshot },
  );
  await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.state === "complete" && surface.status === "completed",
    timeoutMs,
  );
  return completed;
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
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: parentTopic.id,
      text: "hold restart side",
    }),
    "submitted",
  );
  const sidePresentation = await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) =>
      surface.sideId !== "" &&
      surface.sideStatus === "active" &&
      surface.sideTranscriptText.includes("hold restart side"),
    timeoutMs,
  );
  const active = await waitForConversationSnapshot(
    backend,
    workspaceId,
    parentTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (candidate) =>
          candidate.id === sidePresentation.sideId &&
          candidate.disposedAt === null &&
          candidate.activeTurnId !== null &&
          candidate.activeProviderTurnId !== null,
      ),
    timeoutMs,
  );
  const side = assertEphemeralSideCreation(
    active,
    parentSnapshot,
    parentPane.paneId,
    sidePresentation.sideId,
  );
  assertSideDidNotContaminateParent(parentSnapshot, active);
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", {
      conversationId: parentTopic.id,
    }),
    "clicked",
  );
  await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", {
      conversationId: parentTopic.id,
    }),
    (state) => state.focusedPaneId === parentPane.paneId && state.openViewCount === 1,
    timeoutMs,
  );
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
  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: parentTopic.id,
      text: forkTitle,
    }),
    "submitted",
  );
  const forkPage = await waitForBackendState(
    async () => listTopics(backend, workspaceId),
    (page) => page.items.some((item) => item.conversation.title === forkTitle),
    timeoutMs,
  );
  const forkItem = forkPage.items.find((item) => item.conversation.title === forkTitle);
  assertCondition(forkItem, "durable fork was not added to the navigator", { forkPage, forkTitle });
  const forkSnapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    forkItem.conversation.id,
    (snapshot) =>
      snapshot.branch?.parentConversationId === parentTopic.id &&
      snapshot.branch.forkedAtTurnId === sourceTurn.id &&
      snapshot.turns.turns.length === 1 &&
      snapshot.turns.turns[0]?.status === "completed" &&
      terminalTurnsHaveFinalNarration(snapshot),
    timeoutMs,
  );
  const forkTopicSummary = assertDurableForkCreation(forkSnapshot, parentSnapshot, sourceTurn);

  const childPresentation = await waitForConversationSurface(
    client,
    forkTopicSummary.id,
    (surface) =>
      surface.projectionStatus === "ready" &&
      surface.forkParentConversationId === parentTopic.id &&
      surface.forkParentTitle.includes(parentTopic.title),
    timeoutMs,
  );
  await waitForConversationNavigatorRow(client, forkTopicSummary.id, timeoutMs);
  await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", {
      conversationId: forkTopicSummary.id,
    }),
    (state) => state.focusedPaneId === childPresentation.paneId && state.openViewCount === 1,
    timeoutMs,
  );
  const parentSurfaces = await waitForConversationSurfaces(
    client,
    (surfaces) => conversationSurfaces(surfaces, parentTopic.id).length === 1,
    timeoutMs,
  );
  const parentPane = conversationSurfaces(parentSurfaces.surfaces, parentTopic.id)[0];
  assertCondition(parentPane?.paneId, "parent pane is unavailable for fork lineage navigation", {
    parentSurfaces,
  });
  assertDriverAction(
    await client.driver("topicConversationOpenParent", {
      conversationId: forkTopicSummary.id,
    }),
    "opened",
  );
  await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", {
      conversationId: parentTopic.id,
    }),
    (state) => state.focusedPaneId === parentPane.paneId && state.openViewCount === 1,
    timeoutMs,
  );
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", {
      conversationId: forkTopicSummary.id,
    }),
    "clicked",
  );
  await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", {
      conversationId: forkTopicSummary.id,
    }),
    (state) => state.focusedPaneId === childPresentation.paneId && state.openViewCount === 1,
    timeoutMs,
  );

  await reloadPage(client);
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await client.installDriver();
  const persistedNavigator = await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", {
      conversationId: forkTopicSummary.id,
    }),
    (state) =>
      state.rowCount === 1 &&
      state.openViewCount === 1 &&
      state.label.includes("open in workspace"),
    timeoutMs,
  );
  assertCondition(
    persistedNavigator.label.includes(`durable fork of ${parentTopic.title}`) &&
      persistedNavigator.parentConversationId === parentTopic.id,
    "fork navigator lineage is missing",
    { persistedNavigator },
  );
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", {
      conversationId: forkTopicSummary.id,
    }),
    "clicked",
  );
  const navigator = await waitForNavigator(client, forkTopicSummary.id, 1, timeoutMs);
  assertNavigator(navigator, forkTopicSummary, 1);
  await waitForConversationSurface(
    client,
    forkTopicSummary.id,
    (surface) =>
      surface.projectionStatus === "ready" &&
      surface.forkParentConversationId === parentTopic.id &&
      surface.forkParentTitle.includes(parentTopic.title),
    timeoutMs,
  );
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
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", {
      conversationId: forkTopicSummary.id,
    }),
    "clicked",
  );
  await waitForConversationSurface(
    client,
    forkTopicSummary.id,
    (surface) => surface.projectionStatus === "ready" && surface.state === "complete",
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
    (snapshot) =>
      snapshot.conversation.lastTrajectorySequence ===
      parentSnapshot.conversation.lastTrajectorySequence,
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
  assertForkField(
    forked.turns.turns.length === 1 && forked.turns.turns[0]?.status === "completed",
    "child turns",
    context,
  );
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
  assertForkField(branch?.decisionSource === "conversation_router", "decision source", context);
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

function waitForConversationNavigatorRow(client, conversationId, timeoutMs) {
  return waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", { conversationId }),
    (state) => state.rowCount === 1,
    timeoutMs,
  );
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
    surface.summaryText === "Fork child artifact completed."
  );
}

function completedForkSnapshot(snapshot) {
  return (
    snapshot.turns.turns.length === 2 &&
    snapshot.turns.turns.every((turn) => turn.status === "completed") &&
    hasFinalNarrationForEveryTurn(snapshot)
  );
}

function hasFinalNarrationForEveryTurn(snapshot) {
  return snapshot.turns.turns.every((turn) =>
    snapshot.narration.events.some(
      (event) => event.kind === "final_summary" && event.turnId === turn.id,
    ),
  );
}

function terminalTurnsHaveFinalNarration(snapshot) {
  const summarizedTurnIds = new Set(
    snapshot.narration.events
      .filter((event) => event.kind === "final_summary" && event.turnId)
      .map((event) => event.turnId),
  );
  return snapshot.turns.turns
    .filter((turn) => ["cancelled", "completed", "failed"].includes(turn.status))
    .every((turn) => summarizedTurnIds.has(turn.id));
}

function assertEphemeralSideCreation(snapshot, parent, paneId, sideId) {
  const side = snapshot.sideConversations.find((candidate) => candidate.id === sideId);
  const sourceTurn = parent.turns.turns.at(-1);
  const context = { paneId, parent, side, snapshot, sourceTurn };
  assertCondition(side, "side record is missing from parent snapshot", context);
  assertCondition(
    side.parentConversationId === parent.conversation.id && side.parentPaneId === paneId,
    "side parent drifted",
    context,
  );
  assertCondition(
    side.decisionSource === "conversation_router",
    "side decision source drifted",
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
    snapshot.eventCursor.sequence >= parent.eventCursor.sequence + 2,
    "side lifecycle did not publish its preparing and active commits",
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
      invocation.providerReferences.threadId === side.providerThreadId,
    "side invocation lifecycle drifted",
    context,
  );
}

function assertSideDidNotContaminateParent(before, after) {
  const context = { after, before };
  for (const field of ["conversation", "turns", "queue", "trajectory", "artifacts"]) {
    assertCondition(
      JSON.stringify(after[field]) === JSON.stringify(before[field]),
      `side fork contaminated parent ${field}`,
      context,
    );
  }
  assertParentThreadBindingStableAcrossSideFork(before.threadBinding, after.threadBinding, context);
}

function assertParentThreadBindingStableAcrossSideFork(before, after, context) {
  const normalize = (binding) =>
    binding === null
      ? null
      : {
          conversationId: binding.conversationId,
          createdAt: binding.createdAt,
          lastTurnId: binding.lastTurnId,
          provider: binding.provider,
          providerMetadata: binding.providerMetadata,
          status: binding.status,
          threadId: binding.threadId,
        };
  assertCondition(
    JSON.stringify(normalize(after)) === JSON.stringify(normalize(before)),
    "side fork contaminated parent threadBinding",
    context,
  );
}

function assertCondition(condition, message, context) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(context)}`);
  }
}
