#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
import { writeWorkflowGraphRecordingIncidentReport } from "./workflow-graph-recording-incident-report.mjs";
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
  const trajectoryReport = await assertWorkspaceTrajectoryRuntime({
    client: context.client,
    executionId: started.executionId,
    workspaceId,
  });
  const renderReport = await assertRenderedTrajectorySprites(context.client, graphSurfaceId);
  const popoverReport = await assertActivitySpritePopoverWorkflow({
    client: context.client,
    graphSurfaceId,
  });
  const detailsReport = await assertWorkflowNodeDetails({
    client: context.client,
    graphSurfaceId,
  });
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
    popoverReport,
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
    "chat:run-activity",
    "workspace:open-local-folder",
    "chat:create-conversation",
    "workflow:create-definition",
    "workflow:read-execution",
    "workflow:start-execution",
    "workflow:validate-definition",
    "workspace-trajectory:runtime-snapshot",
  ],
});
await assertActivitySpriteRecordingEvidence(artifactDir);

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
  await client.driver("workflowGraphFitToView", { surfaceId: graphSurfaceId });
  await delay(180);
  const snapshot = await waitForWorkflowGraphSnapshot(
    client,
    graphSurfaceId,
    (candidate) => Number(candidate.render.trajectorySpriteDisplayCount ?? 0) > 0,
    10_000,
  );
  assertInteractiveTrajectoryBadges(snapshot);
  assertTrajectoryBadgesAttachedToWorkflowNodes(snapshot, "initial render");
  const afterZoomOut = await fitTrajectoryBadgeViewport({
    client,
    graphSurfaceId,
    label: "zoom out fit",
    maxFitZoom: 0.35,
    paddingScreenPx: 160,
    snapshot,
  });
  assertTrajectoryBadgesAttachedToWorkflowNodes(afterZoomOut, "zoom out fit");
  const afterZoomIn = await fitTrajectoryBadgeViewport({
    client,
    graphSurfaceId,
    label: "zoom in fit",
    maxFitZoom: 1.15,
    paddingScreenPx: 40,
    snapshot: afterZoomOut,
  });
  assertTrajectoryBadgesAttachedToWorkflowNodes(afterZoomIn, "zoom in fit");

  const trajectoryLayer = snapshot.render.displayObjectCountsByLayer.trajectory;
  return {
    anchoredBadgeCount: visibleTrajectoryBadgeViews(snapshot).length,
    directChildCount: trajectoryLayer.directChildCount,
    interactionMode: snapshot.render.trajectorySpriteInteractionMode,
    recentLaneCount: snapshot.render.trajectorySpriteRecentLaneCount,
    totalCount: trajectoryLayer.totalCount,
    visibleCount: trajectoryLayer.visibleCount,
  };
}

async function fitTrajectoryBadgeViewport({
  client,
  graphSurfaceId,
  label,
  maxFitZoom,
  paddingScreenPx,
  snapshot,
}) {
  await client.driver("workflowGraphFitToView", {
    maxFitZoom,
    paddingScreenPx,
    surfaceId: graphSurfaceId,
  });
  await delay(180);
  return waitForWorkflowGraphSnapshot(
    client,
    graphSurfaceId,
    (candidate) =>
      Number(candidate.render.trajectorySpriteDisplayCount ?? 0) > 0 &&
      cameraChanged(snapshot.camera, candidate.camera),
    5000,
  ).catch((error) => {
    throw new Error(
      `${label} did not change graph camera from ${JSON.stringify(snapshot.camera)}: ${
        error.message
      }`,
    );
  });
}

function assertInteractiveTrajectoryBadges(snapshot) {
  assertInteractiveTrajectoryRenderContract(snapshot.render);
  for (const view of visibleTrajectoryBadgeViews(snapshot)) {
    assertInteractiveTrajectoryBadgeView(view);
  }
}

function assertInteractiveTrajectoryRenderContract(render) {
  if (render.trajectorySpriteInteractionMode !== "retained-hit-targets") {
    throw new Error(
      `trajectory sprites do not expose retained hit targets: ${JSON.stringify(render)}`,
    );
  }
  if (
    render.trajectorySpriteLayerEventMode !== "passive" ||
    render.trajectorySpriteLayerInteractiveChildren !== true
  ) {
    throw new Error(`trajectory sprite layer cannot receive child hits: ${JSON.stringify(render)}`);
  }
  if (render.trajectorySpriteRecentLaneCount !== 0) {
    throw new Error(
      `anchorless trajectory sprites rendered in recent lane: ${JSON.stringify(render)}`,
    );
  }
}

function assertInteractiveTrajectoryBadgeView(view) {
  if (view.runItemId === "") {
    if (view.eventMode !== "none" || (view.cursor !== "" && view.cursor !== "default")) {
      throw new Error(
        `aggregate trajectory badge is incorrectly interactive: ${JSON.stringify(view)}`,
      );
    }
    return;
  }
  if (
    view.eventMode !== "static" ||
    view.interactiveChildren !== false ||
    view.cursor !== "pointer"
  ) {
    throw new Error(
      `trajectory badge is missing an interactive hit target: ${JSON.stringify(view)}`,
    );
  }
}

