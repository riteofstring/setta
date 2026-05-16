import {
  getGpuRetainedContentDiagnosticsRecorder,
  nowForGpuRetainedContentDiagnostics,
  type GpuRetainedContentHitTestSurfaceDiagnostic,
} from "./retainedContentDiagnostics";
import {
  createGpuRetainedContentSampledSceneForSurface,
  isGpuRetainedContentSurfaceWithScene,
} from "./retainedContentRuntimeSampling";
import type {
  GpuRetainedContentHitRecord,
  GpuRetainedContentScene,
} from "./retainedContentScene";
import type { GpuRetainedContentScrollOffsetMap } from "./retainedContentScroll";
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

type GpuRetainedContentIndexedHitRecord = {
  readonly order: number;
  readonly record: GpuRetainedContentHitRecord;
};

type GpuRetainedContentHitRecordBucket = {
  readonly maxY: number;
  readonly minY: number;
  readonly records: readonly GpuRetainedContentIndexedHitRecord[];
};

type GpuRetainedContentHitRecordIndex = {
  readonly overlayRecords: readonly GpuRetainedContentIndexedHitRecord[];
  readonly rowBuckets: readonly GpuRetainedContentHitRecordBucket[];
};

type GpuRetainedContentHitRecordIndexCacheEntry = {
  readonly hitRecords: readonly GpuRetainedContentHitRecord[];
  readonly index: GpuRetainedContentHitRecordIndex;
  readonly rows: GpuRetainedContentScene["rows"];
};

const retainedContentHitRecordIndexCache = new WeakMap<
  GpuRetainedContentScene,
  GpuRetainedContentHitRecordIndexCacheEntry
>();

export function hitTestGpuRetainedContentScene({
  point,
  scrollOffsets,
  scene,
}: {
  readonly point: GpuPoint;
  readonly scrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
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
    const retainedScene = createGpuRetainedContentSampledSceneForSurface({
      scrollOffsets,
      surface,
    });
    testedSurfaceCount += 1;
    const result = hitTestRetainedContentRecords({
      point: localPoint,
      retainedScene,
    });
    checkedHitRecordCount += result.checkedCount;
    testedHitRecordCount += result.candidateCount;
    surfaceDiagnostics.push({
      checkedHitRecordCount: result.checkedCount,
      hitRecordCount: retainedScene.hitRecords.length,
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
      retainedScene,
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
    isGpuRetainedContentSurfaceWithScene(surface) &&
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
  readonly candidateCount: number;
  readonly checkedCount: number;
  readonly hit: GpuRetainedContentHitRecord | null;
} {
  const hitRecordIndex = getGpuRetainedContentHitRecordIndex(retainedScene);
  const candidates = getGpuRetainedContentHitRecordCandidates({
    hitRecordIndex,
    point,
  });
  for (const [checkedIndex, entry] of candidates.entries()) {
    const hit = entry.record;
    if (hit && rectContainsPoint(hit.rect, point)) {
      return {
        candidateCount: candidates.length,
        checkedCount: checkedIndex + 1,
        hit,
      };
    }
  }
  return {
    candidateCount: candidates.length,
    checkedCount: candidates.length,
    hit: null,
  };
}

function getGpuRetainedContentHitRecordIndex(
  retainedScene: GpuRetainedContentScene,
): GpuRetainedContentHitRecordIndex {
  const cached = retainedContentHitRecordIndexCache.get(retainedScene);
  if (
    cached &&
    cached.hitRecords === retainedScene.hitRecords &&
    cached.rows === retainedScene.rows
  ) {
    return cached.index;
  }
  const index = createGpuRetainedContentHitRecordIndex(retainedScene);
  retainedContentHitRecordIndexCache.set(retainedScene, {
    hitRecords: retainedScene.hitRecords,
    index,
    rows: retainedScene.rows,
  });
  return index;
}

function createGpuRetainedContentHitRecordIndex(
  retainedScene: GpuRetainedContentScene,
): GpuRetainedContentHitRecordIndex {
  const rowIds = new Set(retainedScene.rows.map((row) => row.id));
  const recordsByRowId = new Map<string, GpuRetainedContentIndexedHitRecord[]>();
  const overlayRecords: GpuRetainedContentIndexedHitRecord[] = [];
  retainedScene.hitRecords.forEach((record, order) => {
    const entry = { order, record };
    if (!rowIds.has(record.ownerRowId)) {
      overlayRecords.push(entry);
      return;
    }
    const records = recordsByRowId.get(record.ownerRowId);
    if (records) {
      records.push(entry);
      return;
    }
    recordsByRowId.set(record.ownerRowId, [entry]);
  });
  return {
    overlayRecords,
    rowBuckets: retainedScene.rows
      .flatMap((row) => {
        const records = recordsByRowId.get(row.id);
        if (!records || records.length === 0) {
          return [];
        }
        return [
          {
            maxY: Math.max(
              ...records.map(
                (entry) => entry.record.rect.y + entry.record.rect.height,
              ),
            ),
            minY: Math.min(...records.map((entry) => entry.record.rect.y)),
            records,
          },
        ];
      })
      .sort((left, right) => left.minY - right.minY),
  };
}

function getGpuRetainedContentHitRecordCandidates({
  hitRecordIndex,
  point,
}: {
  readonly hitRecordIndex: GpuRetainedContentHitRecordIndex;
  readonly point: GpuPoint;
}): readonly GpuRetainedContentIndexedHitRecord[] {
  const candidates: GpuRetainedContentIndexedHitRecord[] = [];
  for (const bucket of hitRecordIndex.rowBuckets) {
    if (bucket.minY > point.y) {
      break;
    }
    if (bucket.maxY > point.y) {
      candidates.push(...bucket.records);
    }
  }
  for (const entry of hitRecordIndex.overlayRecords) {
    if (rectContainsPoint(entry.record.rect, point)) {
      candidates.push(entry);
    }
  }
  candidates.sort((left, right) => right.order - left.order);
  return candidates;
}

function rectContainsPoint(rect: GpuRect, point: GpuPoint): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}
