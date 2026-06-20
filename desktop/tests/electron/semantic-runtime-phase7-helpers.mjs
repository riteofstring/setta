import { setTimeout as delay } from "node:timers/promises";

import { waitForBackendState, waitForState } from "./chat-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import { openSelectedGraphNodeDetailsFromToolbar } from "./semantic-graph-ui-helpers.mjs";
import { maximizeWorkflowGraphPane } from "./workflow-graph-layout-helpers.mjs";
import {
  dispatchRecordedWorkflowGraphMouseClick,
  dispatchRecordedWorkflowGraphWheelBurst,
  getWorkflowGraphDebugSnapshot,
} from "./workflow-graph-performance-recording.mjs";

export const seedNodeId = "phase7_review_context";
export const reviewerNodeId = "reviewer";

export async function assertScriptedReviewerActivity({ client, execution, workspaceId }) {
  const chatRunId = workflowRunnerRefID(execution, reviewerNodeId, "chat.run");
  const chatConversationId = workflowRunnerRefID(execution, reviewerNodeId, "chat.conversation");
  const activity = await waitForBackendState(
    () => rendererChat(client, "runActivity", [workspaceId, chatRunId, 80]),
    (candidate) =>
      candidate.items.some((item) => item.type === "command_execution") &&
      candidate.items.some((item) => item.type === "file_change") &&
      candidate.items.some((item) => item.toolName === "workflow_result"),
    5000,
  );
  const page = await waitForBackendState(
    () => rendererChat(client, "messagePage", [workspaceId, chatConversationId, 0, 40]),
    (candidate) =>
      candidate.messages.some((message) =>
        (message.parts ?? [])
          .map((part) => part.text ?? "")
          .join("")
          .includes("Workflow result action complete."),
      ),
    5000,
  );
  return {
    assistantMessageId: page.messages.find((message) => message.role === "assistant")?.id ?? "",
    chatConversationId,
    chatRunId,
    commandItemCount: activity.items.filter((item) => item.type === "command_execution").length,
    fileChangeItemCount: activity.items.filter((item) => item.type === "file_change").length,
    workflowResultItemCount: activity.items.filter((item) => item.toolName === "workflow_result")
      .length,
  };
}

export async function assertProductDetailsExplainRuntimeAndFinding({
  client,
  graphSurfaceId,
  semanticNodeId,
  semanticNodeLabel,
}) {
  const runtimeText = await openGraphNodeDetailsText({
    client,
    expectedLabel: "Reviewer",
    graphSurfaceId,
    nodeId: reviewerNodeId,
    selector: '[data-testid="workflow-node-details-surface"]',
  });
  const normalizedRuntimeText = runtimeText.toLowerCase();
  if (
    !normalizedRuntimeText.includes("semantic runtime") ||
    !normalizedRuntimeText.includes("sources")
  ) {
    throw new Error(`workflow runtime details did not explain aggregate state: ${runtimeText}`);
  }
  const semanticText = await openGraphNodeDetailsText({
    client,
    expectedLabel: semanticNodeLabel,
    graphSurfaceId,
    nodeId: `semantic:${semanticNodeId}`,
    selector: '[data-testid="semantic-node-details-surface"]',
  });
  const normalizedSemanticText = semanticText.toLowerCase();
  if (
    !normalizedSemanticText.includes("source links") ||
    !normalizedSemanticText.includes("cartographer")
  ) {
    throw new Error(`semantic finding details did not explain provenance: ${semanticText}`);
  }
  return {
    runtimeTextLength: runtimeText.length,
    semanticTextLength: semanticText.length,
  };
}

