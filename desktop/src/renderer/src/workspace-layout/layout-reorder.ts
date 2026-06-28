import { columnSlotIndex, compareColumnsByPlaneAndSlot } from "./column-slots";
import type {
  ColumnId,
  ColumnWidthSpec,
  PaneDropIntent,
  PaneDropPlacement,
  WorkspaceColumn,
  PaneId,
} from "./types";

export interface PaneReorderResult {
  changed: boolean;
  columns: WorkspaceColumn[];
}

export interface PaneDropColumnResult extends PaneReorderResult {
  destinationColumnId: ColumnId | null;
  resetPaneSizing: boolean;
}

export interface PaneDropColumnOptions {
  defaultColumnWidthSpec: ColumnWidthSpec;
  newColumnId: ColumnId;
}

export type PaneReorderPlacement = PaneDropPlacement;

export function reorderPaneColumnForPlacement(
  columns: readonly WorkspaceColumn[],
  sourcePaneId: PaneId,
  targetPaneId: PaneId,
  placement: PaneReorderPlacement,
): PaneDropColumnResult {
  return applyPaneDropIntentToColumns(columns, sourcePaneId, {
    kind: "row",
    placement,
    targetPaneId,
  });
}

export function reorderPaneColumnBefore(
  columns: readonly WorkspaceColumn[],
  sourcePaneId: PaneId,
  targetPaneId: PaneId,
): PaneDropColumnResult {
  return reorderPaneColumnForPlacement(columns, sourcePaneId, targetPaneId, "before");
}

export function applyPaneDropIntentToColumns(
  columns: readonly WorkspaceColumn[],
  sourcePaneId: PaneId,
  intent: PaneDropIntent,
  options?: PaneDropColumnOptions,
): PaneDropColumnResult {
  if (intent.kind === "row") {
    return movePaneToRow(columns, sourcePaneId, intent.targetPaneId, intent.placement);
  }
  if (intent.kind === "swap") {
    return swapPanesInColumns(columns, sourcePaneId, intent.targetPaneId);
  }
  return movePaneToColumn(columns, sourcePaneId, intent, options);
}

// Exchange two panes wherever they sit in the column grid. The columns keep
// their slots and widths, so each pane lands in the other's position and adopts
// that column's width. Per-pane row sizing travels with the pane (handled by the
// engine's swap pane-state update). No columns are created or removed.
export function swapPanesInColumns(
  columns: readonly WorkspaceColumn[],
  sourcePaneId: PaneId,
  targetPaneId: PaneId,
): PaneDropColumnResult {
  if (sourcePaneId === targetPaneId) {
    return unchangedPaneDrop(columns);
  }
  const sourceColumn = columns.find((column) => column.paneIds.includes(sourcePaneId));
  const targetColumn = columns.find((column) => column.paneIds.includes(targetPaneId));
  if (!sourceColumn || !targetColumn) {
    return unchangedPaneDrop(columns);
  }
  const swapped = columns.map((column) => {
    if (!column.paneIds.includes(sourcePaneId) && !column.paneIds.includes(targetPaneId)) {
      return column;
    }
    return {
      ...column,
      paneIds: column.paneIds.map((paneId) =>
        paneId === sourcePaneId ? targetPaneId : paneId === targetPaneId ? sourcePaneId : paneId,
      ),
    };
  });
  return {
    changed: true,
    columns: swapped,
    // Where the source pane ends up; the engine swaps both panes' column
    // back-references explicitly, so the generic pane-state path is bypassed.
    destinationColumnId: targetColumn.columnId,
    resetPaneSizing: false,
  };
}

function movePaneToRow(
  columns: readonly WorkspaceColumn[],
  sourcePaneId: PaneId,
  targetPaneId: PaneId,
  placement: PaneDropPlacement,
): PaneDropColumnResult {
  if (sourcePaneId === targetPaneId) {
    return unchangedPaneDrop(columns);
  }
  const sourceColumn = columns.find((column) => column.paneIds.includes(sourcePaneId));
  const targetColumn = columns.find((column) => column.paneIds.includes(targetPaneId));
  if (!sourceColumn || !targetColumn) {
    return unchangedPaneDrop(columns);
  }
  if (sourceColumn.columnId === targetColumn.columnId) {
    return reorderPaneWithinColumn(columns, sourceColumn, sourcePaneId, targetPaneId, placement);
  }
  const targetIndex = targetColumn.paneIds.indexOf(targetPaneId);
  const targetInsertIndex = targetIndex + (placement === "after" ? 1 : 0);
  const columnsWithMove = columns.map((column) => {
    if (column.columnId === sourceColumn.columnId) {
      return {
        ...column,
        paneIds: column.paneIds.filter((paneId) => paneId !== sourcePaneId),
      };
    }
    if (column.columnId === targetColumn.columnId) {
      const paneIds = [...column.paneIds];
      paneIds.splice(targetInsertIndex, 0, sourcePaneId);
      return {
        ...column,
        paneIds,
      };
    }
    return column;
  });
  return {
    changed: true,
    columns: reindexColumns(columnsWithMove.filter((column) => column.paneIds.length > 0)),
    destinationColumnId: targetColumn.columnId,
    resetPaneSizing: true,
  };
}

