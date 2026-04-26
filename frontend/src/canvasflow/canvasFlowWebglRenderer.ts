import {
  assignCanvasFlowNodeTransform,
  disableCulledCanvasFlowNodePointerEvents,
} from "./canvasFlowDomTransform";
import { getVisibleNodeDrawRecords } from "./canvasFlowGeometry";
import { getCanvasFlowNodeElement } from "./canvasFlowNodeElements";
import { getCanvasFlowChangedNodeIds } from "./canvasFlowPaintEvents";
import {
  assertHtmlInCanvasWebglSupport,
  requestCanvasFlowPaint,
} from "./canvasFlowSupport";
import type {
  CanvasFlowNodeDrawRecord,
  CanvasFlowRenderer,
  CanvasFlowRenderInputs,
  CanvasFlowSize,
  CanvasFlowWebglRenderingContext,
} from "./canvasFlowTypes";
import { expandWorldRect, getVisibleWorldRect } from "./canvasFlowViewport";
import {
  createCanvasFlowColorProgram,
  type CanvasFlowColorProgram,
} from "./canvasFlowWebglShaders";

const DEFAULT_OVERSCAN = 600;
const FRAME_STATS_SAMPLE_INTERVAL_MS = 250;

type CreateCanvasFlowWebglRendererParams = {
  canvas: HTMLCanvasElement;
  initialInputs: CanvasFlowRenderInputs;
};

type WebglRendererState = {
  dirtyNodeIds: Set<string>;
  frameId: number | null;
  frameNumber: number;
  lastStatsWriteMs?: number;
  previousInteractiveNodeIds: Set<string>;
  textureUploadRequestsThisPaint: number;
};

export function createCanvasFlowWebglRenderer({
  canvas,
  initialInputs,
}: CreateCanvasFlowWebglRendererParams): CanvasFlowRenderer {
  const gl = assertHtmlInCanvasWebglSupport(canvas);
  const colorProgram = createCanvasFlowColorProgram(gl);
  const state: WebglRendererState = {
    dirtyNodeIds: new Set<string>(),
    frameId: null,
    frameNumber: 0,
    previousInteractiveNodeIds: new Set<string>(),
    textureUploadRequestsThisPaint: 0,
  };
  let inputs = initialInputs;
  let destroyed = false;

  canvas.dataset.rendererMode = "webgl-texture-nodes";
  canvas.dataset.webglContextCreated = "true";
  canvas.dataset.webglTextureUploadsThisFrame = "0";

  const requestFrame = (reason: string) => {
    if (destroyed || state.frameId !== null) {
      return;
    }
    canvas.dataset.webglLastFrameReason = reason;
    state.frameId = window.requestAnimationFrame((now) => {
      state.frameId = null;
      if (destroyed) {
        return;
      }
      state.frameNumber += 1;
      renderWebglFrame({
        canvas,
        colorProgram,
        gl,
        inputs,
        now,
        state,
      });
    });
  };

  return {
    destroy() {
      destroyed = true;
      if (state.frameId !== null) {
        window.cancelAnimationFrame(state.frameId);
        state.frameId = null;
      }
      gl.deleteBuffer(colorProgram.positionBuffer);
      gl.deleteProgram(colorProgram.program);
      clearWebglRendererDiagnostics(canvas);
    },
    handleCanvasPaint(event) {
      markDirtyNodeIds(state, getCanvasFlowChangedNodeIds(event));
      state.textureUploadRequestsThisPaint = state.dirtyNodeIds.size;
      requestFrame("paint");
    },
    markNodesDirty(nodeIds) {
      if (nodeIds === "all") {
        state.dirtyNodeIds = new Set(inputs.nodes.map((node) => node.id));
      } else {
        markDirtyNodeIds(state, nodeIds);
      }
      canvas.dataset.webglDirtyNodes = String(state.dirtyNodeIds.size);
      requestCanvasFlowPaint(canvas);
    },
    requestFrame,
    resize(size: CanvasFlowSize) {
      inputs = { ...inputs, size };
      requestFrame("resize");
    },
    updateInputs(nextInputs) {
      inputs = nextInputs;
    },
  };
}