async function openGraphNodeDetailsText({
  client,
  expectedLabel,
  graphSurfaceId,
  nodeId,
  selector,
}) {
  const activeGraphSurfaceId =
    (await maximizeWorkflowGraphPane(client, {
      surfaceId: graphSurfaceId,
      timeoutMs: 30_000,
    })) || graphSurfaceId;
  await client.driver("workflowGraphFitToView", { surfaceId: activeGraphSurfaceId });
  await delay(180);
  const snapshot = await waitForWorkflowGraphSnapshot(
    client,
    activeGraphSurfaceId,
    (candidate) =>
      candidate.graph.nodes.some(
        (node) => node.id === nodeId && node.materialized && pointInsideCanvas(node, candidate),
      ),
    30_000,
  );
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  await dispatchRecordedWorkflowGraphMouseClick(
    client,
    activeGraphSurfaceId,
    { x: node.screenX, y: node.screenY },
    [],
  );
  await waitForWorkflowGraphSnapshot(
    client,
    activeGraphSurfaceId,
    (candidate) => candidate.interaction.selectedNodeId === nodeId,
    5000,
  );
  await openSelectedGraphNodeDetailsFromToolbar(client, expectedLabel);
  return waitForState(
    client,
    `(() => ({
      texts: [...document.querySelectorAll(${JSON.stringify(selector)})].map((element) =>
        element instanceof HTMLElement ? element.innerText : ""
      )
    }))()`,
    (value) =>
      value.texts.some(
        (text) =>
          text.includes(expectedLabel) &&
          !text.includes("Loading semantic node details") &&
          !text.includes("The selected semantic node no longer exists."),
      ),
    5000,
  ).then((value) =>
    value.texts.find(
      (text) =>
        text.includes(expectedLabel) &&
        !text.includes("Loading semantic node details") &&
        !text.includes("The selected semantic node no longer exists."),
    ),
  );
}

function pointInsideCanvas(node, snapshot) {
  return (
    node.screenX >= 24 &&
    node.screenY >= 24 &&
    node.screenX <= snapshot.canvas.clientWidth - 24 &&
    node.screenY <= snapshot.canvas.clientHeight - 24
  );
}

export async function exercisePhase7TrackpadPanZoom(client, surfaceId, inputSamples) {
  const snapshot = await getWorkflowGraphDebugSnapshot(client, surfaceId, false);
  const target = hitTestTargetNode(snapshot);
  if (!target) {
    throw new Error("phase 7 runtime burst graph has no visible workflow node for camera input");
  }
  await dispatchRecordedWorkflowGraphWheelBurst(
    client,
    surfaceId,
    {
      events: trackpadPanEvents(),
      x: target.point.x,
      y: target.point.y,
    },
    inputSamples,
  );
  await delay(120);
  await dispatchRecordedWorkflowGraphWheelBurst(
    client,
    surfaceId,
    {
      events: trackpadPinchEvents(),
      modifiers: 2,
      x: target.point.x,
      y: target.point.y,
    },
    inputSamples,
  );
  await delay(160);
}

function hitTestTargetNode(snapshot) {
  const candidates = snapshot.graph.nodes
    .filter((node) => node.materialized === true)
    .filter((node) => pointInsideCanvas(node, snapshot));
  if (candidates.length === 0) {
    return null;
  }
  const canvasCenter = {
    x: snapshot.canvas.clientWidth / 2,
    y: snapshot.canvas.clientHeight / 2,
  };
  candidates.sort(
    (left, right) =>
      pointDistance({ x: left.screenX, y: left.screenY }, canvasCenter) -
      pointDistance({ x: right.screenX, y: right.screenY }, canvasCenter),
  );
  const node = candidates[0];
  return {
    nodeId: node.id,
    point: {
      x: Math.round(node.screenX),
      y: Math.round(node.screenY),
    },
  };
}

function pointDistance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function trackpadPanEvents() {
  return [
    { delayMs: 8, deltaX: 2, deltaY: 1, phase: "start" },
    { delayMs: 8, deltaX: 8, deltaY: 4, phase: "active" },
    { delayMs: 8, deltaX: 14, deltaY: 7, phase: "active" },
    { delayMs: 10, deltaX: 10, deltaY: 5, phase: "active" },
    { delayMs: 16, deltaX: 4, deltaY: 2, phase: "tail" },
    { delayMs: 24, deltaX: 1, deltaY: 0.5, phase: "tail" },
  ];
}

