import { columnSlotIndex } from "./column-slots";
import type { WorkspaceLayoutStore } from "./layout-store";
import { samePaneDropIntent } from "./pane-drop-intent-equality";
import type { ColumnId, PaneDropIntent, PaneDropPlacement, WorkspaceScene } from "./types";
import { eventTargetsPaneInteractiveControl } from "./workspace-interactions";

const paneDragThresholdPx = 6;
// The inner region of a pane -- this fraction in from every edge -- reads as a
// swap target; the four outer bands read as inserts. 0.25 => inner 50% x 50%
// swaps, surrounded by generous insert bands so "between" is easy to hit.
const paneSwapEdgeFraction = 0.25;

type PaneDropAxis = "horizontal" | "vertical";
type PaneDropMode = "insert" | "swap";

export interface PaneDropTarget {
  // Insert affordance only (horizontal = column, vertical = row). Undefined for swap.
  axis?: PaneDropAxis;
  // Empty-space targets use only the engine-positioned landing rectangle. Direct
  // pane-edge targets still highlight the reference pane edge.
  highlightPane?: boolean;
  intent: PaneDropIntent;
  mode: PaneDropMode;
  // The pane to annotate: the swap partner, or the insert reference pane.
  paneId: string;
  // Insert affordance only. Undefined for swap.
  placement?: PaneDropPlacement;
}

// A frozen snapshot of a visible pane host's committed geometry, captured once
// when a drag begins. Hit-testing against this snapshot (instead of the live
// host rect) keeps the resolved drop target a pure function of the pointer and
// the committed layout. Without it, applying a drop preview shifts the target
// host out from under the cursor, the next frame resolves a different (or no)
// target, and the layout oscillates between committed and previewed every frame.
export interface PaneHostRect {
  bottom: number;
  left: number;
  paneId: string;
  right: number;
  top: number;
  width: number;
  zIndex: number;
}

export interface PaneDragSession {
  dragging: boolean;
  handle: HTMLElement;
  // Committed host geometry captured at drag start; see PaneHostRect. Optional so
  // unit tests can drive the session without a real DOM (they fall back to a live
  // host query).
  hostRects?: readonly PaneHostRect[];
  pendingDropFrame: number | null;
  pendingDropPointer: PaneDropPointer | null;
  pointerId: number;
  sourcePaneId: string;
  startClientX: number;
  startClientY: number;
  target: PaneDropTarget | null;
}

export interface PaneDragFinish {
  dragging: boolean;
  shouldCommitDrop: boolean;
  sourcePaneId: string;
  target: PaneDropTarget | null;
}

interface PaneDragOffsetSession {
  sourcePaneId: string;
  startClientX: number;
  startClientY: number;
}

interface PaneDropPointer {
  clientX: number;
  clientY: number;
}

interface PaneDragPreviewMetrics {
  recordPaneDragPreviewClear(): void;
  recordPaneDragPreviewUpdate(): void;
}

export function beginPaneDragSession(
  event: PointerEvent,
  root: HTMLElement,
): PaneDragSession | null {
  const target = paneDragTargetFromPointer(event);
  if (!target) {
    return null;
  }
  target.handle.setPointerCapture?.(event.pointerId);
  root.dataset.paneDragging = "false";
  visiblePaneHostForPane(target.paneId)?.setAttribute("data-drag-source", "true");
  return {
    dragging: false,
    handle: target.handle,
    // Snapshot committed geometry now, before any preview shifts the hosts.
    hostRects: collectVisiblePaneHostRects(),
    pendingDropFrame: null,
    pendingDropPointer: null,
    pointerId: event.pointerId,
    sourcePaneId: target.paneId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    target: null,
  };
}

export function updatePaneDragSession(
  event: PointerEvent,
  root: HTMLElement,
  session: PaneDragSession,
  store: WorkspaceLayoutStore,
  metrics?: PaneDragPreviewMetrics,
): void {
  const distance = Math.hypot(
    event.clientX - session.startClientX,
    event.clientY - session.startClientY,
  );
  if (distance > paneDragThresholdPx) {
    session.dragging = true;
    root.dataset.paneDragging = "true";
  }
  if (!session.dragging) {
    return;
  }
  syncPaneDragSourceOffset(session, event);
  schedulePaneDropTargetUpdate(root, session, event, store, metrics);
}

