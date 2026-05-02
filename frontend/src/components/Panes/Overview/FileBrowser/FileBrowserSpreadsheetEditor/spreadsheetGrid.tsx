import {
  DataEditor,
  GridCellKind,
  type EditableGridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Theme,
} from "@glideapps/glide-data-grid";

import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";

import { getFileBrowserFileStat } from "openapi/http";

import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";

import { useCallback, useEffect, useRef, useState } from "react";

import { List, useListRef } from "react-window";

import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";

import {
  getSpreadsheetColumnLabel,
  isSpreadsheetPath,
} from "utils/spreadsheet";

import {
  SpreadsheetRow,
  type SpreadsheetDensityMetrics,
} from "./fileBrowserSpreadsheetGrid";

import {
  applySpreadsheetCellUpdates,
  isSpreadsheetLoadRequestStale,
  shouldAnnounceSpreadsheetAutoReload,
  type SpreadsheetSortState,
} from "./fileBrowserSpreadsheetState";

import {
  FileBrowserFileStatRouteResponse,
  SPREADSHEET_AUTO_RELOAD_INTERVAL_MS,
  SpreadsheetDraft,
  SpreadsheetGlideGridViewProps,
  SpreadsheetGridMode,
  applyLoadedSpreadsheetDraft,
  loadSpreadsheetDraft,
  resetSpreadsheetEditorView,
  resolveSpreadsheetHeaderSortSuffix,
  resolveSpreadsheetRowCountSummary,
} from "./spreadsheetToolbar";

export function SpreadsheetGlideGridView({
  densityMetrics,
  densityMultiplier,
  displayedRowCount,
  getGlideCellContent,
  glideRenderHeight,
  glideRenderWidth,
  glideTheme,
  gridSelection,
  isGridEditable,
  onCellsEdited,
  onColumnResize,
  onDeleteSelection,
  onGridSelectionChange,
  onToggleSort,
  showRowNumbers,
  glideColumns,
}: SpreadsheetGlideGridViewProps) {
  return (
    <div
      className={`${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} nodrag h-full overflow-hidden bg-setta-50/80 [scrollbar-gutter:stable] dark:bg-setta-950/80`}
      data-gpu-flow-control="spreadsheet-glide-grid"
      data-testid="spreadsheet-glide-grid"
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
          cellActivationBehavior="single-click"
          columns={glideColumns}
          drawFocusRing={true}
          editOnType
          experimental={{
            renderStrategy: "single-buffer",
            enableFirefoxRescaling: true,
          }}
          fillHandle={isGridEditable}
          getCellContent={getGlideCellContent}
          getCellsForSelection
          gridSelection={gridSelection}
          headerHeight={densityMetrics.headerHeight * densityMultiplier}
          height={glideRenderHeight}
          onCellEdited={
            isGridEditable
              ? (cell, newValue) =>
                  onCellsEdited([{ location: cell, value: newValue }])
              : undefined
          }
          onCellsEdited={isGridEditable ? onCellsEdited : undefined}
          onColumnResize={(_column, newSize, colIndex) =>
            onColumnResize(colIndex, newSize)
          }
          onDelete={isGridEditable ? onDeleteSelection : undefined}
          onGridSelectionChange={onGridSelectionChange}
          onHeaderClicked={onToggleSort}
          onPaste={isGridEditable ? true : undefined}
          rangeSelect="multi-rect"
          rangeSelectionBlending="mixed"
          rowHeight={densityMetrics.rowHeight * densityMultiplier}
          rowMarkers={
            showRowNumbers
              ? {
                  kind: "number",
                  width: densityMetrics.indexColumnWidth * densityMultiplier,
                }
              : undefined
          }
          rows={displayedRowCount}
          smoothScrollX
          smoothScrollY
          theme={glideTheme}
          width={glideRenderWidth}
        />
      </div>
    </div>
  );
}

