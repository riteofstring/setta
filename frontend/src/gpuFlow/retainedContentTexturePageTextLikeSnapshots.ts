import type {
  GpuQueueWithElementUpload,
  HtmlInCanvasCanvas,
} from "./htmlInCanvasTypes";
import { isMissingElementPaintRecordError } from "./htmlSurfaces/textureManagerHelpers";
import {
  getRetainedContentTextureResourceRegion,
  type RetainedContentTextureResources,
} from "./retainedContentTextureResources";
import type { RetainedTexturePageDescriptor } from "./retainedTexturePages";
import type { GpuRect } from "./viewportMath";

export type RetainedContentTexturePageTextLikeSnapshot = {
  readonly rectCss: GpuRect;
  readonly rowId: string;
  readonly sourceId: string;
  readonly sourceKey: string;
};

type RetainedContentTexturePageTextLikeSnapshotSurface = {
  readonly textLikeSnapshots?:
    | readonly RetainedContentTexturePageTextLikeSnapshot[]
    | undefined;
};

export const EMPTY_TEXT_LIKE_SNAPSHOT_ELEMENTS = new Map<string, HTMLElement>();

export function areRetainedContentTexturePageTextLikeSnapshotsReady({
  descriptor,
  elementBySourceId,
  surface,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
  readonly surface:
    | RetainedContentTexturePageTextLikeSnapshotSurface
    | undefined;
}): boolean {
  const snapshots = resolveRetainedContentTexturePageTextLikeSnapshots({
    descriptor,
    surface,
  });
  if (snapshots.length === 0) {
    return true;
  }
  return snapshots.every((snapshot) =>
    isTextLikeSnapshotElementCurrent(
      elementBySourceId.get(snapshot.sourceId),
      snapshot,
    ),
  );
}

export function uploadRetainedContentTexturePageTextLikeSnapshots({
  descriptor,
  elementBySourceId,
  queue,
  resource,
  snapshots,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
  readonly queue: GPUQueue;
  readonly resource: RetainedContentTextureResources;
  readonly snapshots: readonly RetainedContentTexturePageTextLikeSnapshot[];
}): boolean {
  if (snapshots.length === 0) {
    return true;
  }
  const elementUploadQueue = queue as GpuQueueWithElementUpload;
  if (typeof elementUploadQueue.copyElementImageToTexture !== "function") {
    throw new Error(
      "Setta retained content page upload requires GPUQueue.copyElementImageToTexture for row text snapshots.",
    );
  }
  for (const snapshot of snapshots) {
    if (
      !uploadRetainedContentTexturePageTextLikeSnapshot({
        descriptor,
        element: elementBySourceId.get(snapshot.sourceId),
        queue: elementUploadQueue,
        resource,
        snapshot,
      })
    ) {
      return false;
    }
  }
  return true;
}

function uploadRetainedContentTexturePageTextLikeSnapshot({
  descriptor,
  element,
  queue,
  resource,
  snapshot,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly element: HTMLElement | undefined;
  readonly queue: GpuQueueWithElementUpload;
  readonly resource: RetainedContentTextureResources;
  readonly snapshot: RetainedContentTexturePageTextLikeSnapshot;
}): boolean {
  if (!isTextLikeSnapshotElementCurrent(element, snapshot)) {
    throw new Error(
      `Retained text-like row snapshot ${snapshot.sourceId} is not mounted or current for page upload.`,
    );
  }
  const overlap = intersectRects(snapshot.rectCss, descriptor.sourceRectCss);
  if (!overlap) {
    return true;
  }
  const copy = resolveTextLikeSnapshotPageCopy({
    descriptor,
    overlap,
    resource,
    snapshot,
  });
  if (copy.pixelWidth <= 0 || copy.pixelHeight <= 0) {
    return true;
  }
  try {
    queue.copyElementImageToTexture?.(
      element,
      copy.sourceX,
      copy.sourceY,
      copy.sourceWidth,
      copy.sourceHeight,
      copy.pixelWidth,
      copy.pixelHeight,
      {
        origin: { x: copy.destinationX, y: copy.destinationY, z: 0 },
        texture: resource.texture,
      },
    );
  } catch (error: unknown) {
    if (isMissingElementPaintRecordError(error)) {
      requestTextLikeSnapshotPaint(element);
      return false;
    }
    throw error;
  }
  return true;
}

