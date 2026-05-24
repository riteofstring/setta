import {
  GridCellKind,
  type GridColumn,
  type GridSelection,
  type Item,
  type Theme,
} from "@glideapps/glide-data-grid";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { useCallback, useMemo, useRef, useState } from "react";

import { useListRef } from "react-window";

import { useLocalStorage } from "state/definitions";

import type { SpreadsheetGridDensity } from "utils/generatedTypes";

import {
  getSpreadsheetColumnLabel,
  isSpreadsheetPath,
} from "utils/spreadsheet";

import {
  getSpreadsheetDensityMetrics,
  getSpreadsheetGlideDensityMultiplier,
  getSpreadsheetGlideTheme,
  getSpreadsheetGridTemplateColumns,
  getSpreadsheetGridWidth,
  type SpreadsheetDensityMetrics,
} from "../fileBrowserSpreadsheetGrid";

import {
  applySpreadsheetCellUpdates,
  canSaveSpreadsheetDraft,
  getFilteredSortedSpreadsheetRowIndexes,
  shouldIgnoreSpreadsheetSaveResult,
  type SpreadsheetSortState,
} from "../fileBrowserSpreadsheetState";

import {
  SpreadsheetDesktopToolbar,
  SpreadsheetDraft,
  SpreadsheetEmptyState,
  SpreadsheetGridMode,
  SpreadsheetSelectedFile,
  SpreadsheetStatusBanner,
  applySuccessfulSpreadsheetSave,
  canMutateSpreadsheet,
  canReloadSpreadsheet,
  canSaveSpreadsheet,
  formatSpreadsheetSelectionSummary,
  persistSpreadsheetSave,
  resolveSpreadsheetHeaderSortSuffix,
} from "./spreadsheetToolbar";

import {
  SpreadsheetFooter,
  SpreadsheetGridViewport,
  applySpreadsheetMutation,
  resolveSpreadsheetDeletionEdits,
  useSelectedPathRef,
  useSpreadsheetAutoReloadEffect,
  useSpreadsheetLoadFile,
  useSpreadsheetOnCellsEdited,
  useSpreadsheetOnChangeCell,
  useSpreadsheetSelectedPathEffect,
  useSpreadsheetViewportSize,
} from "./spreadsheetGrid";

