import {
  textureResolutionMatches,
  type TextureResolution,
} from "../textureResolution";
import type { HtmlSurfaceDirtyRect } from "./textureDirtyTiles";
import { pendingTextureResolutionMatches } from "./texturePendingResolution";
import {
  destroyTextureTiles,
  resolutionSnapshot,
  resolveTargetTextureContentKey,
  textureContentKeysEqual,
  textureResolutionFromSnapshot,
  textureSourceRectsEqual,
  type HtmlSurfaceTextureHandle,
} from "./textureRecords";

type RegisteredSurfaceTextureInput = {
  readonly deferResolution?: boolean | undefined;
  readonly textureContentKey?: string | undefined;
  readonly textureSourceRect?: HtmlSurfaceDirtyRect | undefined;
};

export type RegisteredSurfaceTextureUpdateKind =
  | "content"
  | "none"
  | "resolution"
  | "source-rect";

export function resolveRegisteredSurfaceTextureUpdate(
  existing: HtmlSurfaceTextureHandle,
  input: RegisteredSurfaceTextureInput,
  resolution: TextureResolution,
): RegisteredSurfaceTextureUpdateKind {
  if (
    !input.deferResolution &&
    !textureResolutionMatches(resolutionSnapshot(existing), resolution)
  ) {
    return "resolution";
  }
  const textureContentKeyChanged = !textureContentKeysEqual(
    resolveTargetTextureContentKey(existing),
    input.textureContentKey,
  );
  const textureSourceRectChanged = !textureSourceRectsEqual(
    resolveTargetTextureSourceRect(existing),
    input.textureSourceRect,
  );
  if (
    canCommitTextureSourceRectOnlyUpdate({
      existing,
      input,
      textureContentKeyChanged,
      textureSourceRectChanged,
    })
  ) {
    return "source-rect";
  }
  return textureContentKeyChanged || textureSourceRectChanged
    ? "content"
    : "none";
}

export function preparePendingResolutionTextureUpdate(
  existing: HtmlSurfaceTextureHandle,
  input: RegisteredSurfaceTextureInput,
  resolution: TextureResolution,
) {
  if (
    existing.pendingTextureRecord &&
    !pendingTextureResolutionMatches(existing.pendingTextureRecord, resolution)
  ) {
    destroyTextureTiles(existing.pendingTextureRecord.tiles);
    existing.pendingTextureRecord = null;
  }
  existing.pendingResolution = resolution;
  existing.pendingTextureContentKey = input.textureContentKey ?? null;
  existing.pendingTextureSourceRect = input.textureSourceRect ?? null;
}

export function preparePendingContentTextureUpdate(
  existing: HtmlSurfaceTextureHandle,
  input: RegisteredSurfaceTextureInput,
) {
  existing.pendingResolution =
    existing.pendingResolution ??
    textureResolutionFromSnapshot(existing.committed);
  existing.pendingTextureContentKey = input.textureContentKey ?? null;
  existing.pendingTextureSourceRect = input.textureSourceRect ?? null;
}

function canCommitTextureSourceRectOnlyUpdate({
  existing,
  input,
  textureContentKeyChanged,
  textureSourceRectChanged,
}: {
  readonly existing: HtmlSurfaceTextureHandle;
  readonly input: RegisteredSurfaceTextureInput;
  readonly textureContentKeyChanged: boolean;
  readonly textureSourceRectChanged: boolean;
}): boolean {
  return (
    textureSourceRectChanged &&
    !textureContentKeyChanged &&
    input.textureContentKey !== undefined &&
    !existing.pendingResolution &&
    !existing.pendingTextureRecord
  );
}

function resolveTargetTextureSourceRect(
  existing: HtmlSurfaceTextureHandle,
): HtmlSurfaceDirtyRect | undefined {
  return existing.pendingTextureSourceRect === undefined
    ? existing.committed.textureSourceRect
    : existing.pendingTextureSourceRect ?? undefined;
}
