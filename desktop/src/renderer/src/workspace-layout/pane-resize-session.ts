import type { WorkspaceLayoutStore } from "./layout-store";
import { minimumColumnWidth } from "./layout-engine-helpers";
import type { PaneResizeTarget } from "./pane-resize-target";

const minimumManualPaneHeightPx = 96;
const minimumManualPaneWidthPx = minimumColumnWidth;

export type PaneResizeSession = HorizontalPaneResizeSession | VerticalPaneResizeSession;
export type PaneResizePreview = HorizontalPaneResizePreview | VerticalPaneResizePreview;

interface HorizontalPaneResizeSession {
  axis: "horizontal";
  columnId: string;
  pointerId: number;
  startClientX: number;
  startWidth: number;
}

interface VerticalPaneResizeSession {
  axis: "vertical";
  lowerPaneId: string;
  lowerStartHeight: number;
  lowerStartWeight: number;
  pointerId: number;
  startClientY: number;
  upperPaneId: string;
  upperStartHeight: number;
  upperStartWeight: number;
}

interface HorizontalPaneResizePreview {
  axis: "horizontal";
  width: number;
}

interface VerticalPaneResizePreview {
  axis: "vertical";
  lowerHeight: number;
  lowerHeightWeight: number;
  upperHeight: number;
  upperHeightWeight: number;
}

export function paneResizeSessionFromTarget(
  target: PaneResizeTarget,
  event: PointerEvent,
  store: WorkspaceLayoutStore,
): PaneResizeSession | null {
  const scene = store.toScene();
  if (target.axis === "horizontal") {
    const columnId = scene.paneById.get(target.paneId)?.columnId;
    return columnId
      ? {
          axis: "horizontal",
          columnId,
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startWidth: target.width,
        }
      : null;
  }
  const upperPane = scene.paneById.get(target.paneId);
  const lowerPane = scene.paneById.get(target.adjacentPaneId);
  if (!upperPane || !lowerPane || upperPane.columnId !== lowerPane.columnId) {
    return null;
  }
  return {
    axis: "vertical",
    lowerPaneId: target.adjacentPaneId,
    lowerStartHeight: target.afterHeight,
    lowerStartWeight: lowerPane.weight,
    pointerId: event.pointerId,
    startClientY: event.clientY,
    upperPaneId: target.paneId,
    upperStartHeight: target.beforeHeight,
    upperStartWeight: upperPane.weight,
  };
}

export function paneResizePreviewForPointerMove(
  session: PaneResizeSession,
  event: Pick<PointerEvent, "clientX" | "clientY">,
): PaneResizePreview {
  if (session.axis === "vertical") {
    return {
      axis: "vertical",
      ...paneSplitWeightsForPointerMove(session, event.clientY),
    };
  }
  return {
    axis: "horizontal",
    width: Math.max(
      minimumManualPaneWidthPx,
      Math.round(session.startWidth + event.clientX - session.startClientX),
    ),
  };
}

export function commitPaneResize(
  store: WorkspaceLayoutStore,
  session: PaneResizeSession,
  event: Pick<PointerEvent, "clientX" | "clientY">,
): boolean {
  const preview = paneResizePreviewForPointerMove(session, event);
  if (session.axis === "vertical") {
    if (
      preview.axis !== "vertical" ||
      (preview.upperHeightWeight === session.upperStartWeight &&
        preview.lowerHeightWeight === session.lowerStartWeight)
    ) {
      return false;
    }
    return store.resizePaneSplit(
      session.upperPaneId,
      session.lowerPaneId,
      preview.upperHeightWeight,
      preview.lowerHeightWeight,
    );
  }
  if (preview.axis !== "horizontal" || preview.width === session.startWidth) {
    return false;
  }
  store.resizeColumn(session.columnId, { unit: "px", value: preview.width });
  return true;
}

function paneSplitWeightsForPointerMove(
  session: VerticalPaneResizeSession,
  clientY: number,
): Omit<VerticalPaneResizePreview, "axis"> {
  const pairHeight = Math.max(1, session.upperStartHeight + session.lowerStartHeight);
  const minimumHeight = Math.min(
    minimumManualPaneHeightPx,
    Math.max(1, Math.floor((pairHeight - 1) / 2)),
  );
  const upperHeight = clampNumber(
    session.upperStartHeight + clientY - session.startClientY,
    minimumHeight,
    pairHeight - minimumHeight,
  );
  const pairWeight = Math.max(0.2, session.upperStartWeight + session.lowerStartWeight);
  const upperHeightWeight = (pairWeight * upperHeight) / pairHeight;
  return {
    lowerHeight: pairHeight - upperHeight,
    lowerHeightWeight: Math.max(0.1, pairWeight - upperHeightWeight),
    upperHeight,
    upperHeightWeight: Math.max(0.1, upperHeightWeight),
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