function useSpreadsheetOnDeleteSelection(args: {
  displayedRowIndexes: number[];
  editVersionRef: MutableRefObject<number>;
  effectiveReadOnly: boolean;
  setIsDirty: (value: boolean) => void;
  setSheet: Dispatch<SetStateAction<SpreadsheetDraft | null>>;
  setStatusText: (value: string | null) => void;
}): (selection: GridSelection) => boolean {
  const {
    displayedRowIndexes,
    editVersionRef,
    effectiveReadOnly,
    setIsDirty,
    setSheet,
    setStatusText,
  } = args;
  return useCallback(
    (selection: GridSelection) => {
      if (effectiveReadOnly) {
        return false;
      }
      applySpreadsheetMutation({
        editVersionRef,
        setIsDirty,
        setSheet,
        setStatusText,
        updateDraft: (draft) => {
          const edits = resolveSpreadsheetDeletionEdits({
            columnCount: draft.columnCount,
            displayedRowIndexes,
            rowCount: draft.rowCount,
            selection,
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
      return false;
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

function useSpreadsheetOnAddRow(args: {
  editVersionRef: MutableRefObject<number>;
  effectiveReadOnly: boolean;
  setIsDirty: (value: boolean) => void;
  setSheet: Dispatch<SetStateAction<SpreadsheetDraft | null>>;
  setStatusText: (value: string | null) => void;
}): () => void {
  const {
    editVersionRef,
    effectiveReadOnly,
    setIsDirty,
    setSheet,
    setStatusText,
  } = args;
  return useCallback(() => {
    if (effectiveReadOnly) {
      return;
    }
    applySpreadsheetMutation({
      editVersionRef,
      setIsDirty,
      setSheet,
      setStatusText,
      updateDraft: (draft) => ({
        ...draft,
        rows: [
          ...draft.rows,
          Array.from({ length: draft.columnCount }, () => ""),
        ],
        rowCount: draft.rowCount + 1,
      }),
    });
  }, [editVersionRef, effectiveReadOnly, setIsDirty, setSheet, setStatusText]);
}

function useSpreadsheetOnAddColumn(args: {
  editVersionRef: MutableRefObject<number>;
  effectiveReadOnly: boolean;
  setIsDirty: (value: boolean) => void;
  setSheet: Dispatch<SetStateAction<SpreadsheetDraft | null>>;
  setStatusText: (value: string | null) => void;
}): () => void {
  const {
    editVersionRef,
    effectiveReadOnly,
    setIsDirty,
    setSheet,
    setStatusText,
  } = args;
  return useCallback(() => {
    if (effectiveReadOnly) {
      return;
    }
    applySpreadsheetMutation({
      editVersionRef,
      setIsDirty,
      setSheet,
      setStatusText,
      updateDraft: (draft) => ({
        ...draft,
        columnCount: draft.columnCount + 1,
        rows: draft.rows.map((row) => [...row, ""]),
      }),
    });
  }, [editVersionRef, effectiveReadOnly, setIsDirty, setSheet, setStatusText]);
}

function useSpreadsheetOnSave(args: {
  editVersionRef: MutableRefObject<number>;
  isSaving: boolean;
  readOnly: boolean;
  selectedPath: string | null;
  selectedPathRef: MutableRefObject<string | null>;
  setErrorText: (value: string | null) => void;
  setHasExternalDiskChange: (value: boolean) => void;
  setIsDirty: (value: boolean) => void;
  setIsSaving: (value: boolean) => void;
  setSheet: Dispatch<SetStateAction<SpreadsheetDraft | null>>;
  setStatusText: (value: string | null) => void;
  sheet: SpreadsheetDraft | null;
}): () => Promise<void> {
  const {
    editVersionRef,
    isSaving,
    readOnly,
    selectedPath,
    selectedPathRef,
    setErrorText,
    setHasExternalDiskChange,
    setIsDirty,
    setIsSaving,
    setSheet,
    setStatusText,
    sheet,
  } = args;
  return useCallback(async () => {
    if (!sheet || readOnly || isSaving) {
      return;
    }
    const savingPath = sheet.path;
    const saveStartEditVersion = editVersionRef.current;
    const expectedMtimeNs = sheet.mtimeNs;
    const isSaveResultStale = () =>
      shouldIgnoreSpreadsheetSaveResult({
        savingPath,
        currentSelectedPath: selectedPathRef.current,
      });
    if (
      !canSaveSpreadsheetDraft({
        sheetPath: savingPath,
        selectedPath,
      })
    ) {
      setErrorText(
        "Selected spreadsheet changed while loading. Reload before saving.",
      );
      return;
    }
    setIsSaving(true);
    setErrorText(null);
    setStatusText(null);
    try {
      const outcome = await persistSpreadsheetSave({
        expectedMtimeNs,
        isSaveResultStale,
        sheet,
      });
      if (outcome.status === "error") {
        setErrorText(outcome.message);
        return;
      }
      if (outcome.status === "stale") {
        return;
      }
      applySuccessfulSpreadsheetSave({
        currentEditVersion: editVersionRef.current,
        mtimeNs: outcome.mtimeNs,
        path: savingPath,
        saveStartEditVersion,
        setHasExternalDiskChange,
        setIsDirty,
        setSheet,
        setStatusText,
      });
    } catch {
      setErrorText("Failed to save spreadsheet file.");
    } finally {
      setIsSaving(false);
    }
  }, [
    editVersionRef,
    isSaving,
    readOnly,
    selectedPath,
    selectedPathRef,
    setErrorText,
    setHasExternalDiskChange,
    setIsDirty,
    setIsSaving,
    setSheet,
    setStatusText,
    sheet,
  ]);
}

function useSpreadsheetOnReload(args: {
  loadFile: (path: string) => Promise<boolean>;
  selectedPath: string | null;
}): () => void {
  const { loadFile, selectedPath } = args;
  return useCallback(() => {
    if (!selectedPath || !isSpreadsheetPath(selectedPath)) {
      return;
    }
    void loadFile(selectedPath);
  }, [loadFile, selectedPath]);
}

function useSpreadsheetDisplayedRowIndexes(args: {
  filterQuery: string;
  sheet: SpreadsheetDraft | null;
  sortState: SpreadsheetSortState | null;
}): {
  displayedRowCount: number;
  displayedRowIndexes: number[];
} {
  const { filterQuery, sheet, sortState } = args;
  const baseRowIndexes = useMemo(() => {
    if (!sheet) {
      return [];
    }
    return Array.from({ length: sheet.rowCount }, (_value, index) => index);
  }, [sheet?.rowCount]);
  const normalizedFilterQuery = filterQuery.trim().toLowerCase();
  const hasFilterOrSort =
    normalizedFilterQuery.length > 0 || sortState !== null;
  const filteredSortedRowIndexes = useMemo(() => {
    if (!sheet || !hasFilterOrSort) {
      return baseRowIndexes;
    }
    return getFilteredSortedSpreadsheetRowIndexes({
      baseIndexes: baseRowIndexes,
      rows: sheet.rows,
      columnCount: sheet.columnCount,
      normalizedFilter: normalizedFilterQuery,
      sortState,
    });
  }, [
    baseRowIndexes,
    hasFilterOrSort,
    normalizedFilterQuery,
    sheet?.columnCount,
    sheet?.rows,
    sortState,
  ]);
  const displayedRowIndexes = hasFilterOrSort
    ? filteredSortedRowIndexes
    : baseRowIndexes;
  return {
    displayedRowCount: displayedRowIndexes.length,
    displayedRowIndexes,
  };
}

function useSpreadsheetSortHandlers(args: {
  setFilterQuery: (value: string) => void;
  setSortState: Dispatch<SetStateAction<SpreadsheetSortState | null>>;
}): {
  applySortColumnValue: (value: string) => void;
  clearFilterAndSort: () => void;
  onToggleSort: (columnIndex: number) => void;
  toggleSortDirection: () => void;
} {
  const { setFilterQuery, setSortState } = args;
  const onToggleSort = useCallback(
    (columnIndex: number) => {
      setSortState((prev) => {
        if (!prev || prev.columnIndex !== columnIndex) {
          return { columnIndex, direction: "asc" };
        }
        if (prev.direction === "asc") {
          return { columnIndex, direction: "desc" };
        }
        return null;
      });
    },
    [setSortState],
  );
  const applySortColumnValue = useCallback(
    (value: string) => {
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
    },
    [setSortState],
  );
  const toggleSortDirection = useCallback(() => {
    setSortState((prev) =>
      prev
        ? {
            ...prev,
            direction: prev.direction === "asc" ? "desc" : "asc",
          }
        : prev,
    );
  }, [setSortState]);
  const clearFilterAndSort = useCallback(() => {
    setFilterQuery("");
    setSortState(null);
  }, [setFilterQuery, setSortState]);
  return {
    applySortColumnValue,
    clearFilterAndSort,
    onToggleSort,
    toggleSortDirection,
  };
}

function useSpreadsheetGlideColumns(args: {
  columnWidths: Record<number, number>;
  densityMetrics: SpreadsheetDensityMetrics;
  densityMultiplier: number;
  sheet: SpreadsheetDraft | null;
  sortState: SpreadsheetSortState | null;
}): readonly GridColumn[] {
  const { columnWidths, densityMetrics, densityMultiplier, sheet, sortState } =
    args;
  return useMemo<readonly GridColumn[]>(() => {
    if (!sheet) {
      return [];
    }
    return Array.from({ length: sheet.columnCount }, (_, columnIndex) => ({
      id: `col-${columnIndex}`,
      title: `${getSpreadsheetColumnLabel(columnIndex)}${resolveSpreadsheetHeaderSortSuffix(sortState, columnIndex)}`,
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
}

function useSpreadsheetGlideCellContent(args: {
  displayedRowCount: number;
  displayedRowIndexes: number[];
  effectiveReadOnly: boolean;
  sheet: SpreadsheetDraft | null;
}) {
  const { displayedRowCount, displayedRowIndexes, effectiveReadOnly, sheet } =
    args;
  return useCallback(
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
        readonly: effectiveReadOnly,
      };
    },
    [displayedRowCount, displayedRowIndexes, effectiveReadOnly, sheet],
  );
}

function useSpreadsheetSelectedFileState(
  selectedFile: SpreadsheetSelectedFile | null,
): {
  selectedName: string;
  selectedPath: string | null;
  selectedPathRef: MutableRefObject<string | null>;
} {
  const selectedPath = selectedFile ? selectedFile.fullPath : null;
  return {
    selectedName: selectedFile ? selectedFile.name : "",
    selectedPath,
    selectedPathRef: useSelectedPathRef(selectedPath),
  };
}

function useSpreadsheetGridLayout(args: {
  density: SpreadsheetGridDensity;
  densityMetrics: SpreadsheetDensityMetrics;
  densityMultiplier: number;
  effectiveReadOnly: boolean;
  sheet: SpreadsheetDraft | null;
  showRowNumbers: boolean;
  viewportSize: {
    width: number;
    height: number;
  };
}): {
  glideRenderHeight: number;
  glideRenderWidth: number;
  gridTemplateColumns: string;
  isGridEditable: boolean;
  listWidth: number;
  sheetWidth: number;
} {
  const {
    density,
    densityMetrics,
    densityMultiplier,
    effectiveReadOnly,
    sheet,
    showRowNumbers,
    viewportSize,
  } = args;
  const columnCount = sheet ? sheet.columnCount : 0;
  const gridTemplateColumns = useMemo(
    () =>
      getSpreadsheetGridTemplateColumns(columnCount, showRowNumbers, density),
    [columnCount, density, showRowNumbers],
  );
  const sheetWidth = useMemo(
    () => getSpreadsheetGridWidth(columnCount, showRowNumbers, density),
    [columnCount, density, showRowNumbers],
  );
  const listWidth = Math.max(viewportSize.width, sheetWidth);
  const glideViewportWidth = Math.max(1, viewportSize.width);
  const glideViewportHeight = Math.max(
    1,
    viewportSize.height - densityMetrics.headerHeight,
  );
  return {
    glideRenderHeight: Math.max(1, glideViewportHeight * densityMultiplier),
    glideRenderWidth: Math.max(1, glideViewportWidth * densityMultiplier),
    gridTemplateColumns,
    isGridEditable: !effectiveReadOnly,
    listWidth,
    sheetWidth,
  };
}

function resolveSpreadsheetEmptyStateMessage(
  selectedPath: string | null,
): string | null {
  if (!selectedPath) {
    return "Drop a CSV/XLSX file from your OS or File Browser to preview and edit.";
  }
  if (!isSpreadsheetPath(selectedPath)) {
    return "Spreadsheet editing is available for `.csv`, `.tsv`, `.xls`, and `.xlsx` files.";
  }
  return null;
}

function SpreadsheetFooterMaybe(props: {
  displayedRowCount: number;
  selectionSummary: string;
  sheet: SpreadsheetDraft | null;
}) {
  const { displayedRowCount, selectionSummary, sheet } = props;
  if (!sheet) {
    return null;
  }
  return (
    <SpreadsheetFooter
      displayedRowCount={displayedRowCount}
      selectionSummary={selectionSummary}
      sheet={sheet}
    />
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
  density?: SpreadsheetGridDensity;
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
  const listRef = useListRef();
  const { viewportRef, viewportSize } = useSpreadsheetViewportSize();
  const loadRequestIdRef = useRef(0);
  const editVersionRef = useRef(0);
  const { selectedName, selectedPath, selectedPathRef } =
    useSpreadsheetSelectedFileState(selectedFile);
  const densityMetrics = useMemo(
    () => getSpreadsheetDensityMetrics(density),
    [density],
  );
  const densityMultiplier = useMemo(
    () => getSpreadsheetGlideDensityMultiplier(flowZoom),
    [flowZoom],
  );
  const glideTheme = useMemo<Partial<Theme>>(
    () => getSpreadsheetGlideTheme({ darkMode, densityMultiplier }),
    [darkMode, densityMultiplier],
  );
  const loadFile = useSpreadsheetLoadFile({
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
  });
  useSpreadsheetSelectedPathEffect({
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
  });
  useSpreadsheetAutoReloadEffect({
    autoReloadOnExternalChange,
    isDirty,
    isLoading,
    isSaving,
    loadFile,
    selectedPath,
    setHasExternalDiskChange,
    setStatusText,
    sheet,
  });
  const { displayedRowCount, displayedRowIndexes } =
    useSpreadsheetDisplayedRowIndexes({
      filterQuery,
      sheet,
      sortState,
    });
  const effectiveReadOnly = readOnly || isSaving;
  const onChangeCell = useSpreadsheetOnChangeCell({
    displayedRowIndexes,
    editVersionRef,
    effectiveReadOnly,
    setIsDirty,
    setSheet,
    setStatusText,
  });
  const onGridSelectionChange = useCallback((selection: GridSelection) => {
    setGridSelection(selection);
    setSelectionSummary(formatSpreadsheetSelectionSummary(selection));
  }, []);
  const onCellsEdited = useSpreadsheetOnCellsEdited({
    displayedRowIndexes,
    editVersionRef,
    effectiveReadOnly,
    setIsDirty,
    setSheet,
    setStatusText,
  });
  const onDeleteSelection = useSpreadsheetOnDeleteSelection({
    displayedRowIndexes,
    editVersionRef,
    effectiveReadOnly,
    setIsDirty,
    setSheet,
    setStatusText,
  });
  const onAddRow = useSpreadsheetOnAddRow({
    editVersionRef,
    effectiveReadOnly,
    setIsDirty,
    setSheet,
    setStatusText,
  });
  const onAddColumn = useSpreadsheetOnAddColumn({
    editVersionRef,
    effectiveReadOnly,
    setIsDirty,
    setSheet,
    setStatusText,
  });
  const onSave = useSpreadsheetOnSave({
    editVersionRef,
    isSaving,
    readOnly,
    selectedPath,
    selectedPathRef,
    setErrorText,
    setHasExternalDiskChange,
    setIsDirty,
    setIsSaving,
    setSheet,
    setStatusText,
    sheet,
  });
  const onReload = useSpreadsheetOnReload({
    loadFile,
    selectedPath,
  });
  const {
    applySortColumnValue,
    clearFilterAndSort,
    onToggleSort,
    toggleSortDirection,
  } = useSpreadsheetSortHandlers({
    setFilterQuery,
    setSortState,
  });
  const {
    glideRenderHeight,
    glideRenderWidth,
    gridTemplateColumns,
    isGridEditable,
    listWidth,
  } = useSpreadsheetGridLayout({
    density,
    densityMetrics,
    densityMultiplier,
    effectiveReadOnly,
    sheet,
    showRowNumbers,
    viewportSize,
  });
  const glideColumns = useSpreadsheetGlideColumns({
    columnWidths,
    densityMetrics,
    densityMultiplier,
    sheet,
    sortState,
  });
  const getGlideCellContent = useSpreadsheetGlideCellContent({
    displayedRowCount,
    displayedRowIndexes,
    effectiveReadOnly,
    sheet,
  });
  const onGlideColumnResize = useCallback(
    (columnIndex: number, newSize: number) => {
      setColumnWidths((prev) => ({
        ...prev,
        [columnIndex]: Math.max(48, Math.round(newSize / densityMultiplier)),
      }));
    },
    [densityMultiplier],
  );
  const canMutate = canMutateSpreadsheet({
    isLoading,
    isSaving,
    readOnly,
    sheet,
  });
  const canReload = canReloadSpreadsheet({
    isLoading,
    isSaving,
    sheet,
  });
  const canSave = canSaveSpreadsheet({
    isDirty,
    isLoading,
    isSaving,
    readOnly,
    sheet,
  });
  const emptyStateMessage = resolveSpreadsheetEmptyStateMessage(selectedPath);
  if (emptyStateMessage) {
    return <SpreadsheetEmptyState message={emptyStateMessage} />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-setta-200 bg-white/70 dark:border-setta-800 dark:bg-setta-950/50">
      <SpreadsheetDesktopToolbar
        canMutate={canMutate}
        canReload={canReload}
        canSave={canSave}
        filterQuery={filterQuery}
        isSaving={isSaving}
        onAddColumn={onAddColumn}
        onAddRow={onAddRow}
        onApplySortColumnValue={applySortColumnValue}
        onClearFilterAndSort={clearFilterAndSort}
        onFilterQueryChange={setFilterQuery}
        onReload={onReload}
        onSave={onSave}
        onToggleSortDirection={toggleSortDirection}
        selectedName={selectedName}
        sheet={sheet}
        sortState={sortState}
      />
      <SpreadsheetStatusBanner
        errorText={errorText}
        hasExternalDiskChange={hasExternalDiskChange}
        isDirty={isDirty}
        readOnly={readOnly}
        statusText={statusText}
      />
      <SpreadsheetGridViewport
        densityMetrics={densityMetrics}
        densityMultiplier={densityMultiplier}
        displayedRowCount={displayedRowCount}
        displayedRowIndexes={displayedRowIndexes}
        effectiveReadOnly={effectiveReadOnly}
        getGlideCellContent={getGlideCellContent}
        glideColumns={glideColumns}
        glideRenderHeight={glideRenderHeight}
        glideRenderWidth={glideRenderWidth}
        glideTheme={glideTheme}
        gridMode={gridMode}
        gridSelection={gridSelection}
        gridTemplateColumns={gridTemplateColumns}
        isGridEditable={isGridEditable}
        isLoading={isLoading}
        listRef={listRef}
        listWidth={listWidth}
        onCellsEdited={onCellsEdited}
        onChangeCell={onChangeCell}
        onColumnResize={onGlideColumnResize}
        onDeleteSelection={onDeleteSelection}
        onGridSelectionChange={onGridSelectionChange}
        onToggleSort={onToggleSort}
        sheet={sheet}
        showRowNumbers={showRowNumbers}
        sortState={sortState}
        viewportHeight={viewportSize.height}
        viewportRef={viewportRef}
      />
      <SpreadsheetFooterMaybe
        displayedRowCount={displayedRowCount}
        selectionSummary={selectionSummary}
        sheet={sheet}
      />
    </div>
  );
}