export type SpreadsheetDomGridViewProps = {
  densityMetrics: SpreadsheetDensityMetrics;
  displayedRowCount: number;
  displayedRowIndexes: number[];
  effectiveReadOnly: boolean;
  gridTemplateColumns: string;
  listRef: ReturnType<typeof useListRef>;
  listWidth: number;
  onChangeCell: (rowIndex: number, columnIndex: number, value: string) => void;
  onToggleSort: (columnIndex: number) => void;
  sheet: SpreadsheetDraft;
  showRowNumbers: boolean;
  sortState: SpreadsheetSortState | null;
  viewportHeight: number;
};

export function SpreadsheetDomGridView({
  densityMetrics,
  displayedRowCount,
  displayedRowIndexes,
  effectiveReadOnly,
  gridTemplateColumns,
  listRef,
  listWidth,
  onChangeCell,
  onToggleSort,
  sheet,
  showRowNumbers,
  sortState,
  viewportHeight,
}: SpreadsheetDomGridViewProps) {
  return (
    <div
      className={`${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} nodrag h-full overflow-x-auto overflow-y-hidden bg-setta-50/80 [scrollbar-gutter:stable] dark:bg-setta-950/80`}
      data-gpu-flow-control="spreadsheet-dom-grid"
      data-testid="spreadsheet-grid-scroll"
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
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-setta-500 transition-colors hover:text-setta-700 dark:text-setta-400 dark:hover:text-setta-200"
                onClick={() => onToggleSort(index)}
                type="button"
              >
                {getSpreadsheetColumnLabel(index)}
                {resolveSpreadsheetHeaderSortSuffix(sortState, index)}
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
            sourceRows: sheet.rows,
            displayedRowIndexes,
            columnCount: sheet.columnCount,
            showRowNumbers,
            readOnly: effectiveReadOnly,
            gridTemplateColumns,
            onChangeCell,
          }}
          style={{
            width: listWidth,
            height: Math.max(1, viewportHeight - densityMetrics.headerHeight),
            overflowX: "hidden",
            overflowY: "scroll",
          }}
        />
      </div>
    </div>
  );
}

export type SpreadsheetGridViewportProps = {
  densityMetrics: SpreadsheetDensityMetrics;
  densityMultiplier: number;
  displayedRowCount: number;
  displayedRowIndexes: number[];
  effectiveReadOnly: boolean;
  getGlideCellContent: SpreadsheetGlideGridViewProps["getGlideCellContent"];
  glideColumns: readonly GridColumn[];
  glideRenderHeight: number;
  glideRenderWidth: number;
  glideTheme: Partial<Theme>;
  gridMode: SpreadsheetGridMode;
  gridSelection: GridSelection | undefined;
  gridTemplateColumns: string;
  isGridEditable: boolean;
  isLoading: boolean;
  listRef: ReturnType<typeof useListRef>;
  listWidth: number;
  onCellsEdited: SpreadsheetGlideGridViewProps["onCellsEdited"];
  onChangeCell: (rowIndex: number, columnIndex: number, value: string) => void;
  onColumnResize: (columnIndex: number, newSize: number) => void;
  onDeleteSelection: SpreadsheetGlideGridViewProps["onDeleteSelection"];
  onGridSelectionChange: (selection: GridSelection) => void;
  onToggleSort: (columnIndex: number) => void;
  sheet: SpreadsheetDraft | null;
  showRowNumbers: boolean;
  sortState: SpreadsheetSortState | null;
  viewportHeight: number;
  viewportRef: RefObject<HTMLDivElement | null>;
};

