#!/usr/bin/env node
/* global console */

import { readFile } from "node:fs/promises";
import { basename, delimiter, join } from "node:path";
import process from "node:process";

import {
  backendProbe,
  openFixtureWorkspace,
  waitForBackendState,
} from "./electron-workflow-harness.mjs";
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
  const workspaceId = await openFixtureWorkspace(context.client, workflowTimeoutMs);
  await waitForSelector(context.client, '[data-testid="director-command-center-shell"]');
  const initial = await subscribeFromRenderer(context.client);
  assertEqual(initial.workstreams.length, 0, "initial Director workstream count");

  await submitDirectorInComposer(context.client, "Director create workspace workstream.");
  const created = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.workstreams.length === 1 &&
      snapshot.workstreams[0]?.workstream.resourceScope.kind === "folder" &&
      snapshot.workstreams[0]?.workstream.resourceScope.folder?.workspaceId === workspaceId &&
      snapshot.workstreams[0]?.workstream.status === "idle" &&
      snapshot.selectedWorkstreamId === snapshot.workstreams[0]?.workstream.id,
  );
  const rootWorkstreamId = requiredString(
    created.workstreams[0]?.workstream.id,
    "workspace-scoped Director workstream",
  );
  const workspaceSettings = await verifyWorkspaceSettings(context.client, workspaceId);

  const normal = await submitDirector(context.client, "Director normal conversation.");
  assertEqual(
    normal.submit?.replyText,
    "The Director can answer without acting.",
    "Director normal reply",
  );
  assertEqual(normal.submit?.toolCalls.length, 0, "Director normal reply tool-call count");

  const remembered = await submitDirector(
    context.client,
    "Remember DIRECTOR_HISTORY_OK and acknowledge it.",
  );
  assertEqual(
    remembered.submit?.replyText,
    "I will remember DIRECTOR_HISTORY_OK.",
    "Director remembered reply",
  );
  assertEqual(remembered.submit?.toolCalls.length, 0, "Director remembered reply tool-call count");

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

  await submitDirector(context.client, "Director artifact.");
  const beforeRestart = await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.selectedWorkstreamId === rootWorkstreamId &&
      snapshot.artifacts.some(
        (artifact) => artifact.workstreamId === rootWorkstreamId && artifact.status === "available",
      ),
  );
  const openedArtifact = beforeRestart.artifacts.find(
    (artifact) => artifact.workstreamId === rootWorkstreamId && artifact.status === "available",
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
    "director.selection.changed",
    "director.text.delta",
    "director.workstream.updated",
  ]);
  assertExcludes(JSON.stringify(rendererEvents), secretApprovalAnswer, "Director pushed events");
  const durableBeforeRestart = comparableDirectorSnapshot(beforeRestart);
  await writeJson(join(artifactDir, "before-restart.json"), durableBeforeRestart);

  await stopElectronCdpContext(context);
  context = null;
  await assertArtifactsExcludeMarkers(
    firstLaunchDir,
    [secretApprovalAnswer],
    "Director private approval state",
  );

  context = await launchDirectorElectron(secondLaunchDir);
  backend = await backendProbe(secondLaunchDir);
  const restoredWorkspaceId = await openFixtureWorkspace(context.client, workflowTimeoutMs);
  assertEqual(restoredWorkspaceId, workspaceId, "restored Director workspace");
  const restored = await readDirectorSnapshot(context.client);
  const durableRestored = comparableDirectorSnapshot(restored);
  assertDeepEqual(durableRestored, durableBeforeRestart, "restored Director snapshot");

  const recalled = await submitDirector(context.client, "What marker did I ask you to remember?");
  assertEqual(recalled.submit?.replyText, "DIRECTOR_HISTORY_OK", "replayed Director reply");
  assertEqual(recalled.submit?.toolCalls.length, 0, "replayed Director reply tool-call count");

  const createdAfterRestart = await submitDirector(
    context.client,
    "Director create workspace workstream.",
  );
  const createCall = createdAfterRestart.submit?.toolCalls.find(
    (call) => call.tool === "create_workstream" && call.succeeded,
  );
  const restartedWorkstreamId = requiredString(
    createCall?.workstreamId,
    "post-restart Director workstream",
  );
  if (restartedWorkstreamId === rootWorkstreamId) {
    throw new Error("post-restart Director tool call reused the original workstream");
  }
  await waitForDirectorSnapshot(
    context.client,
    (snapshot) =>
      snapshot.selectedWorkstreamId === restartedWorkstreamId &&
      snapshot.workstreams.some(
        (entry) =>
          entry.workstream.id === restartedWorkstreamId &&
          entry.workstream.resourceScope.folder?.workspaceId === workspaceId,
      ),
  );
  const providerLifecycle = await readDirectorProviderLifecycle(fakeCodex.statePath);

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    eventCount: rendererEvents.length,
    providerLifecycle,
    restartedWorkstreamId,
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

async function readDirectorProviderLifecycle(statePath) {
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const directorStarts = state.methodLog.filter(
    (entry) => entry.method === "thread/start" && entry.isDirector === true,
  );
  const directorThreadIds = new Set(directorStarts.map((entry) => entry.threadId));
  const directorInjections = state.methodLog.filter(
    (entry) => entry.method === "thread/inject_items" && directorThreadIds.has(entry.threadId),
  );
  const directorTurns = state.methodLog.filter(
    (entry) => entry.method === "turn/start" && entry.isDirector === true,
  );
  const directorResumes = state.methodLog.filter(
    (entry) => entry.method === "thread/resume" && directorThreadIds.has(entry.threadId),
  );
  if (
    directorStarts.length !== 2 ||
    directorStarts.some((entry) => entry.ephemeral !== true) ||
    new Set(directorStarts.map((entry) => entry.generation)).size !== 2
  ) {
    throw new Error(`Director provider starts drifted: ${JSON.stringify(directorStarts)}`);
  }
  if (directorInjections.length !== 2 || directorResumes.length !== 0) {
    throw new Error(
      `Director provider replay lifecycle drifted: ${JSON.stringify({
        directorInjections,
        directorResumes,
      })}`,
    );
  }
  if (
    directorTurns.length < 2 ||
    directorTurns.some((entry) => {
      const started = directorStarts.find((candidate) => candidate.generation === entry.generation);
      return started?.threadId !== entry.threadId;
    })
  ) {
    throw new Error(
      `Director turns did not stay on one provider thread per run: ${JSON.stringify(directorTurns)}`,
    );
  }
  const replayRoles = directorInjections[1]?.injectedRoles;
  if (
    !Array.isArray(replayRoles) ||
    !replayRoles.includes("user") ||
    !replayRoles.includes("assistant")
  ) {
    throw new Error(
      `Director restart omitted durable conversation roles: ${JSON.stringify(replayRoles)}`,
    );
  }
  return {
    generations: directorStarts.map((entry) => entry.generation),
    replayRoles,
    threadIds: directorStarts.map((entry) => entry.threadId),
    turnCount: directorTurns.length,
  };
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
