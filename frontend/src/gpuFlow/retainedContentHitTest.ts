import type {
  GpuRetainedContentHitRecord,
  GpuRetainedContentScene,
} from "./retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "./scene";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuRetainedContentHitTarget = {
  readonly flowPoint: GpuPoint;
  readonly hit: GpuRetainedContentHitRecord;
  readonly localPoint: GpuPoint;
  readonly ownerSectionId: string;
  readonly retainedScene: GpuRetainedContentScene;
  readonly surfaceId: string;
  readonly zIndex: number;
};

type GpuRetainedContentSurfaceWithScene = GpuContentSurface & {
  readonly retainedScene: GpuRetainedContentScene;
};

export function hitTestGpuRetainedContentScene({
  point,
  scene,
}: {
  readonly point: GpuPoint;
  readonly scene: GpuFlowScene;
}): GpuRetainedContentHitTarget | null {
  const surfaces = getRetainedContentHitSurfaces(scene.contentSurfaces);
  for (const surface of surfaces) {
    if (
      !rectContainsPoint(surface.rect, point) ||
      !rectContainsPoint(surface.clipRect, point)
    ) {
      continue;
    }
    const localPoint = {
      x: point.x - surface.rect.x,
      y: point.y - surface.rect.y,
    };
    const hit = hitTestRetainedContentRecords({
      point: localPoint,
      retainedScene: surface.retainedScene,
    });
    if (!hit) {
      continue;
    }
    return {
      flowPoint: point,
      hit,
      localPoint,
      ownerSectionId: surface.ownerSectionId,
      retainedScene: surface.retainedScene,
      surfaceId: surface.id,
      zIndex: surface.zIndex,
    };
  }
  return null;
}

function getRetainedContentHitSurfaces(
  contentSurfaces: readonly GpuContentSurface[],
): readonly GpuRetainedContentSurfaceWithScene[] {
  return contentSurfaces
    .map((surface, index) => ({ index, surface }))
    .filter(
      (
        item,
      ): item is {
        readonly index: number;
        readonly surface: GpuRetainedContentSurfaceWithScene;
      } => isRetainedContentHitSurface(item.surface),
    )
    .sort(
      (left, right) =>
        right.surface.zIndex - left.surface.zIndex || right.index - left.index,
    )
    .map((item) => item.surface);
}

function isRetainedContentHitSurface(
  surface: GpuContentSurface,
): surface is GpuRetainedContentSurfaceWithScene {
  return (
    surface.renderer.kind === "canvas-content" &&
    Boolean(surface.retainedScene) &&
    surface.rect.width > 0 &&
    surface.rect.height > 0 &&
    surface.clipRect.width > 0 &&
    surface.clipRect.height > 0
  );
}

function hitTestRetainedContentRecords({
  point,
  retainedScene,
}: {
  readonly point: GpuPoint;
  readonly retainedScene: GpuRetainedContentScene;
}): GpuRetainedContentHitRecord | null {
  for (let index = retainedScene.hitRecords.length - 1; index >= 0; index--) {
    const hit = retainedScene.hitRecords[index];
    if (hit && rectContainsPoint(hit.rect, point)) {
      return hit;
    }
  }
  return null;
}

function rectContainsPoint(rect: GpuRect, point: GpuPoint): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}
