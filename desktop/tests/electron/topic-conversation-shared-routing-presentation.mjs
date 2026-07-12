import { join } from "node:path";

import { waitForBackendState } from "./chat-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import { captureScreenshot, waitForState } from "./electron-cdp-harness.mjs";
import {
  assertDriverAction,
  assertNavigator,
  conversationSurfaces,
  waitForNavigator,
} from "./topic-conversation-fork-workflow.mjs";
import {
  assertPaneClarificationExchange,
  duplicateConversationPaneId,
  readConversationInputRoutingState,
  sharedPaneClarificationIsCleared,
  sharedPaneClarificationIsReady,
  waitForRecordedTextConversationInput,
} from "./topic-conversation-input-routing-assertions.mjs";
import { assertDuplicateConversationPalette } from "./topic-conversation-projection-assertions.mjs";

export async function exerciseSharedPaneClarification({
  artifactDir,
  backend,
  client,
  conversation,
  originalPaneId,
  otherConversationId,
  recordingDir,
  timeoutMs,
  workspaceId,
}) {
  await client.driver("topicConversationOpenBoundPane", { conversationId: conversation.id });
  const duplicated = await waitForConversationSurfaces(
    client,
    (surfaces) =>
      conversationSurfaces(surfaces, conversation.id).length === 2 &&
      conversationSurfaces(surfaces, otherConversationId).length === 1 &&
      conversationSurfaces(surfaces, conversation.id).every(
        (surface) => surface.projectionStatus === "ready",
      ),
    timeoutMs,
  );
  assertDuplicateConversationPalette(duplicated.surfaces, conversation.id);
  assertNavigator(await waitForNavigator(client, conversation.id, 2, timeoutMs), conversation, 2);
  await captureScreenshot(client, join(artifactDir, "two-topics-and-duplicate.png"));
  const duplicatePaneId = duplicateConversationPaneId(
    duplicated.surfaces,
    conversation.id,
    originalPaneId,
  );

  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: conversation.id,
      text: "clarify pane request",
    }),
    "submitted",
  );
  const root = await waitForRecordedTextConversationInput(
    recordingDir,
    conversation.id,
    "clarify pane request",
    timeoutMs,
  );
  await waitForConversationSurfaces(
    client,
    (surfaces) =>
      sharedPaneClarificationIsReady(
        surfaces,
        conversation.id,
        otherConversationId,
        "Which exact pane request should I send?",
      ),
    timeoutMs,
  );

  assertDriverAction(
    await client.driver("topicConversationSubmit", {
      conversationId: conversation.id,
      paneId: duplicatePaneId,
      text: "send the clarified pane request",
    }),
    "submitted",
  );
  const reply = await waitForRecordedTextConversationInput(
    recordingDir,
    conversation.id,
    "send the clarified pane request",
    timeoutMs,
    root.accepted.input.id,
  );
  const clarifiedState = await waitForBackendState(
    () => readConversationInputRoutingState(client, workspaceId, reply.request),
    (state) => state.input?.status === "dispatched",
    timeoutMs,
  );
  assertPaneClarificationExchange(clarifiedState, root, reply);
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversation.id,
    (snapshot) =>
      snapshot.conversation.status === "idle" &&
      snapshot.turns.turns.some(
        (turn) =>
          turn.authoredInput.text === "send the clarified pane request" &&
          turn.status === "completed",
      ),
    timeoutMs,
  );
  await waitForConversationSurfaces(
    client,
    (surfaces) => sharedPaneClarificationIsCleared(surfaces, conversation.id),
    timeoutMs,
  );
  return duplicated;
}

function waitForConversationSurfaces(client, ready, timeoutMs) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => ready(state.surfaces),
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
