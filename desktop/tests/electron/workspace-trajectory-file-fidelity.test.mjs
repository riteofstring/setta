#!/usr/bin/env node
import { mkdir, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
  stopElectron,
  waitForBackendState,
  waitForState,
} from "./chat-workflow-harness.mjs";
import { assertNoCriticalDiagnostics } from "./chat-workflow-assertions.mjs";
import { installFakeCodexAppServer } from "./codex-protocol-workflow.mjs";
import { writeJson } from "./electron-cdp-harness.mjs";
import { openSelectedGraphNodeDetailsFromToolbar } from "./semantic-graph-ui-helpers.mjs";
import {
  rendererWorkflow,
  reviewerNodeId,
  waitForWorkflowExecution,
  waitForWorkflowGraphSnapshot,
  waitForWorkspaceLayout,
  workflowCodexNode,
  workflowControlNode,
  workflowEdge,
  workflowGraph,
} from "./semantic-runtime-phase7-helpers.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";
import { dispatchRecordedWorkflowGraphMouseClick } from "./workflow-graph-performance-recording.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const options = parseArgs(process.argv.slice(2));
const artifactDir =
  options.artifactDir ||
  join(
    repoRoot,
    "test-results",
    "electron-integration",
    "workspace-trajectory-file-fidelity",
    ...(options.keepArtifacts ? [pathTimestamp()] : []),
  );

configureChatWorkflowHarness({ visible: options.visible });

if (options.help) {
  process.stdout.write(
    "Usage: node desktop/tests/electron/workspace-trajectory-file-fidelity.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.stdout.write("\n");
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

await rm(artifactDir, { force: true, recursive: true });
await mkdir(artifactDir, { recursive: true });

const fixture = await createFixture("workspace-trajectory-file-fidelity");
await seedWorkspaceFile(fixture.workspaceRoot);
const fakeCodex = await installFakeCodexAppServer(fixture);
const context = await launchContext(fixture, artifactDir, {
  extraEnv: {
    PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
    SETTA_E2E_DISABLE_AUTOMATIC_CARTOGRAPHER: "1",
    SETTA_WORKFLOW_GRAPH_DEBUG: "1",
  },
  harness: "codex",
});

let failure = null;
try {
  const backend = await backendProbe(artifactDir);
  const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
  await waitForWorkspaceLayout(context.client);
  await disableAutomaticCartographer(context.client, workspaceId);
  await createChat(context.client, backend, workspaceId);

  const definition = await createProtocolWorkflow(context.client, workspaceId);
  await reloadRenderer(context.client);
  await waitForWorkspaceLayout(context.client);
  await openWorkflowGraphPane(context.client, { timeoutMs: 30_000 });
  let graphSurfaceId = await maximizeWorkflowGraphPane(context.client, { timeoutMs: 30_000 });
  await waitForWorkflowGraphSnapshot(
    context.client,
    graphSurfaceId,
    (snapshot) => snapshot.graph.nodes.some((node) => node.id === reviewerNodeId),
    30_000,
  );

  const started = await context.client.driver("runWorkflowDraftForSurface", {
    definitionId: definition.id,
    surfaceId: graphSurfaceId,
  });
  if (!started.ok || started.executionId === "") {
    throw new Error(`workflow run did not start: ${JSON.stringify(started)}`);
  }
  graphSurfaceId = started.surfaceId || graphSurfaceId;
  graphSurfaceId =
    (await maximizeWorkflowGraphPane(context.client, {
      surfaceId: graphSurfaceId,
      timeoutMs: 30_000,
    })) || graphSurfaceId;
  await waitForWorkflowGraphSnapshot(
    context.client,
    graphSurfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.executionId === started.executionId &&
      snapshot.graph.workflow?.viewMode === "run",
    30_000,
  );

  const activeExecution = await waitForWorkflowExecution(
    context.client,
    workspaceId,
    started.executionId,
    (candidate) =>
      runnerRefsForNode(candidate, reviewerNodeId).some((ref) => ref.kind === "chat.run"),
  );
  const runnerRefs = runnerRefsForNode(activeExecution, reviewerNodeId);
  const runId = runnerRefId(runnerRefs, "chat.run");
  const conversationId = runnerRefId(runnerRefs, "chat.conversation");

  const activityReport = await assertTypedFileActivity({
    backend,
    conversationId,
    runId,
    workspaceId,
  });
  const detailsReport = await assertWorkflowNodeDetails({
    client: context.client,
    graphSurfaceId,
  });
  const trajectoryReport = await assertWorkspaceTrajectoryRuntime({
    client: context.client,
    executionId: started.executionId,
    workspaceId,
  });
  const renderReport = await assertRenderedTrajectorySprites(context.client, graphSurfaceId);
  const execution = await waitForWorkflowExecution(
    context.client,
    workspaceId,
    started.executionId,
    (candidate) => candidate.status === "completed",
  );
  await assertNoCriticalDiagnostics(backend, workspaceId, conversationId);
  await captureScreenshot(context.client, join(artifactDir, "success.png"));
  await writeJson(join(artifactDir, "workspace-trajectory-file-fidelity-report.json"), {
    activityReport,
    detailsReport,
    executionId: execution.id,
    renderReport,
    trajectoryReport,
  });
} catch (error) {
  failure = error;
  await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
} finally {
  context.client?.close();
  await stopElectron(context.electron);
  if (!options.keepArtifacts) {
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }
}

if (failure !== null) {
  throw failureWithLogs(failure, context.electron.logs);
}

await assertRecordingEvidence(artifactDir, {
  backendPaths: [
    "/workspaces/open",
    "/chat/conversations/create",
    "/chat/runs/activity",
    "/workflows/definitions/create",
    "/workflows/definitions/validate",
    "/workflows/executions/read",
    "/workflows/executions/start",
    "/workspace-trajectory/runtime/snapshot",
  ],
  ipcChannels: [
    "workspace:open-local-folder",
    "chat:create-conversation",
    "workflow:create-definition",
    "workflow:read-execution",
    "workflow:start-execution",
    "workflow:validate-definition",
    "workspace-trajectory:runtime-snapshot",
  ],
});

process.stdout.write(`workspace trajectory file fidelity passed: ${artifactDir}\n`);

function parseArgs(args) {
  const parsed = {
    artifactDir: "",
    help: false,
    keepArtifacts: false,
    skipBuild: false,
    visible: process.env.SETTA_E2E_VISIBLE === "1",
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--artifact-dir":
        if (!args[index + 1]) {
          throw new Error("--artifact-dir requires a value");
        }
        parsed.artifactDir = resolve(args[index + 1]);
        index += 1;
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--keep-artifacts":
        parsed.keepArtifacts = true;
        break;
      case "--skip-build":
        parsed.skipBuild = true;
        break;
      case "--visible":
        parsed.visible = true;
        break;
      default:
        throw new Error(`unknown workspace trajectory workflow argument: ${arg}`);
    }
  }
  return parsed;
}

async function seedWorkspaceFile(workspaceRoot) {
  await writeFile(join(workspaceRoot, "main.go"), "package main\n\nfunc main() {}\n", "utf8");
}

async function createProtocolWorkflow(client, workspaceId) {
  const graph = workflowGraph(
    [
      workflowControlNode("start", "start", "Start"),
      workflowCodexNode(reviewerNodeId, "trajectory file fidelity workflow", "Reviewer"),
      workflowControlNode("end", "end", "End"),
    ],
    [
      workflowEdge("start_reviewer", "start", reviewerNodeId),
      workflowEdge("reviewer_end", reviewerNodeId, "end"),
    ],
  );
  const validation = await rendererWorkflow(client, "validateDefinition", [workspaceId, graph]);
  if (!validation.valid) {
    throw new Error(`workspace trajectory workflow invalid: ${JSON.stringify(validation)}`);
  }
  return rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Workspace trajectory file fidelity",
    "Deterministic workflow for typed file operation trajectory coverage.",
    graph,
  ]);
}

