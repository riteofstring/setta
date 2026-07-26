import { eventTargetsPaneChromeAction } from "./workspace-interactions";
import { eventTargetsOverviewGhost, overviewPaneIdAtPoint } from "./workspace-overview-ghost";
import type { Rect } from "./types";

export interface OverviewPanSession {
  lastClientX: number;
  lastClientY: number;
  panned: boolean;
  pointerId: number;
}

export interface OverviewPanSessionRef {
  current: OverviewPanSession | null;
}

interface OverviewPanScheduler {
  pauseBenchmark(): void;
  requestFrame(): void;
}

export function beginOverviewPanSession({
  clearOverviewInsertPreview,
  event,
  root,
  scheduler,
  sessionRef,
}: {
  clearOverviewInsertPreview: () => void;
  event: PointerEvent;
  root: HTMLElement;
  scheduler: OverviewPanScheduler;
  sessionRef: OverviewPanSessionRef;
}): boolean {
  const middleButton = event.button === 1;
  const leftOnBackground =
    event.button === 0 &&
    !eventTargetsOverviewGhost(event) &&
    !eventTargetsPaneChromeAction(event) &&
    overviewPaneIdAtPoint(event) === null;
  if (!middleButton && !leftOnBackground) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  scheduler.pauseBenchmark();
  clearOverviewInsertPreview();
  root.dataset.overviewPanning = "true";
  sessionRef.current = {
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    panned: false,
    pointerId: event.pointerId,
  };
  scheduler.requestFrame();
  return true;
}

export function updateOverviewPanSession({
  clearOverviewInsertPreview,
  event,
  panOverviewBy,
  sessionRef,
  viewportProvider,
}: {
  clearOverviewInsertPreview: () => void;
  event: PointerEvent;
  panOverviewBy: (deltaX: number, deltaY: number, viewport: Rect) => void;
  sessionRef: OverviewPanSessionRef;
  viewportProvider: () => Rect;
}): boolean {
  const session = sessionRef.current;
  if (!session || event.pointerId !== session.pointerId) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  const dx = event.clientX - session.lastClientX;
  const dy = event.clientY - session.lastClientY;
  session.lastClientX = event.clientX;
  session.lastClientY = event.clientY;
  if (dx !== 0 || dy !== 0) {
    session.panned = true;
    clearOverviewInsertPreview();
    // Grab semantics: moving the pointer right drags the surface right, which
    // reveals content to the left, so the stored pan moves in the opposite sign.
    panOverviewBy(-dx, -dy, viewportProvider());
  }
  return true;
}

export function finishOverviewPanSession({
  event,
  root,
  sessionRef,
  suppressNextPaneClick,
}: {
  event: PointerEvent;
  root: HTMLElement;
  sessionRef: OverviewPanSessionRef;
  suppressNextPaneClick: () => void;
}): boolean {
  const session = sessionRef.current;
  if (!session || event.pointerId !== session.pointerId) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  sessionRef.current = null;
  delete root.dataset.overviewPanning;
  if (session.panned) {
    suppressNextPaneClick();
  }
  return true;
}
