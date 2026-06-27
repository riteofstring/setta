#!/usr/bin/env node
import { mkdir, rm } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  assertNoCriticalDiagnostics,
  assertRendererQueueMatchesBackend,
  waitForModelPickerSummary,
} from "./chat-workflow-assertions.mjs";
import {
  appendWorkflowState,
  assertAssistantCompleted,
  assertBuildExists,
  assertChatLayout,
  assertNoActiveRun,
  assertNoLinkedCodexRef,
  assertNoRunWithPrompt,
  assertNoVisibleUserMessage,
  assertQueuedRunNotPromoted,
  assertRecordingEvidence,
  assertRunsDrainedSequentially,
  assertTextAbsent,
  assertTranscriptSequence,
  backendProbe,
  captureScreenshot,
  clickButtonByAria,
  clickButtonByText,
  clickButtonContainingText,
  configureChatWorkflowHarness,
  createChat,
  createFixture,
  createSidebarFixture,
  createTwoWorkspaceFixture,
  failureWithLogs,
  launchContext,
  liveWorkflowTimeoutMs,
  openWorkspace,
  pathTimestamp,
  scrollSidebarNavigationTo,
  setInputValue,
  sidebarMetrics,
  stopElectron,
  stopLaunchedContext,
  submitComposer,
  waitForAssistantTextRendered,
  waitForBackendState,
  waitForCommandResult,
  waitForGoalStatus,
  waitForLinkedCodexRef,
  waitForRunStatus,
  waitForRunWithPrompt,
  waitForState,
  waitForText,
  waitForTexts,
} from "./chat-workflow-harness.mjs";
import { runLiveCodexWorkflow } from "./chat-live-workflow.mjs";
import { runPostCompletionActiveRunWorkflow } from "./chat-workflow-lifecycle-cases.mjs";
import { runProtocolApprovalWorkflows } from "./chat-workflow-approval-cases.mjs";
import { runQueuedControlsWorkflow } from "./chat-workflow-queued-controls-cases.mjs";
import { runSlashCommandWorkflow } from "./chat-workflow-slash-cases.mjs";
import { runUnreadConversationWorkflow } from "./chat-workflow-unread-cases.mjs";
import { runBackendOrchestratorWorkflowLaunch } from "./backend-orchestrator-workflow.mjs";
import {
  assertProtocolNotificationActivity,
  installFakeCodexAppServer,
} from "./codex-protocol-workflow.mjs";
import { runCodexAccountWorkflow } from "./codex-account-workflow.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(desktopRoot, "..");
const options = parseArgs(process.argv.slice(2));
configureChatWorkflowHarness({ visible: options.visible });
const recordingRoot = chatWorkflowRecordingRoot(options);

function parseArgs(args) {
  const parsed = {
    deterministic: true,
    keepArtifacts: false,
    live: false,
    visible: process.env.SETTA_E2E_VISIBLE === "1",
  };
  for (const arg of args) {
    switch (arg) {
      case "--deterministic-only":
        parsed.deterministic = true;
        parsed.live = false;
        break;
      case "--live-only":
        parsed.deterministic = false;
        parsed.live = true;
        break;
      case "--all":
        parsed.deterministic = true;
        parsed.live = true;
        break;
      case "--keep-artifacts":
        parsed.keepArtifacts = true;
        break;
      case "--visible":
        parsed.visible = true;
        break;
      default:
        throw new Error(`unknown chat workflow argument: ${arg}`);
    }
  }
  return parsed;
}

function chatWorkflowRecordingRoot(parsed) {
  const base = join(repoRoot, "test-results", "electron-integration", "chat-workflows");
  if (!parsed.keepArtifacts) {
    return base;
  }
  return join(base, pathTimestamp());
}

