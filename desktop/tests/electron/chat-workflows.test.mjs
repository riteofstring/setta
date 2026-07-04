#!/usr/bin/env node
import { mkdir, readFile, rm } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  assertCollapsedActivityGroupHeader,
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
import { runBackgroundTerminalWorkflow } from "./chat-workflow-background-terminal-cases.mjs";
import { runChronologicalTranscriptWorkflow } from "./chat-workflow-chronological-cases.mjs";
import { runCommandStartFailureWorkflow } from "./chat-workflow-command-start-failure-cases.mjs";
import { runComposerPromptHistoryWorkflow } from "./chat-workflow-composer-history-cases.mjs";
import { runCrossWorkspaceSidebarSummaryWorkflow } from "./chat-workflow-cross-workspace-sidebar-cases.mjs";
import { runChatDefaultsSettingsWorkflow } from "./chat-workflow-defaults-cases.mjs";
import { runLiveCodexWorkflow } from "./chat-live-workflow.mjs";
import { runPostCompletionActiveRunWorkflow } from "./chat-workflow-lifecycle-cases.mjs";
import { runImageAttachmentWorkflow } from "./chat-workflow-image-attachment-cases.mjs";
import { runImageAttachmentWorkflowLaunch } from "./chat-workflow-image-attachment-launch.mjs";
import { runProtocolApprovalWorkflows } from "./chat-workflow-approval-cases.mjs";
import {
  assertCodexProtocolNewChatPermissionContract,
  exerciseLinkedCodexPermissionPicker,
} from "./chat-workflow-codex-permission-cases.mjs";
import { runPermissionModeWorkflow } from "./chat-workflow-permission-cases.mjs";
import { runPostCommitStartupFailureWorkflowLaunch } from "./chat-workflow-post-commit-startup-cases.mjs";
import { runQueuedControlsWorkflow } from "./chat-workflow-queued-controls-cases.mjs";
import { runRestartRecoveryWorkflow } from "./chat-workflow-restart-recovery-cases.mjs";
import { runShutdownDrainWorkflow } from "./chat-workflow-shutdown-drain-cases.mjs";
import { runSlashCommandWorkflow } from "./chat-workflow-slash-cases.mjs";
import { runTranscriptSearchWorkflowLaunch } from "./chat-workflow-transcript-search-cases.mjs";
import { runTranscriptScrollWorkflowLaunch } from "./chat-workflow-transcript-scroll-cases.mjs";
import { runUnreadConversationWorkflow } from "./chat-workflow-unread-cases.mjs";
import { runBackendOrchestratorWorkflowLaunch } from "./backend-orchestrator-workflow.mjs";
import { runWorkflowRunnerPostStartFailureWorkflowLaunch } from "./workflow-runner-post-start-cases.mjs";
import { runWorkflowVersionCommitOrderingWorkflowLaunch } from "./workflow-version-commit-ordering-cases.mjs";
import { runWorkflowDefinitionFileAtomicityWorkflowLaunch } from "./workflow-definition-file-atomicity-cases.mjs";
import { runWorkflowNodeTrajectoryContractWorkflowLaunch } from "./workflow-node-trajectory-contract-cases.mjs";
import { runCodexApprovalPolicyRemovalWorkflowLaunch } from "./chat-workflow-approval-policy-cases.mjs";
import {
  assertProtocolNotificationActivity,
  installFakeCodexAppServer,
  runProtocolCurrentPlanGoalAndBackpressureWorkflows,
  runProtocolGoalCancellationWorkflow,
  runProtocolGoalForegroundUnifiedExecWorkflow,
  runProtocolLivenessReconciliationWorkflow,
  runProtocolProviderRestartLivenessWorkflow,
  runProtocolStreamErrorLivenessWorkflow,
} from "./codex-protocol-workflow.mjs";
import { runCodexAppServerLifecycleWorkflowLaunch } from "./codex-app-server-lifecycle-cases.mjs";
import { runProtocolGoalBackgroundTerminalWorkflow } from "./codex-protocol-background-terminal-cases.mjs";
import { runCodexAccountWorkflow } from "./codex-account-workflow.mjs";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(desktopRoot, "..");
const singleWorkflowArgs = new Map([
  ["--backend-orchestrator-only", "backendOrchestratorOnly"],
  ["--codex-protocol-only", "codexProtocolOnly"],
  ["--codex-approval-policy-removal-only", "codexApprovalPolicyRemovalOnly"],
  ["--codex-app-server-lifecycle-only", "codexAppServerLifecycleOnly"],
  ["--image-attachment-only", "imageAttachmentOnly"],
  ["--post-commit-startup-failure-only", "postCommitStartupFailureOnly"],
  ["--transcript-scroll-only", "transcriptScrollOnly"],
  ["--workflow-runner-post-start-failure-only", "workflowRunnerPostStartFailureOnly"],
  ["--workflow-version-commit-ordering-only", "workflowVersionCommitOrderingOnly"],
  ["--workflow-definition-file-atomicity-only", "workflowDefinitionFileAtomicityOnly"],
  ["--workflow-node-trajectory-contract-only", "workflowNodeTrajectoryContractOnly"],
]);
const options = parseArgs(process.argv.slice(2));
configureChatWorkflowHarness({ visible: options.visible });
const recordingRoot = chatWorkflowRecordingRoot(options);
const singleWorkflowRunners = [
  {
    option: "backendOrchestratorOnly",
    run: (results) => runBackendOrchestratorWorkflowLaunch(results, { recordingRoot, repoRoot }),
  },
  {
    option: "codexProtocolOnly",
    run: (results) => runCodexProtocolWorkflow(results),
  },
  {
    option: "codexApprovalPolicyRemovalOnly",
    run: (results) => runCodexApprovalPolicyRemovalWorkflowLaunch(results, { recordingRoot }),
  },
  {
    option: "codexAppServerLifecycleOnly",
    run: (results) => runCodexAppServerLifecycleWorkflowLaunch(results, { recordingRoot }),
  },
  {
    option: "imageAttachmentOnly",
    run: (results) => runImageAttachmentWorkflowLaunch(results, { recordingRoot }),
  },
  {
    option: "postCommitStartupFailureOnly",
    run: (results) => runPostCommitStartupFailureWorkflowLaunch(results, { recordingRoot }),
  },
  {
    option: "transcriptScrollOnly",
    run: (results) => runTranscriptScrollWorkflowLaunch(results, { recordingRoot }),
  },
  {
    option: "workflowRunnerPostStartFailureOnly",
    run: (results) => runWorkflowRunnerPostStartFailureWorkflowLaunch(results, { recordingRoot }),
  },
  {
    option: "workflowVersionCommitOrderingOnly",
    run: (results) => runWorkflowVersionCommitOrderingWorkflowLaunch(results, { recordingRoot }),
  },
  {
    option: "workflowDefinitionFileAtomicityOnly",
    run: (results) => runWorkflowDefinitionFileAtomicityWorkflowLaunch(results, { recordingRoot }),
  },
  {
    option: "workflowNodeTrajectoryContractOnly",
    run: (results) => runWorkflowNodeTrajectoryContractWorkflowLaunch(results, { recordingRoot }),
  },
];
function parseArgs(args) {
  const parsed = {
    backendOrchestratorOnly: false,
    codexAppServerLifecycleOnly: false,
    codexApprovalPolicyRemovalOnly: false,
    codexProtocolOnly: false,
    deterministic: true,
    imageAttachmentOnly: false,
    keepArtifacts: false,
    live: false,
    postCommitStartupFailureOnly: false,
    transcriptScrollOnly: false,
    visible: process.env.SETTA_E2E_VISIBLE === "1",
    workflowRunnerPostStartFailureOnly: false,
    workflowDefinitionFileAtomicityOnly: false,
    workflowNodeTrajectoryContractOnly: false,
    workflowVersionCommitOrderingOnly: false,
  };
  for (const arg of args) {
    const singleWorkflow = singleWorkflowArgs.get(arg);
    if (singleWorkflow) {
      selectSingleWorkflow(parsed, singleWorkflow);
      continue;
    }
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
function selectSingleWorkflow(parsed, selected) {
  parsed.backendOrchestratorOnly = selected === "backendOrchestratorOnly";
  parsed.codexAppServerLifecycleOnly = selected === "codexAppServerLifecycleOnly";
  parsed.codexApprovalPolicyRemovalOnly = selected === "codexApprovalPolicyRemovalOnly";
  parsed.codexProtocolOnly = selected === "codexProtocolOnly";
  parsed.imageAttachmentOnly = selected === "imageAttachmentOnly";
  parsed.postCommitStartupFailureOnly = selected === "postCommitStartupFailureOnly";
  parsed.transcriptScrollOnly = selected === "transcriptScrollOnly";
  parsed.workflowRunnerPostStartFailureOnly = selected === "workflowRunnerPostStartFailureOnly";
  parsed.workflowVersionCommitOrderingOnly = selected === "workflowVersionCommitOrderingOnly";
  parsed.workflowDefinitionFileAtomicityOnly = selected === "workflowDefinitionFileAtomicityOnly";
  parsed.workflowNodeTrajectoryContractOnly = selected === "workflowNodeTrajectoryContractOnly";
  parsed.deterministic = false;
  parsed.live = false;
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
  if (await runSelectedSingleWorkflow(results)) {
    printWorkflowResults(results);
    return;
  }
  if (options.deterministic) {
    await runDeterministicWorkflowLaunch(results);
    await runPostCommitStartupFailureWorkflowLaunch(results, { recordingRoot });
    await runWorkflowRunnerPostStartFailureWorkflowLaunch(results, { recordingRoot });
    await runWorkflowVersionCommitOrderingWorkflowLaunch(results, { recordingRoot });
    await runWorkflowDefinitionFileAtomicityWorkflowLaunch(results, { recordingRoot });
    await runWorkflowNodeTrajectoryContractWorkflowLaunch(results, { recordingRoot });
    await runCodexApprovalPolicyRemovalWorkflowLaunch(results, { recordingRoot });
    await runCodexAppServerLifecycleWorkflowLaunch(results, { recordingRoot });
    await runTranscriptSearchWorkflowLaunch(results, {
      recordingRoot,
      runHappyPathWorkflow,
      runWorkflowStep,
    });
    await runTranscriptScrollWorkflowLaunch(results, { recordingRoot });
    await runSidebarNavigationWorkflow(results);
    await runCrossWorkspaceSidebarSummaryWorkflow({
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
    });
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
    await runRestartRecoveryWorkflow(results, { recordingRoot, repoRoot });
    await runShutdownDrainWorkflow(results, { recordingRoot });
    await runBackendOrchestratorWorkflowLaunch(results, { recordingRoot, repoRoot });
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
      waitForState,
      waitForTexts,
    });
  }

  printWorkflowResults(results);
}
async function runSelectedSingleWorkflow(results) {
  const selected = singleWorkflowRunners.find(({ option }) => options[option]);
  if (!selected) {
    return false;
  }
  await selected.run(results);
  return true;
}
function printWorkflowResults(results) {
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
    await runWorkflowStep(results, recordingDir, "image-attachments", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runImageAttachmentWorkflow({
        backend,
        clickButtonByAria,
        client: context.client,
        conversationId,
        setInputValue,
        waitForRunWithPrompt,
        waitForState,
        waitForTexts,
        workspaceId,
      });
    });
    await runWorkflowStep(
      results,
      recordingDir,
      "composer-prompt-history",
      context.client,
      async () => {
        await runComposerPromptHistoryWorkflow({
          backend,
          clickButtonByAria,
          clickButtonContainingText,
          client: context.client,
          createChat,
          setInputValue,
          submitComposer,
          waitForRunWithPrompt,
          waitForState,
          waitForTexts,
          workspaceId,
        });
      },
    );
    await runWorkflowStep(
      results,
      recordingDir,
      "chat-activity-projection",
      context.client,
      async () => {
        const conversationId = await createChat(context.client, backend, workspaceId);
        await runChatActivityProjectionWorkflow(
          context.client,
          backend,
          workspaceId,
          conversationId,
        );
      },
    );
    await runWorkflowStep(
      results,
      recordingDir,
      "command-start-failure",
      context.client,
      async () => {
        const conversationId = await createChat(context.client, backend, workspaceId);
        await runCommandStartFailureWorkflow({
          backend,
          client: context.client,
          conversationId,
          workspaceId,
        });
      },
    );
    await runWorkflowStep(
      results,
      recordingDir,
      "chronological-transcript",
      context.client,
      async () => {
        const conversationId = await createChat(context.client, backend, workspaceId);
        await runChronologicalTranscriptWorkflow({
          appendWorkflowState,
          assertActivityRows,
          assertRunActivityProjection,
          assertTextAbsent,
          backend,
          client: context.client,
          conversationId,
          recordingDir,
          submitComposer,
          waitForRunWithPrompt,
          waitForTexts,
          workspaceId,
        });
      },
    );
    await runWorkflowStep(
      results,
      recordingDir,
      "background-terminal",
      context.client,
      async () => {
        const conversationId = await createChat(context.client, backend, workspaceId);
        await runBackgroundTerminalWorkflow({
          appendWorkflowState,
          assertActivityRows,
          assertRunActivityProjection,
          backend,
          client: context.client,
          conversationId,
          recordingDir,
          submitComposer,
          waitForState,
          waitForRunWithPrompt,
          waitForTexts,
          workspaceId,
        });
      },
    );
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
        setInputValue,
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
    await runWorkflowStep(results, recordingDir, "permission-modes", context.client, async () => {
      const conversationId = await createChat(context.client, backend, workspaceId);
      await runPermissionModeWorkflow(context.client, backend, workspaceId, conversationId);
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
    await runWorkflowStep(
      results,
      recordingDir,
      "chat-defaults-settings",
      context.client,
      async () => {
        await runChatDefaultsSettingsWorkflow(context.client, backend, workspaceId);
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
      "/chat/composer/history",
      "/chat/runs/active",
      "/chat/runs/activity",
      "/chat/runs/list",
      "/chat/runs/cancel",
      "/chat/approvals/submit",
      "/chat/commands/list",
      "/chat/commands/execute",
      "/chat/codex/defaults",
      "/chat/codex/model/picker",
      "/chat/codex/permission/picker",
      "/chat/codex/permission/set",
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
      "chat:list-composer-prompt-history",
      "chat:cancel-run",
      "chat:submit-approval",
      "chat:list-commands",
      "chat:execute-command",
      "chat:read-codex-defaults",
      "chat:update-codex-defaults",
      "chat:open-codex-model-picker",
      "chat:open-codex-permission-picker",
      "chat:set-codex-permission-preset",
      "chat:set-codex-reasoning-effort",
      "codex-account:logout",
      "codex-account:read",
      "codex-account:start-login",
    ],
  });
}

