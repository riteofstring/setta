import { rm } from "node:fs/promises";
import { join } from "node:path";

import { chatTextInput } from "./chat-input-helpers.mjs";

export async function runCrossWorkspaceSidebarSummaryWorkflow({
  appendWorkflowState,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  clickButtonByText,
  createChat,
  createTwoWorkspaceFixture,
  failureWithLogs,
  launchContext,
  recordingRoot,
  results,
  runWorkflowStep,
  stopElectron,
  waitForBackendState,
  waitForRunStatus,
  waitForState,
  waitForTexts,
}) {
  const fixture = await createTwoWorkspaceFixture("cross-workspace-sidebar-summary");
  const recordingDir = join(recordingRoot, "cross-workspace-sidebar-summary");
  const context = await launchContext(fixture, recordingDir);
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    await runWorkflowStep(
      results,
      recordingDir,
      "cross-workspace-sidebar-summary",
      context.client,
      async () => {
        await waitForTexts(context.client, [
          fixture.firstWorkspace.displayName,
          fixture.secondWorkspace.displayName,
        ]);

        await clickButtonByText(context.client, fixture.secondWorkspace.displayName);
        await waitForBackendState(
          async () => backend.get("/workspace-session"),
          (value) => value.selectedWorkspaceId === fixture.secondWorkspace.id,
        );
        const conversationId = await createChat(
          context.client,
          backend,
          fixture.secondWorkspace.id,
        );

        await clickButtonByText(context.client, fixture.firstWorkspace.displayName);
        await waitForBackendState(
          async () => backend.get("/workspace-session"),
          (value) => value.selectedWorkspaceId === fixture.firstWorkspace.id,
        );

        const backgroundPrompt = "background sidebar unread";
        const sent = await backend.post("/chat/messages/send", {
          conversationId,
          input: chatTextInput(backgroundPrompt),
          workspaceId: fixture.secondWorkspace.id,
        });
        await waitForRunStatus(
          backend,
          fixture.secondWorkspace.id,
          conversationId,
          sent.run.id,
          "completed",
        );
        await waitForSidebarConversationRow(context.client, waitForState, backgroundPrompt, {
          unread: true,
        });

        const created = await backend.post("/chat/conversations/create", {
          title: "Background created chat",
          workspaceId: fixture.secondWorkspace.id,
        });
        await waitForSidebarConversationRow(context.client, waitForState, created.title, {
          unread: false,
        });

        await appendWorkflowState(recordingDir, {
          backgroundConversationId: conversationId,
          createdConversationId: created.id,
          type: "cross_workspace_sidebar_summary",
        });
      },
    );
  } catch (error) {
    failure = error;
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
  } finally {
    context.client?.close();
    await stopElectron(context.electron);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  if (failure) {
    throw failureWithLogs(failure, context.electron.logs);
  }
  await assertRecordingEvidence(recordingDir, {
    backendPaths: [
      "/workspace-session",
      "/chat/conversations/create",
      "/chat/conversations/list",
      "/chat/messages/page",
      "/chat/messages/send",
      "/chat/runs/list",
    ],
    ipcChannels: [
      "workspace:session",
      "workspace:select",
      "chat:create-conversation",
      "chat:list-conversations",
      "chat:message-page",
    ],
  });
}

async function waitForSidebarConversationRow(client, waitForState, text, { unread }) {
  await waitForState(client, conversationRowsExpression(), (value) =>
    value.rows.some((row) => row.text.includes(text) && row.unread === unread),
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
