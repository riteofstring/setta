#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertNoCriticalDiagnostics,
  assertRendererQueueMatchesBackend,
} from "./chat-workflow-assertions.mjs";
import { assertChatLayout } from "./chat-workflow-layout-assertions.mjs";
import { runLiveCodexWorkflow } from "./chat-live-workflow.mjs";
import { runPostCompletionActiveRunWorkflow } from "./chat-workflow-lifecycle-cases.mjs";
import { runProtocolApprovalWorkflows } from "./chat-workflow-approval-cases.mjs";
import { runSlashCommandWorkflow } from "./chat-workflow-slash-cases.mjs";
import { assertTranscriptSequence } from "./chat-workflow-transcript-assertions.mjs";
import { CDPClient } from "./cdp-client.mjs";
import {
  assertProtocolNotificationActivity,
  installFakeCodexAppServer,
} from "./codex-protocol-workflow.mjs";
import { stopElectron } from "./electron-process.mjs";
import { runCodexAccountWorkflow } from "./codex-account-workflow.mjs";
import { runPaneTabSplitWorkflow } from "./pane-tab-split-workflow.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");
const repoRoot = resolve(desktopRoot, "..");
const options = parseArgs(process.argv.slice(2));
const recordingRoot = chatWorkflowRecordingRoot(options);
const pageLoadTimeoutMs = 20_000;
const workflowTimeoutMs = 30_000;
const liveWorkflowTimeoutMs = 120_000;
const cleanupRetryCount = 5;
const uiShowcaseActivityTypes = [
  "agent_message",
  "plan",
  "reasoning",
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "dynamic_tool_call",
  "collab_agent_tool_call",
  "web_search",
  "image_view",
  "image_generation",
  "terminal_interaction",
  "diff",
  "notice",
  "approval_review",
  "hook",
  "structured_input",
];
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
    await removeTree(recordingRoot);
  }
  await mkdir(recordingRoot, { recursive: true });

  const results = [];
  if (options.deterministic) {
    await runDeterministicWorkflowLaunch(results);
    await runCodexProtocolWorkflow(results);
    await runRestartWorkflow(results);
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
      removeTree,
      repoRoot,
      stopElectron,
      assertNoVisibleUserMessage,
      submitComposer,
      waitForAssistantTextRendered,
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
    await runWorkflowStep(results, recordingDir, "ui-showcase", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runUIShowcaseWorkflow(context.client, backend, workspaceId, conversationId);
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
      "sidebar-chat-actions",
      context.client,
      async () => {
        const conversationId = await createChat(context.client, backend, workspaceId);
        await runSidebarChatActionsWorkflow(context.client, backend, workspaceId, conversationId);
      },
    );
    await runWorkflowStep(results, recordingDir, "pane-tab-split", context.client, async () => {
      await runPaneTabSplitWorkflow({
        captureScreenshot,
        client: context.client,
        recordingDir,
        waitForState,
      });
    });
  } catch (error) {
    failure = error;
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
  } finally {
    context.client?.close();
    await stopElectron(context.electron);
    await removeTree(fixture.tempRoot);
  }

  if (failure) {
    throw failureWithLogs(failure, context.electron.logs);
  }
  await assertRecordingEvidence(recordingDir, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/messages/update-user",
      "/chat/messages/queue",
      "/chat/messages/steer",
      "/chat/runs/active",
      "/chat/runs/list",
      "/chat/runs/cancel",
      "/chat/approvals/submit",
      "/chat/commands/list",
      "/chat/commands/execute",
      "/chat/conversations/delete",
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
      "chat:update-user-message",
      "chat:queue-message",
      "chat:steer-message",
      "chat:cancel-run",
      "chat:submit-approval",
      "chat:list-commands",
      "chat:execute-command",
      "chat:delete-conversation",
      "chat:set-codex-model",
      "chat:set-codex-reasoning-effort",
      "codex-account:logout",
      "codex-account:read",
      "codex-account:start-login",
    ],
  });
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
      "File change output",
      "Reasoning text",
    ]);
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
    await removeTree(fixture.tempRoot);
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
    await pauseNiriBenchmarkForChatWorkflow(second.client);
    await waitForTexts(second.client, [
      "workspace-root",
      "workflow hold for queue and steering",
      "Queued response for queued follow-up one from active run.",
      "Queued response for queued follow-up two from active run.",
      "Queued response for queued follow-up three from active run.",
    ]);
    await assertTranscriptSequence(second.client, [
      "workflow hold for queue and steering",
      "steer active run",
      "Active workflow complete.",
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
    await removeTree(fixture.tempRoot);
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

async function waitForAssistantTextRendered(client, timeoutMs) {
  await waitForState(
    client,
    `(() => {
      const rows = Array.from(document.querySelectorAll('[data-chat-message="true"], [data-testid="chat-assistant-turn-row"], [data-testid="chat-message-row"], [data-testid="chat-queued-turn-row"]'));
      const assistantTexts = rows
        .filter((row) => row.getAttribute("data-message-role") === "assistant")
        .map((row) => row.innerText.trim())
        .filter((text) => text !== "" && text !== "...");
      return { assistantTexts };
    })()`,
    (value) => value.assistantTexts.length > 0,
    timeoutMs,
  );
}

async function stopLaunchedContext(context) {
  if (!context) {
    return;
  }
  context.client?.close();
  await stopElectron(context.electron);
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
  await assertBackendQueuePrompts(backend, workspaceId, conversationId, queuedPrompts);
  await waitForTexts(client, [queuedPrompts.at(-1), "Queued"]);
  await submitComposer(client, "steer active run", "Send steering message");
  const completedTexts = [
    "Steered with steer active run.",
    "Active workflow complete.",
    ...queuedPrompts.map((prompt) => `Queued response for ${prompt}.`),
  ];
  await waitForBackendTranscriptTexts(backend, workspaceId, conversationId, completedTexts);
  await waitForTexts(client, [`Queued response for ${queuedPrompts.at(-1)}.`]);
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
    "steer active run",
    "Active workflow complete.",
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

async function runUIShowcaseWorkflow(client, backend, workspaceId, conversationId) {
  await submitComposer(client, "ui showcase workflow", "Send message");
  const run = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "ui showcase workflow",
    "completed",
  );
  await assertUIShowcaseActivity(backend, workspaceId, conversationId, run.id);
  await waitForTexts(client, ["UI showcase started.", "UI showcase complete."]);
  await assertChatLayout(client);
  await assertNoActiveRun(backend, workspaceId, conversationId);
}

async function assertUIShowcaseActivity(backend, workspaceId, conversationId, runId) {
  const page = await backend.post("/chat/messages/page", {
    conversationId,
    limit: 40,
    workspaceId,
  });
  const showcaseItems = page.runItems.filter(
    (item) => item.runId === runId && item.providerItemId.startsWith("provider_ui_"),
  );
  const itemTypes = new Set(showcaseItems.map((item) => item.type));
  for (const itemType of uiShowcaseActivityTypes) {
    if (!itemTypes.has(itemType)) {
      throw new Error(
        `UI showcase missing activity type ${itemType}: ${JSON.stringify(page.runItems)}`,
      );
    }
  }
  const outputItemIds = new Set(page.runItemOutputs.map((output) => output.runItemId));
  const missingOutput = showcaseItems.find((item) => !outputItemIds.has(item.id));
  if (missingOutput) {
    throw new Error(`UI showcase missing output for item: ${JSON.stringify(missingOutput)}`);
  }
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
  await waitForTexts(client, ["queued follow-up after cancel"]);
  await clickButtonByAria(client, "Stop run");
  await assertQueuedRunNotPromoted(
    backend,
    workspaceId,
    conversationId,
    activeRun.id,
    queuedRun.id,
    "cancelled",
  );
  await waitForTexts(client, ["queued follow-up after cancel", "Queued"]);
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
  await waitForTexts(client, ["queued follow-up after failure"]);
  await submitComposer(client, "trigger scripted failure", "Send steering message");
  await waitForBackendTranscriptTexts(backend, workspaceId, conversationId, [
    "Scripted failure surfaced.",
  ]);
  await assertQueuedRunNotPromoted(
    backend,
    workspaceId,
    conversationId,
    activeRun.id,
    queuedRun.id,
    "failed",
  );
  await waitForTexts(client, ["queued follow-up after failure", "Queued"]);
  await assertRendererQueueMatchesBackend(client, "queued follow-up after failure");
  await assertTextAbsent(client, "Queued response for queued follow-up after failure.");
}

async function runApprovalsWorkflow(client, backend, workspaceId, conversationId) {
  await runProtocolApprovalWorkflows({
    backend,
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

async function runSidebarChatActionsWorkflow(client, backend, workspaceId, conversationId) {
  const [prompt, editedPrompt] = ["sidebar actions workflow", "sidebar actions edited workflow"];
  await submitComposer(client, prompt, "Send message");
  const run = await waitForRunWithPrompt(backend, workspaceId, conversationId, prompt, "completed");
  await assertAssistantCompleted(backend, workspaceId, conversationId, run.id);
  await waitForTexts(client, [prompt, "Scripted response: " + prompt]);
  await clickButtonByAria(client, "Copy message");
  await clickButtonByAria(client, "Edit message");
  await setInputValue(client, 'textarea[aria-label="Edit message text"]', editedPrompt);
  await clickButtonByAria(client, "Save edit");
  await waitForBackendState(
    async () => backend.post("/chat/messages/page", { conversationId, limit: 20, workspaceId }),
    (page) => page.transcript[0]?.triggerMessage?.parts?.[0]?.text === editedPrompt,
  );
  await waitForTexts(client, [editedPrompt]);
  await clickButtonByAria(client, "Pin " + prompt);
  await waitForButtonPressed(client, "Unpin " + prompt, true);
  await clickButtonByAria(client, "Unpin " + prompt);
  await waitForButtonPressed(client, "Pin " + prompt, false);
  await clickButtonByAria(client, "Delete " + prompt);
  await waitForBackendState(
    async () => backend.post("/chat/conversations/list", { workspaceId }),
    (value) => !value.conversations.some((item) => item.conversation.id === conversationId),
  );
  await waitForState(client, bodyTextExpression(), (value) => !value.body.includes(prompt));
}

async function openWorkspace(client, workspaceRoot, backend) {
  await waitForTexts(client, ["Shortcuts", "Projects"]);
  await clickButtonByAria(client, "Open project folder");
  await waitForTexts(client, ["workspace-root", "What should we build in setta?"]);
  const session = await waitForBackendState(
    async () => backend.get("/workspace-session"),
    (value) => Boolean(value.selectedWorkspaceId),
  );
  await pauseNiriBenchmarkForChatWorkflow(client);
  return session.selectedWorkspaceId;
}

async function createChat(client, backend, workspaceId) {
  const before = await backend.post("/chat/conversations/list", { workspaceId });
  const existing = new Set(before.conversations.map((item) => item.conversation.id));
  await clickButtonByAria(client, "New chat");
  await waitForTexts(client, ["New chat"]);
  await waitForComposerReady(client);
  const after = await waitForBackendState(
    async () => backend.post("/chat/conversations/list", { workspaceId }),
    (value) => value.conversations.some((item) => !existing.has(item.conversation.id)),
  );
  const created = after.conversations.find((item) => !existing.has(item.conversation.id));
  if (!created) {
    throw new Error("new conversation was not returned by the backend");
  }
  return created.conversation.id;
}

async function submitComposer(client, text, buttonLabel) {
  await waitForComposerReady(client);
  await setInputValue(client, 'textarea[aria-label="Ask Setta"]', text);
  await clickButtonByAria(client, buttonLabel);
}

async function waitForComposerReady(client) {
  await waitForState(client, composerReadyExpression(), (value) => value.ready);
}

function composerReadyExpression() {
  return `(() => {
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
    return { ready: Boolean(textarea && !textarea.disabled) };
  })()`;
}

async function setInputValue(client, selector, value) {
  const changed = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.disabled) {
      return false;
    }
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor.set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!changed) {
    throw new Error(`input was not editable: ${selector}`);
  }
}

async function clickButtonByAria(client, label) {
  await clickWorkflowButton(client, "aria-label", label);
}

async function clickButtonByText(client, text) {
  await clickWorkflowButton(client, "text", text);
}

async function clickWorkflowButton(client, kind, value) {
  await waitForState(client, buttonClickExpression(kind, value), Boolean);
}

async function waitForButtonPressed(client, label, pressed) {
  await waitForState(
    client,
    `(() => {
      const button = window.findWorkflowButton("aria-label", ${JSON.stringify(label)});
      return {
        body: document.body.innerText,
        pressed: button?.getAttribute("aria-pressed") === "true",
        ready: Boolean(button),
      };
    })()`,
    (value) => value.ready && value.pressed === pressed,
  );
}

function buttonClickExpression(kind, value) {
  return `(() => {
    const button = findWorkflowButton(${JSON.stringify(kind)}, ${JSON.stringify(value)});
    if (!button || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`;
}

async function waitForText(client, text) {
  await waitForTexts(client, [text]);
}

async function waitForTexts(client, texts) {
  await waitForState(client, bodyTextExpression(), (value) =>
    texts.every((text) => value.body.includes(text)),
  );
}

async function pauseNiriBenchmarkForChatWorkflow(client) {
  await client.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowLeft",
    }));
  })()`);
  await waitForState(client, niriChatSurfaceReadyExpression(), (value) => {
    if (!value.niriMounted) {
      return true;
    }
    return (
      value.chatMounted &&
      value.hostRuntimeState === "live" &&
      value.hostMoving === "false" &&
      value.hostVisible === "true"
    );
  });
}

async function assertTextAbsent(client, text) {
  const body = await client.evaluate("document.body.innerText");
  if (body.includes(text)) {
    throw new Error(`unexpected rendered text: ${text}`);
  }
}

function bodyTextExpression() {
  return `(async () => {
    const detail = document.querySelector('[data-testid="chat-detail-pane"]');
    const conversationId = detail?.getAttribute("data-conversation-id") ?? "";
    let transcriptText = "";
    if (conversationId && window.setta?.workspace && window.setta?.chat) {
      const session = await window.setta.workspace.session();
      const workspaceId = session.selectedWorkspaceId ?? "";
      if (workspaceId) {
        const page = await window.setta.chat.messagePage(workspaceId, conversationId, 0, 100);
        const textOf = (message) => message.parts.map((part) => part.text).join("");
        const texts = page.messages
          .toSorted((left, right) => left.ordinal - right.ordinal)
          .map((message) => textOf(message));
        for (const turn of page.transcript) {
          if (turn.triggerMessage) {
            texts.push(textOf(turn.triggerMessage));
          }
          for (const message of turn.steeringMessages) {
            texts.push(textOf(message));
          }
          if (turn.assistantMessage) {
            texts.push(textOf(turn.assistantMessage));
          }
        }
        transcriptText = texts.join("\\n");
      }
    }
    return { body: [document.body.innerText, transcriptText].filter(Boolean).join("\\n") };
  })()`;
}

function niriChatSurfaceReadyExpression() {
  return `(() => {
    const niri = document.querySelector('[data-testid="niri-workspace-area"]');
    const chatSurface = document.querySelector('[data-testid="niri-chat-dom-surface"]');
    const host = chatSurface?.closest('[data-testid="niri-fake-pane-host"]');
    return {
      chatMounted: Boolean(document.querySelector('[data-testid="chat-detail-pane"]')),
      hostMoving: host?.getAttribute("data-moving") ?? "",
      hostRuntimeState: host?.getAttribute("data-runtime-state") ?? "",
      hostVisible: host?.getAttribute("data-visible") ?? "",
      niriMounted: Boolean(niri),
    };
  })()`;
}

async function waitForState(client, expression, isReady, timeoutMs = workflowTimeoutMs) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await client.evaluate(expression);
    if (isReady(lastValue)) {
      return lastValue;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for Electron workflow state: ${JSON.stringify(lastValue)}`);
}

