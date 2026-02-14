import {
  DataEditor,
  GridCellKind,
  type EditableGridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Theme,
} from "@glideapps/glide-data-grid";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiColumns,
  FiFilter,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiX,
} from "react-icons/fi";
import { List, useListRef } from "react-window";
import { useLocalStorage } from "state/definitions";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_file_browser_file_content,
  route_get_folder_contents,
  route_write_file_browser_file_content,
} from "utils/generatedEndpoints";
import {
  getSpreadsheetColumnLabel,
  isSpreadsheetPath,
  parseSpreadsheetBytes,
  serializeSpreadsheetBytes,
} from "utils/spreadsheet";

export const SPREADSHEET_HEADER_HEIGHT = 24;
export const SPREADSHEET_ROW_HEIGHT = 22;
export const SPREADSHEET_INDEX_COLUMN_WIDTH = 36;
export const SPREADSHEET_DATA_COLUMN_WIDTH = 88;
export const SPREADSHEET_COMFORTABLE_HEADER_HEIGHT = 28;
export const SPREADSHEET_COMFORTABLE_ROW_HEIGHT = 26;
export const SPREADSHEET_COMFORTABLE_INDEX_COLUMN_WIDTH = 44;
export const SPREADSHEET_COMFORTABLE_DATA_COLUMN_WIDTH = 108;
const SPREADSHEET_AUTO_RELOAD_INTERVAL_MS = 2000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const SPREADSHEET_GLIDE_MAX_DENSITY_MULTIPLIER = 3;

type SpreadsheetDraft = {
  path: string;
  sheetName: string;
  rows: string[][];
  rowCount: number;
  columnCount: number;
  mtime: number;
};

