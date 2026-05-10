import type { GpuQueueWithElementUpload } from "./htmlInCanvasTypes";
import type { HtmlSurfaceTextureResources } from "./htmlSurfaces/textureTiles";
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
  readonly resource: HtmlSurfaceTextureResources;
  readonly snapshots: readonly RetainedContentTexturePageTextLikeSnapshot[];
}) {
  if (snapshots.length === 0) {
    return;
  }
  const elementUploadQueue = queue as GpuQueueWithElementUpload;
  if (typeof elementUploadQueue.copyElementImageToTexture !== "function") {
    throw new Error(
      "Setta retained content page upload requires GPUQueue.copyElementImageToTexture for row text snapshots.",
    );
  }
  for (const snapshot of snapshots) {
    const element = elementBySourceId.get(snapshot.sourceId);
    if (!isTextLikeSnapshotElementCurrent(element, snapshot)) {
      throw new Error(
        `Retained text-like row snapshot ${snapshot.sourceId} is not mounted or current for page upload.`,
      );
    }
    const overlap = intersectRects(snapshot.rectCss, descriptor.sourceRectCss);
    if (!overlap) {
      continue;
    }
    const copy = resolveTextLikeSnapshotPageCopy({
      descriptor,
      overlap,
      snapshot,
    });
    if (copy.pixelWidth <= 0 || copy.pixelHeight <= 0) {
      continue;
    }
    elementUploadQueue.copyElementImageToTexture(
      element,
      copy.sourceX,
      copy.sourceY,
      copy.sourceWidth,
      copy.sourceHeight,
      copy.pixelWidth,
      copy.pixelHeight,
      {
        origin: {
          x: copy.destinationX,
          y: copy.destinationY,
          z: 0,
        },
        texture: resource.texture,
      },
    );
  }
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
      snapshot.sourceKey
  );
}

function resolveTextLikeSnapshotPageCopy({
  descriptor,
  overlap,
  snapshot,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly overlap: GpuRect;
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
  const destinationX = clampInteger(
    Math.floor((overlap.x - descriptor.sourceRectCss.x) * descriptor.lodScale),
    0,
    Math.max(0, descriptor.pixelWidth - 1),
  );
  const destinationY = clampInteger(
    Math.floor((overlap.y - descriptor.sourceRectCss.y) * descriptor.lodScale),
    0,
    Math.max(0, descriptor.pixelHeight - 1),
  );
  return {
    destinationX,
    destinationY,
    pixelHeight: Math.min(
      Math.max(1, Math.ceil(overlap.height * descriptor.lodScale)),
      descriptor.pixelHeight - destinationY,
    ),
    pixelWidth: Math.min(
      Math.max(1, Math.ceil(overlap.width * descriptor.lodScale)),
      descriptor.pixelWidth - destinationX,
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
