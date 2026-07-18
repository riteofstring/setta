import { rm } from "node:fs/promises";
import { join } from "node:path";

import { chatTextInput } from "./chat-input-helpers.mjs";

export async function runUnreadConversationWorkflow({
  appendWorkflowState,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  clickButtonContainingText,
  createChat,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  recordingRoot,
  stopLaunchedContext,
  submitComposer,
  waitForBackendState,
  waitForRunStatus,
  waitForRunWithPrompt,
  waitForState,
  waitForTexts,
}) {
  const fixture = await createFixture("unread-conversations");
  const firstRecording = join(recordingRoot, "unread-conversations", "first-launch");
  const secondRecording = join(recordingRoot, "unread-conversations", "second-launch");
  let first = null;
  let second = null;
  let workspaceId;
  let inactiveConversationId;

  try {
    first = await launchContext(fixture, firstRecording);
    const backend = await backendProbe(firstRecording);
    workspaceId = await openWorkspace(first.client, fixture.workspaceRoot, backend);

    const activeConversationId = await createChat(first.client, backend, workspaceId);
    const activePrompt = "active read anchor";
    await submitComposer(first.client, activePrompt, "Send message");
    await waitForRunWithPrompt(
      backend,
      workspaceId,
      activeConversationId,
      activePrompt,
      "completed",
    );
    await waitForTexts(first.client, [activePrompt, `Scripted response: ${activePrompt}`]);

    inactiveConversationId = await createChat(first.client, backend, workspaceId);
    await clickButtonContainingText(first.client, activePrompt);
    await waitForTexts(first.client, [activePrompt, `Scripted response: ${activePrompt}`]);

    const inactivePrompt = "inactive unread marker";
    const sent = await backend.post("/chat/messages/send", {
      conversationId: inactiveConversationId,
      input: chatTextInput(inactivePrompt),
      workspaceId,
    });
    await waitForRunStatus(backend, workspaceId, inactiveConversationId, sent.run.id, "completed");
    const unread = await waitForConversationUnread(
      backend,
      workspaceId,
      inactiveConversationId,
      waitForBackendState,
    );
    await waitForConversationUnreadIndicator(first.client, inactivePrompt, true, waitForState);

    await clickButtonContainingText(first.client, inactivePrompt);
    await waitForTexts(first.client, [inactivePrompt, `Scripted response: ${inactivePrompt}`]);
    const read = await waitForConversationRead(
      backend,
      workspaceId,
      inactiveConversationId,
      waitForBackendState,
    );
    await waitForConversationUnreadIndicator(first.client, inactivePrompt, false, waitForState);
    await appendWorkflowState(firstRecording, {
      conversationId: inactiveConversationId,
      latestReadRelevantMarker: read.latestReadRelevantMarker,
      readMarker: read.readMarker,
      type: "unread_markers",
      unreadLatestReadRelevantMarker: unread.latestReadRelevantMarker,
      unreadReadMarker: unread.readMarker,
    });

    await captureScreenshot(first.client, join(firstRecording, "marked-read.png"));
    await stopLaunchedContext(first);
    first = null;

    second = await launchContext(fixture, secondRecording);
    const restartedBackend = await backendProbe(secondRecording);
    await waitForTexts(second.client, ["workspace-root", inactivePrompt]);
    const persisted = await waitForConversationRead(
      restartedBackend,
      workspaceId,
      inactiveConversationId,
      waitForBackendState,
    );
    if (persisted.latestReadRelevantMarker !== read.latestReadRelevantMarker) {
      throw new Error(
        `persisted latest marker = ${persisted.latestReadRelevantMarker}, want ${read.latestReadRelevantMarker}`,
      );
    }
    await waitForConversationUnreadIndicator(second.client, inactivePrompt, false, waitForState);
    await captureScreenshot(second.client, join(secondRecording, "persisted-read.png"));
  } catch (error) {
    throw await unreadWorkflowFailure({
      captureScreenshot,
      error,
      failureWithLogs,
      first,
      recordingRoot,
      second,
    });
  } finally {
    await stopLaunchedContext(first);
    await stopLaunchedContext(second);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  await assertRecordingEvidence(firstRecording, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/conversations/list",
      "/chat/conversations/mark-read",
      "/chat/messages/page",
      "/chat/messages/send",
      "/chat/runs/list",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:list-conversations",
      "chat:mark-conversation-read",
      "chat:message-page",
      "chat:send-message",
    ],
  });
  await assertRecordingEvidence(secondRecording, {
    backendPaths: ["/workspace-session", "/chat/conversations/list", "/chat/messages/page"],
    ipcChannels: ["workspace:session", "chat:list-conversations", "chat:message-page"],
  });
}

async function unreadWorkflowFailure({
  captureScreenshot,
  error,
  failureWithLogs,
  first,
  recordingRoot,
  second,
}) {
  await captureScreenshot(
    first?.client ?? second?.client,
    join(recordingRoot, "unread-conversations", "failure.png"),
  ).catch(() => {});
  const logs = [...(first?.electron.logs ?? []), ...(second?.electron.logs ?? [])];
  return failureWithLogs(error, logs);
}

async function waitForConversationUnread(
  backend,
  workspaceId,
  conversationId,
  waitForBackendState,
) {
  return waitForConversationSummary(
    backend,
    workspaceId,
    conversationId,
    (item) => item.latestReadRelevantMarker > item.readMarker,
    waitForBackendState,
  );
}

async function waitForConversationRead(backend, workspaceId, conversationId, waitForBackendState) {
  return waitForConversationSummary(
    backend,
    workspaceId,
    conversationId,
    (item) =>
      item.latestReadRelevantMarker > 0 && item.latestReadRelevantMarker === item.readMarker,
    waitForBackendState,
  );
}

async function waitForConversationSummary(
  backend,
  workspaceId,
  conversationId,
  isReady,
  waitForBackendState,
) {
  return waitForBackendState(
    async () => {
      const list = await backend.post("/chat/conversations/list", { workspaceId });
      return list.conversations.find((item) => item.conversation.id === conversationId) ?? null;
    },
    (item) => item !== null && isReady(item),
  );
}

async function waitForConversationUnreadIndicator(client, label, unread, waitForState) {
  await waitForState(client, conversationRowsExpression(), (value) =>
    value.rows.some((row) => row.text.includes(label) && row.unread === unread),
  );
}

function conversationRowsExpression() {
  return `(() => ({
    rows: Array.from(document.querySelectorAll('[data-testid="conversation-list-item"]')).map((row) => ({
      text: row.innerText,
      unread: Boolean(row.querySelector('[aria-label="Unread assistant response"]')),
    })),
  }))()`;
}
