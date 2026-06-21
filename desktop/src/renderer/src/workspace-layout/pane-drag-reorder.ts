import type { WorkspaceLayoutStore } from "./layout-store";
import type { ColumnId, PaneDropIntent, PaneDropPlacement, WorkspaceScene } from "./types";

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
  const handle = event.target.closest<HTMLElement>('[data-workspace-pane-drag-handle="true"]');
  const paneId =
    handle?.dataset.paneId ??
    handle?.closest<HTMLElement>('[data-testid="workspace-pane-host"]')?.dataset.paneId;
  return handle && paneId ? { handle, paneId } : null;
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
  if (directHost) {
    return paneDropTargetOverHost(event, directHost, scene);
  }
  return paneDropTargetInGap(event, candidates, scene);
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
  const distLeft = fractionX;
  const distRight = 1 - fractionX;
  const distTop = fractionY;
  const distBottom = 1 - fractionY;
  const nearest = Math.min(distLeft, distRight, distTop, distBottom);
  if (nearest > paneSwapEdgeFraction) {
    return swapTarget(host.paneId);
  }
  if (nearest === distLeft) {
    return columnInsertTarget(targetColumn, "before", host.paneId);
  }
  if (nearest === distRight) {
    return columnInsertTarget(targetColumn, "after", host.paneId);
  }
  if (nearest === distTop) {
    return rowInsertTarget(host.paneId, "before");
  }
  return rowInsertAfterTarget(host.paneId, scene);
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

// Pointer is in a gap or empty space (not inside any pane). If it sits within a
// column's horizontal span it inserts a row in that column; otherwise it inserts
// a column at the nearest column edge -- which naturally covers the gaps between
// columns and the empty space left of the first / right of the last column.
function paneDropTargetInGap(
  event: PaneDropPointer,
  candidates: readonly PaneHostRect[],
  scene: WorkspaceScene,
): PaneDropTarget | null {
  const columns = visibleColumnRects(candidates, scene);
  if (columns.length === 0) {
    return null;
  }
  const columnUnderPointer = columns
    .filter((column) => event.clientX >= column.left && event.clientX <= column.right)
    .toSorted(
      (left, right) =>
        verticalDistanceToColumn(left, event.clientY) -
        verticalDistanceToColumn(right, event.clientY),
    )[0];
  if (columnUnderPointer) {
    return rowInsertTargetForColumn(columnUnderPointer, event.clientY);
  }
  return columnInsertTargetForGap(event, columns);
}

interface DragColumnRect {
  bottom: number;
  columnId: ColumnId;
  left: number;
  paneRects: PaneHostRect[];
  planeIndex: number;
  right: number;
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

// Within a column but in a vertical gap (or above/below the stack): insert a row
// at the nearest boundary between stacked panes, or before the first / after the
// last when the pointer is past the ends.
function rowInsertTargetForColumn(column: DragColumnRect, clientY: number): PaneDropTarget {
  const panes = column.paneRects;
  const first = panes[0];
  const last = panes[panes.length - 1];
  if (clientY <= first.top) {
    return rowInsertTarget(first.paneId, "before");
  }
  if (clientY >= last.bottom) {
    return rowInsertTarget(last.paneId, "after");
  }
  for (let index = 0; index < panes.length - 1; index += 1) {
    const upper = panes[index];
    const lower = panes[index + 1];
    if (clientY >= upper.bottom && clientY <= lower.top) {
      // Canonical between-panes form: before the lower pane (see
      // rowInsertAfterTarget), so the whole boundary resolves to one target.
      return rowInsertTarget(lower.paneId, "before");
    }
  }
  return rowInsertTarget(last.paneId, "after");
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
  const annotatePaneId =
    best.placement === "before" ? panes[0].paneId : panes[panes.length - 1].paneId;
  return columnInsertTarget(best.column, best.placement, annotatePaneId);
}

function zIndexForHost(host: HTMLElement): number {
  const zIndex = Number.parseInt(window.getComputedStyle(host).zIndex, 10);
  return Number.isFinite(zIndex) ? zIndex : 0;
}

function samePaneDropTarget(left: PaneDropTarget | null, right: PaneDropTarget | null): boolean {
  return (
    left?.paneId === right?.paneId &&
    left?.mode === right?.mode &&
    left?.placement === right?.placement &&
    left?.axis === right?.axis &&
    samePaneDropIntent(left?.intent ?? null, right?.intent ?? null)
  );
}

function samePaneDropIntent(left: PaneDropIntent | null, right: PaneDropIntent | null): boolean {
  if (left?.kind !== right?.kind) {
    return false;
  }
  if (!left || !right) {
    return left === right;
  }
  if (left.kind === "row" && right.kind === "row") {
    return left.targetPaneId === right.targetPaneId && left.placement === right.placement;
  }
  if (left.kind === "column" && right.kind === "column") {
    return (
      left.targetColumnId === right.targetColumnId &&
      left.planeIndex === right.planeIndex &&
      left.slotPlacement === right.slotPlacement
    );
  }
  if (left.kind === "swap" && right.kind === "swap") {
    return left.targetPaneId === right.targetPaneId;
  }
  return false;
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
  if (target.axis && target.placement) {
    host.dataset.dropAxis = target.axis;
    host.dataset.dropTarget = target.placement;
  }
}

function clearPaneDropTargets(root: HTMLElement): void {
  const hosts = root.querySelectorAll<HTMLElement>('[data-testid="workspace-pane-host"]');
  for (const host of hosts) {
    delete host.dataset.dropAxis;
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