export function finishPaneDragSession(
  event: PointerEvent,
  root: HTMLElement,
  session: PaneDragSession,
  store?: WorkspaceLayoutStore,
  metrics?: PaneDragPreviewMetrics,
): PaneDragFinish {
  if (store) {
    flushPaneDropTarget(root, session, store, metrics);
  }
  const finish = {
    dragging: session.dragging,
    shouldCommitDrop: event.type === "pointerup",
    sourcePaneId: session.sourcePaneId,
    target: session.target,
  };
  cleanupPaneDragSession(root, session);
  return finish;
}

export function cleanupPaneDragSession(root: HTMLElement, session: PaneDragSession): void {
  delete root.dataset.paneDragging;
  clearPaneDropTargets(root);
  cancelPaneDropTargetUpdate(session);
  const sourceHost = visiblePaneHostForPane(session.sourcePaneId);
  sourceHost?.removeAttribute("data-drag-source");
  if (sourceHost) {
    sourceHost.style.translate = "";
  }
  if (session.handle.hasPointerCapture?.(session.pointerId)) {
    session.handle.releasePointerCapture(session.pointerId);
  }
}

function schedulePaneDropTargetUpdate(
  root: HTMLElement,
  session: PaneDragSession,
  event: PointerEvent,
  store: WorkspaceLayoutStore,
  metrics: PaneDragPreviewMetrics | undefined,
): void {
  session.pendingDropPointer = { clientX: event.clientX, clientY: event.clientY };
  if (session.pendingDropFrame !== null) {
    return;
  }
  session.pendingDropFrame = requestPaneDropAnimationFrame(() => {
    session.pendingDropFrame = null;
    flushPaneDropTarget(root, session, store, metrics);
  });
}

function flushPaneDropTarget(
  root: HTMLElement,
  session: PaneDragSession,
  store: WorkspaceLayoutStore,
  metrics?: PaneDragPreviewMetrics,
): void {
  const pointer = session.pendingDropPointer;
  if (!pointer) {
    return;
  }
  session.pendingDropPointer = null;
  updatePaneDropTarget(root, session, pointer, store, metrics);
}

function cancelPaneDropTargetUpdate(session: PaneDragSession): void {
  if (session.pendingDropFrame === null) {
    return;
  }
  cancelPaneDropAnimationFrame(session.pendingDropFrame);
  session.pendingDropFrame = null;
  session.pendingDropPointer = null;
}

export function applyPaneDrop(
  store: WorkspaceLayoutStore,
  sourcePaneId: string,
  target: PaneDropTarget,
): boolean {
  return store.applyPaneDropIntent(sourcePaneId, target.intent);
}

export function syncPaneDragSourceOffset(
  session: PaneDragOffsetSession,
  event: PointerEvent,
): void {
  const sourceHost = visiblePaneHostForPane(session.sourcePaneId);
  if (!sourceHost) {
    return;
  }
  sourceHost.style.translate = `${(event.clientX - session.startClientX).toFixed(2)}px ${(
    event.clientY - session.startClientY
  ).toFixed(2)}px`;
}

export function visiblePaneHostForPane(paneId: string): HTMLElement | null {
  const hosts = document.querySelectorAll<HTMLElement>(
    '[data-testid="workspace-pane-host"][data-visible="true"]',
  );
  return [...hosts].find((host) => host.dataset.paneId === paneId) ?? null;
}

function paneDragTargetFromPointer(event: PointerEvent): {
  handle: HTMLElement;
  paneId: string;
} | null {
  if (!(event.target instanceof Element)) {
    return null;
  }
  if (eventTargetsPaneDragExclusion(event, event.target)) {
    return null;
  }
  const handle = event.target.closest<HTMLElement>('[data-workspace-pane-drag-handle="true"]');
  const paneId =
    handle?.dataset.paneId ??
    handle?.closest<HTMLElement>('[data-testid="workspace-pane-host"]')?.dataset.paneId;
  return handle && paneId ? { handle, paneId } : null;
}