export function resolveRetainedContentTexturePageTextLikeSnapshots({
  descriptor,
  surface,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly surface:
    | RetainedContentTexturePageTextLikeSnapshotSurface
    | undefined;
}): readonly RetainedContentTexturePageTextLikeSnapshot[] {
  if (!surface?.textLikeSnapshots?.length) {
    return [];
  }
  return surface.textLikeSnapshots.filter((snapshot) =>
    rectsIntersect(snapshot.rectCss, descriptor.sourceRectCss),
  );
}

function rectsIntersect(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function intersectRects(left: GpuRect, right: GpuRect): GpuRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - x,
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - y,
  );
  return width > 0 && height > 0 ? { height, width, x, y } : null;
}

function isTextLikeSnapshotElementCurrent(
  element: HTMLElement | undefined,
  snapshot: RetainedContentTexturePageTextLikeSnapshot,
): element is HTMLElement {
  return (
    element !== undefined &&
    element.dataset.gpuFlowRetainedTextLikeRowSnapshotSourceKey ===
      snapshot.sourceKey &&
    element.dataset.gpuFlowRetainedTextLikeRowSnapshotReadyKey ===
      snapshot.sourceKey
  );
}

function requestTextLikeSnapshotPaint(element: HTMLElement) {
  const canvas = resolveTextLikeSnapshotPaintCanvas(element);
  canvas?.requestPaint?.();
}

function resolveTextLikeSnapshotPaintCanvas(
  element: HTMLElement,
): Partial<HtmlInCanvasCanvas> | null {
  return (
    (element.closest("canvas") as Partial<HtmlInCanvasCanvas> | null) ??
    (element.ownerDocument.querySelector(
      "canvas[data-gpu-flow-surface='true']",
    ) as Partial<HtmlInCanvasCanvas> | null)
  );
}

function resolveTextLikeSnapshotPageCopy({
  descriptor,
  overlap,
  resource,
  snapshot,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly overlap: GpuRect;
  readonly resource: RetainedContentTextureResources;
  readonly snapshot: RetainedContentTexturePageTextLikeSnapshot;
}): {
  readonly destinationX: number;
  readonly destinationY: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly sourceHeight: number;
  readonly sourceWidth: number;
  readonly sourceX: number;
  readonly sourceY: number;
} {
  const sourceX = Math.max(0, Math.floor(overlap.x - snapshot.rectCss.x));
  const sourceY = Math.max(0, Math.floor(overlap.y - snapshot.rectCss.y));
  const sourceWidth = Math.max(1, Math.ceil(overlap.width));
  const sourceHeight = Math.max(1, Math.ceil(overlap.height));
  const textureRegion = getRetainedContentTextureResourceRegion(resource);
  const destinationX =
    textureRegion.x +
    clampInteger(
      Math.floor(
        (overlap.x - descriptor.sourceRectCss.x) * descriptor.lodScale,
      ),
      0,
      Math.max(0, descriptor.pixelWidth - 1),
    );
  const destinationY =
    textureRegion.y +
    clampInteger(
      Math.floor(
        (overlap.y - descriptor.sourceRectCss.y) * descriptor.lodScale,
      ),
      0,
      Math.max(0, descriptor.pixelHeight - 1),
    );
  return {
    destinationX,
    destinationY,
    pixelHeight: Math.min(
      Math.max(1, Math.ceil(overlap.height * descriptor.lodScale)),
      descriptor.pixelHeight - (destinationY - textureRegion.y),
    ),
    pixelWidth: Math.min(
      Math.max(1, Math.ceil(overlap.width * descriptor.lodScale)),
      descriptor.pixelWidth - (destinationX - textureRegion.x),
    ),
    sourceHeight,
    sourceWidth,
    sourceX,
    sourceY,
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.trunc(Math.min(max, Math.max(min, value)));
}
