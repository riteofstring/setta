import { columnSlotIndex } from "./column-slots";
import type { WorkspaceColumn, PaneId } from "./types";

export interface PaneReorderResult {
  changed: boolean;
  columns: WorkspaceColumn[];
}

export type PaneReorderPlacement = "after" | "before";

export function reorderPaneColumnForPlacement(
  columns: readonly WorkspaceColumn[],
  sourcePaneId: PaneId,
  targetPaneId: PaneId,
  placement: PaneReorderPlacement,
): PaneReorderResult {
  if (placement === "before") {
    return reorderPaneColumnBefore(columns, sourcePaneId, targetPaneId);
  }
  const movedSourceBeforeTarget = reorderPaneColumnBefore(columns, sourcePaneId, targetPaneId);
  const movedTargetBeforeSource = reorderPaneColumnBefore(
    movedSourceBeforeTarget.columns,
    targetPaneId,
    sourcePaneId,
  );
  return {
    changed: movedSourceBeforeTarget.changed || movedTargetBeforeSource.changed,
    columns: movedTargetBeforeSource.columns,
  };
}

export function reorderPaneColumnBefore(
  columns: readonly WorkspaceColumn[],
  sourcePaneId: PaneId,
  targetPaneId: PaneId,
): PaneReorderResult {
  if (sourcePaneId === targetPaneId) {
    return { changed: false, columns: [...columns] };
  }
  const sourceColumn = columns.find((column) => column.paneIds.includes(sourcePaneId));
  const targetColumn = columns.find((column) => column.paneIds.includes(targetPaneId));
  if (!sourceColumn || !targetColumn) {
    return { changed: false, columns: [...columns] };
  }
  if (sourceColumn.columnId === targetColumn.columnId) {
    return reorderPaneWithinColumn(columns, sourceColumn, sourcePaneId, targetPaneId);
  }
  const remainingColumns = columns.filter((column) => column.columnId !== sourceColumn.columnId);
  const targetPlaneColumns = remainingColumns
    .filter((column) => column.planeIndex === targetColumn.planeIndex)
    .toSorted((left, right) => columnSlotIndex(left) - columnSlotIndex(right));
  const targetPlaneIndex = Math.max(
    0,
    targetPlaneColumns.findIndex((column) => column.columnId === targetColumn.columnId),
  );
  const insertedPlaneColumns = [
    ...targetPlaneColumns.slice(0, targetPlaneIndex),
    { ...sourceColumn, planeIndex: targetColumn.planeIndex },
    ...targetPlaneColumns.slice(targetPlaneIndex),
  ];
  const reindexedPlaneColumns = new Map(
    insertedPlaneColumns.map((column, slotIndex) => [
      column.columnId,
      {
        ...column,
        slotIndex,
      },
    ]),
  );
  return {
    changed: true,
    columns: [...remainingColumns, { ...sourceColumn, planeIndex: targetColumn.planeIndex }].map(
      (column) => reindexedPlaneColumns.get(column.columnId) ?? column,
    ),
  };
}

function reorderPaneWithinColumn(
  columns: readonly WorkspaceColumn[],
  sourceColumn: WorkspaceColumn,
  sourcePaneId: PaneId,
  targetPaneId: PaneId,
): PaneReorderResult {
  const sourceIndex = sourceColumn.paneIds.indexOf(sourcePaneId);
  const targetIndex = sourceColumn.paneIds.indexOf(targetPaneId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return { changed: false, columns: [...columns] };
  }
  const paneIds = [...sourceColumn.paneIds];
  paneIds.splice(sourceIndex, 1);
  paneIds.splice(targetIndex > sourceIndex ? targetIndex - 1 : targetIndex, 0, sourcePaneId);
  return {
    changed: true,
    columns: columns.map((column) =>
      column.columnId === sourceColumn.columnId ? { ...column, paneIds } : column,
    ),
  };
}
