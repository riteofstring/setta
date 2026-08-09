import type { WorkspaceActionResult, WorkspaceDocument, WorkspacePoint } from "../core.js";
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
  type SectionMoveDecision,
  type SectionMovePlan,
  type WorkspaceSectionMoveMode,
} from "./section-move-planning.js";
import { resolveSelectionBlock, type SectionHierarchySnapshot } from "./selection-planning.js";
import type { AdapterDndEvent } from "./upstream-dnd-adapter.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import { snapWorkspacePointToGrid } from "./workspace-preferences.js";
import {
  resolveWorkspaceSectionCollision,
  type WorkspaceSectionCollisionResolution,
  type WorkspaceSectionMoveDirection,
  type WorkspaceSectionMoveRegion,
} from "./workspace-section-move-collision.js";
import { workspaceSectionHierarchySnapshot } from "./workspace-section-move-command.js";
import { resolveWorkspaceSectionMoveLayoutPreview } from "./workspace-section-move-layout-preview.js";

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
  return Object.fromEntries(snapshot.map(({ rect, sectionId }) => [sectionId, rect]));
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
    : Object.fromEntries(entries as readonly (readonly [string, WorkspaceRect])[]);
}

function interactionRect(rect: WorkspaceRect): InteractionRect {
  return createInteractionRect(rect.x, rect.y, rect.width, rect.height);
}

function clientRectRecord(
  snapshot: readonly MeasuredWorkspaceFrame[],
  frame: DragGeometryFrame,
): Readonly<Record<string, InteractionRect>> {
  return Object.fromEntries(
    snapshot.map(({ rect, sectionId }) => [
      sectionId,
      interactionRect(workspaceRectToClient(rect, frame.canvasBounds, frame.viewport)),
    ]),
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
  const selection = resolveSelectionBlock(requestedIds, hierarchy);
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
  const origin = session.activatorClientPoint ?? {
    x: session.sourceClientBounds.x + session.sourceClientBounds.width / 2,
    y: session.sourceClientBounds.y + session.sourceClientBounds.height / 2,
  };
  return { x: origin.x + event.transform.x, y: origin.y + event.transform.y };
}

function pointInsideRect(point: InteractionPoint, rect: ScreenRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
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

function moveSubject<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionIds: readonly string[],
): string {
  const title = document.sections[sectionIds[0] ?? ""]?.title ?? "Section";
  return sectionIds.length === 1 ? title : `${title} and ${String(sectionIds.length - 1)} more`;
}

function destinationDescription<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  plan: SectionMovePlan,
): string {
  if (plan.destinationParentId === null) {
    return "the canvas";
  }
  return document.sections[plan.destinationParentId]?.title ?? "the destination container";
}

function nestedPositionDescription<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  plan: SectionMovePlan,
): string {
  if (plan.destinationParentId === null) {
    return "";
  }
  const currentCount = document.sections[plan.destinationParentId]?.childLayout?.sectionIds.length;
  const movedFromDestination =
    plan.sourceParentId === plan.destinationParentId ? plan.sectionIds.length : 0;
  const total = (currentCount ?? 0) - movedFromDestination + plan.sectionIds.length;
  const first = plan.destinationIndex + 1;
  const last = plan.destinationIndex + plan.sectionIds.length;
  const position = first === last ? String(first) : `${String(first)} through ${String(last)}`;
  return `, position ${position} of ${String(total)}`;
}

function previewAnnouncement<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  plan: SectionMovePlan,
): string {
  return `Preview: ${moveSubject(document, plan.sectionIds)} will move to ${destinationDescription(document, plan)}${nestedPositionDescription(document, plan)}.`;
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
    return { collisionState, preview: null, reason };
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
      announcement: previewAnnouncement(document, decision.plan),
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
}: Readonly<{
  collision: WorkspaceSectionCollisionResolution;
  document: WorkspaceDocument<TSectionData>;
  frame: DragGeometryFrame;
  session: WorkspaceSectionMoveSession<TSectionData>;
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
  return Object.fromEntries(
    session.sectionIds.map((sectionId) => {
      const rect = session.sourceRects[sectionId] as WorkspaceRect;
      return [sectionId, { x: rect.x + snappedDelta.x, y: rect.y + snappedDelta.y }];
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
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  event: AdapterDndEvent;
  frame: DragGeometryFrame;
  gridOptions: ResolvedWorkspaceGridOptions;
  point: InteractionPoint;
  session: WorkspaceSectionMoveSession<TSectionData>;
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
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  event: AdapterDndEvent;
  geometry: WorkspaceGeometryMeasurements;
  gridOptions: ResolvedWorkspaceGridOptions;
  session: WorkspaceSectionMoveSession<TSectionData>;
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
  const activeRect = createInteractionRect(
    session.sourceClientBounds.x + event.transform.x,
    session.sourceClientBounds.y + event.transform.y,
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
    return resolveNestedPreview({ collision, document, frame, session });
  }
  if (session.mode === "sort") {
    return {
      collisionState: collision.collisionState,
      preview: null,
      reason: collision.reason,
    };
  }
  return resolveCanvasPreview({ document, event, frame, gridOptions, point, session });
}

export function matchingWorkspaceSectionMovePreview(
  displayed: WorkspaceSectionMovePreview | null,
  resolved: WorkspaceSectionMovePreviewResolution,
): WorkspaceSectionMovePreview | null {
  return displayed?.destinationKey === resolved.preview?.destinationKey ? resolved.preview : null;
}

export function workspaceSectionMoveCompletionAnnouncement<TSectionData>(
  session: WorkspaceSectionMoveSession<TSectionData>,
  preview: WorkspaceSectionMovePreview,
  result: WorkspaceActionResult,
): string {
  const subject = moveSubject(session.document, preview.plan.sectionIds);
  if (result.status === "applied") {
    return `${subject} moved to ${destinationDescription(session.document, preview.plan)}${nestedPositionDescription(session.document, preview.plan)}.`;
  }
  if (result.status === "unchanged") {
    return `${subject} stayed in place.`;
  }
  if ("reason" in result && result.reason === "section-locked") {
    return `${subject} did not move because one of the selected sections is locked.`;
  }
  return `${subject} did not move because the proposed destination was rejected.`;
}

export function workspaceSectionMovePendingAnnouncement(
  session: WorkspaceSectionMoveSession,
  preview: WorkspaceSectionMovePreview,
): string {
  return `Checking the move for ${moveSubject(session.document, preview.plan.sectionIds)}.`;
}

export function workspaceSectionMoveControlledRejectionAnnouncement(
  session: WorkspaceSectionMoveSession,
  preview: WorkspaceSectionMovePreview,
): string {
  return `${moveSubject(session.document, preview.plan.sectionIds)} did not move because the controlled host did not accept the change.`;
}

export function workspaceSectionMoveMismatchAnnouncement(
  session: WorkspaceSectionMoveSession,
  reason: string,
): string {
  return `${moveSubject(session.document, session.sectionIds)} did not move. ${reason || "The displayed destination changed before completion."}`;
}
