import type { HtmlSurfaceTextureResources } from "./htmlSurfaces/textureTiles";
import {
  retainedTexturePageKey,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";

export type RetainedContentTextureRegion = {
  readonly atlasId: string;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly texturePixelHeight: number;
  readonly texturePixelWidth: number;
  readonly x: number;
  readonly y: number;
};

export type RetainedContentTextureResources = HtmlSurfaceTextureResources & {
  readonly retainedContentTextureRegion: RetainedContentTextureRegion;
  readonly releaseRetainedContentTextureResources: () => void;
};

type RetainedContentTextureAtlasPlacement = {
  readonly allocatedRect: RetainedContentTextureAtlasRect;
  readonly contentOriginX: number;
  readonly contentOriginY: number;
};

type RetainedContentTextureAtlas = {
  readonly freeRects: RetainedContentTextureAtlasRect[];
  readonly id: string;
  readonly pixelSize: number;
  readonly sampler: GPUSampler;
  readonly texture: GPUTexture;
  readonly textureView: GPUTextureView;
  readonly usedPlacementCount: () => number;
  releasePlacement(placement: RetainedContentTextureAtlasPlacement): void;
  reservePlacement(
    descriptor: RetainedTexturePageDescriptor,
  ): RetainedContentTextureAtlasPlacement | null;
};

type RetainedContentTextureAtlasRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

type RetainedContentTextureAtlasStoreOptions = {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly maxPagePixelSize: number;
  readonly maxTextureDimension2D: number;
  readonly textureUsage: GPUTextureUsageFlags;
};

const DEFAULT_RETAINED_CONTENT_ATLAS_MULTIPLIER = 2;
const RETAINED_CONTENT_ATLAS_EDGE_PADDING_PX = 1;

export class RetainedContentTextureAtlasStore {
  private readonly atlases: RetainedContentTextureAtlas[] = [];
  private readonly atlasPixelSize: number;
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private nextAtlasId = 1;
  private readonly textureUsage: GPUTextureUsageFlags;

  constructor({
    device,
    format,
    maxPagePixelSize,
    maxTextureDimension2D,
    textureUsage,
  }: RetainedContentTextureAtlasStoreOptions) {
    this.device = device;
    this.format = format;
    this.textureUsage = textureUsage;
    this.atlasPixelSize = Math.min(
      maxTextureDimension2D,
      Math.max(
        maxPagePixelSize,
        maxPagePixelSize * DEFAULT_RETAINED_CONTENT_ATLAS_MULTIPLIER +
          RETAINED_CONTENT_ATLAS_EDGE_PADDING_PX *
            2 *
            DEFAULT_RETAINED_CONTENT_ATLAS_MULTIPLIER,
      ),
    );
  }

  createResources(
    descriptor: RetainedTexturePageDescriptor,
  ): RetainedContentTextureResources {
    const atlasPlacement = this.reserveAtlasPlacement(descriptor);
    if (!atlasPlacement) {
      return createStandaloneRetainedContentTextureResources({
        descriptor,
        device: this.device,
        format: this.format,
        textureUsage: this.textureUsage,
      });
    }

    const { atlas, placement } = atlasPlacement;
    let released = false;
    return {
      releaseRetainedContentTextureResources: () => {
        if (released) {
          return;
        }
        released = true;
        atlas.releasePlacement(placement);
        this.pruneEmptyAtlases();
      },
      retainedContentTextureRegion: {
        atlasId: atlas.id,
        pixelHeight: descriptor.pixelHeight,
        pixelWidth: descriptor.pixelWidth,
        texturePixelHeight: atlas.pixelSize,
        texturePixelWidth: atlas.pixelSize,
        x: placement.contentOriginX,
        y: placement.contentOriginY,
      },
      sampler: atlas.sampler,
      texture: atlas.texture,
      textureView: atlas.textureView,
    };
  }

  destroy() {
    for (const atlas of this.atlases) {
      atlas.texture.destroy?.();
    }
    this.atlases.length = 0;
  }

  private reserveAtlasPlacement(descriptor: RetainedTexturePageDescriptor): {
    readonly atlas: RetainedContentTextureAtlas;
    readonly placement: RetainedContentTextureAtlasPlacement;
  } | null {
    if (
      descriptor.pixelWidth + RETAINED_CONTENT_ATLAS_EDGE_PADDING_PX * 2 >
        this.atlasPixelSize ||
      descriptor.pixelHeight + RETAINED_CONTENT_ATLAS_EDGE_PADDING_PX * 2 >
        this.atlasPixelSize
    ) {
      return null;
    }

    for (const atlas of this.atlases) {
      const placement = atlas.reservePlacement(descriptor);
      if (placement) {
        return { atlas, placement };
      }
    }

    const atlas = this.createAtlas();
    const placement = atlas.reservePlacement(descriptor);
    if (!placement) {
      atlas.texture.destroy?.();
      return null;
    }
    this.atlases.push(atlas);
    return { atlas, placement };
  }

  private createAtlas(): RetainedContentTextureAtlas {
    const atlasId = `retained-content-atlas-${this.nextAtlasId}`;
    this.nextAtlasId += 1;
    const texture = this.device.createTexture({
      format: this.format,
      label: `setta-${atlasId}`,
      size: {
        height: this.atlasPixelSize,
        width: this.atlasPixelSize,
      },
      usage: this.textureUsage,
    });
    const textureView = texture.createView({
      label: `setta-${atlasId}-view`,
    });
    const sampler = this.device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
    });
    const freeRects: RetainedContentTextureAtlasRect[] = [
      {
        height: this.atlasPixelSize,
        width: this.atlasPixelSize,
        x: 0,
        y: 0,
      },
    ];
    const placements = new Set<RetainedContentTextureAtlasPlacement>();
    return {
      freeRects,
      id: atlasId,
      pixelSize: this.atlasPixelSize,
      releasePlacement: (placement) => {
        if (!placements.delete(placement)) {
          return;
        }
        freeRects.push(placement.allocatedRect);
        mergeRetainedContentTextureAtlasFreeRects(freeRects);
      },
      reservePlacement: (descriptor) => {
        const allocatedWidth =
          descriptor.pixelWidth + RETAINED_CONTENT_ATLAS_EDGE_PADDING_PX * 2;
        const allocatedHeight =
          descriptor.pixelHeight + RETAINED_CONTENT_ATLAS_EDGE_PADDING_PX * 2;
        const index = findRetainedContentTextureAtlasFreeRectIndex({
          freeRects,
          height: allocatedHeight,
          width: allocatedWidth,
        });
        if (index === -1) {
          return null;
        }
        const rect = freeRects[index];
        if (!rect) {
          return null;
        }
        freeRects.splice(index, 1);
        splitRetainedContentTextureAtlasFreeRect({
          allocatedHeight,
          allocatedWidth,
          freeRect: rect,
          freeRects,
        });
        const placement = {
          allocatedRect: {
            height: allocatedHeight,
            width: allocatedWidth,
            x: rect.x,
            y: rect.y,
          },
          contentOriginX: rect.x + RETAINED_CONTENT_ATLAS_EDGE_PADDING_PX,
          contentOriginY: rect.y + RETAINED_CONTENT_ATLAS_EDGE_PADDING_PX,
        };
        placements.add(placement);
        return placement;
      },
      sampler,
      texture,
      textureView,
      usedPlacementCount: () => placements.size,
    };
  }

  private pruneEmptyAtlases() {
    for (let index = this.atlases.length - 1; index >= 0; index -= 1) {
      const atlas = this.atlases[index];
      if (!atlas || atlas.usedPlacementCount() > 0) {
        continue;
      }
      atlas.texture.destroy?.();
      this.atlases.splice(index, 1);
    }
  }
}

