import {
  clampGpuRetainedContentScrollOffset,
  type GpuRetainedContentScrollOffsetMap,
} from "./retainedContentScroll";
import type { GpuContentSurface, GpuFlowScene } from "./scene";
import type { GpuPoint } from "./viewportMath";

export type GpuRetainedContentKeyboardCommand =
  | "end"
  | "page-backward"
  | "page-forward"
  | "row-backward"
  | "row-forward"
  | "start";

export type GpuRetainedContentNavigationTarget = {
  readonly ownerSectionId: string;
  readonly rowId: string;
  readonly surfaceId: string;
};

type GpuRetainedContentResolvedNavigationTarget =
  GpuRetainedContentNavigationTarget & {
    readonly rowIndex: number;
  };

export type GpuRetainedContentKeyboardNavigationResult = {
  readonly changed: boolean;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly surfaceId: string | null;
  readonly target: GpuRetainedContentResolvedNavigationTarget | null;
};

type GpuRetainedContentSurfaceWithScene = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

export function resolveGpuRetainedContentKeyboardNavigation({
  command,
  currentTarget,
  scene,
  scrollOffsets,
}: {
  readonly command: GpuRetainedContentKeyboardCommand;
  readonly currentTarget: GpuRetainedContentNavigationTarget | null;
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): GpuRetainedContentKeyboardNavigationResult {
  if (!currentTarget) {
    return unchangedGpuRetainedContentKeyboardNavigation(scrollOffsets);
  }
  const surface = getGpuRetainedContentSurfaceById(
    scene,
    currentTarget.surfaceId,
  );
  if (!surface) {
    return unchangedGpuRetainedContentKeyboardNavigation(scrollOffsets);
  }
  const currentIndex = surface.retainedScene.rowOrder.indexOf(
    currentTarget.rowId,
  );
  if (currentIndex < 0) {
    return unchangedGpuRetainedContentKeyboardNavigation(scrollOffsets);
  }
  const nextIndex = resolveGpuRetainedContentKeyboardRowIndex({
    command,
    currentIndex,
    rowCount: surface.retainedScene.rowOrder.length,
    rowHeight: surface.retainedScene.rowHeight,
    viewportHeight: surface.retainedScene.viewportRect.height,
  });
  const target = createGpuRetainedContentNavigationTarget(surface, nextIndex);
  if (!target) {
    return unchangedGpuRetainedContentKeyboardNavigation(scrollOffsets);
  }
  const revealResult = resolveGpuRetainedContentRowReveal({
    rowId: target.rowId,
    scene,
    scrollOffsets,
    surfaceId: target.surfaceId,
  });
  return {
    changed: nextIndex !== currentIndex || revealResult.changed,
    scrollOffsets: revealResult.scrollOffsets,
    surfaceId: target.surfaceId,
    target,
  };
}

export function resolveGpuRetainedContentRowReveal({
  marginPx = 4,
  rowId,
  scene,
  scrollOffsets,
  surfaceId,
}: {
  readonly marginPx?: number | undefined;
  readonly rowId: string;
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly surfaceId: string;
}): GpuRetainedContentKeyboardNavigationResult {
  assertFiniteNonNegative("retained content reveal margin", marginPx);
  const surface = getGpuRetainedContentSurfaceById(scene, surfaceId);
  if (!surface) {
    return unchangedGpuRetainedContentKeyboardNavigation(scrollOffsets);
  }
  const rowIndex = surface.retainedScene.rowOrder.indexOf(rowId);
  const target = createGpuRetainedContentNavigationTarget(surface, rowIndex);
  if (!target) {
    return unchangedGpuRetainedContentKeyboardNavigation(scrollOffsets);
  }
  const currentOffset =
    scrollOffsets.get(surface.id) ?? surface.retainedScene.scrollOffset;
  const nextOffset = revealGpuRetainedContentRowOffset({
    currentOffset,
    marginPx,
    rowHeight: surface.retainedScene.rowHeight,
    rowIndex,
    surface,
  });
  if (nextOffset.x === currentOffset.x && nextOffset.y === currentOffset.y) {
    return {
      changed: false,
      scrollOffsets,
      surfaceId: surface.id,
      target,
    };
  }
  const nextScrollOffsets = new Map(scrollOffsets);
  nextScrollOffsets.set(surface.id, nextOffset);
  return {
    changed: true,
    scrollOffsets: nextScrollOffsets,
    surfaceId: surface.id,
    target,
  };
}

function resolveGpuRetainedContentKeyboardRowIndex({
  command,
  currentIndex,
  rowCount,
  rowHeight,
  viewportHeight,
}: {
  readonly command: GpuRetainedContentKeyboardCommand;
  readonly currentIndex: number;
  readonly rowCount: number;
  readonly rowHeight: number;
  readonly viewportHeight: number;
}): number {
  const pageRows = Math.max(1, Math.floor(viewportHeight / rowHeight));
  if (command === "row-backward") {
    return clampInteger(currentIndex - 1, 0, rowCount - 1);
  }
  if (command === "row-forward") {
    return clampInteger(currentIndex + 1, 0, rowCount - 1);
  }
  if (command === "page-backward") {
    return clampInteger(currentIndex - pageRows, 0, rowCount - 1);
  }
  if (command === "page-forward") {
    return clampInteger(currentIndex + pageRows, 0, rowCount - 1);
  }
  if (command === "start") {
    return 0;
  }
  return Math.max(0, rowCount - 1);
}

function revealGpuRetainedContentRowOffset({
  currentOffset,
  marginPx,
  rowHeight,
  rowIndex,
  surface,
}: {
  readonly currentOffset: GpuPoint;
  readonly marginPx: number;
  readonly rowHeight: number;
  readonly rowIndex: number;
  readonly surface: GpuRetainedContentSurfaceWithScene;
}): GpuPoint {
  const viewportHeight = surface.retainedScene.viewportRect.height;
  const rowStart = rowIndex * rowHeight;
  const rowEnd = rowStart + rowHeight;
  const revealMargin = Math.min(marginPx, Math.max(0, viewportHeight / 2));
  let nextY = currentOffset.y;
  if (rowStart - revealMargin < currentOffset.y) {
    nextY = rowStart - revealMargin;
  } else if (rowEnd + revealMargin > currentOffset.y + viewportHeight) {
    nextY = rowEnd + revealMargin - viewportHeight;
  }
  return clampGpuRetainedContentScrollOffset({
    contentRect: surface.retainedScene.contentRect,
    scrollOffset: {
      x: currentOffset.x,
      y: nextY,
    },
    viewportRect: surface.retainedScene.viewportRect,
  });
}

function getGpuRetainedContentSurfaceById(
  scene: GpuFlowScene,
  surfaceId: string,
): GpuRetainedContentSurfaceWithScene | null {
  const surface = scene.contentSurfaces.find(
    (candidate) => candidate.id === surfaceId,
  );
  if (
    !surface ||
    surface.renderer.kind !== "canvas-content" ||
    !surface.retainedScene
  ) {
    return null;
  }
  return surface as GpuRetainedContentSurfaceWithScene;
}

function createGpuRetainedContentNavigationTarget(
  surface: GpuRetainedContentSurfaceWithScene,
  rowIndex: number,
): GpuRetainedContentResolvedNavigationTarget | null {
  const rowId = surface.retainedScene.rowOrder[rowIndex];
  if (!rowId) {
    return null;
  }
  return {
    ownerSectionId: surface.ownerSectionId,
    rowId,
    rowIndex,
    surfaceId: surface.id,
  };
}

function unchangedGpuRetainedContentKeyboardNavigation(
  scrollOffsets: GpuRetainedContentScrollOffsetMap,
): GpuRetainedContentKeyboardNavigationResult {
  return {
    changed: false,
    scrollOffsets,
    surfaceId: null,
    target: null,
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}
