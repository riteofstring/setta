import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";
import type { GpuEdgePaletteInput, GpuGridInput } from "../gpuPipelines";
import type { GpuCanvasSize } from "../gpuRenderer";
import { normalizeGpuViewport, type GpuViewportInput } from "../viewportMath";
import type {
  GpuHtmlSurfaceOverlayLayout,
  GpuNodeDomTransformSyncCache,
  GpuNodeLayout,
  GpuNodeUploadBudget,
  GpuVisibleNodeQuad,
} from "./frame";
import {
  syncGpuNodeDomTransforms,
  syncGpuNodeDomTransformsFromQuads,
} from "./frameDomTransformSync";
import { toGpuHtmlSurfaceOverlayNodeLayouts } from "./frameOverlayLayers";
import type {
  PreparedHtmlSurfaceRenderSubmission,
  RenderHtmlSurfacesInput,
  RenderHtmlSurfacesResult,
} from "./renderer";
import { HTML_SURFACE_CAPTURE_ONLY_SOURCE_ATTRIBUTE } from "./sourceDom";
import { resolveVisibleNodeTexturePriority } from "./sourceTransforms";
import {
  createHtmlSurfaceTextureUploadWorkSummary,
  type UploadDirtyHtmlSurfaceTexturesResult,
} from "./textureUploadDiagnostics";
import type { HtmlSurfaceTextureManager } from "./textures";
import type { HtmlSurfaceVisualScene } from "./visualScene";

export type GpuNodeTextureController = Pick<
  HtmlSurfaceTextureManager,
  | "getCommittedSurfaceTexture"
  | "getMemorySnapshot"
  | "getSurfaceTextureLifecycleDiagnostics"
  | "evictSurfaceTextures"
  | "markSurfaceTextureDirty"
  | "registerSurfaceTexture"
  | "uploadDirtySurfaceTextures"
>;

export type GpuNodeSurfaceRenderTarget = {
  prepare?: (
    input: RenderHtmlSurfacesInput,
  ) => PreparedHtmlSurfaceRenderSubmission;
  render(input: RenderHtmlSurfacesInput): RenderHtmlSurfacesResult;
};

export function syncHtmlSurfaceFrameDomTransforms({
  activeNodeIds,
  domTransformCache,
  elementByNodeId,
  htmlSurfaceOverlays,
  nodes,
  retainedNodeIds,
  viewport,
  visibleSurfaceIds,
  visibleSurfaceQuads,
}: {
  readonly activeNodeIds: ReadonlySet<string>;
  readonly domTransformCache: GpuNodeDomTransformSyncCache | undefined;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly htmlSurfaceOverlays:
    | readonly GpuHtmlSurfaceOverlayLayout[]
    | undefined;
  readonly nodes: readonly GpuNodeLayout[];
  readonly retainedNodeIds: ReadonlySet<string>;
  readonly viewport: GpuViewportInput;
  readonly visibleSurfaceIds: ReadonlySet<string>;
  readonly visibleSurfaceQuads: readonly GpuVisibleNodeQuad[];
}) {
  if (domTransformCache) {
    return syncGpuNodeDomTransformsFromQuads({
      activeNodeIds,
      cache: domTransformCache,
      elementByNodeId,
      retainNodeIds: retainedNodeIds,
      visibleQuads: visibleSurfaceQuads,
      viewport,
    });
  }
  return syncGpuNodeDomTransforms({
    activeNodeIds,
    elementByNodeId,
    nodes: [
      ...nodes,
      ...toGpuHtmlSurfaceOverlayNodeLayouts(htmlSurfaceOverlays),
    ],
    visibleNodeIds: visibleSurfaceIds,
    viewport,
  });
}

export function resolveHtmlSurfaceFrameTextureWork({
  activeSurfaceIds,
  canvasSize,
  deferResolutionUpdates,
  elementByNodeId,
  frame,
  nodeSurfaceIds,
  textureManager,
  textureWorkMode,
  uploadBudget,
  viewport,
  visibleSurfaceQuads,
}: {
  readonly activeSurfaceIds: ReadonlySet<string>;
  readonly canvasSize: GpuCanvasSize;
  readonly deferResolutionUpdates: boolean | undefined;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly nodeSurfaceIds: ReadonlySet<string>;
  readonly textureManager: GpuNodeTextureController;
  readonly textureWorkMode: "content" | "projection";
  readonly uploadBudget: GpuNodeUploadBudget | undefined;
  readonly viewport: GpuViewportInput;
  readonly visibleSurfaceQuads: readonly GpuVisibleNodeQuad[];
}): {
  readonly missingElementNodeIds: readonly string[];
  readonly uploadResult: UploadDirtyHtmlSurfaceTexturesResult;
} {
  if (textureWorkMode === "projection") {
    return {
      missingElementNodeIds: [],
      uploadResult: createProjectionOnlyUploadResult(),
    };
  }
  return {
    missingElementNodeIds: registerVisibleGpuNodeTextures({
      activeSurfaceIds,
      deferResolutionUpdates,
      devicePixelRatio: canvasSize.devicePixelRatio,
      elementByNodeId,
      frame,
      quads: visibleSurfaceQuads,
      textureManager,
      viewport,
    }).filter((nodeId) => nodeSurfaceIds.has(nodeId)),
    uploadResult: uploadGpuNodeTextures({
      activeSurfaceIds,
      deferResolutionUpdates,
      frame,
      textureManager,
      uploadBudget,
    }),
  };
}

