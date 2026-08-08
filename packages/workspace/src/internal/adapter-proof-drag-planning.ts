import {
  EMPTY_COLLISION_TRACKER_STATE,
  resolveCollisionFrame,
  type CollisionTrackerState,
  type ListOrientation,
} from "./collision-characterization.js";
import type { WorkspaceGeometryIndex } from "./geometry-index.js";
import {
  createInteractionRect,
  normalizeScreenDelta,
  resolveRectBoundsById,
  type InteractionPoint,
  type InteractionRect,
} from "./interaction-geometry.js";
import {
  planSectionMove,
  type SectionMoveMode,
  type SectionMovePlan,
} from "./section-move-planning.js";
import type { SectionHierarchySnapshot } from "./selection-planning.js";

export const ADAPTER_PROOF_CANVAS_TARGET_ID = "adapter-proof-canvas";

export function adapterProofWorkspaceRects(
  geometryIndex: WorkspaceGeometryIndex,
): Readonly<Record<string, InteractionRect>> {
  return Object.fromEntries(
    geometryIndex
      .snapshot()
      .map(({ rect, sectionId }) => [
        sectionId,
        createInteractionRect(rect.x, rect.y, rect.width, rect.height),
      ]),
  );
}

export type AdapterProofDragSession = {
  activatorPoint: InteractionPoint | null;
  clientRectsById: Readonly<Record<string, InteractionRect>>;
  collisionState: CollisionTrackerState;
  hierarchy: SectionHierarchySnapshot;
  mode: SectionMoveMode;
  sectionIds: readonly string[];
  sourceClientBounds: InteractionRect;
  sourceWorkspaceBounds: InteractionRect;
  workspaceRectsById: Readonly<Record<string, InteractionRect>>;
};

export type AdapterProofDragPreview = {
  collisionState: CollisionTrackerState;
  destinationBounds: InteractionRect;
  destinationKey: string;
  order: readonly string[];
  plan: SectionMovePlan;
  targetId: string;
};

export type AdapterProofPreviewResolution = {
  collisionState: CollisionTrackerState;
  preview: AdapterProofDragPreview | null;
  reason: string | null;
};

type ResolvedNestedTarget = {
  clientRect: InteractionRect;
  id: string;
  parentId: string | null;
  workspaceRect: InteractionRect;
};

type NestedTargetResolution =
  | { resolution: AdapterProofPreviewResolution; status: "invalid" }
  | { status: "resolved"; target: ResolvedNestedTarget };

export function resolveAdapterProofDragPreview({
  orientation,
  screenDelta,
  session,
  targetId,
  zoom,
}: {
  orientation(parentId: string | null): ListOrientation;
  screenDelta: InteractionPoint;
  session: AdapterProofDragSession;
  targetId: string | null;
  zoom: number;
}): AdapterProofPreviewResolution {
  if (!targetId) {
    return emptyResolution(EMPTY_COLLISION_TRACKER_STATE, "No measured drop target is active.");
  }
  if (targetId === ADAPTER_PROOF_CANVAS_TARGET_ID) {
    return resolveCanvasPreview(session, screenDelta, zoom);
  }
  return resolveNestedPreview({ orientation, screenDelta, session, targetId });
}

export function adapterProofSelectionBounds(
  sectionIds: readonly string[],
  rectsById: Readonly<Record<string, InteractionRect>>,
): InteractionRect | null {
  return resolveRectBoundsById(sectionIds, rectsById);
}

export function serializeAdapterProofPlan(plan: SectionMovePlan): string {
  const parent = plan.destinationParentId ?? "canvas";
  const positions = plan.topLevelPositions
    ? plan.sectionIds
        .map((sectionId) => {
          const position = plan.topLevelPositions?.[sectionId];
          return position
            ? `${sectionId}@${roundCoordinate(position.x)},${roundCoordinate(position.y)}`
            : `${sectionId}@missing`;
        })
        .join("+")
    : plan.sectionIds.join("+");
  return `${plan.mode}:${parent}:${String(plan.destinationIndex)}:${positions}`;
}