async function backendProbe(recordingDir) {
  const baseURL = await waitForBackendURL(recordingDir);
  await writeFile(join(recordingDir, "backend-url.txt"), baseURL + "\n");
  return {
    baseURL,
    get: (path) => backendRequest(recordingDir, baseURL, "GET", path),
    post: (path, payload) => backendRequest(recordingDir, baseURL, "POST", path, payload),
  };
}

async function backendRequest(recordingDir, baseURL, method, path, payload) {
  const response = await globalThis.fetch(baseURL + path, {
    body: payload === undefined ? undefined : JSON.stringify(payload),
    headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
    method,
  });
  const body = await response.text();
  await appendWorkflowState(recordingDir, {
    method,
    ok: response.ok,
    path,
    status: response.status,
    type: "backend_request",
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${body}`);
  }
  return JSON.parse(body);
}

async function waitForBackendURL(recordingDir) {
  const eventsPath = join(recordingDir, "events.jsonl");
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < pageLoadTimeoutMs) {
    try {
      const events = await readJsonLines(eventsPath);
      const started = events.find((entry) => entry.type === "backend_started");
      const url = started?.payload?.url;
      if (typeof url === "string" && url !== "") {
        return url;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`backend URL was not recorded: ${lastError?.message ?? "timed out"}`);
}

async function waitForBackendState(readState, isReady, timeoutMs = workflowTimeoutMs) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await readState();
    if (isReady(lastValue)) {
      return lastValue;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for backend state: ${JSON.stringify(lastValue)}`);
}

async function waitForRunWithPrompt(backend, workspaceId, conversationId, prompt, status) {
  return waitForBackendState(async () => {
    const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
    return (
      list.runs.find(
        (run) => run.promptSummary === prompt && (status === null || run.status === status),
      ) ?? null
    );
  }, Boolean);
}

async function waitForRunStatus(backend, workspaceId, conversationId, runId, status, timeoutMs) {
  return waitForBackendState(
    async () => {
      const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
      return list.runs.find((run) => run.id === runId) ?? null;
    },
    (run) => run?.status === status,
    timeoutMs,
  );
}

async function assertNoRunWithPrompt(backend, workspaceId, conversationId, prompt) {
  const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
  if (list.runs.some((run) => run.promptSummary === prompt)) {
    throw new Error(`slash command was recorded as a run prompt: ${prompt}`);
  }
}

async function waitForCommandResult(
  backend,
  workspaceId,
  conversationId,
  expectedText,
  timeoutMs = workflowTimeoutMs,
) {
  return waitForBackendState(
    async () =>
      backend.post("/chat/messages/page", {
        conversationId,
        limit: 80,
        workspaceId,
      }),
    (page) =>
      page.messages.some(
        (message) => message.role === "command" && messageText(message).includes(expectedText),
      ),
    timeoutMs,
  );
}

async function waitForLinkedCodexRef(
  backend,
  workspaceId,
  conversationId,
  timeoutMs = workflowTimeoutMs,
) {
  return waitForBackendState(
    async () => backend.post("/chat/conversations/list", { workspaceId }),
    (value) => {
      const item = value.conversations.find(
        (candidate) => candidate.conversation.id === conversationId,
      );
      return Boolean(
        item?.conversation.harnessRefs.some(
          (ref) => ref.harness === "codex" && ref.status === "linked" && ref.threadId !== "",
        ),
      );
    },
    timeoutMs,
  );
}

async function waitForGoalStatus(
  backend,
  workspaceId,
  conversationId,
  status,
  timeoutMs = workflowTimeoutMs,
) {
  return waitForBackendState(
    async () =>
      backend.post("/chat/messages/page", {
        conversationId,
        limit: 80,
        workspaceId,
      }),
    (page) => (status === null ? page.goal === null : page.goal?.status === status),
    timeoutMs,
  );
}

async function assertNoLinkedCodexRef(backend, workspaceId, conversationId) {
  const value = await backend.post("/chat/conversations/list", { workspaceId });
  const item = value.conversations.find(
    (candidate) => candidate.conversation.id === conversationId,
  );
  if (
    item?.conversation.harnessRefs.some(
      (ref) => ref.harness === "codex" && ref.status === "linked" && ref.threadId !== "",
    )
  ) {
    throw new Error(`conversation ${conversationId} unexpectedly has a linked codex ref`);
  }
}

async function assertNoActiveRun(backend, workspaceId, conversationId) {
  const active = await waitForBackendState(
    async () => backend.post("/chat/runs/active", { conversationId, workspaceId }),
    (value) => !value.hasActiveRun,
  );
  if (active.run !== null && active.run !== undefined) {
    throw new Error(
      `active run payload was present after terminal state: ${JSON.stringify(active)}`,
    );
  }
}

async function assertBackendQueuePrompts(backend, workspaceId, conversationId, prompts) {
  const page = await waitForBackendState(
    async () => backend.post("/chat/messages/page", { conversationId, limit: 40, workspaceId }),
    (value) =>
      prompts.every((prompt) =>
        value.queue.runs.some((run) => run.promptSummary === prompt && run.status === "queued"),
      ),
  );
  const queuedTexts = page.queue.messages.map((message) => messageText(message));
  for (const prompt of prompts) {
    if (!queuedTexts.includes(prompt)) {
      throw new Error(`queued prompt ${prompt} was missing from backend page queue`);
    }
  }
}

async function waitForBackendTranscriptTexts(backend, workspaceId, conversationId, texts) {
  await waitForBackendState(
    async () => backend.post("/chat/messages/page", { conversationId, limit: 40, workspaceId }),
    (page) => {
      const transcriptText = page.messages.map((message) => messageText(message)).join("\n");
      return texts.every((text) => transcriptText.includes(text));
    },
  );
}

async function assertRunsDrainedSequentially(backend, workspaceId, conversationId, runIds) {
  const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
  const runsById = new Map(list.runs.map((run) => [run.id, run]));
  const runs = runIds.map((runId) => {
    const run = runsById.get(runId);
    if (!run) {
      throw new Error(`run ${runId} was not returned by /chat/runs/list`);
    }
    return run;
  });
  for (const run of runs) {
    if (run.status !== "completed" || run.startedAt === "" || run.completedAt === "") {
      throw new Error(`run did not complete with timestamps: ${JSON.stringify(run)}`);
    }
  }
  for (let index = 1; index < runs.length; index += 1) {
    const previousCompletedAt = Date.parse(runs[index - 1].completedAt);
    const currentStartedAt = Date.parse(runs[index].startedAt);
    if (currentStartedAt < previousCompletedAt) {
      throw new Error(
        `queued run ${runs[index].id} started before ${runs[index - 1].id} completed: ${JSON.stringify(runs)}`,
      );
    }
  }
}

async function assertNoVisibleUserMessage(client, text) {
  const value = await client.evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('[data-chat-message="true"]'));
    return {
      rows: rows
        .filter((row) => row.getAttribute("data-message-role") === "user")
        .map((row) => row.innerText.trim()),
    };
  })()`);
  const matches = value.rows.filter((rowText) => rowText.includes(text));
  if (matches.length > 0) {
    throw new Error(`found visible user message ${text}: ${JSON.stringify(value.rows)}`);
  }
}

async function assertQueuedRunNotPromoted(
  backend,
  workspaceId,
  conversationId,
  activeRunId,
  queuedRunId,
  terminalStatus,
) {
  await waitForRunStatus(backend, workspaceId, conversationId, activeRunId, terminalStatus);
  await assertNoActiveRun(backend, workspaceId, conversationId);
  const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
  const queued = list.runs.find((run) => run.id === queuedRunId);
  if (!queued) {
    throw new Error(`queued run ${queuedRunId} was not returned by /chat/runs/list`);
  }
  if (queued.status !== "queued") {
    throw new Error(`queued run ${queuedRunId} status = ${queued.status}, want queued`);
  }
  if (queued.startedAt !== "" || queued.assistantMessageId !== "") {
    throw new Error(`queued run ${queuedRunId} was partially promoted: ${JSON.stringify(queued)}`);
  }
  const page = await backend.post("/chat/messages/page", {
    conversationId,
    limit: 40,
    workspaceId,
  });
  if (!page.queue.runs.some((run) => run.id === queuedRunId)) {
    throw new Error(`queued run ${queuedRunId} was not present in page queue state`);
  }
  const queuedAssistant = page.messages.find(
    (message) => message.runId === queuedRunId && message.role === "assistant",
  );
  if (queuedAssistant) {
    throw new Error(
      `queued run ${queuedRunId} has assistant message: ${JSON.stringify(queuedAssistant)}`,
    );
  }
}

async function assertAssistantCompleted(backend, workspaceId, conversationId, runId) {
  const page = await backend.post("/chat/messages/page", {
    conversationId,
    limit: 40,
    workspaceId,
  });
  const assistant = page.messages.find(
    (message) => message.runId === runId && message.role === "assistant",
  );
  if (!assistant || assistant.status !== "complete" || messageText(assistant).trim() === "") {
    throw new Error(
      `assistant response for run ${runId} was not complete: ${JSON.stringify(assistant)}`,
    );
  }
}

function messageText(message) {
  return message.parts.map((part) => part.text).join("");
}

async function removeTree(path) {
  let lastError = null;
  for (let attempt = 0; attempt < cleanupRetryCount; attempt += 1) {
    try {
      await rm(path, { force: true, maxRetries: 2, recursive: true, retryDelay: 100 });
      return;
    } catch (error) {
      lastError = error;
      await delay(100 * (attempt + 1));
    }
  }
  throw lastError;
}

async function launchContext(fixture, recordingDir, options = {}) {
  await removeTree(recordingDir);
  await mkdir(recordingDir, { recursive: true });
  const debugPort = await openPort();
  const electron = launchElectron(debugPort, fixture, recordingDir, options);
  const client = await connectToSettaPage(debugPort);
  await client.call("Runtime.enable");
  await installPageHelpers(client);
  return { client, electron };
}

async function installPageHelpers(client) {
  await client.evaluate(`(() => {
    window.findWorkflowButton = (kind, expected) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((button) => {
        if (kind === "aria-label") {
          return button.getAttribute("aria-label") === expected;
        }
        return button.innerText.trim() === expected;
      }) ?? null;
    };
  })()`);
}

function launchElectron(debugPort, fixture, recordingDir, launchOptions = {}) {
  const harness = launchOptions.harness ?? "scripted-workflow";
  const extraEnv = launchOptions.extraEnv ?? {};
  const e2eEnv = {
    SETTA_E2E: "1",
    SETTA_E2E_BLOCK_EXTERNAL_OPEN: "1",
    SETTA_E2E_OPEN_WORKSPACE_ROOT: fixture.workspaceRoot,
    ...(options.visible ? { SETTA_E2E_VISIBLE: "1" } : {}),
    ...(harness === "scripted-workflow" ? { SETTA_E2E_CHAT_HARNESS: "scripted-workflow" } : {}),
  };
  const electron = spawn(electronBin(), [`--remote-debugging-port=${debugPort}`, "."], {
    cwd: desktopRoot,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      ...extraEnv,
      ...e2eEnv,
      SETTA_APP_DATA_DIR: fixture.appDataDir,
      SETTA_RECORD_INCLUDE_PAYLOADS: "1",
      SETTA_RECORD_SCREENSHOT_INTERVAL_MS: "0",
      SETTA_RECORDING: "1",
      SETTA_RECORDING_DIR: recordingDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  electron.logs = [];
  collectProcessOutput(electron);
  return electron;
}

async function createFixture(name) {
  const tempRoot = await mkdtemp(join(tmpdir(), `setta-electron-${name}-`));
  const appDataDir = join(tempRoot, "app-data");
  const workspaceRoot = join(tempRoot, "workspace-root");
  await mkdir(appDataDir, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  return { appDataDir, tempRoot, workspaceRoot };
}

function assertBuildExists() {
  const mainPath = join(desktopRoot, "out", "main", "index.js");
  if (!existsSync(mainPath)) {
    throw new Error(`desktop build is missing: ${mainPath}. Run pnpm -C desktop build first.`);
  }
}

async function openPort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  await new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
  if (address === null || typeof address === "string") {
    throw new Error("failed to reserve Electron debugging port");
  }
  return address.port;
}

async function connectToSettaPage(debugPort) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < pageLoadTimeoutMs) {
    try {
      const page = await settaPageTarget(debugPort);
      if (page) {
        return CDPClient.connect(page.webSocketDebuggerUrl, pageLoadTimeoutMs);
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Setta page target was not available: ${lastError?.message ?? "timed out"}`);
}

