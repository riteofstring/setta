/* global console */

import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  assertBuildExists,
  assertRecordingEvidence,
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
  waitForState,
} from "./chat-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(desktopRoot, "..");
const options = parseArgs(process.argv.slice(2));
const recordingRoot = semanticCartographerRecordingRoot(options);
const cartographerNodeIdPrefix = "semantic_node_cartographer_scripted";
const cartographerPatchIdPrefix = "cartographer_patch_scripted";
const seedNodeId = "semantic_auto_workflow_context";
const smokeAgentNodeId = "agent";
const longFastNodeId = "fast";
const longSlowNodeId = "slow";

configureChatWorkflowHarness({ visible: options.visible });

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/semantic-cartographer-auto-workflow.test.mjs [--semantic-live-recording-only] [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
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
  const smoke = await runAutomaticAgentSmoke();
  const longRunning = options.semanticLiveRecordingOnly
    ? null
    : await runLongRunningAutomaticCartographerWorkflow();
  console.log(
    `semantic cartographer automatic workflow passed: ${JSON.stringify({
      longRunningExecutionId: longRunning?.executionId ?? "",
      longRunningProcessedWindows: longRunning?.processedWindowCount ?? 0,
      semanticLiveRecordingOnly: options.semanticLiveRecordingOnly,
      smokeExecutionId: smoke.executionId,
      smokeEdgePatchId: smoke.automatic.edgePatch.id,
      smokePatchId: smoke.automatic.patch.id,
      smokeRunId: smoke.automatic.run.id,
      smokeWindowId: smoke.automatic.window.id,
    })}`,
  );
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

async function runAutomaticAgentSmoke() {
  const fixture = await createTrackedFixture("semantic-cartographer-auto");
  const recordingDir = join(recordingRoot, "automatic-agent");
  const context = await launchTrackedContext(fixture, recordingDir, {
    extraEnv: {
      SETTA_WORKFLOW_GRAPH_DEBUG: "1",
    },
  });
  const backend = await backendProbe(recordingDir);
  const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
  await createChat(context.client, backend, workspaceId);
  await openWorkflowGraphPane(context.client, { timeoutMs: 30_000 });
  const graphSurfaceId = await maximizeWorkflowGraphPane(context.client, { timeoutMs: 30_000 });
  const rendererMarker = `semantic-cartographer-open-graph-${Date.now()}`;
  await setRendererReloadMarker(context.client, rendererMarker);

  const seeded = await seedAgentWorkflowEvidence(context.client, workspaceId);
  await waitForRenderedSemanticGraphNode(context.client, graphSurfaceId, seedNodeId);
  await assertScriptedCartographerNodeAbsent(context.client, graphSurfaceId);
  const started = await rendererWorkflow(context.client, "startExecution", [
    workspaceId,
    seeded.definition.id,
  ]);
  const execution = await waitForWorkflowExecution(
    context.client,
    workspaceId,
    started.id,
    (value) => value.status === "completed",
  );
  assertWorkflowCompleted(execution);
  assertAgentNodeSucceeded(execution, smokeAgentNodeId);

  const automatic = await waitForAutomaticCartographerApplied({
    client: context.client,
    evidenceAnchorId: seeded.attachment.evidence.id,
    executionId: started.id,
    workspaceId,
  });
  await waitForRenderedSemanticGraphNode(context.client, graphSurfaceId, automatic.nodeId);
  await assertRendererReloadMarker(context.client, rendererMarker);

  await captureScreenshot(context.client, join(recordingDir, "automatic-cartographer.png"));
  await assertSemanticCartographerRecordingEvidence(recordingDir);
  return { automatic, executionId: started.id };
}

async function runLongRunningAutomaticCartographerWorkflow() {
  const fixture = await createTrackedFixture("semantic-cartographer-long");
  const firstRecording = join(recordingRoot, "long-running", "first-launch");
  const secondRecording = join(recordingRoot, "long-running", "second-launch");
  const first = await launchTrackedContext(fixture, firstRecording);
  const backend = await backendProbe(firstRecording);
  const workspaceId = await openWorkspace(first.client, fixture.workspaceRoot, backend);
  await createChat(first.client, backend, workspaceId);

  const seeded = await seedLongRunningWorkflowEvidence(first.client, workspaceId);
  const started = await rendererWorkflow(first.client, "startExecution", [
    workspaceId,
    seeded.definition.id,
  ]);
  const beforeTerminal = await waitForLongRunningCartographerProgress({
    client: first.client,
    executionId: started.id,
    minProcessedWindows: 2,
    requireRunning: true,
    workspaceId,
  });
  const cancelled = await rendererWorkflow(first.client, "cancelExecution", [
    workspaceId,
    started.id,
  ]);
  assertWorkflowTerminal(cancelled, "cancelled", "execution_cancelled");
  await waitForLongRunningCartographerProgress({
    client: first.client,
    executionId: started.id,
    minProcessedWindows: beforeTerminal.processedWindows.length,
    workspaceId,
  });
  await captureScreenshot(first.client, join(firstRecording, "long-running-before-restart.png"));
  await stopTrackedContext(first);

  const second = await launchTrackedContext(fixture, secondRecording);
  await backendProbe(secondRecording);
  const afterRestart = await waitForLongRunningCartographerProgress({
    client: second.client,
    executionId: started.id,
    minProcessedWindows: beforeTerminal.processedWindows.length,
    workspaceId,
  });
  assertProcessedWindowsSurvivedRestart(beforeTerminal, afterRestart);
  await captureScreenshot(second.client, join(secondRecording, "long-running-after-restart.png"));
  await assertLongRunningRecordingEvidence(firstRecording, secondRecording);
  return {
    executionId: started.id,
    processedWindowCount: afterRestart.processedWindows.length,
  };
}

function parseArgs(args) {
  const parsed = {
    artifactDir: "",
    help: false,
    keepArtifacts: false,
    semanticLiveRecordingOnly: false,
    skipBuild: false,
    visible: process.env.SETTA_E2E_VISIBLE === "1",
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const handler = semanticCartographerArgHandlers()[arg];
    if (!handler) {
      throw new Error(`unknown semantic cartographer workflow argument: ${arg}`);
    }
    index += handler(parsed, args, index);
  }
  return parsed;
}

function semanticCartographerArgHandlers() {
  return {
    "--artifact-dir": parseArtifactDirArg,
    "--help": parseHelpArg,
    "--keep-artifacts": parseKeepArtifactsArg,
    "--semantic-live-recording-only": parseSemanticLiveRecordingOnlyArg,
    "--skip-build": parseSkipBuildArg,
    "--visible": parseVisibleArg,
    "-h": parseHelpArg,
  };
}

function parseArtifactDirArg(parsed, args, index) {
  if (!args[index + 1]) {
    throw new Error("--artifact-dir requires a value");
  }
  parsed.artifactDir = resolve(args[index + 1]);
  return 1;
}

function parseHelpArg(parsed) {
  parsed.help = true;
  return 0;
}

function parseKeepArtifactsArg(parsed) {
  parsed.keepArtifacts = true;
  return 0;
}

function parseSemanticLiveRecordingOnlyArg(parsed) {
  parsed.semanticLiveRecordingOnly = true;
  return 0;
}

function parseSkipBuildArg(parsed) {
  parsed.skipBuild = true;
  return 0;
}

function parseVisibleArg(parsed) {
  parsed.visible = true;
  return 0;
}

function semanticCartographerRecordingRoot(parsed) {
  if (parsed.artifactDir !== "") {
    return parsed.artifactDir;
  }
  if (parsed.semanticLiveRecordingOnly) {
    return join(repoRoot, ".recordings", "semantic-live-run", pathTimestamp());
  }
  const base = join(repoRoot, "test-results", "electron-integration", "semantic-cartographer-auto");
  return parsed.keepArtifacts ? join(base, pathTimestamp()) : base;
}

async function seedAgentWorkflowEvidence(client, workspaceId) {
  const graph = workflowGraph(
    [
      workflowControlNode("start", "start"),
      workflowCodexNode(smokeAgentNodeId, "workflow result action"),
      workflowControlNode("end", "end"),
    ],
    [
      workflowEdge("start_agent", "start", smokeAgentNodeId),
      workflowEdge("agent_end", smokeAgentNodeId, "end"),
    ],
  );
  const validation = await rendererWorkflow(client, "validateDefinition", [workspaceId, graph]);
  if (!validation.valid) {
    throw new Error(`automatic cartographer workflow graph invalid: ${JSON.stringify(validation)}`);
  }
  const definition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Automatic cartographer smoke",
    "Agent workflow that feeds the automatic semantic cartographer worker.",
    graph,
  ]);
  const attachment = await seedWorkflowNodeEvidence(client, {
    definitionId: definition.id,
    label: "Automatic cartographer workflow context",
    nodeId: seedNodeId,
    summary: "Definition-level workflow evidence for automatic cartographer processing.",
    workflowNodeId: smokeAgentNodeId,
    workspaceId,
  });
  if (!attachment.evidence?.id) {
    throw new Error(`workflow definition evidence was not attached: ${JSON.stringify(attachment)}`);
  }
  return { attachment, definition };
}