async function main() {
  assertBuildExists();
  if (!options.keepArtifacts && options.deterministic) {
    await rm(recordingRoot, { force: true, recursive: true });
  }
  await mkdir(recordingRoot, { recursive: true });

  const results = [];
  if (options.deterministic) {
    await runDeterministicWorkflowLaunch(results);
    await runTranscriptSearchWorkflowLaunch(results);
    await runSidebarNavigationWorkflow(results);
    await runCrossWorkspaceSidebarSummaryWorkflow(results);
    await runUnreadConversationWorkflow({
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
    });
    results.push("unread-conversations");
    process.stdout.write("Electron chat workflow passed: unread-conversations\n");
    await runCodexProtocolWorkflow(results);
    await runRestartWorkflow(results);
    await runBackendOrchestratorWorkflowLaunch(results, recordingRoot);
  }
  if (options.live) {
    await runLiveCodexWorkflow(results, {
      assertAssistantCompleted,
      assertNoActiveRun,
      assertRecordingEvidence,
      backendProbe,
      captureScreenshot,
      createChat,
      createFixture,
      failureWithLogs,
      launchContext,
      liveWorkflowTimeoutMs,
      openWorkspace,
      recordingRoot,
      repoRoot,
      stopElectron,
      assertNoVisibleUserMessage,
      submitComposer,
      waitForAssistantTextRendered,
      waitForBackendState,
      waitForCommandResult,
      waitForGoalStatus,
      waitForLinkedCodexRef,
      waitForRunStatus,
      waitForRunWithPrompt,
      waitForTexts,
    });
  }

  process.stdout.write("Electron chat workflow results:\n");
  for (const result of results) {
    process.stdout.write(`  passed: ${result}\n`);
  }
}

async function runDeterministicWorkflowLaunch(results) {
  const fixture = await createFixture("deterministic");
  const fakeCodex = await installFakeCodexAppServer(fixture);
  const recordingDir = join(recordingRoot, "deterministic");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
    },
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    await runWorkflowStep(results, recordingDir, "codex-account", context.client, async () => {
      await runCodexAccountWorkflow({
        backend,
        clickButtonByAria,
        client: context.client,
        setInputValue,
        waitForText,
        waitForTexts,
      });
    });
    await runWorkflowStep(results, recordingDir, "happy-path", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runHappyPathWorkflow(context.client, backend, workspaceId, conversationId);
    });
    await runWorkflowStep(results, recordingDir, "queued-controls", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runQueuedControlsWorkflow({
        assertChatLayout,
        assertNoActiveRun,
        assertNoCriticalDiagnostics,
        assertTextAbsent,
        assertTranscriptSequence,
        backend,
        clickButtonByAria,
        client: context.client,
        conversationId,
        setInputValue,
        submitComposer,
        waitForBackendState,
        waitForRunStatus,
        waitForRunWithPrompt,
        waitForState,
        waitForText,
        waitForTexts,
        workspaceId,
      });
    });
    await runWorkflowStep(results, recordingDir, "cancel-queue", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runCancelWorkflow(context.client, backend, workspaceId, conversationId);
    });
    await runWorkflowStep(results, recordingDir, "fail-queue", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runFailWorkflow(context.client, backend, workspaceId, conversationId);
    });
    await runWorkflowStep(results, recordingDir, "approvals", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runApprovalsWorkflow(context.client, backend, workspaceId, conversationId);
    });
    await runWorkflowStep(results, recordingDir, "slash-commands", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runSlashCommandWorkflow({
        assertAssistantCompleted,
        assertChatLayout,
        assertNoActiveRun,
        assertNoLinkedCodexRef,
        assertNoRunWithPrompt,
        assertNoVisibleUserMessage,
        assertTextAbsent,
        assertTranscriptSequence,
        backend,
        clickButtonByAria,
        client: context.client,
        conversationId,
        submitComposer,
        waitForCommandResult,
        waitForGoalStatus,
        waitForLinkedCodexRef,
        waitForRunStatus,
        waitForRunWithPrompt,
        waitForState,
        waitForText,
        waitForTexts,
        workspaceId,
      });
    });
    await runWorkflowStep(
      results,
      recordingDir,
      "conversation-switch",
      context.client,
      async () => {
        await runConversationSwitchWorkflow(context.client, backend, workspaceId);
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
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/messages/queue",
      "/chat/messages/queue/edit",
      "/chat/messages/queue/remove",
      "/chat/messages/steer",
      "/chat/messages/steer/immediate",
      "/chat/runs/active",
      "/chat/runs/list",
      "/chat/runs/cancel",
      "/chat/approvals/submit",
      "/chat/commands/list",
      "/chat/commands/execute",
      "/chat/codex/model/set",
      "/chat/codex/reasoning-effort/set",
      "/codex/account",
      "/codex/account/login/start",
      "/codex/account/logout",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:send-message",
      "chat:queue-message",
      "chat:edit-queued-message",
      "chat:remove-queued-message",
      "chat:steer-message",
      "chat:send-steering-immediately",
      "chat:cancel-run",
      "chat:submit-approval",
      "chat:list-commands",
      "chat:execute-command",
      "chat:set-codex-model",
      "chat:set-codex-reasoning-effort",
      "codex-account:logout",
      "codex-account:read",
      "codex-account:start-login",
    ],
  });
}

