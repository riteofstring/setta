import {
  assignCanvasFlowNodeTransform,
  disableCulledCanvasFlowNodePointerEvents,
} from "./canvasFlowDomTransform";
import {
  getNodeScreenDrawRect,
  getVisibleNodeDrawRecords,
} from "./canvasFlowGeometry";
import {
  CanvasFlowHtmlTextureCache,
  type CanvasFlowTextureUploadStats,
} from "./canvasFlowHtmlTextureCache";
import { getCanvasFlowNodeElement } from "./canvasFlowNodeElements";
import {
  type CanvasFlowChangedNodeElements,
  getCanvasFlowChangedNodeElements,
} from "./canvasFlowPaintEvents";
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
  createCanvasFlowTextureProgram,
  destroyCanvasFlowColorProgram,
  destroyCanvasFlowTextureProgram,
  type CanvasFlowColorProgram,
  type CanvasFlowTextureProgram,
} from "./canvasFlowWebglShaders";
import { drawCanvasFlowWebglEdges } from "./canvasFlowWebglEdges";

const DEFAULT_OVERSCAN = 600;
const FRAME_STATS_SAMPLE_INTERVAL_MS = 250;

type CreateCanvasFlowWebglRendererParams = {
  canvas: HTMLCanvasElement;
  initialInputs: CanvasFlowRenderInputs;
};

type WebglRendererState = {
  contextLost: boolean;
  frameId: number | null;
  frameNumber: number;
  lastStatsWriteMs?: number;
  pendingUploadStats: CanvasFlowTextureUploadStats;
  previousInteractiveNodeIds: Set<string>;
  rendererTransformChangedNodeIds: Set<string>;
  totalTextureEvictions: number;
  totalTextureUploadMs: number;
  totalTextureUploads: number;
};

type CanvasFlowWebglResources = {
  colorProgram: CanvasFlowColorProgram;
  textureProgram: CanvasFlowTextureProgram;
};