function assertTrajectoryBadgesAttachedToWorkflowNodes(snapshot, label) {
  const views = visibleTrajectoryBadgeViews(snapshot);
  if (views.length === 0) {
    throw new Error(
      `no visible trajectory badges were present for ${label}: ${JSON.stringify(
        trajectorySpriteDebugReport(snapshot),
      )}`,
    );
  }
  for (const view of views) {
    const node = snapshot.graph.nodes.find((candidate) => candidate.id === view.anchorNodeId);
    if (!node) {
      throw new Error(
        `trajectory badge ${view.id} references a missing node: ${JSON.stringify(view)}`,
      );
    }
    const expected = expectedTrajectoryBadgePosition(snapshot, node, view);
    assertNearlyEqual(view.screenX, expected.x, 1.5, `${label} ${view.id} x`);
    assertNearlyEqual(view.screenY, expected.y, 1.5, `${label} ${view.id} y`);
  }
}

function expectedTrajectoryBadgePosition(snapshot, node, view) {
  return {
    x: node.screenX + (node.width * snapshot.camera.zoom) / 2 + 12,
    y: node.screenY - (node.height * snapshot.camera.zoom) / 2 + 7 + view.rank * 28,
  };
}

function visibleTrajectoryBadgeViews(snapshot) {
  return (snapshot.render.trajectorySpriteViews ?? []).filter(
    (view) =>
      view.visible === true &&
      view.lane === "workflow_node" &&
      typeof view.anchorNodeId === "string" &&
      view.anchorNodeId !== "",
  );
}

async function assertActivitySpritePopoverWorkflow({ client, graphSurfaceId }) {
  await maximizeWorkflowGraphPane(client, { surfaceId: graphSurfaceId, timeoutMs: 30_000 });
  await client.driver("workflowGraphFitToView", { surfaceId: graphSurfaceId });
  const snapshot = await waitForWorkflowGraphSnapshot(
    client,
    graphSurfaceId,
    (candidate) => clickableTrajectoryBadge(candidate) !== null,
    10_000,
  );
  const badge = clickableTrajectoryBadge(snapshot);
  if (badge === null) {
    throw new Error(
      `no clickable trajectory badge was present: ${JSON.stringify(snapshot.render)}`,
    );
  }
  const clickPoint = trajectoryBadgeClickPoint(badge);
  await dispatchRecordedWorkflowGraphMouseClick(
    client,
    graphSurfaceId,
    { kind: "activity-sprite-click", ...clickPoint },
    [],
  );
  const opened = await waitForState(
    client,
    activitySpritePopoverStateExpression(badge.runItemId),
    (state) =>
      state.visible === true &&
      state.runItemId === badge.runItemId &&
      state.activityRows === 1 &&
      state.focusedRows === 1 &&
      state.text.includes("Open full node details"),
    10_000,
  );

  await dispatchPageMouseClick(client, { x: 4, y: 4 });
  await waitForState(
    client,
    activitySpritePopoverStateExpression(badge.runItemId),
    (state) => state.visible === false,
    5000,
  );

  await dispatchRecordedWorkflowGraphMouseClick(
    client,
    graphSurfaceId,
    { kind: "activity-sprite-click", ...clickPoint },
    [],
  );
  await waitForState(
    client,
    activitySpritePopoverStateExpression(badge.runItemId),
    (state) => state.visible === true && state.focusedRows === 1,
    10_000,
  );
  const detailsLinkClicked = await client.evaluate(activitySpriteDetailsLinkClickExpression());
  if (!detailsLinkClicked) {
    throw new Error("activity sprite popover details link was missing");
  }
  const details = await waitForState(
    client,
    workflowNodeDetailsFocusedActivityExpression(badge.runItemId),
    (state) => state.focusedRows === 1 && state.surfaceText.includes("Reviewer"),
    10_000,
  );

  return {
    detailsTextLength: details.text.length,
    popoverTextLength: opened.text.length,
    runItemId: badge.runItemId,
    spriteId: badge.spriteId,
    workflowNodeId: badge.workflowNodeId,
  };
}

function clickableTrajectoryBadge(snapshot) {
  return (
    visibleTrajectoryBadgeViews(snapshot).find(
      (view) =>
        view.runItemId !== "" &&
        view.spriteId !== "" &&
        view.workflowNodeId === reviewerNodeId &&
        pointInsideCanvasPoint({ x: view.screenX, y: view.screenY }, snapshot),
    ) ?? null
  );
}

function trajectoryBadgeClickPoint(badge) {
  return {
    x: badge.screenX + Math.min(Math.max(2, badge.width / 2), badge.width - 2),
    y: badge.screenY + Math.min(Math.max(2, badge.height / 2), badge.height - 2),
  };
}

