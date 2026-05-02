import type { ConnectionStatus } from "../flowTypes";
import type { GpuRgbaColor } from "../gpuColors";
import type { GpuPoint } from "../viewportMath";
import { sampleGpuEdgeGeometry, type GpuEdgeGeometry } from "./edgeGeometry";

export type GpuEdgeBufferInput = {
  readonly active?: boolean | undefined;
  readonly color?: GpuRgbaColor | undefined;
  readonly connectionStatus?: ConnectionStatus | null | undefined;
  readonly edgeId: string;
  readonly geometry: GpuEdgeGeometry;
  readonly selected?: boolean | undefined;
  readonly visualFamily?: GpuEdgeVisualFamily | undefined;
  readonly zIndex?: number | undefined;
};

export type GpuEdgeVisualFamily =
  | "agentic"
  | "agentic-missing"
  | "workflow"
  | "workflow-prompt-link";

type GpuEdgeBufferSegmentRange = {
  readonly edgeId: string;
  readonly vertexCount: number;
  readonly vertexOffset: number;
};

type GpuEdgeLinePattern = {
  readonly dashLength: number;
  readonly gapLength: number;
};

export type GpuEdgeLineListBufferData = {
  readonly ranges: readonly GpuEdgeBufferSegmentRange[];
  readonly vertexCount: number;
  readonly vertexData: Float32Array;
};

export const GPU_EDGE_VERTEX_FLOATS = 8;
export const GPU_EDGE_SELECTED_FLAG = 1;
export const GPU_EDGE_ACTIVE_FLAG = 2;
export const GPU_EDGE_CONNECTION_VALID_FLAG = 4;
export const GPU_EDGE_CONNECTION_INVALID_FLAG = 8;
export const GPU_EDGE_CUSTOM_COLOR_FLAG = 16;
export const GPU_EDGE_AGENTIC_FLAG = 32;
export const GPU_EDGE_AGENTIC_MISSING_FLAG = 64;
export const GPU_EDGE_WORKFLOW_FLAG = 128;
export const GPU_EDGE_WORKFLOW_PROMPT_LINK_FLAG = 256;

const GPU_EDGE_AGENTIC_DASH_PATTERN: GpuEdgeLinePattern = {
  dashLength: 7,
  gapLength: 5,
};
const GPU_EDGE_AGENTIC_MISSING_DASH_PATTERN: GpuEdgeLinePattern = {
  dashLength: 8,
  gapLength: 5,
};
const GPU_EDGE_WORKFLOW_PROMPT_LINK_DASH_PATTERN: GpuEdgeLinePattern = {
  dashLength: 7,
  gapLength: 5,
};
const MIN_GPU_EDGE_PATTERN_STEP = 0.0001;

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
    const color = edge.color ?? DEFAULT_GPU_EDGE_VERTEX_COLOR;
    const points = sampleGpuEdgeGeometry(edge.geometry, { bezierSegments });
    appendLineListVertices({
      color,
      edgeIndex,
      flags,
      pattern: resolveGpuEdgeLinePattern(edge.visualFamily),
      points,
      vertices,
    });
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
  input: {
    readonly color: GpuRgbaColor;
    readonly edgeIndex: number;
    readonly flags: number;
    readonly pattern: GpuEdgeLinePattern | undefined;
    readonly points: readonly GpuPoint[];
    readonly vertices: number[];
  },
) {
  const { color, edgeIndex, flags, pattern, points, vertices } = input;
  if (pattern) {
    appendPatternedLineListVertices({ ...input, pattern });
    return;
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const source = points[index];
    const target = points[index + 1];
    if (!source || !target) {
      continue;
    }
    appendEdgeVertex(vertices, source, edgeIndex, flags, color);
    appendEdgeVertex(vertices, target, edgeIndex, flags, color);
  }
}

