import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
} from "./GpuRetainedContentSurfaces";
import {
  createGpuRetainedRowContentSceneWithScrollWindow,
  type GpuRetainedContentScene,
} from "./retainedContentScene";
import { getGpuRetainedContentSceneSourceInput } from "./retainedContentSceneSourceMetadata";
import type { RetainedContentTexturePageFrameSurface } from "./retainedContentTexturePageManager";
import type { GpuContentSurface } from "./scene";

type GpuRetainedContentPageFrameSurfaceOptions = {
  readonly viewportZoomBucket?: number | undefined;
};

const contentVersions = new Map<string, number>();
let nextContentVersion = 1;

export function getGpuRetainedContentTexturePageFrameSurfaces(
  surfaces: readonly GpuContentSurface[] | undefined,
  options: GpuRetainedContentPageFrameSurfaceOptions = {},
): readonly RetainedContentTexturePageFrameSurface[] {
  return getGpuRetainedContentSourceSurfaces(surfaces, options).map(
    toGpuRetainedContentTexturePageFrameSurface,
  );
}

function toGpuRetainedContentTexturePageFrameSurface(
  surface: GpuRetainedContentSourceSurface,
): RetainedContentTexturePageFrameSurface {
  return {
    contentBoundsCss: {
      height: surface.textureWindow.textureHeight,
      width: surface.textureWindow.textureWidth,
      x: 0,
      y: 0,
    },
    contentVersion: getContentVersion(surface.retainedScene),
    layout: {
      height: surface.rect.height,
      surfaceId: surface.id,
      textureSourceRect: surface.textureWindow.sourceRect,
      width: surface.rect.width,
      x: surface.rect.x,
      y: surface.rect.y,
      zIndex: surface.zIndex,
    },
    rasterScene: createGpuRetainedRowContentSceneWithScrollWindow({
      scene: surface.retainedScene,
      scrollOffset: surface.textureWindow.cacheScrollOffset,
      viewportRect: surface.textureWindow.cacheViewportRect,
    }),
    sourceWindowCss: {
      height: surface.textureWindow.cacheViewportRect.height,
      width: surface.textureWindow.cacheViewportRect.width,
      x: surface.textureWindow.cacheScrollOffset.x,
      y: surface.textureWindow.cacheScrollOffset.y,
    },
    surfaceId: surface.id,
    visibleSourceRectCss: surface.textureWindow.sourceRect,
  };
}

function getContentVersion(scene: GpuRetainedContentScene): number {
  const signature = createContentSignature(scene);
  const existingVersion = contentVersions.get(signature);
  if (existingVersion !== undefined) {
    return existingVersion;
  }
  const version = nextContentVersion;
  nextContentVersion += 1;
  contentVersions.set(signature, version);
  return version;
}

function createContentSignature(scene: GpuRetainedContentScene): string {
  const sourceInput = getGpuRetainedContentSceneSourceInput(scene);
  if (!sourceInput) {
    return JSON.stringify({
      contentRect: scene.contentRect,
      id: scene.id,
      ownerSectionId: scene.ownerSectionId,
      rowOrder: scene.rowOrder,
      viewportWidth: scene.viewportRect.width,
    });
  }
  return JSON.stringify({
    activePopup: sourceInput.activePopup,
    contentRect: sourceInput.layout.contentRect,
    controlRightInset: sourceInput.controlRightInset,
    controlWidth: sourceInput.controlWidth,
    dragPreview: sourceInput.dragPreview,
    id: sourceInput.id,
    indentWidth: sourceInput.indentWidth,
    labelControlGap: sourceInput.labelControlGap,
    ownerSectionId: sourceInput.ownerSectionId,
    portHitSize: sourceInput.portHitSize,
    rowHeight: sourceInput.rowHeight,
    rows: sourceInput.rows.map((row) => ({
      control: row.control,
      controlKind: row.controlKind,
      depth: row.depth,
      id: row.id,
      label: row.label,
      labelAppearance: row.labelAppearance,
      ports: row.ports,
      status: row.status,
      verticalGapBefore: row.verticalGapBefore,
    })),
    viewportWidth: sourceInput.viewportRect.width,
  });
}