export function renderHtmlSurfaceVisualScene({
  canvasSize,
  clearColor,
  edgePalette,
  edges,
  grid,
  renderer,
  scene,
  viewport,
}: {
  readonly canvasSize: GpuCanvasSize;
  readonly clearColor: GPUColorDict | undefined;
  readonly edgePalette: GpuEdgePaletteInput | undefined;
  readonly edges: readonly GpuEdgeBufferInput[] | undefined;
  readonly grid: GpuGridInput | undefined;
  readonly renderer: GpuNodeSurfaceRenderTarget;
  readonly scene: HtmlSurfaceVisualScene;
  readonly viewport: GpuViewportInput;
}): RenderHtmlSurfacesResult {
  return renderer.render({
    canvasSize,
    clearColor,
    ...(edgePalette === undefined ? {} : { edgePalette }),
    ...(edges === undefined ? {} : { edges }),
    ...(grid === undefined ? {} : { grid }),
    scene,
    viewport,
  });
}

export function prepareHtmlSurfaceVisualSceneSubmission({
  canvasSize,
  clearColor,
  edgePalette,
  edges,
  grid,
  renderer,
  scene,
  viewport,
}: {
  readonly canvasSize: GpuCanvasSize;
  readonly clearColor: GPUColorDict | undefined;
  readonly edgePalette: GpuEdgePaletteInput | undefined;
  readonly edges: readonly GpuEdgeBufferInput[] | undefined;
  readonly grid: GpuGridInput | undefined;
  readonly renderer: GpuNodeSurfaceRenderTarget;
  readonly scene: HtmlSurfaceVisualScene;
  readonly viewport: GpuViewportInput;
}): PreparedHtmlSurfaceRenderSubmission {
  if (!renderer.prepare) {
    throw new Error(
      "Deferred HTML surface canvas publication requires a renderer with a prepare step.",
    );
  }
  return renderer.prepare({
    canvasSize,
    clearColor,
    ...(edgePalette === undefined ? {} : { edgePalette }),
    ...(edges === undefined ? {} : { edges }),
    ...(grid === undefined ? {} : { grid }),
    scene,
    viewport,
  });
}

export function evictHtmlSurfaceFrameTextures({
  nodeTextureMemoryBudgetBytes,
  protectedTextureSurfaceIds,
  retainedNodeIds,
  textureManager,
  textureWorkMode,
  visibleSurfaceIds,
}: {
  readonly nodeTextureMemoryBudgetBytes: number | undefined;
  readonly protectedTextureSurfaceIds:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly retainedNodeIds: ReadonlySet<string>;
  readonly textureManager: GpuNodeTextureController;
  readonly textureWorkMode: "content" | "projection";
  readonly visibleSurfaceIds: ReadonlySet<string>;
}) {
  if (textureWorkMode === "projection") {
    return createProjectionOnlyEvictionResult({
      textureManager,
      visibleSurfaceIds,
    });
  }
  return textureManager.evictSurfaceTextures({
    ...(nodeTextureMemoryBudgetBytes === undefined
      ? {}
      : { budgetBytes: nodeTextureMemoryBudgetBytes }),
    protectedSurfaceIds: mergeProtectedSurfaceIds(
      retainedNodeIds,
      protectedTextureSurfaceIds,
    ),
    reason: "html-surface-frame",
    visibleSurfaceIds,
  });
}

function createProjectionOnlyUploadResult(): UploadDirtyHtmlSurfaceTexturesResult {
  return {
    budgetExhausted: false,
    deferredSurfaceIds: [],
    diagnostics: [],
    remainingDirtySurfaceIds: [],
    skippedSurfaceIds: [],
    skippedUploadBytes: 0,
    uploaded: [],
    uploadedBytes: 0,
    workSummary: createHtmlSurfaceTextureUploadWorkSummary({
      initialDirtySurfaces: [],
      paintUnavailableSurfaceCount: 0,
      remainingDirtySurfaces: [],
      skippedSurfaceCount: 0,
      uploadableRemainingDirtySurfaces: [],
      uploadedSurfaceCount: 0,
    }),
  };
}