function eventTargetsPaneDragExclusion(event: PointerEvent, target: Element): boolean {
  return (
    Boolean(target.closest("[data-workspace-pane-action]")) ||
    eventTargetsPaneInteractiveControl(event)
  );
}

function updatePaneDropTarget(
  root: HTMLElement,
  session: PaneDragSession,
  event: PaneDropPointer,
  store: WorkspaceLayoutStore,
  metrics?: PaneDragPreviewMetrics,
): void {
  const target = paneDropTargetFromPointer(event, session.sourcePaneId, store, session.hostRects);
  if (samePaneDropTarget(target, session.target)) {
    return;
  }
  session.target = target;
  syncPaneDropTarget(root, target);
  if (target) {
    if (store.previewPaneDropIntent(session.sourcePaneId, target.intent)) {
      metrics?.recordPaneDragPreviewUpdate();
    }
    return;
  }
  if (store.clearPaneDropPreview()) {
    metrics?.recordPaneDragPreviewClear();
  }
}

export function paneDropTargetFromPointer(
  event: PaneDropPointer,
  sourcePaneId: string,
  store: WorkspaceLayoutStore,
  hostRects: readonly PaneHostRect[] = collectVisiblePaneHostRects(),
): PaneDropTarget | null {
  const scene = store.toScene();
  const candidates = hostRects.filter((rect) => rect.paneId !== sourcePaneId);
  if (candidates.length === 0) {
    return null;
  }
  const directHost = candidates
    .filter((rect) => rectContainsPoint(rect, event.clientX, event.clientY))
    .toSorted((left, right) => right.zIndex - left.zIndex)[0];
  const target = directHost
    ? paneDropTargetOverHost(event, directHost, scene)
    : paneDropTargetInGap(event, candidates, scene, hostRects);
  return target;
}

// Pointer is inside a pane: the inner region swaps with it; the four outer edge
// bands insert a column (left/right) or row (top/bottom) beside it.
function paneDropTargetOverHost(
  event: PaneDropPointer,
  host: PaneHostRect,
  scene: WorkspaceScene,
): PaneDropTarget | null {
  const targetPane = scene.paneById.get(host.paneId);
  const targetColumn = scene.columns.find((column) => column.columnId === targetPane?.columnId);
  if (!targetPane || !targetColumn) {
    return null;
  }
  const fractionX = (event.clientX - host.left) / Math.max(host.right - host.left, 1);
  const fractionY = (event.clientY - host.top) / Math.max(host.bottom - host.top, 1);
  // Fixed bands, independent of the pane's aspect ratio: the left/right
  // quarter-width strips are column inserts at *any* height, so dropping beside a
  // tall card is as easy as beside a short one (a nearest-edge split would shrink
  // those strips to thin slivers on tall panes). The central column's top/bottom
  // quarter-height bands are row inserts; the centre swaps.
  if (fractionX <= paneSwapEdgeFraction) {
    return columnInsertTarget(targetColumn, "before", host.paneId);
  }
  if (fractionX >= 1 - paneSwapEdgeFraction) {
    return columnInsertTarget(targetColumn, "after", host.paneId);
  }
  if (fractionY <= paneSwapEdgeFraction) {
    return rowInsertTarget(host.paneId, "before");
  }
  if (fractionY >= 1 - paneSwapEdgeFraction) {
    return rowInsertAfterTarget(host.paneId, scene);
  }
  return swapTarget(host.paneId);
}

// "Insert after X" and "insert before the pane below X" describe the same
// boundary. Canonicalize to "before the lower pane" so both edge bands and the
// gap between two stacked panes resolve to one target (no flicker when the
// pointer wobbles across the boundary). Only the last pane in a column keeps the
// literal "after" form, which is the extend-down slot.
function rowInsertAfterTarget(paneId: string, scene: WorkspaceScene): PaneDropTarget {
  const next = nextPaneInColumn(scene, paneId);
  return next ? rowInsertTarget(next, "before") : rowInsertTarget(paneId, "after");
}