function resolveCanvasPreview(
  session: AdapterProofDragSession,
  screenDelta: InteractionPoint,
  zoom: number,
): AdapterProofPreviewResolution {
  const workspaceDelta = normalizeScreenDelta(screenDelta, zoom);
  const topLevelPositions = Object.fromEntries(
    session.sectionIds.map((sectionId) => {
      const rect = session.workspaceRectsById[sectionId];
      if (!rect) {
        throw new Error(`Missing drag-session workspace geometry for ${sectionId}.`);
      }
      return [sectionId, { x: rect.x + workspaceDelta.x, y: rect.y + workspaceDelta.y }];
    }),
  );
  const selected = new Set(session.sectionIds);
  const destinationIndex = session.hierarchy.rootSectionIds.filter(
    (sectionId) => !selected.has(sectionId),
  ).length;
  const decision = planSectionMove({
    destination: { parentId: null, index: destinationIndex, topLevelPositions },
    hierarchy: session.hierarchy,
    mode: session.mode,
    selectedIds: session.sectionIds,
  });
  if (decision.status !== "planned") {
    return decisionResolution(session.collisionState, decision.status);
  }
  const destinationBounds = translateRect(session.sourceWorkspaceBounds, workspaceDelta);
  return plannedResolution({
    collisionState: session.collisionState,
    destinationBounds,
    order: decision.plan.sectionIds,
    plan: decision.plan,
    targetId: ADAPTER_PROOF_CANVAS_TARGET_ID,
  });
}

function resolveNestedPreview({
  orientation,
  screenDelta,
  session,
  targetId,
}: {
  orientation(parentId: string | null): ListOrientation;
  screenDelta: InteractionPoint;
  session: AdapterProofDragSession;
  targetId: string;
}): AdapterProofPreviewResolution {
  const targetResolution = resolveNestedTarget(targetId, session);
  if (targetResolution.status === "invalid") {
    return targetResolution.resolution;
  }
  const {
    clientRect: targetClientRect,
    id: resolvedTargetId,
    parentId: targetParentId,
    workspaceRect: targetWorkspaceRect,
  } = targetResolution.target;

  const activeRect = translateRect(session.sourceClientBounds, screenDelta);
  const pointer = translateOptionalPoint(session.activatorPoint, screenDelta);
  const collision = resolveCollisionFrame({
    activeRect,
    candidates: [
      {
        id: resolvedTargetId,
        intersectionArea: intersectionArea(activeRect, targetClientRect),
        orientation: orientation(targetParentId),
        rect: targetClientRect,
        sortableContainerId: targetParentId,
        triggerDistance: triggerDistance(activeRect, targetClientRect, orientation(targetParentId)),
      },
    ],
    parentByChild: session.hierarchy.parentByChild,
    pointer,
    previousState: session.collisionState,
  });
  const collisionTarget = collision.candidate?.id;
  if (!collisionTarget || collision.state.pastMidpoint === null) {
    return emptyResolution(collision.state, "Collision did not resolve an insertion boundary.");
  }
  const destinationOrder = resolveDestinationOrder(targetParentId, session);
  const targetIndex = destinationOrder.indexOf(collisionTarget);
  if (targetIndex < 0) {
    return emptyResolution(collision.state, `Target ${collisionTarget} has no canonical order.`);
  }
  const destinationIndex = targetIndex + Number(collision.state.pastMidpoint);
  const decision = planSectionMove({
    destination: { parentId: targetParentId, index: destinationIndex, topLevelPositions: null },
    hierarchy: session.hierarchy,
    mode: session.mode,
    selectedIds: session.sectionIds,
  });
  if (decision.status !== "planned") {
    return decisionResolution(collision.state, decision.status);
  }
  const destinationBounds = insertionBounds({
    orientation: orientation(targetParentId),
    pastMidpoint: collision.state.pastMidpoint,
    sourceBounds: session.sourceWorkspaceBounds,
    targetRect: targetWorkspaceRect,
  });
  const order = insertAt(destinationOrder, destinationIndex, session.sectionIds);
  return plannedResolution({
    collisionState: collision.state,
    destinationBounds,
    order,
    plan: decision.plan,
    targetId: collisionTarget,
  });
}

