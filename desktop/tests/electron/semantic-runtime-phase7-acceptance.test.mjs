/* global console */

import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  backendProbe,
  captureScreenshot,
  configureChatWorkflowHarness,
  createChat,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  pathTimestamp,
  stopLaunchedContext,
  waitForBackendState,
} from "./chat-workflow-harness.mjs";
import { writeJson } from "./electron-cdp-harness.mjs";
import {
  assertAppliedFindingReadback,
  assertDefaultRuntimeVisualBudget,
  assertLargeReviewVisualBudget,
  assertProductDetailsExplainRuntimeAndFinding,
  assertReviewerActiveAndRuntime,
  assertScriptedReviewerActivity,
  exercisePhase7TrackpadPanZoom,
  renderedSemanticLiveSourceIds,
  rendererSemanticGraph,
  rendererWorkflow,
  reviewerActive,
  reviewerNodeId,
  seedNodeId,
  setFinalSynthesisInputBudget,
  summarizeSnapshot,
  waitForRenderedSemanticGraphNode,
  waitForWorkflowExecution,
  waitForWorkflowGraphSnapshot,
  waitForWorkspaceLayout,
  workflowCodexNode,
  workflowControlNode,
  workflowEdge,
  workflowGraph,
  workflowRuntimeIndicatorForNode,
} from "./semantic-runtime-phase7-helpers.mjs";
import { assertSemanticRuntimeTrafficContract } from "./semantic-runtime-traffic-gate.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";
import {
  getWorkflowGraphDebugSnapshot,
  recordWorkflowGraphPanZoomDiagnostics,
} from "./workflow-graph-performance-recording.mjs";
import {
  assertPhase8PerformanceGuardrails,
  workflowGraphSemanticTrafficDuringInteraction,
} from "./workflow-graph-phase0-performance-guardrails.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const workflowNames = new Set([
  "semantic-review-live-product",
  "semantic-runtime-large-review",
  "semantic-runtime-reconnect",
  "workflow-graph-pan-zoom-runtime-burst",
]);
const booleanArgFields = new Map([
  ["--help", "help"],
  ["-h", "help"],
  ["--keep-artifacts", "keepArtifacts"],
  ["--skip-build", "skipBuild"],
  ["--visible", "visible"],
]);
let appliedTargetSequence = 0;

const options = parseArgs(process.argv.slice(2));
const recordingRoot = phase7RecordingRoot(options);

