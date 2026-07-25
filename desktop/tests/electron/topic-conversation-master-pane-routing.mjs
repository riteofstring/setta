import { waitForBackendState } from "./electron-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import { waitForState } from "./electron-cdp-harness.mjs";
import { assertDriverAction, conversationSurfaces } from "./topic-conversation-fork-workflow.mjs";
import {
  assertMasterRouteDecision,
  exerciseMasterOverlayEntryPoints,
  waitForMasterRouteDecision,
} from "./topic-conversation-master-overlay-assertions.mjs";

export async function exerciseMasterPaneRouting({
  artifactDirectory,
  backend,
  client,
  parentTopic,
  sessionId,
  timeoutMs,
  workspaceId,
}) {
  const route = (text, kind, expectedTargetId) =>
    routeMasterInput({
      artifactDirectory,
      backend,
      client,
      expectedTargetId,
      kind,
      sessionId,
      text,
      timeoutMs,
      workspaceId,
    });
  const sideConversationId = await exerciseMasterSideRoute({
    client,
    parentTopic,
    route,
    timeoutMs,
  });
  const forkConversationId = await exerciseMasterForkRoute({
    backend,
    client,
    parentTopic,
    route,
    timeoutMs,
    workspaceId,
  });
  const createdConversationId = await exerciseMasterCreateRoute({
    backend,
    client,
    route,
    timeoutMs,
  });
  return { createdConversationId, forkConversationId, sideConversationId };
}

async function routeMasterInput({
  artifactDirectory,
  backend,
  client,
  expectedTargetId,
  kind,
  sessionId,
  text,
  timeoutMs,
  workspaceId,
}) {
  const submitted = await exerciseMasterOverlayEntryPoints({
    artifactDirectory,
    client,
    text,
    timeoutMs,
    waitForNavigation: true,
    workspaceId,
  });
  const inputId = submitted.accepted.input.id;
  const state = await waitForMasterRouteDecision(backend, inputId, timeoutMs);
  assertMasterRouteDecision(state, {
    expectedInputId: inputId,
    expectedKind: kind,
    expectedSessionId: sessionId,
    expectedTargetId,
  });
  return state.decision.resultingCommand;
}

async function exerciseMasterSideRoute({ client, parentTopic, route, timeoutMs }) {
  const command = await route("Open an Alpha side.", "create_side_conversation", parentTopic.id);
  const side = command.createSideConversation;
  if (!side) {
    throw new Error("master side route omitted its trusted command");
  }
  await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.paneId !== "" && surface.sideId === side.sideConversationId,
    timeoutMs,
  );
  assertDriverAction(
    await client.driver("topicConversationEndSide", { conversationId: parentTopic.id }),
    "ended",
  );
  await waitForConversationSurface(
    client,
    parentTopic.id,
    (surface) => surface.sideId === "",
    timeoutMs,
  );
  return side.sideConversationId;
}

async function exerciseMasterForkRoute({
  backend,
  client,
  parentTopic,
  route,
  timeoutMs,
  workspaceId,
}) {
  const command = await route("Fork Alpha topic.", "fork_conversation", parentTopic.id);
  const fork = command.forkConversation;
  if (!fork) {
    throw new Error("master fork route omitted its trusted command");
  }
  const snapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    fork.target.conversationId,
    (value) =>
      value.branch?.parentConversationId === parentTopic.id &&
      value.branch?.decisionSource === "master" &&
      value.turns.turns[0]?.status === "completed",
    timeoutMs,
  );
  await assertPresentedConversation(client, fork.target.conversationId, timeoutMs);
  await closeConversationPane(client, fork.target.conversationId);
  return snapshot.conversation.id;
}

async function exerciseMasterCreateRoute({ backend, client, route, timeoutMs }) {
  const command = await route("Create Gamma topic.", "create_conversation");
  const created = command.createConversation;
  if (!created) {
    throw new Error("master create route omitted its trusted command");
  }
  if (
    created.target.resourceScope?.kind !== "folderless" ||
    created.target.resourceBindings.length !== 0
  ) {
    throw new Error(`master create route was not folderless: ${JSON.stringify(created)}`);
  }
  const snapshot = await waitForConversationSnapshot(
    backend,
    null,
    created.target.conversationId,
    (value) =>
      value.conversation.title === "Gamma topic" &&
      value.conversation.workspaceId === null &&
      value.narration.events.some(
        (event) =>
          event.kind === "status_reply" &&
          event.statusReply?.question === created.initialInput &&
          event.statusReply?.text.includes("I can answer questions here"),
      ),
    timeoutMs,
  );
  await waitForConversationInputState(
    backend,
    null,
    created.target.conversationId,
    created.initialInputId,
    (state) => state.input?.status === "dispatched",
    timeoutMs,
  );
  await assertPresentedConversation(
    client,
    created.target.conversationId,
    timeoutMs,
    (value) => value.projectionStatus === "ready" && value.state === "idle",
  );
  await closeConversationPane(client, created.target.conversationId);
  return snapshot.conversation.id;
}

async function assertPresentedConversation(
  client,
  conversationId,
  timeoutMs,
  ready = (value) => value.projectionStatus === "ready" && value.state === "complete",
) {
  const surface = await waitForConversationSurface(client, conversationId, ready, timeoutMs);
  await waitForState(
    client,
    driverCallExpression("topicConversationNavigatorState", { conversationId }),
    (state) => state.focusedPaneId === surface.paneId && state.openViewCount === 1,
    timeoutMs,
  );
}

async function waitForConversationSurface(client, conversationId, ready, timeoutMs) {
  const state = await waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (value) => {
      const surface = conversationSurfaces(value.surfaces, conversationId)[0];
      return Boolean(surface && ready(surface));
    },
    timeoutMs,
  );
  return conversationSurfaces(state.surfaces, conversationId)[0];
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready, timeoutMs) {
  return waitForBackendState(
    async () => readConversationSnapshotForWait(backend, workspaceId, conversationId),
    (value) => value !== null && ready(value),
    timeoutMs,
  );
}

function waitForConversationInputState(
  backend,
  workspaceId,
  conversationId,
  inputId,
  ready,
  timeoutMs,
) {
  return waitForBackendState(
    async () =>
      backend.post("/conversations/inputs/state/read", { conversationId, inputId, workspaceId }),
    ready,
    timeoutMs,
  );
}

async function readConversationSnapshotForWait(backend, workspaceId, conversationId) {
  const response = await backend.request("POST", "/conversations/snapshot/read", {
    conversationId,
    workspaceId,
  });
  if (response.status === 404) {
    return null;
  }
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`POST /conversations/snapshot/read returned ${response.status}: ${body}`);
  }
  return JSON.parse(body);
}

async function closeConversationPane(client, conversationId) {
  assertDriverAction(
    await client.driver("topicConversationCloseOneBoundPane", { conversationId }),
    "clicked",
  );
}