async function runChatActivityProjectionWorkflow(client, backend, workspaceId, conversationId) {
  await submitComposer(client, "projection silent greeting workflow", "Send message");
  const greetingRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "projection silent greeting workflow",
    "completed",
  );
  await waitForTexts(client, [
    "projection silent greeting workflow",
    "Scripted response: projection silent greeting workflow",
  ]);
  await assertRunActivityProjection(backend, workspaceId, greetingRun.id, {
    rawTypes: [],
    rows: [],
  });
  await assertActivityRows(client, []);

  await submitComposer(client, "chat activity projection workflow", "Send message");
  await waitForTexts(client, ["Projection activity starting.", "Streaming reasoning placeholder"]);
  await submitComposer(client, "finish projection activity", "Send steering message");
  const run = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "chat activity projection workflow",
    "completed",
  );
  await waitForTexts(client, [
    "Projection assistant final.",
    "Projection command",
    "Projection reasoning",
  ]);
  // The meaningfully-titled transient reasoning persists as a thinking-mode reasoning block: the
  // chronological model keeps reasoning as a real timeline status block rather than a placeholder
  // that vanishes after the first assistant text.
  await assertReasoningBlockPresent(client, "Streaming reasoning placeholder");
  await assertTextAbsent(client, "private projection reasoning");
  await assertTextAbsent(client, "Projection duplicate provider agent message");

  const projection = await assertRunActivityProjection(backend, workspaceId, run.id, {
    rawTypes: ["agent_message", "reasoning"],
    rows: projectionExpectedRows(),
  });
  const commandRow = requireProjectedRow(projection.rows, "Projection command");
  await openProjectedActivityRow(client, commandRow.sourceRunItemId);
  await waitForText(client, "printf projection-output");
  await assertActivityRows(client, projection.rows);
  await expandReasoningSummaryBlock(client, "Projection reasoning");
  await waitForText(client, "Public reasoning summary visible.");
  await assertAssistantTextOccurrence(client, "Projection assistant final.", 1);
}

