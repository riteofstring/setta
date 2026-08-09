import type { WorkspaceDocument, WorkspacePoint } from "../core.js";
import {
  clearCollisionTarget,
  EMPTY_COLLISION_TRACKER_STATE,
  type CollisionTrackerState,
} from "./collision-characterization.js";
import {
  clientPointToWorkspace,
  workspaceRectToClient,
  type MeasuredWorkspaceFrame,
  type WorkspaceGeometryIndex,
  type WorkspaceRect,
} from "./geometry-index.js";
import {
  createInteractionRect,
  type InteractionPoint,
  type InteractionRect,
} from "./interaction-geometry.js";
import {
  planSectionMove,
  serializeSectionMovePlan,
  validateWorkspaceSectionMovePlan,
  type SectionMoveDecision,
  type SectionMovePlan,
  type WorkspaceSectionMoveMode,
  type WorkspaceSectionMoveValidator,
} from "./section-move-planning.js";
import type { SectionHierarchySnapshot } from "./selection-planning.js";
import type { AdapterDndEvent } from "./upstream-dnd-adapter.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import { snapWorkspacePointToGrid } from "./workspace-preferences.js";
import {
  resolveSameParentFreeformKeyboardPreview,
  resolveSameParentFreeformPointerPreview,
  resolveWorkspaceFreeformCollisionPreview,
  workspaceSectionPointerDelta,
} from "./workspace-section-freeform-move-session.js";
import { resolveWorkspaceSectionKeyboardMove } from "./workspace-section-keyboard-move.js";
import { workspaceSectionMovePreviewAnnouncement } from "./workspace-section-move-announcements.js";
import {
  resolveWorkspaceSectionCollision,
  type WorkspaceSectionCollisionResolution,
  type WorkspaceSectionMoveRegion,
} from "./workspace-section-move-collision.js";
import { workspaceSectionHierarchySnapshot } from "./workspace-section-move-command.js";
import { resolveWorkspaceSectionMoveLayoutPreview } from "./workspace-section-move-layout-preview.js";
import {
  captureWorkspaceSectionMoveRegions,
  refreshWorkspaceSectionFreeformRegions,
  resolveWorkspaceSectionInvalidMoveRegion,
  type WorkspaceSectionFreeformRegion,
  type WorkspaceSectionMoveGeometryFrame,
} from "./workspace-section-move-regions.js";
import { resolveWorkspaceStructuralSelection } from "./workspace-selection.js";

type ScreenRect = Readonly<WorkspaceRect>;
type LogicalDirection = "ltr" | "rtl";

export type WorkspaceSectionMoveIndicator = Readonly<{
  kind: "canvas" | "empty" | "freeform" | "horizontal" | "vertical";
  rect: WorkspaceRect;
}>;

export type WorkspaceSectionMovePreview = Readonly<{
  announcement: string;
  destinationKey: string;
  indicator: WorkspaceSectionMoveIndicator;
  plan: SectionMovePlan;
  transformsById: Readonly<Record<string, WorkspacePoint>>;
}>;

export type WorkspaceSectionMovePreviewResolution = Readonly<{
  collisionState: CollisionTrackerState;
  invalidIndicator?: WorkspaceSectionMoveIndicator;
  preview: WorkspaceSectionMovePreview | null;
  reason: string;
}>;

export type WorkspaceSectionMoveSession<TSectionData = unknown> = Readonly<{
  activeSectionId: string;
  activeSelectionRootId: string;
  activeSourceParentId: string | null;
  activatorClientPoint: InteractionPoint | null;
  clientRectsById: Readonly<Record<string, InteractionRect>>;
  collisionState: CollisionTrackerState;
  document: WorkspaceDocument<TSectionData>;
  freeformRegions: readonly WorkspaceSectionFreeformRegion[];
  hierarchy: SectionHierarchySnapshot;
  mode: WorkspaceSectionMoveMode;
  preview: WorkspaceSectionMovePreview | null;
  regions: readonly WorkspaceSectionMoveRegion[];
  sectionIds: readonly string[];
  sourceClientBounds: ScreenRect;
  sourceParentIds: readonly (string | null)[];
  sourceRects: Readonly<Record<string, WorkspaceRect>>;
  sourceWorkspaceBounds: WorkspaceRect;
  startWorkspacePoint: WorkspacePoint | null;
  workspaceRectsById: Readonly<Record<string, WorkspaceRect>>;
}>;