function resolveNestedTarget(
  targetId: string,
  session: AdapterProofDragSession,
): NestedTargetResolution {
  const resolvedTargetId = resolveModeTarget(targetId, session);
  if (!resolvedTargetId) {
    return invalidNestedTarget(
      session.collisionState,
      `Target ${targetId} is outside the sorting parent.`,
    );
  }
  if (session.sectionIds.includes(resolvedTargetId)) {
    return invalidNestedTarget(session.collisionState, "A selected section cannot target itself.");
  }

  const parentId = session.hierarchy.parentByChild[resolvedTargetId] ?? null;
  const clientRect = session.clientRectsById[resolvedTargetId];
  const workspaceRect = session.workspaceRectsById[resolvedTargetId];
  if (!clientRect || !workspaceRect) {
    return invalidNestedTarget(
      session.collisionState,
      `Drop target ${resolvedTargetId} is not measured.`,
    );
  }
  return {
    status: "resolved",
    target: { clientRect, id: resolvedTargetId, parentId, workspaceRect },
  };
}

function invalidNestedTarget(
  collisionState: CollisionTrackerState,
  reason: string,
): NestedTargetResolution {
  return { resolution: emptyResolution(collisionState, reason), status: "invalid" };
}

function translateOptionalPoint(
  point: InteractionPoint | null,
  delta: InteractionPoint,
): InteractionPoint | null {
  return point ? { x: point.x + delta.x, y: point.y + delta.y } : null;
}

function resolveDestinationOrder(
  parentId: string | null,
  session: AdapterProofDragSession,
): readonly string[] {
  const canonicalOrder = parentId
    ? (session.hierarchy.childrenByParent[parentId] ?? [])
    : session.hierarchy.rootSectionIds;
  return canonicalOrder.filter((sectionId) => !session.sectionIds.includes(sectionId));
}

function resolveModeTarget(targetId: string, session: AdapterProofDragSession): string | null {
  if (session.mode === "free") {
    return targetId;
  }
  let currentId: string | null = targetId;
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error(`Adapter-proof target ancestry contains a cycle at ${currentId}.`);
    }
    visited.add(currentId);
    if (
      (session.hierarchy.parentByChild[currentId] ?? null) ===
      session.hierarchy.parentByChild[session.sectionIds[0] ?? "missing"]
    ) {
      return currentId;
    }
    currentId = session.hierarchy.parentByChild[currentId] ?? null;
  }
  return null;
}

function plannedResolution({
  collisionState,
  destinationBounds,
  order,
  plan,
  targetId,
}: Omit<AdapterProofDragPreview, "destinationKey">): AdapterProofPreviewResolution {
  return {
    collisionState,
    preview: {
      collisionState,
      destinationBounds,
      destinationKey: serializeAdapterProofPlan(plan),
      order,
      plan,
      targetId,
    },
    reason: null,
  };
}

function emptyResolution(
  collisionState: CollisionTrackerState,
  reason: string,
): AdapterProofPreviewResolution {
  return { collisionState, preview: null, reason };
}

function decisionResolution(
  collisionState: CollisionTrackerState,
  status: "cancelled" | "rejected" | "unchanged",
): AdapterProofPreviewResolution {
  const reason = status === "rejected" ? "The package move plan rejected this target." : status;
  return emptyResolution(collisionState, reason);
}

function translateRect(rect: InteractionRect, delta: InteractionPoint): InteractionRect {
  return createInteractionRect(rect.x + delta.x, rect.y + delta.y, rect.width, rect.height);
}

function insertionBounds({
  orientation,
  pastMidpoint,
  sourceBounds,
  targetRect,
}: {
  orientation: ListOrientation;
  pastMidpoint: boolean;
  sourceBounds: InteractionRect;
  targetRect: InteractionRect;
}): InteractionRect {
  const gap = 12;
  if (orientation === "horizontal") {
    const x = pastMidpoint ? targetRect.right + gap : targetRect.x;
    return createInteractionRect(x, targetRect.y, sourceBounds.width, sourceBounds.height);
  }
  const y = pastMidpoint ? targetRect.bottom + gap : targetRect.y;
  return createInteractionRect(targetRect.x, y, sourceBounds.width, sourceBounds.height);
}

function intersectionArea(left: InteractionRect, right: InteractionRect): number {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.y, right.y));
  return width * height;
}

function triggerDistance(
  active: InteractionRect,
  target: InteractionRect,
  orientation: ListOrientation,
): number {
  return orientation === "horizontal" ? target.x - active.right : target.y - active.bottom;
}

function insertAt<T>(items: readonly T[], index: number, inserted: readonly T[]): readonly T[] {
  return [...items.slice(0, index), ...inserted, ...items.slice(index)];
}

function roundCoordinate(value: number): string {
  return value.toFixed(3);
}
