import type { GpuPoint } from "../viewportMath";
import { sampleGpuEdgeGeometry, type GpuEdgeGeometry } from "./edgeGeometry";

export type GpuEdgeBufferInput = {
  readonly active?: boolean | undefined;
  readonly edgeId: string;
  readonly geometry: GpuEdgeGeometry;
  readonly selected?: boolean | undefined;
  readonly zIndex?: number | undefined;
};

export type GpuEdgeBufferSegmentRange = {
  readonly edgeId: string;
  readonly vertexCount: number;
  readonly vertexOffset: number;
};

export type GpuEdgeLineListBufferData = {
  readonly ranges: readonly GpuEdgeBufferSegmentRange[];
  readonly vertexCount: number;
  readonly vertexData: Float32Array;
};

export const GPU_EDGE_VERTEX_FLOATS = 4;
export const GPU_EDGE_SELECTED_FLAG = 1;
export const GPU_EDGE_ACTIVE_FLAG = 2;

export function buildGpuEdgeLineListBufferData({
  bezierSegments,
  edges,
}: {
  readonly bezierSegments?: number | undefined;
  readonly edges: readonly GpuEdgeBufferInput[];
}): GpuEdgeLineListBufferData {
  const sortedEdges = [...edges].sort(compareGpuEdgeBufferInputs);
  const ranges: GpuEdgeBufferSegmentRange[] = [];
  const vertices: number[] = [];

  for (const [edgeIndex, edge] of sortedEdges.entries()) {
    const vertexOffset = vertices.length / GPU_EDGE_VERTEX_FLOATS;
    const flags = getGpuEdgeBufferFlags(edge);
    const points = sampleGpuEdgeGeometry(edge.geometry, { bezierSegments });
    appendLineListVertices(vertices, points, edgeIndex, flags);
    const vertexCount = vertices.length / GPU_EDGE_VERTEX_FLOATS - vertexOffset;
    if (vertexCount === 0) {
      continue;
    }
    ranges.push({
      edgeId: edge.edgeId,
      vertexCount,
      vertexOffset,
    });
  }

  return {
    ranges,
    vertexCount: vertices.length / GPU_EDGE_VERTEX_FLOATS,
    vertexData: new Float32Array(vertices),
  };
}

function appendLineListVertices(
  vertices: number[],
  points: readonly GpuPoint[],
  edgeIndex: number,
  flags: number,
) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const source = points[index];
    const target = points[index + 1];
    if (!source || !target) {
      continue;
    }
    appendEdgeVertex(vertices, source, edgeIndex, flags);
    appendEdgeVertex(vertices, target, edgeIndex, flags);
  }
}

function appendEdgeVertex(
  vertices: number[],
  point: GpuPoint,
  edgeIndex: number,
  flags: number,
) {
  vertices.push(point.x, point.y, edgeIndex, flags);
}

function getGpuEdgeBufferFlags(
  edge: Pick<GpuEdgeBufferInput, "active" | "selected">,
) {
  let flags = 0;
  if (edge.selected) {
    flags |= GPU_EDGE_SELECTED_FLAG;
  }
  if (edge.active) {
    flags |= GPU_EDGE_ACTIVE_FLAG;
  }
  return flags;
}

function compareGpuEdgeBufferInputs(
  left: GpuEdgeBufferInput,
  right: GpuEdgeBufferInput,
): number {
  return (left.zIndex ?? 0) - (right.zIndex ?? 0);
}