async function runHappyPathWorkflow(
  client,
  backend,
  workspaceId,
  conversationId,
  { postCompletionActiveRun = true } = {},
) {
  const queuedPrompts = [
    "queued follow-up one from active run",
    "queued follow-up two from active run",
    "queued follow-up three from active run",
  ];
  await submitComposer(client, "workflow hold for queue and steering", "Send message");
  const activeRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "workflow hold for queue and steering",
    "running",
  );
  await waitForText(client, "Workflow stream started.");
  const queuedRuns = [];
  for (const prompt of queuedPrompts) {
    await submitComposer(client, prompt, "Queue follow-up");
    queuedRuns.push(
      await waitForRunWithPrompt(backend, workspaceId, conversationId, prompt, "queued"),
    );
  }
  await waitForTexts(client, [...queuedPrompts, "Queued"]);
  await submitComposer(client, "steer active run", "Send steering message");
  await waitForTexts(client, [
    "Steered with steer active run.",
    "Active workflow complete.",
    ...queuedPrompts.map((prompt) => `Queued response for ${prompt}.`),
  ]);
  await waitForRunStatus(backend, workspaceId, conversationId, activeRun.id, "completed");
  for (const run of queuedRuns) {
    await waitForRunStatus(backend, workspaceId, conversationId, run.id, "completed");
  }
  await assertRunsDrainedSequentially(
    backend,
    workspaceId,
    conversationId,
    [activeRun, ...queuedRuns].map((run) => run.id),
  );
  await assertTranscriptSequence(client, [
    "workflow hold for queue and steering",
    "Active workflow complete.",
    "steer active run",
    "queued follow-up one from active run",
    "Queued response for queued follow-up one from active run.",
    "queued follow-up two from active run",
    "Queued response for queued follow-up two from active run.",
    "queued follow-up three from active run",
    "Queued response for queued follow-up three from active run.",
  ]);
  await assertChatLayout(client);
  await assertNoActiveRun(backend, workspaceId, conversationId);
  await assertAssistantCompleted(backend, workspaceId, conversationId, queuedRuns.at(-1).id);

  if (postCompletionActiveRun) {
    await runPostCompletionActiveRunWorkflow({
      backend,
      client,
      conversationId,
      submitComposer,
      waitForRunStatus,
      waitForRunWithPrompt,
      waitForState,
      waitForTexts,
      workspaceId,
    });
    await assertNoActiveRun(backend, workspaceId, conversationId);
  }
}

async function runTranscriptSearchWorkflowLaunch(results) {
  const fixture = await createFixture("transcript-search");
  const fakeCodex = await installFakeCodexAppServer(fixture);
  const recordingDir = join(recordingRoot, "transcript-search");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
    },
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    await runWorkflowStep(results, recordingDir, "transcript-search", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runHappyPathWorkflow(context.client, backend, workspaceId, conversationId, {
        postCompletionActiveRun: false,
      });
      await runTranscriptSearchWorkflow(context.client);
    });
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
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/messages/queue",
      "/chat/messages/steer",
      "/chat/runs/list",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:send-message",
      "chat:queue-message",
      "chat:steer-message",
    ],
  });
}

async function runTranscriptSearchWorkflow(client) {
  await openChatSearch(client);
  const lateAssistant = "Queued response for queued follow-up three from active run.";
  await setInputValue(client, 'input[placeholder="Search chat"]', lateAssistant);
  await waitForActiveSearchMessage(client, lateAssistant);

  const firstPrompt = "workflow hold for queue and steering";
  await setInputValue(client, 'input[placeholder="Search chat"]', firstPrompt);
  await waitForActiveSearchMessage(client, firstPrompt);
  await clickButtonByAria(client, "Close chat search");
  await waitForState(
    client,
    `(() => ({ open: Boolean(document.querySelector('input[placeholder="Search chat"]')) }))()`,
    (value) => !value.open,
  );
}

