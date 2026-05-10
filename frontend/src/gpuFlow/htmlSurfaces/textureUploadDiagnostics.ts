import type { DirtyNodeState } from "../dirtyTracking";

import type { CommittedHtmlSurfaceTextureSnapshot } from "./textures";
import type { HtmlSurfaceTextureUploadResult } from "./textureTiles";

export type UploadDirtyHtmlSurfaceTexturesResult = {
  readonly budgetExhausted: boolean;
  readonly diagnostics: readonly HtmlSurfaceTextureUploadDiagnostic[];
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
  readonly initialDirtySurfaceCount: number;
  readonly noUploadReason: HtmlSurfaceTextureUploadNoWorkReason;
  readonly paintUnavailableSurfaceCount: number;
  readonly remainingDirtySurfaceCount: number;
  readonly skippedSurfaceCount: number;
  readonly uploadableRemainingDirtySurfaceCount: number;
  readonly uploadedSurfaceCount: number;
};

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
};

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
  };
}