export function createCanvasFlowWebglRenderer({
  canvas,
  initialInputs,
}: CreateCanvasFlowWebglRendererParams): CanvasFlowRenderer {
  const gl = assertHtmlInCanvasWebglSupport(canvas);
  const textureCache = new CanvasFlowHtmlTextureCache({ gl });
  let resources: CanvasFlowWebglResources | null =
    createCanvasFlowWebglResources(gl);
  const state: WebglRendererState = {
    contextLost: false,
    frameId: null,
    frameNumber: 0,
    pendingUploadStats: createEmptyTextureUploadStats(),
    previousInteractiveNodeIds: new Set<string>(),
    rendererTransformChangedNodeIds: new Set<string>(),
    totalTextureEvictions: 0,
    totalTextureUploadMs: 0,
    totalTextureUploads: 0,
  };
  let inputs = initialInputs;
  let destroyed = false;

  canvas.dataset.rendererMode = "webgl-texture-nodes";
  canvas.dataset.webglContextCreated = "true";
  canvas.dataset.webglTextureUploadsThisFrame = "0";

  const requestFrame = (reason: string) => {
    if (destroyed || state.contextLost || state.frameId !== null) {
      return;
    }
    canvas.dataset.webglLastFrameReason = reason;
    state.frameId = window.requestAnimationFrame((now) => {
      state.frameId = null;
      if (destroyed || state.contextLost || !resources) {
        return;
      }
      state.frameNumber += 1;
      renderWebglFrame({
        canvas,
        resources,
        gl,
        inputs,
        now,
        state,
        textureCache,
      });
    });
  };

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    state.contextLost = true;
    if (state.frameId !== null) {
      window.cancelAnimationFrame(state.frameId);
      state.frameId = null;
    }
    textureCache.handleContextLost();
    resources = null;
    canvas.dataset.webglContextLost = "true";
  };
  const handleContextRestored = () => {
    resources = createCanvasFlowWebglResources(gl);
    state.contextLost = false;
    canvas.dataset.webglContextLost = "false";
    textureCache.markDirty("all");
    requestCanvasFlowPaint(canvas);
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);

  return {
    destroy() {
      destroyed = true;
      if (state.frameId !== null) {
        window.cancelAnimationFrame(state.frameId);
        state.frameId = null;
      }
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      textureCache.dispose();
      if (resources) {
        destroyCanvasFlowWebglResources(gl, resources);
        resources = null;
      }
      clearWebglRendererDiagnostics(canvas);
    },
    handleCanvasPaint(event) {
      if (state.contextLost) {
        return;
      }
      const changedElements = getCanvasFlowChangedNodeElements(event);
      textureCache.markDirty(
        getTextureDirtyChangedNodeIds({
          changedElements,
          rendererTransformChangedNodeIds:
            state.rendererTransformChangedNodeIds,
        }),
      );
      clearHandledRendererTransformChanges({
        changedNodeIds: changedElements?.nodeIds,
        rendererTransformChangedNodeIds:
          state.rendererTransformChangedNodeIds,
      });
      const visibleNodes = getVisibleCanvasFlowNodes(inputs);
      const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
      textureCache.releaseUnmounted(
        getMountedCanvasFlowNodeIds(canvas, inputs.nodeElements),
      );
      const uploadStats = textureCache.uploadDirtyVisible({
        frameNumber: state.frameNumber,
        resolveElement: (nodeId) =>
          getCanvasFlowNodeElement({
            canvas,
            nodeElements: inputs.nodeElements,
            nodeId,
          }),
        visibleNodeIds,
        visibleNodes,
      });
      state.totalTextureEvictions += uploadStats.evictions;
      state.totalTextureUploads += uploadStats.uploadCount;
      state.totalTextureUploadMs += uploadStats.uploadMs;
      state.pendingUploadStats = uploadStats;
      canvas.dataset.webglDirtyNodes = String(textureCache.dirtyCount);
      canvas.dataset.webglTextureUploadRequestsThisPaint = String(
        uploadStats.dirtyVisibleEntries,
      );
      requestFrame("paint");
    },
    markNodesDirty(nodeIds, reason) {
      textureCache.markDirty(nodeIds);
      canvas.dataset.webglDirtyNodes = String(textureCache.dirtyCount);
      canvas.dataset.webglLastTexturePaintReason = reason;
      requestCanvasFlowPaint(canvas);
    },
    requestFrame,
    resize(size: CanvasFlowSize) {
      inputs = { ...inputs, size };
      requestFrame("resize");
    },
    updateInputs(nextInputs) {
      inputs = nextInputs;
      textureCache.releaseUnmounted(
        getMountedCanvasFlowNodeIds(canvas, inputs.nodeElements),
      );
      canvas.dataset.webglDirtyNodes = String(textureCache.dirtyCount);
    },
  };
}

