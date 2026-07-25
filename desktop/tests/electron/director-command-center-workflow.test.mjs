#!/usr/bin/env node
/* global console */

import { basename, delimiter, join } from "node:path";
import process from "node:process";

import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import {
  assertArtifactsExcludeMarkers,
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "director-command-center";
const workflowTimeoutMs = 60_000;
const secretApprovalAnswer = "director-secret-scope";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/director-command-center-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
const firstLaunchDir = join(artifactDir, "first-launch");
const secondLaunchDir = join(artifactDir, "second-launch");
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const launchEnvironment = {
  PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
  SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
};
let context = null;

try {
  context = await launchDirectorElectron(firstLaunchDir);
  let backend = await backendProbe(firstLaunchDir);
  const initial = await subscribeFromRenderer(context.client);
  assertEqual(initial.workstreams.length, 0, "initial Director workstream count");

  await submitDirectorInComposer(context.client, "Director create folderless.");
  const folderless = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.workstreams.length === 1 &&
      snapshot.workstreams[0]?.workstream.resourceScope.kind === "folderless" &&
      snapshot.workstreams[0]?.workstream.status === "awaiting_resource" &&
      snapshot.unresolvedResourceRequests.length === 1,
  );
  const rootWorkstreamId = requiredString(
    folderless.workstreams[0]?.workstream.id,
    "folderless workstream",
  );
  const resourceRequestId = requiredString(
    folderless.unresolvedResourceRequests[0]?.id,
    "folderless resource request",
  );
  assertEqual(folderless.aggregates.awaitingResourceCount, 1, "folderless resource aggregate");

  const workspaceId = await chooseFolderForResourceRequest(context.client, resourceRequestId);
  await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.unresolvedResourceRequests.length === 0 &&
      snapshot.workstreams.some(
        (entry) =>
          entry.workstream.id === rootWorkstreamId &&
          entry.workstream.resourceScope.kind === "folder" &&
          entry.workstream.resourceScope.folder?.workspaceId === workspaceId &&
          entry.workstream.resourceBindings.length === 1,
      ),
  );
  const workspaceSettings = await verifyWorkspaceSettings(context.client, workspaceId);
  await selectWorkstream(context.client, rootWorkstreamId);

  await submitDirector(context.client, "Director send hold.");
  await waitForWorkstream(context.client, rootWorkstreamId, (workstream) =>
    Boolean(workstream.activeRunId),
  );
  await assertRunningSummaryIsCurrent(context.client);
  await submitDirector(context.client, "Director queue next.");
  await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.queuedRunCount === 1 && workstream.activeRunId !== null,
  );
  await submitDirector(context.client, "Director steer now.");
  const delivered = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationID(rootWorkstreamId),
    (snapshot) =>
      snapshot.queue.length === 0 &&
      snapshot.turns.turns.length === 2 &&
      snapshot.turns.turns.every((turn) => turn.status === "completed"),
  );
  assertEqual(
    delivered.turns.turns[1]?.authoredInput.text,
    "director queued",
    "promoted queued Director work",
  );
  await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.activeRunId === null && workstream.queuedRunCount === 0,
  );

  await submitDirector(context.client, "Director send cancel hold.");
  const cancellable = await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.activeRunId !== null,
  );
  const cancelledRunId = requiredString(cancellable.activeRunId, "cancellable Director run");
  await dispatchDirector(context.client, {
    cancelRun: { runId: cancelledRunId, workstreamId: rootWorkstreamId },
    kind: "cancel_run",
  });
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationID(rootWorkstreamId),
    (snapshot) =>
      snapshot.turns.turns.some(
        (turn) => turn.id === cancelledRunId && turn.status === "cancelled",
      ),
  );
  await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.activeRunId === null,
  );

  await submitDirector(context.client, "Director request approval.");
  const approvalSnapshot = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.unresolvedApprovals.length === 1 &&
      snapshot.unresolvedApprovals[0]?.workstreamId === rootWorkstreamId,
  );
  const approvalId = requiredString(
    approvalSnapshot.unresolvedApprovals[0]?.id,
    "Director approval",
  );
  assertEqual(
    approvalSnapshot.unresolvedApprovals[0]?.questions[0]?.id,
    "scope",
    "Director approval question",
  );
  await answerDirectorApprovalInRail(context.client, approvalId, "scope", secretApprovalAnswer);
  const approved = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationID(rootWorkstreamId),
    (snapshot) =>
      snapshot.trajectory.events.some(
        (event) =>
          event.kind === "approval_resolved" &&
          event.approvalResolved?.resolution.approvalId === approvalId,
      ) && snapshot.turns.turns.at(-1)?.status === "completed",
  );
  const durableApproval = approved.trajectory.events.find(
    (event) =>
      event.kind === "approval_resolved" &&
      event.approvalResolved?.resolution.approvalId === approvalId,
  )?.approvalResolved?.resolution;
  assertEqual(durableApproval?.secretsRedacted, true, "secret approval redaction marker");
  assertEqual(durableApproval?.answers.length, 0, "durable secret approval answers");
  assertExcludes(JSON.stringify(approved), secretApprovalAnswer, "conversation trajectory");
  await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.unresolvedApprovals.length === 0 &&
      snapshot.workstreams.some(
        (entry) =>
          entry.workstream.id === rootWorkstreamId &&
          entry.workstream.activeRunId === null &&
          entry.workstream.unresolvedApprovalCount === 0,
      ),
  );

  await submitDirector(context.client, "Director fail.");
  const failed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationID(rootWorkstreamId),
    (snapshot) => snapshot.turns.turns.at(-1)?.status === "failed",
  );
  const firstFailedRunId = requiredString(failed.turns.turns.at(-1)?.id, "failed Director run");
  await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.status === "failed" && workstream.activeRunId === null,
  );
  await submitDirector(context.client, "Director recover.");
  const recovered = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationID(rootWorkstreamId),
    (snapshot) =>
      snapshot.turns.turns.filter((turn) => turn.authoredInput.text === "director fail").length ===
        2 && snapshot.turns.turns.at(-1)?.status === "completed",
  );
  assertEqual(
    recovered.turns.turns.at(-1)?.authoredInput.text,
    failed.turns.turns.at(-1)?.authoredInput.text,
    "recovered authored input",
  );
  if (recovered.turns.turns.at(-1)?.id === firstFailedRunId) {
    throw new Error("Director recovery reused the failed run id");
  }
  await waitForWorkstream(
    context.client,
    rootWorkstreamId,
    (workstream) => workstream.status === "completed" && workstream.activeRunId === null,
  );

  const repaired = await submitDirector(context.client, "Director repair malformed.");
  assertEqual(repaired.submit?.decision, "answer_directly", "repaired decision");
  assertEqual(
    repaired.submit?.publicText,
    "The malformed decision was repaired.",
    "repaired public answer",
  );
  assertExcludes(JSON.stringify(repaired), "not_a_director_decision", "Director receipt");

  const childReceipt = await submitDirector(context.client, "Director create child.");
  assertEqual(childReceipt.submit?.decision, "create_workstream", "child decision");
  const childWorkstreamId = requiredString(
    childReceipt.submit?.workstreamId,
    "child receipt workstream",
  );
  const childConversationId = conversationID(childWorkstreamId);
  await waitForDirectorSnapshot(context.client, (snapshot) =>
    snapshot.workstreams.some(
      (entry) =>
        entry.workstream.id === childWorkstreamId &&
        entry.workstream.parentId === rootWorkstreamId &&
        entry.workstream.status === "completed",
    ),
  );
  const childConversation = await waitForConversationSnapshot(
    backend,
    workspaceId,
    childConversationId,
    (snapshot) =>
      snapshot.turns.turns.length === 1 && snapshot.turns.turns[0]?.status === "completed",
  );
  assertEqual(
    childConversation.turns.turns[0]?.authoredInput.text,
    "director child work",
    "child first input",
  );
  const branch = await readBranch(backend, workspaceId, childConversationId);
  assertEqual(branch.kind, "child", "Director child branch kind");
  assertEqual(branch.decisionSource, "director", "Director child decision source");
  assertEqual(branch.forkedAtTurnId, "", "Director child fork point");
  assertEqual(Object.keys(branch.providerMetadata).length, 0, "Director child provider metadata");

  await selectWorkstream(context.client, childWorkstreamId);
  await submitDirector(context.client, "Director artifact.");
  const beforeRestart = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.selectedWorkstreamId === childWorkstreamId &&
      snapshot.artifacts.some(
        (artifact) =>
          artifact.workstreamId === childWorkstreamId && artifact.status === "available",
      ),
  );
  const openedArtifact = beforeRestart.artifacts.find(
    (artifact) => artifact.workstreamId === childWorkstreamId && artifact.status === "available",
  );
  const openedArtifactId = requiredString(openedArtifact?.id, "Director artifact");
  const artifactDetail = await openDirectorArtifactDetail(context.client, openedArtifactId);
  assertEqual(artifactDetail.status, "loaded", "Director artifact detail status");
  if (!artifactDetail.text.includes(openedArtifact.title)) {
    throw new Error(`Director artifact detail omitted title: ${JSON.stringify(artifactDetail)}`);
  }
  await closeDirectorArtifactDetail(context.client);
  const history = await readDirectorHistory(context.client);
  assertHistoryContainsOnlyUserAndTerminalTurns(history);
  await verifyCompactRailFocusRestoration(context.client);
  const rendererEvents = await readRendererEvents(context.client);
  assertDirectorEventSequence(initial.eventCursor, rendererEvents);
  assertEventKinds(rendererEvents, [
    "director.approval.updated",
    "director.artifact.updated",
    "director.graph.updated",
    "director.resource_request.updated",
    "director.selection.changed",
    "director.text.delta",
    "director.workstream.updated",
  ]);
  assertExcludes(JSON.stringify(rendererEvents), secretApprovalAnswer, "Director pushed events");
  assertExcludes(
    JSON.stringify({ events: rendererEvents, snapshot: beforeRestart }),
    "not_a_director_decision",
    "Director renderer state",
  );
  const durableBeforeRestart = comparableDirectorSnapshot(beforeRestart);
  await writeJson(join(artifactDir, "before-restart.json"), durableBeforeRestart);

  await stopElectronCdpContext(context);
  context = null;
  await assertArtifactsExcludeMarkers(
    firstLaunchDir,
    [secretApprovalAnswer, "not_a_director_decision"],
    "Director private routing state",
  );

  context = await launchDirectorElectron(secondLaunchDir);
  backend = await backendProbe(secondLaunchDir);
  const restoredWorkspaceId = await openWorkspace(context.client);
  assertEqual(restoredWorkspaceId, workspaceId, "restored Director workspace");
  const restored = await readDirectorSnapshot(context.client);
  const durableRestored = comparableDirectorSnapshot(restored);
  assertDeepEqual(durableRestored, durableBeforeRestart, "restored Director snapshot");
  await readBranch(backend, workspaceId, childConversationId);

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    childWorkstreamId,
    eventCount: rendererEvents.length,
    rootWorkstreamId,
    status: "passed",
    workspaceSettings,
    workspaceId,
  });
  console.log(`Electron Director command-center workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-director-snapshot.json"), {
      events: await readRendererEvents(context.client).catch(() => []),
      snapshot: await readDirectorSnapshot(context.client).catch(() => null),
    }).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
}

async function launchDirectorElectron(launchArtifactDir) {
  const launched = await launchElectronCdpContext({
    artifactDir: launchArtifactDir,
    extraEnv: launchEnvironment,
    fixture,
    visible: options.visible,
  });
  await waitForSelector(launched.client, '[data-testid="director-command-center-shell"]');
  await launched.client.installDriver();
  return launched;
}

async function openWorkspace(client) {
  const current = await selectedWorkspaceId(client);
  if (!validWorkspaceId(current)) {
    const opened = await client.evaluate(`(async () => {
      const response = await window.setta?.workspace?.openLocalFolder?.();
      return response?.session?.selectedWorkspaceId ?? "";
    })()`);
    if (!validWorkspaceId(opened)) {
      throw new Error("fixture workspace did not open through preload IPC");
    }
  }
  return waitForState(client, selectedWorkspaceIdExpression(), validWorkspaceId, workflowTimeoutMs);
}

function selectedWorkspaceId(client) {
  return client.evaluate(selectedWorkspaceIdExpression());
}

function selectedWorkspaceIdExpression() {
  return `(async () => {
    const session = await window.setta?.workspace?.session?.();
    return session?.selectedWorkspaceId ?? "";
  })()`;
}

function validWorkspaceId(workspaceId) {
  return workspaceId !== "" && workspaceId !== "empty";
}

async function assertRunningSummaryIsCurrent(client) {
  const state = await waitForState(
    client,
    `(() => {
      const summary = document.querySelector(
        "#director-now-rail > .director-rail-section:first-child .director-rail-summary"
      );
      const status = document.querySelector(".director-selected-status");
      return {
        status: status?.textContent?.trim() ?? "",
        summary: summary?.textContent?.trim() ?? ""
      };
    })()`,
    (candidate) =>
      candidate.status === "Running" && !candidate.summary.includes("Waiting for a project folder"),
    workflowTimeoutMs,
  );
  assertExcludes(state.summary, "Waiting for a project folder", "running Now summary");
}

async function subscribeFromRenderer(client) {
  const snapshot = await readDirectorSnapshot(client);
  await client.evaluate(`(async () => {
    globalThis.__settaDirectorAuditEvents = [];
    globalThis.__settaDisposeDirectorAuditEvents?.();
    globalThis.__settaDisposeDirectorAuditEvents = window.setta.director.onEvent((event) => {
      globalThis.__settaDirectorAuditEvents.push(event);
    });
    await window.setta.director.subscribe({ cursor: ${JSON.stringify(snapshot.eventCursor)} });
  })()`);
  return snapshot;
}

function readDirectorSnapshot(client) {
  return client.evaluate("window.setta.director.readSnapshot()");
}

function readRendererEvents(client) {
  return client.evaluate("globalThis.__settaDirectorAuditEvents ?? []");
}

function waitForDirectorSnapshot(client, ready) {
  return waitForBackendState(() => readDirectorSnapshot(client), ready, workflowTimeoutMs);
}

async function waitForWorkstream(client, workstreamId, ready) {
  const snapshot = await waitForDirectorSnapshot(client, (candidate) => {
    const workstream = candidate.workstreams.find(
      (entry) => entry.workstream.id === workstreamId,
    )?.workstream;
    return Boolean(workstream && ready(workstream));
  });
  return snapshot.workstreams.find((entry) => entry.workstream.id === workstreamId).workstream;
}

function dispatchDirector(client, intent) {
  return client.evaluate(`window.setta.director.dispatch(${JSON.stringify(intent)})`);
}

async function submitDirectorInComposer(client, text) {
  await waitForSelector(client, "#director-composer-input");
  const updated = await client.evaluate(`(() => {
    const input = document.querySelector("#director-composer-input");
    if (!(input instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: "missing-composer" };
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    );
    descriptor?.set?.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return { ok: true };
  })()`);
  if (!updated.ok) {
    throw new Error(`Director composer did not update: ${JSON.stringify(updated)}`);
  }
  const submitted = await client.evaluate(`(() => {
    const input = document.querySelector("#director-composer-input");
    if (!(input instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: "missing-composer" };
    }
    input.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter"
    }));
    return { ok: true };
  })()`);
  if (!submitted.ok) {
    throw new Error(`Director composer did not submit: ${JSON.stringify(submitted)}`);
  }
}

function submitDirector(client, text) {
  return dispatchDirector(client, {
    kind: "submit",
    submit: { modality: "text", text },
  });
}

async function chooseFolderForResourceRequest(client, requestId) {
  const selector = `[data-resource-request-id="${requestId}"]`;
  await waitForSelector(client, selector);
  const clicked = await client.evaluate(`(() => {
    const request = document.querySelector(${JSON.stringify(selector)});
    const button = request instanceof HTMLElement
      ? Array.from(request.querySelectorAll("button")).find(
          (candidate) => candidate.textContent?.trim() === "Choose folder" && !candidate.disabled
        )
      : null;
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-choose-folder" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!clicked.ok) {
    throw new Error(`Director resource rail could not choose a folder: ${JSON.stringify(clicked)}`);
  }
  return waitForState(client, selectedWorkspaceIdExpression(), validWorkspaceId, workflowTimeoutMs);
}