function renderWebglFrame({
  canvas,
  colorProgram,
  gl,
  inputs,
  now,
  state,
}: {
  canvas: HTMLCanvasElement;
  colorProgram: CanvasFlowColorProgram;
  gl: CanvasFlowWebglRenderingContext;
  inputs: CanvasFlowRenderInputs;
  now: number;
  state: WebglRendererState;
}) {
  const drawStart = performance.now();
  const size = inputs.size;
  if (size.cssWidth <= 0 || size.cssHeight <= 0) {
    writeWebglStats({
      canvas,
      drawMs: performance.now() - drawStart,
      drawnNodes: 0,
      inputs,
      now,
      state,
      transformAssignmentMs: 0,
      visibleNodes: [],
      visibilityScanMs: 0,
    });
    return;
  }

  gl.viewport(0, 0, size.pixelWidth, size.pixelHeight);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const background: [number, number, number, number] = inputs.darkMode
    ? [16 / 255, 24 / 255, 39 / 255, 1]
    : [248 / 255, 250 / 255, 252 / 255, 1];
  gl.clearColor(background[0], background[1], background[2], background[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);

  drawGrid({
    colorProgram,
    gl,
    inputs,
  });

  const visibleRect = expandWorldRect(
    getVisibleWorldRect(size, inputs.viewport),
    DEFAULT_OVERSCAN,
  );
  const visibilityScanStart = performance.now();
  const visibleNodes = getVisibleNodeDrawRecords({
    nodes: inputs.nodes,
    nodeElements: inputs.nodeElements,
    visibleRect,
  });
  const visibilityScanMs = performance.now() - visibilityScanStart;
  const drawnNodes = drawPlaceholderNodeQuads({
    colorProgram,
    gl,
    nodes: visibleNodes,
    darkMode: inputs.darkMode,
    size,
    viewport: inputs.viewport,
  });
  const transformStart = performance.now();
  const nextInteractiveNodeIds = assignVisibleNodeTransforms({
    canvas,
    inputs,
    visibleNodes,
  });
  const transformAssignmentMs = performance.now() - transformStart;

  disableCulledCanvasFlowNodePointerEvents({
    nodeElements: inputs.nodeElements,
    previousInteractiveNodeIds: state.previousInteractiveNodeIds,
    nextInteractiveNodeIds,
  });
  state.previousInteractiveNodeIds.clear();
  for (const nodeId of nextInteractiveNodeIds) {
    state.previousInteractiveNodeIds.add(nodeId);
  }

  const drawMs = performance.now() - drawStart;
  writeWebglStats({
    canvas,
    drawMs,
    drawnNodes,
    inputs,
    now,
    state,
    transformAssignmentMs,
    visibleNodes,
    visibilityScanMs,
  });
  state.dirtyNodeIds.clear();
  state.textureUploadRequestsThisPaint = 0;
}

function drawGrid({
  colorProgram,
  gl,
  inputs,
}: {
  colorProgram: CanvasFlowColorProgram;
  gl: CanvasFlowWebglRenderingContext;
  inputs: CanvasFlowRenderInputs;
}) {
  if (!inputs.showGridLines) {
    return;
  }
  const scaledGridSize = Math.max(inputs.gridSize * inputs.viewport.zoom, 1);
  if (scaledGridSize < 6) {
    return;
  }
  const vertices: number[] = [];
  const startX = positiveModulo(inputs.viewport.x, scaledGridSize);
  const startY = positiveModulo(inputs.viewport.y, scaledGridSize);
  for (let x = startX; x <= inputs.size.cssWidth; x += scaledGridSize) {
    vertices.push(x, 0, x, inputs.size.cssHeight);
  }
  for (let y = startY; y <= inputs.size.cssHeight; y += scaledGridSize) {
    vertices.push(0, y, inputs.size.cssWidth, y);
  }
  drawColoredVertices({
    color: inputs.darkMode
      ? [148 / 255, 163 / 255, 184 / 255, 0.18]
      : [100 / 255, 116 / 255, 139 / 255, 0.18],
    colorProgram,
    drawMode: gl.LINES,
    gl,
    size: inputs.size,
    vertices,
  });
}

function drawPlaceholderNodeQuads({
  colorProgram,
  darkMode,
  gl,
  nodes,
  size,
  viewport,
}: {
  colorProgram: CanvasFlowColorProgram;
  darkMode: boolean;
  gl: CanvasFlowWebglRenderingContext;
  nodes: CanvasFlowNodeDrawRecord[];
  size: CanvasFlowSize;
  viewport: CanvasFlowRenderInputs["viewport"];
}) {
  const fillVertices: number[] = [];
  const strokeVertices: number[] = [];
  for (const node of nodes) {
    const x = viewport.x + node.x * viewport.zoom;
    const y = viewport.y + node.y * viewport.zoom;
    const width = node.width * viewport.zoom;
    const height = node.height * viewport.zoom;
    appendRectTriangles(fillVertices, x, y, width, height);
    appendRectLines(strokeVertices, x, y, width, height);
  }
  drawColoredVertices({
    color: darkMode
      ? [37 / 255, 99 / 255, 235 / 255, 0.26]
      : [59 / 255, 130 / 255, 246 / 255, 0.2],
    colorProgram,
    drawMode: gl.TRIANGLES,
    gl,
    size,
    vertices: fillVertices,
  });
  drawColoredVertices({
    color: darkMode
      ? [147 / 255, 197 / 255, 253 / 255, 0.7]
      : [30 / 255, 64 / 255, 175 / 255, 0.58],
    colorProgram,
    drawMode: gl.LINES,
    gl,
    size,
    vertices: strokeVertices,
  });
  return nodes.length;
}

function drawColoredVertices({
  color,
  colorProgram,
  drawMode,
  gl,
  size,
  vertices,
}: {
  color: [number, number, number, number];
  colorProgram: CanvasFlowColorProgram;
  drawMode: number;
  gl: CanvasFlowWebglRenderingContext;
  size: CanvasFlowSize;
  vertices: number[];
}) {
  if (vertices.length === 0) {
    return;
  }
  gl.useProgram(colorProgram.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorProgram.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
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
  gl.drawArrays(drawMode, 0, vertices.length / 2);
}

function appendRectTriangles(
  vertices: number[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const right = x + width;
  const bottom = y + height;
  vertices.push(x, y, right, y, x, bottom, x, bottom, right, y, right, bottom);
}

function appendRectLines(
  vertices: number[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const right = x + width;
  const bottom = y + height;
  vertices.push(
    x,
    y,
    right,
    y,
    right,
    y,
    right,
    bottom,
    right,
    bottom,
    x,
    bottom,
    x,
    bottom,
    x,
    y,
  );
}

function assignVisibleNodeTransforms({
  canvas,
  inputs,
  visibleNodes,
}: {
  canvas: HTMLCanvasElement;
  inputs: CanvasFlowRenderInputs;
  visibleNodes: CanvasFlowNodeDrawRecord[];
}) {
  const nextInteractiveNodeIds = new Set<string>();
  for (const node of visibleNodes) {
    const element = getCanvasFlowNodeElement({
      canvas,
      nodeElements: inputs.nodeElements,
      nodeId: node.id,
    });
    if (!element) {
      continue;
    }
    assignCanvasFlowNodeTransform({
      element,
      node,
      viewport: inputs.viewport,
    });
    nextInteractiveNodeIds.add(node.id);
  }
  return nextInteractiveNodeIds;
}

function markDirtyNodeIds(
  state: WebglRendererState,
  nodeIds: ReadonlySet<string> | undefined,
) {
  if (!nodeIds) {
    return;
  }
  for (const nodeId of nodeIds) {
    state.dirtyNodeIds.add(nodeId);
  }
}

function writeWebglStats({
  canvas,
  drawMs,
  drawnNodes,
  inputs,
  now,
  state,
  transformAssignmentMs,
  visibleNodes,
  visibilityScanMs,
}: {
  canvas: HTMLCanvasElement;
  drawMs: number;
  drawnNodes: number;
  inputs: CanvasFlowRenderInputs;
  now: number;
  state: WebglRendererState;
  transformAssignmentMs: number;
  visibleNodes: CanvasFlowNodeDrawRecord[];
  visibilityScanMs: number;
}) {
  if (!shouldWriteWebglStats(canvas, state, now)) {
    return;
  }
  canvas.dataset.paintSequence = String(
    Number.parseInt(canvas.dataset.paintSequence ?? "0", 10) + 1,
  );
  canvas.dataset.visibleNodes = String(visibleNodes.length);
  canvas.dataset.drawnNodes = String(drawnNodes);
  canvas.dataset.registeredNodes = String(inputs.nodes.length);
  canvas.dataset.mountedNodes = String(inputs.nodeElements.size);
  canvas.dataset.edgeCount = String(inputs.edges.length);
  canvas.dataset.edgeDrawMs = "0.00";
  canvas.dataset.lastPaintTime = now.toFixed(2);
  canvas.dataset.snapshotCacheHits = "0";
  canvas.dataset.snapshotCacheMisses = "0";
  canvas.dataset.snapshotCaptureMs = "0.00";
  canvas.dataset.drawElementImageMs = "0.00";
  canvas.dataset.visibilityScanMs = visibilityScanMs.toFixed(2);
  canvas.dataset.transformAssignmentMs = transformAssignmentMs.toFixed(2);
  canvas.dataset.totalPaintMs = drawMs.toFixed(2);
  canvas.dataset.viewportX = inputs.viewport.x.toFixed(2);
  canvas.dataset.viewportY = inputs.viewport.y.toFixed(2);
  canvas.dataset.viewportZoom = inputs.viewport.zoom.toFixed(4);
  canvas.dataset.webglFrame = String(state.frameNumber);
  canvas.dataset.webglDrawMs = drawMs.toFixed(2);
  canvas.dataset.webglTextureUploadsThisFrame = "0";
  canvas.dataset.webglTextureUploadRequestsThisPaint = String(
    state.textureUploadRequestsThisPaint,
  );
}

function shouldWriteWebglStats(
  canvas: HTMLCanvasElement,
  state: WebglRendererState,
  now: number,
) {
  if (canvas.dataset.canvasFlowDiagnostics === "enabled") {
    state.lastStatsWriteMs = now;
    return true;
  }
  if (
    state.lastStatsWriteMs !== undefined &&
    now - state.lastStatsWriteMs < FRAME_STATS_SAMPLE_INTERVAL_MS
  ) {
    return false;
  }
  state.lastStatsWriteMs = now;
  return true;
}

function clearWebglRendererDiagnostics(canvas: HTMLCanvasElement) {
  delete canvas.dataset.rendererMode;
  delete canvas.dataset.webglContextCreated;
  delete canvas.dataset.webglDirtyNodes;
  delete canvas.dataset.webglDrawMs;
  delete canvas.dataset.webglFrame;
  delete canvas.dataset.webglLastFrameReason;
  delete canvas.dataset.webglTextureUploadRequestsThisPaint;
  delete canvas.dataset.webglTextureUploadsThisFrame;
}

function positiveModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo;
}
