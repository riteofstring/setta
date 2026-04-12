import {
  DataEditor,
  GridCellKind,
  type EditableGridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Theme,
} from "@glideapps/glide-data-grid";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  downloadBinary,
  getFileBrowserFileContent,
  getFileBrowserFileStat,
  writeFileBrowserFileContent,
  type FilebrowserFileContentResponse,
  type FilebrowserFileStatResponse,
  type FilebrowserWriteFileContentResponse,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiColumns,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSettings,
  FiX,
} from "react-icons/fi";
import { List, useListRef } from "react-window";
import { useLocalStorage } from "state/definitions";
import { uploadBinaryPayload } from "utils/binaryUpload";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import type { SpreadsheetGridDensity } from "utils/generatedTypes";
import {
  getSpreadsheetColumnLabel,
  isSpreadsheetPath,
  parseSpreadsheetBytes,
  serializeSpreadsheetBytes,
} from "utils/spreadsheet";
import type {
  SpreadsheetCellEdit,
  SpreadsheetDensityMetrics,
  SpreadsheetSortState,
} from "./fileBrowserSpreadsheetEditorCore";
import {
  SPREADSHEET_FILTER_INPUT_CLASS_NAME,
  SpreadsheetRow,
  applySpreadsheetCellUpdates,
  canSaveSpreadsheetDraft,
  getFilteredSortedSpreadsheetRowIndexes,
  getSpreadsheetDensityMetrics,
  getSpreadsheetGlideDensityMultiplier,
  getSpreadsheetGlideTheme,
  getSpreadsheetGridTemplateColumns,
  getSpreadsheetGridWidth,
  isSpreadsheetLoadRequestStale,
  shouldAnnounceSpreadsheetAutoReload,
  shouldClearSpreadsheetDirtyAfterSave,
  shouldIgnoreSpreadsheetSaveResult,
} from "./fileBrowserSpreadsheetEditorCore";
const SPREADSHEET_AUTO_RELOAD_INTERVAL_MS = 2000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
type FileBrowserFileContentRouteResponse =
  ResponseDataAndStatus<FilebrowserFileContentResponse>;
type FileBrowserFileStatRouteResponse =
  ResponseDataAndStatus<FilebrowserFileStatResponse>;
type WriteFileBrowserFileContentRouteResponse =
  ResponseDataAndStatus<FilebrowserWriteFileContentResponse>;
type BinaryDownloadRouteResponse = ResponseDataAndStatus<Blob | File>;
type SpreadsheetDraft = {
  path: string;
  sheetName: string;
  rows: string[][];
  rowCount: number;
  columnCount: number;
  mtimeNs: number;
  sourceWorkbookBytes: Uint8Array | null;
};
type SpreadsheetLoadOutcome =
  | {
      status: "error";
      message: string;
    }
  | {
      status: "success";
      draft: SpreadsheetDraft;
    };
type SpreadsheetSaveOutcome =
  | {
      status: "error";
      message: string;
    }
  | {
      status: "stale";
    }
  | {
      status: "success";
      mtimeNs: number;
    };