async function verifyWorkspaceSettings(client, workspaceId) {
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Open settings"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!opened) {
    throw new Error("Director command center omitted its Settings action");
  }
  await waitForSelector(client, '[data-testid="settings-shell-page"]');
  await client.evaluate(`document.querySelector("#settings-subtab-roles")?.click()`);
  await waitForSelector(client, '[data-testid="role-configuration-scope-settings"]');
  const result = await waitForState(
    client,
    `(() => {
      const select = document.querySelector('select[aria-label="AI role configuration scope"]');
      if (!(select instanceof HTMLSelectElement)) {
        return { ready: false };
      }
      const workspaceOption = Array.from(select.options).find(
        (option) => option.value === "workspace"
      );
      return {
        ready: Boolean(workspaceOption),
        workspaceLabel: workspaceOption?.textContent ?? "",
        workspaceValue: workspaceOption?.value ?? ""
      };
    })()`,
    (state) => state.ready,
    workflowTimeoutMs,
  );
  assertEqual(result.workspaceValue, "workspace", "workspace role scope option");
  if (!result.workspaceLabel.includes(basename(fixture.workspaceRoot))) {
    throw new Error(`workspace role scope omitted the active workspace: ${JSON.stringify(result)}`);
  }
  const closed = await client.evaluate(`(() => {
    const button = document.querySelector(".setta-settings-page-back");
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!closed) {
    throw new Error("Settings page omitted Back to command center");
  }
  await waitForSelector(client, '[data-testid="director-command-center-shell"]');
  return { ...result, workspaceId };
}

async function readDirectorHistory(client) {
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector(".director-history-open");
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!opened) {
    throw new Error("Director history action was unavailable");
  }
  await waitForSelector(client, ".director-history-dialog");
  const modal = await client.evaluate(`(() => {
    const background = document.querySelector(".director-command-center-content");
    const close = document.querySelector(
      '.director-history-dialog button[aria-label="Close history"]'
    );
    const dialog = document.querySelector('[role="dialog"].director-history-overlay');
    if (
      !(background instanceof HTMLElement) ||
      !(close instanceof HTMLButtonElement) ||
      !(dialog instanceof HTMLElement)
    ) {
      return { ready: false };
    }
    const focusedInitially = document.activeElement === close;
    close.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab"
    }));
    const focusedAfterTab = document.activeElement === close;
    close.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      shiftKey: true
    }));
    return {
      backgroundHidden: background.getAttribute("aria-hidden") === "true",
      backgroundInert: background.inert,
      focusedAfterShiftTab: document.activeElement === close,
      focusedAfterTab,
      focusedInitially,
      ready: true
    };
  })()`);
  assertDeepEqual(
    modal,
    {
      backgroundHidden: true,
      backgroundInert: true,
      focusedAfterShiftTab: true,
      focusedAfterTab: true,
      focusedInitially: true,
      ready: true,
    },
    "Director history focus isolation",
  );
  const history = await client.evaluate(`(() =>
    Array.from(document.querySelectorAll(".director-history-dialog-list li")).map((item) => ({
      kind: item.getAttribute("data-node-kind") ?? "",
      text: item.textContent?.trim() ?? ""
    }))
  )()`);
  await client.evaluate(
    `document.querySelector('.director-history-dialog button[aria-label="Close history"]')?.click()`,
  );
  await waitForState(
    client,
    `(() => {
      const background = document.querySelector(".director-command-center-content");
      const trigger = document.querySelector(".director-history-open");
      return {
        backgroundInert: background instanceof HTMLElement && background.inert,
        focusedTrigger: document.activeElement === trigger,
        overlayOpen: Boolean(document.querySelector(".director-history-overlay"))
      };
    })()`,
    (state) => !state.backgroundInert && state.focusedTrigger && !state.overlayOpen,
    workflowTimeoutMs,
  );
  return history;
}

async function verifyCompactRailFocusRestoration(client) {
  await client.call("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: 844,
    mobile: true,
    width: 390,
  });
  try {
    await waitForState(
      client,
      `(() => ({
        compact: matchMedia("(max-width: 760px)").matches,
        triggerReady: Boolean(
          document.querySelector('button[aria-controls="director-now-rail"][aria-expanded="false"]')
        )
      }))()`,
      (state) => state.compact && state.triggerReady,
      workflowTimeoutMs,
    );
    const opened = await client.evaluate(`(() => {
      const trigger = document.querySelector(
        'button[aria-controls="director-now-rail"][aria-expanded="false"]'
      );
      if (!(trigger instanceof HTMLButtonElement)) {
        return false;
      }
      trigger.click();
      return true;
    })()`);
    if (!opened) {
      throw new Error("compact Now rail did not expose its disclosure button");
    }
    await waitForState(
      client,
      `(() => {
        const rail = document.querySelector("#director-now-rail");
        const trigger = document.querySelector('button[aria-controls="director-now-rail"]');
        return {
          expanded: trigger?.getAttribute("aria-expanded") === "true",
          visible: rail instanceof HTMLElement && getComputedStyle(rail).display !== "none"
        };
      })()`,
      (state) => state.expanded && state.visible,
      workflowTimeoutMs,
    );
    const escaped = await client.evaluate(`(() => {
      const railAction = document.querySelector("#director-now-rail .director-history-open");
      if (!(railAction instanceof HTMLButtonElement)) {
        return false;
      }
      railAction.focus();
      railAction.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape"
      }));
      return true;
    })()`);
    if (!escaped) {
      throw new Error("compact Now rail did not contain a focusable history action");
    }
    await waitForState(
      client,
      `(() => {
        const rail = document.querySelector("#director-now-rail");
        const trigger = document.querySelector('button[aria-controls="director-now-rail"]');
        return {
          collapsed: trigger?.getAttribute("aria-expanded") === "false",
          focusedTrigger: document.activeElement === trigger,
          hidden: rail instanceof HTMLElement && getComputedStyle(rail).display === "none"
        };
      })()`,
      (state) => state.collapsed && state.focusedTrigger && state.hidden,
      workflowTimeoutMs,
    );
  } finally {
    await client.call("Emulation.clearDeviceMetricsOverride");
  }
}

function assertHistoryContainsOnlyUserAndTerminalTurns(history) {
  if (history.length === 0) {
    throw new Error("Director history omitted completed work");
  }
  const allowed = new Set(["user_goal", "completed", "failed", "cancelled"]);
  const unexpected = history.filter((item) => !allowed.has(item.kind));
  if (unexpected.length > 0) {
    throw new Error(`Director history exposed intermediate activity: ${JSON.stringify(history)}`);
  }
  if (!history.some((item) => item.kind === "completed" && item.text !== "Run completed")) {
    throw new Error(`Director history omitted a final response: ${JSON.stringify(history)}`);
  }
}

function selectWorkstream(client, workstreamId) {
  return dispatchDirector(client, {
    kind: "select_workstream",
    selectWorkstream: { workstreamId },
  });
}

async function answerDirectorApprovalInRail(client, approvalId, questionId, answer) {
  const approvalSelector = `[data-approval-id="${approvalId}"]`;
  await waitForSelector(client, approvalSelector);
  const fieldSelector = `${approvalSelector} [name="${questionId}"]`;
  const updated = await client.evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(fieldSelector)});
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) {
      return { ok: false, reason: "missing-question" };
    }
    const valueDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value");
    valueDescriptor?.set?.call(field, ${JSON.stringify(answer)});
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  })()`);
  if (!updated.ok) {
    throw new Error(`Director approval rail did not update: ${JSON.stringify(updated)}`);
  }
  const answered = await client.evaluate(`(() => {
    const approval = document.querySelector(${JSON.stringify(approvalSelector)});
    if (!(approval instanceof HTMLElement)) {
      return { ok: false, reason: "missing-approval" };
    }
    const answerButton = Array.from(approval.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Answer" && !button.disabled
    );
    if (!(answerButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-answer-button" };
    }
    answerButton.click();
    return { ok: true };
  })()`);
  if (!answered.ok) {
    throw new Error(`Director approval rail did not submit: ${JSON.stringify(answered)}`);
  }
}

