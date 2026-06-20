import type { FrameScheduler } from "./frame-scheduler";
import {
  cleanupPaneDragSession,
  visiblePaneHostForPane,
  type PaneDragSession,
} from "./pane-drag-reorder";

export interface OverviewDragSession {
  dragging: boolean;
  pointerId: number;
  sourcePaneId: string;
  startClientX: number;
  startClientY: number;
}

export interface PaneWindowDragSession {
  handle: HTMLElement;
  pointerId: number;
}

interface MutableCurrentRef<T> {
  current: T;
}

export function cleanupOverviewDragSource(
  ref: MutableCurrentRef<OverviewDragSession | null>,
): void {
  const overviewSourcePaneId = ref.current?.sourcePaneId;
  ref.current = null;
  if (!overviewSourcePaneId) {
    return;
  }
  const overviewSourceHost = visiblePaneHostForPane(overviewSourcePaneId);
  overviewSourceHost?.removeAttribute("data-drag-source");
  if (overviewSourceHost) {
    overviewSourceHost.style.translate = "";
  }
}

export function cleanupActivePaneDragSession(
  root: HTMLElement,
  ref: MutableCurrentRef<PaneDragSession | null>,
): void {
  if (!ref.current) {
    return;
  }
  cleanupPaneDragSession(root, ref.current);
  ref.current = null;
}

export function cleanupPaneWindowDragSession(
  ref: MutableCurrentRef<PaneWindowDragSession | null>,
): void {
  const session = ref.current;
  if (!session) {
    return;
  }
  if (session.handle.hasPointerCapture?.(session.pointerId)) {
    session.handle.releasePointerCapture(session.pointerId);
  }
  void window.setta.app.endWindowDrag();
  ref.current = null;
}

export function clearSchedulerRefIfCurrent(
  ref: MutableCurrentRef<FrameScheduler | null>,
  scheduler: FrameScheduler,
): void {
  if (ref.current === scheduler) {
    ref.current = null;
  }
}
