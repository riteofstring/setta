/* global console */

import { spawn } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { chatTextInput } from "./chat-input-helpers.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  reloadPage,
  repoRoot,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import {
  dispatchWorkflowGraphMouseDrag,
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
  pagePointForCanvasPoint,
} from "./workflow-graph-layout-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const seedConstraintNodeId = "semantic_seed_constraint";
const seedCartographerPatchId = "semantic_seed_cartographer_patch_pending";
const seedWorkflowExecutionId = "semantic_seed_workflow_execution";
const seedRendererNodeId = `semantic:${seedConstraintNodeId}`;
const cartographerAuditBurstSize = 6;
const semanticNodeDragDelta = { x: 92, y: 44 };
const semanticNodeDetailsRequiredText = [
  "Deterministic layout writes stay read-only",
  "supports",
  "refutes",
  "resolves",
  "Phase 2 plan excerpt",
  "validating",
  "Keep semantic graph rendering read-only",
  "context_pack.created",
  "workflow_agent_start",
  "Renderer read-only semantic graph surface",
  "active workspace constraint",
  "sha256:semantic_seed_delivered_context",
  "Delivered Context",
  "88",
  "Cartographer",
  "Cartographer pending review evidence",
  "attach_evidence",
  "Seed cartographer window summary",
  "semantic_seed_workflow_events:3",
];

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/semantic-graph-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("semantic-graph");
await writeLatestRecordingPointer("semantic-graph", artifactDir);
const fixture = await createElectronFixture("semantic-graph");
let context = null;
let workflowGraphSurfaceId = null;