export function createRetainedContentTextureResources({
  descriptor,
  device,
  format,
  atlasStore,
  textureUsage,
}: {
  readonly atlasStore?: RetainedContentTextureAtlasStore | undefined;
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly textureUsage: GPUTextureUsageFlags;
}): RetainedContentTextureResources {
  return (
    atlasStore?.createResources(descriptor) ??
    createStandaloneRetainedContentTextureResources({
      descriptor,
      device,
      format,
      textureUsage,
    })
  );
}

export function destroyRetainedContentTextureResources(
  resource: RetainedContentTextureResources,
) {
  resource.releaseRetainedContentTextureResources();
}

export function getRetainedContentTextureResourceRegion(
  resource: RetainedContentTextureResources,
): RetainedContentTextureRegion {
  return resource.retainedContentTextureRegion;
}

function createStandaloneRetainedContentTextureResources({
  descriptor,
  device,
  format,
  textureUsage,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly textureUsage: GPUTextureUsageFlags;
}): RetainedContentTextureResources {
  const texture = device.createTexture({
    format,
    label: `setta-retained-content-page-${descriptor.surfaceId}-${descriptor.tileColumn}-${descriptor.tileRow}-${descriptor.lodScale}`,
    size: {
      height: descriptor.pixelHeight,
      width: descriptor.pixelWidth,
    },
    usage: textureUsage,
  });
  const textureView = texture.createView({
    label: `setta-retained-content-page-${descriptor.surfaceId}-${descriptor.tileColumn}-${descriptor.tileRow}-${descriptor.lodScale}-view`,
  });
  const sampler = device.createSampler({
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  });
  let released = false;
  return {
    releaseRetainedContentTextureResources: () => {
      if (released) {
        return;
      }
      released = true;
      texture.destroy?.();
    },
    retainedContentTextureRegion: {
      atlasId: retainedTexturePageKey(descriptor),
      pixelHeight: descriptor.pixelHeight,
      pixelWidth: descriptor.pixelWidth,
      texturePixelHeight: descriptor.pixelHeight,
      texturePixelWidth: descriptor.pixelWidth,
      x: 0,
      y: 0,
    },
    sampler,
    texture,
    textureView,
  };
}