function appendPatternedLineListVertices({
  color,
  edgeIndex,
  flags,
  pattern,
  points,
  vertices,
}: {
  readonly color: GpuRgbaColor;
  readonly edgeIndex: number;
  readonly flags: number;
  readonly pattern: GpuEdgeLinePattern;
  readonly points: readonly GpuPoint[];
  readonly vertices: number[];
}) {
  const period = pattern.dashLength + pattern.gapLength;
  let patternOffset = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const source = points[index];
    const target = points[index + 1];
    if (!source || !target) {
      continue;
    }
    const segmentLength = Math.hypot(target.x - source.x, target.y - source.y);
    if (segmentLength <= MIN_GPU_EDGE_PATTERN_STEP) {
      continue;
    }
    let segmentOffset = 0;
    while (segmentOffset < segmentLength) {
      const phase = patternOffset % period;
      const isDash = phase < pattern.dashLength;
      const phaseEnd = isDash ? pattern.dashLength : period;
      const remainingPhaseLength = phaseEnd - phase;
      const step = Math.min(
        segmentLength - segmentOffset,
        remainingPhaseLength,
      );
      if (step <= MIN_GPU_EDGE_PATTERN_STEP) {
        break;
      }
      if (isDash) {
        appendEdgeVertex(
          vertices,
          interpolateGpuEdgePoint(source, target, segmentOffset / segmentLength),
          edgeIndex,
          flags,
          color,
        );
        appendEdgeVertex(
          vertices,
          interpolateGpuEdgePoint(
            source,
            target,
            (segmentOffset + step) / segmentLength,
          ),
          edgeIndex,
          flags,
          color,
        );
      }
      segmentOffset += step;
      patternOffset = (patternOffset + step) % period;
    }
  }
}

function appendEdgeVertex(
  vertices: number[],
  point: GpuPoint,
  edgeIndex: number,
  flags: number,
  color: GpuRgbaColor,
) {
  vertices.push(point.x, point.y, edgeIndex, flags, ...color);
}

function interpolateGpuEdgePoint(
  source: GpuPoint,
  target: GpuPoint,
  t: number,
): GpuPoint {
  return {
    x: source.x + (target.x - source.x) * t,
    y: source.y + (target.y - source.y) * t,
  };
}

function getGpuEdgeBufferFlags(
  edge: Pick<
    GpuEdgeBufferInput,
    "active" | "color" | "connectionStatus" | "selected" | "visualFamily"
  >,
) {
  let flags = 0;
  if (edge.selected) {
    flags |= GPU_EDGE_SELECTED_FLAG;
  }
  if (edge.active) {
    flags |= GPU_EDGE_ACTIVE_FLAG;
  }
  if (edge.connectionStatus === "valid") {
    flags |= GPU_EDGE_CONNECTION_VALID_FLAG;
  } else if (edge.connectionStatus === "invalid") {
    flags |= GPU_EDGE_CONNECTION_INVALID_FLAG;
  }
  if (edge.color) {
    flags |= GPU_EDGE_CUSTOM_COLOR_FLAG;
  }
  return flags | getGpuEdgeVisualFamilyFlag(edge.visualFamily);
}

function resolveGpuEdgeLinePattern(
  visualFamily: GpuEdgeVisualFamily | undefined,
): GpuEdgeLinePattern | undefined {
  switch (visualFamily) {
    case "agentic":
      return GPU_EDGE_AGENTIC_DASH_PATTERN;
    case "agentic-missing":
      return GPU_EDGE_AGENTIC_MISSING_DASH_PATTERN;
    case "workflow-prompt-link":
      return GPU_EDGE_WORKFLOW_PROMPT_LINK_DASH_PATTERN;
    case "workflow":
    case undefined:
      return undefined;
  }
}

function getGpuEdgeVisualFamilyFlag(
  visualFamily: GpuEdgeVisualFamily | undefined,
): number {
  switch (visualFamily) {
    case "agentic":
      return GPU_EDGE_AGENTIC_FLAG;
    case "agentic-missing":
      return GPU_EDGE_AGENTIC_MISSING_FLAG;
    case "workflow":
      return GPU_EDGE_WORKFLOW_FLAG;
    case "workflow-prompt-link":
      return GPU_EDGE_WORKFLOW_PROMPT_LINK_FLAG;
    case undefined:
      return 0;
  }
}

function compareGpuEdgeBufferInputs(
  left: GpuEdgeBufferInput,
  right: GpuEdgeBufferInput,
): number {
  return (left.zIndex ?? 0) - (right.zIndex ?? 0);
}

const DEFAULT_GPU_EDGE_VERTEX_COLOR: GpuRgbaColor = [0, 0, 0, 0];