// expandReasoningSummaryBlock opens the collapsed summary-mode reasoning block
// whose collapsed headline matches the given text, so the full public summary
// becomes visible through its own disclosure rather than an activity row.
async function assertReasoningBlockPresent(client, headline) {
  const present = await client.evaluate(`(() => {
    const headline = ${JSON.stringify(headline)};
    return Array.from(document.querySelectorAll('[data-block-kind="reasoning"]')).some(
      (block) => block.textContent?.includes(headline),
    );
  })()`);
  if (!present) {
    throw new Error(`expected a reasoning block containing ${JSON.stringify(headline)}`);
  }
}

async function expandReasoningSummaryBlock(client, headline) {
  const opened = await client.evaluate(`(() => {
    const headline = ${JSON.stringify(headline)};
    const blocks = Array.from(
      document.querySelectorAll('[data-block-kind="reasoning"][data-reasoning-mode="summary"]'),
    );
    const block = blocks.find((candidate) => candidate.textContent?.includes(headline));
    if (!(block instanceof HTMLDetailsElement)) {
      return { ok: false, reason: "missing-reasoning-summary" };
    }
    if (!block.open) {
      block.querySelector("summary")?.click();
    }
    return { ok: block.open, reason: block.open ? "opened" : "not-opened" };
  })()`);
  if (!opened.ok) {
    throw new Error(
      `reasoning summary block ${headline} was not opened: ${JSON.stringify(opened)}`,
    );
  }
}

