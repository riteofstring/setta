import type { Position } from "utils/generatedTypes";
import {
  getCanvasFlowConnectionPreviewEdge,
  getCanvasFlowEdgeLabelLayout,
  getCanvasFlowEdgeLabelSize,
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
import type {
  CanvasFlowColorProgram,
  CanvasFlowTextureProgram,
} from "./canvasFlowWebglShaders";

type CanvasFlowScreenPoint = {
  x: number;
  y: number;
};
type CanvasFlowRgba = [number, number, number, number];
type CanvasFlowEdgeLabelTextureEntry = {
  cssHeight: number;
  cssWidth: number;
  key: string;
  pixelHeight: number;
  pixelRatio: number;
  pixelWidth: number;
  texture: WebGLTexture;
};

const BEZIER_EDGE_SEGMENTS = 24;
const MIN_EDGE_SCREEN_WIDTH = 0.75;
const MAX_EDGE_LABEL_PIXEL_RATIO = 2;
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

export class CanvasFlowWebglEdgeLabelTextureCache {
  private readonly entries = new Map<string, CanvasFlowEdgeLabelTextureEntry>();
  private readonly gl: CanvasFlowWebglRenderingContext;

  constructor({ gl }: { gl: CanvasFlowWebglRenderingContext }) {
    this.gl = gl;
  }

  dispose() {
    for (const entry of this.entries.values()) {
      this.gl.deleteTexture(entry.texture);
    }
    this.entries.clear();
  }

  handleContextLost() {
    this.entries.clear();
  }

  getOrCreate(label: string): CanvasFlowEdgeLabelTextureEntry {
    const pixelRatio = getCanvasFlowEdgeLabelPixelRatio();
    const key = getCanvasFlowEdgeLabelTextureKey(label, pixelRatio);
    const existing = this.entries.get(key);
    if (existing) {
      return existing;
    }
    const entry = createCanvasFlowEdgeLabelTexture({
      gl: this.gl,
      key,
      label,
      pixelRatio,
    });
    this.entries.set(key, entry);
    return entry;
  }

  releaseUnused(activeKeys: ReadonlySet<string>) {
    for (const [key, entry] of this.entries) {
      if (activeKeys.has(key)) {
        continue;
      }
      this.gl.deleteTexture(entry.texture);
      this.entries.delete(key);
    }
  }
}

export function drawCanvasFlowWebglEdgeLabels({
  edgeLabelCache,
  edges,
  gl,
  size,
  textureProgram,
  viewport,
}: {
  edgeLabelCache: CanvasFlowWebglEdgeLabelTextureCache;
  edges: CanvasFlowDrawableEdge[];
  gl: CanvasFlowWebglRenderingContext;
  size: CanvasFlowSize;
  textureProgram: CanvasFlowTextureProgram;
  viewport: CanvasFlowViewport;
}) {
  let drawnLabels = 0;
  const activeKeys = new Set<string>();
  gl.useProgram(textureProgram.program);
  gl.enableVertexAttribArray(textureProgram.positionLocation);
  gl.enableVertexAttribArray(textureProgram.texCoordLocation);
  gl.uniform2f(
    textureProgram.resolutionLocation,
    size.cssWidth,
    size.cssHeight,
  );
  gl.uniform1i(textureProgram.textureLocation, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, textureProgram.texCoordBuffer);
  gl.vertexAttribPointer(
    textureProgram.texCoordLocation,
    2,
    gl.FLOAT,
    false,
    0,
    0,
  );
  for (const edge of edges) {
    if (!edge.label) {
      continue;
    }
    const screenRect = getCanvasFlowWebglEdgeLabelScreenRect({
      edge,
      viewport,
    });
    if (!screenRect || screenRect.width <= 0 || screenRect.height <= 0) {
      continue;
    }
    const entry = edgeLabelCache.getOrCreate(edge.label);
    activeKeys.add(entry.key);
    gl.bindBuffer(gl.ARRAY_BUFFER, textureProgram.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      createQuadVertices(screenRect),
      gl.STREAM_DRAW,
    );
    gl.vertexAttribPointer(
      textureProgram.positionLocation,
      2,
      gl.FLOAT,
      false,
      0,
      0,
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    drawnLabels += 1;
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  edgeLabelCache.releaseUnused(activeKeys);
  return { drawnLabels };
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

export function getCanvasFlowWebglEdgeLabelScreenRect({
  edge,
  viewport,
}: {
  edge: CanvasFlowDrawableEdge;
  viewport: CanvasFlowViewport;
}): CanvasFlowScreenRect | null {
  const labelLayout = getCanvasFlowEdgeLabelLayout(edge);
  if (!labelLayout) {
    return null;
  }
  return {
    height: labelLayout.height * viewport.zoom,
    width: labelLayout.width * viewport.zoom,
    x: viewport.x + labelLayout.x * viewport.zoom,
    y: viewport.y + labelLayout.y * viewport.zoom,
  };
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
    lineWidth: Math.max(
      stroke.lineWidth * viewport.zoom,
      MIN_EDGE_SCREEN_WIDTH,
    ),
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

type CanvasFlowScreenRect = CanvasFlowScreenPoint & {
  height: number;
  width: number;
};

function createCanvasFlowEdgeLabelTexture({
  gl,
  key,
  label,
  pixelRatio,
}: {
  gl: CanvasFlowWebglRenderingContext;
  key: string;
  label: string;
  pixelRatio: number;
}): CanvasFlowEdgeLabelTextureEntry {
  const { height: cssHeight, width: cssWidth } =
    getCanvasFlowEdgeLabelSize(label);
  const pixelWidth = Math.max(1, Math.ceil(cssWidth * pixelRatio));
  const pixelHeight = Math.max(1, Math.ceil(cssHeight * pixelRatio));
  const source = document.createElement("canvas");
  source.width = pixelWidth;
  source.height = pixelHeight;
  const ctx = source.getContext("2d");
  if (!ctx) {
    throw new Error(
      "CanvasFlow WebGL edge labels require 2D text rasterization.",
    );
  }
  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
  ctx.lineWidth = 1;
  drawRoundedRectPath({
    ctx,
    height: cssHeight - 1,
    radius: 10,
    width: cssWidth - 1,
    x: 0.5,
    y: 0.5,
  });
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#334155";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cssWidth / 2, cssHeight / 2);

  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("CanvasFlow WebGL edge label texture creation failed.");
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return {
    cssHeight,
    cssWidth,
    key,
    pixelHeight,
    pixelRatio,
    pixelWidth,
    texture,
  };
}

function getCanvasFlowEdgeLabelPixelRatio() {
  if (typeof window === "undefined") {
    return 1;
  }
  return Math.max(
    1,
    Math.min(window.devicePixelRatio || 1, MAX_EDGE_LABEL_PIXEL_RATIO),
  );
}

function getCanvasFlowEdgeLabelTextureKey(label: string, pixelRatio: number) {
  return `${pixelRatio}:${label}`;
}

function createQuadVertices({ height, width, x, y }: CanvasFlowScreenRect) {
  const right = x + width;
  const bottom = y + height;
  return new Float32Array([
    x,
    y,
    right,
    y,
    x,
    bottom,
    x,
    bottom,
    right,
    y,
    right,
    bottom,
  ]);
}

function drawRoundedRectPath({
  ctx,
  height,
  radius,
  width,
  x,
  y,
}: {
  ctx: CanvasRenderingContext2D;
  height: number;
  radius: number;
  width: number;
  x: number;
  y: number;
}) {
  const right = x + width;
  const bottom = y + height;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(right - radius, y);
  ctx.quadraticCurveTo(right, y, right, y + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(x + radius, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

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
  const normalized = pattern.filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  return normalized.length === pattern.length ? normalized : null;
}

function scaleDashPattern(
  pattern: readonly number[] | undefined,
  zoom: number,
) {
  return pattern?.map((value) => Math.max(value * zoom, 1));
}

function parseHexColor(value: string, alpha: number): CanvasFlowRgba | null {
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
  const parsedAlpha = parts[3] !== undefined ? Number.parseFloat(parts[3]) : 1;
  return Number.isNaN(parsedAlpha) ? null : parsedAlpha;
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}
