import type { DirtyNodeMark, DirtyNodeQueue } from "../dirtyTracking";
import type { HtmlInCanvasCanvas } from "../htmlInCanvasTypes";
import type { HtmlSurfaceDirtyRect } from "./textureDirtyTiles";
import {
  resolveDirtyFlags,
  shouldRequestSurfaceTexturePaint,
  shouldUpdatePaintDeferralForDirtySurface,
} from "./textureManagerHelpers";
import type { HtmlSurfaceTexturePaintDeferral } from "./texturePaintDeferral";
import {
  markExistingSurfaceTextureRecordDirty,
  type HtmlSurfaceTextureHandle,
} from "./textureRecords";

export type MarkHtmlSurfaceTextureDirtyInput = Pick<
  DirtyNodeMark,
  "content" | "frame" | "priority" | "reason" | "resolution"
> & {
  readonly deferUploadUntilPaint?: boolean | undefined;
  readonly requestPaint?: boolean | undefined;
  readonly sourceRect?: HtmlSurfaceDirtyRect | undefined;
  readonly surfaceId: string;
};

export function markHtmlSurfaceTextureDirty({
  canvas,
  dirtyQueue,
  input,
  paintDeferral,
  record,
}: {
  readonly canvas: HtmlInCanvasCanvas | null;
  readonly dirtyQueue: DirtyNodeQueue;
  readonly input: MarkHtmlSurfaceTextureDirtyInput;
  readonly paintDeferral: HtmlSurfaceTexturePaintDeferral;
  readonly record: HtmlSurfaceTextureHandle | undefined;
}): boolean {
  const dirtyFlags = resolveDirtyFlags(input);
  const shouldQueueDirtySurface = markSurfaceTextureRecordDirty({
    dirtyFlags,
    input,
    record,
  });
  const shouldUpdatePaintDeferral = shouldUpdatePaintDeferralForDirtySurface({
    committedDirtyContent: record?.committed.dirtyContent,
    committedDirtyResolution: record?.committed.dirtyResolution,
    deferUploadUntilPaint: input.deferUploadUntilPaint,
    dirtyFlags,
    shouldQueueDirtySurface,
  });

  markTexturePaintDeferralIfNeeded({
    input,
    paintDeferral,
    shouldQueueDirtySurface,
    shouldUpdatePaintDeferral,
  });
  queueDirtySurfaceTextureIfNeeded({
    dirtyFlags,
    dirtyQueue,
    input,
    record,
    shouldQueueDirtySurface,
  });
  requestSurfaceTexturePaintIfNeeded({
    canvas,
    input,
    shouldQueueDirtySurface,
    shouldUpdatePaintDeferral,
  });
  return shouldQueueDirtySurface;
}

function markSurfaceTextureRecordDirty({
  dirtyFlags,
  input,
  record,
}: {
  readonly dirtyFlags: ReturnType<typeof resolveDirtyFlags>;
  readonly input: MarkHtmlSurfaceTextureDirtyInput;
  readonly record: HtmlSurfaceTextureHandle | undefined;
}): boolean {
  return record
    ? markExistingSurfaceTextureRecordDirty(record, dirtyFlags, input)
    : true;
}

function markTexturePaintDeferralIfNeeded({
  input,
  paintDeferral,
  shouldQueueDirtySurface,
  shouldUpdatePaintDeferral,
}: {
  readonly input: MarkHtmlSurfaceTextureDirtyInput;
  readonly paintDeferral: HtmlSurfaceTexturePaintDeferral;
  readonly shouldQueueDirtySurface: boolean;
  readonly shouldUpdatePaintDeferral: boolean;
}): void {
  if (shouldQueueDirtySurface || shouldUpdatePaintDeferral) {
    paintDeferral.markDirty(input);
  }
}

function queueDirtySurfaceTextureIfNeeded({
  dirtyFlags,
  dirtyQueue,
  input,
  record,
  shouldQueueDirtySurface,
}: {
  readonly dirtyFlags: ReturnType<typeof resolveDirtyFlags>;
  readonly dirtyQueue: DirtyNodeQueue;
  readonly input: MarkHtmlSurfaceTextureDirtyInput;
  readonly record: HtmlSurfaceTextureHandle | undefined;
  readonly shouldQueueDirtySurface: boolean;
}): void {
  if (!shouldQueueDirtySurface) {
    return;
  }
  dirtyQueue.markDirty({
    content: dirtyFlags.content,
    frame: input.frame,
    nodeId: input.surfaceId,
    priority: input.priority ?? record?.committed.priority,
    reason: input.reason,
    resolution: dirtyFlags.resolution,
    ...(input.sourceRect ? { sourceRect: input.sourceRect } : {}),
  });
}

function requestSurfaceTexturePaintIfNeeded({
  canvas,
  input,
  shouldQueueDirtySurface,
  shouldUpdatePaintDeferral,
}: {
  readonly canvas: HtmlInCanvasCanvas | null;
  readonly input: MarkHtmlSurfaceTextureDirtyInput;
  readonly shouldQueueDirtySurface: boolean;
  readonly shouldUpdatePaintDeferral: boolean;
}): void {
  if (
    shouldRequestSurfaceTexturePaint({
      requestPaint: input.requestPaint,
      shouldQueueDirtySurface,
      shouldUpdatePaintDeferral,
    })
  ) {
    canvas?.requestPaint();
  }
}
