import type { FrameScheduler } from "./frame-scheduler";
import {
  cleanupPaneDragSession,
  visiblePaneHostForPane,
  type PaneDragSession,
} from "./pane-drag-reorder";
import type { PaneDropIntent } from "./types";

export interface OverviewDragSession {
  dragging: boolean;
  lastDropIntent: PaneDropIntent | null;
  pendingDropFrame: number | null;
  pendingDropPointer: { clientX: number; clientY: number } | null;
  pointerId: number;
  sourcePaneId: string;
  startClientX: number;
  startClientY: number;
}

interface MutableCurrentRef<T> {
  current: T;
}

export function cleanupOverviewDragSource(
  ref: MutableCurrentRef<OverviewDragSession | null>,
): void {
  const session = ref.current;
  const overviewSourcePaneId = session?.sourcePaneId;
  if (
    session?.pendingDropFrame !== null &&
    session?.pendingDropFrame !== undefined &&
    typeof window.cancelAnimationFrame === "function"
  ) {
    window.cancelAnimationFrame(session.pendingDropFrame);
  }
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

export function clearSchedulerRefIfCurrent(
  ref: MutableCurrentRef<FrameScheduler | null>,
  scheduler: FrameScheduler,
): void {
  if (ref.current === scheduler) {
    ref.current = null;
  }
}
