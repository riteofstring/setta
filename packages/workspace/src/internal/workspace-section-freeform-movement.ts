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