function findRetainedContentTextureAtlasFreeRectIndex({
  freeRects,
  height,
  width,
}: {
  readonly freeRects: readonly RetainedContentTextureAtlasRect[];
  readonly height: number;
  readonly width: number;
}): number {
  let bestIndex = -1;
  let bestArea = Number.POSITIVE_INFINITY;
  for (let index = 0; index < freeRects.length; index += 1) {
    const rect = freeRects[index];
    if (!rect || rect.width < width || rect.height < height) {
      continue;
    }
    const area = rect.width * rect.height;
    if (area < bestArea) {
      bestArea = area;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function splitRetainedContentTextureAtlasFreeRect({
  allocatedHeight,
  allocatedWidth,
  freeRect,
  freeRects,
}: {
  readonly allocatedHeight: number;
  readonly allocatedWidth: number;
  readonly freeRect: RetainedContentTextureAtlasRect;
  readonly freeRects: RetainedContentTextureAtlasRect[];
}) {
  const remainingWidth = freeRect.width - allocatedWidth;
  if (remainingWidth > 0) {
    freeRects.push({
      height: allocatedHeight,
      width: remainingWidth,
      x: freeRect.x + allocatedWidth,
      y: freeRect.y,
    });
  }
  const remainingHeight = freeRect.height - allocatedHeight;
  if (remainingHeight > 0) {
    freeRects.push({
      height: remainingHeight,
      width: freeRect.width,
      x: freeRect.x,
      y: freeRect.y + allocatedHeight,
    });
  }
}

function mergeRetainedContentTextureAtlasFreeRects(
  freeRects: RetainedContentTextureAtlasRect[],
) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let leftIndex = 0; leftIndex < freeRects.length; leftIndex += 1) {
      const left = freeRects[leftIndex];
      if (!left) {
        continue;
      }
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < freeRects.length;
        rightIndex += 1
      ) {
        const right = freeRects[rightIndex];
        if (!right) {
          continue;
        }
        const merged = mergeRetainedContentTextureAtlasFreeRect(left, right);
        if (!merged) {
          continue;
        }
        freeRects.splice(rightIndex, 1);
        freeRects[leftIndex] = merged;
        changed = true;
        break;
      }
      if (changed) {
        break;
      }
    }
  }
}

function mergeRetainedContentTextureAtlasFreeRect(
  left: RetainedContentTextureAtlasRect,
  right: RetainedContentTextureAtlasRect,
): RetainedContentTextureAtlasRect | null {
  return (
    mergeHorizontalRetainedContentTextureAtlasFreeRect(left, right) ??
    mergeVerticalRetainedContentTextureAtlasFreeRect(left, right)
  );
}

function mergeHorizontalRetainedContentTextureAtlasFreeRect(
  left: RetainedContentTextureAtlasRect,
  right: RetainedContentTextureAtlasRect,
): RetainedContentTextureAtlasRect | null {
  if (
    left.y === right.y &&
    left.height === right.height &&
    left.x + left.width === right.x
  ) {
    return {
      height: left.height,
      width: left.width + right.width,
      x: left.x,
      y: left.y,
    };
  }
  if (
    right.y === left.y &&
    right.height === left.height &&
    right.x + right.width === left.x
  ) {
    return {
      height: left.height,
      width: left.width + right.width,
      x: right.x,
      y: left.y,
    };
  }
  return null;
}

function mergeVerticalRetainedContentTextureAtlasFreeRect(
  left: RetainedContentTextureAtlasRect,
  right: RetainedContentTextureAtlasRect,
): RetainedContentTextureAtlasRect | null {
  if (
    left.x === right.x &&
    left.width === right.width &&
    left.y + left.height === right.y
  ) {
    return {
      height: left.height + right.height,
      width: left.width,
      x: left.x,
      y: left.y,
    };
  }
  if (
    right.x === left.x &&
    right.width === left.width &&
    right.y + right.height === left.y
  ) {
    return {
      height: left.height + right.height,
      width: left.width,
      x: left.x,
      y: right.y,
    };
  }
  return null;
}