export type WorkspaceSectionMoveSessionResult<TSectionData> =
  | Readonly<{ allowed: true; session: WorkspaceSectionMoveSession<TSectionData> }>
  | Readonly<{ allowed: false; reason: string }>;

type SourceGeometryResult =
  | Readonly<{
      allowed: true;
      canvas: HTMLElement;
      clientRectsById: Readonly<Record<string, InteractionRect>>;
      frame: DragGeometryFrame;
      rects: Readonly<Record<string, WorkspaceRect>>;
      workspaceBounds: WorkspaceRect;
      workspaceRectsById: Readonly<Record<string, WorkspaceRect>>;
    }>
  | Readonly<{ allowed: false; reason: string }>;

function recordFromEntries<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) {
    record[key] = value;
  }
  return record;
}

function rectBounds(rects: readonly WorkspaceRect[]): WorkspaceRect | null {
  const first = rects[0];
  if (!first) {
    return null;
  }
  let x = first.x;
  let y = first.y;
  let right = first.x + first.width;
  let bottom = first.y + first.height;
  for (let index = 1; index < rects.length; index += 1) {
    const rect = rects[index] as WorkspaceRect;
    x = Math.min(x, rect.x);
    y = Math.min(y, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { height: bottom - y, width: right - x, x, y };
}

function rectRecord(
  snapshot: readonly MeasuredWorkspaceFrame[],
): Readonly<Record<string, WorkspaceRect>> {
  return recordFromEntries(snapshot.map(({ rect, sectionId }) => [sectionId, rect] as const));
}

function selectedRects(
  rectsById: Readonly<Record<string, WorkspaceRect>>,
  sectionIds: readonly string[],
): Readonly<Record<string, WorkspaceRect>> | null {
  const entries = sectionIds.map((sectionId) => {
    const rect = rectsById[sectionId];
    return rect ? ([sectionId, rect] as const) : null;
  });
  return entries.some((entry) => entry === null)
    ? null
    : recordFromEntries(entries as readonly (readonly [string, WorkspaceRect])[]);
}

function interactionRect(rect: WorkspaceRect): InteractionRect {
  return createInteractionRect(rect.x, rect.y, rect.width, rect.height);
}

function clientRectRecord(
  snapshot: readonly MeasuredWorkspaceFrame[],
  frame: DragGeometryFrame,
): Readonly<Record<string, InteractionRect>> {
  return recordFromEntries(
    snapshot.map(
      ({ rect, sectionId }) =>
        [
          sectionId,
          interactionRect(workspaceRectToClient(rect, frame.canvasBounds, frame.viewport)),
        ] as const,
    ),
  );
}

function resolveSourceGeometry(
  geometry: WorkspaceGeometryMeasurements,
  geometryIndex: WorkspaceGeometryIndex,
  sectionIds: readonly string[],
): SourceGeometryResult {
  const snapshot = geometryIndex.snapshot();
  const workspaceRectsById = rectRecord(snapshot);
  const rects = selectedRects(workspaceRectsById, sectionIds);
  const workspaceBounds = rects ? rectBounds(Object.values(rects)) : null;
  if (!rects || !workspaceBounds) {
    return { allowed: false, reason: "The selected section block is not completely measured." };
  }
  const canvas = geometry.canvasElement();
  if (!canvas) {
    return { allowed: false, reason: "The workspace canvas is unavailable." };
  }
  const frame = {
    canvasBounds: geometry.canvasBounds(),
    viewport: geometry.currentViewport(),
  };
  return {
    allowed: true,
    canvas,
    clientRectsById: clientRectRecord(snapshot, frame),
    frame,
    rects,
    workspaceBounds,
    workspaceRectsById,
  };
}

function validateSortRegion(
  mode: WorkspaceSectionMoveMode,
  sourceParentIds: readonly (string | null)[],
  freeformRegions: readonly WorkspaceSectionFreeformRegion[],
  regions: readonly WorkspaceSectionMoveRegion[],
): string | null {
  if (mode !== "sort") {
    return null;
  }
  const uniqueParents = new Set(sourceParentIds);
  if (uniqueParents.size !== 1) {
    return "Sorting mode requires selected sections to share one nested parent.";
  }
  const sourceParentId = sourceParentIds[0] ?? null;
  if (sourceParentId === null) {
    return "Top-level sections are spatial and cannot use sorting mode.";
  }
  return [...regions, ...freeformRegions].some(
    (region) => region.parentSectionId === sourceParentId,
  )
    ? null
    : "The source container is unavailable.";
}

function activeSelectionRoot(
  activeSectionId: string,
  sectionIds: readonly string[],
  hierarchy: SectionHierarchySnapshot,
): string {
  const roots = new Set(sectionIds);
  let sectionId: string | null = activeSectionId;
  while (sectionId !== null) {
    if (roots.has(sectionId)) return sectionId;
    sectionId = hierarchy.parentByChild[sectionId] ?? null;
  }
  throw new Error("The active section is outside the normalized movement selection.");
}

export function createWorkspaceSectionMoveSession<TSectionData>({
  activeSectionId,
  activatorClientPoint,
  document,
  geometry,
  geometryIndex,
  mode,
  selectedSectionIds,
}: Readonly<{
  activeSectionId: string;
  activatorClientPoint: InteractionPoint | null;
  document: WorkspaceDocument<TSectionData>;
  geometry: WorkspaceGeometryMeasurements;
  geometryIndex: WorkspaceGeometryIndex;
  mode: WorkspaceSectionMoveMode;
  selectedSectionIds: readonly string[];
}>): WorkspaceSectionMoveSessionResult<TSectionData> {
  geometry.settleMeasurement();
  const hierarchy = workspaceSectionHierarchySnapshot(document);
  const requestedIds = selectedSectionIds.includes(activeSectionId)
    ? selectedSectionIds
    : [activeSectionId];
  const selection = resolveWorkspaceStructuralSelection(document, requestedIds);
  if (!selection.allowed) {
    return selection;
  }
  const source = resolveSourceGeometry(geometry, geometryIndex, selection.block.sectionIds);
  if (!source.allowed) {
    return source;
  }
  const regionCapture = captureWorkspaceSectionMoveRegions(source.canvas, document, source.frame);
  if (!regionCapture.allowed) {
    return regionCapture;
  }
  const sortReason = validateSortRegion(
    mode,
    selection.block.sourceParentIds,
    regionCapture.freeformRegions,
    regionCapture.regions,
  );
  if (sortReason) {
    return { allowed: false, reason: sortReason };
  }
  const activeRootId = activeSelectionRoot(activeSectionId, selection.block.sectionIds, hierarchy);
  const activeRootIndex = selection.block.sectionIds.indexOf(activeRootId);
  return {
    allowed: true,
    session: {
      activeSectionId,
      activeSelectionRootId: activeRootId,
      activeSourceParentId: selection.block.sourceParentIds[activeRootIndex] ?? null,
      activatorClientPoint,
      clientRectsById: source.clientRectsById,
      collisionState: EMPTY_COLLISION_TRACKER_STATE,
      document,
      freeformRegions: regionCapture.freeformRegions,
      hierarchy,
      mode,
      preview: null,
      regions: regionCapture.regions,
      sectionIds: selection.block.sectionIds,
      sourceClientBounds: workspaceRectToClient(
        source.workspaceBounds,
        source.frame.canvasBounds,
        source.frame.viewport,
      ),
      sourceParentIds: selection.block.sourceParentIds,
      sourceRects: source.rects,
      sourceWorkspaceBounds: source.workspaceBounds,
      startWorkspacePoint: activatorClientPoint
        ? clientPointToWorkspace(
            activatorClientPoint,
            source.frame.canvasBounds,
            source.frame.viewport,
          )
        : null,
      workspaceRectsById: source.workspaceRectsById,
    },
  };
}

function currentClientPoint(
  event: AdapterDndEvent,
  session: WorkspaceSectionMoveSession,
): InteractionPoint {
  if (event.clientPoint) {
    return event.clientPoint;
  }
  const origin = session.activatorClientPoint ?? {
    x: session.sourceClientBounds.x + session.sourceClientBounds.width / 2,
    y: session.sourceClientBounds.y + session.sourceClientBounds.height / 2,
  };
  return { x: origin.x + event.transform.x, y: origin.y + event.transform.y };
}

function currentClientTransform(
  event: AdapterDndEvent,
  point: InteractionPoint,
  session: WorkspaceSectionMoveSession,
): InteractionPoint {
  if (!event.clientPoint) {
    return event.transform;
  }
  const origin = session.activatorClientPoint ?? {
    x: session.sourceClientBounds.x + session.sourceClientBounds.width / 2,
    y: session.sourceClientBounds.y + session.sourceClientBounds.height / 2,
  };
  return { x: point.x - origin.x, y: point.y - origin.y };
}

function pointInsideRect(point: InteractionPoint, rect: ScreenRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

type DragGeometryFrame = WorkspaceSectionMoveGeometryFrame;

function pastLogicalMidpoint(
  point: InteractionPoint,
  rect: ScreenRect,
  orientation: "horizontal" | "vertical",
  direction: LogicalDirection,
): boolean {
  if (orientation === "vertical") {
    return point.y > rect.y + rect.height / 2;
  }
  const midpoint = rect.x + rect.width / 2;
  return direction === "rtl" ? point.x < midpoint : point.x > midpoint;
}

export function resolveWorkspaceSectionInsertionIndex({
  direction,
  orderedRects,
  orientation,
  point,
}: Readonly<{
  direction: LogicalDirection;
  orderedRects: readonly ScreenRect[];
  orientation: "horizontal" | "vertical";
  point: InteractionPoint;
}>): number {
  return orderedRects.filter((rect) => pastLogicalMidpoint(point, rect, orientation, direction))
    .length;
}

function logicalLeadingEdge(
  rect: WorkspaceRect,
  orientation: "horizontal" | "vertical",
  direction: LogicalDirection,
): number {
  if (orientation === "vertical") {
    return rect.y;
  }
  return direction === "rtl" ? rect.x + rect.width : rect.x;
}

function logicalTrailingEdge(
  rect: WorkspaceRect,
  orientation: "horizontal" | "vertical",
  direction: LogicalDirection,
): number {
  if (orientation === "vertical") {
    return rect.y + rect.height;
  }
  return direction === "rtl" ? rect.x : rect.x + rect.width;
}

function insertionBoundary(
  orderedRects: readonly WorkspaceRect[],
  index: number,
  orientation: "horizontal" | "vertical",
  direction: LogicalDirection,
): number {
  const first = orderedRects[0];
  const last = orderedRects.at(-1);
  if (!first || !last) {
    throw new Error("An insertion boundary requires at least one destination section.");
  }
  if (index === 0) {
    return logicalLeadingEdge(first, orientation, direction);
  }
  if (index === orderedRects.length) {
    return logicalTrailingEdge(last, orientation, direction);
  }
  const previous = orderedRects[index - 1] as WorkspaceRect;
  const next = orderedRects[index] as WorkspaceRect;
  return (
    (logicalTrailingEdge(previous, orientation, direction) +
      logicalLeadingEdge(next, orientation, direction)) /
    2
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function workspaceSectionInsertionIndicator({
  direction,
  index,
  orderedRects,
  orientation,
  regionRect,
  zoom,
}: Readonly<{
  direction: LogicalDirection;
  index: number;
  orderedRects: readonly WorkspaceRect[];
  orientation: "horizontal" | "vertical";
  regionRect: WorkspaceRect;
  zoom: number;
}>): WorkspaceSectionMoveIndicator {
  const inset = 6 / zoom;
  if (orderedRects.length === 0) {
    return {
      kind: "empty",
      rect: {
        height: Math.max(0, regionRect.height - inset * 2),
        width: Math.max(0, regionRect.width - inset * 2),
        x: regionRect.x + inset,
        y: regionRect.y + inset,
      },
    };
  }
  const thickness = 4 / zoom;
  const boundary = insertionBoundary(orderedRects, index, orientation, direction);
  if (orientation === "horizontal") {
    const x = clamp(boundary, regionRect.x, regionRect.x + regionRect.width);
    return {
      kind: "horizontal",
      rect: {
        height: Math.max(0, regionRect.height - inset * 2),
        width: thickness,
        x: x - thickness / 2,
        y: regionRect.y + inset,
      },
    };
  }
  const y = clamp(boundary, regionRect.y, regionRect.y + regionRect.height);
  return {
    kind: "vertical",
    rect: {
      height: thickness,
      width: Math.max(0, regionRect.width - inset * 2),
      x: regionRect.x + inset,
      y: y - thickness / 2,
    },
  };
}

function previewFromDecision<TSectionData>(
  collisionState: CollisionTrackerState,
  document: WorkspaceDocument<TSectionData>,
  decision: SectionMoveDecision,
  indicator: WorkspaceSectionMoveIndicator,
  session: WorkspaceSectionMoveSession<TSectionData>,
): WorkspaceSectionMovePreviewResolution {
  if (decision.status !== "planned") {
    const reason =
      decision.status === "rejected"
        ? decision.reason
        : decision.status === "unchanged"
          ? "The section block is already at this location."
          : "Section movement was canceled.";
    return { collisionState, invalidIndicator: indicator, preview: null, reason };
  }
  const layoutPreview = resolveWorkspaceSectionMoveLayoutPreview({
    hierarchy: session.hierarchy,
    plan: decision.plan,
    rectsById: session.workspaceRectsById,
    regions: session.regions,
  });
  if (!layoutPreview.allowed) {
    return { collisionState, preview: null, reason: layoutPreview.reason };
  }
  return {
    collisionState,
    preview: {
      announcement: workspaceSectionMovePreviewAnnouncement(document, decision.plan),
      destinationKey: serializeSectionMovePlan(decision.plan),
      indicator,
      plan: decision.plan,
      transformsById: layoutPreview.preview.transformsById,
    },
    reason: "",
  };
}

function resolveNestedPreview<TSectionData>({
  collision,
  document,
  frame,
  session,
  validateSectionMove,
}: Readonly<{
  collision: WorkspaceSectionCollisionResolution;
  document: WorkspaceDocument<TSectionData>;
  frame: DragGeometryFrame;
  session: WorkspaceSectionMoveSession<TSectionData>;
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
}>): WorkspaceSectionMovePreviewResolution {
  const target = collision.target;
  if (!target) {
    return {
      collisionState: collision.collisionState,
      preview: null,
      reason: collision.reason,
    };
  }
  if (target.placement !== "ordered") {
    return {
      collisionState: clearCollisionTarget(collision.collisionState),
      preview: null,
      reason: "The ordered destination container is unavailable.",
    };
  }
  const selected = new Set(session.sectionIds);
  const layout = document.sections[target.destinationParentId]?.childLayout;
  const destinationIds = (layout?.sectionIds ?? []).filter((sectionId) => !selected.has(sectionId));
  const workspaceRects = destinationIds.map((sectionId) => session.workspaceRectsById[sectionId]);
  if (!layout || layout.positioning !== "ordered") {
    return {
      collisionState: clearCollisionTarget(collision.collisionState),
      preview: null,
      reason: "The destination container is unavailable.",
    };
  }
  if (workspaceRects.some((rect) => !rect)) {
    return {
      collisionState: clearCollisionTarget(collision.collisionState),
      preview: null,
      reason: "The destination order is not completely measured.",
    };
  }
  const orderedWorkspaceRects = workspaceRects as readonly WorkspaceRect[];
  const decision = planSectionMove({
    destination: {
      parentId: target.destinationParentId,
      placement: { index: target.destinationIndex, type: "ordered" },
    },
    hierarchy: session.hierarchy,
    mode: session.mode,
    selectedIds: session.sectionIds,
    validate: (plan) => validateWorkspaceSectionMovePlan(document, plan, validateSectionMove),
  });
  const indicator = workspaceSectionInsertionIndicator({
    direction: target.direction,
    index: target.destinationIndex,
    orderedRects: orderedWorkspaceRects,
    orientation: target.orientation,
    regionRect: target.region.workspaceRect,
    zoom: frame.viewport.zoom,
  });
  return previewFromDecision(collision.collisionState, document, decision, indicator, session);
}

function canvasPositions(
  session: WorkspaceSectionMoveSession,
  delta: WorkspacePoint,
  gridOptions: ResolvedWorkspaceGridOptions,
): Readonly<Record<string, WorkspacePoint>> {
  const anchorId = session.sectionIds.includes(session.activeSectionId)
    ? session.activeSectionId
    : (session.sectionIds[0] as string);
  const anchor = session.sourceRects[anchorId] as WorkspaceRect;
  const rawAnchor = { x: anchor.x + delta.x, y: anchor.y + delta.y };
  const nextAnchor = gridOptions.snap
    ? snapWorkspacePointToGrid(rawAnchor, gridOptions.spacing)
    : rawAnchor;
  const snappedDelta = { x: nextAnchor.x - anchor.x, y: nextAnchor.y - anchor.y };
  return recordFromEntries(
    session.sectionIds.map((sectionId) => {
      const rect = session.sourceRects[sectionId] as WorkspaceRect;
      return [sectionId, { x: rect.x + snappedDelta.x, y: rect.y + snappedDelta.y }] as const;
    }),
  );
}

function resolveCanvasPreview<TSectionData>({
  document,
  event,
  frame,
  gridOptions,
  point,
  session,
  validateSectionMove,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  event: AdapterDndEvent;
  frame: DragGeometryFrame;
  gridOptions: ResolvedWorkspaceGridOptions;
  point: InteractionPoint;
  session: WorkspaceSectionMoveSession<TSectionData>;
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
}>): WorkspaceSectionMovePreviewResolution {
  const collisionState = clearCollisionTarget(session.collisionState);
  if (session.mode === "sort") {
    return {
      collisionState,
      preview: null,
      reason: "Sorting mode cannot move a section to the canvas.",
    };
  }
  const positions = canvasPositions(
    session,
    workspaceSectionPointerDelta(event, point, frame, session),
    gridOptions,
  );
  const decision = planSectionMove({
    destination: {
      parentId: null,
      placement: { positions, type: "freeform" },
    },
    hierarchy: session.hierarchy,
    mode: session.mode,
    selectedIds: session.sectionIds,
    validate: (plan) => validateWorkspaceSectionMovePlan(document, plan, validateSectionMove),
  });
  const anchorPosition = positions[session.sectionIds[0] ?? ""];
  const anchorSource = session.sourceRects[session.sectionIds[0] ?? ""];
  const indicator = {
    kind: "canvas",
    rect:
      anchorPosition && anchorSource
        ? {
            ...session.sourceWorkspaceBounds,
            x: session.sourceWorkspaceBounds.x + anchorPosition.x - anchorSource.x,
            y: session.sourceWorkspaceBounds.y + anchorPosition.y - anchorSource.y,
          }
        : session.sourceWorkspaceBounds,
  } as const;
  return previewFromDecision(collisionState, document, decision, indicator, session);
}

export function resolveWorkspaceSectionMovePreview<TSectionData>({
  document,
  event,
  geometry,
  gridOptions,
  session,
  validateSectionMove,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  event: AdapterDndEvent;
  geometry: WorkspaceGeometryMeasurements;
  gridOptions: ResolvedWorkspaceGridOptions;
  session: WorkspaceSectionMoveSession<TSectionData>;
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
}>): WorkspaceSectionMovePreviewResolution {
  const canvas = geometry.canvasElement();
  if (!canvas) {
    return {
      collisionState: clearCollisionTarget(session.collisionState),
      preview: null,
      reason: "The workspace canvas is unavailable.",
    };
  }
  const point = currentClientPoint(event, session);
  const frame = {
    canvasBounds: geometry.canvasBounds(),
    viewport: geometry.currentViewport(),
  };
  const freeformRegions = refreshWorkspaceSectionFreeformRegions(session.freeformRegions, frame);
  if (!pointInsideRect(point, frame.canvasBounds)) {
    return {
      collisionState: clearCollisionTarget(session.collisionState),
      preview: null,
      reason: "The pointer is outside the workspace canvas.",
    };
  }
  const invalidRegion = resolveWorkspaceSectionInvalidMoveRegion({
    freeformRegions,
    hierarchy: session.hierarchy,
    orderedRegions: session.regions,
    point,
    sectionIds: session.sectionIds,
  });
  if (invalidRegion) {
    const indicator =
      invalidRegion.positioning === "freeform"
        ? ({ kind: "freeform", rect: invalidRegion.region.workspaceRect } as const)
        : workspaceSectionInsertionIndicator({
            direction: invalidRegion.region.direction,
            index: 0,
            orderedRects: [],
            orientation: invalidRegion.region.orientation,
            regionRect: invalidRegion.region.workspaceRect,
            zoom: frame.viewport.zoom,
          });
    return {
      collisionState: clearCollisionTarget(session.collisionState),
      invalidIndicator: indicator,
      preview: null,
      reason: "A section cannot move into itself or one of its descendants.",
    };
  }
  const transform = currentClientTransform(event, point, session);
  const activeRect = createInteractionRect(
    session.sourceClientBounds.x + transform.x,
    session.sourceClientBounds.y + transform.y,
    session.sourceClientBounds.width,
    session.sourceClientBounds.height,
  );
  const collision = resolveWorkspaceSectionCollision({
    activeRect,
    clientRectsById: session.clientRectsById,
    freeformRegions,
    hierarchy: session.hierarchy,
    mode: session.mode,
    pointer: point,
    previousState: session.collisionState,
    regions: session.regions,
    sectionIds: session.sectionIds,
    sourceParentId: session.activeSourceParentId,
  });
  if (collision.target) {
    if (collision.target.placement === "freeform") {
      return resolveWorkspaceFreeformCollisionPreview({
        collisionState: collision.collisionState,
        document,
        event,
        frame,
        gridOptions,
        point,
        region: freeformRegions.find(
          (candidate) => candidate.parentSectionId === collision.target?.destinationParentId,
        ),
        session,
        validateSectionMove,
      });
    }
    return resolveNestedPreview({
      collision,
      document,
      frame,
      session,
      validateSectionMove,
    });
  }
  const freeformPreview = resolveSameParentFreeformPointerPreview({
    document,
    event,
    frame,
    gridOptions,
    point,
    session,
    validateSectionMove,
  });
  if (freeformPreview) {
    return freeformPreview;
  }
  if (session.mode === "sort") {
    return {
      collisionState: collision.collisionState,
      preview: null,
      reason: collision.reason,
    };
  }
  return resolveCanvasPreview({
    document,
    event,
    frame,
    gridOptions,
    point,
    session,
    validateSectionMove,
  });
}

export function resolveWorkspaceSectionKeyboardMovePreview<TSectionData>({
  direction,
  document,
  geometry,
  gridOptions,
  session,
  validateSectionMove,
}: Readonly<{
  direction: NonNullable<AdapterDndEvent["keyboardDirection"]>;
  document: WorkspaceDocument<TSectionData>;
  geometry: WorkspaceGeometryMeasurements;
  gridOptions: ResolvedWorkspaceGridOptions;
  session: WorkspaceSectionMoveSession<TSectionData>;
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
}>): WorkspaceSectionMovePreviewResolution {
  const freeformPreview = resolveSameParentFreeformKeyboardPreview({
    direction,
    document,
    geometry,
    gridOptions,
    session,
    validateSectionMove,
  });
  if (freeformPreview) {
    return freeformPreview;
  }
  const frame = {
    canvasBounds: geometry.canvasBounds(),
    viewport: geometry.currentViewport(),
  };
  const freeformRegions = refreshWorkspaceSectionFreeformRegions(session.freeformRegions, frame);
  const resolution = resolveWorkspaceSectionKeyboardMove({
    direction,
    document,
    freeformRegions,
    gridOptions,
    session,
    validateSectionMove,
  });
  if (resolution.status === "unavailable") {
    return {
      collisionState: clearCollisionTarget(session.collisionState),
      preview: null,
      reason: resolution.reason,
    };
  }
  if (resolution.freeformIndicator) {
    return previewFromDecision(
      clearCollisionTarget(session.collisionState),
      document,
      resolution.decision,
      resolution.freeformIndicator,
      session,
    );
  }
  if (!resolution.region) {
    return previewFromDecision(
      clearCollisionTarget(session.collisionState),
      document,
      resolution.decision,
      { kind: "canvas", rect: session.sourceWorkspaceBounds },
      session,
    );
  }
  const orderedRects = resolution.destinationIds.map(
    (sectionId) => session.workspaceRectsById[sectionId],
  );
  if (orderedRects.some((rect) => !rect)) {
    return {
      collisionState: clearCollisionTarget(session.collisionState),
      preview: null,
      reason: "The keyboard destination order is not completely measured.",
    };
  }
  const indicator = workspaceSectionInsertionIndicator({
    direction: resolution.region.direction,
    index: resolution.destinationIndex,
    orderedRects: orderedRects as readonly WorkspaceRect[],
    orientation: resolution.region.orientation,
    regionRect: resolution.region.workspaceRect,
    zoom: frame.viewport.zoom,
  });
  return previewFromDecision(
    clearCollisionTarget(session.collisionState),
    document,
    resolution.decision,
    indicator,
    session,
  );
}

export function revalidateWorkspaceSectionKeyboardMovePreview<TSectionData>({
  session,
  validateSectionMove,
}: Readonly<{
  session: WorkspaceSectionMoveSession<TSectionData>;
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
}>): WorkspaceSectionMovePreviewResolution {
  const preview = session.preview;
  if (!preview) {
    return {
      collisionState: clearCollisionTarget(session.collisionState),
      preview: null,
      reason: "No keyboard move destination is selected.",
    };
  }
  const decision = planSectionMove({
    destination: preview.plan.destination,
    hierarchy: session.hierarchy,
    mode: session.mode,
    selectedIds: session.sectionIds,
    validate: (plan) =>
      validateWorkspaceSectionMovePlan(session.document, plan, validateSectionMove),
  });
  return previewFromDecision(
    clearCollisionTarget(session.collisionState),
    session.document,
    decision,
    preview.indicator,
    session,
  );
}

export function matchingWorkspaceSectionMovePreview(
  displayed: WorkspaceSectionMovePreview | null,
  resolved: WorkspaceSectionMovePreviewResolution,
): WorkspaceSectionMovePreview | null {
  return displayed?.destinationKey === resolved.preview?.destinationKey ? resolved.preview : null;
}
