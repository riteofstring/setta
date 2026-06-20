import type { LayoutFrameInput, PaneId, WorkspaceColumn } from "./types";
import { nearestPaneByVerticalCenter, type PaneLocation } from "./layout-engine-helpers";
import type { PaneVisualFrame } from "./pane-visual-frame";

type ColumnVisualFrames = (column: WorkspaceColumn) => PaneVisualFrame[];

export function paneInHorizontalVisualDirection({
  columns,
  direction,
  source,
}: {
  columns: WorkspaceColumn[];
  direction: "left" | "right";
  source: PaneLocation;
}): PaneId | null {
  const planeColumns = columns.filter((column) => column.planeIndex === source.planeIndex);
  if (planeColumns.length <= 1) {
    return null;
  }
  const targetIndex = source.planeColumnIndex + (direction === "left" ? -1 : 1);
  const targetColumn = planeColumns[(targetIndex + planeColumns.length) % planeColumns.length];
  return targetColumn?.paneIds[0] ?? null;
}

export function paneInVerticalVisualDirection({
  adjacentPlaneIndex,
  columnVisualFrames,
  columns,
  direction,
  nearestColumnInPlaneByHorizontalCenter,
  source,
}: {
  adjacentPlaneIndex: (planeIndex: number, direction: "up" | "down") => number | null;
  columnVisualFrames: ColumnVisualFrames;
  columns: WorkspaceColumn[];
  direction: "up" | "down";
  nearestColumnInPlaneByHorizontalCenter: (
    planeIndex: number,
    source: PaneLocation,
  ) => WorkspaceColumn | null;
  source: PaneLocation;
  viewport: LayoutFrameInput["viewport"];
}): PaneId | null {
  const column = columns[source.columnIndex];
  if (!column) {
    return null;
  }
  const frames = columnVisualFrames(column);
  const targetRowIndex = source.rowIndex + (direction === "up" ? -1 : 1);
  if (frames[targetRowIndex]) {
    return frames[targetRowIndex].paneId;
  }
  const targetPlaneIndex = adjacentPlaneIndex(source.planeIndex, direction);
  if (targetPlaneIndex === null) {
    return null;
  }
  const targetColumn = nearestColumnInPlaneByHorizontalCenter(targetPlaneIndex, source);
  if (!targetColumn) {
    return null;
  }
  const sourceFrame = frames[source.rowIndex];
  return nearestPaneByVerticalCenter(columnVisualFrames(targetColumn), sourceFrame?.centerY ?? 0);
}