function renderWebglFrame({
  canvas,
  gl,
  inputs,
  now,
  resources,
  state,
  textureCache,
}: {
  canvas: HTMLCanvasElement;
  gl: CanvasFlowWebglRenderingContext;
  inputs: CanvasFlowRenderInputs;
  now: number;
  resources: CanvasFlowWebglResources;
  state: WebglRendererState;
  textureCache: CanvasFlowHtmlTextureCache;
}) {
  const drawStart = performance.now();
  const size = inputs.size;
  if (size.cssWidth <= 0 || size.cssHeight <= 0) {
    writeWebglStats({
      cacheHits: 0,
      cacheMisses: 0,
      canvas,
      drawMs: performance.now() - drawStart,
      drawnNodes: 0,
      drawnEdges: 0,
      edgeDrawMs: 0,
      inputs,
      now,
      state,
      textureCache,
      transformAssignmentMs: 0,
      visibleNodes: [],
      visibilityScanMs: 0,
    });
    state.pendingUploadStats = createEmptyTextureUploadStats();
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
    colorProgram: resources.colorProgram,
    gl,
    inputs,
  });
  const edgeDrawStart = performance.now();
  const edgeDraw = drawCanvasFlowWebglEdges({
    colorProgram: resources.colorProgram,
    connectionState: inputs.connectionState,
    edgeHandlePositions: inputs.edgeHandlePositions,
    edges: inputs.edges,
    gl,
    size,
    viewport: inputs.viewport,
    wireColor: inputs.wireColor,
  });
  const edgeDrawMs = performance.now() - edgeDrawStart;

  const visibilityScanStart = performance.now();
  const visibleNodes = getVisibleCanvasFlowNodes(inputs);
  const visibilityScanMs = performance.now() - visibilityScanStart;
  const textureDraw = drawTexturedNodeQuads({
    frameNumber: state.frameNumber,
    gl,
    inputs,
    nodes: visibleNodes,
    textureCache,
    textureProgram: resources.textureProgram,
  });
  const transformStart = performance.now();
  const transformResult = assignVisibleNodeTransforms({
    canvas,
    inputs,
    visibleNodes,
  });
  const transformAssignmentMs = performance.now() - transformStart;

  disableCulledCanvasFlowNodePointerEvents({
    nodeElements: inputs.nodeElements,
    previousInteractiveNodeIds: state.previousInteractiveNodeIds,
    nextInteractiveNodeIds: transformResult.nextInteractiveNodeIds,
  });
  state.previousInteractiveNodeIds.clear();
  for (const nodeId of transformResult.nextInteractiveNodeIds) {
    state.previousInteractiveNodeIds.add(nodeId);
  }
  for (const nodeId of transformResult.transformChangedNodeIds) {
    state.rendererTransformChangedNodeIds.add(nodeId);
  }

  textureCache.releaseUnmounted(
    getMountedCanvasFlowNodeIds(canvas, inputs.nodeElements),
  );
  const evictions = textureCache.evictLeastRecentlyUsed(
    new Set(visibleNodes.map((node) => node.id)),
  );
  state.totalTextureEvictions += evictions;
  if (textureDraw.missingTextureNodeIds.size > 0) {
    requestCanvasFlowPaint(canvas);
  }

  const drawMs = performance.now() - drawStart;
  writeWebglStats({
    cacheHits: textureDraw.cacheHits,
    cacheMisses: textureDraw.cacheMisses,
    canvas,
    drawMs,
    drawnNodes: textureDraw.drawnNodes,
    drawnEdges: edgeDraw.drawnEdges,
    edgeDrawMs,
    inputs,
    now,
    state,
    textureCache,
    transformAssignmentMs,
    visibleNodes,
    visibilityScanMs,
  });
  state.pendingUploadStats = createEmptyTextureUploadStats();
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