function createProjectionOnlyEvictionResult({
  textureManager,
  visibleSurfaceIds,
}: {
  readonly textureManager: GpuNodeTextureController;
  readonly visibleSurfaceIds: ReadonlySet<string>;
}) {
  const memory = textureManager.getMemorySnapshot({ visibleSurfaceIds });
  return {
    budgetBytes: Number.POSITIVE_INFINITY,
    evictedBytes: 0,
    evictedSurfaceIds: [],
    memory,
    memoryBefore: memory,
    overBudgetBytes: 0,
    protectedSurfaceIds: [],
    reason: "projection-frame",
  };
}

function mergeProtectedSurfaceIds(
  retainedNodeIds: ReadonlySet<string>,
  protectedTextureSurfaceIds:
    | ReadonlySet<string>
    | readonly string[]
    | undefined,
): ReadonlySet<string> {
  if (!protectedTextureSurfaceIds) {
    return retainedNodeIds;
  }
  return new Set([...retainedNodeIds, ...protectedTextureSurfaceIds]);
}

function registerVisibleGpuNodeTextures({
  activeSurfaceIds,
  deferResolutionUpdates,
  devicePixelRatio,
  elementByNodeId,
  frame,
  quads,
  textureManager,
  viewport,
}: {
  readonly activeSurfaceIds: ReadonlySet<string>;
  readonly deferResolutionUpdates: boolean | undefined;
  readonly devicePixelRatio: number;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly quads: readonly GpuVisibleNodeQuad[];
  readonly textureManager: GpuNodeTextureController;
  readonly viewport: GpuViewportInput;
}): string[] {
  const missingElementNodeIds: string[] = [];
  const zoom = normalizeGpuViewport(viewport).zoom;
  for (const quad of quads) {
    const element = elementByNodeId.get(quad.nodeId);
    if (!element) {
      missingElementNodeIds.push(quad.nodeId);
      continue;
    }
    const deferUploadUntilPaint = shouldDeferHtmlSurfaceUploadUntilPaint({
      element,
      surfaceId: quad.nodeId,
      textureManager,
    });
    textureManager.registerSurfaceTexture({
      cssHeight: quad.textureCssHeight ?? quad.height,
      cssWidth: quad.textureCssWidth ?? quad.width,
      ...(deferResolutionUpdates ? { deferResolution: true } : {}),
      ...(deferUploadUntilPaint ? { deferUploadUntilPaint: true } : {}),
      devicePixelRatio,
      element,
      frame,
      priority: resolveVisibleNodeTexturePriority(
        quad.nodeId,
        activeSurfaceIds,
      ),
      surfaceId: quad.nodeId,
      ...(quad.textureContentKey
        ? { textureContentKey: quad.textureContentKey }
        : {}),
      ...(quad.textureSourceRect
        ? { textureSourceRect: quad.textureSourceRect }
        : {}),
      zoom,
    });
  }
  return missingElementNodeIds;
}

function shouldDeferHtmlSurfaceUploadUntilPaint({
  element,
  surfaceId,
  textureManager,
}: {
  readonly element: Element;
  readonly surfaceId: string;
  readonly textureManager: Pick<GpuNodeTextureController, "getCommittedSurfaceTexture">;
}): boolean {
  if (!isCaptureOnlyHtmlSurfaceSource(element)) {
    return false;
  }
  const texture = textureManager.getCommittedSurfaceTexture(surfaceId);
  return !texture || texture.lastUploadFrame < 0;
}

function isCaptureOnlyHtmlSurfaceSource(element: Element): boolean {
  return (
    element.getAttribute(HTML_SURFACE_CAPTURE_ONLY_SOURCE_ATTRIBUTE) === "true"
  );
}

function uploadGpuNodeTextures({
  activeSurfaceIds,
  deferResolutionUpdates,
  frame,
  textureManager,
  uploadBudget,
}: {
  readonly activeSurfaceIds: ReadonlySet<string>;
  readonly deferResolutionUpdates: boolean | undefined;
  readonly frame: number;
  readonly textureManager: GpuNodeTextureController;
  readonly uploadBudget: GpuNodeUploadBudget | undefined;
}) {
  return textureManager.uploadDirtySurfaceTextures({
    frame,
    ...(deferResolutionUpdates
      ? {
          deferPassiveUploads: true,
          deferResolutionOnly: true,
          deferSurfaceIds: activeSurfaceIds,
        }
      : {}),
    ...uploadBudget,
  });
}
