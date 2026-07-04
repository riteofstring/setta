import { columnSlotIndex, compareColumnsByPlaneAndSlot } from "./column-slots";
import type {
  ColumnId,
  ColumnWidthSpec,
  PaneDropIntent,
  PaneDropPlacement,
  WorkspaceColumn,
  PaneId,
} from "./types";

interface PaneReorderResult {
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

function reorderPaneColumnForPlacement(
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
  if (intent.kind === "plane-slot") {
    return movePaneToPlaneSlot(columns, sourcePaneId, intent, options);
  }
  return movePaneToColumn(columns, sourcePaneId, intent, options);
}

// Exchange two panes wherever they sit in the column grid. The columns keep
// their slots and widths, so each pane lands in the other's position and adopts
// that column's width. Per-pane row sizing travels with the pane (handled by the
// engine's swap pane-state update). No columns are created or removed.
function swapPanesInColumns(
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
  const pair = paneDropSourceAndTarget(columns, sourcePaneId, intent);
  if (!pair || options.newColumnId === pair.sourceColumn.columnId) {
    return unchangedPaneDrop(columns);
  }
  if (singlePaneColumnDropIsNoop(columns, pair.sourceColumn, pair.targetColumn, intent)) {
    return unchangedPaneDrop(columns);
  }

  const columnsWithoutSourcePane = columnsWithoutPane(columns, pair.sourceColumn, sourcePaneId);
  const extractedTargetColumn = columnsWithoutSourcePane.find(
    (column) =>
      column.columnId === intent.targetColumnId && column.planeIndex === intent.planeIndex,
  );
  if (!extractedTargetColumn) {
    return unchangedPaneDrop(columns);
  }

  const targetSlotIndex =
    columnSlotIndex(extractedTargetColumn) + (intent.slotPlacement === "after" ? 1 : 0);
  const shiftedColumns = shiftedColumnsForSlotInsert(
    columnsWithoutSourcePane,
    intent.planeIndex,
    targetSlotIndex,
  );
  const insertedColumn = insertedPaneColumn({
    index: shiftedColumns.length,
    newColumnId: options.newColumnId,
    planeIndex: intent.planeIndex,
    referenceColumn: extractedTargetColumn,
    sourcePaneId,
    slotIndex: targetSlotIndex,
  });
  return {
    changed: true,
    columns: reindexColumns([...shiftedColumns, insertedColumn]),
    destinationColumnId: insertedColumn.columnId,
    resetPaneSizing: true,
  };
}

function movePaneToPlaneSlot(
  columns: readonly WorkspaceColumn[],
  sourcePaneId: PaneId,
  intent: Extract<PaneDropIntent, { kind: "plane-slot" }>,
  options: PaneDropColumnOptions | undefined,
): PaneDropColumnResult {
  if (!options) {
    return unchangedPaneDrop(columns);
  }
  const setup = planeSlotDropSetup(columns, sourcePaneId, intent);
  if (!setup) {
    return unchangedPaneDrop(columns);
  }
  if (
    targetSlotIsOccupied(
      setup.columnsWithoutSourcePane,
      setup.normalizedTargetPlaneIndex,
      setup.targetSlotIndex,
    )
  ) {
    return unchangedPaneDrop(columns);
  }

  const referenceColumn = referenceColumnForPlaneSlot(setup, intent.referenceColumnId);
  const insertedColumn = insertedPaneColumn({
    index: setup.columnsWithoutSourcePane.length,
    newColumnId: options.newColumnId,
    planeIndex: setup.normalizedTargetPlaneIndex,
    referenceColumn,
    sourcePaneId,
    slotIndex: setup.targetSlotIndex,
  });
  return {
    changed: true,
    columns: reindexColumns([...setup.columnsWithoutSourcePane, insertedColumn]),
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

function columnOccupiesSlot(
  column: WorkspaceColumn,
  planeIndex: number,
  slotIndex: number,
): boolean {
  return column.planeIndex === planeIndex && columnSlotIndex(column) === slotIndex;
}

function columnsWithoutPane(
  columns: readonly WorkspaceColumn[],
  sourceColumn: WorkspaceColumn,
  sourcePaneId: PaneId,
): WorkspaceColumn[] {
  return columns
    .map((column) =>
      column.columnId === sourceColumn.columnId
        ? {
            ...column,
            paneIds: column.paneIds.filter((paneId) => paneId !== sourcePaneId),
          }
        : column,
    )
    .filter((column) => column.paneIds.length > 0);
}

function insertedPaneColumn({
  index,
  newColumnId,
  planeIndex,
  referenceColumn,
  sourcePaneId,
  slotIndex,
}: {
  index: number;
  newColumnId: ColumnId;
  planeIndex: number;
  referenceColumn: WorkspaceColumn;
  sourcePaneId: PaneId;
  slotIndex: number;
}): WorkspaceColumn {
  const widthSpec = copiedColumnWidthSpec(referenceColumn.widthSpec);
  const idealWidthSpec = copiedColumnWidthSpec(referenceColumn.idealWidthSpec);
  return {
    columnId: newColumnId,
    idealWidthSpec,
    index,
    paneIds: [sourcePaneId],
    planeIndex,
    previousProportionWidth:
      widthSpec.unit === "proportion"
        ? (referenceColumn.previousProportionWidth ?? widthSpec.value)
        : undefined,
    slotIndex,
    widthSpec,
  };
}

function paneDropSourceAndTarget(
  columns: readonly WorkspaceColumn[],
  sourcePaneId: PaneId,
  intent: Extract<PaneDropIntent, { kind: "column" }>,
): { sourceColumn: WorkspaceColumn; targetColumn: WorkspaceColumn } | null {
  const sourceColumn = columns.find((column) => column.paneIds.includes(sourcePaneId));
  const targetColumn = columns.find(
    (column) =>
      column.columnId === intent.targetColumnId && column.planeIndex === intent.planeIndex,
  );
  return sourceColumn && targetColumn ? { sourceColumn, targetColumn } : null;
}

interface PlaneSlotDropSetup {
  columnsWithoutSourcePane: WorkspaceColumn[];
  normalizedColumns: readonly WorkspaceColumn[];
  normalizedTargetPlaneIndex: number;
  sourceColumn: WorkspaceColumn;
  targetSlotIndex: number;
}

function planeSlotDropSetup(
  columns: readonly WorkspaceColumn[],
  sourcePaneId: PaneId,
  intent: Extract<PaneDropIntent, { kind: "plane-slot" }>,
): PlaneSlotDropSetup | null {
  const targetPlaneIndex = normalizedDropPlaneIndex(intent.planeIndex);
  const targetSlotIndex = normalizedDropIndex(intent.slotIndex);
  if (targetPlaneIndex === null || targetSlotIndex === null) {
    return null;
  }
  const planeOffset = targetPlaneIndex < 0 ? -targetPlaneIndex : 0;
  const normalizedColumns = offsetPlaneIndexes(columns, planeOffset);
  const normalizedTargetPlaneIndex = targetPlaneIndex + planeOffset;
  const sourceColumn = normalizedColumns.find((column) => column.paneIds.includes(sourcePaneId));
  if (
    !sourceColumn ||
    columnOccupiesSlot(sourceColumn, normalizedTargetPlaneIndex, targetSlotIndex)
  ) {
    return null;
  }
  return {
    columnsWithoutSourcePane: columnsWithoutPane(normalizedColumns, sourceColumn, sourcePaneId),
    normalizedColumns,
    normalizedTargetPlaneIndex,
    sourceColumn,
    targetSlotIndex,
  };
}

function offsetPlaneIndexes(
  columns: readonly WorkspaceColumn[],
  offset: number,
): readonly WorkspaceColumn[] {
  return offset > 0
    ? columns.map((column) => ({ ...column, planeIndex: column.planeIndex + offset }))
    : columns;
}

function referenceColumnForPlaneSlot(
  setup: PlaneSlotDropSetup,
  referenceColumnId: ColumnId,
): WorkspaceColumn {
  return (
    setup.normalizedColumns.find((column) => column.columnId === referenceColumnId) ??
    setup.normalizedColumns.find((column) => columnSlotIndex(column) === setup.targetSlotIndex) ??
    setup.sourceColumn
  );
}

function shiftedColumnsForSlotInsert(
  columns: readonly WorkspaceColumn[],
  planeIndex: number,
  targetSlotIndex: number,
): WorkspaceColumn[] {
  return columns.map((column) =>
    column.planeIndex === planeIndex && columnSlotIndex(column) >= targetSlotIndex
      ? { ...column, slotIndex: columnSlotIndex(column) + 1 }
      : column,
  );
}

function singlePaneColumnDropIsNoop(
  columns: readonly WorkspaceColumn[],
  sourceColumn: WorkspaceColumn,
  targetColumn: WorkspaceColumn,
  intent: Extract<PaneDropIntent, { kind: "column" }>,
): boolean {
  return (
    sourceColumn.paneIds.length === 1 &&
    columnDropKeepsSinglePaneColumnInPlace(
      columns,
      sourceColumn,
      targetColumn,
      intent.slotPlacement,
    )
  );
}

function targetSlotIsOccupied(
  columns: readonly WorkspaceColumn[],
  planeIndex: number,
  slotIndex: number,
): boolean {
  return columns.some((column) => columnOccupiesSlot(column, planeIndex, slotIndex));
}

function copiedColumnWidthSpec(widthSpec: ColumnWidthSpec): ColumnWidthSpec {
  return { ...widthSpec };
}

function normalizedDropIndex(index: number): number | null {
  if (!Number.isFinite(index)) {
    return null;
  }
  return Math.max(0, Math.floor(index));
}

function normalizedDropPlaneIndex(index: number): number | null {
  if (!Number.isFinite(index)) {
    return null;
  }
  return Math.floor(index);
}

function reindexColumns(columns: readonly WorkspaceColumn[]): WorkspaceColumn[] {
  const planeIndexByOldIndex = new Map(
    [...new Set(columns.map((column) => column.planeIndex))]
      .toSorted((left, right) => left - right)
      .map((planeIndex, denseIndex) => [planeIndex, denseIndex]),
  );
  return columns.toSorted(compareColumnsByPlaneAndSlot).map((column, index) => ({
    ...column,
    index,
    planeIndex: planeIndexByOldIndex.get(column.planeIndex) ?? column.planeIndex,
    slotIndex: columnSlotIndex(column),
  }));
}

function unchangedPaneDrop(columns: readonly WorkspaceColumn[]): PaneDropColumnResult {
  return {
    changed: false,
    columns: [...columns],
    destinationColumnId: null,
    resetPaneSizing: false,
  };
}