function nextPaneInColumn(scene: WorkspaceScene, paneId: string): string | undefined {
  const pane = scene.paneById.get(paneId);
  const column = scene.columns.find((candidate) => candidate.columnId === pane?.columnId);
  if (!column) {
    return undefined;
  }
  const index = column.paneIds.indexOf(paneId);
  return index >= 0 ? column.paneIds[index + 1] : undefined;
}

function swapTarget(targetPaneId: string): PaneDropTarget {
  return {
    intent: { kind: "swap", targetPaneId },
    mode: "swap",
    paneId: targetPaneId,
  };
}

function previewOnlyTarget(target: PaneDropTarget): PaneDropTarget {
  return target.mode === "insert" ? { ...target, highlightPane: false } : target;
}

function columnInsertTarget(
  column: { columnId: ColumnId; planeIndex: number },
  slotPlacement: PaneDropPlacement,
  annotatePaneId: string,
): PaneDropTarget {
  return {
    axis: "horizontal",
    intent: {
      kind: "column",
      planeIndex: column.planeIndex,
      slotPlacement,
      targetColumnId: column.columnId,
    },
    mode: "insert",
    paneId: annotatePaneId,
    placement: slotPlacement,
  };
}

function rowInsertTarget(targetPaneId: string, placement: PaneDropPlacement): PaneDropTarget {
  return {
    axis: "vertical",
    intent: { kind: "row", placement, targetPaneId },
    mode: "insert",
    paneId: targetPaneId,
    placement,
  };
}

// Captures committed geometry for every visible pane host. Used once at drag
// start to freeze the hit-test surface; also the live fallback when a session
// carries no snapshot (unit tests drive resolution without a real DOM).
export function collectVisiblePaneHostRects(): PaneHostRect[] {
  const hosts = document.querySelectorAll<HTMLElement>(
    '[data-testid="workspace-pane-host"][data-visible="true"]',
  );
  const rects: PaneHostRect[] = [];
  for (const host of hosts) {
    const paneId = host.dataset.paneId;
    if (!paneId) {
      continue;
    }
    const rect = host.getBoundingClientRect();
    rects.push({
      bottom: rect.bottom,
      left: rect.left,
      paneId,
      right: rect.right,
      top: rect.top,
      width: rect.width,
      zIndex: zIndexForHost(host),
    });
  }
  return rects;
}

function rectContainsPoint(rect: PaneHostRect, clientX: number, clientY: number): boolean {
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  );
}

// Pointer is in a gap or empty space (not inside any pane). A true inter-row gap
// (between two stacked panes of a column the pointer overlaps horizontally)
// reorders within that column. Empty aligned slots in existing planes, plus one
// row-height band above/below the workspace, become plane-slot drops so vertical
// moves do not collapse into sideways column inserts. Remaining gutters and
// margins are column territory.
function paneDropTargetInGap(
  event: PaneDropPointer,
  candidates: readonly PaneHostRect[],
  scene: WorkspaceScene,
  allHostRects: readonly PaneHostRect[],
): PaneDropTarget | null {
  const columns = visibleColumnRects(candidates, scene);
  if (columns.length === 0) {
    return null;
  }
  const allColumns = visibleColumnRects(allHostRects, scene);
  const columnUnderPointer = columns
    .filter((column) => event.clientX >= column.left && event.clientX <= column.right)
    .toSorted(
      (left, right) =>
        verticalDistanceToColumn(left, event.clientY) -
        verticalDistanceToColumn(right, event.clientY),
    )[0];
  const interRowTarget = columnUnderPointer
    ? interRowInsertTarget(columnUnderPointer, event.clientY)
    : null;
  const target =
    interRowTarget ??
    planeSlotInsertTargetForGap(event, allColumns) ??
    outerPlaneSlotInsertTargetForGap(event, allColumns, scene.rowGap) ??
    columnInsertTargetForGap(event, columns);
  return target ? previewOnlyTarget(target) : null;
}

interface DragColumnRect {
  bottom: number;
  columnId: ColumnId;
  left: number;
  paneRects: PaneHostRect[];
  planeIndex: number;
  right: number;
  slotIndex: number;
  top: number;
}