async function reloadRenderer(client) {
  try {
    await client.call("Page.reload", { ignoreCache: true });
  } catch (error) {
    if (!String(error?.message ?? error).includes("navigated")) {
      throw error;
    }
  }
  await delay(250);
}

async function disableAutomaticCartographer(client, workspaceId) {
  const record = await client.evaluate("window.setta.semanticGraph.readCartographerSettings({})");
  await client.evaluate(
    `window.setta.semanticGraph.updateCartographerSettings(${JSON.stringify({
      settings: {
        auditConfig: record.settings.auditConfig,
        automaticProcessingEnabled: false,
        finalSynthesisTaskConfig: record.settings.finalSynthesisTaskConfig,
        liveTaskConfig: record.settings.liveTaskConfig,
        observationConfig: record.settings.observationConfig,
        processingConfig: record.settings.processingConfig,
      },
      workspaceId,
    })})`,
  );
}

async function assertTypedFileActivity({ backend, conversationId, runId, workspaceId }) {
  const page = await waitForBackendState(
    () => backend.post("/chat/runs/activity", { limit: 100, runId, workspaceId }),
    (candidate) =>
      hasTypedFileOperation(candidate.items, "dynamic_tool_call", "read_workspace_file", {
        operation: "read",
        path: "main.go",
        rangeEnd: 3,
        rangeStart: 1,
      }) &&
      hasTypedFileOperation(candidate.items, "file_change", "", {
        additions: 1,
        deletions: 1,
        operation: "write",
        path: "/tmp/workspace/main.go",
      }) &&
      hasTypedFileOperation(candidate.items, "diff", "", {
        additions: 1,
        deletions: 1,
        operation: "diff",
        path: "main.go",
      }),
    10_000,
  );
  const diagnostics = await backend.post("/chat/diagnostics/list", {
    conversationId,
    runId,
    workspaceId,
  });
  return {
    diagnosticCount: diagnostics.diagnostics.length,
    itemCount: page.items.length,
    typedItemIds: page.items
      .filter((item) => (item.fileOperations ?? []).length > 0)
      .map((item) => item.id),
  };
}