function trackpadPinchEvents() {
  return [
    { delayMs: 8, deltaY: -0.8, phase: "start" },
    { delayMs: 8, deltaY: -2.4, phase: "active" },
    { delayMs: 8, deltaY: -5.4, phase: "active" },
    { delayMs: 10, deltaY: -5.2, phase: "active" },
    { delayMs: 16, deltaY: -1.7, phase: "tail" },
    { delayMs: 24, deltaY: -0.4, phase: "tail" },
  ];
}

export function assertReviewerActiveAndRuntime(snapshot) {
  if (!reviewerActive(snapshot)) {
    throw new Error(`reviewer was not active in graph snapshot: ${JSON.stringify(snapshot.graph)}`);
  }
  const runtime = workflowRuntimeIndicatorForNode(snapshot, reviewerNodeId);
  if (!runtime || runtime.sourceCount <= 0 || runtime.status === "") {
    throw new Error(`reviewer runtime indicator missing: ${JSON.stringify(snapshot.graph.nodes)}`);
  }
}

export function reviewerActive(snapshot) {
  return snapshot.graph.nodes.some(
    (node) => node.id === reviewerNodeId && node.status === "running",
  );
}

export function assertDefaultRuntimeVisualBudget(snapshot) {
  const renderedLiveSourceCount = renderedSemanticLiveSourceIds(snapshot).length;
  if (renderedLiveSourceCount !== 0) {
    throw new Error(`default graph rendered live-source nodes: ${renderedLiveSourceCount}`);
  }
  const runtime = workflowRuntimeIndicatorForNode(snapshot, reviewerNodeId);
  if (runtime !== null && runtime.sourceCount <= 0) {
    throw new Error(`runtime aggregate source count invalid: ${JSON.stringify(runtime)}`);
  }
}

export function assertLargeReviewVisualBudget(snapshot) {
  assertDefaultRuntimeVisualBudget(snapshot);
  if (snapshot.render.materializedNodeCount > 220) {
    throw new Error(
      `large review materialized too many nodes: ${snapshot.render.materializedNodeCount}`,
    );
  }
  if (snapshot.render.totalDisplayObjectCount > 3000) {
    throw new Error(
      `large review display object budget exceeded: ${snapshot.render.totalDisplayObjectCount}`,
    );
  }
}

export async function assertAppliedFindingReadback(client, workspaceId, nodeId) {
  const graph = await rendererSemanticGraph(client, "read", [{ workspaceId }]);
  const detail = await rendererSemanticGraph(client, "readNodeDetail", [{ nodeId, workspaceId }]);
  const ok =
    graph.nodes.some((node) => node.id === nodeId) &&
    graph.sourceLinks.some((link) => link.targetEntityId === nodeId) &&
    detail.detail.evidence.length > 0;
  if (!ok) {
    throw new Error(`applied finding readback mismatch: ${JSON.stringify({ detail, graph })}`);
  }
  return {
    evidenceCount: detail.detail.evidence.length,
    nodeId,
    sourceLinkCount: graph.sourceLinks.filter((link) => link.targetEntityId === nodeId).length,
  };
}

export async function setFinalSynthesisInputBudget(client, workspaceId, inputBudget) {
  const record = await rendererSemanticGraph(client, "readCartographerSettings", [{}]);
  await rendererSemanticGraph(client, "updateCartographerSettings", [
    {
      settings: {
        auditConfig: record.settings.auditConfig,
        automaticProcessingEnabled: record.settings.automaticProcessingEnabled,
        finalSynthesisTaskConfig: {
          ...record.settings.finalSynthesisTaskConfig,
          inputBudget,
        },
        liveTaskConfig: record.settings.liveTaskConfig,
        observationConfig: record.settings.observationConfig,
        processingConfig: record.settings.processingConfig,
      },
      workspaceId,
    },
  ]);
}

