import type { WorkspaceDocument, WorkspacePoint } from "../core.js";
import type { WorkspaceRect } from "./geometry-index.js";
import {
  planSectionMove,
  validateWorkspaceSectionMovePlan,
  type SectionMoveDecision,
  type WorkspaceSectionMoveValidator,
} from "./section-move-planning.js";
import { selectionContainsSectionOrAncestor } from "./selection-planning.js";
import type { AdapterDndKeyboardDirection } from "./upstream-dnd-adapter.js";
import type { WorkspaceSectionMoveDirection } from "./workspace-section-move-collision.js";
import type {
  WorkspaceSectionMoveIndicator,
  WorkspaceSectionMoveSession,
} from "./workspace-section-move-session.js";

type DestinationRegion = WorkspaceSectionMoveSession["regions"][number];

type KeyboardDestination = Readonly<{
  destinationIndex: number;
  destinationParentId: string | null;
  point: Readonly<{ x: number; y: number }>;
  region: DestinationRegion | null;
  topLevelPositions: Readonly<Record<string, WorkspacePoint>> | null;
}>;

type KeyboardContainerDestination = KeyboardDestination &
  Readonly<{
    destinationParentId: string;
    region: DestinationRegion;
    topLevelPositions: null;
  }>;

export type WorkspaceSectionKeyboardMoveResolution =
  | Readonly<{
      decision: SectionMoveDecision;
      destinationIndex: number;
      destinationIds: readonly string[];
      region: DestinationRegion | null;
      status: "resolved";
    }>
  | Readonly<{ reason: string; status: "unavailable" }>;

function logicalStep(
  direction: AdapterDndKeyboardDirection,
  orientation: "horizontal" | "vertical",
  logicalDirection: WorkspaceSectionMoveDirection,
): -1 | 1 | null {
  if (orientation === "vertical") {
    return direction === "up" ? -1 : direction === "down" ? 1 : null;
  }
  if (direction !== "left" && direction !== "right") {
    return null;
  }
  const towardLogicalEnd =
    logicalDirection === "ltr" ? direction === "right" : direction === "left";
  return towardLogicalEnd ? 1 : -1;
}

function withoutMoving(ids: readonly string[], moving: ReadonlySet<string>): readonly string[] {
  return ids.filter((sectionId) => !moving.has(sectionId));
}

function currentDestination(
  session: WorkspaceSectionMoveSession,
): Readonly<{ index: number; parentId: string | null }> {
  if (session.preview) {
    return {
      index: session.preview.plan.destinationIndex,
      parentId: session.preview.plan.destinationParentId,
    };
  }
  const sourceIds =
    session.sourceParentId === null
      ? session.hierarchy.rootSectionIds
      : (session.hierarchy.childrenByParent[session.sourceParentId] ?? []);
  return {
    index: sourceIds.findIndex((sectionId) => session.sectionIds.includes(sectionId)),
    parentId: session.sourceParentId,
  };
}

function regionForParent(
  regions: readonly DestinationRegion[],
  parentId: string | null,
): DestinationRegion | null {
  return parentId ? (regions.find((region) => region.parentSectionId === parentId) ?? null) : null;
}

function adjacentDestination(
  direction: AdapterDndKeyboardDirection,
  session: WorkspaceSectionMoveSession,
): KeyboardContainerDestination | null {
  const current = currentDestination(session);
  const region = regionForParent(session.regions, current.parentId);
  if (!region) {
    return null;
  }
  const step = logicalStep(direction, region.orientation, region.direction);
  if (step === null) {
    return null;
  }
  const moving = new Set(session.sectionIds);
  const destinationIds = withoutMoving(
    session.hierarchy.childrenByParent[region.parentSectionId] ?? [],
    moving,
  );
  const destinationIndex = current.index + step;
  if (destinationIndex < 0 || destinationIndex > destinationIds.length) {
    return null;
  }
  return {
    destinationIndex,
    destinationParentId: region.parentSectionId,
    point: insertionPoint(region, destinationIds, destinationIndex, session),
    region,
    topLevelPositions: null,
  };
}

function logicalLeadingEdge(
  start: number,
  size: number,
  direction: WorkspaceSectionMoveDirection,
): number {
  return direction === "rtl" ? start + size : start;
}

function logicalTrailingEdge(
  start: number,
  size: number,
  direction: WorkspaceSectionMoveDirection,
): number {
  return direction === "rtl" ? start : start + size;
}

