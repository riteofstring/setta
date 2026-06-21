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

export interface PaneDragSession {
  dragging: boolean;
  handle: HTMLElement;
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
  schedulePaneDropTargetUpdate(root, session, event, store);
}

export function finishPaneDragSession(
  event: PointerEvent,
  root: HTMLElement,
  session: PaneDragSession,
  store?: WorkspaceLayoutStore,
): PaneDragFinish {
  if (store) {
    flushPaneDropTarget(root, session, store);
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
): void {
  session.pendingDropPointer = { clientX: event.clientX, clientY: event.clientY };
  if (session.pendingDropFrame !== null) {
    return;
  }
  session.pendingDropFrame = requestPaneDropAnimationFrame(() => {
    session.pendingDropFrame = null;
    flushPaneDropTarget(root, session, store);
  });
}

function flushPaneDropTarget(
  root: HTMLElement,
  session: PaneDragSession,
  store: WorkspaceLayoutStore,
): void {
  const pointer = session.pendingDropPointer;
  if (!pointer) {
    return;
  }
  session.pendingDropPointer = null;
  updatePaneDropTarget(root, session, pointer, store);
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
): void {
  const target = paneDropTargetFromPointer(event, session.sourcePaneId, store);
  if (samePaneDropTarget(target, session.target)) {
    return;
  }
  session.target = target;
  syncPaneDropTarget(root, target);
  if (target) {
    store.previewPaneDropIntent(session.sourcePaneId, target.intent);
    return;
  }
  store.clearPaneDropPreview();
}

export function paneDropTargetFromPointer(
  event: PaneDropPointer,
  sourcePaneId: string,
  store: WorkspaceLayoutStore,
): PaneDropTarget | null {
  const host = visiblePaneHostAtPoint(event.clientX, event.clientY, sourcePaneId);
  const targetPaneId = host?.dataset.paneId;
  if (!host || !targetPaneId) {
    return null;
  }
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

function paneColumnDropPlacement(
  event: PaneDropPointer,
  host: HTMLElement,
): PaneDropPlacement | null {
  const rect = host.getBoundingClientRect();
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

function paneRowDropPlacement(event: PaneDropPointer, host: HTMLElement): PaneDropPlacement {
  const rect = host.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function visiblePaneHostAtPoint(
  clientX: number,
  clientY: number,
  sourcePaneId: string,
): HTMLElement | null {
  const hosts = document.querySelectorAll<HTMLElement>(
    '[data-testid="workspace-pane-host"][data-visible="true"]',
  );
  const candidates = [...hosts].filter((host) => host.dataset.paneId !== sourcePaneId);
  const directHost = candidates
    .filter((host) => rectContainsPoint(host, clientX, clientY))
    .toSorted((left, right) => zIndexForHost(right) - zIndexForHost(left))[0];
  if (directHost) {
    return directHost;
  }
  return (
    candidates
      .filter((host) => rectAcceptsGutterPoint(host, clientX, clientY))
      .toSorted(
        (left, right) =>
          horizontalDistanceToRect(left, clientX) - horizontalDistanceToRect(right, clientX) ||
          zIndexForHost(right) - zIndexForHost(left),
      )[0] ?? null
  );
}

function rectContainsPoint(host: HTMLElement, clientX: number, clientY: number): boolean {
  const rect = host.getBoundingClientRect();
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  );
}

function rectAcceptsGutterPoint(host: HTMLElement, clientX: number, clientY: number): boolean {
  const rect = host.getBoundingClientRect();
  return (
    clientY >= rect.top &&
    clientY <= rect.bottom &&
    clientX >= rect.left - paneColumnDropGutterPx &&
    clientX <= rect.right + paneColumnDropGutterPx
  );
}

function horizontalDistanceToRect(host: HTMLElement, clientX: number): number {
  const rect = host.getBoundingClientRect();
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
