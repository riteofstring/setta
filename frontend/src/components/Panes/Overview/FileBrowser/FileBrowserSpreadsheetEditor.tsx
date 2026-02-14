import {
  DataEditor,
  GridCellKind,
  type EditableGridCell,
  type GridColumn,
  type GridSelection,
  type Item,
} from "@glideapps/glide-data-grid";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiColumns, FiPlus, FiSave } from "react-icons/fi";
import { List, useListRef } from "react-window";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_file_browser_file_content,
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
const SPREADSHEET_GLIDE_MAX_DENSITY_MULTIPLIER = 2;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

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

export function getSpreadsheetGridTemplateColumns(columnCount: number): string {
  return `${SPREADSHEET_INDEX_COLUMN_WIDTH}px repeat(${columnCount}, ${SPREADSHEET_DATA_COLUMN_WIDTH}px)`;
}

export function getSpreadsheetGridWidth(columnCount: number): number {
  return (
    SPREADSHEET_INDEX_COLUMN_WIDTH + columnCount * SPREADSHEET_DATA_COLUMN_WIDTH
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

export function SpreadsheetRow({
  index,
  style,
  rows,
  columnCount,
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
      <div className="flex h-full items-center justify-center border-r border-setta-200 px-1 text-[9px] font-medium text-setta-500 dark:border-setta-800 dark:text-setta-400">
        {index + 1}
      </div>
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
}: {
  selectedFile: SpreadsheetSelectedFile | null;
  gridMode?: SpreadsheetGridMode;
  flowZoom?: number;
}) {
  const [sheet, setSheet] = useState<SpreadsheetDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const [viewportSize, setViewportSize] = useState({ width: 400, height: 300 });
  const listRef = useListRef();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const selectedPath = selectedFile?.fullPath ?? null;
  const selectedName = selectedFile?.name ?? "";

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
    setColumnWidths({});
    setIsLoading(false);
    listRef.current?.scrollToRow({ index: 0, align: "start" });
  }, []);

  useEffect(() => {
    if (!selectedPath) {
      setSheet(null);
      setStatusText(null);
      setErrorText(null);
      return;
    }
    if (!isSpreadsheetPath(selectedPath)) {
      setSheet(null);
      setStatusText(null);
      setErrorText(null);
      return;
    }
    void loadFile(selectedPath);
  }, [loadFile, selectedPath]);

  const onChangeCell = useCallback(
    (rowIndex: number, columnIndex: number, value: string) => {
      setSheet((prev) => {
        if (!prev) {
          return prev;
        }
        const nextRows = [...prev.rows];
        const existing = nextRows[rowIndex] ?? [];
        const nextRow = [...existing];
        if (nextRow.length < prev.columnCount) {
          nextRow.length = prev.columnCount;
        }
        nextRow[columnIndex] = value;
        for (let i = 0; i < nextRow.length; i += 1) {
          if (nextRow[i] === undefined) {
            nextRow[i] = "";
          }
        }
        nextRows[rowIndex] = nextRow;
        return {
          ...prev,
          rows: nextRows,
        };
      });
    },
    [],
  );

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
          const [columnIndex, rowIndex] = edit.location;
          if (
            rowIndex < 0 ||
            rowIndex >= prev.rowCount ||
            columnIndex < 0 ||
            columnIndex >= prev.columnCount
          ) {
            continue;
          }
          const nextRow = [
            ...(nextRows[rowIndex] ??
              Array.from({ length: prev.columnCount }, () => "")),
          ];
          nextRow[columnIndex] = edit.value.data;
          nextRows[rowIndex] = withColumnCount(nextRow, prev.columnCount);
        }
        return {
          ...prev,
          rows: nextRows,
        };
      });
      return true;
    },
    [],
  );

  const onDeleteSelection = useCallback((selection: GridSelection) => {
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
      const yEnd = Math.min(prev.rowCount, range.y + range.height);
      for (let rowIndex = yStart; rowIndex < yEnd; rowIndex += 1) {
        const nextRow = [
          ...(nextRows[rowIndex] ??
            Array.from({ length: prev.columnCount }, () => "")),
        ];
        for (let columnIndex = xStart; columnIndex < xEnd; columnIndex += 1) {
          nextRow[columnIndex] = "";
        }
        nextRows[rowIndex] = nextRow;
      }
      return {
        ...prev,
        rows: nextRows,
      };
    });
    return false;
  }, []);

  const onAddRow = useCallback(() => {
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
  }, []);

  const onAddColumn = useCallback(() => {
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
  }, []);

  const onSave = useCallback(async () => {
    if (!sheet) {
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
    setIsSaving(false);
  }, [sheet]);

  const gridTemplateColumns = useMemo(
    () =>
      getSpreadsheetGridTemplateColumns(Math.max(0, sheet?.columnCount ?? 0)),
    [sheet?.columnCount],
  );
  const sheetWidth = useMemo(
    () => getSpreadsheetGridWidth(Math.max(0, sheet?.columnCount ?? 0)),
    [sheet?.columnCount],
  );
  const listWidth = Math.max(viewportSize.width, sheetWidth);
  const densityMultiplier = useMemo(() => {
    const safeZoom = flowZoom > 0 ? flowZoom : 1;
    return Math.min(
      SPREADSHEET_GLIDE_MAX_DENSITY_MULTIPLIER,
      Math.max(1, Math.max(safeZoom, 1 / safeZoom)),
    );
  }, [flowZoom]);
  const glideViewportWidth = Math.max(1, viewportSize.width);
  const glideViewportHeight = Math.max(
    1,
    viewportSize.height - SPREADSHEET_HEADER_HEIGHT,
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
      title: getSpreadsheetColumnLabel(columnIndex),
      width:
        (columnWidths[columnIndex] ?? SPREADSHEET_DATA_COLUMN_WIDTH) *
        densityMultiplier,
      hasMenu: false,
      grow: 0,
    }));
  }, [columnWidths, densityMultiplier, sheet]);
  const getGlideCellContent = useCallback(
    ([columnIndex, rowIndex]: Item) => {
      if (!sheet || rowIndex < 0 || rowIndex >= sheet.rowCount) {
        return {
          kind: GridCellKind.Loading,
          allowOverlay: false,
        };
      }
      const row = sheet.rows[rowIndex] ?? [];
      const value = row[columnIndex] ?? "";
      return {
        kind: GridCellKind.Text,
        allowOverlay: true,
        displayData: value,
        data: value,
        readonly: isSaving,
      };
    },
    [isSaving, sheet],
  );

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
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-setta-700 dark:text-setta-200">
            {selectedName}
          </p>
          {sheet && (
            <p className="text-[11px] text-setta-500 dark:text-setta-400">
              {sheet.rowCount} rows · {sheet.columnCount} columns
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="spreadsheet-add-column"
            className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={onAddColumn}
            disabled={!sheet || isLoading || isSaving}
          >
            <FiColumns size={12} />
            Column
          </button>
          <button
            type="button"
            data-testid="spreadsheet-add-row"
            className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={onAddRow}
            disabled={!sheet || isLoading || isSaving}
          >
            <FiPlus size={12} />
            Row
          </button>
          <button
            type="button"
            data-testid="spreadsheet-save"
            className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
            onClick={onSave}
            disabled={!sheet || isLoading || isSaving}
          >
            <FiSave size={12} />
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {(statusText || errorText) && (
        <div className="border-b border-setta-200 px-3 py-1 text-[11px] dark:border-setta-800">
          {statusText && <span className="text-emerald-600">{statusText}</span>}
          {errorText && <span className="text-red-500">{errorText}</span>}
        </div>
      )}
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
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
                className="h-full overflow-hidden [scrollbar-gutter:stable]"
              >
                <div
                  style={{
                    width: glideRenderWidth,
                    height: glideRenderHeight,
                    transform: `scale(${1 / densityMultiplier})`,
                    transformOrigin: "top left",
                  }}
                >
                  <DataEditor
                    width={glideRenderWidth}
                    height={glideRenderHeight}
                    rows={sheet.rowCount}
                    columns={glideColumns}
                    rowMarkers={{
                      kind: "number",
                      width: SPREADSHEET_INDEX_COLUMN_WIDTH * densityMultiplier,
                    }}
                    getCellContent={getGlideCellContent}
                    getCellsForSelection
                    rowHeight={Math.round(
                      SPREADSHEET_ROW_HEIGHT * densityMultiplier,
                    )}
                    headerHeight={Math.round(
                      SPREADSHEET_HEADER_HEIGHT * densityMultiplier,
                    )}
                    smoothScrollX
                    smoothScrollY
                    fillHandle
                    onDelete={onDeleteSelection}
                    onCellEdited={(cell, newValue) =>
                      onCellsEdited([{ location: cell, value: newValue }])
                    }
                    onCellsEdited={onCellsEdited}
                    onColumnResize={(_column, newSize, colIndex) => {
                      setColumnWidths((prev) => ({
                        ...prev,
                        [colIndex]: Math.max(
                          48,
                          Math.round(newSize / densityMultiplier),
                        ),
                      }));
                    }}
                    onPaste
                    drawFocusRing={false}
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
                className="h-full overflow-x-auto overflow-y-hidden [scrollbar-gutter:stable]"
              >
                <div className="min-h-full" style={{ minWidth: listWidth }}>
                  <div
                    className="grid border-b border-setta-200 bg-setta-50 text-[10px] font-semibold text-setta-500 dark:border-setta-800 dark:bg-setta-900/70 dark:text-setta-400"
                    style={{
                      gridTemplateColumns,
                      width: listWidth,
                    }}
                  >
                    <div className="flex h-[24px] items-center justify-center border-r border-setta-200 dark:border-setta-800">
                      #
                    </div>
                    {Array.from({ length: sheet.columnCount }, (_, index) => (
                      <div
                        key={`header-${index}`}
                        className="flex h-[24px] items-center border-r border-setta-200 px-1.5 dark:border-setta-800"
                      >
                        {getSpreadsheetColumnLabel(index)}
                      </div>
                    ))}
                  </div>
                  <List
                    listRef={listRef}
                    rowComponent={SpreadsheetRow}
                    rowCount={sheet.rowCount}
                    rowHeight={SPREADSHEET_ROW_HEIGHT}
                    rowProps={{
                      rows: sheet.rows,
                      columnCount: sheet.columnCount,
                      gridTemplateColumns,
                      onChangeCell,
                    }}
                    style={{
                      width: listWidth,
                      height: Math.max(
                        1,
                        viewportSize.height - SPREADSHEET_HEADER_HEIGHT,
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
