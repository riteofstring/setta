#!/usr/bin/env node
/* global console */

import { rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

import {
  backendProbe,
  openFixtureWorkspace,
  waitForBackendState,
} from "./electron-workflow-harness.mjs";
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
import {
  applyDirectorGraphTier,
  directorGraphTierNames,
  directorGraphTiers,
} from "./director-graph-performance-helpers.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import { assertSmoothFrameSample, frameBudgetSummary } from "./performance-frame-budget.mjs";

const workflowName = "director-command-center-performance";
const sustainedDurationMs = 10 * 60 * 1_000;
const workflowTimeoutMs = sustainedDurationMs + 120_000;
const scenarioNames = [
  "lifecycle",
  "viewport-matrix",
  "text-delta-burst",
  "occlusion-transitions",
  "history-compaction-boundary",
  "navigate-100-workstreams",
  "sustained-activity",
  "restart-durable-replay",
];
const navigationWorkstreamTarget = 100;
const navigationMoveCount = 80;
const secretApprovalAnswer = "director-performance-secret-scope";
const domBudgets = {
  narrationItems: 3,
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
const initialLaunchDir = join(artifactDir, "initial-launch");
const restartLaunchDir = join(artifactDir, "restart-launch");
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const launchEnvironment = {
  PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
  SETTA_E2E_DIRECTOR_SUSTAINED_MS: String(sustainedDurationMs),
  SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
  SETTA_E2E_WINDOW_HEIGHT: "982",
  SETTA_E2E_WINDOW_WIDTH: "1512",
};
let context = null;
let summary = null;

try {
  context = await launchDirectorElectron(initialLaunchDir);
  let backend = await backendProbe(initialLaunchDir, context.client);
  const workspaceId = await openFixtureWorkspace(context.client, workflowTimeoutMs);
  const selectedScenarios = selectScenarios(workflowArgs.scenarios);
  const results = [];
  const rootWorkstreamId = await bootstrapRootWorkstream(context.client, workspaceId);

  if (selectedScenarios.includes("lifecycle")) {
    results.push(
      await measureScenario(context.client, "lifecycle", () =>
        runLifecycleScenario(context.client, rootWorkstreamId),
      ),
    );
    await captureScreenshot(context.client, join(artifactDir, "lifecycle-laptop.png"));
  }

  if (selectedScenarios.includes("viewport-matrix")) {
    results.push(...(await runViewportMatrix(context.client, rootWorkstreamId)));
  }

  if (selectedScenarios.includes("text-delta-burst")) {
    for (const tierName of ["laptop", "desktop-4k"]) {
      const tier = directorTier(tierName);
      await applyDirectorTier(context.client, tier);
      results.push(
        await measureScenario(
          context.client,
          "text-delta-burst",
          () =>
            runConversationTurnScenario({
              backend,
              client: context.client,
              directorText: "Director text burst.",
              rootWorkstreamId,
              workspaceId,
            }),
          tier.name,
        ),
      );
      await captureScreenshot(
        context.client,
        join(artifactDir, `text-delta-burst-${tier.name}.png`),
      );
    }
  }

  if (selectedScenarios.includes("occlusion-transitions")) {
    const tier = directorTier("laptop");
    await applyDirectorTier(context.client, tier);
    results.push(
      await measureScenario(
        context.client,
        "occlusion-transitions",
        () =>
          runOcclusionScenario({
            backend,
            client: context.client,
            rootWorkstreamId,
            workspaceId,
          }),
        tier.name,
      ),
    );
    await captureScreenshot(context.client, join(artifactDir, "occlusion-transitions-laptop.png"));
  }

  if (selectedScenarios.includes("history-compaction-boundary")) {
    const tier = directorTier("laptop");
    await applyDirectorTier(context.client, tier);
    results.push(
      await measureScenario(
        context.client,
        "history-compaction-boundary",
        () =>
          runHistoryCompactionScenario({
            backend,
            client: context.client,
            rootWorkstreamId,
            workspaceId,
          }),
        tier.name,
      ),
    );
    await captureScreenshot(
      context.client,
      join(artifactDir, "history-compaction-boundary-laptop.png"),
    );
  }

  if (selectedScenarios.includes("navigate-100-workstreams")) {
    await seedNavigationWorkstreams(context.client, backend, workspaceId);
    for (const tierName of ["laptop", "desktop-4k"]) {
      const tier = directorTier(tierName);
      await applyDirectorTier(context.client, tier);
      results.push(
        await measureScenario(
          context.client,
          "navigate-100-workstreams",
          () => runNavigationScenario(context.client),
          tier.name,
        ),
      );
      await captureScreenshot(
        context.client,
        join(artifactDir, `navigate-100-workstreams-${tier.name}.png`),
      );
    }
  }

  if (selectedScenarios.includes("sustained-activity")) {
    const tier = directorTier("laptop");
    await applyDirectorTier(context.client, tier);
    results.push(
      await measureScenario(
        context.client,
        "sustained-activity",
        () =>
          runConversationTurnScenario({
            backend,
            client: context.client,
            directorText: "Director sustained.",
            rootWorkstreamId,
            workspaceId,
          }),
        tier.name,
      ),
    );
  }

  if (selectedScenarios.includes("restart-durable-replay")) {
    const beforeRestart = comparableDirectorSnapshot(await readDirectorSnapshot(context.client));
    await stopElectronCdpContext(context);
    context = null;
    context = await launchDirectorElectron(restartLaunchDir);
    backend = await backendProbe(restartLaunchDir, context.client);
    const restoredWorkspaceId = await openFixtureWorkspace(context.client, workflowTimeoutMs);
    if (restoredWorkspaceId !== workspaceId) {
      throw new Error(`restart restored workspace ${restoredWorkspaceId}, want ${workspaceId}`);
    }
    const restored = comparableDirectorSnapshot(await readDirectorSnapshot(context.client));
    assertJsonEqual(restored, beforeRestart, "restart Director snapshot");
    for (const tierName of ["laptop", "harness-standard"]) {
      const tier = directorTier(tierName);
      await applyDirectorTier(context.client, tier);
      results.push(
        await measureScenario(
          context.client,
          "restart-durable-replay",
          async () => {
            await waitForFrames(context.client, 48);
            return {
              graphCount: restored.graphs.length,
              selectedWorkstreamId: restored.selectedWorkstreamId,
              workstreamCount: restored.workstreams.length,
            };
          },
          tier.name,
        ),
      );
      await captureScreenshot(
        context.client,
        join(artifactDir, `restart-durable-replay-${tier.name}.png`),
      );
    }
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
  await assertRendererStayedQuiet(initialLaunchDir);
  if (selectedScenarios.includes("restart-durable-replay")) {
    await assertRendererStayedQuiet(restartLaunchDir);
  }
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
  await rm(fixture.tempRoot, { force: true, recursive: true });
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

function directorTier(name) {
  const tier = directorGraphTiers.find((candidate) => candidate.name === name);
  if (!tier) {
    throw new Error(
      `Director performance tier ${name} is missing; known: ${directorGraphTierNames().join(", ")}`,
    );
  }
  return tier;
}

async function applyDirectorTier(client, tier) {
  await applyDirectorGraphTier(client, tier);
  await waitForState(
    client,
    `(() => {
      const canvas = document.querySelector(".director-graph-canvas");
      const box = canvas?.getBoundingClientRect();
      return {
        canvasHeight: Math.round(box?.height ?? 0),
        canvasWidth: Math.round(box?.width ?? 0),
        devicePixelRatio: window.devicePixelRatio,
        height: window.innerHeight,
        width: window.innerWidth
      };
    })()`,
    (value) =>
      value.canvasHeight > 0 &&
      value.canvasWidth > 0 &&
      value.height === tier.height &&
      value.width === tier.width &&
      (!tier.emulated || value.devicePixelRatio === tier.deviceScaleFactor),
    workflowTimeoutMs,
  );
  await waitForFrames(client, 12);
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
  await waitForShellReady(launched.client);
  return launched;
}

async function measureScenario(client, scenario, run, tier = "laptop") {
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
  stopped.final.canvasPixel = await readDirectorCanvasPixel(client);
  assertSmoothFrameSample(stopped.sample, `Director command-center ${scenario}`, {
    minFrameCount: 30,
  });
  assertDomBudgets(stopped.final, scenario);
  assertScenarioLayout(stopped.final, scenario, tier);
  assertCanvasPixel(stopped.final, `${tier}/${scenario}`);
  assertScenarioPerformance(stopped.sample, scenario, tier);
  return {
    final: stopped.final,
    frameBudget: frameBudgetSummary(stopped.sample),
    initial: started.initial,
    outcome,
    sample: stopped.sample,
    scenario,
    tier,
    viewport: await viewportState(client),
  };
}

async function bootstrapRootWorkstream(client, workspaceId) {
  const folderlessReceipt = await submitDirector(client, "Director create folderless.");
  const createCall = folderlessReceipt.submit?.toolCalls.find(
    (call) => call.tool === "create_workstream" && call.succeeded,
  );
  const rootWorkstreamId = requiredString(createCall?.workstreamId, "workstream");
  const awaiting = await waitForDirectorSnapshot(
    client,
    (snapshot) =>
      awaitingResource(snapshot, rootWorkstreamId) &&
      snapshot.unresolvedResourceRequests.some(
        (request) => request.workstreamId === rootWorkstreamId,
      ),
  );
  const resourceRequestId = requiredString(
    awaiting.unresolvedResourceRequests.find((request) => request.workstreamId === rootWorkstreamId)
      ?.id,
    "resource request",
  );
  await dispatchDirector(client, {
    kind: "resolve_resource_request",
    resolveResourceRequest: { requestId: resourceRequestId, workspaceId },
  });
  await waitForDirectorSnapshot(client, (snapshot) => resourceResolved(snapshot, rootWorkstreamId));
  await selectWorkstream(client, rootWorkstreamId);
  return rootWorkstreamId;
}

async function runLifecycleScenario(client, rootWorkstreamId) {
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

  await submitDirector(client, "Director send cancel hold.");
  const cancellable = await waitForWorkstream(
    client,
    rootWorkstreamId,
    (workstream) => workstream.activeRunId !== null,
  );
  const cancellableRunId = workstreamById(cancellable, rootWorkstreamId)?.activeRunId;
  await dispatchDirector(client, {
    cancelRun: {
      runId: requiredString(cancellableRunId, "cancellable run"),
      workstreamId: rootWorkstreamId,
    },
    kind: "cancel_run",
  });
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
  await closeArtifact(client);
  const snapshot = await readDirectorSnapshot(client);
  assertExcludes(JSON.stringify(snapshot), secretApprovalAnswer, "Director snapshot");
  return {
    artifactId: artifact.id,
    graphCount: snapshot.graphs.length,
    rootWorkstreamId,
    workstreamCount: snapshot.aggregates.workstreamCount,
  };
}

async function runViewportMatrix(client, rootWorkstreamId) {
  await selectWorkstream(client, rootWorkstreamId);
  await submitDirector(client, "Director send hold.");
  await waitForWorkstream(
    client,
    rootWorkstreamId,
    (workstream) => workstream.activeRunId !== null,
  );

  const results = [];
  for (const tierName of ["laptop", "harness-standard", "desktop-6k", "phone-dpr3", "phone-dpr1"]) {
    const tier = directorTier(tierName);
    await applyDirectorTier(client, tier);
    results.push(
      await measureScenario(
        client,
        "one-active-workstream",
        async () => {
          await waitForFrames(client, 48);
          return viewportState(client);
        },
        tier.name,
      ),
    );
    await captureScreenshot(client, join(artifactDir, `one-active-workstream-${tier.name}.png`));
  }

  for (const tierName of ["laptop", "desktop-4k"]) {
    const tier = directorTier(tierName);
    await applyDirectorTier(client, tier);
    results.push(
      await measureScenario(
        client,
        "director-and-worker-interleaved",
        async () => {
          const current = await readDirectorSnapshot(client);
          if (workstreamById(current, rootWorkstreamId)?.queuedRunCount === 0) {
            await submitDirector(client, "Director queue next.");
          }
          await waitForWorkstream(
            client,
            rootWorkstreamId,
            (workstream) => workstream.activeRunId !== null && workstream.queuedRunCount === 1,
          );
          await waitForFrames(client, 48);
          return { queuedRunCount: 1 };
        },
        tier.name,
      ),
    );
    await captureScreenshot(
      client,
      join(artifactDir, `director-and-worker-interleaved-${tier.name}.png`),
    );
  }

  await applyDirectorTier(client, directorTier("laptop"));
  await submitDirector(client, "Director steer now.");
  await waitForWorkstream(client, rootWorkstreamId, idleUnqueued);
  return results;
}

async function runConversationTurnScenario({
  backend,
  client,
  directorText,
  rootWorkstreamId,
  workspaceId,
}) {
  await selectWorkstream(client, rootWorkstreamId);
  const conversationId = conversationID(rootWorkstreamId);
  const before = await readConversationSnapshot(backend, workspaceId, conversationId);
  const beforeCount = before.turns.turns.length;
  await submitDirector(client, directorText);
  const completed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) =>
      snapshot.turns.turns.length === beforeCount + 1 &&
      snapshot.turns.turns.at(-1)?.status === "completed",
  );
  await waitForWorkstream(client, rootWorkstreamId, idleUnqueued);
  return {
    authoredInput: completed.turns.turns.at(-1)?.authoredInput.text ?? "",
    turnCount: completed.turns.turns.length,
  };
}

async function runHistoryCompactionScenario({ backend, client, rootWorkstreamId, workspaceId }) {
  const outcome = await runConversationTurnScenario({
    backend,
    client,
    directorText: "Director graph burst.",
    rootWorkstreamId,
    workspaceId,
  });
  const snapshot = await waitForDirectorSnapshot(client, (candidate) => {
    const graph = candidate.graphs.find((item) => item.workstreamId === rootWorkstreamId);
    return graph?.hasEarlier === true && graph.nodes.length === 400;
  });
  const graph = snapshot.graphs.find((item) => item.workstreamId === rootWorkstreamId);
  return {
    ...outcome,
    hasEarlier: graph?.hasEarlier ?? false,
    nodeCount: graph?.nodes.length ?? 0,
  };
}

async function runOcclusionScenario({ backend, client, rootWorkstreamId, workspaceId }) {
  await selectWorkstream(client, rootWorkstreamId);
  await setSimulatedDocumentVisibility(client, "hidden");
  try {
    await waitForFrames(client, 12);
    const hiddenBefore = await readDirectorCanvasPixel(client);
    const outcome = await runConversationTurnScenario({
      backend,
      client,
      directorText: "Director graph burst.",
      rootWorkstreamId,
      workspaceId,
    });
    await waitForFrames(client, 12);
    const hiddenAfter = await readDirectorCanvasPixel(client);
    if (hiddenBefore.ok || hiddenAfter.ok || hiddenAfter.digest !== hiddenBefore.digest) {
      throw new Error(
        `Director graph drew while hidden: ${JSON.stringify({
          after: hiddenAfter,
          before: hiddenBefore,
        })}`,
      );
    }
    await setSimulatedDocumentVisibility(client, "visible");
    await waitForFrames(client, 48);
    const resumed = await readDirectorCanvasPixel(client);
    if (!resumed.ok || resumed.digest === hiddenAfter.digest) {
      throw new Error(
        `Director graph did not redraw after visibility resumed: ${JSON.stringify({
          hidden: hiddenAfter,
          resumed,
        })}`,
      );
    }
    return {
      ...outcome,
      hiddenDigest: hiddenAfter.digest,
      resumedDigest: resumed.digest,
    };
  } finally {
    await setSimulatedDocumentVisibility(client, "visible");
  }
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
      const browser = document.querySelector(${JSON.stringify(
        `.director-artifact-browser[data-artifact-id="${artifactId}"]`,
      )});
      return browser?.getAttribute("data-artifact-load-state") ?? "";
    })()`,
    (state) => state === "ready",
    workflowTimeoutMs,
  );
}

async function closeArtifact(client) {
  const closed = await client.evaluate(`(() => {
    const button = document.querySelector(
      '.director-artifact-browser button[aria-label="Close artifact browser"]'
    );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!closed) {
    throw new Error("Director artifact browser did not close");
  }
}

function waitForFrames(client, count) {
  return client.driver("directorCommandCenterWaitFrames", { count });
}

function readDirectorCanvasPixel(client) {
  return client.driver("directorCommandCenterCanvasPixelCheck");
}

async function setSimulatedDocumentVisibility(client, visibilityState) {
  const result = await client.evaluate(`(() => {
    const state = ${JSON.stringify(visibilityState)};
    if (state !== "hidden" && state !== "visible") {
      return { ok: false, reason: "invalid-state" };
    }
    if (!Object.hasOwn(document, "__settaE2EVisibilityState")) {
      Object.defineProperty(document, "__settaE2EVisibilityState", {
        configurable: true,
        value: document.visibilityState,
        writable: true
      });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => document.__settaE2EVisibilityState
      });
    }
    document.__settaE2EVisibilityState = state;
    document.dispatchEvent(new Event("visibilitychange"));
    return { ok: true, state: document.visibilityState };
  })()`);
  if (!result.ok || result.state !== visibilityState) {
    throw new Error(
      `Director document visibility did not become ${visibilityState}: ${JSON.stringify(result)}`,
    );
  }
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
  assertBudget(snapshot.narrationItems, domBudgets.narrationItems, `${scenario} narration items`);
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

/*
 * A blank canvas is a defect only when there was a graph to draw. A workstream
 * with no committed nodes legitimately renders nothing but the drifting medium,
 * and the shell states that on the canvas instead of leaving an unexplained
 * void — so the empty state is what this asserts in that case.
 */
function assertCanvasPixel(snapshot, label) {
  const pixel = snapshot?.canvasPixel;
  if (!pixel?.available) {
    throw new Error(`${label} could not read the graph canvas: ${JSON.stringify(pixel)}`);
  }
  if (snapshot.graphEmptyState) {
    if (pixel.ok) {
      throw new Error(`${label} drew a graph while claiming to be empty`);
    }
    return;
  }
  if (!pixel.ok) {
    throw new Error(`${label} rendered a blank graph canvas: ${JSON.stringify(pixel)}`);
  }
}

function assertScenarioPerformance(sample, scenario, tier) {
  if (scenario === "text-delta-burst") {
    assertTextDeltaMutationBudget(sample.mutations, scenario, tier);
  }
  if (scenario === "sustained-activity") {
    assertSustainedHeapBudget(sample.heap, scenario, tier);
  }
}

function assertTextDeltaMutationBudget(mutations, scenario, tier) {
  if (
    mutations.addedNodes <= 80 &&
    mutations.removedNodes <= 80 &&
    mutations.characterDataRecords <= 80
  ) {
    return;
  }
  throw new Error(
    `${tier}/${scenario} turned best-effort text deltas into visible DOM churn: ${JSON.stringify(
      mutations,
    )}`,
  );
}

function assertSustainedHeapBudget(heap, scenario, tier) {
  const start = heap?.startBytes;
  const end = heap?.endBytes;
  if (typeof start === "number" && typeof end === "number" && end - start > 48 * 1024 * 1024) {
    throw new Error(`${tier}/${scenario} retained more than 48 MB: ${JSON.stringify(heap)}`);
  }
}

function assertScenarioLayout(snapshot, scenario, tier) {
  if (scenario !== "navigate-100-workstreams") {
    return;
  }
  if (
    snapshot.visibleWorkstreamDotCount !== domBudgets.visibleWorkstreamDots ||
    !snapshot.workstreamStrip.allDotsVisible ||
    !snapshot.workstreamStrip.selectedDotVisible
  ) {
    throw new Error(
      `${tier}/${scenario} clipped its bounded workstream selector: ${JSON.stringify({
        dotCount: snapshot.visibleWorkstreamDotCount,
        strip: snapshot.workstreamStrip,
      })}`,
    );
  }
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
    canvasPixel: {
      litPixelRatio: round(result.final.canvasPixel.litPixelRatio),
      ok: result.final.canvasPixel.ok,
      peakLuminance: round(result.final.canvasPixel.peakLuminance),
    },
    dom: {
      narrationItems: result.final.narrationItems,
      artifactCards: result.final.artifactCards,
      artifactDetailOpen: result.final.artifactDetailOpen,
      bodyDescendantCount: result.final.bodyDescendantCount,
      graphLabelCount: result.final.graphLabelCount,
      pendingApprovals: result.final.pendingApprovals,
      pendingResourceRequests: result.final.pendingResourceRequests,
      rails: result.final.rails,
      visibleWorkstreamDotCount: result.final.visibleWorkstreamDotCount,
      workstreamStrip: result.final.workstreamStrip,
    },
    canvasBacking: result.final.graphCanvasBacking,
    frameBudget: result.frameBudget,
    heapMb: {
      end: megabytes(result.sample.heap?.endBytes),
      peak: megabytes(result.sample.heap?.peakBytes),
      start: megabytes(result.sample.heap?.startBytes),
    },
    outcome: result.outcome,
    sample: compactSample(result.sample),
    scenario: result.scenario,
    tier: result.tier,
    viewport: result.viewport,
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
    `  ${result.tier}/${result.scenario}`,
    `frames=${result.sample.frameCount}`,
    `p95=${round(result.sample.p95FrameDeltaMs)}ms`,
    `p99=${round(result.sample.p99FrameDeltaMs)}ms`,
    `max=${round(result.sample.maxFrameDeltaMs)}ms`,
    `longTasks=${result.sample.longTaskCount}`,
    `dom=${result.final.bodyDescendantCount}`,
    `dots=${result.final.visibleWorkstreamDotCount}`,
  ].join(" ");
}

function megabytes(bytes) {
  return typeof bytes === "number" ? round(bytes / 1_048_576) : null;
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

function readConversationSnapshot(backend, workspaceId, conversationId) {
  return backend.post("/conversations/snapshot/read", { conversationId, workspaceId });
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    () => readConversationSnapshot(backend, workspaceId, conversationId),
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

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed: ${JSON.stringify({ actual, expected }, null, 2)}`);
  }
}
