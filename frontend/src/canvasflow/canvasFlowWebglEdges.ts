import type { Position } from "utils/generatedTypes";
import {
  getCanvasFlowConnectionPreviewEdge,
  getCanvasFlowEdgePolyline,
  getCanvasFlowEdgeStroke,
} from "./canvasFlowEdges";
import type {
  CanvasFlowConnectionState,
  CanvasFlowDrawableEdge,
  CanvasFlowHandlePosition,
  CanvasFlowSize,
  CanvasFlowViewport,
  CanvasFlowWebglRenderingContext,
} from "./canvasFlowTypes";
import type { CanvasFlowColorProgram } from "./canvasFlowWebglShaders";

type CanvasFlowScreenPoint = {
  x: number;
  y: number;
};
type CanvasFlowRgba = [number, number, number, number];

const BEZIER_EDGE_SEGMENTS = 24;
const MIN_EDGE_SCREEN_WIDTH = 0.75;
const NAMED_WEBGL_EDGE_COLORS = new Map<string, CanvasFlowRgba>([
  ["black", [0, 0, 0, 1]],
  ["blue", [0, 0, 1, 1]],
  ["red", [1, 0, 0, 1]],
  ["transparent", [0, 0, 0, 0]],
  ["white", [1, 1, 1, 1]],
]);

export function drawCanvasFlowWebglEdges({
  colorProgram,
  connectionState,
  edgeHandlePositions,
  edges,
  gl,
  size,
  viewport,
  wireColor,
}: {
  colorProgram: CanvasFlowColorProgram;
  connectionState: CanvasFlowConnectionState;
  edgeHandlePositions: Record<string, CanvasFlowHandlePosition>;
  edges: CanvasFlowDrawableEdge[];
  gl: CanvasFlowWebglRenderingContext;
  size: CanvasFlowSize;
  viewport: CanvasFlowViewport;
  wireColor: string;
}) {
  let drawnEdges = 0;
  for (const edge of edges) {
    drawnEdges += drawCanvasFlowWebglEdge({
      colorProgram,
      edge,
      gl,
      size,
      viewport,
      wireColor,
    });
  }
  const previewEdge = getCanvasFlowConnectionPreviewEdge({
    connectionState,
    positions: edgeHandlePositions,
    viewport,
  });
  if (previewEdge) {
    drawnEdges += drawCanvasFlowWebglEdge({
      colorProgram,
      edge: previewEdge,
      gl,
      size,
      viewport,
      wireColor,
    });
  }
  return { drawnEdges };
}

export function buildCanvasFlowWebglStrokeVertices({
  dashPattern,
  lineWidth,
  points,
}: {
  dashPattern?: readonly number[] | undefined;
  lineWidth: number;
  points: readonly CanvasFlowScreenPoint[];
}): Float32Array {
  const vertices: number[] = [];
  const normalizedDashPattern = normalizeDashPattern(dashPattern);
  let dashState: CanvasFlowDashState = { index: 0, offset: 0 };
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end) {
      continue;
    }
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) {
      continue;
    }
    if (!normalizedDashPattern) {
      appendStrokeSegmentVertices(vertices, start, end, lineWidth);
      continue;
    }
    dashState = appendDashedStrokeSegmentVertices({
      dashPattern: normalizedDashPattern,
      dashState,
      end,
      length,
      lineWidth,
      start,
      vertices,
    });
  }
  return new Float32Array(vertices);
}

export function parseCanvasFlowWebglColor(
  color: string,
  alpha = 1,
): CanvasFlowRgba {
  const value = color.trim().toLowerCase();
  const named = NAMED_WEBGL_EDGE_COLORS.get(value);
  if (named) {
    return [named[0], named[1], named[2], named[3] * alpha];
  }
  const hex = parseHexColor(value, alpha);
  if (hex) {
    return hex;
  }
  const rgb = parseRgbColor(value, alpha);
  if (rgb) {
    return rgb;
  }
  throw new Error(`Unsupported CanvasFlow WebGL edge color: ${color}`);
}