function verticalInsertionPoint(
  rects: readonly (WorkspaceRect | undefined)[],
  destinationIndex: number,
): number {
  const first = rects[0] as NonNullable<(typeof rects)[number]>;
  const last = rects.at(-1) as NonNullable<(typeof rects)[number]>;
  if (destinationIndex === 0) {
    return first.y;
  }
  if (destinationIndex === rects.length) {
    return last.y + last.height;
  }
  const previous = rects[destinationIndex - 1];
  const next = rects[destinationIndex];
  return previous && next ? (previous.y + previous.height + next.y) / 2 : first.y;
}

function horizontalInsertionPoint(
  rects: readonly (WorkspaceRect | undefined)[],
  destinationIndex: number,
  direction: WorkspaceSectionMoveDirection,
): number {
  const first = rects[0] as NonNullable<(typeof rects)[number]>;
  const last = rects.at(-1) as NonNullable<(typeof rects)[number]>;
  if (destinationIndex === 0) {
    return logicalLeadingEdge(first.x, first.width, direction);
  }
  if (destinationIndex === rects.length) {
    return logicalTrailingEdge(last.x, last.width, direction);
  }
  const previous = rects[destinationIndex - 1];
  const next = rects[destinationIndex];
  return previous && next
    ? (logicalTrailingEdge(previous.x, previous.width, direction) +
        logicalLeadingEdge(next.x, next.width, direction)) /
        2
    : first.x;
}

function insertionAxisPoint(
  region: DestinationRegion,
  destinationIds: readonly string[],
  destinationIndex: number,
  session: WorkspaceSectionMoveSession,
): number {
  const rects = destinationIds.map((sectionId) => session.workspaceRectsById[sectionId]);
  if (!rects[0] || !rects.at(-1)) {
    return region.orientation === "vertical"
      ? region.workspaceRect.y + region.workspaceRect.height / 2
      : region.workspaceRect.x + region.workspaceRect.width / 2;
  }
  return region.orientation === "vertical"
    ? verticalInsertionPoint(rects, destinationIndex)
    : horizontalInsertionPoint(rects, destinationIndex, region.direction);
}

function insertionPoint(
  region: DestinationRegion,
  destinationIds: readonly string[],
  destinationIndex: number,
  session: WorkspaceSectionMoveSession,
): Readonly<{ x: number; y: number }> {
  const axisPoint = insertionAxisPoint(region, destinationIds, destinationIndex, session);
  return region.orientation === "vertical"
    ? { x: region.workspaceRect.x + region.workspaceRect.width / 2, y: axisPoint }
    : { x: axisPoint, y: region.workspaceRect.y + region.workspaceRect.height / 2 };
}

function previewCenter(
  indicator: WorkspaceSectionMoveIndicator,
): Readonly<{ x: number; y: number }> {
  return {
    x: indicator.rect.x + indicator.rect.width / 2,
    y: indicator.rect.y + indicator.rect.height / 2,
  };
}

function navigationOrigin(
  session: WorkspaceSectionMoveSession,
): Readonly<{ x: number; y: number }> {
  return session.preview
    ? previewCenter(session.preview.indicator)
    : {
        x: session.sourceWorkspaceBounds.x + session.sourceWorkspaceBounds.width / 2,
        y: session.sourceWorkspaceBounds.y + session.sourceWorkspaceBounds.height / 2,
      };
}

function directionalScore(
  direction: AdapterDndKeyboardDirection,
  origin: Readonly<{ x: number; y: number }>,
  point: Readonly<{ x: number; y: number }>,
): number | null {
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  const primary =
    direction === "left" ? -x : direction === "right" ? x : direction === "up" ? -y : y;
  if (primary <= 0.01) {
    return null;
  }
  const secondary = direction === "left" || direction === "right" ? Math.abs(y) : Math.abs(x);
  return primary + secondary * 0.5;
}

function spatialDestinations(
  session: WorkspaceSectionMoveSession,
): readonly KeyboardContainerDestination[] {
  const moving = new Set(session.sectionIds);
  const currentParentId = currentDestination(session).parentId;
  return session.regions.flatMap((region) => {
    if (
      region.parentSectionId === currentParentId ||
      selectionContainsSectionOrAncestor(
        region.parentSectionId,
        moving,
        session.hierarchy.parentByChild,
      )
    ) {
      return [];
    }
    const destinationIds = withoutMoving(
      session.hierarchy.childrenByParent[region.parentSectionId] ?? [],
      moving,
    );
    return Array.from({ length: destinationIds.length + 1 }, (_, destinationIndex) => ({
      destinationIndex,
      destinationParentId: region.parentSectionId,
      point: insertionPoint(region, destinationIds, destinationIndex, session),
      region,
      topLevelPositions: null,
    }));
  });
}