async function openDirectorArtifactDetail(client, artifactId) {
  await waitForSelector(client, `[data-artifact-id="${artifactId}"]`);
  const opened = await client.evaluate(`(() => {
    const artifact = Array.from(document.querySelectorAll("button[data-artifact-id]")).find(
      (candidate) => candidate.getAttribute("data-artifact-id") === ${JSON.stringify(artifactId)}
    );
    if (!(artifact instanceof HTMLButtonElement) || artifact.disabled) {
      return { ok: false, reason: artifact ? "disabled-artifact" : "missing-artifact" };
    }
    artifact.click();
    return { ok: true };
  })()`);
  if (!opened.ok) {
    throw new Error(`Director artifact did not open: ${JSON.stringify(opened)}`);
  }
  return waitForState(
    client,
    `(() => {
      const detail = Array.from(document.querySelectorAll(".director-artifact-detail")).find(
        (candidate) => candidate.getAttribute("data-artifact-id") === ${JSON.stringify(artifactId)}
      );
      return {
        status: detail?.getAttribute("data-artifact-load-state") ?? "",
        text: detail?.textContent ?? ""
      };
    })()`,
    (detail) => detail.status === "loaded",
    workflowTimeoutMs,
  );
}

async function closeDirectorArtifactDetail(client) {
  const closed = await client.evaluate(`(() => {
    const button = document.querySelector(
      '.director-artifact-detail button[aria-label="Close artifact details"]'
    );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!closed) {
    throw new Error("Director artifact detail did not expose a close action");
  }
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}

async function readBranch(backend, workspaceId, conversationId) {
  const page = await backend.post("/conversations/navigator/list", {
    cursor: null,
    limit: 50,
    query: "",
    workspaceId,
  });
  const item = page.items.find((candidate) => candidate.conversation.id === conversationId);
  if (!item?.branch) {
    throw new Error(`navigator omitted Director child branch ${conversationId}`);
  }
  return item.branch;
}

function conversationID(workstreamId) {
  const prefix = "workstream:";
  if (!workstreamId.startsWith(prefix) || workstreamId.length === prefix.length) {
    throw new Error(`unexpected workstream identity ${workstreamId}`);
  }
  return workstreamId.slice(prefix.length);
}

function assertDirectorEventSequence(cursor, events) {
  if (events.length === 0) {
    throw new Error("Director renderer subscription delivered no events");
  }
  let expected = cursor.sequence + 1;
  for (const event of events) {
    if (event.kind === "director.resync_required") {
      throw new Error(`Director renderer subscription required resync: ${JSON.stringify(event)}`);
    }
    if (event.streamId !== cursor.streamId || event.sequence !== expected) {
      throw new Error(
        `Director renderer event sequence drifted: ${JSON.stringify({
          actual: `${event.streamId}:${event.sequence}`,
          expected: `${cursor.streamId}:${expected}`,
        })}`,
      );
    }
    expected += 1;
  }
}

function assertEventKinds(events, requiredKinds) {
  const actual = new Set(events.map((event) => event.kind));
  const missing = requiredKinds.filter((kind) => !actual.has(kind));
  if (missing.length > 0) {
    throw new Error(`Director renderer events omitted kinds: ${missing.join(", ")}`);
  }
}

function comparableDirectorSnapshot(snapshot) {
  return {
    artifacts: snapshot.artifacts,
    graphs: snapshot.graphs,
    selectedWorkstreamId: snapshot.selectedWorkstreamId,
    unresolvedApprovals: snapshot.unresolvedApprovals,
    unresolvedResourceRequests: snapshot.unresolvedResourceRequests,
    workstreams: snapshot.workstreams,
  };
}

function requiredString(value, label) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} was missing: ${JSON.stringify(value)}`);
  }
  return value;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} = ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed: ${JSON.stringify({ actual, expected }, null, 2)}`);
  }
}

function assertExcludes(value, marker, label) {
  if (value.includes(marker)) {
    throw new Error(`${label} exposed ${JSON.stringify(marker)}`);
  }
}