async function assertWorkspaceTrajectoryRuntime({ client, executionId, workspaceId }) {
  const snapshot = await waitForState(
    client,
    `window.setta.workspaceTrajectory.readRuntimeSnapshot(${JSON.stringify({
      chatRunId: "",
      limit: 80,
      workflowExecutionId: executionId,
      workspaceId,
    })})`,
    (candidate) =>
      candidate.sprites?.some((sprite) => spriteMatches(sprite, "file_read", "read", "main.go")) &&
      candidate.sprites?.some((sprite) =>
        spriteMatches(sprite, "file_write", "write", "/tmp/workspace/main.go"),
      ) &&
      candidate.sprites?.some((sprite) => spriteMatches(sprite, "diff", "diff", "main.go")),
    10_000,
  );
  assertNoSyntheticFileRefs(snapshot.sprites);
  return {
    revision: snapshot.revision,
    spriteCount: snapshot.sprites.length,
    typedSprites: snapshot.sprites
      .filter((sprite) => ["file_read", "file_write", "diff"].includes(sprite.kind))
      .map((sprite) => ({
        fileRefs: sprite.fileRefs,
        id: sprite.id,
        kind: sprite.kind,
        title: sprite.title,
      })),
  };
}

async function assertRenderedTrajectorySprites(client, graphSurfaceId) {
  const snapshot = await waitForWorkflowGraphSnapshot(
    client,
    graphSurfaceId,
    (candidate) => (candidate.render.displayObjectCountsByLayer?.trajectory?.visibleCount ?? 0) > 1,
    10_000,
  );
  const trajectoryLayer = snapshot.render.displayObjectCountsByLayer.trajectory;
  return {
    directChildCount: trajectoryLayer.directChildCount,
    totalCount: trajectoryLayer.totalCount,
    visibleCount: trajectoryLayer.visibleCount,
  };
}

async function assertWorkflowNodeDetails({ client, graphSurfaceId }) {
  await maximizeWorkflowGraphPane(client, { surfaceId: graphSurfaceId, timeoutMs: 30_000 });
  await client.driver("workflowGraphFitToView", { surfaceId: graphSurfaceId });
  const graphSnapshot = await waitForWorkflowGraphSnapshot(
    client,
    graphSurfaceId,
    (snapshot) =>
      snapshot.graph.nodes.some(
        (node) =>
          node.id === reviewerNodeId && node.materialized && pointInsideCanvas(node, snapshot),
      ),
    30_000,
  );
  const reviewer = graphSnapshot.graph.nodes.find((node) => node.id === reviewerNodeId);
  await dispatchRecordedWorkflowGraphMouseClick(
    client,
    graphSurfaceId,
    { x: reviewer.screenX, y: reviewer.screenY },
    [],
  );
  await waitForWorkflowGraphSnapshot(
    client,
    graphSurfaceId,
    (snapshot) => snapshot.interaction.selectedNodeId === reviewerNodeId,
    5000,
  );
  await openSelectedGraphNodeDetailsFromToolbar(client, "Reviewer");
  const details = await waitForState(
    client,
    `(() => ({ text: document.querySelector('[data-testid="workflow-node-details-surface"]')?.innerText ?? "" }))()`,
    (value) =>
      value.text.includes("TRAJECTORY") &&
      value.text.includes("file read") &&
      value.text.includes("read main.go:1-3") &&
      value.text.includes("file write") &&
      value.text.includes("write /tmp/workspace/main.go +1 -1") &&
      value.text.includes("diff"),
    10_000,
  );
  return { textLength: details.text.length };
}

function hasTypedFileOperation(items, type, toolName, expected) {
  return items.some((item) => {
    if (item.type !== type) {
      return false;
    }
    if (toolName !== "" && item.toolName !== toolName) {
      return false;
    }
    return (item.fileOperations ?? []).some((operation) =>
      Object.entries(expected).every(([key, value]) => operation[key] === value),
    );
  });
}

function spriteMatches(sprite, kind, operation, path) {
  return (
    sprite.kind === kind &&
    (sprite.fileRefs ?? []).some((file) => file.operation === operation && file.path === path)
  );
}

function assertNoSyntheticFileRefs(sprites) {
  for (const sprite of sprites) {
    if (!["command", "tool_call"].includes(sprite.kind)) {
      continue;
    }
    if ((sprite.fileRefs ?? []).length > 0) {
      throw new Error(`untyped sprite gained synthetic file refs: ${JSON.stringify(sprite)}`);
    }
  }
}

function runnerRefsForNode(execution, nodeId) {
  const nodeExecution = execution.nodeExecutions
    .filter((candidate) => candidate.nodeId === nodeId)
    .at(-1);
  return nodeExecution?.runnerRefs ?? [];
}

function runnerRefId(refs, kind) {
  const ref = refs.find((candidate) => candidate.kind === kind);
  if (!ref?.id) {
    throw new Error(`workflow runner ref ${kind} missing: ${JSON.stringify(refs)}`);
  }
  return ref.id;
}

function pointInsideCanvas(node, snapshot) {
  return (
    node.screenX >= 24 &&
    node.screenY >= 24 &&
    node.screenX <= snapshot.canvas.clientWidth - 24 &&
    node.screenY <= snapshot.canvas.clientHeight - 24
  );
}