async function assertRunActivityProjection(backend, workspaceId, runId, expected) {
  const page = await backend.post("/chat/runs/activity", { limit: 100, runId, workspaceId });
  const rows = page.activity ?? [];
  assertProjectedActivityRowCount(rows, expected.rows, page);
  assertProjectedActivityRows(rows, expected.rows);
  assertNoPrivateActivityProjectionLeaks(rows);
  assertRawActivityTypes(page.items, expected.rawTypes);
  return { page, rows };
}

function assertProjectedActivityRowCount(rows, expectedRows, page) {
  if (rows.length !== expectedRows.length) {
    throw new Error(
      `projected activity row count = ${rows.length}, want ${expectedRows.length}: ${JSON.stringify(page)}`,
    );
  }
}

function assertProjectedActivityRows(rows, expectedRows) {
  for (const expectedRow of expectedRows) {
    const row = rows.find((candidate) => projectedActivityRowMatches(candidate, expectedRow));
    if (!row) {
      throw new Error(
        `projected activity row missing ${JSON.stringify(expectedRow)}: ${JSON.stringify(rows)}`,
      );
    }
    if (!row.sourceRunItemId) {
      throw new Error(`activity row missing source run item id: ${JSON.stringify(row)}`);
    }
  }
}

function projectedActivityRowMatches(row, expectedRow) {
  if (row.type !== expectedRow.type || row.title !== expectedRow.title) {
    return false;
  }
  return expectedRow.summary === undefined || row.details.summary === expectedRow.summary;
}

