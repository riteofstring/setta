import {
  semanticEdgeKindValues,
  semanticNodeColor,
  semanticNodeKindValues,
  workflowEdgeStatusValues,
  workflowNodeAccentColor,
  workflowNodeKindValues,
  workflowNodeStatusValues,
  workspaceNeonTheme,
} from "./workspace-neon-theme";

const nodeWidth = 168;
const nodeHeight = 82;
const nodeSpacingX = 240;
const nodeSpacingY = 150;
const semanticNodeHeight = 68;
const semanticNodeWidth = semanticNodeHeight;
const semanticNodeSpacingX = 220;
const semanticNodeSpacingY = 132;

const activityKinds = ["exploring", "editing", "debugging", "validating", "blocked"];

export function createSyntheticWorkflowGraph({ edgesPerNode, nodeCount, scene = "workflow" }) {
  assertPositiveInteger(nodeCount, "synthetic graph nodeCount");
  assertPositiveInteger(edgesPerNode, "synthetic graph edgesPerNode");
  assertSyntheticScene(scene);
  if (nodeCount < 2) {
    throw new Error(`synthetic graph requires at least two nodes: nodeCount=${nodeCount}`);
  }
  if (scene === "semantic-cells") {
    return createSyntheticSemanticCellGraph({ edgesPerNode, nodeCount });
  }
  return createSyntheticWorkflowStatusGraph({ edgesPerNode, nodeCount });
}

function createSyntheticWorkflowStatusGraph({ edgesPerNode, nodeCount }) {
  const columns = Math.ceil(Math.sqrt(nodeCount * 1.6));
  const rows = Math.ceil(nodeCount / columns);
  const originX = -(((columns - 1) * nodeSpacingX + nodeWidth) / 2);
  const originY = -(((rows - 1) * nodeSpacingY + nodeHeight) / 2);
  const nodes = [];

  for (let index = 0; index < nodeCount; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const status = workflowNodeStatusValues[index % workflowNodeStatusValues.length];
    const kind = workflowNodeKindValues[index % workflowNodeKindValues.length];
    nodes.push({
      color: workflowNodeAccentColor(status, kind),
      height: nodeHeight,
      id: syntheticNodeId(index),
      kind,
      layer: "workflow",
      label: `Node ${index.toString().padStart(4, "0")}`,
      status,
      width: nodeWidth,
      x: originX + column * nodeSpacingX,
      y: originY + row * nodeSpacingY,
    });
  }

  const edges = [];
  for (let sourceIndex = 0; sourceIndex < nodeCount; sourceIndex += 1) {
    for (let edgeOrdinal = 0; edgeOrdinal < edgesPerNode; edgeOrdinal += 1) {
      const targetIndex =
        (sourceIndex + edgeTargetOffset(edgeOrdinal, columns, nodeCount)) % nodeCount;
      edges.push({
        id: `synthetic-edge-${edges.length.toString().padStart(5, "0")}`,
        layer: "workflow",
        sourceNodeId: syntheticNodeId(sourceIndex),
        sourcePortId: "output",
        status: workflowEdgeStatusValues[edges.length % workflowEdgeStatusValues.length],
        targetNodeId: syntheticNodeId(targetIndex),
        targetPortId: "input",
      });
    }
  }

  return { edges, nodes };
}

function createSyntheticSemanticCellGraph({ edgesPerNode, nodeCount }) {
  const columns = Math.ceil(Math.sqrt(nodeCount * 1.35));
  const rows = Math.ceil(nodeCount / columns);
  const originX = -(((columns - 1) * semanticNodeSpacingX + semanticNodeWidth) / 2);
  const originY = -(((rows - 1) * semanticNodeSpacingY + semanticNodeHeight) / 2);
  const nodes = [];

  for (let index = 0; index < nodeCount; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const kind = semanticNodeKindValues[index % semanticNodeKindValues.length];
    const promoted = index % 29 === 0;
    const dismissed = index % 31 === 0 && index !== 0;
    nodes.push({
      activity: semanticSyntheticActivity(index),
      color: semanticNodeColor({ dismissed, kind, promoted }),
      connectable: false,
      dismissed,
      height: semanticNodeHeight,
      id: semanticSyntheticNodeId(index),
      layer: "semantic",
      label: `Cell ${index.toString().padStart(4, "0")}`,
      mergedIntoNodeId: "",
      promoted,
      splitFromNodeId: "",
      splitIntoNodeIds: [],
      width: semanticNodeWidth,
      x: originX + column * semanticNodeSpacingX,
      y: originY + row * semanticNodeSpacingY,
    });
  }

  const edges = [];
  for (let sourceIndex = 0; sourceIndex < nodeCount; sourceIndex += 1) {
    for (let edgeOrdinal = 0; edgeOrdinal < edgesPerNode; edgeOrdinal += 1) {
      const targetIndex =
        (sourceIndex + edgeTargetOffset(edgeOrdinal, columns, nodeCount)) % nodeCount;
      const edgeKind = semanticEdgeKindValues[edges.length % semanticEdgeKindValues.length];
      edges.push({
        alpha: 0.76,
        color: workspaceNeonTheme.semantic.edgeKind[edgeKind],
        id: `semantic-edge:synthetic-edge-${edges.length.toString().padStart(5, "0")}`,
        layer: "semantic",
        label: edgeKind,
        sourceNodeId: semanticSyntheticNodeId(sourceIndex),
        sourcePortId: "output",
        targetNodeId: semanticSyntheticNodeId(targetIndex),
        targetPortId: "input",
        width: 2,
      });
    }
  }

  return { edges, nodes };
}

function syntheticNodeId(index) {
  return `synthetic-node-${index.toString().padStart(5, "0")}`;
}

function semanticSyntheticNodeId(index) {
  return `semantic:${syntheticNodeId(index)}`;
}

function edgeTargetOffset(edgeOrdinal, columns, nodeCount) {
  const offset = [1, columns, columns + 1, Math.max(2, Math.floor(columns / 2))][edgeOrdinal];
  const candidate = offset ?? edgeOrdinal + 1;
  return candidate % nodeCount === 0 ? 1 : candidate;
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer: ${String(value)}`);
  }
}

function assertSyntheticScene(scene) {
  if (scene !== "workflow" && scene !== "semantic-cells") {
    throw new Error(`unsupported synthetic graph scene: ${String(scene)}`);
  }
}

function semanticSyntheticActivity(index) {
  if (index % 7 !== 0) {
    return null;
  }
  return {
    active: true,
    count: 1 + (index % 3),
    kind: activityKinds[index % activityKinds.length],
  };
}
