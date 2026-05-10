import type { GpuFlowRuntime } from "./gpuDevice";
import type { GpuRetainedTextLikeRowSnapshotSource } from "./GpuFlow/retainedTextLikeRowSnapshotSources";
import {
  createHtmlSurfaceTextureManager,
  type HtmlSurfaceTextureManager,
  type HtmlSurfaceTextureMemorySnapshot,
  type HtmlSurfaceTextureUploadDiagnostic,
  type HtmlSurfaceTextureUploadWorkSummary,
} from "./htmlSurfaces/textures";
import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import {
  createRetainedTextLikeRowTextureFlatVisual,
  getRetainedTextLikeRowTextureVisibleSourceRect,
  type RetainedTextLikeRowTextureFrameSurface,
} from "./retainedTextLikeRowTextureVisuals";

type RetainedTextLikeRowTextureUploadBudget = {
  readonly maxBytes?: number | undefined;
  readonly maxDurationMs?: number | undefined;
  readonly maxUploads?: number | undefined;
  readonly now?: (() => number) | undefined;
};

type RetainedTextLikeRowTextureUploadLimits = {
  readonly maxBytes: number;
  readonly maxDurationMs: number;
  readonly maxUploads: number;
  readonly now?: (() => number) | undefined;
};

export type RetainedTextLikeRowTextureManagerOptions = {
  readonly maxFrameUploadedBytes?: number | undefined;
  readonly maxFrameUploadMs?: number | undefined;
  readonly maxTextureBytes?: number | undefined;
  readonly maxUploads?: number | undefined;
  readonly textureUsage?: GPUTextureUsageFlags | undefined;
};

export type RetainedTextLikeRowTextureFrameInput = {
  readonly devicePixelRatio: number;
  readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly sources: readonly GpuRetainedTextLikeRowSnapshotSource[];
  readonly surfaces: readonly RetainedTextLikeRowTextureFrameSurface[];
  readonly uploadBudget?: RetainedTextLikeRowTextureUploadBudget | undefined;
  readonly viewportInteractionActive?: boolean | undefined;
  readonly zoom: number;
};

export type RetainedTextLikeRowTextureFrameResult = {
  readonly budgetExhausted: boolean;
  readonly clippedTextureCount: number;
  readonly diagnosticCount: number;
  readonly evictedBytes: number;
  readonly evictedCount: number;
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly memory: HtmlSurfaceTextureMemorySnapshot;
  readonly missingElementCount: number;
  readonly missingSurfaceCount: number;
  readonly missingTextureCount: number;
  readonly needsFollowUpFrame: boolean;
  readonly readyTextureCount: number;
  readonly registeredSourceCount: number;
  readonly sourceCount: number;
  readonly staleElementCount: number;
  readonly staleTextureCount: number;
  readonly uploadDiagnostics: readonly HtmlSurfaceTextureUploadDiagnostic[];
  readonly uploadedBytes: number;
  readonly uploadCount: number;
  readonly uploadWorkSummary: HtmlSurfaceTextureUploadWorkSummary;
  readonly visibleSourceIds: readonly string[];
  readonly visibleSourceCount: number;
};

type RetainedTextLikeRowTextureRegistrationResult = {
  readonly missingElementCount: number;
  readonly registeredSourceCount: number;
  readonly staleElementCount: number;
};

const DEFAULT_ROW_TEXTURE_UPLOAD_BUDGET_BYTES = 8 * 1024 * 1024;
const DEFAULT_ROW_TEXTURE_UPLOAD_BUDGET_MS = 4;
const DEFAULT_ROW_TEXTURE_UPLOAD_COUNT = 64;
const INTERACTION_ROW_TEXTURE_UPLOAD_BUDGET_BYTES = 1024 * 1024;
const INTERACTION_ROW_TEXTURE_UPLOAD_BUDGET_MS = 1;
const INTERACTION_ROW_TEXTURE_UPLOAD_COUNT = 8;
const DEFAULT_ROW_TEXTURE_MEMORY_BUDGET_BYTES = 96 * 1024 * 1024;

export class RetainedTextLikeRowTextureManager {
  private readonly maxFrameUploadedBytes: number;
  private readonly maxFrameUploadMs: number;
  private readonly maxTextureBytes: number;
  private readonly maxUploads: number;
  private readonly textureManager: HtmlSurfaceTextureManager;

  constructor(
    runtime: Pick<
      GpuFlowRuntime,
      "canvas" | "device" | "maxTextureDimension2D"
    >,
    options: RetainedTextLikeRowTextureManagerOptions = {},
  ) {
    this.maxFrameUploadedBytes =
      options.maxFrameUploadedBytes ?? DEFAULT_ROW_TEXTURE_UPLOAD_BUDGET_BYTES;
    this.maxFrameUploadMs =
      options.maxFrameUploadMs ?? DEFAULT_ROW_TEXTURE_UPLOAD_BUDGET_MS;
    this.maxTextureBytes =
      options.maxTextureBytes ?? DEFAULT_ROW_TEXTURE_MEMORY_BUDGET_BYTES;
    this.maxUploads = options.maxUploads ?? DEFAULT_ROW_TEXTURE_UPLOAD_COUNT;
    this.textureManager = createHtmlSurfaceTextureManager(runtime, {
      maxTextureBytes: this.maxTextureBytes,
      ...(options.textureUsage === undefined
        ? {}
        : { textureUsage: options.textureUsage }),
    });
  }

