import type { WorkspaceActionResult, WorkspaceDocument, WorkspacePoint } from "../core.js";
import {
  clientPointToWorkspace,
  clientRectToWorkspace,
  workspaceRectToClient,
  type WorkspaceGeometryIndex,
  type WorkspaceRect,
} from "./geometry-index.js";
import type { InteractionPoint, ViewportTransform } from "./interaction-geometry.js";
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
import { workspaceSectionHierarchySnapshot } from "./workspace-section-move-command.js";

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
}>;

export type WorkspaceSectionMovePreviewResolution = Readonly<{
  preview: WorkspaceSectionMovePreview | null;
  reason: string;
}>;

export type WorkspaceSectionMoveSession<TSectionData = unknown> = Readonly<{
  activeSectionId: string;
  activatorClientPoint: InteractionPoint | null;
  document: WorkspaceDocument<TSectionData>;
  hierarchy: SectionHierarchySnapshot;
  mode: WorkspaceSectionMoveMode;
  preview: WorkspaceSectionMovePreview | null;
  sectionIds: readonly string[];
  sourceClientBounds: ScreenRect;
  sourceRects: Readonly<Record<string, WorkspaceRect>>;
  sortRegion: HTMLElement | null;
  sourceWorkspaceBounds: WorkspaceRect;
  startWorkspacePoint: WorkspacePoint | null;
}>;

export type WorkspaceSectionMoveSessionResult<TSectionData> =
  | Readonly<{ allowed: true; session: WorkspaceSectionMoveSession<TSectionData> }>
  | Readonly<{ allowed: false; reason: string }>;

type SourceGeometryResult =
  | Readonly<{
      allowed: true;
      canvas: HTMLElement;
      frame: DragGeometryFrame;
      rects: Readonly<Record<string, WorkspaceRect>>;
      workspaceBounds: WorkspaceRect;
    }>
  | Readonly<{ allowed: false; reason: string }>;

type SortRegionResult =
  | Readonly<{ allowed: true; region: HTMLElement | null }>
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

function sourceRects(
  geometryIndex: WorkspaceGeometryIndex,
  sectionIds: readonly string[],
): Readonly<Record<string, WorkspaceRect>> | null {
  const entries = sectionIds.map((sectionId) => {
    const rect = geometryIndex.get(sectionId)?.rect;
    return rect ? ([sectionId, rect] as const) : null;
  });
  return entries.some((entry) => entry === null)
    ? null
    : Object.fromEntries(entries as readonly (readonly [string, WorkspaceRect])[]);
}

function resolveSourceGeometry(
  geometry: WorkspaceGeometryMeasurements,
  geometryIndex: WorkspaceGeometryIndex,
  sectionIds: readonly string[],
): SourceGeometryResult {
  const rects = sourceRects(geometryIndex, sectionIds);
  const workspaceBounds = rects ? rectBounds(Object.values(rects)) : null;
  if (!rects || !workspaceBounds) {
    return { allowed: false, reason: "The selected section block is not completely measured." };
  }
  const canvas = geometry.canvasElement();
  if (!canvas) {
    return { allowed: false, reason: "The workspace canvas is unavailable." };
  }
  return {
    allowed: true,
    canvas,
    frame: {
      canvasBounds: geometry.canvasBounds(),
      viewport: geometry.currentViewport(),
    },
    rects,
    workspaceBounds,
  };
}

