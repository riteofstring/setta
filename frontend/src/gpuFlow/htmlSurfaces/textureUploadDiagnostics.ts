import type { DirtyNodeState, DirtyNodeWorkKind } from "../dirtyTracking";

import type { CommittedHtmlSurfaceTextureSnapshot } from "./textures";
import type { HtmlSurfaceTextureUploadResult } from "./textureTiles";

export type UploadDirtyHtmlSurfaceTexturesResult = {
  readonly budgetExhausted: boolean;
  readonly diagnostics: readonly HtmlSurfaceTextureUploadDiagnostic[];
  readonly deferredSurfaceIds: readonly string[];
  readonly remainingDirtySurfaceIds: readonly string[];
  readonly skippedSurfaceIds: readonly string[];
  readonly skippedUploadBytes: number;
  readonly uploaded: readonly CommittedHtmlSurfaceTextureSnapshot[];
  readonly uploadedBytes: number;
  readonly workSummary: HtmlSurfaceTextureUploadWorkSummary;
};

export type HtmlSurfaceTextureUploadNoWorkReason =
  | "all-work-deferred"
  | "budget-exhausted"
  | "no-dirty-surfaces"
  | "paint-unavailable"
  | "skipped"
  | null;

export type HtmlSurfaceTextureUploadWorkSummary = {
  readonly deferredSurfaceCount: number;
  readonly initialDirtyWorkCounts: HtmlSurfaceTextureDirtyWorkCounts;
  readonly initialDirtySurfaceCount: number;
  readonly noUploadReason: HtmlSurfaceTextureUploadNoWorkReason;
  readonly paintUnavailableSurfaceCount: number;
  readonly remainingDirtyWorkCounts: HtmlSurfaceTextureDirtyWorkCounts;
  readonly remainingDirtySurfaceCount: number;
  readonly skippedSurfaceCount: number;
  readonly uploadableRemainingDirtyWorkCounts: HtmlSurfaceTextureDirtyWorkCounts;
  readonly uploadableRemainingDirtySurfaceCount: number;
  readonly uploadedSurfaceCount: number;
};

export type HtmlSurfaceTextureDirtyWorkCounts = Record<
  DirtyNodeWorkKind,
  number
>;

export type DirtyHtmlSurfaceUploadOutcome =
  | {
      readonly dirtyTileBytes: number;
      readonly dirtyTileCount: number;
      readonly durationMs: number;
      readonly record: CommittedHtmlSurfaceTextureSnapshot;
      readonly upload: HtmlSurfaceTextureUploadResult;
    }
  | "deferred"
  | "missing"
  | "paint-unavailable";

export type HtmlSurfaceTextureUploadDiagnostic = {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly dirtyContent: boolean;
  readonly dirtyResolution: boolean;
  readonly dirtySourceRect?:
    | {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      }
    | undefined;
  readonly dirtyTileBytes: number;
  readonly dirtyTileCount: number;
  readonly durationMs: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly priority: string;
  readonly reasons: readonly string[];
  readonly surfaceId: string;
  readonly textureBytes: number;
  readonly textureLayoutKind: string;
  readonly uploadedBytes: number;
  readonly uploadedTextureCount: number;
  readonly uploadedTileCount: number;
  readonly workKinds: readonly DirtyNodeWorkKind[];
};

export function createHtmlSurfaceTextureDirtyWorkCounts(
  dirtySurfaces: readonly Pick<DirtyNodeState, "workKinds">[],
): HtmlSurfaceTextureDirtyWorkCounts {
  const counts = createEmptyHtmlSurfaceTextureDirtyWorkCounts();
  for (const dirtySurface of dirtySurfaces) {
    for (const workKind of dirtySurface.workKinds) {
      counts[workKind] += 1;
    }
  }
  return counts;
}

