#!/usr/bin/env node
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  appendWorkflowState,
  assertBuildExists,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  clickButtonByText,
  clickButtonContainingText,
  configureChatWorkflowHarness,
  createChat,
  createTwoWorkspaceFixture,
  failureWithLogs,
  launchContext,
  pathTimestamp,
  stopLaunchedContext,
  submitComposer,
  waitForBackendState,
  waitForRunWithPrompt,
  waitForState,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(desktopRoot, "..");
const options = parseArgs(process.argv.slice(2));
configureChatWorkflowHarness({ visible: options.visible });
const recordingDir = lastSelectedChatRecordingDir(options);

function parseArgs(args) {
  const parsed = {
    keepArtifacts: false,
    visible: process.env.SETTA_E2E_VISIBLE === "1",
  };
  for (const arg of args) {
    switch (arg) {
      case "--keep-artifacts":
        parsed.keepArtifacts = true;
        break;
      case "--visible":
        parsed.visible = true;
        break;
      default:
        throw new Error(`unknown last-selected chat workflow argument: ${arg}`);
    }
  }
  return parsed;
}

function lastSelectedChatRecordingDir(parsed) {
  const base = join(repoRoot, "test-results", "electron-integration", "chat-last-selected");
  if (!parsed.keepArtifacts) {
    return base;
  }
  return join(base, pathTimestamp());
}

async function main() {
  assertBuildExists();
  await rm(recordingDir, { force: true, recursive: true });
  await mkdir(recordingDir, { recursive: true });

  const fixture = await createTwoWorkspaceFixture("chat-last-selected");
  const context = await launchContext(fixture, recordingDir);
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir, context.client);
    await waitForTexts(context.client, [
      fixture.firstWorkspace.displayName,
      fixture.secondWorkspace.displayName,
    ]);

    const rememberedConversationId = await createChat(
      context.client,
      backend,
      fixture.firstWorkspace.id,
    );
    await submitComposer(context.client, "remembered workspace chat", "Send message");
    await waitForRunWithPrompt(
      backend,
      fixture.firstWorkspace.id,
      rememberedConversationId,
      "remembered workspace chat",
      "completed",
    );
    await waitForTexts(context.client, [
      "remembered workspace chat",
      "Scripted response: remembered workspace chat",
    ]);

    const topConversationId = await createChat(context.client, backend, fixture.firstWorkspace.id);
    await submitComposer(context.client, "top workspace chat", "Send message");
    await waitForRunWithPrompt(
      backend,
      fixture.firstWorkspace.id,
      topConversationId,
      "top workspace chat",
      "completed",
    );
    await waitForTexts(context.client, [
      "top workspace chat",
      "Scripted response: top workspace chat",
    ]);

    await clickButtonContainingText(context.client, "remembered workspace chat");
    await waitForSelectedConversationId(context.client, rememberedConversationId);

    await clickButtonByText(context.client, fixture.secondWorkspace.displayName);
    await waitForBackendState(
      async () => backend.get("/workspace-session"),
      (value) => value.selectedWorkspaceId === fixture.secondWorkspace.id,
    );

    await clickButtonByText(context.client, fixture.firstWorkspace.displayName);
    await waitForBackendState(
      async () => backend.get("/workspace-session"),
      (value) => value.selectedWorkspaceId === fixture.firstWorkspace.id,
    );
    await waitForSelectedConversationId(context.client, rememberedConversationId);

    await reloadRenderer(context.client);
    await waitForSelectedConversationId(context.client, rememberedConversationId);
    await waitForTexts(context.client, [
      "remembered workspace chat",
      "Scripted response: remembered workspace chat",
    ]);

    const selected = await selectedConversationState(context.client);
    if (selected.conversationId === topConversationId) {
      throw new Error("workspace loaded the top chat instead of the last selected chat");
    }
    await appendWorkflowState(recordingDir, {
      rememberedConversationId,
      selected,
      topConversationId,
      type: "chat_last_selected",
    });
    await captureScreenshot(context.client, join(recordingDir, "success.png"));
  } catch (error) {
    failure = error;
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
  } finally {
    await stopLaunchedContext(context);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  if (failure) {
    throw failureWithLogs(failure, context.electron.logs);
  }
  await assertRecordingEvidence(recordingDir, {
    backendPaths: [
      "/workspace-session",
      "/workspaces/selected-conversation",
      "/workspaces/selected-conversations",
      "/chat/conversations/create",
      "/chat/conversations/list",
      "/chat/messages/page",
      "/chat/messages/send",
      "/chat/runs/list",
    ],
    ipcChannels: [
      "workspace:session",
      "workspace:select",
      "workspace:selected-conversations",
      "workspace:set-selected-conversation",
      "chat:create-conversation",
      "chat:list-conversations",
      "chat:message-page",
      "chat:send-message",
    ],
  });
  process.stdout.write(`Electron chat workflow passed: chat-last-selected\n`);
}

async function waitForSelectedConversationId(client, conversationId) {
  await waitForState(client, selectedConversationExpression(), (value) => {
    return value.conversationId === conversationId;
  });
}

async function selectedConversationState(client) {
  return client.evaluate(selectedConversationExpression());
}

async function reloadRenderer(client) {
  const marker = `reload-${Date.now()}`;
  await markRendererReload(client, marker);
  await client.call("Page.enable");
  await reloadPageIgnoringUncaught(client);
  await waitForRendererReload(client, marker);
}

async function markRendererReload(client, marker) {
  await client.evaluate(
    `(() => { window.__settaWorkflowReloadMarker = ${JSON.stringify(marker)}; })()`,
  );
}

async function reloadPageIgnoringUncaught(client) {
  try {
    await client.call("Page.reload", { ignoreCache: true });
  } catch (error) {
    if (!String(error?.message ?? error).includes("Uncaught")) {
      throw error;
    }
  }
}

async function waitForRendererReload(client, marker) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < 15_000) {
    try {
      const state = await client.evaluate(`(() => ({
        marker: window.__settaWorkflowReloadMarker ?? "",
        readyState: document.readyState,
        url: window.location.href,
      }))()`);
      if (
        state.marker !== marker &&
        (state.readyState === "interactive" || state.readyState === "complete")
      ) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for renderer reload: ${lastError?.message ?? "not ready"}`);
}

function selectedConversationExpression() {
  return `(() => {
    const pane = document.querySelector('[data-testid="chat-detail-pane"]');
    return {
      body: document.body.innerText,
      conversationId: pane?.getAttribute("data-conversation-id") ?? "",
    };
  })()`;
}

await main();