async function settaPageTarget(debugPort) {
  const response = await globalThis.fetch(`http://127.0.0.1:${debugPort}/json/list`);
  if (!response.ok) {
    throw new Error(`DevTools target list returned ${response.status}`);
  }
  const targets = await response.json();
  return targets.find((target) => target.type === "page" && target.title === "Setta") ?? null;
}

function electronBin() {
  const extension = process.platform === "win32" ? ".cmd" : "";
  return join(desktopRoot, "node_modules", ".bin", `electron${extension}`);
}

function collectProcessOutput(child) {
  child.stdout.on("data", (data) => appendLog(child.logs, data));
  child.stderr.on("data", (data) => appendLog(child.logs, data));
}

function appendLog(logs, data) {
  logs.push(data.toString());
  if (logs.length > 100) {
    logs.shift();
  }
}

async function captureScreenshot(client, path) {
  if (!client) {
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await requestRendererLayoutSnapshot(client, "workflow_screenshot");
  const image = await client.call("Page.captureScreenshot", { format: "png" });
  await writeFile(path, Buffer.from(image.data, "base64"));
}

async function requestRendererLayoutSnapshot(client, trigger) {
  if (!client) {
    return;
  }
  await client.evaluate(`(() => {
    window.dispatchEvent(new CustomEvent("setta:record-layout-snapshot", {
      detail: { trigger: ${JSON.stringify(trigger)} },
    }));
  })()`);
  await delay(25);
}

function failureWithLogs(error, logs) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${message}\nElectron output:\n${logs.join("")}`);
}

async function assertRecordingEvidence(recordingDir, expected) {
  await assertNoIpcFailures(recordingDir);
  await assertLayoutSnapshotsRecorded(recordingDir);
  const ipc = await readJsonLines(join(recordingDir, "ipc.jsonl"));
  for (const channel of expected.ipcChannels) {
    if (!ipc.some((entry) => entry.type === "ipc_finish" && entry.channel === channel)) {
      throw new Error(`recording missing successful IPC channel: ${channel}`);
    }
  }
  const backend = await readJsonLines(join(recordingDir, "backend-http.jsonl"));
  const workflowState = await readJsonLinesOptional(join(recordingDir, "workflow-state.jsonl"));
  for (const path of expected.backendPaths) {
    if (
      !backend.some(
        (entry) =>
          entry.type === "backend_http_response" &&
          entry.status === 200 &&
          entry.url.includes(path),
      ) &&
      !workflowState.some(
        (entry) => entry.type === "backend_request" && entry.status === 200 && entry.path === path,
      )
    ) {
      throw new Error(`recording missing successful backend path: ${path}`);
    }
  }
}

async function assertLayoutSnapshotsRecorded(recordingDir) {
  const rendererEvents = await readJsonLines(join(recordingDir, "renderer-events.jsonl"));
  const snapshots = rendererEvents.filter((entry) => entry.type === "layout_snapshot");
  if (snapshots.length === 0) {
    throw new Error(`recording missing renderer layout snapshots: ${recordingDir}`);
  }
  if (!snapshots.some((entry) => entry.chatDetailPane && entry.transcript && entry.composer)) {
    throw new Error(`recording layout snapshots never captured chat regions: ${recordingDir}`);
  }
}

async function assertNoIpcFailures(recordingDir) {
  const ipc = await readJsonLines(join(recordingDir, "ipc.jsonl"));
  const failures = ipc.filter((entry) => entry.type === "ipc_failure");
  if (failures.length > 0) {
    throw new Error(`recording included IPC failures: ${JSON.stringify(failures)}`);
  }
}

async function readJsonLines(path) {
  const content = await readFile(path, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

async function readJsonLinesOptional(path) {
  try {
    return await readJsonLines(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function appendWorkflowState(recordingDir, value) {
  await mkdir(recordingDir, { recursive: true });
  await appendFile(join(recordingDir, "workflow-state.jsonl"), JSON.stringify(value) + "\n");
}

function pathTimestamp() {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "-");
}

main().catch((error) => {
  process.stderr.write(String(error instanceof Error ? error.message : error) + "\n");
  process.exitCode = 1;
});
