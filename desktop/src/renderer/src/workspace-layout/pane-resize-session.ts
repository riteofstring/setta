import type { WorkspaceLayoutStore } from "./layout-store";
import { minimumColumnWidth } from "./layout-engine-helpers";
import type { PaneResizeTarget } from "./pane-resize-target";
import {
  resizeColumnOperation,
  resizePaneRowOperation,
  resizePaneSplitOperation,
  type WorkspaceLayoutOperation,
} from "./workspace-layout-operations";

const minimumManualPaneHeightPx = 96;
const minimumManualPaneWidthPx = minimumColumnWidth;
const heightResizeDefaultSnapPx = 12;

export type PaneResizeSession =
  | HeightPaneResizeSession
  | HorizontalPaneResizeSession
  | VerticalPaneResizeSession;
export type PaneResizePreview =
  | HeightPaneResizePreview
  | HorizontalPaneResizePreview
  | VerticalPaneResizePreview;

interface HeightPaneResizeSession {
  axis: "height";
  paneId: string;
  pointerId: number;
  startBottom: number;
  startClientY: number;
  startDesignatedHeight: number | null;
  startHeight: number;
  viewportBottom: number;
  viewportHeight: number;
}

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

interface HeightPaneResizePreview {
  axis: "height";
  height: number;
  heightPx: number | null;
}

export function paneResizeSessionFromTarget(
  target: PaneResizeTarget,
  event: PointerEvent,
  store: WorkspaceLayoutStore,
): PaneResizeSession | null {
  switch (target.axis) {
    case "height":
      return heightPaneResizeSessionFromTarget(target, event, store);
    case "horizontal":
      return horizontalPaneResizeSessionFromTarget(target, event, store);
    case "vertical":
      return verticalPaneResizeSessionFromTarget(target, event, store);
  }
}

function heightPaneResizeSessionFromTarget(
  target: Extract<PaneResizeTarget, { axis: "height" }>,
  event: PointerEvent,
  store: WorkspaceLayoutStore,
): HeightPaneResizeSession | null {
  const scene = store.toScene();
  const pane = scene.paneById.get(target.paneId);
  if (!pane) {
    return null;
  }
  return {
    axis: "height",
    paneId: target.paneId,
    pointerId: event.pointerId,
    startBottom: target.bottom,
    startClientY: event.clientY,
    startDesignatedHeight: pane.heightPx ?? null,
    startHeight: target.height,
    viewportBottom: target.viewportBottom,
    viewportHeight: target.viewportHeight,
  };
}

function horizontalPaneResizeSessionFromTarget(
  target: Extract<PaneResizeTarget, { axis: "horizontal" }>,
  event: PointerEvent,
  store: WorkspaceLayoutStore,
): HorizontalPaneResizeSession | null {
  const scene = store.toScene();
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

function verticalPaneResizeSessionFromTarget(
  target: Extract<PaneResizeTarget, { axis: "vertical" }>,
  event: PointerEvent,
  store: WorkspaceLayoutStore,
): VerticalPaneResizeSession | null {
  const scene = store.toScene();
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
  if (session.axis === "height") {
    return {
      axis: "height",
      ...paneHeightForPointerMove(session, event.clientY),
    };
  }
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
  switch (session.axis) {
    case "height":
      return commitHeightPaneResize(store, session, preview);
    case "horizontal":
      return commitHorizontalPaneResize(store, session, preview);
    case "vertical":
      return commitVerticalPaneResize(store, session, preview);
  }
}

export function paneResizeOperationForCommit(
  session: PaneResizeSession,
  event: Pick<PointerEvent, "clientX" | "clientY">,
): WorkspaceLayoutOperation {
  const preview = paneResizePreviewForPointerMove(session, event);
  switch (session.axis) {
    case "height":
      return heightPaneResizeOperation(session, preview);
    case "horizontal":
      return horizontalPaneResizeOperation(session, preview);
    case "vertical":
      return verticalPaneResizeOperation(session, preview);
    default: {
      const exhaustive: never = session;
      throw new Error(`unsupported workspace pane resize session: ${String(exhaustive)}`);
    }
  }
}

function heightPaneResizeOperation(
  session: HeightPaneResizeSession,
  preview: PaneResizePreview,
): WorkspaceLayoutOperation {
  if (preview.axis !== "height" || preview.heightPx === session.startDesignatedHeight) {
    return null;
  }
  return resizePaneRowOperation(session.paneId, preview.heightPx);
}

function horizontalPaneResizeOperation(
  session: HorizontalPaneResizeSession,
  preview: PaneResizePreview,
): WorkspaceLayoutOperation {
  if (preview.axis !== "horizontal" || preview.width === session.startWidth) {
    return null;
  }
  return resizeColumnOperation(session.columnId, { unit: "px", value: preview.width });
}

function verticalPaneResizeOperation(
  session: VerticalPaneResizeSession,
  preview: PaneResizePreview,
): WorkspaceLayoutOperation {
  if (preview.axis !== "vertical" || paneResizeSplitUnchanged(session, preview)) {
    return null;
  }
  return resizePaneSplitOperation(
    session.upperPaneId,
    session.lowerPaneId,
    preview.upperHeightWeight,
    preview.lowerHeightWeight,
  );
}

function commitVerticalPaneResize(
  store: WorkspaceLayoutStore,
  session: VerticalPaneResizeSession,
  preview: PaneResizePreview,
): boolean {
  if (preview.axis !== "vertical" || paneResizeSplitUnchanged(session, preview)) {
    return false;
  }
  return store.resizePaneSplit(
    session.upperPaneId,
    session.lowerPaneId,
    preview.upperHeightWeight,
    preview.lowerHeightWeight,
  );
}

function paneResizeSplitUnchanged(
  session: VerticalPaneResizeSession,
  preview: Extract<PaneResizePreview, { axis: "vertical" }>,
): boolean {
  return (
    preview.upperHeightWeight === session.upperStartWeight &&
    preview.lowerHeightWeight === session.lowerStartWeight
  );
}

function commitHeightPaneResize(
  store: WorkspaceLayoutStore,
  session: HeightPaneResizeSession,
  preview: PaneResizePreview,
): boolean {
  if (preview.axis !== "height" || preview.heightPx === session.startDesignatedHeight) {
    return false;
  }
  return store.resizePaneRow(session.paneId, preview.heightPx);
}

function commitHorizontalPaneResize(
  store: WorkspaceLayoutStore,
  session: HorizontalPaneResizeSession,
  preview: PaneResizePreview,
): boolean {
  if (preview.axis !== "horizontal" || preview.width === session.startWidth) {
    return false;
  }
  store.resizeColumn(session.columnId, { unit: "px", value: preview.width });
  return true;
}

function paneHeightForPointerMove(
  session: HeightPaneResizeSession,
  clientY: number,
): Omit<HeightPaneResizePreview, "axis"> {
  const maximumHeight = Math.max(minimumManualPaneHeightPx, session.viewportHeight);
  const height = clampNumber(
    session.startHeight + clientY - session.startClientY,
    minimumManualPaneHeightPx,
    maximumHeight,
  );
  const bottom = session.startBottom + clientY - session.startClientY;
  const heightPx =
    Math.abs(session.viewportBottom - bottom) <= heightResizeDefaultSnapPx ? null : height;
  return {
    height,
    heightPx,
  };
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
