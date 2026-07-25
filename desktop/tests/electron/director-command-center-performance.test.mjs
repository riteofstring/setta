#!/usr/bin/env node
/* global console */

import { delimiter, join } from "node:path";
import process from "node:process";

import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readJsonLinesOptional,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import { assertSmoothFrameSample, frameBudgetSummary } from "./performance-frame-budget.mjs";

const workflowName = "director-command-center-performance";
const workflowTimeoutMs = 90_000;
const scenarioNames = ["lifecycle", "navigate-100-workstreams"];
const navigationWorkstreamTarget = 100;
const navigationMoveCount = 80;
const secretApprovalAnswer = "director-performance-secret-scope";
const domBudgets = {
  bodyDescendants: 900,
  graphLabels: 80,
  visibleWorkstreamDots: 19,
};

const { harnessArgv, workflowArgs } = splitArgs(process.argv.slice(2));
const options = parseElectronHarnessArgs(harnessArgv);

if (options.help) {
  console.log(
    `Usage: node desktop/tests/electron/director-command-center-performance.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>] [--scenario <name>]

Scenarios: ${scenarioNames.join(", ")}`,
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const launchEnvironment = {
  PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
  SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
  SETTA_E2E_WINDOW_HEIGHT: "982",
  SETTA_E2E_WINDOW_WIDTH: "1512",
};
let context = null;
let summary = null;

try {
  context = await launchDirectorElectron();
  const backend = await backendProbe(artifactDir);
  const workspaceId = await openWorkspace(context.client);
  const selectedScenarios = selectScenarios(workflowArgs.scenarios);
  const results = [];

  if (selectedScenarios.includes("lifecycle")) {
    results.push(
      await measureScenario(context.client, "lifecycle", () =>
        runLifecycleScenario(context.client, workspaceId),
      ),
    );
    await captureScreenshot(context.client, join(artifactDir, "lifecycle.png"));
  }

  if (selectedScenarios.includes("navigate-100-workstreams")) {
    await seedNavigationWorkstreams(context.client, backend, workspaceId);
    results.push(
      await measureScenario(context.client, "navigate-100-workstreams", () =>
        runNavigationScenario(context.client),
      ),
    );
    await captureScreenshot(context.client, join(artifactDir, "navigate-100-workstreams.png"));
  }

  summary = {
    artifactDir,
    domBudgets,
    results: results.map(compactResult),
    status: "measured",
    viewport: await viewportState(context.client),
    workflow: workflowName,
    workspaceId,
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  await assertRendererStayedQuiet(artifactDir);
  summary = { ...summary, status: "passed" };
  await writeJson(join(artifactDir, "summary.json"), summary);
  for (const result of results) {
    console.log(formatResult(result));
  }
  console.log(`Electron Director command-center performance passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    ...summary,
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
}

function splitArgs(argv) {
  const workflowArgs = { scenarios: [] };
  const harnessArgv = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scenario") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--scenario requires a value");
      }
      workflowArgs.scenarios.push(value);
      index += 1;
      continue;
    }
    harnessArgv.push(arg);
  }
  return { harnessArgv, workflowArgs };
}

function selectScenarios(requested) {
  if (requested.length === 0) {
    return scenarioNames;
  }
  const unknown = requested.filter((name) => !scenarioNames.includes(name));
  if (unknown.length > 0) {
    throw new Error(`unknown scenario ${unknown.join(", ")}; known: ${scenarioNames.join(", ")}`);
  }
  return requested;
}

async function launchDirectorElectron() {
  const launched = await launchElectronCdpContext({
    artifactDir,
    extraEnv: launchEnvironment,
    fixture,
    visible: options.visible,
  });
  await waitForSelector(launched.client, '[data-testid="director-command-center-shell"]');
  await launched.client.installDriver();
  await waitForShellReady(launched.client);
  return launched;
}

async function measureScenario(client, scenario, run) {
  const started = await client.driver("directorCommandCenterPerformanceStart");
  if (!started.ok) {
    throw new Error(`Director performance profiler did not start: ${JSON.stringify(started)}`);
  }
  const outcome = await run();
  await waitForFrames(client, 12);
  const stopped = await client.driver("directorCommandCenterPerformanceStop");
  if (!stopped.ok) {
    throw new Error(`Director performance profiler did not stop: ${JSON.stringify(stopped)}`);
  }
  assertSmoothFrameSample(stopped.sample, `Director command-center ${scenario}`, {
    minFrameCount: 30,
  });
  assertDomBudgets(stopped.final, scenario);
  return {
    final: stopped.final,
    frameBudget: frameBudgetSummary(stopped.sample),
    initial: started.initial,
    outcome,
    sample: stopped.sample,
    scenario,
  };
}

async function runLifecycleScenario(client, workspaceId) {
  const folderlessReceipt = await submitDirector(client, "Director create folderless.");
  const rootWorkstreamId = requiredString(folderlessReceipt.submit?.workstreamId, "workstream");
  const resourceRequestId = requiredString(
    folderlessReceipt.submit?.resourceRequestId,
    "resource request",
  );
  await waitForDirectorSnapshot(client, (snapshot) => awaitingResource(snapshot, rootWorkstreamId));
  await dispatchDirector(client, {
    kind: "resolve_resource_request",
    resolveResourceRequest: { requestId: resourceRequestId, workspaceId },
  });
  await waitForDirectorSnapshot(client, (snapshot) => resourceResolved(snapshot, rootWorkstreamId));
  await selectWorkstream(client, rootWorkstreamId);

  await submitDirector(client, "Director send hold.");
  await waitForWorkstream(
    client,
    rootWorkstreamId,
    (workstream) => workstream.activeRunId !== null,
  );
  await submitDirector(client, "Director queue next.");
  await waitForWorkstream(
    client,
    rootWorkstreamId,
    (workstream) => workstream.queuedRunCount === 1,
  );
  await submitDirector(client, "Director steer now.");
  await waitForWorkstream(client, rootWorkstreamId, idleUnqueued);

  await submitDirector(client, "Director request approval.");
  const approval = await waitForFirstApproval(client, rootWorkstreamId);
  await answerApproval(client, approval.id, approval.questions[0]?.id ?? "", secretApprovalAnswer);
  await waitForDirectorSnapshot(client, (snapshot) => snapshot.unresolvedApprovals.length === 0);

  await submitDirector(client, "Director fail.");
  await waitForWorkstream(client, rootWorkstreamId, (workstream) => workstream.status === "failed");
  await submitDirector(client, "Director recover.");
  await waitForWorkstream(
    client,
    rootWorkstreamId,
    (workstream) => workstream.status === "completed",
  );

  await submitDirector(client, "Director artifact.");
  const artifact = await waitForFirstArtifact(client, rootWorkstreamId);
  await openArtifact(client, artifact.id);
  await waitForArtifactDetail(client, artifact.id);
  const snapshot = await readDirectorSnapshot(client);
  assertExcludes(JSON.stringify(snapshot), secretApprovalAnswer, "Director snapshot");
  return {
    artifactId: artifact.id,
    graphCount: snapshot.graphs.length,
    rootWorkstreamId,
    workstreamCount: snapshot.aggregates.workstreamCount,
  };
}

async function runNavigationScenario(client) {
  const before = await readDirectorSnapshot(client);
  const direction = navigationDirection(before);
  for (let index = 0; index < navigationMoveCount; index += 1) {
    await dispatchDirector(client, moveSelectionIntent(direction));
    if (index % 4 === 3) {
      await waitForFrames(client, 1);
    }
  }
  const after = await readDirectorSnapshot(client);
  if (after.selectedWorkstreamId === before.selectedWorkstreamId) {
    throw new Error("Director navigation did not change selection");
  }
  return {
    selectedWorkstreamId: after.selectedWorkstreamId,
    workstreamCount: after.aggregates.workstreamCount,
  };
}

async function seedNavigationWorkstreams(client, backend, workspaceId) {
  const current = await readDirectorSnapshot(client);
  const missing = navigationWorkstreamTarget - current.aggregates.workstreamCount;
  if (missing <= 0) {
    return;
  }
  for (let index = 0; index < missing; index += 10) {
    const batchSize = Math.min(10, missing - index);
    await Promise.all(
      Array.from({ length: batchSize }, (_, batchIndex) =>
        backend.post("/conversations/create", {
          title: `Director performance ${String(index + batchIndex + 1).padStart(3, "0")}`,
          workspaceId,
        }),
      ),
    );
  }
  await waitForDirectorSnapshot(
    client,
    (snapshot) => snapshot.aggregates.workstreamCount >= navigationWorkstreamTarget,
  );
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

function waitForShellReady(client) {
  return waitForState(
    client,
    "globalThis.__settaE2EDriver.directorCommandCenterPerformanceSnapshot()",
    (snapshot) =>
      snapshot.shellPresent &&
      snapshot.graphCanvas.width > 0 &&
      snapshot.graphCanvas.height > 0 &&
      snapshot.composerPresent,
    workflowTimeoutMs,
  );
}

function viewportState(client) {
  return client.evaluate(`(() => ({
    devicePixelRatio: window.devicePixelRatio,
    height: window.innerHeight,
    width: window.innerWidth
  }))()`);
}

function readDirectorSnapshot(client) {
  return client.evaluate("window.setta.director.readSnapshot()");
}

function dispatchDirector(client, intent) {
  return client.evaluate(`window.setta.director.dispatch(${JSON.stringify(intent)})`);
}

function submitDirector(client, text) {
  return dispatchDirector(client, {
    kind: "submit",
    submit: { modality: "text", text },
  });
}

function selectWorkstream(client, workstreamId) {
  return dispatchDirector(client, {
    kind: "select_workstream",
    selectWorkstream: { workstreamId },
  });
}

function moveSelectionIntent(direction) {
  return { kind: "move_selection", moveSelection: { direction } };
}

function waitForDirectorSnapshot(client, ready) {
  return waitForBackendState(() => readDirectorSnapshot(client), ready, workflowTimeoutMs);
}

function waitForWorkstream(client, workstreamId, ready) {
  return waitForDirectorSnapshot(client, (snapshot) => {
    const workstream = workstreamById(snapshot, workstreamId);
    return Boolean(workstream && ready(workstream));
  });
}

async function waitForFirstApproval(client, workstreamId) {
  const snapshot = await waitForDirectorSnapshot(client, (candidate) =>
    candidate.unresolvedApprovals.some((approval) => approval.workstreamId === workstreamId),
  );
  return snapshot.unresolvedApprovals.find((approval) => approval.workstreamId === workstreamId);
}

async function waitForFirstArtifact(client, workstreamId) {
  const snapshot = await waitForDirectorSnapshot(client, (candidate) =>
    candidate.artifacts.some(
      (artifact) => artifact.workstreamId === workstreamId && artifact.status === "available",
    ),
  );
  return snapshot.artifacts.find(
    (artifact) => artifact.workstreamId === workstreamId && artifact.status === "available",
  );
}

async function answerApproval(client, approvalId, questionId, answer) {
  const result = await client.driver("directorCommandCenterAnswerApproval", {
    answer,
    approvalId,
    questionId,
  });
  if (!result.ok) {
    throw new Error(`Director approval answer failed: ${JSON.stringify(result)}`);
  }
}

async function openArtifact(client, artifactId) {
  const result = await client.driver("directorCommandCenterOpenArtifact", { artifactId });
  if (!result.ok) {
    throw new Error(`Director artifact open failed: ${JSON.stringify(result)}`);
  }
}

function waitForArtifactDetail(client, artifactId) {
  return waitForState(
    client,
    `(() => {
      const detail = document.querySelector(${JSON.stringify(
        `.director-artifact-detail[data-artifact-id="${artifactId}"]`,
      )});
      return detail?.getAttribute("data-artifact-load-state") ?? "";
    })()`,
    (state) => state === "loaded",
    workflowTimeoutMs,
  );
}

function waitForFrames(client, count) {
  return client.driver("directorCommandCenterWaitFrames", { count });
}

function awaitingResource(snapshot, workstreamId) {
  return workstreamById(snapshot, workstreamId)?.status === "awaiting_resource";
}

function resourceResolved(snapshot, workstreamId) {
  return workstreamById(snapshot, workstreamId)?.resourceScope.kind === "folder";
}

function idleUnqueued(workstream) {
  return workstream.activeRunId === null && workstream.queuedRunCount === 0;
}

function workstreamById(snapshot, workstreamId) {
  return snapshot.workstreams.find((entry) => entry.workstream.id === workstreamId)?.workstream;
}

function navigationDirection(snapshot) {
  const selectedIndex = snapshot.workstreams.findIndex(
    (entry) => entry.workstream.id === snapshot.selectedWorkstreamId,
  );
  if (selectedIndex < 0) {
    return "next";
  }
  return selectedIndex >= snapshot.workstreams.length - 1 ? "previous" : "next";
}

function assertDomBudgets(snapshot, scenario) {
  assertBudget(
    snapshot.bodyDescendantCount,
    domBudgets.bodyDescendants,
    `${scenario} body descendants`,
  );
  assertBudget(
    snapshot.visibleWorkstreamDotCount,
    domBudgets.visibleWorkstreamDots,
    `${scenario} visible workstream dots`,
  );
  assertBudget(snapshot.graphLabelCount, domBudgets.graphLabels, `${scenario} graph labels`);
}

function assertBudget(actual, budget, label) {
  if (actual <= budget) {
    return;
  }
  throw new Error(`${label} exceeded budget: ${actual} > ${budget}`);
}

async function assertRendererStayedQuiet(directory) {
  const entries = await readJsonLinesOptional(join(directory, "renderer-console.jsonl"));
  const errors = entries.filter((entry) => entry.level >= 2);
  if (errors.length === 0) {
    return;
  }
  const distinct = [...new Set(errors.map((entry) => entry.message))];
  throw new Error(
    `the Director command-center renderer logged ${errors.length} errors: ${JSON.stringify(
      distinct.slice(0, 5),
    )}`,
  );
}

function compactResult(result) {
  return {
    dom: {
      artifactCards: result.final.artifactCards,
      artifactDetailOpen: result.final.artifactDetailOpen,
      bodyDescendantCount: result.final.bodyDescendantCount,
      graphLabelCount: result.final.graphLabelCount,
      pendingApprovals: result.final.pendingApprovals,
      pendingResourceRequests: result.final.pendingResourceRequests,
      rails: result.final.rails,
      visibleWorkstreamDotCount: result.final.visibleWorkstreamDotCount,
    },
    frameBudget: result.frameBudget,
    outcome: result.outcome,
    sample: compactSample(result.sample),
    scenario: result.scenario,
  };
}

function compactSample(sample) {
  return {
    averageFps: round(sample.averageFps),
    durationMs: round(sample.durationMs),
    frameCount: sample.frameCount,
    frameDeltaMs: {
      max: round(sample.maxFrameDeltaMs),
      p50: round(sample.p50FrameDeltaMs),
      p95: round(sample.p95FrameDeltaMs),
      p99: round(sample.p99FrameDeltaMs),
    },
    framesOver50Ms: sample.slowFramesOver50Ms,
    longTaskCount: sample.longTaskCount,
    longTaskTotalMs: round(sample.longTaskTotalMs),
    mutations: sample.mutations,
  };
}

function formatResult(result) {
  return [
    `  ${result.scenario}`,
    `frames=${result.sample.frameCount}`,
    `p95=${round(result.sample.p95FrameDeltaMs)}ms`,
    `p99=${round(result.sample.p99FrameDeltaMs)}ms`,
    `max=${round(result.sample.maxFrameDeltaMs)}ms`,
    `longTasks=${result.sample.longTaskCount}`,
    `dom=${result.final.bodyDescendantCount}`,
    `dots=${result.final.visibleWorkstreamDotCount}`,
  ].join(" ");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} was missing: ${JSON.stringify(value)}`);
  }
  return value;
}

function assertExcludes(value, marker, label) {
  if (value.includes(marker)) {
    throw new Error(`${label} leaked marker ${JSON.stringify(marker)}`);
  }
}