configureChatWorkflowHarness({ visible: options.visible });

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/semantic-runtime-phase7-acceptance.test.mjs --workflow <semantic-review-live-product|semantic-runtime-large-review|semantic-runtime-reconnect|workflow-graph-pan-zoom-runtime-burst> [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

await rm(recordingRoot, { force: true, recursive: true });
await mkdir(recordingRoot, { recursive: true });

const fixtures = [];
const contexts = [];
const stoppedLogs = [];

try {
  const report = await runSelectedWorkflow();
  await writeJson(join(recordingRoot, "phase7-acceptance-report.json"), report);
  console.log(`${options.workflow} passed: ${recordingRoot}`);
} catch (error) {
  for (const [index, context] of contexts.entries()) {
    await captureScreenshot(context.client, join(recordingRoot, `failure-${index + 1}.png`)).catch(
      () => {},
    );
  }
  throw failureWithLogs(
    error,
    stoppedLogs.concat(contexts.flatMap((context) => context.electron.logs)),
  );
} finally {
  while (contexts.length > 0) {
    await stopTrackedContext(contexts[0]);
  }
  if (!options.keepArtifacts) {
    for (const fixture of fixtures) {
      await rm(fixture.tempRoot, { force: true, recursive: true });
    }
  }
}

async function runSelectedWorkflow() {
  switch (options.workflow) {
    case "semantic-review-live-product":
      return runSemanticReviewLiveProduct();
    case "semantic-runtime-large-review":
      return runSemanticRuntimeLargeReview();
    case "semantic-runtime-reconnect":
      return runSemanticRuntimeReconnect();
    case "workflow-graph-pan-zoom-runtime-burst":
      return runWorkflowGraphPanZoomRuntimeBurst();
    default:
      throw new Error(`unsupported phase 7 workflow: ${options.workflow}`);
  }
}

async function runWorkflowGraphPanZoomRuntimeBurst() {
  const setup = await setupReviewGraph({
    prompt: "cancel active workflow",
    recordingName: "workflow-graph-pan-zoom-runtime-burst",
    workflowName: "Phase 7 runtime burst reviewer",
  });
  const started = await startWorkflowFromGraph(setup);
  const initial = await waitForWorkflowGraphSnapshot(
    setup.client,
    setup.graphSurfaceId,
    (snapshot) =>
      reviewerActive(snapshot) &&
      snapshot.render.activeNodePulseCount > 0 &&
      snapshot.render.frameCount > 2,
    30_000,
  );
  const artifacts = await recordWorkflowGraphPanZoomDiagnostics({
    artifactDir: setup.recordingDir,
    client: setup.client,
    interaction: ({ inputSamples }) =>
      Promise.all([
        exercisePhase7TrackpadPanZoom(setup.client, setup.graphSurfaceId, inputSamples),
        emitRuntimeBurst({
          client: setup.client,
          definitionId: setup.definition.id,
          executionId: started.id,
          workspaceId: setup.workspaceId,
        }),
      ]),
    name: "runtime-burst-pan-zoom",
    surfaceId: setup.graphSurfaceId,
  });
  await delay(250);
  const final = await getWorkflowGraphDebugSnapshot(setup.client, setup.graphSurfaceId, false);
  assertReviewerActiveAndRuntime(final);
  assertDefaultRuntimeVisualBudget(final);
  const semanticTraffic = await workflowGraphSemanticTrafficDuringInteraction({
    artifactDir: setup.recordingDir,
    inputWindow: artifacts.metrics.inputWindow,
  });
  const performanceGate = assertPhase8PerformanceGuardrails({
    artifacts,
    final,
    initial,
    scenario: "runtime-burst",
    semanticTraffic,
    syntheticScene: "production-runtime-burst",
  });
  const trafficGate = await assertSemanticRuntimeTrafficContract(setup.recordingDir, {
    reportName: "phase7-runtime-burst-traffic-gate.json",
    workflowLabel: "phase7-runtime-burst",
  });
  await rendererWorkflow(setup.client, "cancelExecution", [setup.workspaceId, started.id]);
  await captureScreenshot(setup.client, join(setup.recordingDir, "runtime-burst-final.png"));
  return {
    artifacts,
    performanceGate,
    trafficGate,
    workflow: options.workflow,
  };
}

async function runSemanticReviewLiveProduct() {
  const setup = await setupReviewGraph({
    prompt: "workflow result action",
    recordingName: "semantic-review-live-product",
    workflowName: "Phase 7 live review product",
  });
  const started = await startWorkflowFromGraph(setup);
  const prePatch = await buildWorkflowRuntimePulseWithinOneSecond({
    client: setup.client,
    definitionId: setup.definition.id,
    executionId: started.id,
    graphSurfaceId: setup.graphSurfaceId,
    workspaceId: setup.workspaceId,
  });
  const execution = await waitForWorkflowExecution(
    setup.client,
    setup.workspaceId,
    started.id,
    (candidate) => candidate.status === "completed",
  );
  const workflowActivity = await assertScriptedReviewerActivity({
    client: setup.client,
    execution,
    workspaceId: setup.workspaceId,
  });
  const statuses = [
    await processPendingReviewCartographerWindow(
      setup.client,
      setup.workspaceId,
      setup.definition.id,
    ),
    await processAppliedCartographerWindow({
      client: setup.client,
      definitionId: setup.definition.id,
      executionId: started.id,
      workspaceId: setup.workspaceId,
    }),
    await processNoopCartographerWindow(setup.client, setup.workspaceId),
    await processFailedCartographerWindow(setup.client, setup.workspaceId),
  ];
  const applied = statuses.find((status) => status.status === "applied");
  await waitForRenderedSemanticGraphNode(setup.client, setup.graphSurfaceId, applied.nodeId);
  const details = await assertProductDetailsExplainRuntimeAndFinding({
    client: setup.client,
    graphSurfaceId: setup.graphSurfaceId,
    semanticNodeId: seedNodeId,
    semanticNodeLabel: "Phase 7 review context",
  });
  const snapshot = await getWorkflowGraphDebugSnapshot(setup.client, setup.graphSurfaceId, false);
  assertDefaultRuntimeVisualBudget(snapshot);
  const trafficGate = await assertSemanticRuntimeTrafficContract(setup.recordingDir, {
    reportName: "phase7-live-product-traffic-gate.json",
    workflowLabel: "phase7-live-product",
  });
  await captureScreenshot(setup.client, join(setup.recordingDir, "semantic-review-product.png"));
  return {
    details,
    prePatch,
    statuses,
    trafficGate,
    workflow: options.workflow,
    workflowActivity,
  };
}

async function runSemanticRuntimeReconnect() {
  const setup = await setupReviewGraph({
    prompt: "workflow result action",
    recordingName: "semantic-runtime-reconnect",
    workflowName: "Phase 7 reconnect review",
  });
  const started = await startWorkflowFromGraph(setup);
  const execution = await waitForWorkflowExecution(
    setup.client,
    setup.workspaceId,
    started.id,
    (candidate) => candidate.status === "completed",
  );
  const applied = await processAppliedCartographerWindow({
    client: setup.client,
    definitionId: setup.definition.id,
    executionId: execution.id,
    workspaceId: setup.workspaceId,
  });
  await waitForRenderedSemanticGraphNode(setup.client, setup.graphSurfaceId, applied.nodeId);
  const beforeReload = await getWorkflowGraphDebugSnapshot(
    setup.client,
    setup.graphSurfaceId,
    false,
  );
  await setup.client.call("Page.reload", { ignoreCache: true });
  await waitForWorkspaceLayout(setup.client);
  await openWorkflowGraphPane(setup.client, { timeoutMs: 30_000 });
  const reloadedSurfaceId = await maximizeWorkflowGraphPane(setup.client, { timeoutMs: 30_000 });
  const afterReload = await waitForWorkflowGraphSnapshot(
    setup.client,
    reloadedSurfaceId,
    (snapshot) =>
      snapshot.graph.nodes.some((node) => node.id === `semantic:${applied.nodeId}`) &&
      snapshot.graph.nodes.some((node) => node.id === reviewerNodeId),
    30_000,
  );
  const durableReadback = await assertAppliedFindingReadback(
    setup.client,
    setup.workspaceId,
    applied.nodeId,
  );
  const trafficGate = await assertSemanticRuntimeTrafficContract(setup.recordingDir, {
    reportName: "phase7-reconnect-traffic-gate.json",
    workflowLabel: "phase7-reconnect",
  });
  return {
    afterReload: summarizeSnapshot(afterReload),
    beforeReload: summarizeSnapshot(beforeReload),
    durableReadback,
    reloadedSurfaceId,
    trafficGate,
    workflow: options.workflow,
  };
}

async function runSemanticRuntimeLargeReview() {
  const setup = await setupReviewGraph({
    prompt: "workflow result action",
    recordingName: "semantic-runtime-large-review",
    workflowName: "Phase 7 large semantic review",
  });
  const started = await startWorkflowFromGraph(setup);
  const execution = await waitForWorkflowExecution(
    setup.client,
    setup.workspaceId,
    started.id,
    (candidate) => candidate.status === "completed",
  );
  const applied = [];
  for (let index = 0; index < 10; index += 1) {
    applied.push(
      await processAppliedCartographerWindow({
        client: setup.client,
        definitionId: setup.definition.id,
        executionId: execution.id,
        summary: `Phase 7 large review finding ${index + 1}.`,
        workspaceId: setup.workspaceId,
      }),
    );
  }
  await waitForRenderedSemanticGraphNode(setup.client, setup.graphSurfaceId, applied[0].nodeId);
  const snapshot = await getWorkflowGraphDebugSnapshot(setup.client, setup.graphSurfaceId, false);
  assertLargeReviewVisualBudget(snapshot);
  const trafficGate = await assertSemanticRuntimeTrafficContract(setup.recordingDir, {
    reportName: "phase7-large-review-traffic-gate.json",
    workflowLabel: "phase7-large-review",
  });
  await captureScreenshot(setup.client, join(setup.recordingDir, "large-review-final.png"));
  return {
    appliedFindingCount: applied.length,
    snapshot: summarizeSnapshot(snapshot),
    trafficGate,
    workflow: options.workflow,
  };
}

async function setupReviewGraph({ prompt, recordingName, workflowName }) {
  const fixture = await createTrackedFixture(recordingName);
  const recordingDir = join(recordingRoot, recordingName);
  const context = await launchTrackedContext(fixture, recordingDir, {
    extraEnv: {
      SETTA_WORKFLOW_GRAPH_DEBUG: "1",
    },
  });
  const backend = await backendProbe(recordingDir);
  const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
  await createChat(context.client, backend, workspaceId);
  const definition = await createReviewWorkflow(context.client, workspaceId, {
    prompt,
    workflowName,
  });
  await seedWorkflowNodeEvidence(context.client, {
    definitionId: definition.id,
    workspaceId,
  });
  await context.client.call("Page.reload", { ignoreCache: true });
  await waitForWorkspaceLayout(context.client);
  await openWorkflowGraphPane(context.client, { timeoutMs: 30_000 });
  const graphSurfaceId = await maximizeWorkflowGraphPane(context.client, { timeoutMs: 30_000 });
  await waitForWorkflowGraphSnapshot(
    context.client,
    graphSurfaceId,
    (snapshot) =>
      snapshot.graph.nodes.some((node) => node.id === reviewerNodeId) &&
      snapshot.graph.nodes.some((node) => node.id === `semantic:${seedNodeId}`),
    30_000,
  );
  return {
    backend,
    client: context.client,
    context,
    definition,
    fixture,
    graphSurfaceId,
    recordingDir,
    workspaceId,
  };
}

async function startWorkflowFromGraph(setup) {
  const run = await setup.client.driver("runWorkflowDraftForSurface", {
    definitionId: setup.definition.id,
    surfaceId: setup.graphSurfaceId,
  });
  if (!run.ok || run.executionId === "") {
    throw new Error(`phase 7 graph workflow run did not start: ${JSON.stringify(run)}`);
  }
  setup.graphSurfaceId = run.surfaceId || setup.graphSurfaceId;
  const visibleSurfaceId = await maximizeWorkflowGraphPane(setup.client, {
    surfaceId: setup.graphSurfaceId,
    timeoutMs: 30_000,
  });
  setup.graphSurfaceId = visibleSurfaceId || setup.graphSurfaceId;
  await waitForWorkflowGraphSnapshot(
    setup.client,
    setup.graphSurfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.executionId === run.executionId &&
      snapshot.graph.workflow?.viewMode === "run",
    30_000,
    { includeVisual: true },
  );
  return waitForWorkflowExecution(
    setup.client,
    setup.workspaceId,
    run.executionId,
    (candidate) => candidate.id === run.executionId,
  );
}

async function createReviewWorkflow(client, workspaceId, { prompt, workflowName }) {
  const graph = workflowGraph(
    [
      workflowControlNode("start", "start", "Start"),
      workflowCodexNode(reviewerNodeId, prompt, "Reviewer"),
      workflowControlNode("end", "end", "End"),
    ],
    [
      workflowEdge("start_reviewer", "start", reviewerNodeId),
      workflowEdge("reviewer_end", reviewerNodeId, "end"),
    ],
  );
  const validation = await rendererWorkflow(client, "validateDefinition", [workspaceId, graph]);
  if (!validation.valid) {
    throw new Error(`phase 7 review workflow invalid: ${JSON.stringify(validation)}`);
  }
  return rendererWorkflow(client, "createDefinition", [
    workspaceId,
    workflowName,
    "Phase 7 semantic runtime review acceptance workflow.",
    graph,
  ]);
}

async function seedWorkflowNodeEvidence(client, { definitionId, workspaceId }) {
  await rendererSemanticGraph(client, "createNode", [
    {
      actorId: "phase7_e2e",
      actorKind: "user",
      kind: "constraint",
      label: "Phase 7 review context",
      nodeId: seedNodeId,
      summary: "Definition-level evidence for phase 7 review cartographer processing.",
      workspaceId,
    },
  ]);
  const attachment = await rendererSemanticGraph(client, "attachWorkflowNode", [
    {
      activityKind: "validating",
      actorId: "phase7_e2e",
      actorKind: "user",
      nodeId: seedNodeId,
      summary: "Phase 7 review evidence attached before workflow execution starts.",
      workflowDefinitionId: definitionId,
      workflowExecutionId: "",
      workflowNodeExecutionId: "",
      workflowNodeId: reviewerNodeId,
      workspaceId,
    },
  ]);
  if (!attachment.evidence?.id) {
    throw new Error(`phase 7 workflow evidence was not attached: ${JSON.stringify(attachment)}`);
  }
  return attachment;
}

async function buildWorkflowRuntimePulseWithinOneSecond({
  client,
  definitionId,
  executionId,
  graphSurfaceId,
  workspaceId,
}) {
  const startedAtMs = Date.now();
  const built = await buildCartographerWindow(client, {
    definitionId,
    executionId,
    summary: "Phase 7 fast typed workflow liveness window.",
    targetEntityId: seedNodeId,
    triggerKind: "workflow_window",
    workflowNodeId: reviewerNodeId,
    workspaceId,
  });
  const snapshot = await waitForBackendState(
    () => getWorkflowGraphDebugSnapshot(client, graphSurfaceId, false),
    (candidate) =>
      (workflowRuntimeIndicatorForNode(candidate, reviewerNodeId)?.sourceCount ?? 0) > 0,
    1000,
  );
  const latencyMs = Date.now() - startedAtMs;
  if (latencyMs > 1000) {
    throw new Error(`phase 7 runtime liveness latency ${latencyMs}ms exceeded 1000ms`);
  }
  const runtime = workflowRuntimeIndicatorForNode(snapshot, reviewerNodeId);
  return {
    latencyMs,
    renderedLiveSourceCount: renderedSemanticLiveSourceIds(snapshot).length,
    runId: built.run.id,
    status: runtime?.status ?? "",
    windowId: built.window.id,
    workflowRuntimeSourceCount: runtime?.sourceCount ?? 0,
  };
}

async function emitRuntimeBurst({ client, definitionId, executionId, workspaceId }) {
  await delay(24);
  for (let index = 0; index < 16; index += 1) {
    const built = await buildCartographerWindow(client, {
      definitionId,
      executionId,
      summary: `Phase 7 runtime burst window ${index + 1}.`,
      targetEntityId: seedNodeId,
      triggerKind: "workflow_window",
      workflowNodeId: reviewerNodeId,
      workspaceId,
    });
    if (index < 4) {
      await rendererSemanticGraph(client, "processCartographerWindow", [
        { windowId: built.window.id, workspaceId },
      ]);
    }
    await delay(8);
  }
}

async function processPendingReviewCartographerWindow(client, workspaceId, definitionId) {
  const built = await buildCartographerWindow(client, {
    definitionId,
    executionId: "phase7_pending_review_execution",
    summary: "Phase 7 pending review patch preview.",
    targetEntityId: seedNodeId,
    triggerKind: "workflow_window",
    workflowNodeId: "phase8_pending_review",
    workspaceId,
  });
  const processed = await rendererSemanticGraph(client, "processCartographerWindow", [
    { windowId: built.window.id, workspaceId },
  ]);
  if (
    processed.run.status !== "pending_review" ||
    !processed.patches.some((patch) => patch.status === "pending_review")
  ) {
    throw new Error(`phase 7 pending review mismatch: ${JSON.stringify(processed)}`);
  }
  return { runId: processed.run.id, status: "proposed", windowId: processed.window.id };
}

async function processAppliedCartographerWindow({
  client,
  definitionId,
  executionId,
  summary = "Phase 7 applied review finding.",
  workspaceId,
}) {
  const targetEntityId = await seedAppliedCartographerTarget(client, {
    definitionId,
    summary,
    workspaceId,
  });
  const built = await buildCartographerWindow(client, {
    definitionId,
    executionId,
    summary,
    targetEntityId,
    triggerKind: "workflow_window",
    workflowNodeId: "phase8_pending_review",
    workspaceId,
  });
  const processed = await rendererSemanticGraph(client, "processCartographerWindow", [
    { windowId: built.window.id, workspaceId },
  ]);
  assertPendingReviewRun(processed);
  const patch = requirePendingRecordFindingPatch(processed);
  const nodeId = requirePatchNodeId(patch, processed);
  const reviewed = await rendererSemanticGraph(client, "acceptCartographerPatch", [
    { patchId: patch.id, workspaceId },
  ]);
  assertAcceptedCartographerPatch(reviewed);
  return {
    nodeId,
    patchId: patch.id,
    runId: reviewed.run.id,
    status: "applied",
    windowId: processed.window.id,
  };
}

function assertPendingReviewRun(processed) {
  if (processed.run.status !== "pending_review") {
    throw new Error(`phase 7 applied cartographer mismatch: ${JSON.stringify(processed)}`);
  }
}

function requirePendingRecordFindingPatch(processed) {
  const patch = processed.patches.find(isPendingRecordFindingPatch);
  if (!patch) {
    throw new Error(`phase 7 applied cartographer mismatch: ${JSON.stringify(processed)}`);
  }
  return patch;
}

function isPendingRecordFindingPatch(candidate) {
  return candidate.status === "pending_review" && candidate.patch.operation === "record_finding";
}

function requirePatchNodeId(patch, processed) {
  const nodeId = patch.patch.payload.newNode?.semanticNodeId ?? "";
  if (nodeId === "") {
    throw new Error(`phase 7 applied cartographer mismatch: ${JSON.stringify(processed)}`);
  }
  return nodeId;
}

function assertAcceptedCartographerPatch(reviewed) {
  if (reviewed.run.status !== "applied" || reviewed.patch.status !== "applied") {
    throw new Error(`phase 7 accepted cartographer mismatch: ${JSON.stringify(reviewed)}`);
  }
}

async function seedAppliedCartographerTarget(client, { definitionId, summary, workspaceId }) {
  appliedTargetSequence += 1;
  const nodeId = `${seedNodeId}_applied_${String(appliedTargetSequence).padStart(3, "0")}`;
  await rendererSemanticGraph(client, "createNode", [
    {
      actorId: "phase7_e2e",
      actorKind: "user",
      kind: "constraint",
      label: `Phase 7 applied review context ${appliedTargetSequence}`,
      nodeId,
      summary: `Target context for ${summary}`,
      workspaceId,
    },
  ]);
  const attachment = await rendererSemanticGraph(client, "attachWorkflowNode", [
    {
      activityKind: "validating",
      actorId: "phase7_e2e",
      actorKind: "user",
      nodeId,
      summary: `Phase 7 applied review target for ${summary}`,
      workflowDefinitionId: definitionId,
      workflowExecutionId: "",
      workflowNodeExecutionId: "",
      workflowNodeId: reviewerNodeId,
      workspaceId,
    },
  ]);
  if (!attachment.evidence?.id) {
    throw new Error(
      `phase 7 applied target evidence was not attached: ${JSON.stringify(attachment)}`,
    );
  }
  return nodeId;
}

async function processNoopCartographerWindow(client, workspaceId) {
  const built = await buildCartographerWindow(client, {
    definitionId: "",
    executionId: "phase7_noop_execution",
    summary: "zz_noop_empty_signal_7319",
    targetEntityId: "",
    triggerKind: "workflow_window",
    workflowNodeId: "zz_noop_empty_node",
    workspaceId,
  });
  const processed = await rendererSemanticGraph(client, "processCartographerWindow", [
    { windowId: built.window.id, workspaceId },
  ]);
  if (processed.run.status !== "completed_noop") {
    throw new Error(`phase 7 no-op mismatch: ${JSON.stringify(processed)}`);
  }
  return { runId: processed.run.id, status: "noop", windowId: processed.window.id };
}

async function processFailedCartographerWindow(client, workspaceId) {
  await setFinalSynthesisInputBudget(client, workspaceId, 1);
  const built = await buildCartographerWindow(client, {
    chatRunId: "phase7_failed_chat_run",
    executionId: "phase7_failed_execution",
    summary: "Phase 7 final synthesis failure window.",
    targetEntityId: seedNodeId,
    terminalReason: "phase7_failed_budget",
    triggerKind: "workflow_done",
    workflowNodeId: reviewerNodeId,
    workspaceId,
  });
  const processed = await rendererSemanticGraph(client, "processCartographerWindow", [
    { windowId: built.window.id, workspaceId },
  ]);
  if (processed.run.status !== "failed") {
    throw new Error(`phase 7 failed mismatch: ${JSON.stringify(processed)}`);
  }
  return { runId: processed.run.id, status: "failed", windowId: processed.window.id };
}

async function buildCartographerWindow(
  client,
  {
    chatRunId = "",
    definitionId = "",
    executionId,
    summary,
    targetEntityId,
    terminalReason = "",
    triggerKind,
    workflowNodeId = "",
    workspaceId,
  },
) {
  return rendererSemanticGraph(client, "buildCartographerWindow", [
    {
      runStatus: "",
      sourceRefs: {
        chatConversationId: "",
        chatMessageId: "",
        chatRunId,
        runItemId: "",
        workflowDefinitionId: definitionId,
        workflowExecutionId: executionId,
        workflowNodeExecutionId: "",
        workflowNodeId,
      },
      summary,
      targetEntityId,
      terminalReason,
      triggerKind,
      workspaceId,
    },
  ]);
}

async function createTrackedFixture(name) {
  const fixture = await createFixture(name);
  fixtures.push(fixture);
  return fixture;
}

async function launchTrackedContext(fixture, recordingDir, launchOptions = {}) {
  const context = await launchContext(fixture, recordingDir, launchOptions);
  contexts.push(context);
  return context;
}

async function stopTrackedContext(context) {
  if (!context) {
    return;
  }
  await stopLaunchedContext(context);
  stoppedLogs.push(...(context.electron.logs ?? []));
  const index = contexts.indexOf(context);
  if (index >= 0) {
    contexts.splice(index, 1);
  }
}

function parseArgs(args) {
  const parsed = {
    artifactDir: "",
    help: false,
    keepArtifacts: false,
    skipBuild: false,
    visible: process.env.SETTA_E2E_VISIBLE === "1",
    workflow: "",
  };
  for (let index = 0; index < args.length; index += 1) {
    index = parseArg(args, index, parsed);
  }
  if (!parsed.help && parsed.workflow === "") {
    throw new Error("--workflow is required");
  }
  return parsed;
}

function parseArg(args, index, parsed) {
  const arg = args[index];
  const booleanField = booleanArgFields.get(arg);
  if (booleanField) {
    parsed[booleanField] = true;
    return index;
  }
  if (arg === "--artifact-dir") {
    parsed.artifactDir = resolve(requiredArgValue(args, index, arg));
    return index + 1;
  }
  if (arg === "--workflow") {
    parsed.workflow = requiredWorkflowArgValue(args, index, arg);
    return index + 1;
  }
  throw new Error(`unknown phase 7 acceptance argument: ${arg}`);
}

function requiredWorkflowArgValue(args, index, flag) {
  const workflow = requiredArgValue(args, index, flag);
  if (!workflowNames.has(workflow)) {
    throw new Error(`--workflow must be one of ${[...workflowNames].join(", ")}`);
  }
  return workflow;
}

function requiredArgValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function phase7RecordingRoot(parsed) {
  if (parsed.artifactDir !== "") {
    return parsed.artifactDir;
  }
  return join(
    repoRoot,
    ".recordings",
    parsed.workflow || "semantic-runtime-phase7",
    pathTimestamp(),
  );
}