type SpreadsheetRowData = {
  rows: string[][];
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

export type SpreadsheetSelectedFile = {
  name: string;
  fullPath: string;
};

export type SpreadsheetGridMode = "dom" | "glide";
export type SpreadsheetDensityMode = "compact" | "comfortable";

type SpreadsheetDensityMetrics = {
  headerHeight: number;
  rowHeight: number;
  indexColumnWidth: number;
  dataColumnWidth: number;
};

type SpreadsheetSortState = {
  columnIndex: number;
  direction: "asc" | "desc";
};

function getPathFolderAndName(
  fullPath: string,
): { folderPath: string; fileName: string } | null {
  const normalizedPath = fullPath.replace(/\\/g, "/");
  const separatorIndex = normalizedPath.lastIndexOf("/");
  if (separatorIndex <= 0 || separatorIndex >= normalizedPath.length - 1) {
    return null;
  }
  return {
    folderPath: normalizedPath.slice(0, separatorIndex),
    fileName: normalizedPath.slice(separatorIndex + 1),
  };
}

export function getSpreadsheetDensityMetrics(
  density: SpreadsheetDensityMode,
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
  density: SpreadsheetDensityMode = "compact",
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
  density: SpreadsheetDensityMode = "compact",
): number {
  const metrics = getSpreadsheetDensityMetrics(density);
  return (
    (showRowNumbers ? metrics.indexColumnWidth : 0) +
    columnCount * metrics.dataColumnWidth
  );
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64ToBytes(contentBase64: string): Uint8Array {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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

function getSpreadsheetCellAddress(
  columnIndex: number,
  rowIndex: number,
): string {
  return `${getSpreadsheetColumnLabel(Math.max(0, columnIndex))}${Math.max(1, rowIndex + 1)}`;
}

function formatSpreadsheetSelectionSummary(
  selection: GridSelection | undefined,
): string {
  const currentRange = selection?.current?.range;
  if (!currentRange) {
    return "No selection";
  }
  const startColumn = Math.max(0, currentRange.x);
  const startRow = Math.max(0, currentRange.y);
  const endColumn = Math.max(
    startColumn,
    currentRange.x + Math.max(1, currentRange.width) - 1,
  );
  const endRow = Math.max(
    startRow,
    currentRange.y + Math.max(1, currentRange.height) - 1,
  );
  const baseSummary =
    startColumn === endColumn && startRow === endRow
      ? `Selected ${getSpreadsheetCellAddress(startColumn, startRow)}`
      : `Selected ${getSpreadsheetCellAddress(startColumn, startRow)}:${getSpreadsheetCellAddress(endColumn, endRow)}`;
  const extraRanges = selection?.current?.rangeStack?.length ?? 0;
  if (extraRanges <= 0) {
    return baseSummary;
  }
  return `${baseSummary} (+${extraRanges} range${extraRanges === 1 ? "" : "s"})`;
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
  rows,
  columnCount,
  showRowNumbers,
  readOnly,
  gridTemplateColumns,
  onChangeCell,
}: SpreadsheetRowProps) {
  const row = rows[index] ?? [];
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

export function FileBrowserSpreadsheetEditor({
  selectedFile,
  gridMode = "dom",
  flowZoom = 1,
  readOnly = false,
  showRowNumbers = true,
  density = "compact",
  autoReloadOnExternalChange = false,
}: {
  selectedFile: SpreadsheetSelectedFile | null;
  gridMode?: SpreadsheetGridMode;
  flowZoom?: number;
  readOnly?: boolean;
  showRowNumbers?: boolean;
  density?: SpreadsheetDensityMode;
  autoReloadOnExternalChange?: boolean;
}) {
  const darkMode = useLocalStorage((state) => state.darkMode);
  const [sheet, setSheet] = useState<SpreadsheetDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [hasExternalDiskChange, setHasExternalDiskChange] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [sortState, setSortState] = useState<SpreadsheetSortState | null>(null);
  const [gridSelection, setGridSelection] = useState<GridSelection | undefined>(
    undefined,
  );
  const [selectionSummary, setSelectionSummary] =
    useState<string>("No selection");
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const [viewportSize, setViewportSize] = useState({ width: 400, height: 300 });
  const listRef = useListRef();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const selectedPath = selectedFile?.fullPath ?? null;
  const selectedName = selectedFile?.name ?? "";
  const densityMetrics = useMemo(
    () => getSpreadsheetDensityMetrics(density),
    [density],
  );
  const glideTheme = useMemo<Partial<Theme>>(
    () =>
      darkMode
        ? {
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
            bgHeader: "hsl(220, 26%, 14%)",
            bgHeaderHasFocus: "hsl(219, 26%, 18.5%)",
            bgHeaderHovered: "hsl(219, 26%, 23%)",
            bgBubble: "hsl(219, 26%, 23%)",
            bgBubbleSelected: "hsl(220, 26%, 14%)",
            bgSearchResult: "rgba(59, 130, 246, 0.15)",
            borderColor: "hsl(219, 26%, 23%)",
            drilldownBorder: "hsl(219, 26%, 23%)",
            linkColor: "hsl(220, 25%, 67%)",
            cellHorizontalPadding: 6,
            cellVerticalPadding: 2,
            headerFontStyle: "600 11px",
            baseFontStyle: "11px",
            markerFontStyle: "10px",
            fontFamily: "Inter, sans-serif",
            editorFontSize: "11px",
            lineHeight: 1.3,
          }
        : {
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
            bgHeader: "hsl(219, 24.5%, 83%)",
            bgHeaderHasFocus: "hsl(219, 25%, 77%)",
            bgHeaderHovered: "hsl(219, 24%, 89%)",
            bgBubble: "hsl(219, 24%, 89%)",
            bgBubbleSelected: "hsl(222, 28%, 95%)",
            bgSearchResult: "rgba(59, 130, 246, 0.1)",
            borderColor: "hsl(219, 25%, 77%)",
            drilldownBorder: "hsl(219, 25%, 77%)",
            linkColor: "hsl(219, 25%, 34%)",
            cellHorizontalPadding: 6,
            cellVerticalPadding: 2,
            headerFontStyle: "600 11px",
            baseFontStyle: "11px",
            markerFontStyle: "10px",
            fontFamily: "Inter, sans-serif",
            editorFontSize: "11px",
            lineHeight: 1.3,
          },
    [darkMode],
  );

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const first = entries[0];
      if (!first) {
        return;
      }
      setViewportSize({
        width: Math.max(1, first.contentRect.width),
        height: Math.max(1, first.contentRect.height),
      });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  const loadFile = useCallback(async (path: string) => {
    setIsLoading(true);
    setErrorText(null);
    setStatusText(null);
    const response = await route_get_file_browser_file_content({
      path,
      maxBytes: MAX_FILE_BYTES,
    });
    if (!res200(response)) {
      const detail = getErrorDetail(response.data);
      setErrorText(detail ?? "Failed to load spreadsheet file.");
      setIsLoading(false);
      return;
    }

    const bytes = decodeBase64ToBytes(response.data.contentBase64);
    const parsed = parseSpreadsheetBytes(path, bytes);
    setSheet({
      path,
      sheetName: parsed.sheetName,
      rows: parsed.rows,
      rowCount: parsed.rowCount,
      columnCount: parsed.columnCount,
      mtime: response.data.mtime,
    });
    setIsDirty(false);
    setHasExternalDiskChange(false);
    setFilterQuery("");
    setSortState(null);
    setColumnWidths({});
    setGridSelection(undefined);
    setSelectionSummary("No selection");
    setIsLoading(false);
    listRef.current?.scrollToRow({ index: 0, align: "start" });
  }, []);

  useEffect(() => {
    if (!selectedPath) {
      setSheet(null);
      setIsDirty(false);
      setHasExternalDiskChange(false);
      setStatusText(null);
      setErrorText(null);
      setGridSelection(undefined);
      setSelectionSummary("No selection");
      return;
    }
    if (!isSpreadsheetPath(selectedPath)) {
      setSheet(null);
      setIsDirty(false);
      setHasExternalDiskChange(false);
      setStatusText(null);
      setErrorText(null);
      setGridSelection(undefined);
      setSelectionSummary("No selection");
      return;
    }
    void loadFile(selectedPath);
  }, [loadFile, selectedPath]);

  useEffect(() => {
    if (
      !autoReloadOnExternalChange ||
      !sheet ||
      !selectedPath ||
      isLoading ||
      isSaving
    ) {
      return;
    }
    const folderInfo = getPathFolderAndName(selectedPath);
    if (!folderInfo) {
      return;
    }
    const loadedMtime = sheet.mtime;
    let isCancelled = false;
    const pollForExternalChanges = async () => {
      const response = await route_get_folder_contents({
        folderPath: folderInfo.folderPath,
        includeMtime: true,
        includeHidden: true,
        maxEntries: 10000,
      });
      if (!res200(response) || isCancelled) {
        return;
      }
      const currentEntry = response.data.find(
        (entry) =>
          entry.type === "file" &&
          entry.name === folderInfo.fileName &&
          typeof entry.mtime === "number",
      );
      if (!currentEntry || typeof currentEntry.mtime !== "number") {
        return;
      }
      if (currentEntry.mtime === loadedMtime) {
        setHasExternalDiskChange(false);
        return;
      }
      setHasExternalDiskChange(true);
      if (isDirty) {
        setStatusText("File changed on disk. Save to overwrite or reload.");
        return;
      }
      await loadFile(selectedPath);
      if (!isCancelled) {
        setStatusText("Reloaded from disk.");
      }
    };

    void pollForExternalChanges();
    const timer = window.setInterval(() => {
      void pollForExternalChanges();
    }, SPREADSHEET_AUTO_RELOAD_INTERVAL_MS);
    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [
    autoReloadOnExternalChange,
    isDirty,
    isLoading,
    isSaving,
    loadFile,
    selectedPath,
    sheet?.mtime,
  ]);

  const displayedRowIndexes = useMemo(() => {
    if (!sheet) {
      return [];
    }
    const baseIndexes = Array.from(
      { length: sheet.rowCount },
      (_value, index) => index,
    );
    const normalizedFilter = filterQuery.trim().toLowerCase();
    const filteredIndexes =
      normalizedFilter.length === 0
        ? baseIndexes
        : baseIndexes.filter((rowIndex) => {
            const row = sheet.rows[rowIndex] ?? [];
            for (
              let columnIndex = 0;
              columnIndex < sheet.columnCount;
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
    const sorted = [...filteredIndexes];
    sorted.sort((leftIndex, rightIndex) => {
      const leftRow = sheet.rows[leftIndex] ?? [];
      const rightRow = sheet.rows[rightIndex] ?? [];
      const leftValue = leftRow[sortState.columnIndex] ?? "";
      const rightValue = rightRow[sortState.columnIndex] ?? "";
      const comparison = compareSpreadsheetCellValues(leftValue, rightValue);
      return sortState.direction === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [filterQuery, sheet, sortState]);

  const displayedRows = useMemo(() => {
    if (!sheet) {
      return [];
    }
    return displayedRowIndexes.map((rowIndex) => sheet.rows[rowIndex] ?? []);
  }, [displayedRowIndexes, sheet]);

  const displayedRowCount = displayedRowIndexes.length;

  const onChangeCell = useCallback(
    (rowIndex: number, columnIndex: number, value: string) => {
      if (readOnly) {
        return;
      }
      const sourceRowIndex = displayedRowIndexes[rowIndex];
      if (sourceRowIndex === undefined) {
        return;
      }
      setSheet((prev) => {
        if (!prev) {
          return prev;
        }
        const nextRows = prev.rows.map((row) =>
          withColumnCount([...row], prev.columnCount),
        );
        const existing = nextRows[sourceRowIndex] ?? [];
        const nextRow = [...existing];
        nextRow[columnIndex] = value;
        nextRows[sourceRowIndex] = withColumnCount(nextRow, prev.columnCount);
        return {
          ...prev,
          rows: nextRows,
        };
      });
      setIsDirty(true);
      setStatusText(null);
    },
    [displayedRowIndexes, readOnly],
  );

  const onGridSelectionChange = useCallback((selection: GridSelection) => {
    setGridSelection(selection);
    setSelectionSummary(formatSpreadsheetSelectionSummary(selection));
  }, []);

  const onCellsEdited = useCallback(
    (
      newValues: readonly {
        location: Item;
        value: EditableGridCell;
      }[],
    ) => {
      setSheet((prev) => {
        if (!prev) {
          return prev;
        }
        const nextRows = prev.rows.map((row) =>
          withColumnCount([...row], prev.columnCount),
        );
        for (const edit of newValues) {
          if (edit.value.kind !== GridCellKind.Text) {
            continue;
          }
          const [columnIndex, visibleRowIndex] = edit.location;
          const sourceRowIndex = displayedRowIndexes[visibleRowIndex];
          if (
            sourceRowIndex === undefined ||
            sourceRowIndex < 0 ||
            sourceRowIndex >= prev.rowCount ||
            columnIndex < 0 ||
            columnIndex >= prev.columnCount
          ) {
            continue;
          }
          const nextRow = [
            ...(nextRows[sourceRowIndex] ??
              Array.from({ length: prev.columnCount }, () => "")),
          ];
          nextRow[columnIndex] = edit.value.data;
          nextRows[sourceRowIndex] = withColumnCount(nextRow, prev.columnCount);
        }
        return {
          ...prev,
          rows: nextRows,
        };
      });
      setIsDirty(true);
      setStatusText(null);
      return true;
    },
    [displayedRowIndexes],
  );

  const onDeleteSelection = useCallback(
    (selection: GridSelection) => {
      if (readOnly) {
        return false;
      }
      const range = selection.current?.range;
      if (!range) {
        return false;
      }
      setSheet((prev) => {
        if (!prev) {
          return prev;
        }
        const nextRows = prev.rows.map((row) =>
          withColumnCount([...row], prev.columnCount),
        );
        const xStart = Math.max(0, range.x);
        const yStart = Math.max(0, range.y);
        const xEnd = Math.min(prev.columnCount, range.x + range.width);
        const yEnd = Math.min(
          displayedRowIndexes.length,
          range.y + range.height,
        );
        for (
          let visibleRowIndex = yStart;
          visibleRowIndex < yEnd;
          visibleRowIndex += 1
        ) {
          const sourceRowIndex = displayedRowIndexes[visibleRowIndex];
          if (sourceRowIndex === undefined) {
            continue;
          }
          const nextRow = [
            ...(nextRows[sourceRowIndex] ??
              Array.from({ length: prev.columnCount }, () => "")),
          ];
          for (let columnIndex = xStart; columnIndex < xEnd; columnIndex += 1) {
            nextRow[columnIndex] = "";
          }
          nextRows[sourceRowIndex] = nextRow;
        }
        return {
          ...prev,
          rows: nextRows,
        };
      });
      setIsDirty(true);
      setStatusText(null);
      return false;
    },
    [displayedRowIndexes, readOnly],
  );

  const onAddRow = useCallback(() => {
    if (readOnly) {
      return;
    }
    setSheet((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        rows: [
          ...prev.rows,
          Array.from({ length: prev.columnCount }, () => ""),
        ],
        rowCount: prev.rowCount + 1,
      };
    });
    setIsDirty(true);
    setStatusText(null);
  }, [readOnly]);

  const onAddColumn = useCallback(() => {
    if (readOnly) {
      return;
    }
    setSheet((prev) => {
      if (!prev) {
        return prev;
      }
      const nextColumnCount = prev.columnCount + 1;
      return {
        ...prev,
        columnCount: nextColumnCount,
        rows: prev.rows.map((row) => [...row, ""]),
      };
    });
    setIsDirty(true);
    setStatusText(null);
  }, [readOnly]);

  const onSave = useCallback(async () => {
    if (!sheet || readOnly) {
      return;
    }
    setIsSaving(true);
    setErrorText(null);
    setStatusText(null);
    const bytes = serializeSpreadsheetBytes(
      sheet.path,
      sheet.sheetName,
      sheet.rows,
    );
    const response = await route_write_file_browser_file_content({
      path: sheet.path,
      contentBase64: encodeBytesToBase64(bytes),
      expectedMtime: sheet.mtime,
    });
    if (!res200(response)) {
      const detail = getErrorDetail(response.data);
      setErrorText(detail ?? "Failed to save spreadsheet file.");
      setIsSaving(false);
      return;
    }
    setSheet((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        mtime: response.data.mtime,
      };
    });
    setStatusText("Saved.");
    setIsDirty(false);
    setHasExternalDiskChange(false);
    setIsSaving(false);
  }, [readOnly, sheet]);

  const onReload = useCallback(() => {
    if (!selectedPath || !isSpreadsheetPath(selectedPath)) {
      return;
    }
    void loadFile(selectedPath);
  }, [loadFile, selectedPath]);

  const onToggleSort = useCallback((columnIndex: number) => {
    setSortState((prev) => {
      if (!prev || prev.columnIndex !== columnIndex) {
        return { columnIndex, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { columnIndex, direction: "desc" };
      }
      return null;
    });
  }, []);

  const gridTemplateColumns = useMemo(
    () =>
      getSpreadsheetGridTemplateColumns(
        Math.max(0, sheet?.columnCount ?? 0),
        showRowNumbers,
        density,
      ),
    [density, sheet?.columnCount, showRowNumbers],
  );
  const sheetWidth = useMemo(
    () =>
      getSpreadsheetGridWidth(
        Math.max(0, sheet?.columnCount ?? 0),
        showRowNumbers,
        density,
      ),
    [density, sheet?.columnCount, showRowNumbers],
  );
  const listWidth = Math.max(viewportSize.width, sheetWidth);
  const densityMultiplier = useMemo(
    () => getSpreadsheetGlideDensityMultiplier(flowZoom),
    [flowZoom],
  );
  const glideViewportWidth = Math.max(1, viewportSize.width);
  const glideViewportHeight = Math.max(
    1,
    viewportSize.height - densityMetrics.headerHeight,
  );
  const glideRenderWidth = Math.max(
    1,
    Math.round(glideViewportWidth * densityMultiplier),
  );
  const glideRenderHeight = Math.max(
    1,
    Math.round(glideViewportHeight * densityMultiplier),
  );
  const glideColumns = useMemo<readonly GridColumn[]>(() => {
    if (!sheet) {
      return [];
    }
    return Array.from({ length: sheet.columnCount }, (_, columnIndex) => ({
      id: `col-${columnIndex}`,
      title: `${getSpreadsheetColumnLabel(columnIndex)}${
        sortState && sortState.columnIndex === columnIndex
          ? sortState.direction === "asc"
            ? " ↑"
            : " ↓"
          : ""
      }`,
      width:
        (columnWidths[columnIndex] ?? densityMetrics.dataColumnWidth) *
        densityMultiplier,
      hasMenu: false,
      grow: 0,
    }));
  }, [
    columnWidths,
    densityMetrics.dataColumnWidth,
    densityMultiplier,
    sheet,
    sortState,
  ]);
  const getGlideCellContent = useCallback(
    ([columnIndex, visibleRowIndex]: Item) => {
      if (
        !sheet ||
        visibleRowIndex < 0 ||
        visibleRowIndex >= displayedRowCount
      ) {
        return {
          kind: GridCellKind.Loading,
          allowOverlay: false,
        };
      }
      const sourceRowIndex = displayedRowIndexes[visibleRowIndex];
      if (sourceRowIndex === undefined) {
        return {
          kind: GridCellKind.Loading,
          allowOverlay: false,
        };
      }
      const row = sheet.rows[sourceRowIndex] ?? [];
      const value = row[columnIndex] ?? "";
      return {
        kind: GridCellKind.Text,
        allowOverlay: true,
        displayData: value,
        data: value,
        readonly: readOnly || isSaving,
      };
    },
    [displayedRowCount, displayedRowIndexes, isSaving, readOnly, sheet],
  );
  const isGridEditable = !readOnly && !isSaving;

  if (!selectedPath) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-setta-300 bg-white/60 px-4 text-center text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-950/40 dark:text-setta-400">
        Drop a CSV/XLSX file from your OS or File Browser to preview and edit.
      </div>
    );
  }

  if (!isSpreadsheetPath(selectedPath)) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-setta-300 bg-white/60 px-4 text-center text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-950/40 dark:text-setta-400">
        Spreadsheet editing is available for `.csv`, `.tsv`, `.xls`, and `.xlsx`
        files.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-setta-200 bg-white/70 dark:border-setta-800 dark:bg-setta-950/50">
      <div className="flex items-center justify-between border-b border-setta-200 px-3 py-2 dark:border-setta-800">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-xs font-semibold text-setta-700 dark:text-setta-200">
              {selectedName}
            </p>
            {sheet ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="inline-flex shrink-0 items-center gap-1 text-[11px] text-setta-500 dark:text-setta-400">
                  <FiFilter size={12} />
                  Filter
                </div>
                <input
                  data-testid="spreadsheet-filter-input"
                  value={filterQuery}
                  onChange={(event) => setFilterQuery(event.target.value)}
                  className="min-w-0 max-w-[220px] flex-1 rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-700 outline-none focus-visible:border-blue-400 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                  placeholder="Filter rows"
                />
                <label className="shrink-0 text-[11px] text-setta-500 dark:text-setta-400">
                  Sort
                  <select
                    data-testid="spreadsheet-sort-column"
                    value={sortState ? String(sortState.columnIndex) : ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "") {
                        setSortState(null);
                        return;
                      }
                      const columnIndex = Number(value);
                      if (!Number.isFinite(columnIndex)) {
                        setSortState(null);
                        return;
                      }
                      setSortState({ columnIndex, direction: "asc" });
                    }}
                    className="ml-1 rounded border border-setta-300 bg-white px-1.5 py-1 text-[11px] text-setta-700 outline-none focus-visible:border-blue-400 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                  >
                    <option value="">None</option>
                    {Array.from(
                      { length: sheet.columnCount },
                      (_value, index) => (
                        <option key={`sort-${index}`} value={index}>
                          {getSpreadsheetColumnLabel(index)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  data-testid="spreadsheet-sort-direction"
                  className="shrink-0 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                  onClick={() =>
                    setSortState((prev) =>
                      prev
                        ? {
                            ...prev,
                            direction:
                              prev.direction === "asc" ? "desc" : "asc",
                          }
                        : prev,
                    )
                  }
                  disabled={!sortState}
                >
                  {sortState?.direction === "desc" ? "Desc" : "Asc"}
                </button>
                {(filterQuery.length > 0 || sortState) && (
                  <button
                    type="button"
                    data-testid="spreadsheet-clear-view"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                    onClick={() => {
                      setFilterQuery("");
                      setSortState(null);
                    }}
                  >
                    <FiX size={12} />
                    Clear
                  </button>
                )}
                <span
                  data-testid="spreadsheet-selection-summary"
                  className="ml-auto min-w-0 max-w-[220px] truncate text-right text-[11px] text-setta-500 dark:text-setta-400"
                  title={selectionSummary}
                >
                  {selectionSummary}
                </span>
              </div>
            ) : null}
          </div>
          {sheet && (
            <p className="text-[11px] text-setta-500 dark:text-setta-400">
              {displayedRowCount === sheet.rowCount
                ? `${sheet.rowCount} rows · ${sheet.columnCount} columns`
                : `${displayedRowCount} shown of ${sheet.rowCount} rows · ${sheet.columnCount} columns`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="spreadsheet-add-column"
            className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={onAddColumn}
            disabled={!sheet || isLoading || isSaving || readOnly}
          >
            <FiColumns size={12} />
            Column
          </button>
          <button
            type="button"
            data-testid="spreadsheet-add-row"
            className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={onAddRow}
            disabled={!sheet || isLoading || isSaving || readOnly}
          >
            <FiPlus size={12} />
            Row
          </button>
          <button
            type="button"
            data-testid="spreadsheet-reload"
            className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={onReload}
            disabled={!sheet || isLoading || isSaving}
          >
            <FiRefreshCw size={12} />
            Reload
          </button>
          <button
            type="button"
            data-testid="spreadsheet-save"
            className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
            onClick={onSave}
            disabled={!sheet || isLoading || isSaving || readOnly || !isDirty}
          >
            <FiSave size={12} />
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {(statusText ||
        errorText ||
        isDirty ||
        hasExternalDiskChange ||
        readOnly) && (
        <div className="border-b border-setta-200 px-3 py-1 text-[11px] dark:border-setta-800">
          {readOnly ? (
            <span className="mr-2 text-setta-500 dark:text-setta-400">
              Read-only.
            </span>
          ) : null}
          {isDirty ? (
            <span className="mr-2 text-amber-600 dark:text-amber-300">
              Unsaved edits.
            </span>
          ) : null}
          {hasExternalDiskChange ? (
            <span className="mr-2 text-amber-600 dark:text-amber-300">
              File changed on disk.
            </span>
          ) : null}
          {statusText && <span className="text-emerald-600">{statusText}</span>}
          {errorText && <span className="text-red-500">{errorText}</span>}
        </div>
      )}
      <div
        ref={viewportRef}
        className={`${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} nodrag min-h-0 flex-1 overflow-hidden`}
      >
        {isLoading && (
          <div className="flex h-full items-center justify-center text-xs text-setta-500 dark:text-setta-400">
            Loading spreadsheet…
          </div>
        )}
        {!isLoading && !sheet && (
          <div className="flex h-full items-center justify-center text-xs text-setta-500 dark:text-setta-400">
            Unable to load spreadsheet content.
          </div>
        )}
        {!isLoading && sheet && (
          <div className="h-full overflow-hidden">
            {gridMode === "glide" ? (
              <div
                data-testid="spreadsheet-glide-grid"
                className={`${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} nodrag h-full overflow-hidden bg-setta-50/80 [scrollbar-gutter:stable] dark:bg-setta-950/80`}
              >
                <div
                  style={{
                    width: glideRenderWidth,
                    height: glideRenderHeight,
                    zoom: 1 / densityMultiplier,
                    transformOrigin: "top left",
                  }}
                >
                  <DataEditor
                    width={glideRenderWidth}
                    height={glideRenderHeight}
                    rows={displayedRowCount}
                    columns={glideColumns}
                    rowMarkers={
                      showRowNumbers
                        ? {
                            kind: "number",
                            width:
                              densityMetrics.indexColumnWidth *
                              densityMultiplier,
                          }
                        : undefined
                    }
                    getCellContent={getGlideCellContent}
                    getCellsForSelection
                    rowHeight={Math.round(
                      densityMetrics.rowHeight * densityMultiplier,
                    )}
                    headerHeight={Math.round(
                      densityMetrics.headerHeight * densityMultiplier,
                    )}
                    smoothScrollX
                    smoothScrollY
                    fillHandle={isGridEditable}
                    onDelete={isGridEditable ? onDeleteSelection : undefined}
                    onCellEdited={
                      isGridEditable
                        ? (cell, newValue) =>
                            onCellsEdited([{ location: cell, value: newValue }])
                        : undefined
                    }
                    onCellsEdited={isGridEditable ? onCellsEdited : undefined}
                    onColumnResize={(_column, newSize, colIndex) => {
                      setColumnWidths((prev) => ({
                        ...prev,
                        [colIndex]: Math.max(
                          48,
                          Math.round(newSize / densityMultiplier),
                        ),
                      }));
                    }}
                    onPaste={isGridEditable ? true : undefined}
                    gridSelection={gridSelection}
                    onGridSelectionChange={onGridSelectionChange}
                    onHeaderClicked={onToggleSort}
                    drawFocusRing={true}
                    rangeSelect="multi-rect"
                    rangeSelectionBlending="mixed"
                    editOnType
                    cellActivationBehavior="single-click"
                    theme={glideTheme}
                    experimental={{
                      renderStrategy: "single-buffer",
                      enableFirefoxRescaling: true,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div
                data-testid="spreadsheet-grid-scroll"
                className={`${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} nodrag h-full overflow-x-auto overflow-y-hidden bg-setta-50/80 [scrollbar-gutter:stable] dark:bg-setta-950/80`}
              >
                <div className="min-h-full" style={{ minWidth: listWidth }}>
                  <div
                    className="grid border-b border-setta-200 bg-setta-50 text-[10px] font-semibold text-setta-500 dark:border-setta-800 dark:bg-setta-900/70 dark:text-setta-400"
                    style={{
                      gridTemplateColumns,
                      width: listWidth,
                    }}
                  >
                    {showRowNumbers ? (
                      <div
                        className="flex items-center justify-center border-r border-setta-200 dark:border-setta-800"
                        style={{ height: densityMetrics.headerHeight }}
                      >
                        #
                      </div>
                    ) : null}
                    {Array.from({ length: sheet.columnCount }, (_, index) => (
                      <div
                        key={`header-${index}`}
                        className="flex items-center border-r border-setta-200 px-1.5 dark:border-setta-800"
                        style={{ height: densityMetrics.headerHeight }}
                      >
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-setta-500 transition-colors hover:text-setta-700 dark:text-setta-400 dark:hover:text-setta-200"
                          onClick={() => onToggleSort(index)}
                        >
                          {getSpreadsheetColumnLabel(index)}
                          {sortState && sortState.columnIndex === index
                            ? sortState.direction === "asc"
                              ? "↑"
                              : "↓"
                            : ""}
                        </button>
                      </div>
                    ))}
                  </div>
                  <List
                    listRef={listRef}
                    rowComponent={SpreadsheetRow}
                    rowCount={displayedRowCount}
                    rowHeight={densityMetrics.rowHeight}
                    rowProps={{
                      rows: displayedRows,
                      columnCount: sheet.columnCount,
                      showRowNumbers,
                      readOnly,
                      gridTemplateColumns,
                      onChangeCell,
                    }}
                    style={{
                      width: listWidth,
                      height: Math.max(
                        1,
                        viewportSize.height - densityMetrics.headerHeight,
                      ),
                      overflowX: "hidden",
                      overflowY: "scroll",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
