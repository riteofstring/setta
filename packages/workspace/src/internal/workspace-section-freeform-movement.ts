import type { WorkspacePoint } from "../core.js";
import type { WorkspaceRect } from "./geometry-index.js";
import type { AdapterDndKeyboardDirection } from "./upstream-dnd-adapter.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import { snapWorkspacePointToGrid } from "./workspace-preferences.js";
import { moveWorkspaceRootWithKeyboard } from "./workspace-root-movement.js";

export type WorkspaceFreeformMove = Readonly<{
  delta: WorkspacePoint;
  positions: Readonly<Record<string, WorkspacePoint>>;
}>;

export type WorkspaceFreeformDestinationPlacement = Readonly<{
  indicator: WorkspaceRect;
  positions: Readonly<Record<string, WorkspacePoint>>;
}>;

function recordFromEntries<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) {
    record[key] = value;
  }
  return record;
}

function requiredPosition(
  positions: Readonly<Record<string, WorkspacePoint>>,
  sectionId: string,
): WorkspacePoint {
  const position = positions[sectionId];
  if (!position) {
    throw new Error(`Workspace freeform movement is missing the position for ${sectionId}.`);
  }
  return position;
}

function requiredRect(
  rects: Readonly<Record<string, WorkspaceRect>>,
  sectionId: string,
): WorkspaceRect {
  const rect = rects[sectionId];
  if (!rect) {
    throw new Error(`Workspace freeform destination is missing geometry for ${sectionId}.`);
  }
  return rect;
}