async function seedLongRunningWorkflowEvidence(client, workspaceId) {
  const graph = longRunningWorkflowGraph();
  const validation = await rendererWorkflow(client, "validateDefinition", [workspaceId, graph]);
  if (!validation.valid) {
    throw new Error(
      `long-running cartographer workflow graph invalid: ${JSON.stringify(validation)}`,
    );
  }
  const definition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Long automatic cartographer workflow",
    "Parallel workflow that keeps one agent running while cartographer windows process.",
    graph,
  ]);
  await seedWorkflowNodeEvidence(client, {
    definitionId: definition.id,
    label: "Long cartographer fast branch context",
    nodeId: "semantic_auto_long_fast_context",
    summary: "Evidence for automatic cartographer processing on the fast branch.",
    workflowNodeId: longFastNodeId,
    workspaceId,
  });
  await seedWorkflowNodeEvidence(client, {
    definitionId: definition.id,
    label: "Long cartographer slow branch context",
    nodeId: "semantic_auto_long_slow_context",
    summary: "Evidence for automatic cartographer processing on the slow branch.",
    workflowNodeId: longSlowNodeId,
    workspaceId,
  });
  return { definition };
}

async function seedWorkflowNodeEvidence(
  client,
  { definitionId, label, nodeId, summary, workflowNodeId, workspaceId },
) {
  await rendererSemanticGraph(client, "createNode", [
    {
      actorId: "semantic_auto_e2e",
      actorKind: "user",
      kind: "constraint",
      label,
      nodeId,
      summary,
      workspaceId,
    },
  ]);
  return rendererSemanticGraph(client, "attachWorkflowNode", [
    {
      activityKind: "validating",
      actorId: "semantic_auto_e2e",
      actorKind: "user",
      nodeId,
      summary: "Evidence attached before workflow execution starts.",
      workflowDefinitionId: definitionId,
      workflowExecutionId: "",
      workflowNodeExecutionId: "",
      workflowNodeId,
      workspaceId,
    },
  ]);
}