function assertNoPrivateActivityProjectionLeaks(rows) {
  if (rows.some((row) => row.type === "agent_message")) {
    throw new Error(`agent message leaked into activity projection: ${JSON.stringify(rows)}`);
  }
  if (
    rows.some(
      (row) =>
        row.details.summary.includes("private projection reasoning") ||
        row.details.progress.includes("private projection reasoning") ||
        row.title.includes("private projection reasoning"),
    )
  ) {
    throw new Error(`hidden reasoning leaked into activity projection: ${JSON.stringify(rows)}`);
  }
}

function assertRawActivityTypes(items, rawTypes) {
  for (const rawType of rawTypes) {
    if (!items.some((item) => item.type === rawType)) {
      throw new Error(`raw activity page missing ${rawType}: ${JSON.stringify(items)}`);
    }
  }
}

async function assertActivityRows(client, expectedRows) {
  const rendered = await client.evaluate(`(() => ({
    rows: Array.from(document.querySelectorAll('[data-testid="run-activity-row"]')).map((row) => ({
      sourceRunItemId: row.getAttribute("data-run-item-id") ?? "",
      text: row.innerText,
    })),
  }))()`);
  if (rendered.rows.length !== expectedRows.length) {
    throw new Error(
      `rendered activity row count = ${rendered.rows.length}, want ${expectedRows.length}: ${JSON.stringify(rendered.rows)}`,
    );
  }
  for (const expected of expectedRows) {
    const row = rendered.rows.find(
      (candidate) => candidate.sourceRunItemId === expected.sourceRunItemId,
    );
    if (!row) {
      throw new Error(
        `rendered activity missing source item ${expected.sourceRunItemId}: ${JSON.stringify(rendered.rows)}`,
      );
    }
    const displayText = expected.title;
    if (!row.text.includes(displayText)) {
      throw new Error(
        `rendered activity row missing display text ${displayText}: ${JSON.stringify(row)}`,
      );
    }
  }
}