export function SpreadsheetGridViewport({
  densityMetrics,
  densityMultiplier,
  displayedRowCount,
  displayedRowIndexes,
  effectiveReadOnly,
  getGlideCellContent,
  glideColumns,
  glideRenderHeight,
  glideRenderWidth,
  glideTheme,
  gridMode,
  gridSelection,
  gridTemplateColumns,
  isGridEditable,
  isLoading,
  listRef,
  listWidth,
  onCellsEdited,
  onChangeCell,
  onColumnResize,
  onDeleteSelection,
  onGridSelectionChange,
  onToggleSort,
  sheet,
  showRowNumbers,
  sortState,
  viewportHeight,
  viewportRef,
}: SpreadsheetGridViewportProps) {
  let content = null;
  if (isLoading) {
    content = (
      <div className="flex h-full items-center justify-center text-xs text-setta-500 dark:text-setta-400">
        Loading spreadsheet…
      </div>
    );
  } else if (!sheet) {
    content = (
      <div className="flex h-full items-center justify-center text-xs text-setta-500 dark:text-setta-400">
        Unable to load spreadsheet content.
      </div>
    );
  } else if (gridMode === "glide") {
    content = (
      <SpreadsheetGlideGridView
        densityMetrics={densityMetrics}
        densityMultiplier={densityMultiplier}
        displayedRowCount={displayedRowCount}
        getGlideCellContent={getGlideCellContent}
        glideColumns={glideColumns}
        glideRenderHeight={glideRenderHeight}
        glideRenderWidth={glideRenderWidth}
        glideTheme={glideTheme}
        gridSelection={gridSelection}
        isGridEditable={isGridEditable}
        onCellsEdited={onCellsEdited}
        onColumnResize={onColumnResize}
        onDeleteSelection={onDeleteSelection}
        onGridSelectionChange={onGridSelectionChange}
        onToggleSort={onToggleSort}
        showRowNumbers={showRowNumbers}
      />
    );
  } else {
    content = (
      <SpreadsheetDomGridView
        densityMetrics={densityMetrics}
        displayedRowCount={displayedRowCount}
        displayedRowIndexes={displayedRowIndexes}
        effectiveReadOnly={effectiveReadOnly}
        gridTemplateColumns={gridTemplateColumns}
        listRef={listRef}
        listWidth={listWidth}
        onChangeCell={onChangeCell}
        onToggleSort={onToggleSort}
        sheet={sheet}
        showRowNumbers={showRowNumbers}
        sortState={sortState}
        viewportHeight={viewportHeight}
      />
    );
  }
  return (
    <div
      ref={viewportRef}
      className={`${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} nodrag min-h-0 flex-1 overflow-hidden`}
    >
      {content}
    </div>
  );
}

export type SpreadsheetFooterProps = {
  displayedRowCount: number;
  selectionSummary: string;
  sheet: SpreadsheetDraft;
};

export function SpreadsheetFooter({
  displayedRowCount,
  selectionSummary,
  sheet,
}: SpreadsheetFooterProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-setta-200 px-3 py-1 text-[11px] text-setta-500 dark:border-setta-800 dark:text-setta-400">
      <span className="min-w-0 truncate">
        {resolveSpreadsheetRowCountSummary({
          displayedRowCount,
          sheet,
        })}
      </span>
      <span
        className="min-w-0 max-w-[50%] truncate text-right"
        data-testid="spreadsheet-selection-summary"
        title={selectionSummary}
      >
        {selectionSummary}
      </span>
    </div>
  );
}

export function useSelectedPathRef(
  selectedPath: string | null,
): MutableRefObject<string | null> {
  const selectedPathRef = useRef<string | null>(selectedPath);
  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);
  return selectedPathRef;
}