async function waitForWorkflowExecution(client, workspaceId, executionId, isReady) {
  return waitForBackendState(
    async () => rendererWorkflow(client, "readExecution", [workspaceId, executionId]),
    isReady,
    30_000,
  );
}

function assertWorkflowCompleted(execution) {
  if (execution.status !== "completed" || execution.terminalReason !== "end_reached") {
    throw new Error(`workflow did not complete cleanly: ${JSON.stringify(execution)}`);
  }
}

function assertWorkflowTerminal(execution, status, terminalReason) {
  if (execution.status !== status || execution.terminalReason !== terminalReason) {
    throw new Error(
      `workflow terminal = ${execution.status}/${execution.terminalReason}, want ${status}/${terminalReason}`,
    );
  }
}

function assertAgentNodeSucceeded(execution, nodeId) {
  const nodeExecution = latestNodeExecution(execution, nodeId);
  if (nodeExecution?.status !== "succeeded") {
    throw new Error(`agent node ${nodeId} did not succeed: ${JSON.stringify(execution)}`);
  }
}

async function waitForAutomaticCartographerApplied({
  client,
  evidenceAnchorId,
  executionId,
  workspaceId,
}) {
  const readback = await waitForBackendState(
    async () =>
      rendererSemanticGraph(client, "readCartographerProcessingState", [{}]).then(
        async (state) => ({
          graph: await rendererSemanticGraph(client, "read", [{ workspaceId }]),
          patches: await rendererSemanticGraph(client, "listCartographerPatches", [
            {
              limit: 20,
              runId: "",
              semanticTargetId: "",
              status: "",
              workspaceId,
            },
          ]),
          runs: await rendererSemanticGraph(client, "listCartographerRuns", [
            {
              chatRunId: "",
              limit: 20,
              targetEntityId: "",
              workflowExecutionId: executionId,
              workspaceId,
            },
          ]),
          state,
          windows: await rendererSemanticGraph(client, "listCartographerWindows", [
            {
              chatRunId: "",
              limit: 20,
              runId: "",
              sourceId: "",
              sourceKind: "",
              workflowExecutionId: executionId,
              workspaceId,
            },
          ]),
        }),
      ),
    (value) => automaticCartographerReadbackReady(value),
    30_000,
  );
  const records = requireAutomaticCartographerRecords(readback);
  const detail = await rendererSemanticGraph(client, "readNodeDetail", [
    { nodeId: records.nodeId, workspaceId },
  ]);
  return assertAutomaticCartographerReadback(
    { ...readback, detail },
    records,
    evidenceAnchorId,
    executionId,
  );
}