async function assertAssistantTextOccurrence(client, text, expectedCount) {
  const transcript = await client.driver("chatTranscriptRows");
  const assistantRows = transcript.rows.filter((row) => row.role === "assistant");
  const count = assistantRows.reduce((total, row) => total + occurrences(row.text, text), 0);
  if (count !== expectedCount) {
    throw new Error(
      `assistant text ${text} rendered ${count} times, want ${expectedCount}: ${JSON.stringify(assistantRows)}`,
    );
  }
}

function projectionExpectedRows() {
  // Reasoning is its own transcript block kind, not an activity_item, so the
  // activity projection only contains true activity rows. The reasoning summary
  // is asserted separately through the reasoning block.
  return [
    {
      title: "Projection command",
      type: "command_execution",
    },
  ];
}

function requireProjectedRow(rows, title) {
  const row = rows.find((candidate) => candidate.title === title);
  if (!row) {
    throw new Error(`projected row ${title} missing: ${JSON.stringify(rows)}`);
  }
  return row;
}

async function openProjectedActivityRow(client, sourceRunItemId) {
  const startedAt = Date.now();
  let opened = null;
  while (Date.now() - startedAt < 2_000) {
    opened = await client.driver("openProjectedActivityRow", { sourceRunItemId });
    if (opened.ok) {
      return;
    }
    await delay(50);
  }
  throw new Error(`activity row ${sourceRunItemId} was not opened: ${JSON.stringify(opened)}`);
}

async function waitForRunItemOutputIpc(recordingDir, sourceRunItemId, afterOrdinal) {
  const startedAt = Date.now();
  let outputIpc = [];
  while (Date.now() - startedAt < 5_000) {
    const ipc = await readJsonLines(join(recordingDir, "ipc.jsonl"));
    outputIpc = ipc.filter((entry) => entry.channel === "chat:run-item-output");
    const match = outputIpc.find(
      (entry) =>
        entry.type === "ipc_start" &&
        Array.isArray(entry.args) &&
        entry.args[2] === sourceRunItemId &&
        entry.args[3] === afterOrdinal,
    );
    if (match) {
      return;
    }
    await delay(100);
  }
  throw new Error(
    `recording missing chat:run-item-output for source run item ${sourceRunItemId} after ordinal ${afterOrdinal}: ${JSON.stringify(outputIpc)}`,
  );
}