  destroy() {
    this.textureManager.destroy();
  }

  prepareFrame({
    devicePixelRatio,
    elementBySourceId,
    frame,
    sources,
    surfaces,
    uploadBudget,
    viewportInteractionActive = false,
    zoom,
  }: RetainedTextLikeRowTextureFrameInput): RetainedTextLikeRowTextureFrameResult {
    const registration = this.registerCurrentSourceTextures({
      devicePixelRatio,
      elementBySourceId,
      frame,
      sources,
      viewportInteractionActive,
      zoom,
    });

    const uploadResult = this.uploadDirtySourceTextures({
      frame,
      uploadBudget,
      viewportInteractionActive,
    });
    const visualResult = this.createRowTextVisuals({
      sources,
      surfaceById: createSurfaceById(surfaces),
    });
    const evicted = this.textureManager.evictSurfaceTextures({
      budgetBytes: this.maxTextureBytes,
      reason: "retained-text-like-row-textures",
      visibleSurfaceIds: sources.map((source) => source.sourceId),
    });

    return {
      budgetExhausted: uploadResult.budgetExhausted,
      clippedTextureCount: visualResult.clippedTextureCount,
      diagnosticCount: uploadResult.diagnostics.length,
      evictedBytes: evicted.evictedBytes,
      evictedCount: evicted.evictedSurfaceIds.length,
      flatSurfaces: visualResult.flatSurfaces,
      memory: evicted.memory,
      missingElementCount: registration.missingElementCount,
      missingSurfaceCount: visualResult.missingSurfaceCount,
      missingTextureCount: visualResult.missingTextureCount,
      needsFollowUpFrame: uploadResult.budgetExhausted,
      readyTextureCount: visualResult.readyTextureCount,
      registeredSourceCount: registration.registeredSourceCount,
      sourceCount: sources.length,
      staleElementCount: registration.staleElementCount,
      staleTextureCount: visualResult.staleTextureCount,
      uploadDiagnostics: uploadResult.diagnostics,
      uploadedBytes: uploadResult.uploadedBytes,
      uploadCount: uploadResult.uploaded.length,
      uploadWorkSummary: uploadResult.workSummary,
      visibleSourceCount: visualResult.visibleSourceIds.length,
      visibleSourceIds: visualResult.visibleSourceIds,
    };
  }

  private uploadDirtySourceTextures({
    frame,
    uploadBudget,
    viewportInteractionActive,
  }: {
    readonly frame: number;
    readonly uploadBudget: RetainedTextLikeRowTextureUploadBudget | undefined;
    readonly viewportInteractionActive: boolean;
  }) {
    const uploadLimits = resolveRowTextureUploadLimits({
      defaultLimits: {
        maxBytes: this.maxFrameUploadedBytes,
        maxDurationMs: this.maxFrameUploadMs,
        maxUploads: this.maxUploads,
      },
      uploadBudget,
      viewportInteractionActive,
    });
    return this.textureManager.uploadDirtySurfaceTextures({
      deferResolutionOnly: viewportInteractionActive,
      frame,
      ...uploadLimits,
    });
  }

  private registerCurrentSourceTextures({
    devicePixelRatio,
    elementBySourceId,
    frame,
    sources,
    viewportInteractionActive,
    zoom,
  }: {
    readonly devicePixelRatio: number;
    readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
    readonly frame: number;
    readonly sources: readonly GpuRetainedTextLikeRowSnapshotSource[];
    readonly viewportInteractionActive: boolean;
    readonly zoom: number;
  }): RetainedTextLikeRowTextureRegistrationResult {
    let missingElementCount = 0;
    let registeredSourceCount = 0;
    let staleElementCount = 0;

    for (const source of sources) {
      const element = elementBySourceId.get(source.sourceId);
      if (!element) {
        missingElementCount += 1;
        continue;
      }
      if (!isRetainedTextLikeRowTextureSourceElementCurrent(element, source)) {
        staleElementCount += 1;
        continue;
      }
      registeredSourceCount += 1;
      this.textureManager.registerSurfaceTexture({
        cssHeight: source.sourceHeight,
        cssWidth: source.sourceWidth,
        ...(viewportInteractionActive ? { deferResolution: true } : {}),
        devicePixelRatio,
        element,
        frame,
        priority: "visible",
        surfaceId: source.sourceId,
        textureContentKey: source.sourceKey,
        zoom,
      });
    }

    return {
      missingElementCount,
      registeredSourceCount,
      staleElementCount,
    };
  }