function resolveSortRegion(
  mode: WorkspaceSectionMoveMode,
  sourceParentId: string | null,
  canvas: HTMLElement,
): SortRegionResult {
  if (mode !== "sort") {
    return { allowed: true, region: null };
  }
  if (sourceParentId === null) {
    return {
      allowed: false,
      reason: "Top-level sections are spatial and cannot use sorting mode.",
    };
  }
  const region = childRegionForParent(canvas, sourceParentId);
  return region
    ? { allowed: true, region }
    : { allowed: false, reason: "The source container is unavailable." };
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
  const sort = resolveSortRegion(mode, selection.block.sourceParentId, source.canvas);
  if (!sort.allowed) {
    return sort;
  }
  return {
    allowed: true,
    session: {
      activeSectionId,
      activatorClientPoint,
      document,
      hierarchy,
      mode,
      preview: null,
      sectionIds: selection.block.sectionIds,
      sourceClientBounds: workspaceRectToClient(
        source.workspaceBounds,
        source.frame.canvasBounds,
        source.frame.viewport,
      ),
      sourceRects: source.rects,
      sortRegion: sort.region,
      sourceWorkspaceBounds: source.workspaceBounds,
      startWorkspacePoint: activatorClientPoint
        ? clientPointToWorkspace(
            activatorClientPoint,
            source.frame.canvasBounds,
            source.frame.viewport,
          )
        : null,
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

function childRegionForParent(canvas: HTMLElement, parentSectionId: string): HTMLElement | null {
  return (
    childRegions(canvas).find(
      (region) => region.getAttribute(WORKSPACE_SECTION_CHILD_REGION_ATTRIBUTE) === parentSectionId,
    ) ?? null
  );
}

function childRegionAtPoint(canvas: HTMLElement, point: InteractionPoint): HTMLElement | null {
  const ownerDocument = canvas.ownerDocument;
  const elements = ownerDocument.elementsFromPoint
    ? ownerDocument.elementsFromPoint(point.x, point.y)
    : [ownerDocument.elementFromPoint(point.x, point.y)].filter(
        (element): element is Element => element !== null,
      );
  for (const element of elements) {
    const region = element.closest<HTMLElement>(`[${WORKSPACE_SECTION_CHILD_REGION_ATTRIBUTE}]`);
    if (region && canvas.contains(region)) {
      return region;
    }
  }
  return null;
}

function resolvedChildRegion(
  canvas: HTMLElement,
  point: InteractionPoint,
  session: WorkspaceSectionMoveSession,
): HTMLElement | null {
  if (session.mode === "free") {
    return childRegionAtPoint(canvas, point);
  }
  const region = session.sortRegion;
  return region &&
    region.isConnected &&
    canvas.contains(region) &&
    pointInsideRect(point, screenRect(region.getBoundingClientRect()))
    ? region
    : null;
}

function screenRect(rect: DOMRect): ScreenRect {
  return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
}

type DragGeometryFrame = Readonly<{
  canvasBounds: ScreenRect;
  viewport: ViewportTransform;
}>;

function logicalDirection(region: HTMLElement): LogicalDirection {
  return region.ownerDocument.defaultView?.getComputedStyle(region).direction === "rtl"
    ? "rtl"
    : "ltr";
}

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
  document: WorkspaceDocument<TSectionData>,
  decision: SectionMoveDecision,
  indicator: WorkspaceSectionMoveIndicator,
): WorkspaceSectionMovePreviewResolution {
  if (decision.status !== "planned") {
    const reason =
      decision.status === "rejected"
        ? decision.reason
        : decision.status === "unchanged"
          ? "The section block is already at this location."
          : "Section movement was canceled.";
    return { preview: null, reason };
  }
  return {
    preview: {
      announcement: previewAnnouncement(document, decision.plan),
      destinationKey: serializeSectionMovePlan(decision.plan),
      indicator,
      plan: decision.plan,
    },
    reason: "",
  };
}

function resolveNestedPreview<TSectionData>({
  document,
  frame,
  geometryIndex,
  point,
  region,
  session,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  frame: DragGeometryFrame;
  geometryIndex: WorkspaceGeometryIndex;
  point: InteractionPoint;
  region: HTMLElement;
  session: WorkspaceSectionMoveSession<TSectionData>;
}>): WorkspaceSectionMovePreviewResolution {
  const parentId = region.getAttribute(WORKSPACE_SECTION_CHILD_REGION_ATTRIBUTE);
  const layout = parentId ? document.sections[parentId]?.childLayout : null;
  if (!parentId || !layout) {
    return { preview: null, reason: "The destination container is unavailable." };
  }
  const selected = new Set(session.sectionIds);
  const destinationIds = layout.sectionIds.filter((sectionId) => !selected.has(sectionId));
  const workspaceRects = destinationIds.map((sectionId) => geometryIndex.get(sectionId)?.rect);
  if (workspaceRects.some((rect) => !rect)) {
    return { preview: null, reason: "The destination order is not completely measured." };
  }
  const orderedWorkspaceRects = workspaceRects as readonly WorkspaceRect[];
  const orderedClientRects = orderedWorkspaceRects.map((rect) =>
    workspaceRectToClient(rect, frame.canvasBounds, frame.viewport),
  );
  const direction = logicalDirection(region);
  const destinationIndex = resolveWorkspaceSectionInsertionIndex({
    direction,
    orderedRects: orderedClientRects,
    orientation: layout.orientation,
    point,
  });
  const decision = planSectionMove({
    destination: { index: destinationIndex, parentId, topLevelPositions: null },
    hierarchy: session.hierarchy,
    mode: session.mode,
    selectedIds: session.sectionIds,
  });
  const indicator = workspaceSectionInsertionIndicator({
    direction,
    index: destinationIndex,
    orderedRects: orderedWorkspaceRects,
    orientation: layout.orientation,
    regionRect: clientRectToWorkspace(
      screenRect(region.getBoundingClientRect()),
      frame.canvasBounds,
      frame.viewport,
    ),
    zoom: frame.viewport.zoom,
  });
  return previewFromDecision(document, decision, indicator);
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
  if (session.mode === "sort") {
    return { preview: null, reason: "Sorting mode cannot move a section to the canvas." };
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
  return previewFromDecision(document, decision, indicator);
}

export function resolveWorkspaceSectionMovePreview<TSectionData>({
  document,
  event,
  geometry,
  geometryIndex,
  gridOptions,
  session,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  event: AdapterDndEvent;
  geometry: WorkspaceGeometryMeasurements;
  geometryIndex: WorkspaceGeometryIndex;
  gridOptions: ResolvedWorkspaceGridOptions;
  session: WorkspaceSectionMoveSession<TSectionData>;
}>): WorkspaceSectionMovePreviewResolution {
  const canvas = geometry.canvasElement();
  if (!canvas) {
    return { preview: null, reason: "The workspace canvas is unavailable." };
  }
  const point = currentClientPoint(event, session);
  const frame = {
    canvasBounds: geometry.canvasBounds(),
    viewport: geometry.currentViewport(),
  };
  if (!pointInsideRect(point, frame.canvasBounds)) {
    return {
      preview: null,
      reason: "The pointer is outside the workspace canvas.",
    };
  }
  const region = resolvedChildRegion(canvas, point, session);
  return region
    ? resolveNestedPreview({ document, frame, geometryIndex, point, region, session })
    : resolveCanvasPreview({ document, event, frame, gridOptions, point, session });
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
