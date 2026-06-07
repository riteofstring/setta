/* global console */

import { spawn } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

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
const seedRendererNodeId = `semantic:${seedConstraintNodeId}`;
const semanticNodeDragDelta = { x: 92, y: 44 };

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
  await captureScreenshot(context.client, join(artifactDir, "semantic-initial.png"));

  const targetNode = nodeById(initial, seedRendererNodeId);
  await dispatchWorkflowGraphMouseDoubleClick(context.client, workflowGraphSurfaceId, {
    x: targetNode.screenX,
    y: targetNode.screenY,
  });
  await waitForSelector(context.client, '[data-testid="semantic-node-details-surface"]');
  await assertSemanticNodeDetails(context.client);
  await captureScreenshot(context.client, join(artifactDir, "semantic-details.png"));

  const attachment = await attachSemanticNodeToChatRun(context.client, workspaceId);
  assertSemanticChatRunAttachment(attachment);
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
  await assertSemanticAttachmentDetails(context.client, attachment);
  await captureScreenshot(context.client, join(artifactDir, "semantic-attached-details.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    attachment,
    afterDrag,
    afterReload,
    artifactDir,
    beforeHistoryCount: beforeHistory.events.length,
    initial,
    persistedPosition,
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
  return client.evaluate(`(async () => {
    const graphBefore = await window.setta.semanticGraph.read({
      workspaceId: ${JSON.stringify(workspaceId)}
    });
    const conversation = await window.setta.chat.createConversation(
      ${JSON.stringify(workspaceId)},
      "Semantic graph attachment"
    );
    const sent = await window.setta.chat.sendMessage(
      ${JSON.stringify(workspaceId)},
      conversation.id,
      "Attach this deterministic chat run to the seeded semantic graph node."
    );
    const attached = await window.setta.semanticGraph.attachChatRun({
      activityKind: "exploring",
      actorId: "semantic_e2e_user",
      actorKind: "user",
      chatRunId: sent.run.id,
      nodeId: ${JSON.stringify(seedConstraintNodeId)},
      summary: "Explicit semantic attachment from deterministic Electron workflow",
      workspaceId: ${JSON.stringify(workspaceId)}
    });
    const ended = await window.setta.semanticGraph.endActivity({
      activityIntervalId: attached.activity.id,
      actorId: "semantic_e2e_user",
      actorKind: "user",
      workspaceId: ${JSON.stringify(workspaceId)}
    });
    const detail = await window.setta.semanticGraph.readNodeDetail({
      nodeId: ${JSON.stringify(seedConstraintNodeId)},
      workspaceId: ${JSON.stringify(workspaceId)}
    });
    const page = await window.setta.semanticGraph.listActivityPage({
      actorId: "",
      actorKind: null,
      chatConversationId: "",
      chatMessageId: "",
      chatRunId: sent.run.id,
      limit: 10,
      offset: 0,
      sourceId: "",
      sourceKind: "chat_run",
      targetEntityId: ${JSON.stringify(seedConstraintNodeId)},
      workflowExecutionId: "",
      workflowNodeId: "",
      workspaceId: ${JSON.stringify(workspaceId)}
    });
    const summary = await window.setta.semanticGraph.readActivitySummary({
      recentLimit: 5,
      workspaceId: ${JSON.stringify(workspaceId)}
    });
    const graphAfter = await window.setta.semanticGraph.read({
      workspaceId: ${JSON.stringify(workspaceId)}
    });
    return {
      attached,
      assistantMessageId: sent.assistantMessage.id,
      conversationId: conversation.id,
      detail,
      ended,
      graphNodeIdsAfter: graphAfter.nodes.map((node) => node.id).sort(),
      graphNodeIdsBefore: graphBefore.nodes.map((node) => node.id).sort(),
      page,
      runId: sent.run.id,
      summary,
      userMessageId: sent.userMessage.id
    };
  })()`);
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
    `(() => ({ text: document.querySelector('[data-testid="semantic-node-details-surface"]')?.innerText ?? "" }))()`,
    (value) =>
      value.text.includes("Deterministic layout writes stay read-only") &&
      value.text.includes("supports") &&
      value.text.includes("refutes") &&
      value.text.includes("resolves") &&
      value.text.includes("Phase 2 plan excerpt") &&
      value.text.includes("validating") &&
      value.text.includes("Keep semantic graph rendering read-only") &&
      value.text.includes("context_pack.created") &&
      value.text.includes("88"),
  );
  if (!details.text.includes("docs/plans/setta_semantic_work_graph_implementation_plan.md")) {
    throw new Error(`semantic node details omitted evidence path: ${details.text}`);
  }
}

async function assertSemanticAttachmentDetails(client, attachment) {
  const details = await waitForState(
    client,
    `(() => ({ text: document.querySelector('[data-testid="semantic-node-details-surface"]')?.innerText ?? "" }))()`,
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
  return client.evaluate(`window.setta.semanticGraph.readEventHistory({
    beforeLogicalClock: 0,
    limit: 100,
    targetEntityId: ${JSON.stringify(seedConstraintNodeId)},
    workspaceId: ${JSON.stringify(workspaceId)}
  })`);
}

async function waitForSemanticLayoutPosition(client, workspaceId, expected) {
  return waitForState(
    client,
    `window.setta.semanticGraph.read({ workspaceId: ${JSON.stringify(workspaceId)} })`,
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

function assertSemanticChatRunAttachment(result) {
  assertSemanticAttachmentDidNotCreateNodes(result);
  assertSemanticAttachmentSourceRefs(result);
  assertSemanticAttachmentReadbacks(result);
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