async function waitForRenderedSemanticGraphNode(client, graphSurfaceId, semanticNodeId) {
  return waitForWorkflowGraphSnapshot(
    client,
    graphSurfaceId,
    (snapshot) => renderedSemanticNodeIds(snapshot).has(semanticNodeId),
    30_000,
  );
}

async function assertScriptedCartographerNodeAbsent(client, graphSurfaceId) {
  const snapshot = await getWorkflowGraphSnapshot(client, graphSurfaceId);
  const nodeId = [...renderedSemanticNodeIds(snapshot)].find((id) =>
    id.startsWith(cartographerNodeIdPrefix),
  );
  if (nodeId) {
    throw new Error(`scripted cartographer node rendered before automatic run: ${nodeId}`);
  }
}

async function waitForWorkflowGraphSnapshot(client, graphSurfaceId, predicate, timeoutMs) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", {
      surfaceId: graphSurfaceId,
    }),
    (value) => value.ready && predicate(value.snapshot),
    timeoutMs,
  ).then((value) => value.snapshot);
}

async function getWorkflowGraphSnapshot(client, graphSurfaceId) {
  await client.installDriver();
  return client.driver("workflowGraphDebugSnapshot", { surfaceId: graphSurfaceId });
}

function renderedSemanticNodeIds(snapshot) {
  const ids = new Set();
  for (const node of snapshot.graph.nodes ?? []) {
    if (typeof node.id === "string" && node.id.startsWith("semantic:")) {
      ids.add(node.id.slice("semantic:".length));
    }
  }
  return ids;
}

async function setRendererReloadMarker(client, marker) {
  await client.evaluate(
    `globalThis.__settaSemanticCartographerOpenGraphMarker = ${JSON.stringify(marker)}`,
  );
}

async function assertRendererReloadMarker(client, marker) {
  const observed = await client.evaluate("globalThis.__settaSemanticCartographerOpenGraphMarker");
  if (observed !== marker) {
    throw new Error(`renderer reloaded while waiting for semantic graph changes: ${observed}`);
  }
}

async function waitForLongRunningCartographerProgress({
  client,
  executionId,
  minProcessedWindows,
  requireRunning = false,
  workspaceId,
}) {
  return waitForBackendState(
    async () => readLongRunningCartographerProgress(client, workspaceId, executionId),
    (value) => longRunningProgressReady(value, minProcessedWindows, requireRunning),
    45_000,
  );
}

async function readLongRunningCartographerProgress(client, workspaceId, executionId) {
  const [execution, graph, runs, state, windows] = await Promise.all([
    rendererWorkflow(client, "readExecution", [workspaceId, executionId]),
    rendererSemanticGraph(client, "read", [{ workspaceId }]),
    rendererSemanticGraph(client, "listCartographerRuns", [
      {
        chatRunId: "",
        limit: 100,
        targetEntityId: "",
        workflowExecutionId: executionId,
        workspaceId,
      },
    ]),
    rendererSemanticGraph(client, "readCartographerProcessingState", [{}]),
    rendererSemanticGraph(client, "listCartographerWindows", [
      {
        chatRunId: "",
        limit: 100,
        runId: "",
        sourceId: "",
        sourceKind: "",
        workflowExecutionId: executionId,
        workspaceId,
      },
    ]),
  ]);
  return {
    execution,
    graph,
    processedWindows: windows.windows.filter((window) => window.status === "processed"),
    runs,
    state,
    windows,
  };
}

