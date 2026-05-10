export type SpreadsheetSortState = {
  columnIndex: number;
  direction: "asc" | "desc";
};

export function isSpreadsheetLoadRequestStale(args: {
  activeRequestId: number;
  requestId: number;
  currentSelectedPath: string | null;
  requestedPath: string;
}): boolean {
  return (
    args.activeRequestId !== args.requestId ||
    args.currentSelectedPath !== args.requestedPath
  );
}

export function canSaveSpreadsheetDraft(args: {
  sheetPath: string;
  selectedPath: string | null;
}): boolean {
  if (!args.selectedPath) {
    return false;
  }
  return args.sheetPath === args.selectedPath;
}

export function shouldIgnoreSpreadsheetSaveResult(args: {
  savingPath: string;
  currentSelectedPath: string | null;
}): boolean {
  return args.currentSelectedPath !== args.savingPath;
}

export function shouldClearSpreadsheetDirtyAfterSave(args: {
  saveStartEditVersion: number;
  currentEditVersion: number;
}): boolean {
  return args.saveStartEditVersion === args.currentEditVersion;
}

export function shouldAnnounceSpreadsheetAutoReload(args: {
  reloadSucceeded: boolean;
  isCancelled: boolean;
}): boolean {
  return args.reloadSucceeded && !args.isCancelled;
}

function withColumnCount(row: string[], columnCount: number): string[] {
  if (row.length === columnCount) {
    return row;
  }
  const next = Array.from({ length: columnCount }, () => "");
  for (let i = 0; i < Math.min(row.length, columnCount); i += 1) {
    next[i] = row[i] ?? "";
  }
  return next;
}

type SpreadsheetCellEdit = {
  rowIndex: number;
  columnIndex: number;
  value: string;
};

function isSpreadsheetCellEditWithinBounds(
  edit: SpreadsheetCellEdit,
  columnCount: number,
): boolean {
  return (
    edit.rowIndex >= 0 &&
    edit.columnIndex >= 0 &&
    edit.columnIndex < columnCount
  );
}

function resolveSpreadsheetSourceRow(args: {
  columnCount: number;
  edit: SpreadsheetCellEdit;
  rows: string[][];
  touchedRows: Map<number, string[]>;
}): string[] {
  const { columnCount, edit, rows, touchedRows } = args;
  return (
    touchedRows.get(edit.rowIndex) ??
    withColumnCount(rows[edit.rowIndex] ?? [], columnCount)
  );
}

function ensureSpreadsheetEditableRow(args: {
  edit: SpreadsheetCellEdit;
  nextRows: string[][];
  rows: string[][];
  sourceRow: string[];
  touchedRows: Map<number, string[]>;
}): {
  editableRow: string[];
  nextRows: string[][];
} {
  const { edit, nextRows, rows, sourceRow, touchedRows } = args;
  const existingEditableRow = touchedRows.get(edit.rowIndex);
  if (existingEditableRow) {
    return {
      editableRow: existingEditableRow,
      nextRows,
    };
  }
  const editableRow = [...sourceRow];
  const resolvedNextRows = nextRows === rows ? [...rows] : nextRows;
  resolvedNextRows[edit.rowIndex] = editableRow;
  touchedRows.set(edit.rowIndex, editableRow);
  return {
    editableRow,
    nextRows: resolvedNextRows,
  };
}

export function applySpreadsheetCellUpdates({
  rows,
  columnCount,
  edits,
}: {
  rows: string[][];
  columnCount: number;
  edits: readonly SpreadsheetCellEdit[];
}): string[][] {
  if (edits.length === 0) {
    return rows;
  }
  let nextRows = rows;
  let didMutate = false;
  const touchedRows = new Map<number, string[]>();
  for (const edit of edits) {
    if (!isSpreadsheetCellEditWithinBounds(edit, columnCount)) {
      continue;
    }
    const sourceRow = resolveSpreadsheetSourceRow({
      columnCount,
      edit,
      rows,
      touchedRows,
    });
    if ((sourceRow[edit.columnIndex] ?? "") === edit.value) {
      continue;
    }
    const ensuredRow = ensureSpreadsheetEditableRow({
      edit,
      nextRows,
      rows,
      sourceRow,
      touchedRows,
    });
    const editableRow = ensuredRow.editableRow;
    nextRows = ensuredRow.nextRows;
    editableRow[edit.columnIndex] = edit.value;
    didMutate = true;
  }
  return didMutate ? nextRows : rows;
}

function compareSpreadsheetCellValues(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  const trimmedA = a.trim();
  const trimmedB = b.trim();
  if (trimmedA === "" && trimmedB !== "") {
    return 1;
  }
  if (trimmedB === "" && trimmedA !== "") {
    return -1;
  }
  const numericA = Number(trimmedA);
  const numericB = Number(trimmedB);
  if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
    return numericA - numericB;
  }
  return trimmedA.localeCompare(trimmedB, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function getFilteredSortedSpreadsheetRowIndexes({
  baseIndexes,
  rows,
  columnCount,
  normalizedFilter,
  sortState,
}: {
  baseIndexes: readonly number[];
  rows: readonly string[][];
  columnCount: number;
  normalizedFilter: string;
  sortState: SpreadsheetSortState | null;
}): number[] {
  const filteredIndexes =
    normalizedFilter.length === 0
      ? [...baseIndexes]
      : baseIndexes.filter((rowIndex) => {
          const row = rows[rowIndex] ?? [];
          for (
            let columnIndex = 0;
            columnIndex < columnCount;
            columnIndex += 1
          ) {
            const cellValue = (row[columnIndex] ?? "").toLowerCase();
            if (cellValue.includes(normalizedFilter)) {
              return true;
            }
          }
          return false;
        });
  if (!sortState) {
    return filteredIndexes;
  }
  filteredIndexes.sort((leftIndex, rightIndex) => {
    const leftRow = rows[leftIndex] ?? [];
    const rightRow = rows[rightIndex] ?? [];
    const leftValue = leftRow[sortState.columnIndex] ?? "";
    const rightValue = rightRow[sortState.columnIndex] ?? "";
    const comparison = compareSpreadsheetCellValues(leftValue, rightValue);
    return sortState.direction === "asc" ? comparison : -comparison;
  });
  return filteredIndexes;
}