type SpreadsheetSelectedFile = {
  name: string;
  fullPath: string;
};
type SpreadsheetGridMode = "dom" | "glide";
async function loadSpreadsheetDraft(
  path: string,
): Promise<SpreadsheetLoadOutcome> {
  const response = (await callOpenAPI(
    getFileBrowserFileContent({
      body: {
        path,
        maxBytes: MAX_FILE_BYTES,
      },
    } as Parameters<typeof getFileBrowserFileContent>[0]),
  )) as FileBrowserFileContentRouteResponse;
  if (!res200(response)) {
    return {
      status: "error",
      message:
        getErrorDetail(response.data) ?? "Failed to load spreadsheet file.",
    };
  }
  const binaryResponse = (await callOpenAPI(
    downloadBinary({
      path: {
        contentId: response.data.contentId,
      },
    } as Parameters<typeof downloadBinary>[0]),
  )) as BinaryDownloadRouteResponse;
  if (!res200(binaryResponse) || !binaryResponse.data) {
    return {
      status: "error",
      message:
        getErrorDetail(binaryResponse.data) ??
        "Failed to load spreadsheet file payload.",
    };
  }
  const parsed = await parseSpreadsheetBytes(
    path,
    new Uint8Array(await binaryResponse.data.arrayBuffer()),
  );
  return {
    status: "success",
    draft: {
      path,
      sheetName: parsed.sheetName,
      rows: parsed.rows,
      rowCount: parsed.rowCount,
      columnCount: parsed.columnCount,
      mtimeNs: response.data.mtimeNs,
      sourceWorkbookBytes: parsed.sourceWorkbookBytes,
    },
  };
}
function resetSpreadsheetEditorView(args: {
  editVersionRef: MutableRefObject<number>;
  setColumnWidths: (value: Record<number, number>) => void;
  setErrorText: (value: string | null) => void;
  setFilterQuery: (value: string) => void;
  setGridSelection: (value: GridSelection | undefined) => void;
  setHasExternalDiskChange: (value: boolean) => void;
  setIsDirty: (value: boolean) => void;
  setSelectionSummary: (value: string) => void;
  setSortState: (value: SpreadsheetSortState | null) => void;
  setStatusText: (value: string | null) => void;
}): void {
  const {
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
  } = args;
  editVersionRef.current = 0;
  setIsDirty(false);
  setHasExternalDiskChange(false);
  setFilterQuery("");
  setSortState(null);
  setColumnWidths({});
  setGridSelection(undefined);
  setSelectionSummary("No selection");
  setStatusText(null);
  setErrorText(null);
}
function applyLoadedSpreadsheetDraft(args: {
  draft: SpreadsheetDraft;
  editVersionRef: MutableRefObject<number>;
  listRef: ReturnType<typeof useListRef>;
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
    draft,
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
  } = args;
  setSheet(draft);
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
  listRef.current?.scrollToRow({ index: 0, align: "start" });
}
function resolveSpreadsheetSaveFileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? "spreadsheet.bin";
}
async function persistSpreadsheetSave(args: {
  expectedMtimeNs: number;
  isSaveResultStale: () => boolean;
  sheet: SpreadsheetDraft;
}): Promise<SpreadsheetSaveOutcome> {
  const { expectedMtimeNs, isSaveResultStale, sheet } = args;
  const bytes = await serializeSpreadsheetBytes(
    sheet.path,
    sheet.sheetName,
    sheet.rows,
    sheet.sourceWorkbookBytes,
  );
  const uploadResult = await uploadBinaryPayload({
    bytes,
    fileName: resolveSpreadsheetSaveFileName(sheet.path),
    mimeType: null,
  });
  if (uploadResult.status === "failed") {
    return {
      status: "error",
      message: uploadResult.error,
    };
  }
  if (isSaveResultStale()) {
    return { status: "stale" };
  }
  const response = (await callOpenAPI(
    writeFileBrowserFileContent({
      body: {
        path: sheet.path,
        contentId: uploadResult.contentId,
        expectedMtimeNs,
      },
    } as Parameters<typeof writeFileBrowserFileContent>[0]),
  )) as WriteFileBrowserFileContentRouteResponse;
  if (isSaveResultStale()) {
    return { status: "stale" };
  }
  if (!res200(response)) {
    return {
      status: "error",
      message:
        getErrorDetail(response.data) ?? "Failed to save spreadsheet file.",
    };
  }
  return {
    status: "success",
    mtimeNs: response.data.mtimeNs,
  };
}
function applySuccessfulSpreadsheetSave(args: {
  mtimeNs: number;
  path: string;
  saveStartEditVersion: number;
  currentEditVersion: number;
  setHasExternalDiskChange: (value: boolean) => void;
  setIsDirty: (value: boolean) => void;
  setSheet: Dispatch<SetStateAction<SpreadsheetDraft | null>>;
  setStatusText: (value: string | null) => void;
}): void {
  const {
    currentEditVersion,
    mtimeNs,
    path,
    saveStartEditVersion,
    setHasExternalDiskChange,
    setIsDirty,
    setSheet,
    setStatusText,
  } = args;
  setSheet((prev) => {
    if (!prev || prev.path !== path) {
      return prev;
    }
    return {
      ...prev,
      mtimeNs,
    };
  });
  setStatusText("Saved.");
  if (
    shouldClearSpreadsheetDirtyAfterSave({
      saveStartEditVersion,
      currentEditVersion,
    })
  ) {
    setIsDirty(false);
  }
  setHasExternalDiskChange(false);
}
function getSpreadsheetCellAddress(
  columnIndex: number,
  rowIndex: number,
): string {
  return `${getSpreadsheetColumnLabel(Math.max(0, columnIndex))}${Math.max(1, rowIndex + 1)}`;
}
type SpreadsheetSelectionBounds = {
  endColumn: number;
  endRow: number;
  extraRanges: number;
  startColumn: number;
  startRow: number;
};
function resolveSpreadsheetSelectionBounds(
  selection: GridSelection | undefined,
): SpreadsheetSelectionBounds | null {
  const currentRange = selection?.current?.range;
  if (!currentRange) {
    return null;
  }
  const startColumn = Math.max(0, currentRange.x);
  const startRow = Math.max(0, currentRange.y);
  return {
    startColumn,
    startRow,
    endColumn: Math.max(
      startColumn,
      currentRange.x + Math.max(1, currentRange.width) - 1,
    ),
    endRow: Math.max(
      startRow,
      currentRange.y + Math.max(1, currentRange.height) - 1,
    ),
    extraRanges: selection?.current?.rangeStack?.length ?? 0,
  };
}
function formatSpreadsheetSelectionBaseSummary(
  bounds: SpreadsheetSelectionBounds,
): string {
  const startAddress = getSpreadsheetCellAddress(
    bounds.startColumn,
    bounds.startRow,
  );
  const endAddress = getSpreadsheetCellAddress(bounds.endColumn, bounds.endRow);
  return startAddress === endAddress
    ? `Selected ${startAddress}`
    : `Selected ${startAddress}:${endAddress}`;
}
function formatSpreadsheetSelectionSummary(
  selection: GridSelection | undefined,
): string {
  const bounds = resolveSpreadsheetSelectionBounds(selection);
  if (!bounds) {
    return "No selection";
  }
  const baseSummary = formatSpreadsheetSelectionBaseSummary(bounds);
  if (bounds.extraRanges <= 0) {
    return baseSummary;
  }
  return `${baseSummary} (+${bounds.extraRanges} range${bounds.extraRanges === 1 ? "" : "s"})`;
}
function resolveSpreadsheetHeaderSortSuffix(
  sortState: SpreadsheetSortState | null,
  columnIndex: number,
): string {
  if (!sortState || sortState.columnIndex !== columnIndex) {
    return "";
  }
  return sortState.direction === "asc" ? " ↑" : " ↓";
}
function resolveSpreadsheetSortDirectionLabel(
  sortState: SpreadsheetSortState | null,
): string {
  return sortState?.direction === "desc" ? "Desc" : "Asc";
}
function resolveSpreadsheetRowCountSummary(args: {
  displayedRowCount: number;
  sheet: SpreadsheetDraft;
}): string {
  const { displayedRowCount, sheet } = args;
  return displayedRowCount === sheet.rowCount
    ? `${sheet.rowCount} rows · ${sheet.columnCount} columns`
    : `${displayedRowCount} shown of ${sheet.rowCount} rows · ${sheet.columnCount} columns`;
}
function canMutateSpreadsheet(args: {
  isLoading: boolean;
  isSaving: boolean;
  readOnly: boolean;
  sheet: SpreadsheetDraft | null;
}): boolean {
  const { isLoading, isSaving, readOnly, sheet } = args;
  return !!sheet && !isLoading && !isSaving && !readOnly;
}
function canReloadSpreadsheet(args: {
  isLoading: boolean;
  isSaving: boolean;
  sheet: SpreadsheetDraft | null;
}): boolean {
  const { isLoading, isSaving, sheet } = args;
  return !!sheet && !isLoading && !isSaving;
}
function canSaveSpreadsheet(args: {
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  readOnly: boolean;
  sheet: SpreadsheetDraft | null;
}): boolean {
  const { isDirty, isLoading, isSaving, readOnly, sheet } = args;
  return !!sheet && !isLoading && !isSaving && !readOnly && isDirty;
}
type SpreadsheetStatusMessage = {
  className: string;
  text: string;
};
function resolveSpreadsheetStatusMessages(
  args: SpreadsheetStatusBannerProps,
): SpreadsheetStatusMessage[] {
  const { errorText, hasExternalDiskChange, isDirty, readOnly, statusText } =
    args;
  const messages: SpreadsheetStatusMessage[] = [];
  if (readOnly) {
    messages.push({
      className: "mr-2 text-setta-500 dark:text-setta-400",
      text: "Read-only.",
    });
  }
  if (isDirty) {
    messages.push({
      className: "mr-2 text-amber-600 dark:text-amber-300",
      text: "Unsaved edits.",
    });
  }
  if (hasExternalDiskChange) {
    messages.push({
      className: "mr-2 text-amber-600 dark:text-amber-300",
      text: "File changed on disk.",
    });
  }
  if (statusText) {
    messages.push({
      className: "text-emerald-600",
      text: statusText,
    });
  }
  if (errorText) {
    messages.push({
      className: "text-red-500",
      text: errorText,
    });
  }
  return messages;
}
type SpreadsheetEmptyStateProps = {
  message: string;
};
function SpreadsheetEmptyState({ message }: SpreadsheetEmptyStateProps) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-setta-300 bg-white/60 px-4 text-center text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-950/40 dark:text-setta-400">
      {message}
    </div>
  );
}
type SpreadsheetDesktopToolbarProps = {
  canMutate: boolean;
  canReload: boolean;
  canSave: boolean;
  filterQuery: string;
  isSaving: boolean;
  onAddColumn: () => void;
  onAddRow: () => void;
  onApplySortColumnValue: (value: string) => void;
  onClearFilterAndSort: () => void;
  onFilterQueryChange: (value: string) => void;
  onReload: () => void;
  onSave: () => void;
  onToggleSortDirection: () => void;
  selectedName: string;
  sheet: SpreadsheetDraft | null;
  sortState: SpreadsheetSortState | null;
};
function SpreadsheetDesktopToolbar({
  canMutate,
  canReload,
  canSave,
  filterQuery,
  isSaving,
  onAddColumn,
  onAddRow,
  onApplySortColumnValue,
  onClearFilterAndSort,
  onFilterQueryChange,
  onReload,
  onSave,
  onToggleSortDirection,
  selectedName,
  sheet,
  sortState,
}: SpreadsheetDesktopToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-setta-200 px-3 py-2 @container/spreadsheet-toolbar dark:border-setta-800">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-setta-700 dark:text-setta-200">
          {selectedName}
        </p>
        {sheet ? (
          <div className="hidden min-w-0 flex-1 items-center gap-2 @[480px]/spreadsheet-toolbar:flex">
            <search
              className={`${NO_PAN_CLASS_NAME} nodrag relative flex min-w-0 flex-1 items-center`}
            >
              <i className="gg-sort-az absolute left-1.5 text-setta-300 dark:text-setta-600" />
              <input
                className={SPREADSHEET_FILTER_INPUT_CLASS_NAME}
                data-testid="spreadsheet-filter-input"
                onChange={(event) => onFilterQueryChange(event.target.value)}
                placeholder="Filter rows"
                value={filterQuery}
              />
            </search>
            <label className="shrink-0 text-[11px] text-setta-500 dark:text-setta-400">
              Sort
              <select
                className="ml-1 rounded border border-setta-300 bg-white px-1.5 py-1 text-[11px] text-setta-700 outline-none focus-visible:border-blue-400 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                data-testid="spreadsheet-sort-column"
                onChange={(event) => onApplySortColumnValue(event.target.value)}
                value={sortState ? String(sortState.columnIndex) : ""}
              >
                <option value="">None</option>
                {Array.from({ length: sheet.columnCount }, (_value, index) => (
                  <option key={`sort-${index}`} value={index}>
                    {getSpreadsheetColumnLabel(index)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="shrink-0 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              data-testid="spreadsheet-sort-direction"
              disabled={!sortState}
              onClick={onToggleSortDirection}
              type="button"
            >
              {resolveSpreadsheetSortDirectionLabel(sortState)}
            </button>
            {filterQuery.length > 0 || sortState ? (
              <button
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                data-testid="spreadsheet-clear-view"
                onClick={onClearFilterAndSort}
                type="button"
              >
                <FiX size={12} />
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="hidden items-center gap-1 @[360px]/spreadsheet-toolbar:flex">
        <button
          className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          data-testid="spreadsheet-add-column"
          disabled={!canMutate}
          onClick={onAddColumn}
          type="button"
        >
          <FiColumns size={12} />
          <span className="hidden @[560px]/spreadsheet-toolbar:inline">
            Column
          </span>
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          data-testid="spreadsheet-add-row"
          disabled={!canMutate}
          onClick={onAddRow}
          type="button"
        >
          <FiPlus size={12} />
          <span className="hidden @[560px]/spreadsheet-toolbar:inline">
            Row
          </span>
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          data-testid="spreadsheet-reload"
          disabled={!canReload}
          onClick={onReload}
          type="button"
        >
          <FiRefreshCw size={12} />
          <span className="hidden @[560px]/spreadsheet-toolbar:inline">
            Reload
          </span>
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
          data-testid="spreadsheet-save"
          disabled={!canSave}
          onClick={onSave}
          type="button"
        >
          <FiSave size={12} />
          <span className="hidden @[560px]/spreadsheet-toolbar:inline">
            {isSaving ? "Saving…" : "Save"}
          </span>
        </button>
      </div>
      <SpreadsheetMobileToolbarMenu
        canMutate={canMutate}
        canReload={canReload}
        canSave={canSave}
        filterQuery={filterQuery}
        isSaving={isSaving}
        onAddColumn={onAddColumn}
        onAddRow={onAddRow}
        onApplySortColumnValue={onApplySortColumnValue}
        onClearFilterAndSort={onClearFilterAndSort}
        onFilterQueryChange={onFilterQueryChange}
        onReload={onReload}
        onSave={onSave}
        onToggleSortDirection={onToggleSortDirection}
        sheet={sheet}
        sortState={sortState}
      />
    </div>
  );
}
type SpreadsheetMobileToolbarMenuProps = Omit<
  SpreadsheetDesktopToolbarProps,
  "selectedName"
>;
function SpreadsheetMobileToolbarMenu({
  canMutate,
  canReload,
  canSave,
  filterQuery,
  isSaving,
  onAddColumn,
  onAddRow,
  onApplySortColumnValue,
  onClearFilterAndSort,
  onFilterQueryChange,
  onReload,
  onSave,
  onToggleSortDirection,
  sheet,
  sortState,
}: SpreadsheetMobileToolbarMenuProps) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label="Spreadsheet settings"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-setta-300 text-setta-600 transition-colors hover:bg-setta-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 @[480px]/spreadsheet-toolbar:hidden dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
        type="button"
      >
        <FiSettings size={12} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-30 min-w-[220px] rounded-md border border-setta-200 bg-white p-2 shadow-xl dark:border-setta-700 dark:bg-setta-900"
          sideOffset={5}
        >
          {sheet ? (
            <div className="flex flex-col gap-2">
              <search
                className={`${NO_PAN_CLASS_NAME} nodrag relative flex min-w-0 items-center`}
              >
                <i className="gg-sort-az absolute left-1.5 text-setta-300 dark:text-setta-600" />
                <input
                  className={SPREADSHEET_FILTER_INPUT_CLASS_NAME}
                  onChange={(event) => onFilterQueryChange(event.target.value)}
                  placeholder="Filter rows"
                  value={filterQuery}
                />
              </search>
              <div className="flex items-center gap-2">
                <label className="shrink-0 text-[11px] text-setta-500 dark:text-setta-400">
                  Sort
                </label>
                <select
                  className="min-w-0 flex-1 rounded border border-setta-300 bg-white px-1.5 py-1 text-[11px] text-setta-700 outline-none focus-visible:border-blue-400 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                  onChange={(event) =>
                    onApplySortColumnValue(event.target.value)
                  }
                  value={sortState ? String(sortState.columnIndex) : ""}
                >
                  <option value="">None</option>
                  {Array.from(
                    { length: sheet.columnCount },
                    (_value, index) => (
                      <option key={`menu-sort-${index}`} value={index}>
                        {getSpreadsheetColumnLabel(index)}
                      </option>
                    ),
                  )}
                </select>
                <button
                  className="rounded border border-setta-300 px-2 py-1 text-[11px] text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                  disabled={!sortState}
                  onClick={onToggleSortDirection}
                  type="button"
                >
                  {resolveSpreadsheetSortDirectionLabel(sortState)}
                </button>
              </div>
              {filterQuery.length > 0 || sortState ? (
                <button
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                  onClick={onClearFilterAndSort}
                  type="button"
                >
                  <FiX size={12} />
                  Clear filters
                </button>
              ) : null}
              <DropdownMenu.Separator className="my-1 h-px bg-setta-200 dark:bg-setta-700" />
              <button
                className="inline-flex items-center justify-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                disabled={!canMutate}
                onClick={onAddColumn}
                type="button"
              >
                <FiColumns size={12} />
                Add Column
              </button>
              <button
                className="inline-flex items-center justify-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                disabled={!canMutate}
                onClick={onAddRow}
                type="button"
              >
                <FiPlus size={12} />
                Add Row
              </button>
              <button
                className="inline-flex items-center justify-center gap-1 rounded-md border border-setta-300 px-2 py-1 text-[11px] text-setta-600 hover:bg-setta-100 disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                disabled={!canReload}
                onClick={onReload}
                type="button"
              >
                <FiRefreshCw size={12} />
                Reload
              </button>
              <button
                className="inline-flex items-center justify-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
                disabled={!canSave}
                onClick={onSave}
                type="button"
              >
                <FiSave size={12} />
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
type SpreadsheetStatusBannerProps = {
  errorText: string | null;
  hasExternalDiskChange: boolean;
  isDirty: boolean;
  readOnly: boolean;
  statusText: string | null;
};
function SpreadsheetStatusBanner({
  errorText,
  hasExternalDiskChange,
  isDirty,
  readOnly,
  statusText,
}: SpreadsheetStatusBannerProps) {
  const messages = resolveSpreadsheetStatusMessages({
    errorText,
    hasExternalDiskChange,
    isDirty,
    readOnly,
    statusText,
  });
  if (messages.length === 0) {
    return null;
  }
  return (
    <div className="border-b border-setta-200 px-3 py-1 text-[11px] dark:border-setta-800">
      {messages.map((message) => (
        <span
          key={`${message.className}:${message.text}`}
          className={message.className}
        >
          {message.text}
        </span>
      ))}
    </div>
  );
}
type SpreadsheetGlideGridViewProps = {
  densityMetrics: SpreadsheetDensityMetrics;
  densityMultiplier: number;
  displayedRowCount: number;
  getGlideCellContent: (item: Item) =>
    | EditableGridCell
    | {
        kind: GridCellKind.Loading;
        allowOverlay: false;
      };
  glideRenderHeight: number;
  glideRenderWidth: number;
  glideTheme: Partial<Theme>;
  gridSelection: GridSelection | undefined;
  isGridEditable: boolean;
  onCellsEdited: (
    newValues: readonly {
      location: Item;
      value: EditableGridCell;
    }[],
  ) => boolean;
  onColumnResize: (columnIndex: number, newSize: number) => void;
  onDeleteSelection: (selection: GridSelection) => boolean;
  onGridSelectionChange: (selection: GridSelection) => void;
  onToggleSort: (columnIndex: number) => void;
  showRowNumbers: boolean;
  glideColumns: readonly GridColumn[];
};
function SpreadsheetGlideGridView({
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
type SpreadsheetDomGridViewProps = {
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
function SpreadsheetDomGridView({
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
type SpreadsheetGridViewportProps = {
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
function SpreadsheetGridViewport({
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
type SpreadsheetFooterProps = {
  displayedRowCount: number;
  selectionSummary: string;
  sheet: SpreadsheetDraft;
};
function SpreadsheetFooter({
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
function useSelectedPathRef(
  selectedPath: string | null,
): MutableRefObject<string | null> {
  const selectedPathRef = useRef<string | null>(selectedPath);
  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);
  return selectedPathRef;
}
function useSpreadsheetViewportSize(): {
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
function useSpreadsheetLoadFile(args: {
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
function useSpreadsheetSelectedPathEffect(args: {
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
function useSpreadsheetAutoReloadEffect(args: {
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
function applySpreadsheetMutation(args: {
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
function resolveSpreadsheetEditedCells(args: {
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
function resolveSpreadsheetDeletionEdits(args: {
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
function useSpreadsheetOnChangeCell(args: {
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
function useSpreadsheetOnCellsEdited(args: {
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
