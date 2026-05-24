import type {
  GpuHtmlSurfaceOverlayLayout,
  GpuNodeLayout,
  GpuVisibleNodeQuad,
} from "./frame";

export function getActiveGpuHtmlSurfaceOverlayIds(
  activeNodeIds: ReadonlySet<string>,
  overlays: readonly GpuHtmlSurfaceOverlayLayout[] | undefined,
): ReadonlySet<string> {
  if (activeNodeIds.size === 0) {
    return activeNodeIds;
  }
  const activeSurfaceIds = new Set(activeNodeIds);
  for (const overlay of overlays ?? []) {
    if (overlay.ownerNodeId && activeNodeIds.has(overlay.ownerNodeId)) {
      activeSurfaceIds.add(overlay.surfaceId);
    }
  }
  return activeSurfaceIds;
}

export function partitionGpuHtmlSurfaceOverlayQuads({
  overlays,
  quads,
}: {
  readonly overlays: readonly GpuHtmlSurfaceOverlayLayout[] | undefined;
  readonly quads: readonly GpuVisibleNodeQuad[];
}): {
  readonly lateQuads: readonly GpuVisibleNodeQuad[];
  readonly normalQuads: readonly GpuVisibleNodeQuad[];
  readonly pageQuads: readonly GpuVisibleNodeQuad[];
} {
  const lateSurfaceIds = getGpuHtmlSurfaceOverlayIdsByLayer(overlays, "late");
  const pageSurfaceIds = getGpuHtmlSurfaceOverlayIdsByLayer(overlays, "page");
  return {
    lateQuads: quads.filter((quad) => lateSurfaceIds.has(quad.nodeId)),
    normalQuads: quads.filter(
      (quad) =>
        !lateSurfaceIds.has(quad.nodeId) && !pageSurfaceIds.has(quad.nodeId),
    ),
    pageQuads: quads.filter((quad) => pageSurfaceIds.has(quad.nodeId)),
  };
}

function getGpuHtmlSurfaceOverlayIdsByLayer(
  overlays: readonly GpuHtmlSurfaceOverlayLayout[] | undefined,
  layer: NonNullable<GpuHtmlSurfaceOverlayLayout["layer"]>,
): ReadonlySet<string> {
  return new Set(
    (overlays ?? [])
      .filter((overlay) => overlay.layer === layer)
      .map((overlay) => overlay.surfaceId),
  );
}

export function toGpuHtmlSurfaceOverlayNodeLayouts(
  overlays: readonly GpuHtmlSurfaceOverlayLayout[] | undefined,
): GpuNodeLayout[] {
  return (overlays ?? []).map((overlay) => ({
    actorKind: overlay.actorKind,
    height: overlay.height,
    nodeId: overlay.surfaceId,
    ...(overlay.textureCssHeight === undefined
      ? {}
      : { textureCssHeight: overlay.textureCssHeight }),
    ...(overlay.textureCssWidth === undefined
      ? {}
      : { textureCssWidth: overlay.textureCssWidth }),
    ...(overlay.textureContentKey === undefined
      ? {}
      : { textureContentKey: overlay.textureContentKey }),
    ...(overlay.textureSourceRect === undefined
      ? {}
      : { textureSourceRect: overlay.textureSourceRect }),
    width: overlay.width,
    x: overlay.x,
    y: overlay.y,
    zIndex: overlay.zIndex,
  }));
}
