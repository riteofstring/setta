import type {
  GpuQueueWithElementUpload,
  HtmlInCanvasCanvas,
} from "./htmlInCanvasTypes";
import { isMissingElementPaintRecordError } from "./htmlSurfaces/textureManagerHelpers";
import {
  getRetainedContentTextureResourceRegion,
  type RetainedContentTextureResources,
} from "./retainedContentTextureResources";
import type { GpuRetainedDomControlTextureDescriptor } from "./retainedDomControlScene";
import type { RetainedTexturePageDescriptor } from "./retainedTexturePages";
import type { GpuRect } from "./viewportMath";

export type RetainedContentTexturePageDomControlTexture =
  GpuRetainedDomControlTextureDescriptor;

type RetainedContentTexturePageDomControlTextureSurface = {
  readonly domControlTextures?:
    | readonly RetainedContentTexturePageDomControlTexture[]
    | undefined;
};

export const EMPTY_DOM_CONTROL_TEXTURE_ELEMENTS = new Map<
  string,
  HTMLElement
>();

export function areRetainedContentTexturePageDomControlTexturesReady({
  descriptor,
  elementBySourceId,
  surface,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
  readonly surface:
    | RetainedContentTexturePageDomControlTextureSurface
    | undefined;
}): boolean {
  const domControlTextures =
    resolveRetainedContentTexturePageDomControlTextures({
      descriptor,
      surface,
    });
  if (domControlTextures.length === 0) {
    return true;
  }
  return domControlTextures.every((texture) =>
    isDomControlTextureElementCurrent(
      elementBySourceId.get(texture.sourceId),
      texture,
    ),
  );
}

export function isRetainedContentTexturePageSnapshotExactDescriptorReady({
  descriptor,
  elementBySourceId,
  surface,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
  readonly surface:
    | RetainedContentTexturePageDomControlTextureSurface
    | undefined;
}): boolean {
  return (
    descriptor.visualEpochKind !== "snapshot-exact" ||
    areRetainedContentTexturePageDomControlTexturesReady({
      descriptor,
      elementBySourceId,
      surface,
    })
  );
}

export function uploadRetainedContentTexturePageDomControlTextures({
  descriptor,
  elementBySourceId,
  queue,
  resource,
  domControlTextures,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
  readonly queue: GPUQueue;
  readonly resource: RetainedContentTextureResources;
  readonly domControlTextures: readonly RetainedContentTexturePageDomControlTexture[];
}): boolean {
  if (domControlTextures.length === 0) {
    return true;
  }
  const elementUploadQueue = queue as GpuQueueWithElementUpload;
  if (typeof elementUploadQueue.copyElementImageToTexture !== "function") {
    throw new Error(
      "Setta retained content page upload requires GPUQueue.copyElementImageToTexture for retained DOM controls.",
    );
  }
  for (const texture of domControlTextures) {
    if (
      !uploadRetainedContentTexturePageDomControlTexture({
        descriptor,
        element: elementBySourceId.get(texture.sourceId),
        queue: elementUploadQueue,
        resource,
        texture,
      })
    ) {
      return false;
    }
  }
  return true;
}

function uploadRetainedContentTexturePageDomControlTexture({
  descriptor,
  element,
  queue,
  resource,
  texture,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly element: HTMLElement | undefined;
  readonly queue: GpuQueueWithElementUpload;
  readonly resource: RetainedContentTextureResources;
  readonly texture: RetainedContentTexturePageDomControlTexture;
}): boolean {
  if (!isDomControlTextureElementCurrent(element, texture)) {
    throw new Error(
      `Retained DOM control ${texture.sourceId} is not mounted or current for page upload.`,
    );
  }
  const overlap = intersectRects(texture.rectCss, descriptor.sourceRectCss);
  if (!overlap) {
    return true;
  }
  const copy = resolveDomControlTexturePageCopy({
    descriptor,
    overlap,
    resource,
    texture,
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
      requestDomControlTexturePaint(element);
      return false;
    }
    throw error;
  }
  return true;
}

export function resolveRetainedContentTexturePageDomControlTextures({
  descriptor,
  surface,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly surface:
    | RetainedContentTexturePageDomControlTextureSurface
    | undefined;
}): readonly RetainedContentTexturePageDomControlTexture[] {
  if (!surface?.domControlTextures?.length) {
    return [];
  }
  return surface.domControlTextures.filter((texture) =>
    rectsIntersect(texture.rectCss, descriptor.sourceRectCss),
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

function isDomControlTextureElementCurrent(
  element: HTMLElement | undefined,
  texture: RetainedContentTexturePageDomControlTexture,
): element is HTMLElement {
  return (
    element !== undefined &&
    element.dataset.gpuFlowRetainedDomControlSourceKey === texture.sourceKey &&
    element.dataset.gpuFlowRetainedDomControlReadyKey === texture.sourceKey
  );
}

function requestDomControlTexturePaint(element: HTMLElement) {
  const canvas = resolveDomControlTexturePaintCanvas(element);
  canvas?.requestPaint?.();
}

function resolveDomControlTexturePaintCanvas(
  element: HTMLElement,
): Partial<HtmlInCanvasCanvas> | null {
  return (
    (element.closest("canvas") as Partial<HtmlInCanvasCanvas> | null) ??
    (element.ownerDocument.querySelector(
      "canvas[data-gpu-flow-surface='true']",
    ) as Partial<HtmlInCanvasCanvas> | null)
  );
}

function resolveDomControlTexturePageCopy({
  descriptor,
  overlap,
  resource,
  texture,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly overlap: GpuRect;
  readonly resource: RetainedContentTextureResources;
  readonly texture: RetainedContentTexturePageDomControlTexture;
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
  const sourceX = Math.max(0, Math.floor(overlap.x - texture.rectCss.x));
  const sourceY = Math.max(0, Math.floor(overlap.y - texture.rectCss.y));
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
