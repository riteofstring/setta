import type { GpuEdgeBufferInput } from "../../src/gpuFlow/edges/edgeGpuBuffers";
import { buildGpuEdgeGeometry } from "../../src/gpuFlow/edges/edgeGeometry";
import type { GpuNodeLayout } from "../../src/gpuFlow/GpuNodeLayer";
import type { GpuViewportInput } from "../../src/gpuFlow/viewportMath";

export type GpuFlowStressScale = "medium" | "smoke" | "stress" | "stretch";

export type GpuFlowStressCanvas = {
  readonly height: number;
  readonly width: number;
};

export type GpuFlowStressViewportSample = {
  readonly label: string;
  readonly viewport: GpuViewportInput;
  readonly zoom: number;
};

export type GpuFlowStressMovementSample = {
  readonly dx: number;
  readonly dy: number;
  readonly nodeIds: readonly string[];
};

export type GpuFlowLargeGraphStressFixture = {
  readonly canvas: GpuFlowStressCanvas;
  readonly columns: number;
  readonly edges: readonly GpuEdgeBufferInput[];
  readonly movement: GpuFlowStressMovementSample;
  readonly nodes: readonly GpuNodeLayout[];
  readonly panViewports: readonly GpuFlowStressViewportSample[];
  readonly scale: GpuFlowStressScale;
  readonly selectedMovement: GpuFlowStressMovementSample;
  readonly zoomViewports: readonly GpuFlowStressViewportSample[];
};

export type CreateGpuFlowLargeGraphStressFixtureOptions = {
  readonly canvas?: Partial<GpuFlowStressCanvas> | undefined;
  readonly columns?: number | undefined;
  readonly nodeCount?: number | undefined;
  readonly scale?: GpuFlowStressScale | undefined;
};

const GPU_FLOW_STRESS_SCALE_NODE_COUNTS: Record<GpuFlowStressScale, number> = {
  medium: 1_000,
  smoke: 250,
  stress: 5_000,
  stretch: 10_000,
};

const DEFAULT_STRESS_CANVAS: GpuFlowStressCanvas = {
  height: 900,
  width: 1_400,
};

const BASE_NODE_HEIGHT = 84;
const BASE_NODE_WIDTH = 148;
const COLUMN_GAP = 108;
const ROW_GAP = 92;

export function createGpuFlowLargeGraphStressFixture(
  options: CreateGpuFlowLargeGraphStressFixtureOptions = {},
): GpuFlowLargeGraphStressFixture {
  const scale = options.scale ?? "smoke";
  const nodeCount =
    options.nodeCount ?? GPU_FLOW_STRESS_SCALE_NODE_COUNTS[scale];
  const columns =
    options.columns ?? Math.ceil(Math.sqrt(nodeCount) * 1.15);
  const canvas = {
    height: options.canvas?.height ?? DEFAULT_STRESS_CANVAS.height,
    width: options.canvas?.width ?? DEFAULT_STRESS_CANVAS.width,
  };
  const nodes = createGpuFlowStressNodes({ columns, nodeCount });
  const edges = createGpuFlowStressEdges(nodes, columns);
  const focusNodeIds = resolveStressFocusNodeIds(nodes);
  const panViewports = createGpuFlowStressPanViewports({
    canvas,
    focusNodeIds,
    nodes,
  });

  return {
    canvas,
    columns,
    edges,
    movement: {
      dx: 84,
      dy: 42,
      nodeIds: [focusNodeIds.middle],
    },
    nodes,
    panViewports,
    scale,
    selectedMovement: {
      dx: -72,
      dy: 96,
      nodeIds: [focusNodeIds.start, focusNodeIds.middle, focusNodeIds.end],
    },
    zoomViewports: createGpuFlowStressZoomViewports({
      canvas,
      focusNodeIds,
      nodes,
    }),
  };
}

export function moveGpuFlowStressFixtureNodes({
  dx,
  dy,
  nodeIds,
  nodes,
}: {
  readonly dx: number;
  readonly dy: number;
  readonly nodeIds: readonly string[];
  readonly nodes: readonly GpuNodeLayout[];
}): readonly GpuNodeLayout[] {
  const movedIds = new Set(nodeIds);
  return nodes.map((node) =>
    movedIds.has(node.nodeId)
      ? {
          ...node,
          x: node.x + dx,
          y: node.y + dy,
        }
      : node,
  );
}

function createGpuFlowStressNodes({
  columns,
  nodeCount,
}: {
  readonly columns: number;
  readonly nodeCount: number;
}): readonly GpuNodeLayout[] {
  return Array.from({ length: nodeCount }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const width = BASE_NODE_WIDTH + ((index * 17) % 5) * 24;
    const height = BASE_NODE_HEIGHT + ((index * 13) % 4) * 18;
    const denseBandOffset = Math.floor(row / 8) % 2 === 0 ? 0 : 180;
    return {
      height,
      nodeId: `stress-node-${index}`,
      tempZIndex: index % 37 === 0 ? 30 : undefined,
      width,
      x: column * (BASE_NODE_WIDTH + COLUMN_GAP) + (row % 3) * 36,
      y: row * (BASE_NODE_HEIGHT + ROW_GAP) + denseBandOffset,
      zIndex: index % 19,
    };
  });
}