export async function waitForWorkflowExecution(client, workspaceId, executionId, predicate) {
  return waitForBackendState(
    () => rendererWorkflow(client, "readExecution", [workspaceId, executionId]),
    predicate,
    30_000,
  );
}

export async function waitForRenderedSemanticGraphNode(client, graphSurfaceId, semanticNodeId) {
  return waitForWorkflowGraphSnapshot(
    client,
    graphSurfaceId,
    (snapshot) => snapshot.graph.nodes.some((node) => node.id === `semantic:${semanticNodeId}`),
    30_000,
  );
}

export async function waitForWorkflowGraphSnapshot(
  client,
  graphSurfaceId,
  predicate,
  timeoutMs,
  { includeVisual = false } = {},
) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", {
      includeVisual,
      surfaceId: graphSurfaceId,
    }),
    (value) => value.ready && predicate(value.snapshot),
    timeoutMs,
  ).then((value) => value.snapshot);
}

export async function waitForWorkspaceLayout(client) {
  await waitForState(
    client,
    `(() => Boolean(document.querySelector('[data-testid="workspace-layout-area"]')))()`,
    (value) => value === true,
    30_000,
  );
}

export function workflowRuntimeIndicatorForNode(snapshot, nodeId) {
  return snapshot.graph.nodes.find((candidate) => candidate.id === nodeId)?.runtime ?? null;
}

export function renderedSemanticLiveSourceIds(snapshot) {
  return (snapshot.graph.nodes ?? [])
    .map((node) => node.id)
    .filter((id) => typeof id === "string" && id.startsWith("semantic-live-source:"));
}

function workflowRunnerRefID(execution, nodeId, kind) {
  const nodeExecution = latestNodeExecution(execution, nodeId);
  const ref = nodeExecution?.runnerRefs.find((candidate) => candidate.kind === kind);
  if (!ref?.id) {
    throw new Error(
      `workflow runner ref ${kind} missing for ${nodeId}: ${JSON.stringify(nodeExecution)}`,
    );
  }
  return ref.id;
}

function latestNodeExecution(execution, nodeId) {
  return execution.nodeExecutions.filter((nodeExecution) => nodeExecution.nodeId === nodeId).at(-1);
}

export function workflowGraph(nodes, edges) {
  return {
    edges,
    layout: {
      nodes: nodes.map((node, index) => ({
        nodeId: node.id,
        x: index * 300,
        y: node.id === reviewerNodeId ? 96 : 0,
      })),
    },
    nodes,
  };
}

export function workflowControlNode(id, kind, title) {
  return {
    action: null,
    gateway: null,
    id,
    kind,
    loopGuard: null,
    title,
  };
}

export function workflowCodexNode(id, prompt, title) {
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
    title,
  };
}

export function workflowEdge(id, fromNodeId, toNodeId) {
  return {
    condition: null,
    fromNodeId,
    id,
    kind: "normal",
    toNodeId,
  };
}

export async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

export async function rendererSemanticGraph(client, method, args) {
  return client.evaluate(
    `window.setta.semanticGraph[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function rendererChat(client, method, args) {
  return client.evaluate(
    `window.setta.chat[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

export function summarizeSnapshot(snapshot) {
  return {
    graph: {
      edgeCount: snapshot.graph.edgeCount,
      nodeCount: snapshot.graph.nodeCount,
      runtimeSourceCount:
        workflowRuntimeIndicatorForNode(snapshot, reviewerNodeId)?.sourceCount ?? 0,
    },
    render: {
      activeEdgeFlowCount: snapshot.render.activeEdgeFlowCount,
      materializedNodeCount: snapshot.render.materializedNodeCount,
      totalDisplayObjectCount: snapshot.render.totalDisplayObjectCount,
    },
  };
}