function longRunningProgressReady(value, minProcessedWindows, requireRunning) {
  return (
    (!requireRunning || workflowStillRunningOnSlowBranch(value.execution)) &&
    automaticProcessingEnabled(value.state) &&
    value.processedWindows.length >= minProcessedWindows &&
    value.graph.nodes.some(isScriptedCartographerNode) &&
    value.runs.runs.some((run) => run.status === "applied")
  );
}

function automaticProcessingEnabled(state) {
  return state.enabled && state.started;
}

function workflowStillRunningOnSlowBranch(execution) {
  const slow = latestNodeExecution(execution, longSlowNodeId);
  return execution.status === "running" && slow?.status === "running";
}

function assertProcessedWindowsSurvivedRestart(beforeRestart, afterRestart) {
  const afterIds = new Set(afterRestart.processedWindows.map((window) => window.id));
  const missing = beforeRestart.processedWindows.filter((window) => !afterIds.has(window.id));
  if (missing.length > 0) {
    throw new Error(`processed windows missing after restart: ${JSON.stringify(missing)}`);
  }
  if (!afterRestart.graph.nodes.some(isScriptedCartographerNode)) {
    throw new Error(`cartographer node missing after restart: ${JSON.stringify(afterRestart)}`);
  }
}

function automaticCartographerReadbackReady(value) {
  return (
    automaticProcessingIdleWithOutput(value.state) &&
    hasScriptedCartographerFindingPatch(value.patches) &&
    hasScriptedCartographerEdgePatch(value.patches) &&
    hasScriptedCartographerNode(value.graph) &&
    hasScriptedCartographerEdge(value.graph) &&
    hasAppliedCartographerRun(value.runs) &&
    hasProcessedCartographerWindow(value.windows)
  );
}

function automaticProcessingIdleWithOutput(state) {
  return (
    state.enabled &&
    state.started &&
    state.queuedWindowCount === 0 &&
    state.runningWindowCount === 0 &&
    state.lastProcessedWindowId !== "" &&
    state.createdSemanticEventIds.length > 0
  );
}

function hasScriptedCartographerFindingPatch(patches) {
  return patches.patches.some(isAppliedScriptedCartographerFindingPatch);
}

function hasScriptedCartographerEdgePatch(patches) {
  return patches.patches.some(isAppliedScriptedCartographerEdgePatch);
}

function hasScriptedCartographerNode(graph) {
  return graph.nodes.some(isScriptedCartographerNode);
}

function hasScriptedCartographerEdge(graph) {
  return graph.edges.some(
    (edge) =>
      typeof edge.fromNodeId === "string" &&
      edge.fromNodeId.startsWith(cartographerNodeIdPrefix) &&
      edge.toNodeId === seedNodeId,
  );
}

function hasAppliedCartographerRun(runs) {
  return runs.runs.some((run) => run.status === "applied");
}

function hasProcessedCartographerWindow(windows) {
  return windows.windows.some((window) => window.status === "processed");
}

function assertAutomaticCartographerReadback(readback, records, evidenceAnchorId, executionId) {
  assertAutomaticPatch(records.patch);
  assertAutomaticEdgePatch(records.edgePatch, records.nodeId);
  assertAutomaticRun(records.run, executionId);
  assertAutomaticWindow(records.window, records.run.id);
  assertAutomaticSemanticNode(readback, records.nodeId, evidenceAnchorId);
  return records;
}

function requireAutomaticCartographerRecords(readback) {
  const patch = readback.patches.patches.find(isAppliedScriptedCartographerFindingPatch);
  const edgePatch = readback.patches.patches.find(
    (candidate) =>
      isAppliedScriptedCartographerEdgePatch(candidate) && candidate.runId === patch?.runId,
  );
  const run = readback.runs.runs.find((candidate) => candidate.id === patch?.runId);
  const window = readback.windows.windows.find((candidate) => candidate.id === patch?.windowId);
  const nodeId = patch?.patch.payload.newNode?.semanticNodeId ?? "";
  if (!patch || !edgePatch || !run || !window || nodeId === "") {
    throw new Error(`automatic cartographer audit records missing: ${JSON.stringify(readback)}`);
  }
  return { edgePatch, nodeId, patch, run, window };
}

