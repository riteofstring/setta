import type { NiriLayoutStore } from "./layout-store";
import { minimumColumnWidth } from "./layout-engine-helpers";
import type { PaneResizeTarget } from "./pane-resize-target";

const minimumManualPaneHeightPx = 96;
const minimumManualPaneWidthPx = minimumColumnWidth;

export type PaneResizeSession = HorizontalPaneResizeSession | VerticalPaneResizeSession;

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

export function paneResizeSessionFromTarget(
  target: PaneResizeTarget,
  event: PointerEvent,
  store: NiriLayoutStore,
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

export function applyPaneResizePointerMove(
  store: NiriLayoutStore,
  session: PaneResizeSession,
  event: PointerEvent,
): void {
  if (session.axis === "vertical") {
    const weights = paneSplitWeightsForPointerMove(session, event.clientY);
    store.resizePaneSplit(
      session.upperPaneId,
      session.lowerPaneId,
      weights.upperHeightWeight,
      weights.lowerHeightWeight,
    );
    return;
  }
  const width = Math.max(
    minimumManualPaneWidthPx,
    Math.round(session.startWidth + event.clientX - session.startClientX),
  );
  store.resizeColumn(session.columnId, { unit: "px", value: width });
}

function paneSplitWeightsForPointerMove(
  session: VerticalPaneResizeSession,
  clientY: number,
): { lowerHeightWeight: number; upperHeightWeight: number } {
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
    lowerHeightWeight: Math.max(0.1, pairWeight - upperHeightWeight),
    upperHeightWeight: Math.max(0.1, upperHeightWeight),
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