// Group the visible host rects into their columns (via the scene) and union each
// column's geometry, so gap/empty hit-testing can reason about whole columns.
function visibleColumnRects(
  candidates: readonly PaneHostRect[],
  scene: WorkspaceScene,
): DragColumnRect[] {
  const byColumn = new Map<ColumnId, PaneHostRect[]>();
  for (const rect of candidates) {
    const pane = scene.paneById.get(rect.paneId);
    if (!pane) {
      continue;
    }
    const existing = byColumn.get(pane.columnId);
    if (existing) {
      existing.push(rect);
    } else {
      byColumn.set(pane.columnId, [rect]);
    }
  }
  const result: DragColumnRect[] = [];
  for (const [columnId, rects] of byColumn) {
    const column = scene.columns.find((candidate) => candidate.columnId === columnId);
    if (!column) {
      continue;
    }
    const sorted = rects.toSorted((left, right) => left.top - right.top);
    result.push({
      bottom: Math.max(...sorted.map((rect) => rect.bottom)),
      columnId,
      left: Math.min(...sorted.map((rect) => rect.left)),
      paneRects: sorted,
      planeIndex: column.planeIndex,
      right: Math.max(...sorted.map((rect) => rect.right)),
      slotIndex: columnSlotIndex(column),
      top: Math.min(...sorted.map((rect) => rect.top)),
    });
  }
  return result;
}

function verticalDistanceToColumn(column: DragColumnRect, clientY: number): number {
  if (clientY < column.top) {
    return column.top - clientY;
  }
  if (clientY > column.bottom) {
    return clientY - column.bottom;
  }
  return 0;
}

// A row insert only when the pointer sits in a *true* inter-row gap between two
// stacked panes of the column; null otherwise (above the first / below the last
// pane is column territory, handled by the caller). Canonicalized to "before the
// lower pane" so the whole boundary resolves to one target (no wobble flicker).
function interRowInsertTarget(column: DragColumnRect, clientY: number): PaneDropTarget | null {
  const panes = column.paneRects;
  for (let index = 0; index < panes.length - 1; index += 1) {
    const upper = panes[index];
    const lower = panes[index + 1];
    if (upper && lower && clientY >= upper.bottom && clientY <= lower.top) {
      return rowInsertTarget(lower.paneId, "before");
    }
  }
  return null;
}

function planeSlotInsertTargetForGap(
  event: PaneDropPointer,
  columns: readonly DragColumnRect[],
): PaneDropTarget | null {
  const targetPlane = planeBandContainingY(columns, event.clientY);
  if (!targetPlane) {
    return null;
  }
  const occupiedSlots = new Set(
    columns
      .filter((column) => column.planeIndex === targetPlane.planeIndex)
      .map((column) => column.slotIndex),
  );
  const referenceColumn = columns
    .filter(
      (column) =>
        column.planeIndex !== targetPlane.planeIndex &&
        !occupiedSlots.has(column.slotIndex) &&
        event.clientX >= column.left &&
        event.clientX <= column.right,
    )
    .toSorted(
      (left, right) =>
        verticalDistanceToColumn(left, event.clientY) -
          verticalDistanceToColumn(right, event.clientY) ||
        horizontalDistanceToColumnCenter(left, event.clientX) -
          horizontalDistanceToColumnCenter(right, event.clientX),
    )[0];
  if (!referenceColumn) {
    return null;
  }
  const annotatePane = paneRectNearestY(referenceColumn.paneRects, event.clientY);
  if (!annotatePane) {
    return null;
  }
  const placement = referenceColumn.planeIndex > targetPlane.planeIndex ? "before" : "after";
  return planeSlotTarget(targetPlane.planeIndex, referenceColumn, annotatePane.paneId, placement);
}

