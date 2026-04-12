import type { Theme } from "@glideapps/glide-data-grid";
import type { CSSProperties } from "react";
import type { SpreadsheetGridDensity } from "utils/generatedTypes";

const SPREADSHEET_HEADER_HEIGHT = 24;
const SPREADSHEET_ROW_HEIGHT = 22;
const SPREADSHEET_INDEX_COLUMN_WIDTH = 36;
const SPREADSHEET_DATA_COLUMN_WIDTH = 88;
export const SPREADSHEET_FILTER_INPUT_CLASS_NAME =
  "min-w-0 flex-1 cursor-text border-solid border-transparent bg-transparent py-1 pl-6 pr-2 text-xs text-setta-700 placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:text-setta-300 dark:placeholder-setta-600";
const SPREADSHEET_COMFORTABLE_HEADER_HEIGHT = 28;
const SPREADSHEET_COMFORTABLE_ROW_HEIGHT = 26;
const SPREADSHEET_COMFORTABLE_INDEX_COLUMN_WIDTH = 44;
const SPREADSHEET_COMFORTABLE_DATA_COLUMN_WIDTH = 108;
const SPREADSHEET_GLIDE_MAX_DENSITY_MULTIPLIER = 6;

export type SpreadsheetCellEdit = {
  rowIndex: number;
  columnIndex: number;
  value: string;
};

type SpreadsheetRowData = {
  sourceRows: string[][];
  displayedRowIndexes: number[];
  columnCount: number;
  showRowNumbers: boolean;
  readOnly: boolean;
  gridTemplateColumns: string;
  onChangeCell: (rowIndex: number, columnIndex: number, value: string) => void;
};

type SpreadsheetRowProps = SpreadsheetRowData & {
  index: number;
  style: CSSProperties;
};

export type SpreadsheetDensityMetrics = {
  headerHeight: number;
  rowHeight: number;
  indexColumnWidth: number;
  dataColumnWidth: number;
};

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

export function getSpreadsheetGlideTheme({
  darkMode,
  densityMultiplier,
}: {
  darkMode: boolean;
  densityMultiplier: number;
}): Partial<Theme> {
  const baseFontPx = 11 * densityMultiplier;
  const markerFontPx = 10 * densityMultiplier;
  const commonTypography = {
    cellHorizontalPadding: 6 * densityMultiplier,
    cellVerticalPadding: 2 * densityMultiplier,
    headerFontStyle: `600 ${baseFontPx}px`,
    baseFontStyle: `${baseFontPx}px`,
    markerFontStyle: `${markerFontPx}px`,
    fontFamily: "Inter, sans-serif",
    editorFontSize: `${baseFontPx}px`,
    lineHeight: 1.3,
  };
  if (darkMode) {
    return {
      accentColor: "hsl(220, 25%, 57%)",
      accentFg: "hsl(222, 28%, 95%)",
      accentLight: "rgba(59, 130, 246, 0.32)",
      textDark: "hsl(219, 24%, 89%)",
      textMedium: "hsl(220, 25%, 67%)",
      textLight: "hsl(220, 25%, 57%)",
      textBubble: "hsl(219, 24%, 89%)",
      bgIconHeader: "hsl(220, 25%, 57%)",
      fgIconHeader: "hsl(220, 27%, 6%)",
      textHeader: "hsl(219, 24%, 89%)",
      textHeaderSelected: "hsl(222, 28%, 95%)",
      bgCell: "hsl(220, 25%, 8.5%)",
      bgCellMedium: "hsl(220, 25%, 11%)",
      bgHeader: "#1f2737",
      bgHeaderHasFocus: "#26314a",
      bgHeaderHovered: "#303d56",
      bgBubble: "hsl(219, 26%, 23%)",
      bgBubbleSelected: "hsl(220, 26%, 14%)",
      bgSearchResult: "rgba(59, 130, 246, 0.15)",
      borderColor: "hsl(219, 26%, 23%)",
      drilldownBorder: "hsl(219, 26%, 23%)",
      linkColor: "hsl(220, 25%, 67%)",
      ...commonTypography,
    };
  }
  return {
    accentColor: "hsl(220, 25%, 45%)",
    accentFg: "hsl(222, 28%, 95%)",
    accentLight: "rgba(59, 130, 246, 0.24)",
    textDark: "hsl(220, 27%, 6%)",
    textMedium: "hsl(220, 25%, 45%)",
    textLight: "hsl(220, 25%, 57%)",
    textBubble: "hsl(220, 27%, 6%)",
    bgIconHeader: "hsl(220, 25%, 45%)",
    fgIconHeader: "hsl(222, 28%, 95%)",
    textHeader: "hsl(219, 26%, 23%)",
    textHeaderSelected: "hsl(222, 28%, 95%)",
    bgCell: "hsl(222, 28%, 95%)",
    bgCellMedium: "hsl(219, 24%, 89%)",
    bgHeader: "#d3dbe8",
    bgHeaderHasFocus: "#c5d0e4",
    bgHeaderHovered: "#dfe5ef",
    bgBubble: "hsl(219, 24%, 89%)",
    bgBubbleSelected: "hsl(222, 28%, 95%)",
    bgSearchResult: "rgba(59, 130, 246, 0.1)",
    borderColor: "hsl(219, 25%, 77%)",
    drilldownBorder: "hsl(219, 25%, 77%)",
    linkColor: "hsl(219, 25%, 34%)",
    ...commonTypography,
  };
}