function drawTexturedNodeQuads({
  frameNumber,
  gl,
  inputs,
  nodes,
  textureCache,
  textureProgram,
}: {
  frameNumber: number;
  gl: CanvasFlowWebglRenderingContext;
  inputs: CanvasFlowRenderInputs;
  nodes: CanvasFlowNodeDrawRecord[];
  textureCache: CanvasFlowHtmlTextureCache;
  textureProgram: CanvasFlowTextureProgram;
}) {
  let cacheHits = 0;
  let cacheMisses = 0;
  let drawnNodes = 0;
  const missingTextureNodeIds = new Set<string>();
  gl.useProgram(textureProgram.program);
  gl.enableVertexAttribArray(textureProgram.positionLocation);
  gl.enableVertexAttribArray(textureProgram.texCoordLocation);
  gl.uniform2f(
    textureProgram.resolutionLocation,
    inputs.size.cssWidth,
    inputs.size.cssHeight,
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

  for (const node of nodes) {
    const entry = textureCache.getEntry(node.id);
    if (!entry || entry.dirty) {
      cacheMisses += 1;
      missingTextureNodeIds.add(node.id);
      continue;
    }
    cacheHits += 1;
    entry.lastUsedFrame = frameNumber;
    const screenRect = getNodeScreenDrawRect(node, inputs.viewport);
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
    drawnNodes += 1;
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return {
    cacheHits,
    cacheMisses,
    drawnNodes,
    missingTextureNodeIds,
  };
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

function createQuadVertices({
  height,
  width,
  x,
  y,
}: {
  height: number;
  width: number;
  x: number;
  y: number;
}) {
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
  const transformChangedNodeIds = new Set<string>();
  for (const node of visibleNodes) {
    const element = getCanvasFlowNodeElement({
      canvas,
      nodeElements: inputs.nodeElements,
      nodeId: node.id,
    });
    if (!element) {
      continue;
    }
    const changed = assignCanvasFlowNodeTransform({
      element,
      node,
      viewport: inputs.viewport,
    });
    if (changed) {
      transformChangedNodeIds.add(node.id);
    }
    nextInteractiveNodeIds.add(node.id);
  }
  return {
    nextInteractiveNodeIds,
    transformChangedNodeIds,
  };
}

function getTextureDirtyChangedNodeIds({
  changedElements,
  rendererTransformChangedNodeIds,
}: {
  changedElements: CanvasFlowChangedNodeElements | undefined;
  rendererTransformChangedNodeIds: ReadonlySet<string>;
}) {
  if (!changedElements || changedElements.nodeIds.size === 0) {
    return new Set<string>();
  }
  const textureDirtyNodeIds = new Set<string>();
  for (const nodeId of changedElements.nodeIds) {
    // Browser paint events can report descendants after our own wrapper
    // transform updates. Those transforms move hit targets only; they do not
    // change the source pixels that belong in the texture cache.
    const rendererTransformOnly = rendererTransformChangedNodeIds.has(nodeId);
    if (!rendererTransformOnly) {
      textureDirtyNodeIds.add(nodeId);
    }
  }
  return textureDirtyNodeIds;
}

function clearHandledRendererTransformChanges({
  changedNodeIds,
  rendererTransformChangedNodeIds,
}: {
  changedNodeIds: ReadonlySet<string> | undefined;
  rendererTransformChangedNodeIds: Set<string>;
}) {
  if (!changedNodeIds) {
    return;
  }
  for (const nodeId of changedNodeIds) {
    rendererTransformChangedNodeIds.delete(nodeId);
  }
}

function getVisibleCanvasFlowNodes(inputs: CanvasFlowRenderInputs) {
  const visibleRect = expandWorldRect(
    getVisibleWorldRect(inputs.size, inputs.viewport),
    DEFAULT_OVERSCAN,
  );
  return getVisibleNodeDrawRecords({
    nodes: inputs.nodes,
    nodeElements: inputs.nodeElements,
    visibleRect,
  });
}

function getMountedCanvasFlowNodeIds(
  canvas: HTMLCanvasElement,
  nodeElements: CanvasFlowRenderInputs["nodeElements"],
) {
  const nodeIds = new Set(nodeElements.keys());
  for (const child of canvas.children) {
    if (child instanceof HTMLElement && child.dataset.id) {
      nodeIds.add(child.dataset.id);
    }
  }
  return nodeIds;
}

function createCanvasFlowWebglResources(
  gl: CanvasFlowWebglRenderingContext,
): CanvasFlowWebglResources {
  return {
    colorProgram: createCanvasFlowColorProgram(gl),
    textureProgram: createCanvasFlowTextureProgram(gl),
  };
}

function destroyCanvasFlowWebglResources(
  gl: CanvasFlowWebglRenderingContext,
  resources: CanvasFlowWebglResources,
) {
  destroyCanvasFlowColorProgram(gl, resources.colorProgram);
  destroyCanvasFlowTextureProgram(gl, resources.textureProgram);
}

function createEmptyTextureUploadStats(): CanvasFlowTextureUploadStats {
  return {
    createdEntries: 0,
    dirtyVisibleEntries: 0,
    entryCount: 0,
    estimatedBytes: 0,
    evictions: 0,
    resizedEntries: 0,
    uploadCount: 0,
    uploadMs: 0,
  };
}

function writeWebglStats({
  cacheHits,
  cacheMisses,
  canvas,
  drawMs,
  drawnNodes,
  drawnEdges,
  edgeDrawMs,
  inputs,
  now,
  state,
  textureCache,
  transformAssignmentMs,
  visibleNodes,
  visibilityScanMs,
}: {
  cacheHits: number;
  cacheMisses: number;
  canvas: HTMLCanvasElement;
  drawMs: number;
  drawnNodes: number;
  drawnEdges: number;
  edgeDrawMs: number;
  inputs: CanvasFlowRenderInputs;
  now: number;
  state: WebglRendererState;
  textureCache: CanvasFlowHtmlTextureCache;
  transformAssignmentMs: number;
  visibleNodes: CanvasFlowNodeDrawRecord[];
  visibilityScanMs: number;
}) {
  writeWebglFrameTextureStats({
    cacheHits,
    cacheMisses,
    canvas,
    state,
    textureCache,
  });
  if (!shouldWriteWebglStats(canvas, state, now)) {
    return;
  }
  canvas.dataset.paintSequence = String(
    Number.parseInt(canvas.dataset.paintSequence ?? "0", 10) + 1,
  );
  canvas.dataset.visibleNodes = String(visibleNodes.length);
  canvas.dataset.drawnNodes = String(drawnNodes);
  canvas.dataset.webglDrawnEdges = String(drawnEdges);
  canvas.dataset.registeredNodes = String(inputs.nodes.length);
  canvas.dataset.mountedNodes = String(inputs.nodeElements.size);
  canvas.dataset.edgeCount = String(inputs.edges.length);
  canvas.dataset.edgeDrawMs = edgeDrawMs.toFixed(2);
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
}

function writeWebglFrameTextureStats({
  cacheHits,
  cacheMisses,
  canvas,
  state,
  textureCache,
}: {
  cacheHits: number;
  cacheMisses: number;
  canvas: HTMLCanvasElement;
  state: WebglRendererState;
  textureCache: CanvasFlowHtmlTextureCache;
}) {
  canvas.dataset.webglTextureUploadsThisFrame = String(
    state.pendingUploadStats.uploadCount,
  );
  canvas.dataset.webglTextureUploadMs =
    state.pendingUploadStats.uploadMs.toFixed(2);
  canvas.dataset.webglTextureUploadMsTotal =
    state.totalTextureUploadMs.toFixed(2);
  canvas.dataset.webglTextureUploadRequestsThisPaint = String(
    state.pendingUploadStats.dirtyVisibleEntries,
  );
  canvas.dataset.webglTextureUploadsTotal = String(state.totalTextureUploads);
  canvas.dataset.webglTextureEntries = String(textureCache.size);
  canvas.dataset.webglTextureCacheHits = String(cacheHits);
  canvas.dataset.webglTextureCacheMisses = String(cacheMisses);
  canvas.dataset.webglTextureEvictions = String(state.totalTextureEvictions);
  canvas.dataset.webglEstimatedTextureBytes = String(
    textureCache.estimatedBytes,
  );
  canvas.dataset.webglDirtyNodes = String(textureCache.dirtyCount);
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
  delete canvas.dataset.webglContextLost;
  delete canvas.dataset.webglDirtyNodes;
  delete canvas.dataset.webglDrawMs;
  delete canvas.dataset.webglDrawnEdges;
  delete canvas.dataset.webglEstimatedTextureBytes;
  delete canvas.dataset.webglFrame;
  delete canvas.dataset.webglLastFrameReason;
  delete canvas.dataset.webglLastTexturePaintReason;
  delete canvas.dataset.webglTextureCacheHits;
  delete canvas.dataset.webglTextureCacheMisses;
  delete canvas.dataset.webglTextureEntries;
  delete canvas.dataset.webglTextureEvictions;
  delete canvas.dataset.webglTextureUploadMs;
  delete canvas.dataset.webglTextureUploadMsTotal;
  delete canvas.dataset.webglTextureUploadRequestsThisPaint;
  delete canvas.dataset.webglTextureUploadsThisFrame;
  delete canvas.dataset.webglTextureUploadsTotal;
}

function positiveModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo;
}
