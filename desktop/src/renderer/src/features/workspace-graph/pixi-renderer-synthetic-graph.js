const nodeWidth = 168;
const nodeHeight = 82;
const nodeSpacingX = 240;
const nodeSpacingY = 150;
const syntheticNodeColors = [0x14b8a6, 0x8b5cf6, 0xf59e0b, 0x38bdf8, 0xec4899, 0x84cc16];

export function createSyntheticWorkflowGraph({ edgesPerNode, nodeCount }) {
  assertPositiveInteger(nodeCount, "synthetic graph nodeCount");
  assertPositiveInteger(edgesPerNode, "synthetic graph edgesPerNode");
  if (nodeCount < 2) {
    throw new Error(`synthetic graph requires at least two nodes: nodeCount=${nodeCount}`);
  }

  const columns = Math.ceil(Math.sqrt(nodeCount * 1.6));
  const rows = Math.ceil(nodeCount / columns);
  const originX = -(((columns - 1) * nodeSpacingX + nodeWidth) / 2);
  const originY = -(((rows - 1) * nodeSpacingY + nodeHeight) / 2);
  const nodes = [];

  for (let index = 0; index < nodeCount; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    nodes.push({
      color: syntheticNodeColors[index % syntheticNodeColors.length],
      height: nodeHeight,
      id: syntheticNodeId(index),
      label: `Node ${index.toString().padStart(4, "0")}`,
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
        sourceNodeId: syntheticNodeId(sourceIndex),
        sourcePortId: "output",
        targetNodeId: syntheticNodeId(targetIndex),
        targetPortId: "input",
      });
    }
  }

  return { edges, nodes };
}

function syntheticNodeId(index) {
  return `synthetic-node-${index.toString().padStart(5, "0")}`;
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