export function useSpreadsheetViewportSize(): {
  viewportRef: RefObject<HTMLDivElement | null>;
  viewportSize: {
    width: number;
    height: number;
  };
} {
  const [viewportSize, setViewportSize] = useState({ width: 400, height: 300 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
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
  return {
    viewportRef,
    viewportSize,
  };
}

export function useSpreadsheetLoadFile(args: {
  editVersionRef: MutableRefObject<number>;
  listRef: ReturnType<typeof useListRef>;
  loadRequestIdRef: MutableRefObject<number>;
  selectedPathRef: MutableRefObject<string | null>;
  setColumnWidths: (value: Record<number, number>) => void;
  setErrorText: (value: string | null) => void;
  setFilterQuery: (value: string) => void;
  setGridSelection: (value: GridSelection | undefined) => void;
  setHasExternalDiskChange: (value: boolean) => void;
  setIsDirty: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setSelectionSummary: (value: string) => void;
  setSheet: (value: SpreadsheetDraft | null) => void;
  setSortState: (value: SpreadsheetSortState | null) => void;
  setStatusText: (value: string | null) => void;
}): (path: string) => Promise<boolean> {
  const {
    editVersionRef,
    listRef,
    loadRequestIdRef,
    selectedPathRef,
    setColumnWidths,
    setErrorText,
    setFilterQuery,
    setGridSelection,
    setHasExternalDiskChange,
    setIsDirty,
    setIsLoading,
    setSelectionSummary,
    setSheet,
    setSortState,
    setStatusText,
  } = args;
  return useCallback(
    async (path: string): Promise<boolean> => {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      const isStaleRequest = () =>
        isSpreadsheetLoadRequestStale({
          activeRequestId: loadRequestIdRef.current,
          requestId,
          currentSelectedPath: selectedPathRef.current,
          requestedPath: path,
        });
      setIsLoading(true);
      setErrorText(null);
      setStatusText(null);
      try {
        const outcome = await loadSpreadsheetDraft(path);
        if (isStaleRequest()) {
          return false;
        }
        if (outcome.status === "error") {
          setErrorText(outcome.message);
          return false;
        }
        applyLoadedSpreadsheetDraft({
          draft: outcome.draft,
          editVersionRef,
          listRef,
          setColumnWidths,
          setErrorText,
          setFilterQuery,
          setGridSelection,
          setHasExternalDiskChange,
          setIsDirty,
          setSelectionSummary,
          setSheet,
          setSortState,
          setStatusText,
        });
        return true;
      } catch {
        if (!isStaleRequest()) {
          setErrorText("Failed to load spreadsheet file.");
        }
        return false;
      } finally {
        if (loadRequestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [
      editVersionRef,
      listRef,
      loadRequestIdRef,
      selectedPathRef,
      setColumnWidths,
      setErrorText,
      setFilterQuery,
      setGridSelection,
      setHasExternalDiskChange,
      setIsDirty,
      setIsLoading,
      setSelectionSummary,
      setSheet,
      setSortState,
      setStatusText,
    ],
  );
}

export function useSpreadsheetSelectedPathEffect(args: {
  editVersionRef: MutableRefObject<number>;
  loadFile: (path: string) => Promise<boolean>;
  loadRequestIdRef: MutableRefObject<number>;
  selectedPath: string | null;
  setColumnWidths: (value: Record<number, number>) => void;
  setErrorText: (value: string | null) => void;
  setFilterQuery: (value: string) => void;
  setGridSelection: (value: GridSelection | undefined) => void;
  setHasExternalDiskChange: (value: boolean) => void;
  setIsDirty: (value: boolean) => void;
  setSelectionSummary: (value: string) => void;
  setSheet: (value: SpreadsheetDraft | null) => void;
  setSortState: (value: SpreadsheetSortState | null) => void;
  setStatusText: (value: string | null) => void;
}): void {
  const {
    editVersionRef,
    loadFile,
    loadRequestIdRef,
    selectedPath,
    setColumnWidths,
    setErrorText,
    setFilterQuery,
    setGridSelection,
    setHasExternalDiskChange,
    setIsDirty,
    setSelectionSummary,
    setSheet,
    setSortState,
    setStatusText,
  } = args;
  useEffect(() => {
    if (!selectedPath || !isSpreadsheetPath(selectedPath)) {
      loadRequestIdRef.current += 1;
      setSheet(null);
      resetSpreadsheetEditorView({
        editVersionRef,
        setColumnWidths,
        setErrorText,
        setFilterQuery,
        setGridSelection,
        setHasExternalDiskChange,
        setIsDirty,
        setSelectionSummary,
        setSortState,
        setStatusText,
      });
      return;
    }
    void loadFile(selectedPath);
  }, [
    editVersionRef,
    loadFile,
    loadRequestIdRef,
    selectedPath,
    setColumnWidths,
    setErrorText,
    setFilterQuery,
    setGridSelection,
    setHasExternalDiskChange,
    setIsDirty,
    setSelectionSummary,
    setSheet,
    setSortState,
    setStatusText,
  ]);
}

export function useSpreadsheetAutoReloadEffect(args: {
  autoReloadOnExternalChange: boolean;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  loadFile: (path: string) => Promise<boolean>;
  selectedPath: string | null;
  setHasExternalDiskChange: (value: boolean) => void;
  setStatusText: (value: string | null) => void;
  sheet: SpreadsheetDraft | null;
}): void {
  const {
    autoReloadOnExternalChange,
    isDirty,
    isLoading,
    isSaving,
    loadFile,
    selectedPath,
    setHasExternalDiskChange,
    setStatusText,
    sheet,
  } = args;
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
    const loadedMtimeNs = sheet.mtimeNs;
    let isCancelled = false;
    const pollForExternalChanges = async () => {
      const response = (await callOpenAPI(
        getFileBrowserFileStat({
          body: {
            path: selectedPath,
          },
        } as Parameters<typeof getFileBrowserFileStat>[0]),
      )) as FileBrowserFileStatRouteResponse;
      if (!res200(response) || isCancelled) {
        return;
      }
      if (response.data.mtimeNs === loadedMtimeNs) {
        setHasExternalDiskChange(false);
        return;
      }
      setHasExternalDiskChange(true);
      if (isDirty) {
        setStatusText("File changed on disk. Save to overwrite or reload.");
        return;
      }
      const didReload = await loadFile(selectedPath);
      if (
        shouldAnnounceSpreadsheetAutoReload({
          reloadSucceeded: didReload,
          isCancelled,
        })
      ) {
        setStatusText("Reloaded from disk.");
      }
    };
    // This remains route polling because the backend does not maintain a
    // websocket watcher for every arbitrary previewed file. The editor only
    // needs a stale-write guard while it is open, so scoped mtime checks are
    // the current concrete tradeoff.
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
    setHasExternalDiskChange,
    setStatusText,
    sheet,
  ]);
}

export function applySpreadsheetMutation(args: {
  editVersionRef: MutableRefObject<number>;
  setIsDirty: (value: boolean) => void;
  setSheet: Dispatch<SetStateAction<SpreadsheetDraft | null>>;
  setStatusText: (value: string | null) => void;
  updateDraft: (draft: SpreadsheetDraft) => SpreadsheetDraft;
}): void {
  const { editVersionRef, setIsDirty, setSheet, setStatusText, updateDraft } =
    args;
  let didMutate = false;
  setSheet((prev) => {
    if (!prev) {
      return prev;
    }
    const nextDraft = updateDraft(prev);
    didMutate = nextDraft !== prev;
    return nextDraft;
  });
  if (didMutate) {
    editVersionRef.current += 1;
    setIsDirty(true);
    setStatusText(null);
  }
}

export function resolveSpreadsheetEditedCells(args: {
  columnCount: number;
  displayedRowIndexes: number[];
  newValues: readonly {
    location: Item;
    value: EditableGridCell;
  }[];
  rowCount: number;
}): SpreadsheetCellEdit[] {
  const { columnCount, displayedRowIndexes, newValues, rowCount } = args;
  const edits: SpreadsheetCellEdit[] = [];
  for (const edit of newValues) {
    if (edit.value.kind !== GridCellKind.Text) {
      continue;
    }
    const [columnIndex, visibleRowIndex] = edit.location;
    const sourceRowIndex = displayedRowIndexes[visibleRowIndex];
    if (
      sourceRowIndex === undefined ||
      sourceRowIndex < 0 ||
      sourceRowIndex >= rowCount ||
      columnIndex < 0 ||
      columnIndex >= columnCount
    ) {
      continue;
    }
    edits.push({
      rowIndex: sourceRowIndex,
      columnIndex,
      value: edit.value.data,
    });
  }
  return edits;
}

export function resolveSpreadsheetDeletionEdits(args: {
  columnCount: number;
  displayedRowIndexes: number[];
  rowCount: number;
  selection: GridSelection;
}): SpreadsheetCellEdit[] {
  const { columnCount, displayedRowIndexes, rowCount, selection } = args;
  const range = selection.current?.range;
  if (!range) {
    return [];
  }
  const edits: SpreadsheetCellEdit[] = [];
  const xStart = Math.max(0, range.x);
  const yStart = Math.max(0, range.y);
  const xEnd = Math.min(columnCount, range.x + range.width);
  const yEnd = Math.min(displayedRowIndexes.length, range.y + range.height);
  for (
    let visibleRowIndex = yStart;
    visibleRowIndex < yEnd;
    visibleRowIndex += 1
  ) {
    const sourceRowIndex = displayedRowIndexes[visibleRowIndex];
    if (sourceRowIndex === undefined || sourceRowIndex >= rowCount) {
      continue;
    }
    for (let columnIndex = xStart; columnIndex < xEnd; columnIndex += 1) {
      edits.push({ rowIndex: sourceRowIndex, columnIndex, value: "" });
    }
  }
  return edits;
}

export function useSpreadsheetOnChangeCell(args: {
  displayedRowIndexes: number[];
  editVersionRef: MutableRefObject<number>;
  effectiveReadOnly: boolean;
  setIsDirty: (value: boolean) => void;
  setSheet: Dispatch<SetStateAction<SpreadsheetDraft | null>>;
  setStatusText: (value: string | null) => void;
}): (rowIndex: number, columnIndex: number, value: string) => void {
  const {
    displayedRowIndexes,
    editVersionRef,
    effectiveReadOnly,
    setIsDirty,
    setSheet,
    setStatusText,
  } = args;
  return useCallback(
    (rowIndex: number, columnIndex: number, value: string) => {
      if (effectiveReadOnly) {
        return;
      }
      const sourceRowIndex = displayedRowIndexes[rowIndex];
      if (sourceRowIndex === undefined) {
        return;
      }
      applySpreadsheetMutation({
        editVersionRef,
        setIsDirty,
        setSheet,
        setStatusText,
        updateDraft: (draft) => {
          const nextRows = applySpreadsheetCellUpdates({
            rows: draft.rows,
            columnCount: draft.columnCount,
            edits: [{ rowIndex: sourceRowIndex, columnIndex, value }],
          });
          return nextRows === draft.rows
            ? draft
            : {
                ...draft,
                rows: nextRows,
              };
        },
      });
    },
    [
      displayedRowIndexes,
      editVersionRef,
      effectiveReadOnly,
      setIsDirty,
      setSheet,
      setStatusText,
    ],
  );
}

export function useSpreadsheetOnCellsEdited(args: {
  displayedRowIndexes: number[];
  editVersionRef: MutableRefObject<number>;
  effectiveReadOnly: boolean;
  setIsDirty: (value: boolean) => void;
  setSheet: Dispatch<SetStateAction<SpreadsheetDraft | null>>;
  setStatusText: (value: string | null) => void;
}): (
  newValues: readonly {
    location: Item;
    value: EditableGridCell;
  }[],
) => boolean {
  const {
    displayedRowIndexes,
    editVersionRef,
    effectiveReadOnly,
    setIsDirty,
    setSheet,
    setStatusText,
  } = args;
  return useCallback(
    (newValues) => {
      if (effectiveReadOnly) {
        return false;
      }
      applySpreadsheetMutation({
        editVersionRef,
        setIsDirty,
        setSheet,
        setStatusText,
        updateDraft: (draft) => {
          const edits = resolveSpreadsheetEditedCells({
            columnCount: draft.columnCount,
            displayedRowIndexes,
            newValues,
            rowCount: draft.rowCount,
          });
          const nextRows = applySpreadsheetCellUpdates({
            rows: draft.rows,
            columnCount: draft.columnCount,
            edits,
          });
          return nextRows === draft.rows
            ? draft
            : {
                ...draft,
                rows: nextRows,
              };
        },
      });
      return true;
    },
    [
      displayedRowIndexes,
      editVersionRef,
      effectiveReadOnly,
      setIsDirty,
      setSheet,
      setStatusText,
    ],
  );
}
