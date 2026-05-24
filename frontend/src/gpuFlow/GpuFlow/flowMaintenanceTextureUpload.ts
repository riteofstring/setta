import type { GpuSurfaceHandle } from "../GpuSurface";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuNodeUploadBudget } from "../htmlSurfaces/frame";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { GpuFlowProjectionLane } from "../projectionRuntime";

type GpuFlowMaintenanceTextureManager = Pick<
  HtmlSurfaceTextureManager,
  "uploadDirtySurfaceTextures"
>;

type GpuFlowDirtySurfaceTextureUploadResult = {
  readonly budgetExhausted: boolean;
  readonly deferredSurfaceIds?: readonly unknown[] | undefined;
  readonly remainingDirtySurfaceIds?: readonly unknown[] | undefined;
  readonly uploaded: readonly unknown[];
  readonly workSummary: {
    readonly paintUnavailableSurfaceCount: number;
  };
};

export function uploadGpuFlowMaintenanceDirtySurfaceTextures({
  deferResolutionUpdates,
  frame,
  surfaceRef,
  textureManager,
  uploadBudget,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly frame: number;
  readonly surfaceRef: {
    readonly current: Pick<GpuSurfaceHandle, "requestFrame"> | null;
  };
  readonly textureManager: GpuFlowMaintenanceTextureManager;
  readonly uploadBudget: GpuNodeUploadBudget | undefined;
}) {
  const uploadResult = textureManager.uploadDirtySurfaceTextures({
    frame,
    ...(deferResolutionUpdates
      ? {
          deferPassiveUploads: true,
          deferResolutionOnly: true,
        }
      : {}),
    ...uploadBudget,
  });
  requestGpuFlowDirtySurfaceTextureUploadFollowUp({
    source: "maintenance-early",
    surfaceRef,
    uploadResult,
  });
  return uploadResult;
}

export function requestGpuFlowDirtySurfaceTextureUploadFollowUp({
  retryDeferredUploads = false,
  source = "unknown",
  surfaceRef,
  uploadResult,
}: {
  readonly retryDeferredUploads?: boolean | undefined;
  readonly source?: string | undefined;
  readonly surfaceRef: {
    readonly current: Pick<GpuSurfaceHandle, "requestFrame"> | null;
  };
  readonly uploadResult:
    | GpuFlowDirtySurfaceTextureUploadResult
    | null
    | undefined;
}) {
  if (!uploadResult) {
    return;
  }
  const requestedFrames = selectGpuFlowDirtySurfaceTextureUploadFollowUpFrames({
    retryDeferredUploads,
    uploadResult,
  });
  requestGpuFlowSurfaceFrames(surfaceRef.current, requestedFrames);
  recordGpuFlowDirtySurfaceTextureUploadDiagnostic({
    requestedFrames,
    retryDeferredUploads,
    source,
    uploadResult,
  });
}

function selectGpuFlowDirtySurfaceTextureUploadFollowUpFrames({
  retryDeferredUploads,
  uploadResult,
}: {
  readonly retryDeferredUploads: boolean;
  readonly uploadResult: GpuFlowDirtySurfaceTextureUploadResult;
}): readonly GpuFrameReason[] {
  if (
    hasGpuFlowDirtySurfaceTextureUploadWorkRemaining({
      retryDeferredUploads,
      uploadResult,
    })
  ) {
    return ["manual", "texture-upload"];
  }
  return uploadResult.uploaded.length > 0 ? ["manual"] : [];
}

function hasGpuFlowDirtySurfaceTextureUploadWorkRemaining({
  retryDeferredUploads,
  uploadResult,
}: {
  readonly retryDeferredUploads: boolean;
  readonly uploadResult: GpuFlowDirtySurfaceTextureUploadResult;
}): boolean {
  return (
    uploadResult.budgetExhausted ||
    uploadResult.workSummary.paintUnavailableSurfaceCount > 0 ||
    hasGpuFlowDeferredSurfaceTextureUploadRetry({
      retryDeferredUploads,
      uploadResult,
    })
  );
}

function hasGpuFlowDeferredSurfaceTextureUploadRetry({
  retryDeferredUploads,
  uploadResult,
}: {
  readonly retryDeferredUploads: boolean;
  readonly uploadResult: GpuFlowDirtySurfaceTextureUploadResult;
}): boolean {
  return (
    retryDeferredUploads && (uploadResult.deferredSurfaceIds?.length ?? 0) > 0
  );
}

function requestGpuFlowSurfaceFrames(
  surface: Pick<GpuSurfaceHandle, "requestFrame"> | null,
  frameReasons: readonly GpuFrameReason[],
): void {
  for (const frameReason of frameReasons) {
    surface?.requestFrame(frameReason);
  }
}

export function shouldUploadGpuFlowMaintenanceDirtySurfaceTexturesEarly({
  frameReasons,
  publicationLane,
}: {
  readonly frameReasons: readonly GpuFrameReason[];
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
}): boolean {
  return (
    publicationLane === "maintenance" || frameReasons.includes("texture-upload")
  );
}

function recordGpuFlowDirtySurfaceTextureUploadDiagnostic({
  requestedFrames,
  retryDeferredUploads,
  source,
  uploadResult,
}: {
  readonly requestedFrames: readonly GpuFrameReason[];
  readonly retryDeferredUploads: boolean;
  readonly source: string;
  readonly uploadResult: GpuFlowDirtySurfaceTextureUploadResult;
}) {
  const view = globalThis as typeof globalThis & {
    __SETTA_GPU_FLOW_DIRTY_SURFACE_TEXTURE_UPLOADS__?: unknown[];
  };
  const uploads = view.__SETTA_GPU_FLOW_DIRTY_SURFACE_TEXTURE_UPLOADS__ ?? [];
  uploads.push({
    budgetExhausted: uploadResult.budgetExhausted,
    deferredSurfaceCount: uploadResult.deferredSurfaceIds?.length ?? 0,
    paintUnavailableSurfaceCount:
      uploadResult.workSummary.paintUnavailableSurfaceCount,
    remainingDirtySurfaceCount:
      uploadResult.remainingDirtySurfaceIds?.length ?? 0,
    requestedFrames,
    retryDeferredUploads,
    source,
    uploadedSurfaceCount: uploadResult.uploaded.length,
  });
  view.__SETTA_GPU_FLOW_DIRTY_SURFACE_TEXTURE_UPLOADS__ = uploads.slice(-20);
}
