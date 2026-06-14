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
  if (scene === "workflow-running") {
    return createSyntheticWorkflowRunningGraph();
  }
  if (scene === "merged") {
    return createSyntheticMergedGraph();
  }
  if (scene === "semantic-cells") {
    return createSyntheticSemanticCellGraph({ edgesPerNode, nodeCount });
  }
  return createSyntheticWorkflowStatusGraph({ edgesPerNode, nodeCount });
}

function createSyntheticWorkflowRunningGraph() {
  const nodes = [
    syntheticWorkflowNode({
      id: "start",
      kind: "start",
      label: "Start",
      status: "succeeded",
      x: -360,
      y: 0,
    }),
    syntheticWorkflowNode({
      id: "work",
      kind: "action",
      label: "Work",
      status: "running",
      x: 0,
      y: 120,
    }),
    syntheticWorkflowNode({
      id: "end",
      kind: "end",
      label: "End",
      status: "not_started",
      x: 360,
      y: 0,
    }),
  ];
  return {
    edges: [
      syntheticWorkflowEdge({
        id: "start_work",
        sourceNodeId: "start",
        status: "active",
        targetNodeId: "work",
      }),
      syntheticWorkflowEdge({
        id: "work_end",
        sourceNodeId: "work",
        status: "active",
        targetNodeId: "end",
      }),
    ],
    nodes,
  };
}

function createSyntheticMergedGraph() {
  const workflowGraph = createLivingWorkspaceWorkflowGraph();
  const semanticGraph = createCanonicalSemanticCellGraph();
  const mergedSemanticEdges = semanticGraph.edges.map((edge) => ({
    ...edge,
    alpha: Math.min(0.9, (edge.alpha ?? 0.76) + 0.1),
    width: (edge.width ?? 2) + 0.15,
  }));
  return {
    edges: [
      ...workflowGraph.edges,
      ...mergedSemanticEdges,
      {
        alpha: 0.36,
        color: workspaceNeonTheme.semantic.edgeKind.about,
        id: "semantic-edge:workflow-emit-finding",
        layer: "semantic",
        sourceNodeId: "wf_emit",
        sourcePortId: "output",
        targetNodeId: "semantic:finding",
        targetPortId: "input",
        width: 1.7,
      },
    ],
    nodes: [...workflowGraph.nodes, ...semanticGraph.nodes],
  };
}

function createLivingWorkspaceWorkflowGraph() {
  const nodes = [
    syntheticWorkflowNode({
      height: 58,
      id: "wf_start",
      kind: "start",
      label: "Run begins",
      status: "succeeded",
      width: 150,
      x: -560,
      y: -360,
    }),
    syntheticWorkflowNode({
      height: 58,
      id: "wf_fetch",
      kind: "action",
      label: "Fetch source",
      status: "running",
      width: 150,
      x: -360,
      y: -360,
    }),
    syntheticWorkflowNode({
      height: 58,
      id: "wf_route",
      kind: "gateway.xor",
      label: "Valid?",
      status: "running",
      width: 130,
      x: -160,
      y: -360,
    }),
    syntheticWorkflowNode({
      height: 58,
      id: "wf_emit",
      kind: "action",
      label: "Emit findings",
      status: "not_started",
      width: 160,
      x: 40,
      y: -360,
    }),
  ];
  return {
    edges: [
      syntheticWorkflowEdge({
        id: "wf_start_fetch",
        sourceNodeId: "wf_start",
        status: "active",
        targetNodeId: "wf_fetch",
      }),
      syntheticWorkflowEdge({
        id: "wf_fetch_route",
        sourceNodeId: "wf_fetch",
        status: "active",
        targetNodeId: "wf_route",
      }),
      syntheticWorkflowEdge({
        id: "wf_route_emit",
        sourceNodeId: "wf_route",
        status: "inactive",
        targetNodeId: "wf_emit",
      }),
    ],
    nodes,
  };
}

function syntheticWorkflowNode({
  height = nodeHeight,
  id,
  kind,
  label,
  status,
  width = nodeWidth,
  x,
  y,
}) {
  return {
    color: workflowNodeAccentColor(status, kind),
    height,
    id,
    kind,
    layer: "workflow",
    label,
    status,
    width,
    x,
    y,
  };
}

function syntheticWorkflowEdge({ id, sourceNodeId, status, targetNodeId }) {
  return {
    id,
    layer: "workflow",
    sourceNodeId,
    sourcePortId: "output",
    status,
    targetNodeId,
    targetPortId: "input",
  };
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
  if (nodeCount === 6 && edgesPerNode === 1) {
    return createCanonicalSemanticCellGraph();
  }
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

function createCanonicalSemanticCellGraph() {
  const nodeDefinitions = [
    {
      activity: null,
      id: "semantic:concept",
      kind: "concept",
      label: "Auth model",
      x: -300,
      y: 40,
    },
    {
      activity: { active: true, count: 1, kind: "exploring" },
      id: "semantic:question",
      kind: "question",
      label: "Token expiry?",
      x: -110,
      y: -70,
    },
    {
      activity: null,
      id: "semantic:hypothesis",
      kind: "hypothesis",
      label: "JWT rotation",
      x: 120,
      y: 30,
    },
    {
      activity: { active: true, count: 1, kind: "validating" },
      id: "semantic:finding",
      kind: "finding",
      label: "Race in refresh",
      x: 10,
      y: 170,
    },
    {
      activity: null,
      id: "semantic:decision",
      kind: "decision",
      label: "Use refresh tokens",
      x: -260,
      y: 210,
    },
    {
      activity: null,
      id: "semantic:constraint",
      kind: "constraint",
      label: "No 3rd-party store",
      x: 300,
      y: 190,
    },
  ];
  const nodes = nodeDefinitions.map(({ activity, id, kind, label, x, y }) => ({
    activity,
    color: semanticNodeColor({ dismissed: false, kind, promoted: false }),
    connectable: false,
    dismissed: false,
    height: semanticNodeHeight,
    id,
    layer: "semantic",
    label,
    mergedIntoNodeId: "",
    promoted: false,
    splitFromNodeId: "",
    splitIntoNodeIds: [],
    width: semanticNodeWidth,
    x,
    y,
  }));
  const edges = [
    canonicalSemanticEdge("concept-question", "semantic:concept", "semantic:question", "about"),
    canonicalSemanticEdge(
      "question-hypothesis",
      "semantic:question",
      "semantic:hypothesis",
      "touches",
    ),
    canonicalSemanticEdge(
      "hypothesis-finding",
      "semantic:hypothesis",
      "semantic:finding",
      "supports",
    ),
    canonicalSemanticEdge("finding-decision", "semantic:finding", "semantic:decision", "resolves"),
    canonicalSemanticEdge(
      "decision-constraint",
      "semantic:decision",
      "semantic:constraint",
      "constrains",
    ),
    canonicalSemanticEdge(
      "concept-decision",
      "semantic:concept",
      "semantic:decision",
      "related_to",
    ),
  ];
  return { edges, nodes };
}

function canonicalSemanticEdge(id, sourceNodeId, targetNodeId, kind) {
  return {
    alpha: 0.76,
    color: workspaceNeonTheme.semantic.edgeKind[kind],
    id: `semantic-edge:${id}`,
    layer: "semantic",
    label: kind,
    sourceNodeId,
    sourcePortId: "output",
    targetNodeId,
    targetPortId: "input",
    width: 2,
  };
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
  if (
    scene !== "workflow" &&
    scene !== "workflow-running" &&
    scene !== "semantic-cells" &&
    scene !== "merged"
  ) {
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