function reorderPaneWithinColumn(
  columns: readonly WorkspaceColumn[],
  sourceColumn: WorkspaceColumn,
  sourcePaneId: PaneId,
  targetPaneId: PaneId,
  placement: PaneDropPlacement,
): PaneDropColumnResult {
  const sourceIndex = sourceColumn.paneIds.indexOf(sourcePaneId);
  const targetIndex = sourceColumn.paneIds.indexOf(targetPaneId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return unchangedPaneDrop(columns);
  }
  let insertIndex = targetIndex + (placement === "after" ? 1 : 0);
  if (insertIndex > sourceIndex) {
    insertIndex -= 1;
  }
  if (insertIndex === sourceIndex) {
    return unchangedPaneDrop(columns);
  }
  const paneIds = [...sourceColumn.paneIds];
  paneIds.splice(sourceIndex, 1);
  paneIds.splice(insertIndex, 0, sourcePaneId);
  return {
    changed: true,
    columns: columns.map((column) =>
      column.columnId === sourceColumn.columnId ? { ...column, paneIds } : column,
    ),
    destinationColumnId: sourceColumn.columnId,
    resetPaneSizing: false,
  };
}

function movePaneToColumn(
  columns: readonly WorkspaceColumn[],
  sourcePaneId: PaneId,
  intent: Extract<PaneDropIntent, { kind: "column" }>,
  options: PaneDropColumnOptions | undefined,
): PaneDropColumnResult {
  if (!options) {
    return unchangedPaneDrop(columns);
  }
  const sourceColumn = columns.find((column) => column.paneIds.includes(sourcePaneId));
  const targetColumn = columns.find(
    (column) =>
      column.columnId === intent.targetColumnId && column.planeIndex === intent.planeIndex,
  );
  if (!sourceColumn || !targetColumn || options.newColumnId === sourceColumn.columnId) {
    return unchangedPaneDrop(columns);
  }
  if (
    sourceColumn.paneIds.length === 1 &&
    columnDropKeepsSinglePaneColumnInPlace(
      columns,
      sourceColumn,
      targetColumn,
      intent.slotPlacement,
    )
  ) {
    return unchangedPaneDrop(columns);
  }

  const columnsWithoutSourcePane = columns
    .map((column) =>
      column.columnId === sourceColumn.columnId
        ? {
            ...column,
            paneIds: column.paneIds.filter((paneId) => paneId !== sourcePaneId),
          }
        : column,
    )
    .filter((column) => column.paneIds.length > 0);
  const extractedTargetColumn = columnsWithoutSourcePane.find(
    (column) =>
      column.columnId === intent.targetColumnId && column.planeIndex === intent.planeIndex,
  );
  if (!extractedTargetColumn) {
    return unchangedPaneDrop(columns);
  }

  const targetSlotIndex =
    columnSlotIndex(extractedTargetColumn) + (intent.slotPlacement === "after" ? 1 : 0);
  const shiftedColumns = columnsWithoutSourcePane.map((column) =>
    column.planeIndex === intent.planeIndex && columnSlotIndex(column) >= targetSlotIndex
      ? { ...column, slotIndex: columnSlotIndex(column) + 1 }
      : column,
  );
  const widthSpec = copiedColumnWidthSpec(extractedTargetColumn.widthSpec);
  const idealWidthSpec = copiedColumnWidthSpec(extractedTargetColumn.idealWidthSpec);
  const insertedColumn: WorkspaceColumn = {
    columnId: options.newColumnId,
    idealWidthSpec,
    index: shiftedColumns.length,
    paneIds: [sourcePaneId],
    planeIndex: intent.planeIndex,
    previousProportionWidth:
      widthSpec.unit === "proportion"
        ? (extractedTargetColumn.previousProportionWidth ?? widthSpec.value)
        : undefined,
    slotIndex: targetSlotIndex,
    widthSpec,
  };
  return {
    changed: true,
    columns: reindexColumns([...shiftedColumns, insertedColumn]),
    destinationColumnId: insertedColumn.columnId,
    resetPaneSizing: true,
  };
}

function columnDropKeepsSinglePaneColumnInPlace(
  columns: readonly WorkspaceColumn[],
  sourceColumn: WorkspaceColumn,
  targetColumn: WorkspaceColumn,
  placement: PaneDropPlacement,
): boolean {
  if (sourceColumn.columnId === targetColumn.columnId) {
    return true;
  }
  if (sourceColumn.planeIndex !== targetColumn.planeIndex) {
    return false;
  }
  const planeColumns = columns
    .filter((column) => column.planeIndex === sourceColumn.planeIndex)
    .toSorted((left, right) => columnSlotIndex(left) - columnSlotIndex(right));
  const sourceIndex = planeColumns.findIndex((column) => column.columnId === sourceColumn.columnId);
  const targetIndex = planeColumns.findIndex((column) => column.columnId === targetColumn.columnId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return false;
  }
  let insertIndex = targetIndex + (placement === "after" ? 1 : 0);
  if (insertIndex > sourceIndex) {
    insertIndex -= 1;
  }
  return insertIndex === sourceIndex;
}

function copiedColumnWidthSpec(widthSpec: ColumnWidthSpec): ColumnWidthSpec {
  return { ...widthSpec };
}

function reindexColumns(columns: readonly WorkspaceColumn[]): WorkspaceColumn[] {
  return columns
    .toSorted(compareColumnsByPlaneAndSlot)
    .map((column, index) => ({ ...column, index, slotIndex: columnSlotIndex(column) }));
}

function unchangedPaneDrop(columns: readonly WorkspaceColumn[]): PaneDropColumnResult {
  return {
    changed: false,
    columns: [...columns],
    destinationColumnId: null,
    resetPaneSizing: false,
  };
}