function isAppliedScriptedCartographerPatch(patch) {
  return patch.id.startsWith(cartographerPatchIdPrefix) && patch.status === "applied";
}

function isAppliedScriptedCartographerFindingPatch(patch) {
  return (
    isAppliedScriptedCartographerPatch(patch) &&
    patch.patch.operation === "record_finding" &&
    patch.patch.payload.newNode?.semanticNodeId?.startsWith(cartographerNodeIdPrefix)
  );
}

function isAppliedScriptedCartographerEdgePatch(patch) {
  return (
    isAppliedScriptedCartographerPatch(patch) &&
    patch.patch.operation === "create_edge" &&
    patch.patch.payload.fromNodeId?.startsWith(cartographerNodeIdPrefix) &&
    patch.patch.payload.toNodeId === seedNodeId
  );
}

function isScriptedCartographerNode(node) {
  return node.id.startsWith(cartographerNodeIdPrefix);
}

function assertAutomaticPatch(patch) {
  if (!automaticPatchAppliedFinding(patch)) {
    throw new Error(`automatic cartographer patch mismatch: ${JSON.stringify(patch)}`);
  }
}

function automaticPatchAppliedFinding(patch) {
  return (
    patch.status === "applied" &&
    patch.patch.operation === "record_finding" &&
    patch.createdSemanticEventIds.length > 0
  );
}

function assertAutomaticEdgePatch(patch, nodeId) {
  if (
    patch.status !== "applied" ||
    patch.patch.operation !== "create_edge" ||
    patch.patch.payload.fromNodeId !== nodeId ||
    patch.patch.payload.toNodeId !== seedNodeId ||
    patch.createdSemanticEventIds.length === 0
  ) {
    throw new Error(`automatic cartographer edge patch mismatch: ${JSON.stringify(patch)}`);
  }
}

function assertAutomaticRun(run, executionId) {
  if (!automaticRunAppliedFromExecution(run, executionId)) {
    throw new Error(`automatic cartographer run mismatch: ${JSON.stringify(run)}`);
  }
}

function automaticRunAppliedFromExecution(run, executionId) {
  return (
    run.status === "applied" &&
    run.sourceRefs.workflowExecutionId === executionId &&
    run.harnessKind === "codex" &&
    run.requestId === "scripted-cartographer-request" &&
    run.responseId === "scripted-cartographer-response" &&
    run.rawHarnessResponseHash !== ""
  );
}

function assertAutomaticWindow(window, runId) {
  if (window.status !== "processed" || window.runId !== runId) {
    throw new Error(`automatic cartographer window mismatch: ${JSON.stringify(window)}`);
  }
}

function assertAutomaticSemanticNode(readback, nodeId, evidenceAnchorId) {
  const hasNode = readback.graph.nodes.some((node) => node.id === nodeId);
  const hasSourceLink = readback.graph.sourceLinks.some((link) => link.targetEntityId === nodeId);
  const hasEdge = readback.graph.edges.some(
    (edge) => edge.fromNodeId === nodeId && edge.toNodeId === seedNodeId,
  );
  const hasEvidence = readback.detail.detail.evidence.some(
    (evidence) => evidence.reassignedFromAnchorId === evidenceAnchorId,
  );
  if (!hasNode || !hasSourceLink || !hasEdge || !hasEvidence) {
    throw new Error(`automatic cartographer semantic node mismatch: ${JSON.stringify(readback)}`);
  }
}

async function assertSemanticCartographerRecordingEvidence(recordingDir) {
  await assertRecordingEvidence(recordingDir, {
    backendPaths: [
      "/workspace-session",
      "/chat/conversations/create",
      "/workflows/definitions/validate",
      "/workflows/definitions/create",
      "/workflows/executions/start",
      "/workflows/executions/read",
      "/semantic-graph/nodes/create",
      "/semantic-graph/attachments/workflow-node",
      "/semantic-graph/cartographer/processing/state",
      "/semantic-graph/cartographer/runs/list",
      "/semantic-graph/cartographer/windows/list",
      "/semantic-graph/cartographer/patches/list",
      "/semantic-graph/nodes/detail",
      "/semantic-graph/read",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "workflow:validate-definition",
      "workflow:create-definition",
      "workflow:start-execution",
      "workflow:read-execution",
      "semantic-graph:create-node",
      "semantic-graph:attach-workflow-node",
      "semantic-graph:cartographer-processing-state",
      "semantic-graph:cartographer-run-list",
      "semantic-graph:cartographer-window-list",
      "semantic-graph:cartographer-patch-list",
      "semantic-graph:node-detail",
      "semantic-graph:read",
    ],
  });
}