function clampedDelta(
  positions: Readonly<Record<string, WorkspacePoint>>,
  sectionIds: readonly string[],
  delta: WorkspacePoint,
): WorkspacePoint {
  const minimum = sectionIds.reduce(
    (current, sectionId) => {
      const position = requiredPosition(positions, sectionId);
      return { x: Math.min(current.x, position.x), y: Math.min(current.y, position.y) };
    },
    { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
  );
  return {
    x: Math.max(delta.x, -minimum.x),
    y: Math.max(delta.y, -minimum.y),
  };
}

function translatedPositions(
  positions: Readonly<Record<string, WorkspacePoint>>,
  sectionIds: readonly string[],
  delta: WorkspacePoint,
): Readonly<Record<string, WorkspacePoint>> {
  return recordFromEntries(
    sectionIds.map((sectionId) => {
      const position = requiredPosition(positions, sectionId);
      return [sectionId, { x: position.x + delta.x, y: position.y + delta.y }] as const;
    }),
  );
}

export function resolveWorkspaceFreeformPointerMove({
  activeSectionId,
  delta,
  gridOptions,
  positions,
  sectionIds,
}: Readonly<{
  activeSectionId: string;
  delta: WorkspacePoint;
  gridOptions: Pick<ResolvedWorkspaceGridOptions, "snap" | "spacing">;
  positions: Readonly<Record<string, WorkspacePoint>>;
  sectionIds: readonly string[];
}>): WorkspaceFreeformMove {
  const anchor = requiredPosition(positions, activeSectionId);
  const rawAnchor = { x: anchor.x + delta.x, y: anchor.y + delta.y };
  const nextAnchor = gridOptions.snap
    ? snapWorkspacePointToGrid(rawAnchor, gridOptions.spacing)
    : rawAnchor;
  const resolvedDelta = clampedDelta(positions, sectionIds, {
    x: nextAnchor.x - anchor.x,
    y: nextAnchor.y - anchor.y,
  });
  return {
    delta: resolvedDelta,
    positions: translatedPositions(positions, sectionIds, resolvedDelta),
  };
}

export function resolveWorkspaceFreeformKeyboardMove({
  activeSectionId,
  direction,
  gridOptions,
  positions,
  sectionIds,
}: Readonly<{
  activeSectionId: string;
  direction: AdapterDndKeyboardDirection;
  gridOptions: Pick<ResolvedWorkspaceGridOptions, "snap" | "spacing">;
  positions: Readonly<Record<string, WorkspacePoint>>;
  sectionIds: readonly string[];
}>): WorkspaceFreeformMove {
  const anchor = requiredPosition(positions, activeSectionId);
  const nextAnchor = moveWorkspaceRootWithKeyboard(anchor, direction, gridOptions);
  const resolvedDelta = clampedDelta(positions, sectionIds, {
    x: nextAnchor.x - anchor.x,
    y: nextAnchor.y - anchor.y,
  });
  return {
    delta: resolvedDelta,
    positions: translatedPositions(positions, sectionIds, resolvedDelta),
  };
}

export function resolveWorkspaceFreeformDestinationPlacement({
  activeSectionId,
  destinationBlockPosition,
  destinationSurfacePosition,
  gridOptions,
  sectionIds,
  sourceRects,
  sourceWorkspaceBounds,
}: Readonly<{
  activeSectionId: string;
  destinationBlockPosition: WorkspacePoint;
  destinationSurfacePosition: WorkspacePoint;
  gridOptions: Pick<ResolvedWorkspaceGridOptions, "snap" | "spacing">;
  sectionIds: readonly string[];
  sourceRects: Readonly<Record<string, WorkspaceRect>>;
  sourceWorkspaceBounds: WorkspaceRect;
}>): WorkspaceFreeformDestinationPlacement {
  const localPositions = recordFromEntries(
    sectionIds.map((sectionId) => {
      const rect = requiredRect(sourceRects, sectionId);
      return [
        sectionId,
        {
          x:
            destinationBlockPosition.x +
            rect.x -
            sourceWorkspaceBounds.x -
            destinationSurfacePosition.x,
          y:
            destinationBlockPosition.y +
            rect.y -
            sourceWorkspaceBounds.y -
            destinationSurfacePosition.y,
        },
      ] as const;
    }),
  );
  const move = resolveWorkspaceFreeformPointerMove({
    activeSectionId,
    delta: { x: 0, y: 0 },
    gridOptions,
    positions: localPositions,
    sectionIds,
  });
  const frames = sectionIds.map((sectionId) => {
    const position = requiredPosition(move.positions, sectionId);
    const rect = requiredRect(sourceRects, sectionId);
    return {
      height: rect.height,
      width: rect.width,
      x: destinationSurfacePosition.x + position.x,
      y: destinationSurfacePosition.y + position.y,
    };
  });
  const first = frames[0];
  if (!first) {
    throw new Error("Workspace freeform destination requires at least one section.");
  }
  const bounds = frames.slice(1).reduce((current, rect) => {
    const x = Math.min(current.x, rect.x);
    const y = Math.min(current.y, rect.y);
    const right = Math.max(current.x + current.width, rect.x + rect.width);
    const bottom = Math.max(current.y + current.height, rect.y + rect.height);
    return { height: bottom - y, width: right - x, x, y };
  }, first);
  return { indicator: bounds, positions: move.positions };
}

export function workspaceFreeformMoveTransforms(
  currentPositions: Readonly<Record<string, WorkspacePoint>>,
  nextPositions: Readonly<Record<string, WorkspacePoint>>,
  sectionIds: readonly string[],
): Readonly<Record<string, WorkspacePoint>> {
  return recordFromEntries(
    sectionIds.map((sectionId) => {
      const current = requiredPosition(currentPositions, sectionId);
      const next = requiredPosition(nextPositions, sectionId);
      return [sectionId, { x: next.x - current.x, y: next.y - current.y }] as const;
    }),
  );
}

export function workspaceFreeformMoveIndicator(
  sourceBounds: WorkspaceRect,
  surfaceDelta: WorkspacePoint,
  moveDelta: WorkspacePoint,
): WorkspaceRect {
  return {
    ...sourceBounds,
    x: sourceBounds.x + surfaceDelta.x + moveDelta.x,
    y: sourceBounds.y + surfaceDelta.y + moveDelta.y,
  };
}