function activitySpritePopoverStateExpression(runItemId) {
  return `(() => {
    const popover = document.querySelector('[data-testid="workflow-activity-sprite-popover"]');
    if (!popover) {
      return { activityRows: 0, focusedRows: 0, runItemId: "", text: "", visible: false };
    }
    const rows = Array.from(popover.querySelectorAll('[data-agent-run-activity-item="true"]'));
    return {
      activityRows: popover.querySelectorAll('[data-agent-run-activity="true"]').length,
      focusedRows: rows.filter((row) =>
        row.getAttribute("data-run-item-id") === ${JSON.stringify(runItemId)} &&
        row.getAttribute("data-focused-run-activity-item") === "true"
      ).length,
      runItemId: popover.getAttribute("data-run-item-id") ?? "",
      text: popover.innerText,
      visible: true,
    };
  })()`;
}

function activitySpriteDetailsLinkClickExpression() {
  return `(() => {
    const popover = document.querySelector('[data-testid="workflow-activity-sprite-popover"]');
    if (!popover) {
      return false;
    }
    const button = Array.from(popover.querySelectorAll("button")).find((candidate) =>
      candidate.innerText.includes("Open full node details")
    );
    if (!button) {
      return false;
    }
    button.click();
    return true;
  })()`;
}

function workflowNodeDetailsFocusedActivityExpression(runItemId) {
  return `(() => {
    const surface = document.querySelector('[data-testid="workflow-node-details-surface"]');
    const rows = Array.from(document.querySelectorAll('[data-agent-run-activity-item="true"]'));
    return {
      focusedRows: rows.filter((row) =>
        row.getAttribute("data-run-item-id") === ${JSON.stringify(runItemId)} &&
        row.getAttribute("data-focused-run-activity-item") === "true"
      ).length,
      surfaceText: surface?.innerText ?? "",
      text: document.body.innerText,
    };
  })()`;
}

async function dispatchPageMouseClick(client, { x, y }) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x,
    y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x,
    y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x,
    y,
  });
}

function trajectorySpriteDebugReport(snapshot) {
  return {
    anchors: snapshot.render.trajectoryAnchors ?? null,
    displayCount: snapshot.render.trajectorySpriteDisplayCount ?? 0,
    interactionMode: snapshot.render.trajectorySpriteInteractionMode ?? "",
    recentLaneCount: snapshot.render.trajectorySpriteRecentLaneCount ?? 0,
    views: snapshot.render.trajectorySpriteViews ?? null,
  };
}

function assertNearlyEqual(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} mismatch: expected=${expected} actual=${actual}`);
  }
}

function cameraChanged(before, after) {
  return (
    Math.abs(after.x - before.x) > 0.01 ||
    Math.abs(after.y - before.y) > 0.01 ||
    Math.abs(after.zoom - before.zoom) > 0.01
  );
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

function pointInsideCanvasPoint(point, snapshot) {
  return (
    point.x >= 24 &&
    point.y >= 24 &&
    point.x <= snapshot.canvas.clientWidth - 24 &&
    point.y <= snapshot.canvas.clientHeight - 24
  );
}

async function assertActivitySpriteRecordingEvidence(recordingDir) {
  const events = await readJsonLines(join(recordingDir, "renderer-events.jsonl"));
  const spriteInteractions = events.filter(
    (event) => event.type === "graph_interaction" && event.interaction?.kind === "activity_sprite",
  );
  const pointerTap = spriteInteractions.find(
    (event) =>
      event.interaction.reason === "pointertap" &&
      event.interaction.spriteId !== "" &&
      event.interaction.spriteRunItemId !== "" &&
      event.interaction.popoverRunItemId === event.interaction.spriteRunItemId,
  );
  if (!pointerTap) {
    throw new Error(
      `recording missing activity sprite click evidence: ${JSON.stringify(spriteInteractions)}`,
    );
  }
  const detailsLink = spriteInteractions.find(
    (event) =>
      event.interaction.reason === "details_link" &&
      event.interaction.spriteId === pointerTap.interaction.spriteId &&
      event.interaction.spriteRunItemId === pointerTap.interaction.spriteRunItemId &&
      event.interaction.targetNodeId === pointerTap.interaction.sourceNodeId,
  );
  if (!detailsLink) {
    throw new Error(
      `recording missing activity sprite details-link evidence: ${JSON.stringify(
        spriteInteractions,
      )}`,
    );
  }
  await writeWorkflowGraphRecordingIncidentReport({
    artifactDir: recordingDir,
    jsonName: "workflow-graph-sprite-incident-report.json",
    markdownName: "workflow-graph-sprite-incident-report.md",
    requiredIncidents: ["sprite_click"],
  });
}

async function readJsonLines(path) {
  const text = await readFile(path, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  });
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
