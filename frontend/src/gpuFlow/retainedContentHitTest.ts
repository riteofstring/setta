import {
  getGpuRetainedContentDiagnosticsRecorder,
  nowForGpuRetainedContentDiagnostics,
  type GpuRetainedContentHitTestSurfaceDiagnostic,
} from "./retainedContentDiagnostics";
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
  const recordHitTest =
    getGpuRetainedContentDiagnosticsRecorder()?.recordHitTest;
  const startTime = recordHitTest ? nowForGpuRetainedContentDiagnostics() : 0;
  const surfaces = getRetainedContentHitSurfaces(scene.contentSurfaces);
  const surfaceDiagnostics: GpuRetainedContentHitTestSurfaceDiagnostic[] = [];
  let checkedHitRecordCount = 0;
  let testedHitRecordCount = 0;
  let testedSurfaceCount = 0;

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
    testedSurfaceCount += 1;
    testedHitRecordCount += surface.retainedScene.hitRecords.length;
    const result = hitTestRetainedContentRecords({
      point: localPoint,
      retainedScene: surface.retainedScene,
    });
    checkedHitRecordCount += result.checkedCount;
    surfaceDiagnostics.push({
      checkedHitRecordCount: result.checkedCount,
      hitRecordCount: surface.retainedScene.hitRecords.length,
      matched: Boolean(result.hit),
      surfaceId: surface.id,
    });
    const hit = result.hit;
    if (!hit) {
      continue;
    }
    recordHitTest?.({
      checkedHitRecordCount,
      contentSurfaceCount: scene.contentSurfaces.length,
      durationMs: nowForGpuRetainedContentDiagnostics() - startTime,
      matched: true,
      retainedSurfaceCount: surfaces.length,
      surfaces: surfaceDiagnostics,
      testedHitRecordCount,
      testedSurfaceCount,
      timestampMs: nowForGpuRetainedContentDiagnostics(),
    });
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
  recordHitTest?.({
    checkedHitRecordCount,
    contentSurfaceCount: scene.contentSurfaces.length,
    durationMs: nowForGpuRetainedContentDiagnostics() - startTime,
    matched: false,
    retainedSurfaceCount: surfaces.length,
    surfaces: surfaceDiagnostics,
    testedHitRecordCount,
    testedSurfaceCount,
    timestampMs: nowForGpuRetainedContentDiagnostics(),
  });
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
}): {
  readonly checkedCount: number;
  readonly hit: GpuRetainedContentHitRecord | null;
} {
  let checkedCount = 0;
  for (let index = retainedScene.hitRecords.length - 1; index >= 0; index--) {
    const hit = retainedScene.hitRecords[index];
    checkedCount += 1;
    if (hit && rectContainsPoint(hit.rect, point)) {
      return { checkedCount, hit };
    }
  }
  return { checkedCount, hit: null };
}

function rectContainsPoint(rect: GpuRect, point: GpuPoint): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}