function drawCanvasFlowWebglEdge({
  colorProgram,
  edge,
  gl,
  size,
  viewport,
  wireColor,
}: {
  colorProgram: CanvasFlowColorProgram;
  edge: CanvasFlowDrawableEdge;
  gl: CanvasFlowWebglRenderingContext;
  size: CanvasFlowSize;
  viewport: CanvasFlowViewport;
  wireColor: string;
}) {
  const stroke = getCanvasFlowEdgeStroke({ edge, wireColor });
  const vertices = buildCanvasFlowWebglStrokeVertices({
    dashPattern: scaleDashPattern(stroke.dashPattern, viewport.zoom),
    lineWidth: Math.max(stroke.lineWidth * viewport.zoom, MIN_EDGE_SCREEN_WIDTH),
    points: getCanvasFlowEdgePolyline(edge, BEZIER_EDGE_SEGMENTS).map((point) =>
      worldToScreenPoint(point, viewport),
    ),
  });
  if (vertices.length === 0) {
    return 0;
  }
  const color = parseCanvasFlowWebglColor(stroke.color, stroke.alpha);
  gl.useProgram(colorProgram.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorProgram.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
  gl.enableVertexAttribArray(colorProgram.positionLocation);
  gl.vertexAttribPointer(
    colorProgram.positionLocation,
    2,
    gl.FLOAT,
    false,
    0,
    0,
  );
  gl.uniform2f(colorProgram.resolutionLocation, size.cssWidth, size.cssHeight);
  gl.uniform4f(
    colorProgram.colorLocation,
    color[0],
    color[1],
    color[2],
    color[3],
  );
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
  return 1;
}

function appendStrokeSegmentVertices(
  vertices: number[],
  start: CanvasFlowScreenPoint,
  end: CanvasFlowScreenPoint,
  lineWidth: number,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) {
    return;
  }
  const halfWidth = lineWidth / 2;
  const offsetX = (-dy / length) * halfWidth;
  const offsetY = (dx / length) * halfWidth;
  const startLeft = { x: start.x + offsetX, y: start.y + offsetY };
  const startRight = { x: start.x - offsetX, y: start.y - offsetY };
  const endLeft = { x: end.x + offsetX, y: end.y + offsetY };
  const endRight = { x: end.x - offsetX, y: end.y - offsetY };
  vertices.push(
    startLeft.x,
    startLeft.y,
    endLeft.x,
    endLeft.y,
    startRight.x,
    startRight.y,
    startRight.x,
    startRight.y,
    endLeft.x,
    endLeft.y,
    endRight.x,
    endRight.y,
  );
}

type CanvasFlowDashState = {
  index: number;
  offset: number;
};

function appendDashedStrokeSegmentVertices({
  dashPattern,
  dashState,
  end,
  length,
  lineWidth,
  start,
  vertices,
}: {
  dashPattern: readonly number[];
  dashState: CanvasFlowDashState;
  end: CanvasFlowScreenPoint;
  length: number;
  lineWidth: number;
  start: CanvasFlowScreenPoint;
  vertices: number[];
}): CanvasFlowDashState {
  let consumed = 0;
  let nextState = dashState;
  while (consumed < length) {
    const dashLength = dashPattern[nextState.index] ?? length;
    const take = Math.min(length - consumed, dashLength - nextState.offset);
    if (nextState.index % 2 === 0) {
      appendStrokeSegmentVertices(
        vertices,
        interpolatePoint(start, end, consumed / length),
        interpolatePoint(start, end, (consumed + take) / length),
        lineWidth,
      );
    }
    consumed += take;
    nextState = advanceDashState({
      dashLength,
      dashPatternLength: dashPattern.length,
      state: nextState,
      take,
    });
  }
  return nextState;
}