try {
  await seedSemanticGraphFixture(fixture);

  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_E2E_DISABLE_AUTOMATIC_CARTOGRAPHER: "1",
      SETTA_WORKFLOW_GRAPH_DEBUG: "1",
    },
    fixture,
    visible: options.visible,
  });

  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const workspaceId = await selectedWorkspaceId(context.client);
  await openWorkflowGraphPane(context.client);
  await waitForSelector(context.client, '[data-testid="workflow-graph"]');
  workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client);

  const initial = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.visual.hasNonBackgroundPixels &&
      semanticNodes(snapshot).length >= 4 &&
      semanticEdges(snapshot).length >= 3,
  );
  assertSemanticGraphVisible(initial);
  assertRendererLifecycleDebug(initial, "initial semantic graph");
  await captureScreenshot(context.client, join(artifactDir, "semantic-initial.png"));

  const auditBurst = await buildCartographerAuditBurst(context.client, workspaceId);
  assertCartographerAuditBurst(auditBurst);
  const afterAuditBurst = await getWorkflowGraphSnapshot(context.client);
  assertRendererStableWithoutGraphUpdate(initial, afterAuditBurst, "cartographer audit burst");

  const targetNode = nodeById(afterAuditBurst, seedRendererNodeId);
  await dispatchWorkflowGraphMouseDoubleClick(context.client, workflowGraphSurfaceId, {
    x: targetNode.screenX,
    y: targetNode.screenY,
  });
  await waitForSelector(context.client, '[data-testid="semantic-node-details-surface"]');
  await assertSemanticNodeDetails(context.client);
  await assertSeedContextPackReadApis(context.client, workspaceId);
  await assertSeedCartographerReadApis(context.client, workspaceId, "pending_review");
  const processedCartographer = await assertProcessCartographerWindowApi(
    context.client,
    workspaceId,
  );
  await acceptSeedCartographerPatchFromDetails(context.client);
  await assertSeedCartographerReadApis(context.client, workspaceId, "applied");
  await assertProcessedCartographerReadback(context.client, workspaceId, processedCartographer);
  await captureScreenshot(context.client, join(artifactDir, "semantic-details.png"));

  const attachment = await attachSemanticNodeToChatRun(context.client, workspaceId);
  assertSemanticChatRunAttachment(attachment);
  const beforeGraphMutationBurst = await getWorkflowGraphSnapshot(context.client);
  const editing = await exerciseSemanticEditing(context.client, workspaceId);
  assertSemanticEditingResult(editing);
  const afterGraphMutationBurst = await waitForWorkflowGraphSnapshot(
    context.client,
    (snapshot) =>
      snapshot.render.graphUpdateCount > beforeGraphMutationBurst.render.graphUpdateCount &&
      snapshot.graph.nodes.some((node) => node.id === "semantic:semantic_e2e_merged"),
  );
  assertRendererStableForGraphUpdate(
    beforeGraphMutationBurst,
    afterGraphMutationBurst,
    "semantic editing graph refresh",
  );
  const beforeHistory = await semanticEventHistory(context.client, workspaceId);
  assertSemanticAttachmentHistory(beforeHistory, attachment);

  workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client, {
    surfaceId: workflowGraphSurfaceId,
  });
  const beforeDrag = await waitForWorkflowGraphSnapshot(context.client, (snapshot) =>
    snapshot.graph.nodes.some((node) => node.id === seedRendererNodeId),
  );
  const targetNodeForDrag = nodeById(beforeDrag, seedRendererNodeId);
  await dispatchWorkflowGraphMouseDrag(context.client, workflowGraphSurfaceId, {
    from: { x: targetNodeForDrag.screenX, y: targetNodeForDrag.screenY },
    steps: 14,
    to: {
      x: targetNodeForDrag.screenX + semanticNodeDragDelta.x,
      y: targetNodeForDrag.screenY + semanticNodeDragDelta.y,
    },
  });
  await delay(200);
  const afterDrag = await waitForWorkflowGraphSnapshot(context.client, (snapshot) => {
    const moved = snapshot.graph.nodes.find((node) => node.id === seedRendererNodeId);
    return Boolean(
      moved &&
      Math.abs(moved.x - targetNodeForDrag.x) >= 40 &&
      Math.abs(moved.y - targetNodeForDrag.y) >= 20,
    );
  });
  const movedNode = nodeById(afterDrag, seedRendererNodeId);
  const persistedPosition = { x: Math.round(movedNode.x), y: Math.round(movedNode.y) };
  await waitForSemanticLayoutPosition(context.client, workspaceId, persistedPosition);

  const afterDragHistory = await semanticEventHistory(context.client, workspaceId);
  assertEventHistoryUnchanged(beforeHistory, afterDragHistory, "semantic layout drag");

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await openWorkflowGraphPane(context.client);
  await waitForSelector(context.client, '[data-testid="workflow-graph"]');
  workflowGraphSurfaceId = await maximizeWorkflowGraphPane(context.client, {
    surfaceId: workflowGraphSurfaceId,
  });
  const afterReload = await waitForWorkflowGraphSnapshot(context.client, (snapshot) => {
    const reloaded = snapshot.graph.nodes.find((node) => node.id === seedRendererNodeId);
    return Boolean(
      reloaded &&
      reloaded.x === persistedPosition.x &&
      reloaded.y === persistedPosition.y &&
      semanticEdges(snapshot).length >= 3,
    );
  });
  assertSemanticPosition(afterReload, persistedPosition);

  const afterReloadHistory = await semanticEventHistory(context.client, workspaceId);
  assertEventHistoryUnchanged(beforeHistory, afterReloadHistory, "semantic layout reload");

  const reloadedNode = nodeById(afterReload, seedRendererNodeId);
  await dispatchWorkflowGraphMouseDoubleClick(context.client, workflowGraphSurfaceId, {
    x: reloadedNode.screenX,
    y: reloadedNode.screenY,
  });
  await waitForSelector(context.client, '[data-testid="semantic-node-details-surface"]');
  await assertSemanticNodeDetails(context.client);
  await assertSeedContextPackReadApis(context.client, workspaceId);
  await assertSeedCartographerReadApis(context.client, workspaceId, "applied");
  await assertProcessedCartographerReadback(context.client, workspaceId, processedCartographer);
  await assertSemanticAttachmentDetails(context.client, attachment);
  await assertSemanticEditingReadback(context.client, workspaceId, editing);
  await captureScreenshot(context.client, join(artifactDir, "semantic-attached-details.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    attachment,
    afterDrag,
    afterAuditBurst,
    afterGraphMutationBurst,
    afterReload,
    artifactDir,
    auditBurst,
    beforeHistoryCount: beforeHistory.events.length,
    editing,
    initial,
    persistedPosition,
    processedCartographer,
    status: "passed",
    workspaceId,
  });
  console.log(`semantic graph workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await getWorkflowGraphSnapshot(context.client)
      .then((snapshot) => writeJson(join(artifactDir, "failure-snapshot.json"), snapshot))
      .catch(() => {});
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

async function seedSemanticGraphFixture({ appDataDir, workspaceRoot }) {
  const { code, output } = await spawnForOutput(
    join(repoRoot, "scripts", "go.sh"),
    [
      "run",
      "./cmd/seed-semantic-graph-dev",
      "--app-data-dir",
      appDataDir,
      "--workspace-root",
      workspaceRoot,
    ],
    { cwd: repoRoot },
  );
  if (code !== 0) {
    throw new Error(`semantic graph seed failed with code ${code}: ${output}`);
  }
}

function spawnForOutput(command, args, { cwd }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`semantic graph seed exited by signal ${signal}: ${output}`));
        return;
      }
      resolvePromise({ code: code ?? 1, output });
    });
  });
}

async function attachSemanticNodeToChatRun(client, workspaceId) {
  return client.driver("semanticGraphAttachNodeToChatRun", {
    chatInput: chatTextInput(
      "Attach this deterministic chat run to the seeded semantic graph node.",
    ),
    workspaceId,
  });
}

async function exerciseSemanticEditing(client, workspaceId) {
  return client.driver("semanticGraphExerciseEditing", { workspaceId });
}

async function selectedWorkspaceId(client) {
  await client.installDriver();
  const session = await waitForState(
    client,
    driverCallExpression("workflowWorkspaceSessionState"),
    (value) => value.selectedWorkspaceId !== "",
  );
  return session.selectedWorkspaceId;
}

async function waitForWorkflowGraphSnapshot(client, predicate) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", {
      surfaceId: workflowGraphSurfaceId,
    }),
    (value) => value.ready && predicate(value.snapshot),
  ).then((value) => value.snapshot);
}

async function getWorkflowGraphSnapshot(client) {
  return client.driver("workflowGraphDebugSnapshot", { surfaceId: workflowGraphSurfaceId });
}

async function buildCartographerAuditBurst(client, workspaceId) {
  return client.driver("semanticGraphBuildCartographerAuditBurst", {
    burstSize: cartographerAuditBurstSize,
    workspaceId,
  });
}

async function dispatchWorkflowGraphMouseDoubleClick(client, surfaceId, point) {
  const pagePoint = await pagePointForCanvasPoint(client, surfaceId, point);
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: pagePoint.x,
    y: pagePoint.y,
  });
  await clickAtPagePoint(client, pagePoint, 1);
  await delay(40);
  await clickAtPagePoint(client, pagePoint, 2);
}

async function clickAtPagePoint(client, point, clickCount) {
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await delay(16);
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount,
    type: "mouseReleased",
    x: point.x,
    y: point.y,
  });
}

async function assertSemanticNodeDetails(client) {
  const details = await waitForState(
    client,
    driverCallExpression("semanticGraphNodeDetailsText"),
    (value) => textIncludesAll(value.text, semanticNodeDetailsRequiredText),
  );
  if (!details.text.includes("docs/plans/setta_semantic_work_graph_implementation_plan.md")) {
    throw new Error(`semantic node details omitted evidence path: ${details.text}`);
  }
}

async function assertSeedContextPackReadApis(client, workspaceId) {
  const result = await client.driver("semanticGraphReadSeedContextPack", { workspaceId });
  const pack = result.read?.pack ?? null;
  if (!isSeedContextPack(pack)) {
    throw new Error(`semantic context pack read/list mismatch: ${JSON.stringify(result)}`);
  }
}

function isSeedContextPack(pack) {
  return Boolean(
    pack &&
    [
      pack.id === "semantic_seed_context_phase2",
      pack.triggerKind === "workflow_agent_start",
      pack.targetEntityId === seedConstraintNodeId,
      pack.itemCount === 1,
      pack.items[0]?.title === "Renderer read-only semantic graph surface",
      pack.deliveredContext.includes("Renderer read-only semantic graph surface"),
    ].every(Boolean),
  );
}

async function assertSeedCartographerReadApis(client, workspaceId, expectedStatus) {
  const result = await waitForState(
    client,
    driverCallExpression("semanticGraphReadSeedCartographerState", { workspaceId }),
    (value) => value.patch?.status === expectedStatus,
  );
  const patch = requireSeedCartographerPatch(result);
  assertSeedCartographerPatchSummary(patch);
  assertSeedCartographerRunReadback(result, patch);
  assertSeedCartographerWindowReadback(result, patch);
  assertSeedCartographerCursorReadback(result);
  assertSeedCartographerDetailReadback(result, patch);
  await assertSeedCartographerReviewState(client, result, expectedStatus);
}

function requireSeedCartographerPatch(result) {
  const patch = result.patch;
  if (!patch || patch.patch.operation !== "attach_evidence") {
    throw new Error(`seed cartographer patch mismatch: ${JSON.stringify(result.patches)}`);
  }
  return patch;
}

function assertSeedCartographerPatchSummary(patch) {
  if (!patch.patch.publicSummary.includes("Cartographer pending review evidence")) {
    throw new Error(`seed cartographer patch summary mismatch: ${JSON.stringify(patch)}`);
  }
}

function assertSeedCartographerRunReadback(result, patch) {
  if (result.run?.run?.id !== patch.runId || result.run.run.windowId !== patch.windowId) {
    throw new Error(`seed cartographer run read mismatch: ${JSON.stringify(result.run)}`);
  }
  if (!result.runs.runs.some((run) => run.id === patch.runId)) {
    throw new Error(`seed cartographer run list omitted run: ${JSON.stringify(result.runs)}`);
  }
}

function assertSeedCartographerWindowReadback(result, patch) {
  if (!result.windows.windows.some((window) => window.id === patch.windowId)) {
    throw new Error(
      `seed cartographer window list omitted window: ${JSON.stringify(result.windows)}`,
    );
  }
}

function assertSeedCartographerCursorReadback(result) {
  if (
    !result.cursors.cursors.some(
      (cursor) =>
        cursor.workflowExecutionId === seedWorkflowExecutionId &&
        cursor.lastWorkflowEventCursor === "semantic_seed_workflow_events:3",
    )
  ) {
    throw new Error(
      `seed cartographer cursor list omitted cursor: ${JSON.stringify(result.cursors)}`,
    );
  }
}

function assertSeedCartographerDetailReadback(result, patch) {
  const detail = result.detail.detail;
  if (!detail || !detail.cartographerPatches.some((candidate) => candidate.id === patch.id)) {
    throw new Error(`semantic detail omitted cartographer patch: ${JSON.stringify(result.detail)}`);
  }
}

async function assertSeedCartographerReviewState(client, result, expectedStatus) {
  if (expectedStatus === "pending_review") {
    await assertSeedCartographerPendingUi(client);
    return;
  }
  assertSeedCartographerAppliedReadback(result);
}

async function assertSeedCartographerPendingUi(client) {
  await waitForState(
    client,
    driverCallExpression("semanticGraphNodeDetailsText"),
    (value) =>
      value.text.includes("pending_review") &&
      value.text.includes("Accept") &&
      value.text.includes("Reject"),
  );
}

function assertSeedCartographerAppliedReadback(result) {
  const detail = result.detail.detail;
  if (!detail) {
    throw new Error(
      `semantic detail missing after cartographer accept: ${JSON.stringify(result.detail)}`,
    );
  }
  const patch = detail.cartographerPatches.find(
    (candidate) => candidate.id === seedCartographerPatchId,
  );
  if (!patch || patch.status !== "applied" || patch.createdSemanticEventIds.length === 0) {
    throw new Error(`cartographer patch was not applied in detail: ${JSON.stringify(patch)}`);
  }
  if (
    !detail.evidence.some(
      (evidence) => evidence.reassignedFromAnchorId === "semantic_seed_evidence_plan",
    )
  ) {
    throw new Error(
      `cartographer accept did not copy evidence: ${JSON.stringify(detail.evidence)}`,
    );
  }
  if (
    !result.history.events.some(
      (event) => event.modelInfo?.cartographer_patch_id === seedCartographerPatchId,
    )
  ) {
    throw new Error(
      `cartographer accept event missing from history: ${JSON.stringify(result.history)}`,
    );
  }
}

async function assertBuildCartographerWindowApiWithSourceRefs(client, workspaceId, sourceRefs) {
  const result = await client.driver("semanticGraphBuildCartographerWindow", {
    sourceRefs,
    workspaceId,
  });
  if (
    result.run.status !== "pending" ||
    result.window.status !== "closed" ||
    result.window.runId !== result.run.id ||
    !result.summary?.summary.includes("E2E cartographer build current progress")
  ) {
    throw new Error(`cartographer build result mismatch: ${JSON.stringify(result)}`);
  }
  return result;
}

async function assertProcessCartographerWindowApi(client, workspaceId) {
  const setup = await attachChatRunEvidenceForProcessedCartographerWindow(client, workspaceId);
  const built = await assertBuildCartographerWindowApiWithSourceRefs(client, workspaceId, {
    chatConversationId: "",
    chatMessageId: "",
    chatRunId: setup.chatRunId,
    runItemId: "",
    workflowDefinitionId: "",
    workflowExecutionId: "",
    workflowNodeExecutionId: "",
    workflowNodeId: "",
  });
  const processed = await client.driver("semanticGraphProcessCartographerWindow", {
    windowId: built.window.id,
    workspaceId,
  });
  assertProcessedCartographerResult(processed, built);
  return {
    evidenceAnchorId: setup.evidenceAnchorId,
    nodeId: processed.patches[0].patch.payload.newNode.semanticNodeId,
    patchId: processed.patches[0].id,
    runId: processed.run.id,
    windowId: processed.window.id,
  };
}

async function attachChatRunEvidenceForProcessedCartographerWindow(client, workspaceId) {
  return client.driver("semanticGraphAttachChatRunEvidenceForProcessedCartographerWindow", {
    chatInput: chatTextInput("Create deterministic evidence for semantic cartographer processing."),
    workspaceId,
  });
}

function assertProcessedCartographerResult(processed, built) {
  assertProcessedCartographerRunResult(processed.run, built.run.id);
  assertProcessedCartographerWindowResult(processed.window, built.window.id);
  assertProcessedCartographerPatchResult(processed);
}

function assertProcessedCartographerRunResult(run, expectedRunId) {
  if (
    run.id !== expectedRunId ||
    run.status !== "applied" ||
    run.harnessKind !== "codex" ||
    run.requestId !== "scripted-cartographer-request" ||
    run.responseId !== "scripted-cartographer-response" ||
    !run.rawHarnessResponseHash
  ) {
    throw new Error(`cartographer process run mismatch: ${JSON.stringify(run)}`);
  }
}

function assertProcessedCartographerWindowResult(window, expectedWindowId) {
  if (window.id !== expectedWindowId || window.status !== "processed") {
    throw new Error(`cartographer process window mismatch: ${JSON.stringify(window)}`);
  }
}

function assertProcessedCartographerPatchResult(processed) {
  const patch = processed.patches[0] ?? null;
  if (
    processed.patches.length !== 1 ||
    !patch?.id.startsWith("cartographer_patch_scripted") ||
    patch?.status !== "applied" ||
    processed.events.length === 0
  ) {
    throw new Error(`cartographer process patch mismatch: ${JSON.stringify(processed)}`);
  }
}

async function assertProcessedCartographerReadback(client, workspaceId, processedCartographer) {
  const result = await waitForState(
    client,
    driverCallExpression("semanticGraphProcessedCartographerReadback", {
      processedCartographer,
      workspaceId,
    }),
    (value) => processedCartographerReadbackReady(value, processedCartographer),
  );
  try {
    assertProcessedCartographerAuditReadback(result.run.run);
    assertProcessedCartographerPatchReadback(result, processedCartographer);
    assertProcessedCartographerNodeReadback(result, processedCartographer);
  } catch {
    throw new Error(`processed cartographer readback mismatch: ${JSON.stringify(result)}`);
  }
}

function processedCartographerReadbackReady(value, processedCartographer) {
  return (
    value.run?.run?.status === "applied" &&
    processedCartographerWindowReadbackReady(value, processedCartographer.windowId) &&
    processedCartographerPatchReadbackReady(value, processedCartographer.patchId) &&
    value.detail?.detail?.node?.id === processedCartographer.nodeId
  );
}

function processedCartographerWindowReadbackReady(value, windowId) {
  return value.windows?.windows?.some((window) => window.id === windowId);
}

function processedCartographerPatchReadbackReady(value, patchId) {
  return value.patches?.patches?.some((patch) => patch.id === patchId);
}

function assertProcessedCartographerAuditReadback(run) {
  if (
    run.harnessKind !== "codex" ||
    run.requestId !== "scripted-cartographer-request" ||
    run.responseId !== "scripted-cartographer-response" ||
    run.rawHarnessResponseHash === ""
  ) {
    throw new Error("processed cartographer audit mismatch");
  }
}

function assertProcessedCartographerPatchReadback(result, processedCartographer) {
  const patch = result.patches.patches.find(
    (candidate) => candidate.id === processedCartographer.patchId,
  );
  if (!patch || patch.patch.publicSummary !== "Scripted cartographer patch envelope") {
    throw new Error("processed cartographer patch mismatch");
  }
}

function assertProcessedCartographerNodeReadback(result, processedCartographer) {
  const hasEvidence = result.detail.detail.evidence.some(
    (evidence) => evidence.reassignedFromAnchorId === processedCartographer.evidenceAnchorId,
  );
  const hasNode = result.graph.nodes.some((node) => node.id === processedCartographer.nodeId);
  if (!hasEvidence || !hasNode) {
    throw new Error("processed cartographer node mismatch");
  }
}

async function acceptSeedCartographerPatchFromDetails(client) {
  const clickResult = await waitForState(
    client,
    driverCallExpression("semanticGraphClickCartographerPatchAccept"),
    (value) => value.clicked,
  );
  if (!clickResult.clicked) {
    throw new Error(`cartographer accept click failed: ${JSON.stringify(clickResult)}`);
  }
  await waitForState(
    client,
    driverCallExpression("semanticGraphNodeDetailsText"),
    (value) => value.text.includes("applied") && !value.text.includes("pending_review"),
  );
}

function textIncludesAll(text, expected) {
  return expected.every((item) => text.includes(item));
}

async function assertSemanticAttachmentDetails(client, attachment) {
  const details = await waitForState(
    client,
    driverCallExpression("semanticGraphNodeDetailsText"),
    (value) =>
      value.text.includes("chat_run") &&
      value.text.includes(attachment.runId) &&
      value.text.includes("Explicit semantic attachment from deterministic Electron workflow") &&
      value.text.includes("semantic_e2e_user"),
  );
  if (!details.text.includes(attachment.attached.evidence.id)) {
    throw new Error(`semantic node details omitted attached evidence id: ${details.text}`);
  }
}

async function semanticEventHistory(client, workspaceId) {
  return client.driver("semanticGraphReadEventHistory", { workspaceId });
}

async function waitForSemanticLayoutPosition(client, workspaceId, expected) {
  return waitForState(
    client,
    driverCallExpression("semanticGraphReadGraph", { workspaceId }),
    (graph) => {
      const position = graph.layoutPositions.find(
        (candidate) => candidate.entityId === seedConstraintNodeId,
      );
      return Boolean(
        position &&
        position.pinned === true &&
        position.x === expected.x &&
        position.y === expected.y,
      );
    },
  );
}

function assertSemanticGraphVisible(snapshot) {
  const nodes = semanticNodes(snapshot);
  const edges = semanticEdges(snapshot);
  if (nodes.length < 4) {
    throw new Error(`semantic graph exposed too few nodes: ${JSON.stringify(snapshot.graph)}`);
  }
  if (edges.length < 3) {
    throw new Error(`semantic graph exposed too few edges: ${JSON.stringify(snapshot.graph)}`);
  }
  const targetNode = nodeById(snapshot, seedRendererNodeId);
  if (targetNode.ports.length !== 0) {
    throw new Error(`semantic node exposed editable ports: ${JSON.stringify(targetNode)}`);
  }
  if (targetNode.label.text !== "Deterministic layout writes stay read-only") {
    throw new Error(`semantic node label mismatch: ${JSON.stringify(targetNode.label)}`);
  }
  const semanticLabels = new Set(edges.map((edge) => edge.label));
  for (const label of ["supports", "refutes", "resolves"]) {
    if (!semanticLabels.has(label)) {
      throw new Error(`semantic edge label ${label} missing: ${JSON.stringify(edges)}`);
    }
  }
  if (!snapshot.visual.hasNonBackgroundPixels || snapshot.visual.sampledColorCount < 2) {
    throw new Error(`semantic graph canvas appears blank: ${JSON.stringify(snapshot.visual)}`);
  }
}

function assertRendererLifecycleDebug(snapshot, label) {
  for (const counter of [
    "canvasCreationCount",
    "graphUpdateCount",
    "rendererDestroyCount",
    "rendererInstanceId",
  ]) {
    if (!Number.isInteger(snapshot.render[counter]) || snapshot.render[counter] < 0) {
      throw new Error(
        `${label} renderer lifecycle counter ${counter} was invalid: ${JSON.stringify(snapshot.render)}`,
      );
    }
  }
  if (snapshot.render.canvasCreationCount !== 1) {
    throw new Error(
      `${label} expected one canvas for the mounted renderer: ${JSON.stringify(snapshot.render)}`,
    );
  }
}

function assertCartographerAuditBurst(result) {
  if (result.builtCount !== cartographerAuditBurstSize || result.auditEventCount < 1) {
    throw new Error(
      `cartographer audit burst did not deliver enough events: ${JSON.stringify(result)}`,
    );
  }
  const nonAuditOnly = result.changedAreas.find(
    (areas) => areas.length !== 1 || areas[0] !== "cartographer_audit",
  );
  if (nonAuditOnly) {
    throw new Error(
      `cartographer audit burst delivered non-audit areas: ${JSON.stringify(result)}`,
    );
  }
  assertIncludesAll(
    result.deliveredRunIds,
    result.runIds,
    "cartographer audit burst omitted run ids",
    result,
  );
  assertIncludesAll(
    result.deliveredWindowIds,
    result.windowIds,
    "cartographer audit burst omitted window ids",
    result,
  );
}

function assertIncludesAll(actual, expected, label, result) {
  const actualSet = new Set(actual);
  const missing = expected.filter((item) => !actualSet.has(item));
  if (missing.length > 0) {
    throw new Error(
      `${label}: missing=${JSON.stringify(missing)} result=${JSON.stringify(result)}`,
    );
  }
}

function assertRendererStableWithoutGraphUpdate(before, after, label) {
  assertRendererStable(before, after, label);
  if (after.render.graphUpdateCount !== before.render.graphUpdateCount) {
    throw new Error(
      `${label} triggered a graph update: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
  if (
    after.graph.nodeCount !== before.graph.nodeCount ||
    after.graph.edgeCount !== before.graph.edgeCount
  ) {
    throw new Error(
      `${label} changed visible graph topology: before=${JSON.stringify(before.graph)} after=${JSON.stringify(after.graph)}`,
    );
  }
}

