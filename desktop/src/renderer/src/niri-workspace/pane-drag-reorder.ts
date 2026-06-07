import type { NiriLayoutStore } from "./layout-store";

const paneDragThresholdPx = 6;

type PaneDropAxis = "horizontal" | "vertical";
type PaneDropPlacement = "after" | "before";

export interface PaneDropTarget {
  axis: PaneDropAxis;
  paneId: string;
  placement: PaneDropPlacement;
}

export interface PaneDragSession {
  dragging: boolean;
  handle: HTMLElement;
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
  store: NiriLayoutStore,
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
  updatePaneDropTarget(root, session, event, store);
}

export function finishPaneDragSession(
  event: PointerEvent,
  root: HTMLElement,
  session: PaneDragSession,
): PaneDragFinish {
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
  const sourceHost = visiblePaneHostForPane(session.sourcePaneId);
  sourceHost?.removeAttribute("data-drag-source");
  if (sourceHost) {
    sourceHost.style.translate = "";
  }
  if (session.handle.hasPointerCapture?.(session.pointerId)) {
    session.handle.releasePointerCapture(session.pointerId);
  }
}

export function applyPaneDrop(
  store: NiriLayoutStore,
  sourcePaneId: string,
  target: PaneDropTarget,
): boolean {
  if (sourcePaneId === target.paneId) {
    return false;
  }
  if (target.placement === "before") {
    return store.reorderPaneBefore(sourcePaneId, target.paneId);
  }
  const movedSourceBeforeTarget = store.reorderPaneBefore(sourcePaneId, target.paneId);
  const movedTargetBeforeSource = store.reorderPaneBefore(target.paneId, sourcePaneId);
  store.focusPane(sourcePaneId);
  return movedSourceBeforeTarget || movedTargetBeforeSource;
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
    '[data-testid="niri-fake-pane-host"][data-visible="true"]',
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
  const handle = event.target.closest<HTMLElement>('[data-niri-pane-drag-handle="true"]');
  const paneId =
    handle?.dataset.paneId ??
    handle?.closest<HTMLElement>('[data-testid="niri-fake-pane-host"]')?.dataset.paneId;
  return handle && paneId ? { handle, paneId } : null;
}

function updatePaneDropTarget(
  root: HTMLElement,
  session: PaneDragSession,
  event: PointerEvent,
  store: NiriLayoutStore,
): void {
  const target = paneDropTargetFromPointer(event, session.sourcePaneId, store);
  if (samePaneDropTarget(target, session.target)) {
    return;
  }
  session.target = target;
  syncPaneDropTarget(root, target);
  if (target) {
    store.previewPaneDrop(session.sourcePaneId, target.paneId, target.placement);
    return;
  }
  store.clearPaneDropPreview();
}

function paneDropTargetFromPointer(
  event: PointerEvent,
  sourcePaneId: string,
  store: NiriLayoutStore,
): PaneDropTarget | null {
  const host = visiblePaneHostAtPoint(event.clientX, event.clientY, sourcePaneId);
  const targetPaneId = host?.dataset.paneId;
  if (!host || !targetPaneId) {
    return null;
  }
  const scene = store.toScene();
  const sourcePane = scene.paneById.get(sourcePaneId);
  const targetPane = scene.paneById.get(targetPaneId);
  if (!sourcePane || !targetPane) {
    return null;
  }
  const axis: PaneDropAxis =
    sourcePane.columnId === targetPane.columnId ? "vertical" : "horizontal";
  return {
    axis,
    paneId: targetPaneId,
    placement: paneDropPlacement(event, host, axis),
  };
}

function paneDropPlacement(
  event: PointerEvent,
  host: HTMLElement,
  axis: PaneDropAxis,
): PaneDropPlacement {
  const rect = host.getBoundingClientRect();
  if (axis === "vertical") {
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }
  return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
}

function visiblePaneHostAtPoint(
  clientX: number,
  clientY: number,
  sourcePaneId: string,
): HTMLElement | null {
  const hosts = document.querySelectorAll<HTMLElement>(
    '[data-testid="niri-fake-pane-host"][data-visible="true"]',
  );
  return (
    [...hosts]
      .filter(
        (host) => host.dataset.paneId !== sourcePaneId && rectContainsPoint(host, clientX, clientY),
      )
      .toSorted((left, right) => zIndexForHost(right) - zIndexForHost(left))[0] ?? null
  );
}

function rectContainsPoint(host: HTMLElement, clientX: number, clientY: number): boolean {
  const rect = host.getBoundingClientRect();
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  );
}

function zIndexForHost(host: HTMLElement): number {
  const zIndex = Number.parseInt(window.getComputedStyle(host).zIndex, 10);
  return Number.isFinite(zIndex) ? zIndex : 0;
}

function samePaneDropTarget(left: PaneDropTarget | null, right: PaneDropTarget | null): boolean {
  return (
    left?.paneId === right?.paneId &&
    left?.placement === right?.placement &&
    left?.axis === right?.axis
  );
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
  const hosts = root.querySelectorAll<HTMLElement>('[data-testid="niri-fake-pane-host"]');
  for (const host of hosts) {
    delete host.dataset.dropAxis;
    delete host.dataset.dropTarget;
  }
}
