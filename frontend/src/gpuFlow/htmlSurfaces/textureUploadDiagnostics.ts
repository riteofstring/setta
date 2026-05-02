import type { DirtyNodeState } from "../dirtyTracking";

import type { HtmlSurfaceTextureRecord } from "./textures";
import type { HtmlSurfaceTextureUploadResult } from "./textureTiles";

export type UploadDirtyHtmlSurfaceTexturesResult = {
  readonly budgetExhausted: boolean;
  readonly diagnostics: readonly HtmlSurfaceTextureUploadDiagnostic[];
  readonly remainingDirtySurfaceIds: readonly string[];
  readonly skippedSurfaceIds: readonly string[];
  readonly skippedUploadBytes: number;
  readonly uploaded: readonly HtmlSurfaceTextureRecord[];
  readonly uploadedBytes: number;
};

export type DirtyHtmlSurfaceUploadOutcome =
  | {
      readonly dirtyTileBytes: number;
      readonly dirtyTileCount: number;
      readonly durationMs: number;
      readonly record: HtmlSurfaceTextureRecord;
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
  readonly record: HtmlSurfaceTextureRecord;
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