function nearestSpatialDestination(
  direction: AdapterDndKeyboardDirection,
  session: WorkspaceSectionMoveSession,
): KeyboardContainerDestination | null {
  const origin = navigationOrigin(session);
  const directional = spatialDestinations(session).flatMap((destination) => {
    const score = directionalScore(direction, origin, destination.point);
    return score === null ? [] : [{ destination, score }];
  });
  const promoted = directional.filter(
    ({ destination }) =>
      !directional.some(
        ({ destination: challenger }) =>
          challenger.destinationParentId !== destination.destinationParentId &&
          selectionContainsSectionOrAncestor(
            challenger.destinationParentId,
            new Set([destination.destinationParentId]),
            session.hierarchy.parentByChild,
          ),
      ),
  );
  return promoted.sort((left, right) => left.score - right.score)[0]?.destination ?? null;
}

function destinationIds(
  destination: KeyboardDestination,
  session: WorkspaceSectionMoveSession,
): readonly string[] {
  if (destination.destinationParentId === null) {
    return withoutMoving(session.hierarchy.rootSectionIds, new Set(session.sectionIds));
  }
  return withoutMoving(
    session.hierarchy.childrenByParent[destination.destinationParentId] ?? [],
    new Set(session.sectionIds),
  );
}

function canvasDestination(session: WorkspaceSectionMoveSession): KeyboardDestination | null {
  if (session.sourceParentId === null) {
    return null;
  }
  const topLevelPositions = Object.create(null) as Record<string, WorkspacePoint>;
  for (const sectionId of session.sectionIds) {
    const rect = session.sourceRects[sectionId];
    if (!rect) {
      return null;
    }
    topLevelPositions[sectionId] = { x: rect.x, y: rect.y };
  }
  return {
    destinationIndex: withoutMoving(session.hierarchy.rootSectionIds, new Set(session.sectionIds))
      .length,
    destinationParentId: null,
    point: navigationOrigin(session),
    region: null,
    topLevelPositions,
  };
}

function resolvedDestination<TSectionData>(
  destination: KeyboardDestination,
  document: WorkspaceDocument<TSectionData>,
  session: WorkspaceSectionMoveSession<TSectionData>,
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined,
): WorkspaceSectionKeyboardMoveResolution {
  return {
    decision: planSectionMove({
      destination: {
        index: destination.destinationIndex,
        parentId: destination.destinationParentId,
        topLevelPositions: destination.topLevelPositions,
      },
      hierarchy: session.hierarchy,
      mode: session.mode,
      selectedIds: session.sectionIds,
      validate: (plan) => validateWorkspaceSectionMovePlan(document, plan, validateSectionMove),
    }),
    destinationIndex: destination.destinationIndex,
    destinationIds: destinationIds(destination, session),
    region: destination.region,
    status: "resolved",
  };
}

function sortUnavailableReason(
  direction: AdapterDndKeyboardDirection,
  session: WorkspaceSectionMoveSession,
): string {
  const region = regionForParent(session.regions, session.sourceParentId);
  if (!region) {
    return "Keyboard sorting is unavailable because the source container is not measured.";
  }
  if (logicalStep(direction, region.orientation, region.direction) === null) {
    return region.orientation === "vertical"
      ? "Use ArrowUp or ArrowDown to sort sections in this container."
      : "Use ArrowLeft or ArrowRight to sort sections in this container.";
  }
  return "The selected section block cannot move farther in that direction.";
}

export function resolveWorkspaceSectionKeyboardMove<TSectionData>({
  direction,
  document,
  session,
  validateSectionMove,
}: Readonly<{
  direction: AdapterDndKeyboardDirection;
  document: WorkspaceDocument<TSectionData>;
  session: WorkspaceSectionMoveSession<TSectionData>;
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
}>): WorkspaceSectionKeyboardMoveResolution {
  const adjacent = adjacentDestination(direction, session);
  if (adjacent) {
    return resolvedDestination(adjacent, document, session, validateSectionMove);
  }
  if (session.mode === "sort") {
    return {
      reason: sortUnavailableReason(direction, session),
      status: "unavailable",
    };
  }
  const spatial = nearestSpatialDestination(direction, session);
  const destination = spatial ?? canvasDestination(session);
  return destination
    ? resolvedDestination(destination, document, session, validateSectionMove)
    : {
        reason: "No structural destination is available in that direction. Try another arrow key.",
        status: "unavailable",
      };
}