async function readJsonLines(path) {
  const content = await readFile(path, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

function occurrences(text, needle) {
  if (needle === "") {
    return 0;
  }
  return text.split(needle).length - 1;
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
    "Workflow stream started.",
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
    await assertCodexProtocolNewChatPermissionContract(backend, workspaceId, conversationId);
    await waitForModelPickerSummary(waitForState, context.client, "GPT Test", "Extra high");
    await submitComposer(context.client, "protocol notification workflow", "Send message");
    const run = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      "protocol notification workflow",
      "completed",
    );
    await waitForTexts(context.client, ["coverage complete", "Workspace context"]);
    await assertCollapsedActivityGroupHeader(context.client, {
      absent: "+8",
      count: "12",
      preview: "Workspace context",
    });
    await assertTextAbsent(context.client, "Reasoning text");
    await assertTextAbsent(context.client, "private reasoning");
    await waitForModelPickerSummary(waitForState, context.client, "GPT Test", "Extra high");
    await assertProtocolNotificationActivity(
      context.client,
      backend,
      workspaceId,
      conversationId,
      run.id,
    );
    await assertNoCriticalDiagnostics(backend, workspaceId, conversationId);
    await exerciseLinkedCodexPermissionPicker(context.client, backend, workspaceId, conversationId);

    await runProtocolCurrentPlanGoalAndBackpressureWorkflows(context.client, backend, workspaceId);
    await runProtocolGoalForegroundUnifiedExecWorkflow(context.client, backend, workspaceId);
    await runProtocolGoalBackgroundTerminalWorkflow(context.client, backend, workspaceId, fixture);
    await runProtocolGoalCancellationWorkflow(context.client, backend, workspaceId);
    await runProtocolLivenessReconciliationWorkflow(context.client, backend, workspaceId);
    await runProtocolProviderRestartLivenessWorkflow(context.client, backend, workspaceId);
    await runProtocolStreamErrorLivenessWorkflow(context.client, backend, workspaceId);
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
      "/chat/conversations/list",
      "/chat/messages/send",
      "/chat/messages/page",
      "/chat/codex/permission/picker",
      "/chat/commands/execute",
      "/chat/runs/cancel",
      "/chat/runs/activity",
      "/chat/runs/active",
      "/chat/runs/reconcile",
      "/chat/runs/list",
      "/chat/diagnostics/list",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "chat:cancel-run",
      "chat:execute-command",
      "chat:open-codex-permission-picker",
      "chat:reconcile-runs",
      "chat:send-message",
    ],
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
    await submitComposer(first.client, "chat activity projection reload workflow", "Send message");
    const projectionRun = await waitForRunWithPrompt(
      backend,
      workspaceId,
      conversationId,
      "chat activity projection reload workflow",
      "completed",
    );
    await waitForTexts(first.client, ["Projection assistant final.", "Projection command"]);
    await assertRunActivityProjection(backend, workspaceId, projectionRun.id, {
      rawTypes: ["agent_message", "reasoning"],
      rows: projectionExpectedRows(),
    });
    await stopLaunchedContext(first);

    second = await launchContext(fixture, secondRecording);
    const secondBackend = await backendProbe(secondRecording);
    await waitForTexts(
      second.client,
      [
        "workspace-root",
        "workflow hold for queue and steering",
        "Queued response for queued follow-up one from active run.",
        "Queued response for queued follow-up two from active run.",
        "Queued response for queued follow-up three from active run.",
        "Projection command",
        "Projection reasoning",
      ],
      30_000,
    );
    await assertTextAbsent(second.client, "Projection duplicate provider agent message");
    await assertTextAbsent(second.client, "private projection reasoning");
    await assertTextAbsent(second.client, "projection output chunk 201");
    const restoredProjection = await assertRunActivityProjection(
      secondBackend,
      workspaceId,
      projectionRun.id,
      {
        rawTypes: ["agent_message", "reasoning"],
        rows: projectionExpectedRows(),
      },
    );
    await assertTranscriptSequence(second.client, [
      "workflow hold for queue and steering",
      "Workflow stream started.",
      "steer active run",
      "Active workflow complete.",
      "queued follow-up one from active run",
      "Queued response for queued follow-up one from active run.",
      "queued follow-up two from active run",
      "Queued response for queued follow-up two from active run.",
      "queued follow-up three from active run",
      "Queued response for queued follow-up three from active run.",
      "chat activity projection reload workflow",
      "Projection assistant final.",
    ]);
    const commandRow = requireProjectedRow(restoredProjection.rows, "Projection command");
    await openProjectedActivityRow(second.client, commandRow.sourceRunItemId);
    await waitForText(second.client, "printf projection-output");
    await waitForText(second.client, "Load more");
    await clickButtonByText(second.client, "Load more");
    await waitForRunItemOutputIpc(secondRecording, commandRow.sourceRunItemId, 200);
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
      "/chat/runs/activity",
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
    backendPaths: [
      "/workspace-session",
      "/chat/conversations/list",
      "/chat/messages/page",
      "/chat/runs/activity",
      "/chat/runs/item-output",
    ],
    ipcChannels: [
      "workspace:session",
      "chat:list-conversations",
      "chat:message-page",
      "chat:run-item-output",
    ],
  });
  results.push("restart");
  process.stdout.write("Electron chat workflow passed: restart\n");
}

main().catch((error) => {
  process.stderr.write(String(error instanceof Error ? error.message : error) + "\n");
  process.exitCode = 1;
});