function createGpuFlowStressEdges(
  nodes: readonly GpuNodeLayout[],
  columns: number,
): readonly GpuEdgeBufferInput[] {
  const edges: GpuEdgeBufferInput[] = [];
  for (const node of nodes) {
    const sourceIndex = nodeIndex(node);
    const rowNeighbor = nodes[sourceIndex + 1];
    if (rowNeighbor && sourceIndex % columns !== columns - 1) {
      edges.push(createStressEdge(node, rowNeighbor, "row"));
    }
    const columnNeighbor = nodes[sourceIndex + columns];
    if (columnNeighbor && sourceIndex % 3 === 0) {
      edges.push(createStressEdge(node, columnNeighbor, "column"));
    }
    const diagonalNeighbor = nodes[sourceIndex + columns + 1];
    if (
      diagonalNeighbor &&
      sourceIndex % columns !== columns - 1 &&
      sourceIndex % 7 === 0
    ) {
      edges.push(createStressEdge(node, diagonalNeighbor, "diagonal"));
    }
  }
  return edges;
}

function createStressEdge(
  source: GpuNodeLayout,
  target: GpuNodeLayout,
  family: "column" | "diagonal" | "row",
): GpuEdgeBufferInput {
  const sourceCenter = nodeCenter(source);
  const targetCenter = nodeCenter(target);
  const edgeId = `stress-edge-${family}-${source.nodeId}-${target.nodeId}`;
  return {
    edgeId,
    geometry: buildGpuEdgeGeometry({
      edgeId,
      source: sourceCenter,
      sourceSide: family === "column" ? "bottom" : "right",
      target: targetCenter,
      targetSide: family === "column" ? "top" : "left",
      type: family === "row" ? "straight" : "bezier",
    }),
    selected: family === "diagonal",
    visualFamily: family === "column" ? "workflow" : undefined,
  };
}

function createGpuFlowStressPanViewports({
  canvas,
  focusNodeIds,
  nodes,
}: {
  readonly canvas: GpuFlowStressCanvas;
  readonly focusNodeIds: ReturnType<typeof resolveStressFocusNodeIds>;
  readonly nodes: readonly GpuNodeLayout[];
}): readonly GpuFlowStressViewportSample[] {
  const focusIds = [
    focusNodeIds.start,
    focusNodeIds.dense,
    focusNodeIds.middle,
    focusNodeIds.sparse,
    focusNodeIds.end,
  ];
  return focusIds.map((nodeId, index) => {
    const zoom = index === 1 ? 0.75 : index === 3 ? 1.25 : 1;
    return {
      label: `pan-${index}-${nodeId}`,
      viewport: viewportForNode(requireStressNode(nodes, nodeId), canvas, zoom),
      zoom,
    };
  });
}

function createGpuFlowStressZoomViewports({
  canvas,
  focusNodeIds,
  nodes,
}: {
  readonly canvas: GpuFlowStressCanvas;
  readonly focusNodeIds: ReturnType<typeof resolveStressFocusNodeIds>;
  readonly nodes: readonly GpuNodeLayout[];
}): readonly GpuFlowStressViewportSample[] {
  const focusNode = requireStressNode(nodes, focusNodeIds.middle);
  return [0.5, 1, 2].map((zoom) => ({
    label: `zoom-${zoom}`,
    viewport: viewportForNode(focusNode, canvas, zoom),
    zoom,
  }));
}

function resolveStressFocusNodeIds(nodes: readonly GpuNodeLayout[]) {
  const lastIndex = nodes.length - 1;
  return {
    dense: nodeIdAt(nodes, Math.floor(nodes.length * 0.18)),
    end: nodeIdAt(nodes, lastIndex),
    middle: nodeIdAt(nodes, Math.floor(nodes.length * 0.5)),
    sparse: nodeIdAt(nodes, Math.floor(nodes.length * 0.74)),
    start: nodeIdAt(nodes, 0),
  };
}

function nodeIdAt(nodes: readonly GpuNodeLayout[], index: number): string {
  const node = nodes[Math.min(Math.max(index, 0), nodes.length - 1)];
  if (!node) {
    throw new Error("GPU flow stress fixture requires at least one node.");
  }
  return node.nodeId;
}

function requireStressNode(
  nodes: readonly GpuNodeLayout[],
  nodeId: string,
): GpuNodeLayout {
  const node = nodes.find((candidate) => candidate.nodeId === nodeId);
  if (!node) {
    throw new Error(`GPU flow stress fixture node not found: ${nodeId}.`);
  }
  return node;
}

function nodeCenter(node: GpuNodeLayout) {
  return {
    x: node.x + (node.width ?? 0) / 2,
    y: node.y + (node.height ?? 0) / 2,
  };
}

function viewportForNode(
  node: GpuNodeLayout,
  canvas: GpuFlowStressCanvas,
  zoom: number,
): GpuViewportInput {
  return [
    canvas.width * 0.35 - node.x * zoom,
    canvas.height * 0.32 - node.y * zoom,
    zoom,
  ];
}

function nodeIndex(node: GpuNodeLayout): number {
  const match = /^stress-node-(\d+)$/.exec(node.nodeId);
  if (!match) {
    throw new Error(`Unexpected GPU flow stress node id: ${node.nodeId}.`);
  }
  return Number(match[1]);
}