function advanceDashState({
  dashLength,
  dashPatternLength,
  state,
  take,
}: {
  dashLength: number;
  dashPatternLength: number;
  state: CanvasFlowDashState;
  take: number;
}): CanvasFlowDashState {
  const offset = state.offset + take;
  if (offset < dashLength - 0.0001) {
    return { index: state.index, offset };
  }
  return {
    index: (state.index + 1) % dashPatternLength,
    offset: 0,
  };
}

function worldToScreenPoint(
  point: Position,
  viewport: CanvasFlowViewport,
): CanvasFlowScreenPoint {
  return {
    x: viewport.x + point.x * viewport.zoom,
    y: viewport.y + point.y * viewport.zoom,
  };
}

function interpolatePoint(
  start: CanvasFlowScreenPoint,
  end: CanvasFlowScreenPoint,
  t: number,
): CanvasFlowScreenPoint {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

function normalizeDashPattern(pattern: readonly number[] | undefined) {
  if (!pattern || pattern.length === 0) {
    return null;
  }
  const normalized = pattern.filter((value) => Number.isFinite(value) && value > 0);
  return normalized.length === pattern.length ? normalized : null;
}

function scaleDashPattern(
  pattern: readonly number[] | undefined,
  zoom: number,
) {
  return pattern?.map((value) => Math.max(value * zoom, 1));
}

function parseHexColor(
  value: string,
  alpha: number,
): CanvasFlowRgba | null {
  const hex = value.startsWith("#") ? value.slice(1) : null;
  if (!hex) {
    return null;
  }
  if (hex.length === 3 || hex.length === 4) {
    return parseShortHexColor(hex, alpha);
  }
  if (hex.length === 6 || hex.length === 8) {
    return parseLongHexColor(hex, alpha);
  }
  return null;
}

function parseShortHexColor(hex: string, alpha: number) {
  return rgbaFromByteChannels(
    [...hex].map((part) => Number.parseInt(`${part}${part}`, 16)),
    alpha,
  );
}

function parseLongHexColor(hex: string, alpha: number) {
  return rgbaFromByteChannels(
    [
      hex.slice(0, 2),
      hex.slice(2, 4),
      hex.slice(4, 6),
      hex.slice(6, 8) || "ff",
    ].map((part) => Number.parseInt(part, 16)),
    alpha,
  );
}

function rgbaFromByteChannels(
  channels: number[],
  alpha: number,
): CanvasFlowRgba | null {
  if (channels.some((channel) => Number.isNaN(channel))) {
    return null;
  }
  return [
    (channels[0] ?? 0) / 255,
    (channels[1] ?? 0) / 255,
    (channels[2] ?? 0) / 255,
    ((channels[3] ?? 255) / 255) * alpha,
  ];
}

function parseRgbColor(value: string, alpha: number): CanvasFlowRgba | null {
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) {
    return null;
  }
  const parts = parseRgbParts(match[1] ?? "");
  const channels = parseRgbChannels(parts);
  const parsedAlpha = parseRgbAlpha(parts);
  if (!channels || parsedAlpha === null) {
    return null;
  }
  const usesPercent = parts.slice(0, 3).some((part) => part.includes("%"));
  const rgbScale = usesPercent ? 100 : 255;
  return [
    clamp01((channels[0] ?? 0) / rgbScale),
    clamp01((channels[1] ?? 0) / rgbScale),
    clamp01((channels[2] ?? 0) / rgbScale),
    clamp01(parsedAlpha) * alpha,
  ];
}

function parseRgbParts(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseRgbChannels(parts: string[]) {
  if (parts.length < 3 || parts.length > 4) {
    return null;
  }
  const channels = parts
    .slice(0, 3)
    .map((part) => Number.parseFloat(part.replace("%", "")));
  return channels.some((channel) => Number.isNaN(channel)) ? null : channels;
}

function parseRgbAlpha(parts: string[]) {
  const parsedAlpha =
    parts[3] !== undefined ? Number.parseFloat(parts[3]) : 1;
  return Number.isNaN(parsedAlpha) ? null : parsedAlpha;
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}
