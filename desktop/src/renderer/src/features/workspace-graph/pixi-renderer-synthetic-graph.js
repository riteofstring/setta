const nodeWidth = 168;
const nodeHeight = 82;
const nodeSpacingX = 240;
const nodeSpacingY = 150;
const semanticNodeHeight = 68;
const semanticNodeWidth = 168;
const semanticNodeSpacingX = 220;
const semanticNodeSpacingY = 132;

const workflowNodeStatuses = [
  "not_started",
  "pending",
  "ready",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "waiting_approval",
  "recovery_required",
];
const workflowEdgeStatuses = ["inactive", "active", "completed", "cancelled"];
const workflowNodeKinds = [
  "action",
  "end",
  "gateway.and",
  "gateway.or",
  "gateway.xor",
  "loop.guard",
  "start",
];
const workflowStatusColors = {
  not_started: 0x64748b,
  pending: 0xa78bfa,
  ready: 0x38bdf8,
  running: 0x14b8a6,
  succeeded: 0x22c55e,
  failed: 0xef4444,
  cancelled: 0x71717a,
  waiting_approval: 0xf59e0b,
  recovery_required: 0xdc2626,
};
const semanticNodeKinds = [
  "concept",
  "question",
  "hypothesis",
  "finding",
  "decision",
  "constraint",
];
const semanticNodeColors = {
  concept: 0x0f766e,
  question: 0x2563eb,
  hypothesis: 0x9333ea,
  finding: 0x16a34a,
  decision: 0xd97706,
  constraint: 0xdc2626,
};
const semanticEdgeColors = [0x7dd3fc, 0x5eead4, 0x86efac, 0xfda4af, 0xfcd34d, 0xf87171, 0xc4b5fd];
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
    const status = workflowNodeStatuses[index % workflowNodeStatuses.length];
    const kind = workflowNodeKinds[index % workflowNodeKinds.length];
    nodes.push({
      color: workflowStatusColors[status],
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
        status: workflowEdgeStatuses[edges.length % workflowEdgeStatuses.length],
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
    const kind = semanticNodeKinds[index % semanticNodeKinds.length];
    const promoted = index % 29 === 0;
    const dismissed = index % 31 === 0 && index !== 0;
    nodes.push({
      activity: semanticSyntheticActivity(index),
      color: dismissed ? 0x52525b : promoted ? 0x0891b2 : semanticNodeColors[kind],
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
      edges.push({
        alpha: 0.76,
        color: semanticEdgeColors[edges.length % semanticEdgeColors.length],
        id: `semantic-edge:synthetic-edge-${edges.length.toString().padStart(5, "0")}`,
        layer: "semantic",
        label: "related_to",
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
