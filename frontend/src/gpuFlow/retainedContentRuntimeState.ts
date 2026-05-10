import {
  applyGpuRetainedContentScrollOffsetToScene,
  clampGpuRetainedContentScrollOffset,
  type GpuRetainedContentScrollOffsetMap,
  type GpuRetainedContentScrollResult,
} from "./retainedContentScroll";
import type { GpuContentSurface, GpuFlowScene } from "./scene";
import type { GpuPoint } from "./viewportMath";

export type GpuRetainedContentRuntimeState = {
  readonly scrollOffsets: Map<string, GpuPoint>;
  readonly scrollResetKeys: Map<string, string | null>;
  readonly scrollRevisions: Map<string, number>;
};

export function createGpuRetainedContentRuntimeState(): GpuRetainedContentRuntimeState {
  return {
    scrollOffsets: new Map(),
    scrollResetKeys: new Map(),
    scrollRevisions: new Map(),
  };
}

export function getGpuRetainedContentRuntimeScrollOffsets(
  state: GpuRetainedContentRuntimeState,
): GpuRetainedContentScrollOffsetMap {
  return new Map(state.scrollOffsets);
}

export function getGpuRetainedContentRuntimeScrollOffset({
  state,
  surface,
}: {
  readonly state: GpuRetainedContentRuntimeState;
  readonly surface: GpuContentSurface;
}): GpuPoint | null {
  if (!surface.retainedScene) {
    return null;
  }
  return (
    state.scrollOffsets.get(surface.id) ?? surface.retainedScene.scrollOffset
  );
}

export function commitGpuRetainedContentRuntimeScrollResult({
  result,
  state,
}: {
  readonly result: GpuRetainedContentScrollResult;
  readonly state: GpuRetainedContentRuntimeState;
}): boolean {
  let changed = false;
  for (const [surfaceId, scrollOffset] of result.scrollOffsets) {
    changed =
      setGpuRetainedContentRuntimeScrollOffset({
        scrollOffset,
        state,
        surfaceId,
      }) || changed;
  }
  return changed;
}

export function replaceGpuRetainedContentRuntimeScrollOffsets({
  scrollOffsets,
  state,
}: {
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly state: GpuRetainedContentRuntimeState;
}): boolean {
  let changed = false;
  for (const surfaceId of [...state.scrollOffsets.keys()]) {
    if (!scrollOffsets.has(surfaceId)) {
      state.scrollOffsets.delete(surfaceId);
      state.scrollRevisions.set(
        surfaceId,
        (state.scrollRevisions.get(surfaceId) ?? 0) + 1,
      );
      changed = true;
    }
  }
  for (const [surfaceId, scrollOffset] of scrollOffsets) {
    changed =
      setGpuRetainedContentRuntimeScrollOffset({
        scrollOffset,
        state,
        surfaceId,
      }) || changed;
  }
  return changed;
}

export function setGpuRetainedContentRuntimeScrollOffset({
  scrollOffset,
  state,
  surfaceId,
}: {
  readonly scrollOffset: GpuPoint;
  readonly state: GpuRetainedContentRuntimeState;
  readonly surfaceId: string;
}): boolean {
  const previous = state.scrollOffsets.get(surfaceId);
  if (
    previous &&
    previous.x === scrollOffset.x &&
    previous.y === scrollOffset.y
  ) {
    return false;
  }
  state.scrollOffsets.set(surfaceId, { x: scrollOffset.x, y: scrollOffset.y });
  state.scrollRevisions.set(
    surfaceId,
    (state.scrollRevisions.get(surfaceId) ?? 0) + 1,
  );
  return true;
}

export function applyGpuRetainedContentRuntimeStateToScene({
  scene,
  state,
}: {
  readonly scene: GpuFlowScene | undefined;
  readonly state: GpuRetainedContentRuntimeState;
}): GpuFlowScene | undefined {
  if (!scene) {
    state.scrollOffsets.clear();
    state.scrollResetKeys.clear();
    state.scrollRevisions.clear();
    return undefined;
  }

  const retainedSurfaceIds = new Set<string>();
  let nextScene = scene;
  for (const surface of scene.contentSurfaces) {
    if (!surface.retainedScene) {
      continue;
    }
    retainedSurfaceIds.add(surface.id);
    syncGpuRetainedContentSurfaceResetKey({ state, surface });
    const scrollOffset = clampGpuRetainedContentScrollOffset({
      contentRect: surface.retainedScene.contentRect,
      scrollOffset:
        state.scrollOffsets.get(surface.id) ??
        surface.retainedScene.scrollOffset,
      viewportRect: surface.retainedScene.viewportRect,
    });
    setGpuRetainedContentRuntimeScrollOffset({
      scrollOffset,
      state,
      surfaceId: surface.id,
    });
    if (
      surface.retainedScene.scrollOffset.x === scrollOffset.x &&
      surface.retainedScene.scrollOffset.y === scrollOffset.y
    ) {
      continue;
    }
    const update = applyGpuRetainedContentScrollOffsetToScene({
      scene: nextScene,
      scrollOffset,
      surfaceId: surface.id,
    });
    if (update) {
      nextScene = update.scene;
    }
  }
  pruneGpuRetainedContentRuntimeState({
    retainedSurfaceIds,
    state,
  });
  return nextScene;
}

function syncGpuRetainedContentSurfaceResetKey({
  state,
  surface,
}: {
  readonly state: GpuRetainedContentRuntimeState;
  readonly surface: GpuContentSurface;
}) {
  const resetKey = surface.retainedScrollResetKey ?? null;
  const previousResetKey = state.scrollResetKeys.get(surface.id);
  state.scrollResetKeys.set(surface.id, resetKey);
  if (previousResetKey === undefined || previousResetKey === resetKey) {
    return;
  }
  state.scrollOffsets.delete(surface.id);
  state.scrollRevisions.set(
    surface.id,
    (state.scrollRevisions.get(surface.id) ?? 0) + 1,
  );
}

function pruneGpuRetainedContentRuntimeState({
  retainedSurfaceIds,
  state,
}: {
  readonly retainedSurfaceIds: ReadonlySet<string>;
  readonly state: GpuRetainedContentRuntimeState;
}) {
  for (const surfaceId of state.scrollOffsets.keys()) {
    if (!retainedSurfaceIds.has(surfaceId)) {
      state.scrollOffsets.delete(surfaceId);
    }
  }
  for (const surfaceId of state.scrollResetKeys.keys()) {
    if (!retainedSurfaceIds.has(surfaceId)) {
      state.scrollResetKeys.delete(surfaceId);
    }
  }
  for (const surfaceId of state.scrollRevisions.keys()) {
    if (!retainedSurfaceIds.has(surfaceId)) {
      state.scrollRevisions.delete(surfaceId);
    }
  }
}
