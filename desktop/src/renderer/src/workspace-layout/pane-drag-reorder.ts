import type { WorkspaceLayoutStore } from "./layout-store";
import type { PaneDropIntent, PaneDropPlacement } from "./types";

const paneDragThresholdPx = 6;
const paneColumnDropEdgeRatio = 0.24;
const paneColumnDropEdgeMinPx = 32;
const paneColumnDropEdgeMaxPx = 96;
const paneColumnDropGutterPx = 48;

type PaneDropAxis = "horizontal" | "vertical";

export interface PaneDropTarget {
  axis: PaneDropAxis;
  intent: PaneDropIntent;
  paneId: string;
  placement: PaneDropPlacement;
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
  const host = visiblePaneHostRectAtPoint(event.clientX, event.clientY, sourcePaneId, hostRects);
  if (!host) {
    return null;
  }
  const targetPaneId = host.paneId;
  const scene = store.toScene();
  const targetPane = scene.paneById.get(targetPaneId);
  const targetColumn = scene.columns.find((column) => column.columnId === targetPane?.columnId);
  if (!targetPane || !targetColumn) {
    return null;
  }
  const columnPlacement = paneColumnDropPlacement(event, host);
  if (columnPlacement) {
    return {
      axis: "horizontal",
      intent: {
        kind: "column",
        planeIndex: targetColumn.planeIndex,
        slotPlacement: columnPlacement,
        targetColumnId: targetColumn.columnId,
      },
      paneId: targetPaneId,
      placement: columnPlacement,
    };
  }
  const rowPlacement = paneRowDropPlacement(event, host);
  return {
    axis: "vertical",
    intent: {
      kind: "row",
      placement: rowPlacement,
      targetPaneId,
    },
    paneId: targetPaneId,
    placement: rowPlacement,
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

function paneColumnDropPlacement(
  event: PaneDropPointer,
  rect: PaneHostRect,
): PaneDropPlacement | null {
  const edgeBand = Math.min(
    rect.width / 2,
    Math.max(
      paneColumnDropEdgeMinPx,
      Math.min(paneColumnDropEdgeMaxPx, rect.width * paneColumnDropEdgeRatio),
    ),
  );
  if (event.clientX <= rect.left + edgeBand) {
    return "before";
  }
  if (event.clientX >= rect.right - edgeBand) {
    return "after";
  }
  return null;
}

function paneRowDropPlacement(event: PaneDropPointer, rect: PaneHostRect): PaneDropPlacement {
  return event.clientY < (rect.top + rect.bottom) / 2 ? "before" : "after";
}

function visiblePaneHostRectAtPoint(
  clientX: number,
  clientY: number,
  sourcePaneId: string,
  hostRects: readonly PaneHostRect[],
): PaneHostRect | null {
  const candidates = hostRects.filter((rect) => rect.paneId !== sourcePaneId);
  const directHost = candidates
    .filter((rect) => rectContainsPoint(rect, clientX, clientY))
    .toSorted((left, right) => right.zIndex - left.zIndex)[0];
  if (directHost) {
    return directHost;
  }
  return (
    candidates
      .filter((rect) => rectAcceptsGutterPoint(rect, clientX, clientY))
      .toSorted(
        (left, right) =>
          horizontalDistanceToRect(left, clientX) - horizontalDistanceToRect(right, clientX) ||
          right.zIndex - left.zIndex,
      )[0] ?? null
  );
}

function rectContainsPoint(rect: PaneHostRect, clientX: number, clientY: number): boolean {
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  );
}

function rectAcceptsGutterPoint(rect: PaneHostRect, clientX: number, clientY: number): boolean {
  return (
    clientY >= rect.top &&
    clientY <= rect.bottom &&
    clientX >= rect.left - paneColumnDropGutterPx &&
    clientX <= rect.right + paneColumnDropGutterPx
  );
}

function horizontalDistanceToRect(rect: PaneHostRect, clientX: number): number {
  if (clientX < rect.left) {
    return rect.left - clientX;
  }
  if (clientX > rect.right) {
    return clientX - rect.right;
  }
  return 0;
}

function zIndexForHost(host: HTMLElement): number {
  const zIndex = Number.parseInt(window.getComputedStyle(host).zIndex, 10);
  return Number.isFinite(zIndex) ? zIndex : 0;
}

function samePaneDropTarget(left: PaneDropTarget | null, right: PaneDropTarget | null): boolean {
  return (
    left?.paneId === right?.paneId &&
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
  return false;
}

function syncPaneDropTarget(root: HTMLElement, target: PaneDropTarget | null): void {
  clearPaneDropTargets(root);
  if (!target) {
    return;
  }
  const host = visiblePaneHostForPane(target.paneId);
  if (!host) {
    return;
  }
  host.dataset.dropAxis = target.axis;
  host.dataset.dropTarget = target.placement;
}

function clearPaneDropTargets(root: HTMLElement): void {
  const hosts = root.querySelectorAll<HTMLElement>('[data-testid="workspace-pane-host"]');
  for (const host of hosts) {
    delete host.dataset.dropAxis;
    delete host.dataset.dropTarget;
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