async function openChatSearch(client) {
  await client.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "f",
      metaKey: true,
    }));
  })()`);
  await waitForState(
    client,
    `(() => ({ open: Boolean(document.querySelector('input[placeholder="Search chat"]')) }))()`,
    (value) => value.open,
  );
}

async function waitForActiveSearchMessage(client, expectedText) {
  await waitForState(
    client,
    `(() => {
      const row = document.querySelector('[data-search-active="true"]');
      return {
        activeMessageId: row?.getAttribute("data-message-id") ?? "",
        text: row?.innerText ?? "",
      };
    })()`,
    (value) => value.text.includes(expectedText),
  );
}

async function runCancelWorkflow(client, backend, workspaceId, conversationId) {
  await submitComposer(client, "cancel active workflow", "Send message");
  const activeRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "cancel active workflow",
    "running",
  );
  await waitForText(client, "Cancel workflow waiting.");
  await submitComposer(client, "queued follow-up after cancel", "Queue follow-up");
  const queuedRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "queued follow-up after cancel",
    "queued",
  );
  await waitForTexts(client, ["queued follow-up after cancel", "Queued"]);
  await clickButtonByAria(client, "Stop run");
  await assertQueuedRunNotPromoted(backend, workspaceId, conversationId, {
    activeRunId: activeRun.id,
    queuedRunId: queuedRun.id,
    terminalStatus: "cancelled",
  });
  await assertRendererQueueMatchesBackend(client, "queued follow-up after cancel");
  await assertTextAbsent(client, "Queued response for queued follow-up after cancel.");
}

async function runFailWorkflow(client, backend, workspaceId, conversationId) {
  await submitComposer(client, "fail active workflow", "Send message");
  const activeRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "fail active workflow",
    "running",
  );
  await waitForText(client, "Failure workflow waiting.");
  await submitComposer(client, "queued follow-up after failure", "Queue follow-up");
  const queuedRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "queued follow-up after failure",
    "queued",
  );
  await waitForTexts(client, ["queued follow-up after failure", "Queued"]);
  await submitComposer(client, "trigger scripted failure", "Send steering message");
  await waitForTexts(client, ["Scripted failure surfaced.", "error"]);
  await assertQueuedRunNotPromoted(backend, workspaceId, conversationId, {
    activeRunId: activeRun.id,
    queuedRunId: queuedRun.id,
    terminalStatus: "failed",
  });
  await assertRendererQueueMatchesBackend(client, "queued follow-up after failure");
  await assertTextAbsent(client, "Queued response for queued follow-up after failure.");
}

async function runApprovalsWorkflow(client, backend, workspaceId, conversationId) {
  await runProtocolApprovalWorkflows({
    backend,
    clickButtonByAria,
    clickButtonByText,
    client,
    conversationId,
    setInputValue,
    submitComposer,
    waitForRunWithPrompt,
    waitForState,
    waitForText,
    waitForTexts,
    workspaceId,
  });
  await assertNoCriticalDiagnostics(backend, workspaceId, conversationId);
}

async function runConversationSwitchWorkflow(client, backend, workspaceId) {
  const firstConversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "switch workflow first", "Send message");
  await waitForRunWithPrompt(
    backend,
    workspaceId,
    firstConversationId,
    "switch workflow first",
    "completed",
  );
  await waitForTexts(client, ["switch workflow first", "Scripted response: switch workflow first"]);

  const secondConversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "switch workflow second", "Send message");
  await waitForRunWithPrompt(
    backend,
    workspaceId,
    secondConversationId,
    "switch workflow second",
    "completed",
  );
  await waitForTexts(client, [
    "switch workflow second",
    "Scripted response: switch workflow second",
  ]);

  await clickButtonContainingText(client, "switch workflow first");
  await waitForTexts(client, ["switch workflow first", "Scripted response: switch workflow first"]);

  const monitor = startForbiddenTextMonitor(client, [
    "Loading workspace chats.",
    "Loading chats",
    "No chats",
    "Start a conversation for this workspace.",
  ]);
  await clickButtonContainingText(client, "switch workflow second");
  await waitForTexts(client, [
    "switch workflow second",
    "Scripted response: switch workflow second",
  ]);
  await monitor.stop();
}

function startForbiddenTextMonitor(client, forbiddenTexts) {
  let stopped = false;
  const samples = [];
  const promise = (async () => {
    while (!stopped) {
      const body = await client.evaluate("document.body.innerText");
      const found = forbiddenTexts.find((text) => body.includes(text));
      samples.push({ found, timestamp: Date.now() });
      if (found) {
        throw new Error(
          `forbidden transition text rendered: ${found}; samples=${JSON.stringify(samples)}`,
        );
      }
      await delay(16);
    }
  })();
  return {
    stop: async () => {
      stopped = true;
      await promise;
    },
  };
}

async function runWorkflowStep(results, recordingDir, name, client, workflow) {
  try {
    await workflow();
    await captureScreenshot(client, join(recordingDir, `${name}-success.png`));
  } catch (error) {
    await captureScreenshot(client, join(recordingDir, `${name}-failure.png`)).catch(() => {});
    throw error;
  }
  results.push(name);
  await appendWorkflowState(recordingDir, { name, status: "passed" });
  process.stdout.write(`Electron chat workflow passed: ${name}\n`);
}

async function runSidebarNavigationWorkflow(results) {
  const fixture = await createSidebarFixture("sidebar-navigation");
  const recordingDir = join(recordingRoot, "sidebar-navigation");
  const context = await launchContext(fixture, recordingDir);
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    await runWorkflowStep(results, recordingDir, "sidebar-navigation", context.client, async () => {
      await waitForTexts(context.client, [fixture.initialWorkspace.displayName]);
      const conversation = await backend.post("/chat/conversations/create", {
        title: "Large workspace conversation",
        workspaceId: fixture.targetWorkspace.id,
      });

      await scrollSidebarNavigationTo(
        context.client,
        fixture.targetWorkspaceIndex * fixture.sidebarRowHeight,
      );
      await clickButtonByText(context.client, fixture.targetWorkspace.displayName);
      await waitForTexts(context.client, [fixture.targetWorkspace.displayName, conversation.title]);
      await clickButtonContainingText(context.client, conversation.title);

      const targetMetrics = await sidebarMetrics(context.client);
      if (targetMetrics.activeRows >= 40 || targetMetrics.totalElements >= 800) {
        throw new Error(`sidebar target metrics exceeded budget: ${JSON.stringify(targetMetrics)}`);
      }
      if (targetMetrics.conversationRows === 0) {
        throw new Error(
          `selected large-list workspace conversation was not mounted: ${JSON.stringify(targetMetrics)}`,
        );
      }

      await scrollSidebarNavigationTo(
        context.client,
        (fixture.activeWorkspaces.length + 1) * fixture.sidebarRowHeight,
      );
      await clickButtonByText(context.client, fixture.recentWorkspace.displayName);
      const opened = await waitForBackendState(
        async () => backend.get("/workspace-session"),
        (value) => value.selectedWorkspaceId === fixture.recentWorkspace.id,
      );
      if (
        !opened.activeWorkspaces.some((workspace) => workspace.id === fixture.recentWorkspace.id)
      ) {
        throw new Error(`recent workspace did not become active: ${JSON.stringify(opened)}`);
      }

      const recentMetrics = await sidebarMetrics(context.client);
      await appendWorkflowState(recordingDir, {
        recentMetrics,
        targetMetrics,
        type: "sidebar_metrics",
      });
    });
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
      "/workspaces/open",
      "/workspaces/select",
      "/chat/conversations/create",
      "/chat/conversations/list",
      "/chat/messages/page",
    ],
    ipcChannels: [
      "workspace:session",
      "workspace:select",
      "workspace:open-path",
      "chat:list-conversations",
      "chat:message-page",
    ],
  });
}

async function runCrossWorkspaceSidebarSummaryWorkflow(results) {
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
          prompt: backgroundPrompt,
          workspaceId: fixture.secondWorkspace.id,
        });
        await waitForRunStatus(
          backend,
          fixture.secondWorkspace.id,
          conversationId,
          sent.run.id,
          "completed",
        );
        await waitForSidebarConversationRow(context.client, backgroundPrompt, {
          unread: true,
        });

        const created = await backend.post("/chat/conversations/create", {
          title: "Background created chat",
          workspaceId: fixture.secondWorkspace.id,
        });
        await waitForSidebarConversationRow(context.client, created.title, {
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

async function waitForSidebarConversationRow(client, text, { unread }) {
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

async function runCodexProtocolWorkflow(results) {
  const fixture = await createFixture("codex-protocol");
  const fakeCodex = await installFakeCodexAppServer(fixture);
  const recordingDir = join(recordingRoot, "codex-protocol");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
    },
    harness: "codex",
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    const conversationId = await createChat(context.client, backend, workspaceId);
    await waitForModelPickerSummary(waitForState, context.client, "gpt-test", "Extra High");
    await submitComposer(context.client, "protocol notification workflow", "Send message");
    const run = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      "protocol notification workflow",
      "completed",
    );
    await waitForTexts(context.client, [
      "coverage complete",
      "Hook: pre-command",
      "Auto-approval review",
      "file change",
      "Reasoning text",
    ]);
    await waitForModelPickerSummary(waitForState, context.client, "gpt-test", "Extra High");
    await assertProtocolNotificationActivity(backend, workspaceId, conversationId, run.id);
    await assertNoCriticalDiagnostics(backend, workspaceId, conversationId);

    const exitConversationId = await createChat(context.client, backend, workspaceId);
    await submitComposer(context.client, "app-server exit workflow", "Send message");
    const failedRun = await waitForRunWithPrompt(
      backend,
      workspaceId,
      exitConversationId,
      "app-server exit workflow",
      "failed",
    );
    if (!failedRun.error.includes("codex app-server exited")) {
      throw new Error(
        `app-server exit run error did not mention exit: ${JSON.stringify(failedRun)}`,
      );
    }
    await assertNoActiveRun(backend, workspaceId, exitConversationId);
    await captureScreenshot(context.client, join(recordingDir, "success.png"));
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
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/messages/page",
      "/chat/runs/activity",
      "/chat/runs/list",
      "/chat/diagnostics/list",
    ],
    ipcChannels: ["workspace:open-local-folder", "chat:create-conversation", "chat:send-message"],
  });
  results.push("codex-protocol-notifications");
  process.stdout.write("Electron chat workflow passed: codex-protocol-notifications\n");
}

async function runRestartWorkflow(results) {
  const fixture = await createFixture("restart");
  const firstRecording = join(recordingRoot, "restart", "first-launch");
  const secondRecording = join(recordingRoot, "restart", "second-launch");
  let first = null;
  let second = null;

  try {
    first = await launchContext(fixture, firstRecording);
    const backend = await backendProbe(firstRecording);
    const workspaceId = await openWorkspace(first.client, fixture.workspaceRoot, backend);
    const conversationId = await createChat(first.client, backend, workspaceId);
    await runHappyPathWorkflow(first.client, backend, workspaceId, conversationId, {
      postCompletionActiveRun: false,
    });
    await stopLaunchedContext(first);

    second = await launchContext(fixture, secondRecording);
    await waitForTexts(
      second.client,
      [
        "workspace-root",
        "workflow hold for queue and steering",
        "Queued response for queued follow-up one from active run.",
        "Queued response for queued follow-up two from active run.",
        "Queued response for queued follow-up three from active run.",
      ],
      30_000,
    );
    await assertTranscriptSequence(second.client, [
      "workflow hold for queue and steering",
      "Active workflow complete.",
      "steer active run",
      "queued follow-up one from active run",
      "Queued response for queued follow-up one from active run.",
      "queued follow-up two from active run",
      "Queued response for queued follow-up two from active run.",
      "queued follow-up three from active run",
      "Queued response for queued follow-up three from active run.",
    ]);
    await assertChatLayout(second.client);
    await captureScreenshot(second.client, join(secondRecording, "restored.png"));
  } catch (error) {
    await captureScreenshot(
      first?.client ?? second?.client,
      join(recordingRoot, "restart", "failure.png"),
    ).catch(() => {});
    const logs = [...(first?.electron.logs ?? []), ...(second?.electron.logs ?? [])];
    throw failureWithLogs(error, logs);
  } finally {
    await stopLaunchedContext(first);
    await stopLaunchedContext(second);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  await assertRecordingEvidence(firstRecording, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/messages/queue",
      "/chat/messages/steer",
      "/chat/runs/active",
      "/chat/runs/list",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:send-message",
      "chat:queue-message",
      "chat:steer-message",
    ],
  });
  await assertRecordingEvidence(secondRecording, {
    backendPaths: ["/workspace-session", "/chat/conversations/list", "/chat/messages/page"],
    ipcChannels: ["workspace:session", "chat:list-conversations", "chat:message-page"],
  });
  results.push("restart");
  process.stdout.write("Electron chat workflow passed: restart\n");
}

main().catch((error) => {
  process.stderr.write(String(error instanceof Error ? error.message : error) + "\n");
  process.exitCode = 1;
});