function outerPlaneSlotInsertTargetForGap(
  event: PaneDropPointer,
  columns: readonly DragColumnRect[],
  rowGap: number,
): PaneDropTarget | null {
  const bands = planeBandsForColumns(columns);
  const boundary = outerPlaneBoundary(bands, event.clientY);
  if (!boundary) {
    return null;
  }
  const referenceColumn = referenceColumnForOuterPlaneSlot(event, columns);
  if (!referenceColumn) {
    return null;
  }
  if (!outerPlaneBoundaryWithinReach(event.clientY, boundary, bands, referenceColumn, rowGap)) {
    return null;
  }
  const annotatePane = paneRectNearestY(referenceColumn.paneRects, event.clientY);
  if (!annotatePane) {
    return null;
  }
  const targetPlaneIndex = outerPlaneIndex(bands, boundary.direction);
  const placement = boundary.direction === "above" ? "before" : "after";
  return planeSlotTarget(targetPlaneIndex, referenceColumn, annotatePane.paneId, placement);
}

function outerPlaneBoundary(
  bands: readonly DragPlaneBand[],
  clientY: number,
): { direction: "above" | "below"; y: number } | null {
  const topBand = bands[0];
  const bottomBand = bands.at(-1);
  if (!topBand || !bottomBand || (clientY >= topBand.top && clientY <= bottomBand.bottom)) {
    return null;
  }
  return clientY < topBand.top
    ? { direction: "above", y: topBand.top }
    : { direction: "below", y: bottomBand.bottom };
}

function referenceColumnForOuterPlaneSlot(
  event: PaneDropPointer,
  columns: readonly DragColumnRect[],
): DragColumnRect | undefined {
  return columns
    .filter((column) => event.clientX >= column.left && event.clientX <= column.right)
    .toSorted(
      (left, right) =>
        verticalDistanceToColumn(left, event.clientY) -
          verticalDistanceToColumn(right, event.clientY) ||
        horizontalDistanceToColumnCenter(left, event.clientX) -
          horizontalDistanceToColumnCenter(right, event.clientX),
    )[0];
}

function outerPlaneBoundaryWithinReach(
  clientY: number,
  boundary: { direction: "above" | "below"; y: number },
  bands: readonly DragPlaneBand[],
  referenceColumn: DragColumnRect,
  rowGap: number,
): boolean {
  const referenceBand = bands.find((band) => band.planeIndex === referenceColumn.planeIndex);
  if (!referenceBand) {
    return false;
  }
  const rowReach = Math.max(1, referenceBand.bottom - referenceBand.top) + Math.max(0, rowGap);
  return Math.abs(clientY - boundary.y) <= rowReach;
}

function outerPlaneIndex(bands: readonly DragPlaneBand[], direction: "above" | "below"): number {
  const planeIndexes = bands.map((band) => band.planeIndex);
  return direction === "above" ? Math.min(...planeIndexes) - 1 : Math.max(...planeIndexes) + 1;
}

function planeSlotTarget(
  planeIndex: number,
  referenceColumn: DragColumnRect,
  annotatePaneId: string,
  placement: PaneDropPlacement,
): PaneDropTarget {
  return {
    axis: "vertical",
    intent: {
      kind: "plane-slot",
      planeIndex,
      referenceColumnId: referenceColumn.columnId,
      slotIndex: referenceColumn.slotIndex,
    },
    mode: "insert",
    paneId: annotatePaneId,
    placement,
  };
}

interface DragPlaneBand {
  bottom: number;
  planeIndex: number;
  top: number;
}

function planeBandContainingY(
  columns: readonly DragColumnRect[],
  clientY: number,
): DragPlaneBand | null {
  return (
    planeBandsForColumns(columns)
      .filter((band) => clientY >= band.top && clientY <= band.bottom)
      .toSorted((left, right) => left.bottom - left.top - (right.bottom - right.top))[0] ?? null
  );
}

function planeBandsForColumns(columns: readonly DragColumnRect[]): DragPlaneBand[] {
  const bands = new Map<number, DragPlaneBand>();
  for (const column of columns) {
    const band = bands.get(column.planeIndex);
    if (band) {
      band.top = Math.min(band.top, column.top);
      band.bottom = Math.max(band.bottom, column.bottom);
    } else {
      bands.set(column.planeIndex, {
        bottom: column.bottom,
        planeIndex: column.planeIndex,
        top: column.top,
      });
    }
  }
  return [...bands.values()].toSorted(
    (left, right) => left.top - right.top || left.planeIndex - right.planeIndex,
  );
}