export function createHtmlSurfaceTextureUploadWorkSummary({
  initialDirtySurfaces,
  paintUnavailableSurfaceCount,
  remainingDirtySurfaces,
  skippedSurfaceCount,
  uploadableRemainingDirtySurfaces,
  uploadedSurfaceCount,
}: {
  readonly initialDirtySurfaces: readonly DirtyNodeState[];
  readonly paintUnavailableSurfaceCount: number;
  readonly remainingDirtySurfaces: readonly DirtyNodeState[];
  readonly skippedSurfaceCount: number;
  readonly uploadableRemainingDirtySurfaces: readonly DirtyNodeState[];
  readonly uploadedSurfaceCount: number;
}): HtmlSurfaceTextureUploadWorkSummary {
  const initialDirtySurfaceCount = initialDirtySurfaces.length;
  const remainingDirtySurfaceCount = remainingDirtySurfaces.length;
  const uploadableRemainingDirtySurfaceCount =
    uploadableRemainingDirtySurfaces.length;
  const deferredSurfaceCount = Math.max(
    0,
    remainingDirtySurfaceCount -
      uploadableRemainingDirtySurfaceCount -
      paintUnavailableSurfaceCount,
  );
  const noUploadReason = resolveTextureUploadNoWorkReason({
    deferredSurfaceCount,
    initialDirtySurfaceCount,
    paintUnavailableSurfaceCount,
    skippedSurfaceCount,
    uploadableRemainingDirtySurfaceCount,
    uploadedSurfaceCount,
  });

  return {
    deferredSurfaceCount,
    initialDirtyWorkCounts:
      createHtmlSurfaceTextureDirtyWorkCounts(initialDirtySurfaces),
    initialDirtySurfaceCount,
    noUploadReason,
    paintUnavailableSurfaceCount,
    remainingDirtyWorkCounts: createHtmlSurfaceTextureDirtyWorkCounts(
      remainingDirtySurfaces,
    ),
    remainingDirtySurfaceCount,
    skippedSurfaceCount,
    uploadableRemainingDirtyWorkCounts: createHtmlSurfaceTextureDirtyWorkCounts(
      uploadableRemainingDirtySurfaces,
    ),
    uploadableRemainingDirtySurfaceCount,
    uploadedSurfaceCount,
  };
}

export function createHtmlSurfaceTextureUploadDiagnostic({
  dirtySurface,
  dirtyTileBytes,
  dirtyTileCount,
  durationMs,
  record,
  upload,
}: {
  readonly dirtySurface: DirtyNodeState;
  readonly dirtyTileBytes: number;
  readonly dirtyTileCount: number;
  readonly durationMs: number;
  readonly record: CommittedHtmlSurfaceTextureSnapshot;
  readonly upload: HtmlSurfaceTextureUploadResult;
}): HtmlSurfaceTextureUploadDiagnostic {
  return {
    cssHeight: record.cssHeight,
    cssWidth: record.cssWidth,
    dirtyContent: dirtySurface.dirtyContent,
    dirtyResolution: dirtySurface.dirtyResolution,
    ...(dirtySurface.sourceRect
      ? { dirtySourceRect: dirtySurface.sourceRect }
      : {}),
    dirtyTileBytes,
    dirtyTileCount,
    durationMs,
    pixelHeight: record.pixelHeight,
    pixelWidth: record.pixelWidth,
    priority: dirtySurface.priority,
    reasons: dirtySurface.reasons,
    surfaceId: dirtySurface.nodeId,
    textureBytes: record.textureBytes,
    textureLayoutKind: record.textureLayout.kind,
    uploadedBytes: upload.uploadedBytes,
    uploadedTextureCount: upload.uploadedTextureCount,
    uploadedTileCount: upload.uploadedTileIds.length,
    workKinds: dirtySurface.workKinds,
  };
}

function resolveTextureUploadNoWorkReason({
  deferredSurfaceCount,
  initialDirtySurfaceCount,
  paintUnavailableSurfaceCount,
  skippedSurfaceCount,
  uploadableRemainingDirtySurfaceCount,
  uploadedSurfaceCount,
}: Pick<
  HtmlSurfaceTextureUploadWorkSummary,
  | "deferredSurfaceCount"
  | "initialDirtySurfaceCount"
  | "paintUnavailableSurfaceCount"
  | "skippedSurfaceCount"
  | "uploadableRemainingDirtySurfaceCount"
  | "uploadedSurfaceCount"
>): HtmlSurfaceTextureUploadNoWorkReason {
  if (uploadedSurfaceCount > 0) {
    return null;
  }
  if (initialDirtySurfaceCount === 0) {
    return "no-dirty-surfaces";
  }
  if (paintUnavailableSurfaceCount > 0) {
    return "paint-unavailable";
  }
  if (uploadableRemainingDirtySurfaceCount > 0) {
    return "budget-exhausted";
  }
  if (deferredSurfaceCount > 0) {
    return "all-work-deferred";
  }
  if (skippedSurfaceCount > 0) {
    return "skipped";
  }
  return null;
}

function createEmptyHtmlSurfaceTextureDirtyWorkCounts(): HtmlSurfaceTextureDirtyWorkCounts {
  return {
    animation: 0,
    content: 0,
    geometry: 0,
    hover: 0,
    resolution: 0,
    "source-window": 0,
  };
}
