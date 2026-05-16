import { createGpuRetainedRowContentSceneWithScrollOffset } from "./retainedContentScene";
import type { GpuRetainedContentScrollOffsetMap } from "./retainedContentScroll";
import type { GpuContentSurface } from "./scene";
import type { GpuPoint } from "./viewportMath";

type GpuRetainedContentSurfaceWithScene = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

export function getGpuRetainedContentSampledScrollOffset({
  scrollOffsets,
  surface,
}: {
  readonly scrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly surface: GpuRetainedContentSurfaceWithScene;
}): GpuPoint {
  return scrollOffsets?.get(surface.id) ?? surface.retainedScene.scrollOffset;
}

export function createGpuRetainedContentSampledSceneForSurface({
  scrollOffsets,
  surface,
}: {
  readonly scrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly surface: GpuRetainedContentSurfaceWithScene;
}): NonNullable<GpuContentSurface["retainedScene"]> {
  const scrollOffset = getGpuRetainedContentSampledScrollOffset({
    scrollOffsets,
    surface,
  });
  if (
    scrollOffset.x === surface.retainedScene.scrollOffset.x &&
    scrollOffset.y === surface.retainedScene.scrollOffset.y
  ) {
    return surface.retainedScene;
  }
  return createGpuRetainedRowContentSceneWithScrollOffset({
    scene: surface.retainedScene,
    scrollOffset,
  });
}

export function isGpuRetainedContentSurfaceWithScene(
  surface: GpuContentSurface,
): surface is GpuRetainedContentSurfaceWithScene {
  return (
    surface.renderer.kind === "canvas-content" && Boolean(surface.retainedScene)
  );
}