function horizontalDistanceToColumnCenter(column: DragColumnRect, clientX: number): number {
  return Math.abs(clientX - (column.left + column.right) / 2);
}

function paneRectNearestY(
  panes: readonly PaneHostRect[],
  clientY: number,
): PaneHostRect | undefined {
  return panes.toSorted((left, right) => {
    const leftDistance = verticalDistanceToRect(left, clientY);
    const rightDistance = verticalDistanceToRect(right, clientY);
    return leftDistance - rightDistance;
  })[0];
}

function verticalDistanceToRect(rect: PaneHostRect, clientY: number): number {
  if (clientY < rect.top) {
    return rect.top - clientY;
  }
  if (clientY > rect.bottom) {
    return clientY - rect.bottom;
  }
  return 0;
}

// Pointer is in a horizontal gap between columns, or past the first/last column.
// Insert a column at the nearest column edge; "past the leftmost" therefore reads
// as "new column before the first" (extend left) and vice versa.
function columnInsertTargetForGap(
  event: PaneDropPointer,
  columns: DragColumnRect[],
): PaneDropTarget | null {
  const inBand = columns.filter(
    (column) => event.clientY >= column.top && event.clientY <= column.bottom,
  );
  const pool = inBand.length > 0 ? inBand : columns;
  let best: { column: DragColumnRect; distance: number; placement: PaneDropPlacement } | null =
    null;
  for (const column of pool) {
    const beforeDistance = Math.abs(event.clientX - column.left);
    const afterDistance = Math.abs(event.clientX - column.right);
    const candidate =
      beforeDistance <= afterDistance
        ? { column, distance: beforeDistance, placement: "before" as const }
        : { column, distance: afterDistance, placement: "after" as const };
    if (!best || candidate.distance < best.distance) {
      best = candidate;
    }
  }
  if (!best) {
    return null;
  }
  const panes = best.column.paneRects;
  const annotatePane = best.placement === "before" ? panes[0] : panes[panes.length - 1];
  if (!annotatePane) {
    return null;
  }
  return columnInsertTarget(best.column, best.placement, annotatePane.paneId);
}

function zIndexForHost(host: HTMLElement): number {
  const zIndex = Number.parseInt(window.getComputedStyle(host).zIndex, 10);
  return Number.isFinite(zIndex) ? zIndex : 0;
}

function samePaneDropTarget(left: PaneDropTarget | null, right: PaneDropTarget | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  const targetFields = ["paneId", "mode", "placement", "axis", "highlightPane"] as const;
  return (
    targetFields.every((field) => left[field] === right[field]) &&
    samePaneDropIntent(left.intent, right.intent)
  );
}

export function syncPaneDropTarget(root: HTMLElement, target: PaneDropTarget | null): void {
  clearPaneDropTargets(root);
  if (!target) {
    return;
  }
  const host = visiblePaneHostForPane(target.paneId);
  if (!host) {
    return;
  }
  if (target.mode === "swap") {
    host.dataset.dropSwap = "true";
    return;
  }
  if (target.highlightPane === false) {
    host.dataset.dropPreview = "true";
    return;
  }
  if (target.axis && target.placement) {
    host.dataset.dropAxis = target.axis;
    host.dataset.dropTarget = target.placement;
  }
}

function clearPaneDropTargets(root: HTMLElement): void {
  const hosts = root.querySelectorAll<HTMLElement>('[data-testid="workspace-pane-host"]');
  for (const host of hosts) {
    delete host.dataset.dropAxis;
    delete host.dataset.dropPreview;
    delete host.dataset.dropTarget;
    delete host.dataset.dropSwap;
  }
}

function requestPaneDropAnimationFrame(callback: FrameRequestCallback): number {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  callback(0);
  return 0;
}

function cancelPaneDropAnimationFrame(frameId: number): void {
  if (frameId === 0 || typeof window.cancelAnimationFrame !== "function") {
    return;
  }
  window.cancelAnimationFrame(frameId);
}