export function getSpreadsheetDensityMetrics(
  density: SpreadsheetGridDensity,
): SpreadsheetDensityMetrics {
  if (density === "comfortable") {
    return {
      headerHeight: SPREADSHEET_COMFORTABLE_HEADER_HEIGHT,
      rowHeight: SPREADSHEET_COMFORTABLE_ROW_HEIGHT,
      indexColumnWidth: SPREADSHEET_COMFORTABLE_INDEX_COLUMN_WIDTH,
      dataColumnWidth: SPREADSHEET_COMFORTABLE_DATA_COLUMN_WIDTH,
    };
  }
  return {
    headerHeight: SPREADSHEET_HEADER_HEIGHT,
    rowHeight: SPREADSHEET_ROW_HEIGHT,
    indexColumnWidth: SPREADSHEET_INDEX_COLUMN_WIDTH,
    dataColumnWidth: SPREADSHEET_DATA_COLUMN_WIDTH,
  };
}

export function getSpreadsheetGridTemplateColumns(
  columnCount: number,
  showRowNumbers = true,
  density: SpreadsheetGridDensity = "compact",
): string {
  const metrics = getSpreadsheetDensityMetrics(density);
  if (!showRowNumbers) {
    return `repeat(${columnCount}, ${metrics.dataColumnWidth}px)`;
  }
  return `${metrics.indexColumnWidth}px repeat(${columnCount}, ${metrics.dataColumnWidth}px)`;
}

export function getSpreadsheetGridWidth(
  columnCount: number,
  showRowNumbers = true,
  density: SpreadsheetGridDensity = "compact",
): number {
  const metrics = getSpreadsheetDensityMetrics(density);
  return (
    (showRowNumbers ? metrics.indexColumnWidth : 0) +
    columnCount * metrics.dataColumnWidth
  );
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

export function getSpreadsheetGlideDensityMultiplier(flowZoom: number): number {
  const safeZoom = flowZoom > 0 ? flowZoom : 1;
  const desiredMultiplier =
    safeZoom >= 1 ? safeZoom : 1 / Math.max(0.01, safeZoom);
  return Math.min(
    SPREADSHEET_GLIDE_MAX_DENSITY_MULTIPLIER,
    Math.max(1, desiredMultiplier),
  );
}

export function SpreadsheetRow({
  index,
  style,
  sourceRows,
  displayedRowIndexes,
  columnCount,
  showRowNumbers,
  readOnly,
  gridTemplateColumns,
  onChangeCell,
}: SpreadsheetRowProps) {
  const sourceRowIndex = displayedRowIndexes[index];
  const row =
    sourceRowIndex === undefined ? [] : sourceRows[sourceRowIndex] ?? [];
  return (
    <div
      className="grid overflow-hidden border-b border-setta-200 bg-white text-[10px] dark:border-setta-800 dark:bg-setta-950/70"
      style={{
        ...style,
        gridTemplateColumns,
      }}
    >
      {showRowNumbers ? (
        <div className="flex h-full items-center justify-center border-r border-setta-200 px-1 text-[9px] font-medium text-setta-500 dark:border-setta-800 dark:text-setta-400">
          {index + 1}
        </div>
      ) : null}
      {Array.from({ length: columnCount }, (_, columnIndex) => {
        const value = row[columnIndex] ?? "";
        return (
          <div
            key={`cell-${index}-${columnIndex}`}
            className="min-w-0 overflow-hidden border-r border-setta-200 dark:border-setta-800"
          >
            <input
              value={value}
              onChange={(event) =>
                onChangeCell(index, columnIndex, event.target.value)
              }
              readOnly={readOnly}
              disabled={readOnly}
              data-spreadsheet-cell={`${index}:${columnIndex}`}
              aria-label={`Cell ${index + 1}-${columnIndex + 1}`}
              className="box-border h-full w-full min-w-0 bg-transparent px-1.5 text-[10px] leading-tight text-setta-800 outline-none placeholder:text-setta-400 focus:bg-blue-50/70 dark:text-setta-100 dark:placeholder:text-setta-500 dark:focus:bg-blue-900/30"
            />
          </div>
        );
      })}
    </div>
  );
}
