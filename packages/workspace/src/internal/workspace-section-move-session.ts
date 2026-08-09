import type { WorkspaceDocument, WorkspacePoint } from "../core.js";
import {
  clearCollisionTarget,
  EMPTY_COLLISION_TRACKER_STATE,
  type CollisionTrackerState,
} from "./collision-characterization.js";
import {
  clientPointToWorkspace,
  clientRectToWorkspace,
  workspaceRectToClient,
  type MeasuredWorkspaceFrame,
  type WorkspaceGeometryIndex,
  type WorkspaceRect,
} from "./geometry-index.js";
import {
  createInteractionRect,
  type InteractionPoint,
  type InteractionRect,
  type ViewportTransform,
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
import {
  selectionContainsSectionOrAncestor,
  type SectionHierarchySnapshot,
} from "./selection-planning.js";
import type { AdapterDndEvent } from "./upstream-dnd-adapter.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import { snapWorkspacePointToGrid } from "./workspace-preferences.js";
import { resolveWorkspaceSectionKeyboardMove } from "./workspace-section-keyboard-move.js";
import { workspaceSectionMovePreviewAnnouncement } from "./workspace-section-move-announcements.js";
import {
  resolveWorkspaceSectionCollision,
  type WorkspaceSectionCollisionResolution,
  type WorkspaceSectionMoveDirection,
  type WorkspaceSectionMoveRegion,
} from "./workspace-section-move-collision.js";
import { workspaceSectionHierarchySnapshot } from "./workspace-section-move-command.js";
import { resolveWorkspaceSectionMoveLayoutPreview } from "./workspace-section-move-layout-preview.js";
import { resolveWorkspaceStructuralSelection } from "./workspace-selection.js";

const WORKSPACE_SECTION_CHILD_REGION_ATTRIBUTE = "data-workspace-section-child-region";

type ScreenRect = Readonly<WorkspaceRect>;
type LogicalDirection = "ltr" | "rtl";

export type WorkspaceSectionMoveIndicator = Readonly<{
  kind: "canvas" | "empty" | "horizontal" | "vertical";
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
  activatorClientPoint: InteractionPoint | null;
  clientRectsById: Readonly<Record<string, InteractionRect>>;
  collisionState: CollisionTrackerState;
  document: WorkspaceDocument<TSectionData>;
  hierarchy: SectionHierarchySnapshot;
  mode: WorkspaceSectionMoveMode;
  preview: WorkspaceSectionMovePreview | null;
  regions: readonly WorkspaceSectionMoveRegion[];
  sectionIds: readonly string[];
  sourceClientBounds: ScreenRect;
  sourceParentId: string | null;
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

type RegionCaptureResult =
  | Readonly<{ allowed: true; regions: readonly WorkspaceSectionMoveRegion[] }>
  | Readonly<{ allowed: false; reason: string }>;

function logicalDirection(region: HTMLElement): WorkspaceSectionMoveDirection {
  return region.ownerDocument.defaultView?.getComputedStyle(region).direction === "rtl"
    ? "rtl"
    : "ltr";
}

function layoutGap(region: HTMLElement, orientation: "horizontal" | "vertical"): number | null {
  const style = region.ownerDocument.defaultView?.getComputedStyle(region);
  const value = style ? (orientation === "horizontal" ? style.columnGap : style.rowGap) : "";
  const gap = Number.parseFloat(value);
  return Number.isFinite(gap) && gap >= 0 ? gap : null;
}

function captureMoveRegions<TSectionData>(
  canvas: HTMLElement,
  document: WorkspaceDocument<TSectionData>,
  frame: DragGeometryFrame,
): RegionCaptureResult {
  const regions: WorkspaceSectionMoveRegion[] = [];
  const seen = new Set<string>();
  for (const element of childRegions(canvas)) {
    const parentSectionId = element.getAttribute(WORKSPACE_SECTION_CHILD_REGION_ATTRIBUTE);
    const layout = parentSectionId ? document.sections[parentSectionId]?.childLayout : null;
    if (!parentSectionId || !layout || seen.has(parentSectionId)) {
      return { allowed: false, reason: "A section move destination region is invalid." };
    }
    const gap = layoutGap(element, layout.orientation);
    if (gap === null) {
      return { allowed: false, reason: `The ${parentSectionId} layout gap is unavailable.` };
    }
    const clientRect = interactionRect(screenRect(element.getBoundingClientRect()));
    regions.push({
      clientRect,
      direction: logicalDirection(element),
      gap,
      orientation: layout.orientation,
      parentSectionId,
      workspaceRect: clientRectToWorkspace(clientRect, frame.canvasBounds, frame.viewport),
    });
    seen.add(parentSectionId);
  }
  return { allowed: true, regions };
}

function validateSortRegion(
  mode: WorkspaceSectionMoveMode,
  sourceParentId: string | null,
  regions: readonly WorkspaceSectionMoveRegion[],
): string | null {
  if (mode !== "sort") {
    return null;
  }
  if (sourceParentId === null) {
    return "Top-level sections are spatial and cannot use sorting mode.";
  }
  return regions.some((region) => region.parentSectionId === sourceParentId)
    ? null
    : "The source container is unavailable.";
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
  geometry.flushMeasurement();
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
  const regionCapture = captureMoveRegions(source.canvas, document, source.frame);
  if (!regionCapture.allowed) {
    return regionCapture;
  }
  const sortReason = validateSortRegion(
    mode,
    selection.block.sourceParentId,
    regionCapture.regions,
  );
  if (sortReason) {
    return { allowed: false, reason: sortReason };
  }
  return {
    allowed: true,
    session: {
      activeSectionId,
      activatorClientPoint,
      clientRectsById: source.clientRectsById,
      collisionState: EMPTY_COLLISION_TRACKER_STATE,
      document,
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
      sourceParentId: selection.block.sourceParentId,
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

function sectionDepth(sectionId: string, hierarchy: SectionHierarchySnapshot): number {
  let depth = 0;
  let parentId = hierarchy.parentByChild[sectionId] ?? null;
  while (parentId) {
    depth += 1;
    parentId = hierarchy.parentByChild[parentId] ?? null;
  }
  return depth;
}

function invalidDestinationRegion(
  point: InteractionPoint,
  session: WorkspaceSectionMoveSession,
): WorkspaceSectionMoveRegion | null {
  const movingIds = new Set(session.sectionIds);
  const invalidRegions = session.regions.filter(
    (region) =>
      pointInsideRect(point, region.clientRect) &&
      selectionContainsSectionOrAncestor(
        region.parentSectionId,
        movingIds,
        session.hierarchy.parentByChild,
      ),
  );
  return (
    invalidRegions.sort(
      (left, right) =>
        sectionDepth(right.parentSectionId, session.hierarchy) -
        sectionDepth(left.parentSectionId, session.hierarchy),
    )[0] ?? null
  );
}

function childRegions(canvas: HTMLElement): readonly HTMLElement[] {
  return [...canvas.querySelectorAll<HTMLElement>(`[${WORKSPACE_SECTION_CHILD_REGION_ATTRIBUTE}]`)];
}

function screenRect(rect: DOMRect): ScreenRect {
  return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
}

type DragGeometryFrame = Readonly<{
  canvasBounds: ScreenRect;
  viewport: ViewportTransform;
}>;

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
  const selected = new Set(session.sectionIds);
  const layout = document.sections[target.destinationParentId]?.childLayout;
  const destinationIds = (layout?.sectionIds ?? []).filter((sectionId) => !selected.has(sectionId));
  const workspaceRects = destinationIds.map((sectionId) => session.workspaceRectsById[sectionId]);
  if (!layout) {
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
      index: target.destinationIndex,
      parentId: target.destinationParentId,
      topLevelPositions: null,
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

function workspaceDelta(
  event: AdapterDndEvent,
  point: InteractionPoint,
  frame: DragGeometryFrame,
  session: WorkspaceSectionMoveSession,
): WorkspacePoint {
  if (session.startWorkspacePoint) {
    const current = clientPointToWorkspace(point, frame.canvasBounds, frame.viewport);
    return {
      x: current.x - session.startWorkspacePoint.x,
      y: current.y - session.startWorkspacePoint.y,
    };
  }
  return {
    x: event.transform.x / frame.viewport.zoom,
    y: event.transform.y / frame.viewport.zoom,
  };
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
    workspaceDelta(event, point, frame, session),
    gridOptions,
  );
  const selected = new Set(session.sectionIds);
  const destinationIndex = session.hierarchy.rootSectionIds.filter(
    (sectionId) => !selected.has(sectionId),
  ).length;
  const decision = planSectionMove({
    destination: { index: destinationIndex, parentId: null, topLevelPositions: positions },
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
  if (!pointInsideRect(point, frame.canvasBounds)) {
    return {
      collisionState: clearCollisionTarget(session.collisionState),
      preview: null,
      reason: "The pointer is outside the workspace canvas.",
    };
  }
  const invalidRegion = invalidDestinationRegion(point, session);
  if (invalidRegion) {
    return {
      collisionState: clearCollisionTarget(session.collisionState),
      invalidIndicator: workspaceSectionInsertionIndicator({
        direction: invalidRegion.direction,
        index: 0,
        orderedRects: [],
        orientation: invalidRegion.orientation,
        regionRect: invalidRegion.workspaceRect,
        zoom: frame.viewport.zoom,
      }),
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
    hierarchy: session.hierarchy,
    mode: session.mode,
    pointer: point,
    previousState: session.collisionState,
    regions: session.regions,
    sectionIds: session.sectionIds,
    sourceParentId: session.sourceParentId,
  });
  if (collision.target) {
    return resolveNestedPreview({
      collision,
      document,
      frame,
      session,
      validateSectionMove,
    });
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
  session,
  validateSectionMove,
}: Readonly<{
  direction: NonNullable<AdapterDndEvent["keyboardDirection"]>;
  document: WorkspaceDocument<TSectionData>;
  geometry: WorkspaceGeometryMeasurements;
  session: WorkspaceSectionMoveSession<TSectionData>;
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
}>): WorkspaceSectionMovePreviewResolution {
  const resolution = resolveWorkspaceSectionKeyboardMove({
    direction,
    document,
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
    zoom: geometry.currentViewport().zoom,
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
    destination: {
      index: preview.plan.destinationIndex,
      parentId: preview.plan.destinationParentId,
      topLevelPositions: preview.plan.topLevelPositions,
    },
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