async function assertLongRunningRecordingEvidence(firstRecording, secondRecording) {
  await assertRecordingEvidence(firstRecording, {
    backendPaths: [
      "/workspace-session",
      "/chat/conversations/create",
      "/workflows/definitions/validate",
      "/workflows/definitions/create",
      "/workflows/executions/start",
      "/workflows/executions/read",
      "/workflows/executions/cancel",
      "/semantic-graph/nodes/create",
      "/semantic-graph/attachments/workflow-node",
      "/semantic-graph/cartographer/processing/state",
      "/semantic-graph/cartographer/runs/list",
      "/semantic-graph/cartographer/windows/list",
      "/semantic-graph/read",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "workflow:validate-definition",
      "workflow:create-definition",
      "workflow:start-execution",
      "workflow:read-execution",
      "workflow:cancel-execution",
      "semantic-graph:create-node",
      "semantic-graph:attach-workflow-node",
      "semantic-graph:cartographer-processing-state",
      "semantic-graph:cartographer-run-list",
      "semantic-graph:cartographer-window-list",
      "semantic-graph:read",
    ],
  });
  await assertRecordingEvidence(secondRecording, {
    backendPaths: [
      "/workflows/executions/read",
      "/semantic-graph/cartographer/processing/state",
      "/semantic-graph/cartographer/runs/list",
      "/semantic-graph/cartographer/windows/list",
      "/semantic-graph/read",
    ],
    ipcChannels: [
      "workflow:read-execution",
      "semantic-graph:cartographer-processing-state",
      "semantic-graph:cartographer-run-list",
      "semantic-graph:cartographer-window-list",
      "semantic-graph:read",
    ],
  });
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function rendererSemanticGraph(client, method, args) {
  return client.evaluate(
    `window.setta.semanticGraph[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

function workflowGraph(nodes, edges) {
  return {
    edges,
    layout: {
      nodes: nodes.map((node, index) => ({
        nodeId: node.id,
        x: index * 260,
        y: 0,
      })),
    },
    nodes,
  };
}

function workflowControlNode(id, kind) {
  return {
    action: null,
    gateway: null,
    id,
    kind,
    loopGuard: null,
    title: id,
  };
}

function workflowCodexNode(id, prompt) {
  return {
    action: {
      codex: {
        freshConversation: true,
        model: "",
        prompt,
        reasoningEffort: "",
      },
      kind: "agent.codex",
    },
    gateway: null,
    id,
    kind: "action",
    loopGuard: null,
    title: id,
  };
}

function workflowGatewayNode(id, kind) {
  return {
    action: null,
    gateway: { requiredIncoming: [] },
    id,
    kind,
    loopGuard: null,
    title: id,
  };
}

function longRunningWorkflowGraph() {
  return workflowGraph(
    [
      workflowControlNode("start", "start"),
      workflowCodexNode(longFastNodeId, "workflow result action"),
      workflowCodexNode(longSlowNodeId, "cancel active workflow"),
      workflowGatewayNode("route", "gateway.or"),
      workflowControlNode("end", "end"),
    ],
    [
      workflowEdge("start_fast", "start", longFastNodeId),
      workflowEdge("start_slow", "start", longSlowNodeId),
      workflowEdge("fast_route", longFastNodeId, "route"),
      workflowEdge("slow_route", longSlowNodeId, "route"),
      workflowEdge("route_end", "route", "end"),
    ],
  );
}

function workflowEdge(id, fromNodeId, toNodeId) {
  return {
    condition: null,
    fromNodeId,
    id,
    kind: "normal",
    toNodeId,
  };
}

function latestNodeExecution(execution, nodeId) {
  return execution.nodeExecutions.filter((nodeExecution) => nodeExecution.nodeId === nodeId).at(-1);
}
