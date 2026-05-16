import {
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

export function getGpuRetainedContentRuntimeScrollRevision(
  state: GpuRetainedContentRuntimeState,
): number {
  let revision = 0;
  for (const value of state.scrollRevisions.values()) {
    revision += value;
  }
  return revision;
}

export function syncGpuRetainedContentRuntimeStateForScene({
  scene,
  state,
}: {
  readonly scene: GpuFlowScene | undefined;
  readonly state: GpuRetainedContentRuntimeState;
}): boolean {
  if (!scene) {
    return clearGpuRetainedContentRuntimeState(state);
  }

  let changed = false;
  const retainedSurfaceIds = new Set<string>();
  for (const surface of scene.contentSurfaces) {
    if (!surface.retainedScene) {
      continue;
    }
    retainedSurfaceIds.add(surface.id);
    changed =
      syncGpuRetainedContentRuntimeSurface({ state, surface }) || changed;
  }
  changed =
    pruneGpuRetainedContentRuntimeState({
      retainedSurfaceIds,
      state,
    }) || changed;
  return changed;
}

function clearGpuRetainedContentRuntimeState(
  state: GpuRetainedContentRuntimeState,
): boolean {
  const changed =
    state.scrollOffsets.size > 0 ||
    state.scrollResetKeys.size > 0 ||
    state.scrollRevisions.size > 0;
  if (changed) {
    state.scrollOffsets.clear();
    state.scrollResetKeys.clear();
    state.scrollRevisions.clear();
  }
  return changed;
}

function syncGpuRetainedContentRuntimeSurface({
  state,
  surface,
}: {
  readonly state: GpuRetainedContentRuntimeState;
  readonly surface: GpuContentSurface & {
    readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
  };
}): boolean {
  const resetKeyChanged = syncGpuRetainedContentSurfaceResetKey({
    state,
    surface,
  });
  const scrollOffset = clampGpuRetainedContentScrollOffset({
    contentRect: surface.retainedScene.contentRect,
    scrollOffset:
      state.scrollOffsets.get(surface.id) ?? surface.retainedScene.scrollOffset,
    viewportRect: surface.retainedScene.viewportRect,
  });
  return (
    setGpuRetainedContentRuntimeScrollOffset({
      scrollOffset,
      state,
      surfaceId: surface.id,
    }) || resetKeyChanged
  );
}

export function clearGpuRetainedContentRuntimeScrollOffset({
  state,
  surfaceId,
}: {
  readonly state: GpuRetainedContentRuntimeState;
  readonly surfaceId: string;
}): boolean {
  if (!state.scrollOffsets.has(surfaceId)) {
    return false;
  }
  state.scrollOffsets.delete(surfaceId);
  state.scrollRevisions.set(
    surfaceId,
    (state.scrollRevisions.get(surfaceId) ?? 0) + 1,
  );
  return true;
}

function syncGpuRetainedContentSurfaceResetKey({
  state,
  surface,
}: {
  readonly state: GpuRetainedContentRuntimeState;
  readonly surface: GpuContentSurface;
}): boolean {
  const resetKey = surface.retainedScrollResetKey ?? null;
  const previousResetKey = state.scrollResetKeys.get(surface.id);
  state.scrollResetKeys.set(surface.id, resetKey);
  if (previousResetKey === undefined || previousResetKey === resetKey) {
    return false;
  }
  return clearGpuRetainedContentRuntimeScrollOffset({
    state,
    surfaceId: surface.id,
  });
}

function pruneGpuRetainedContentRuntimeState({
  retainedSurfaceIds,
  state,
}: {
  readonly retainedSurfaceIds: ReadonlySet<string>;
  readonly state: GpuRetainedContentRuntimeState;
}): boolean {
  let changed = false;
  for (const surfaceId of state.scrollOffsets.keys()) {
    if (!retainedSurfaceIds.has(surfaceId)) {
      state.scrollOffsets.delete(surfaceId);
      changed = true;
    }
  }
  for (const surfaceId of state.scrollResetKeys.keys()) {
    if (!retainedSurfaceIds.has(surfaceId)) {
      state.scrollResetKeys.delete(surfaceId);
      changed = true;
    }
  }
  for (const surfaceId of state.scrollRevisions.keys()) {
    if (!retainedSurfaceIds.has(surfaceId)) {
      state.scrollRevisions.delete(surfaceId);
      changed = true;
    }
  }
  return changed;
}