function assertRendererStableForGraphUpdate(before, after, label) {
  assertRendererStable(before, after, label);
  if (after.render.graphUpdateCount <= before.render.graphUpdateCount) {
    throw new Error(
      `${label} did not update graph data in the existing renderer: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
}

function assertRendererStable(before, after, label) {
  assertRendererLifecycleDebug(after, label);
  if (after.render.rendererInstanceId !== before.render.rendererInstanceId) {
    throw new Error(
      `${label} recreated the Pixi renderer: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
  if (after.render.canvasCreationCount !== before.render.canvasCreationCount) {
    throw new Error(
      `${label} created a replacement canvas: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
  if (after.render.rendererDestroyCount !== before.render.rendererDestroyCount) {
    throw new Error(
      `${label} destroyed the renderer: before=${JSON.stringify(before.render)} after=${JSON.stringify(after.render)}`,
    );
  }
  if (!after.visual.hasNonBackgroundPixels || after.visual.sampledColorCount < 2) {
    throw new Error(
      `${label} left the workflow graph canvas blank: ${JSON.stringify(after.visual)}`,
    );
  }
}

function assertSemanticChatRunAttachment(result) {
  assertSemanticAttachmentDidNotCreateNodes(result);
  assertSemanticAttachmentSourceRefs(result);
  assertSemanticAttachmentReadbacks(result);
}

function assertSemanticEditingResult(result) {
  const editDetail = requireSemanticEditDetail(result);
  requireSemanticMergedDetail(result);
  assertSemanticEditNodeProjection(editDetail);
  assertSemanticEditEdgeProjection(editDetail);
  assertSemanticSteeringLifecycle(editDetail, result.directiveId);
  assertSemanticEditHistory(result.editHistory.events);
}

function requireSemanticEditDetail(result) {
  const { detail } = result.editDetail;
  if (!detail) {
    throw new Error(`semantic edit detail was null: ${JSON.stringify(result.editDetail)}`);
  }
  return detail;
}

function requireSemanticMergedDetail(result) {
  const { detail } = result.mergedDetail;
  if (!detail || detail.node.id !== "semantic_e2e_merged") {
    throw new Error(`semantic merged detail mismatch: ${JSON.stringify(result.mergedDetail)}`);
  }
  return detail;
}

function assertSemanticEditNodeProjection(editDetail) {
  if (
    editDetail.node.label !== "E2E renamed semantic node" ||
    editDetail.node.kind !== "constraint" ||
    !editDetail.node.promoted ||
    !editDetail.node.dismissed ||
    editDetail.node.splitIntoNodeIds.length !== 2
  ) {
    throw new Error(`semantic edit node projection mismatch: ${JSON.stringify(editDetail.node)}`);
  }
}

function assertSemanticEditEdgeProjection(editDetail) {
  if (!editDetail.incomingEdges.some((edge) => edge.id === "semantic_e2e_constrains")) {
    throw new Error(`semantic edit detail omitted constraint edge: ${JSON.stringify(editDetail)}`);
  }
}

function assertSemanticSteeringLifecycle(editDetail, directiveId) {
  const directive = editDetail.steeringDirectives.find((candidate) => candidate.id === directiveId);
  if (!directive || directive.kind !== "focus" || directive.status !== "completed") {
    throw new Error(
      `semantic steering lifecycle mismatch: ${JSON.stringify(editDetail.steeringDirectives)}`,
    );
  }
}

function assertSemanticEditHistory(events) {
  const eventTypes = new Set(events.map((event) => event.eventType));
  for (const eventType of [
    "node.created",
    "node.renamed",
    "node.updated",
    "node.promoted",
    "steering.created",
    "steering.updated",
    "node.split",
  ]) {
    if (!eventTypes.has(eventType)) {
      throw new Error(`semantic edit history omitted ${eventType}: ${JSON.stringify(events)}`);
    }
  }
}

async function assertSemanticEditingReadback(client, workspaceId, editing) {
  const readback = await client.driver("semanticGraphEditingReadback", { workspaceId });
  if (readback.editDetail.detail?.steeringDirectives?.[0]?.id !== editing.directiveId) {
    throw new Error(
      `semantic steering directive did not persist: ${JSON.stringify(readback.editDetail)}`,
    );
  }
  if (readback.mergedDetail.detail?.node?.id !== "semantic_e2e_merged") {
    throw new Error(
      `semantic merged node did not persist: ${JSON.stringify(readback.mergedDetail)}`,
    );
  }
  if (!readback.graph.nodes.some((node) => node.id === "semantic_e2e_merged")) {
    throw new Error(
      `semantic edited graph nodes missing merged node: ${JSON.stringify(readback.graph.nodes)}`,
    );
  }
}

function assertSemanticAttachmentDidNotCreateNodes(result) {
  const attached = result.attached;
  if (JSON.stringify(result.graphNodeIdsAfter) !== JSON.stringify(result.graphNodeIdsBefore)) {
    throw new Error(
      `semantic attachment inferred graph nodes: before=${JSON.stringify(result.graphNodeIdsBefore)} after=${JSON.stringify(result.graphNodeIdsAfter)}`,
    );
  }
  if (attached.targetEntityId !== seedConstraintNodeId) {
    throw new Error(`semantic attachment targeted wrong node: ${JSON.stringify(attached)}`);
  }
}

function assertSemanticAttachmentSourceRefs(result) {
  const attached = result.attached;
  const ended = result.ended;
  if (attached.evidence.sourceKind !== "chat_run" || attached.evidence.sourceId !== result.runId) {
    throw new Error(`semantic evidence source mismatch: ${JSON.stringify(attached.evidence)}`);
  }
  if (attached.activity.sourceKind !== "chat_run" || attached.activity.chatRunId !== result.runId) {
    throw new Error(`semantic activity source mismatch: ${JSON.stringify(attached.activity)}`);
  }
  if (attached.activity.endedAt !== "") {
    throw new Error(`semantic activity should start active: ${JSON.stringify(attached.activity)}`);
  }
  if (ended.activity.id !== attached.activity.id || ended.activity.endedAt === "") {
    throw new Error(`semantic activity end mismatch: ${JSON.stringify(ended.activity)}`);
  }
}

function assertSemanticAttachmentReadbacks(result) {
  assertSemanticAttachmentDetailReadback(result);
  assertSemanticAttachmentPageReadback(result);
  assertSemanticAttachmentSummaryReadback(result);
}

function assertSemanticAttachmentDetailReadback(result) {
  const attached = result.attached;
  const detail = result.detail.detail;
  if (detail === null) {
    throw new Error("semantic attachment detail returned null");
  }
  if (!detail.evidence.some((evidence) => evidence.id === attached.evidence.id)) {
    throw new Error(`semantic detail omitted evidence: ${JSON.stringify(detail.evidence)}`);
  }
  if (
    !detail.activity.some(
      (activity) => activity.id === attached.activity.id && activity.endedAt !== "",
    )
  ) {
    throw new Error(`semantic detail omitted ended activity: ${JSON.stringify(detail.activity)}`);
  }
}

function assertSemanticAttachmentPageReadback(result) {
  const attached = result.attached;
  if (!result.page.activity.some((activity) => activity.id === attached.activity.id)) {
    throw new Error(`semantic activity page omitted attachment: ${JSON.stringify(result.page)}`);
  }
}

function assertSemanticAttachmentSummaryReadback(result) {
  const attached = result.attached;
  const targetSummary = result.summary.targets.find(
    (target) => target.targetEntityId === seedConstraintNodeId,
  );
  if (!targetSummary) {
    throw new Error(`semantic activity summary omitted target: ${JSON.stringify(result.summary)}`);
  }
  if (!targetSummary.recentActivity.some((activity) => activity.id === attached.activity.id)) {
    throw new Error(
      `semantic activity summary omitted ended attachment: ${JSON.stringify(targetSummary)}`,
    );
  }
}

function assertSemanticPosition(snapshot, expected) {
  const node = nodeById(snapshot, seedRendererNodeId);
  if (node.x !== expected.x || node.y !== expected.y) {
    throw new Error(
      `semantic node position did not persist: actual=${JSON.stringify({ x: node.x, y: node.y })} expected=${JSON.stringify(expected)}`,
    );
  }
}

function assertSemanticAttachmentHistory(history, attachment) {
  const eventIds = new Set(history.events.map((event) => event.eventId));
  for (const event of attachment.attached.events) {
    if (!eventIds.has(event.eventId)) {
      throw new Error(`semantic history omitted attachment event ${event.eventId}`);
    }
  }
  if (!eventIds.has(attachment.ended.event.eventId)) {
    throw new Error(
      `semantic history omitted activity end event ${attachment.ended.event.eventId}`,
    );
  }
}

function assertEventHistoryUnchanged(before, after, label) {
  const beforeIds = before.events.map((event) => event.eventId);
  const afterIds = after.events.map((event) => event.eventId);
  if (JSON.stringify(afterIds) !== JSON.stringify(beforeIds)) {
    throw new Error(
      `semantic event history changed after ${label}: before=${JSON.stringify(beforeIds)} after=${JSON.stringify(afterIds)}`,
    );
  }
}

function semanticNodes(snapshot) {
  return snapshot.graph.nodes.filter((node) => node.id.startsWith("semantic:"));
}

function semanticEdges(snapshot) {
  return snapshot.graph.edges.filter((edge) => edge.id.startsWith("semantic-edge:"));
}

function nodeById(snapshot, nodeId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(
      `node ${nodeId} missing from graph snapshot: ${JSON.stringify(snapshot.graph)}`,
    );
  }
  return node;
}