  private createRowTextVisuals({
    sources,
    surfaceById,
  }: {
    readonly sources: readonly GpuRetainedTextLikeRowSnapshotSource[];
    readonly surfaceById: ReadonlyMap<
      string,
      RetainedTextLikeRowTextureFrameSurface
    >;
  }): {
    readonly clippedTextureCount: number;
    readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
    readonly missingSurfaceCount: number;
    readonly missingTextureCount: number;
    readonly readyTextureCount: number;
    readonly staleTextureCount: number;
    readonly visibleSourceIds: readonly string[];
  } {
    const flatSurfaces: HtmlSurfaceFlatVisual[] = [];
    const visibleSourceIds: string[] = [];
    let clippedTextureCount = 0;
    let missingSurfaceCount = 0;
    let missingTextureCount = 0;
    let readyTextureCount = 0;
    let staleTextureCount = 0;

    for (const source of sources) {
      const surface = surfaceById.get(source.surfaceId);
      if (!surface) {
        missingSurfaceCount += 1;
        continue;
      }
      if (
        !getRetainedTextLikeRowTextureVisibleSourceRect(source, surface)
      ) {
        clippedTextureCount += 1;
        continue;
      }
      visibleSourceIds.push(source.sourceId);
      const texture = this.textureManager.getCommittedSurfaceTexture(
        source.sourceId,
      );
      if (!texture || texture.lastUploadFrame < 0) {
        missingTextureCount += 1;
        continue;
      }
      const visual = createRetainedTextLikeRowTextureFlatVisual({
        source,
        surface,
        texture,
      });
      if (!visual) {
        clippedTextureCount += 1;
        continue;
      }
      readyTextureCount += 1;
      if (texture.textureContentKey !== source.sourceKey) {
        staleTextureCount += 1;
      }
      flatSurfaces.push(visual);
    }

    return {
      clippedTextureCount,
      flatSurfaces,
      missingSurfaceCount,
      missingTextureCount,
      readyTextureCount,
      staleTextureCount,
      visibleSourceIds,
    };
  }
}

function isRetainedTextLikeRowTextureSourceElementCurrent(
  element: HTMLElement,
  source: GpuRetainedTextLikeRowSnapshotSource,
): boolean {
  return (
    element.dataset.gpuFlowRetainedTextLikeRowSnapshotSourceKey ===
    source.sourceKey
  );
}

function createSurfaceById(
  surfaces: readonly RetainedTextLikeRowTextureFrameSurface[],
): ReadonlyMap<string, RetainedTextLikeRowTextureFrameSurface> {
  return new Map(surfaces.map((surface) => [surface.surfaceId, surface]));
}

function resolveRowTextureUploadLimits({
  defaultLimits,
  uploadBudget,
  viewportInteractionActive,
}: {
  readonly defaultLimits: RetainedTextLikeRowTextureUploadLimits;
  readonly uploadBudget: RetainedTextLikeRowTextureUploadBudget | undefined;
  readonly viewportInteractionActive: boolean;
}): RetainedTextLikeRowTextureUploadLimits {
  const requestedLimits = applyRowTextureUploadBudget(
    defaultLimits,
    uploadBudget,
  );
  const frameLimits = viewportInteractionActive
    ? clampRowTextureInteractionUploadLimits(requestedLimits)
    : requestedLimits;
  return appendRowTextureUploadNow(frameLimits, uploadBudget?.now);
}

function applyRowTextureUploadBudget(
  defaultLimits: RetainedTextLikeRowTextureUploadLimits,
  uploadBudget: RetainedTextLikeRowTextureUploadBudget | undefined,
): RetainedTextLikeRowTextureUploadLimits {
  return {
    maxBytes: uploadBudget?.maxBytes ?? defaultLimits.maxBytes,
    maxDurationMs:
      uploadBudget?.maxDurationMs ?? defaultLimits.maxDurationMs,
    maxUploads: uploadBudget?.maxUploads ?? defaultLimits.maxUploads,
  };
}

function clampRowTextureInteractionUploadLimits(
  limits: RetainedTextLikeRowTextureUploadLimits,
): RetainedTextLikeRowTextureUploadLimits {
  return {
    maxBytes: Math.min(
      limits.maxBytes,
      INTERACTION_ROW_TEXTURE_UPLOAD_BUDGET_BYTES,
    ),
    maxDurationMs: Math.min(
      limits.maxDurationMs,
      INTERACTION_ROW_TEXTURE_UPLOAD_BUDGET_MS,
    ),
    maxUploads: Math.min(
      limits.maxUploads,
      INTERACTION_ROW_TEXTURE_UPLOAD_COUNT,
    ),
  };
}

function appendRowTextureUploadNow(
  limits: RetainedTextLikeRowTextureUploadLimits,
  now: (() => number) | undefined,
): RetainedTextLikeRowTextureUploadLimits {
  if (now === undefined) {
    return limits;
  }
  return { ...limits, now };
}
